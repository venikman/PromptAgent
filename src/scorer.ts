import type { MetricResult } from "npm:@mastra/core@0.24.9";
import { createScorer } from "npm:@mastra/core@0.24.9/scores";
import { KeywordCoverageMetric } from "npm:@mastra/evals@0.14.4/nlp";
import { z } from "npm:zod@4.3.5";
import { env } from "./config.ts";
import type { Epic, StoryPack } from "./schema.ts";
import { storyPackSchema } from "./schema.ts";
import { makeJudgeModel } from "./models.ts";
import {
  PromptAgentFPFMetric,
  type Bridge,
  type PromptAgentJudgeInput,
  isPromptAgentJudgeInfo,
} from "./judge/promptagent-fpf-judge.ts";

type ScorerInput = Epic;
type ScorerOutput = {
  storyPack: StoryPack | null;
  rawText: string;
  instructions?: string;
  trace?: PromptAgentJudgeInput["trace"];
  gammaTime?: string;
  workflowGraph?: unknown;
  bridges?: Bridge[];
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

const DEGRADE_GATE_PENALTY = 0.85;
const HEURISTIC_SCORE_WEIGHT = 0.6;
const FPF_SCORE_WEIGHT = 0.4;
const HEURISTIC_WEIGHTS = {
  coverage: 0.25,
  invest: 0.25,
  acceptanceCriteria: 0.25,
  duplication: 0.15, // Intentional reweight to emphasize deduplication vs prior scoring
  count: 0.1,
};

export function createStoryDecompositionScorer() {
  const judgeModel = makeJudgeModel();
  const keywordMetric = new KeywordCoverageMetric();
  const fpfJudge = new PromptAgentFPFMetric(judgeModel);

  return createScorer<ScorerInput, ScorerOutput>({
    name: "EpicToUserStoriesQuality",
    description: "Schema gate + keyword coverage + INVEST/testability judge",
    judge: {
      model: judgeModel,
      instructions:
        "You are a strict product coach. Score user stories consistently. Penalize vague acceptance criteria and oversized stories.",
    },
  })
    .preprocess(async ({ run }) => {
      const input = run.input!;
      const epicText = `${input.title}\n\n${input.description}`;
      const rawText = run.output.rawText ?? "";
      const instructions =
        run.output.instructions ??
        "Generate Azure DevOps user stories that satisfy the epic and the provided schema.";

      const parsed = storyPackSchema.safeParse(run.output.storyPack);
      const isValid = parsed.success;
      const storyCount = isValid ? parsed.data.userStories.length : 0;

      // Calculate keyword coverage
      const coverageResult = await keywordMetric.measure(epicText, rawText);

      let fpfJudgeResult: MetricResult | null = null;
      let fpfJudgeError: string | null = null;

      const judgeInput: PromptAgentJudgeInput = {
        query: epicText,
        instructions,
        response: rawText,
        trace: run.output.trace ?? undefined,
        workflowGraph: run.output.workflowGraph,
        bridges: run.output.bridges ?? [],
        gamma_time: run.output.gammaTime,
        tokenBudget: env.GEN_MAX_TOKENS,
        gateProfile: "Core",
      };

      try {
        fpfJudgeResult = await fpfJudge.measure(judgeInput);
      } catch (err) {
        fpfJudgeError = err instanceof Error ? err.message : String(err);
      }

      return {
        epicText,
        rawText,
        isValid,
        storyCount,
        coverageScore: coverageResult.score,
        fpfJudgeResult,
        fpfJudgeError,
      };
    })
    .analyze({
      description:
        "Judge INVEST, acceptance criteria testability, and duplication.",
      outputSchema: z.object({
        invest: z.number().min(0).max(1),
        acceptanceCriteria: z.number().min(0).max(1),
        duplication: z.number().min(0).max(1),
        notes: z.string(),
      }),
      createPrompt: ({ results }) => {
        const p = results.preprocessStepResult;
        return [
          "Evaluate this decomposition of an Epic into User Stories.",
          "",
          "Epic:",
          p.epicText,
          "",
          "Generated output (raw):",
          p.rawText,
          "",
          "Rubric (0..1):",
          "- invest: Independent, Negotiable, Valuable, Estimable, Small, Testable",
          "- acceptanceCriteria: objectively testable, no vague words like 'fast', 'user friendly' without thresholds",
          "- duplication: 1 means no duplication; 0 means heavy duplication / same story repeated",
          "",
          "Return ONLY JSON matching the schema.",
        ].join("\n");
      },
    })
    .generateScore(({ results }) => {
      const p = results.preprocessStepResult;
      if (!p.isValid) return 0;

      const a = results.analyzeStepResult;
      const fpfInfo = isPromptAgentJudgeInfo(p.fpfJudgeResult?.info)
        ? p.fpfJudgeResult!.info
        : undefined;
      const gateDecision = fpfInfo?.gateDecision;
      if (gateDecision === "block") return 0;

      // Story count scoring: 4-8 is optimal
      const countScore =
        p.storyCount >= 4 && p.storyCount <= 8
          ? 1
          : p.storyCount === 3 || p.storyCount === 9
            ? 0.7
            : 0.4;

      // Weighted composite score
      const heuristicScore =
        HEURISTIC_WEIGHTS.coverage * p.coverageScore +
        HEURISTIC_WEIGHTS.invest * a.invest +
        HEURISTIC_WEIGHTS.acceptanceCriteria * a.acceptanceCriteria +
        HEURISTIC_WEIGHTS.duplication * a.duplication +
        HEURISTIC_WEIGHTS.count * countScore;

      const fpfScore = typeof p.fpfJudgeResult?.score === "number" ? p.fpfJudgeResult.score : null;
      const gatePenalty = gateDecision === "degrade" ? DEGRADE_GATE_PENALTY : 1;

      const blendedScore =
        fpfScore === null
          ? heuristicScore // FPF judge failed: fall back to heuristics without downweighting
          : HEURISTIC_SCORE_WEIGHT * heuristicScore + FPF_SCORE_WEIGHT * fpfScore;

      const score = clamp01(blendedScore * gatePenalty);

      return score;
    })
    .generateReason(({ score, results }) => {
      const p = results.preprocessStepResult;
      if (!p.isValid) return `Score=${score}. Schema validation failed.`;

      const a = results.analyzeStepResult;
      const maybeFpfInfo = p.fpfJudgeResult?.info;
      const fpfInfo = isPromptAgentJudgeInfo(maybeFpfInfo) ? maybeFpfInfo : undefined;
      const gateDecision = fpfInfo?.gateDecision ?? "abstain";
      const fpfSubscores = fpfInfo?.subscores;
      return [
        `Score=${score.toFixed(3)}`,
        `coverage=${p.coverageScore.toFixed(3)}`,
        `invest=${a.invest.toFixed(3)}`,
        `criteria=${a.acceptanceCriteria.toFixed(3)}`,
        `dup=${a.duplication.toFixed(3)}`,
        `stories=${p.storyCount}`,
        `gate=${gateDecision}`,
        fpfSubscores
          ? `fpf={corr:${fpfSubscores.correctness?.toFixed(3) ?? "?"},comp:${fpfSubscores.completeness?.toFixed(3) ?? "?"},proc:${fpfSubscores.processQuality?.toFixed(3) ?? "?"},safe:${fpfSubscores.safety?.toFixed(3) ?? "?"}}`
          : "fpf=missing",
        fpfInfo && typeof fpfInfo.rEff === "number" ? `rEff=${fpfInfo.rEff.toFixed(3)}` : undefined,
        p.fpfJudgeError ? `fpfError=${p.fpfJudgeError}` : undefined,
        `notes=${a.notes}`,
      ]
        .filter(Boolean)
        .join(" | ");
    });
}
