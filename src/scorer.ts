import type { MetricResult } from "@mastra/core";
import { createScorer } from "@mastra/core/scores";
import { KeywordCoverageMetric } from "@mastra/evals/nlp";
import { z } from "zod";
import { env } from "./config.ts";
import type { Epic, StoryPack } from "./schema.ts";
import { storyPackSchema } from "./schema.ts";
import { makeJudgeModel } from "./models.ts";
import {
  PromptAgentFPFMetric,
  type Bridge,
  type PromptAgentJudgeInput,
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
        gamma_time: run.output.gammaTime ?? run.output.trace?.startedAt,
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
      const gateDecision = p.fpfJudgeResult?.info?.gateDecision;
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
        0.25 * p.coverageScore +
        0.25 * a.invest +
        0.25 * a.acceptanceCriteria +
        0.15 * a.duplication +
        0.1 * countScore;

      const fpfScore = p.fpfJudgeResult?.score ?? 0;
      const gatePenalty = gateDecision === "degrade" ? 0.85 : 1;

      const blendedScore = 0.6 * heuristicScore + 0.4 * fpfScore;

      const score = clamp01(blendedScore * gatePenalty);

      return clamp01(score);
    })
    .generateReason(({ score, results }) => {
      const p = results.preprocessStepResult;
      if (!p.isValid) return `Score=${score}. Schema validation failed.`;

      const a = results.analyzeStepResult;
      const gateDecision = p.fpfJudgeResult?.info?.gateDecision ?? "abstain";
      const fpfInfo = p.fpfJudgeResult?.info as
        | {
            gateDecision?: string;
            status?: string;
            rEff?: number;
            subscores?: {
              correctness?: number;
              completeness?: number;
              processQuality?: number;
              safety?: number;
            };
          }
        | undefined;
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
