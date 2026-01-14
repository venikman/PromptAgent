import type { MetricResult } from "@mastra/core";
import { createScorer } from "@mastra/core/scores";
import { KeywordCoverageMetric } from "@mastra/evals/nlp";
import { z } from "zod";
import { env } from "./config.ts";
import type { Epic, StoryPack } from "./schema.ts";
import { storyPackSchema } from "./schema.ts";
import { makeJudgeModel } from "./models.ts";
import {
  type Bridge,
  isPromptAgentJudgeInfo,
  PromptAgentFPFMetric,
  type PromptAgentJudgeInput,
} from "./judge/promptagent-fpf-judge.ts";
import {
  type ConfidenceInterval,
  interJudgeInterval,
  isPoLLMetricInfo,
  PoLLMetric,
  type PoLLMetricInfo,
} from "./fpf/index.ts";

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

  // PoLL: 3-judge panel with WLNK aggregation (FPF B.3 compliant)
  // Only instantiate if enabled to avoid unnecessary overhead
  const pollMetric = env.POLL_ENABLED ? new PoLLMetric() : null;

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
      const instructions = run.output.instructions ??
        "Generate Azure DevOps user stories that satisfy the epic and the provided schema.";

      const parsed = storyPackSchema.safeParse(run.output.storyPack);
      const isValid = parsed.success;
      const storyCount = isValid ? parsed.data.userStories.length : 0;

      // Calculate keyword coverage
      const coverageResult = await keywordMetric.measure(epicText, rawText);

      let fpfJudgeResult: MetricResult | null = null;
      let fpfJudgeError: string | null = null;
      let pollResult: MetricResult | null = null;
      let pollError: string | null = null;

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

      // Run evaluations in parallel when PoLL is enabled
      if (pollMetric) {
        // PoLL enabled: run both in parallel, use PoLL as primary
        const [fpfResult, pollRes] = await Promise.allSettled([
          fpfJudge.measure(judgeInput),
          pollMetric.measure({
            query: epicText,
            instructions,
            response: rawText,
          }),
        ]);

        if (fpfResult.status === "fulfilled") {
          fpfJudgeResult = fpfResult.value;
        } else {
          fpfJudgeError = fpfResult.reason?.message ?? String(fpfResult.reason);
        }

        if (pollRes.status === "fulfilled") {
          pollResult = pollRes.value;
        } else {
          pollError = pollRes.reason?.message ?? String(pollRes.reason);
        }
      } else {
        // PoLL disabled: use single FPF judge only
        try {
          fpfJudgeResult = await fpfJudge.measure(judgeInput);
        } catch (err) {
          fpfJudgeError = err instanceof Error ? err.message : String(err);
        }
      }

      // Compute confidence interval from PoLL judge scores if available
      let scoreConfidence: ConfidenceInterval | null = null;
      if (pollResult && isPoLLMetricInfo(pollResult.info)) {
        const pollInfo = pollResult.info as PoLLMetricInfo;
        if (pollInfo.judgeScores && pollInfo.judgeScores.length > 1) {
          scoreConfidence = interJudgeInterval(pollInfo.judgeScores, 0.95);
        }
      }

      return {
        epicText,
        rawText,
        isValid,
        storyCount,
        coverageScore: coverageResult.score,
        fpfJudgeResult,
        fpfJudgeError,
        pollResult,
        pollError,
        pollEnabled: !!pollMetric,
        scoreConfidence,
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

      // Determine gate decision from either PoLL or single-judge FPF
      const pollInfo = isPoLLMetricInfo(p.pollResult?.info)
        ? (p.pollResult!.info as PoLLMetricInfo)
        : undefined;
      const fpfInfo = isPromptAgentJudgeInfo(p.fpfJudgeResult?.info)
        ? p.fpfJudgeResult!.info
        : undefined;

      // PoLL takes precedence for gate decision when available
      const gateDecision = pollInfo?.gateDecision ?? fpfInfo?.gateDecision;
      if (gateDecision === "block") return 0;

      // Story count scoring: 4-8 is optimal
      const countScore = p.storyCount >= 4 && p.storyCount <= 8
        ? 1
        : p.storyCount === 3 || p.storyCount === 9
        ? 0.7
        : 0.4;

      // Weighted composite score
      const heuristicScore = HEURISTIC_WEIGHTS.coverage * p.coverageScore +
        HEURISTIC_WEIGHTS.invest * a.invest +
        HEURISTIC_WEIGHTS.acceptanceCriteria * a.acceptanceCriteria +
        HEURISTIC_WEIGHTS.duplication * a.duplication +
        HEURISTIC_WEIGHTS.count * countScore;

      // Use PoLL R_eff (WLNK-aggregated) when available, else single-judge FPF
      // PoLL's R_eff already incorporates the congruence penalty (Φ)
      const judgeScore = pollInfo?.rEff ??
        (typeof p.fpfJudgeResult?.score === "number"
          ? p.fpfJudgeResult.score
          : null);

      const gatePenalty = gateDecision === "degrade" ? DEGRADE_GATE_PENALTY : 1;

      const blendedScore = judgeScore === null
        ? heuristicScore // Judge failed: fall back to heuristics without downweighting
        : HEURISTIC_SCORE_WEIGHT * heuristicScore +
          FPF_SCORE_WEIGHT * judgeScore;

      const score = clamp01(blendedScore * gatePenalty);

      return score;
    })
    .generateReason(({ score, results }) => {
      const p = results.preprocessStepResult;
      if (!p.isValid) return `Score=${score}. Schema validation failed.`;

      const a = results.analyzeStepResult;

      // Extract PoLL info if available
      const pollInfo = isPoLLMetricInfo(p.pollResult?.info)
        ? (p.pollResult!.info as PoLLMetricInfo)
        : undefined;

      // Extract single-judge FPF info
      const maybeFpfInfo = p.fpfJudgeResult?.info;
      const fpfInfo = isPromptAgentJudgeInfo(maybeFpfInfo)
        ? maybeFpfInfo
        : undefined;

      const gateDecision = pollInfo?.gateDecision ?? fpfInfo?.gateDecision ??
        "abstain";
      const fpfSubscores = fpfInfo?.subscores;

      // Build reason parts
      const reasonParts = [
        `Score=${score.toFixed(3)}`,
        `coverage=${p.coverageScore.toFixed(3)}`,
        `invest=${a.invest.toFixed(3)}`,
        `criteria=${a.acceptanceCriteria.toFixed(3)}`,
        `dup=${a.duplication.toFixed(3)}`,
        `stories=${p.storyCount}`,
        `gate=${gateDecision}`,
      ];

      // Add PoLL-specific info when available (takes precedence)
      if (pollInfo) {
        reasonParts.push(
          `poll={judges:${pollInfo.numJudges},CL:${pollInfo.congruenceLevelName},delta:${
            pollInfo.maxInterJudgeDelta.toFixed(3)
          }}`,
          `rEff=${pollInfo.rEff.toFixed(3)}`,
          `rRaw=${pollInfo.rRaw.toFixed(3)}`,
        );

        // Add confidence interval if available
        if (p.scoreConfidence) {
          reasonParts.push(
            `CI95=[${p.scoreConfidence.lower.toFixed(3)},${
              p.scoreConfidence.upper.toFixed(3)
            }]`,
          );
        }
      } else if (fpfSubscores) {
        // Fallback to single-judge FPF info
        reasonParts.push(
          `fpf={corr:${fpfSubscores.correctness?.toFixed(3) ?? "?"},comp:${
            fpfSubscores.completeness?.toFixed(3) ?? "?"
          },proc:${fpfSubscores.processQuality?.toFixed(3) ?? "?"},safe:${
            fpfSubscores.safety?.toFixed(3) ?? "?"
          }}`,
        );
        if (fpfInfo && typeof fpfInfo.rEff === "number") {
          reasonParts.push(`rEff=${fpfInfo.rEff.toFixed(3)}`);
        }
      } else {
        reasonParts.push("judge=missing");
      }

      // Add errors if any
      if (p.pollError) reasonParts.push(`pollError=${p.pollError}`);
      if (p.fpfJudgeError) reasonParts.push(`fpfError=${p.fpfJudgeError}`);

      reasonParts.push(`notes=${a.notes}`);

      return reasonParts.filter(Boolean).join(" | ");
    });
}
