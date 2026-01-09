/**
 * PoLL Metric Adapter
 *
 * Wraps the PoLL evaluator to be compatible with Mastra's Metric interface.
 * This allows seamless integration with the existing scorer infrastructure.
 *
 * FPF Compliance:
 * - B.3:4.4 WLNK aggregation
 * - Scale discipline (ordinals not averaged)
 * - Full SCR audit trail
 */

import { Metric, type MetricResult } from "npm:@mastra/core@0.24.9";
import { env } from "../config.ts";
import { evaluateWithPoLL, type PoLLConfig } from "./poll.ts";
import {
  type JudgeConfig,
  type JudgeOutput,
  type PoLLResult,
  CongruenceLevel,
} from "./types.ts";

// ═══════════════════════════════════════════════════════════════
// INPUT SCHEMA (Compatible with PromptAgentJudgeInput)
// ═══════════════════════════════════════════════════════════════

export interface PoLLMetricInput {
  query: string;
  instructions: string;
  response: string;
  promptId?: string;
  runId?: string;
  // Optional: provide custom judges (defaults to 3-judge panel)
  judges?: JudgeConfig[];
}

// ═══════════════════════════════════════════════════════════════
// OUTPUT INFO (Extends PromptAgentJudgeInfo pattern)
// ═══════════════════════════════════════════════════════════════

export interface PoLLMetricInfo {
  // Gate decision (compatible with existing FPF judge)
  gateDecision: "pass" | "degrade" | "block";
  status: "satisfied" | "violated" | "inconclusive";

  // PoLL-specific fields
  numJudges: number;
  congruenceLevel: CongruenceLevel;
  congruenceLevelName: string;
  maxInterJudgeDelta: number;

  // FPF assurance tuple
  rRaw: number;
  rEff: number;
  fEff: number;
  clMin: number;
  phiApplied: number;

  // Per-judge breakdown
  judgeScores: number[];
  wlnkCutset: string[];

  // Improvement suggestions
  improvementPaths: {
    raiseF: string[];
    raiseG: string[];
    raiseR: string[];
    raiseCL: string[];
  };

  // Latency
  totalLatencyMs: number;

  // Method identifier
  scoringMethod: string;
}

// Type guard for PoLLMetricInfo
export function isPoLLMetricInfo(value: unknown): value is PoLLMetricInfo {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.numJudges === "number" &&
    typeof v.congruenceLevel === "number" &&
    typeof v.rEff === "number" &&
    v.scoringMethod === "PoLL-WLNK-FPF-B3"
  );
}

// ═══════════════════════════════════════════════════════════════
// CONGRUENCE LEVEL NAMES
// ═══════════════════════════════════════════════════════════════

const CL_NAMES: Record<CongruenceLevel, string> = {
  [CongruenceLevel.CL0_WEAK_GUESS]: "CL0 (Weak Guess)",
  [CongruenceLevel.CL1_PLAUSIBLE]: "CL1 (Plausible)",
  [CongruenceLevel.CL2_VALIDATED]: "CL2 (Validated)",
  [CongruenceLevel.CL3_VERIFIED]: "CL3 (Verified)",
};

// ═══════════════════════════════════════════════════════════════
// POLL METRIC CLASS
// ═══════════════════════════════════════════════════════════════

export class PoLLMetric extends Metric {
  private readonly config: PoLLConfig;

  constructor(config?: Partial<PoLLConfig>) {
    super();
    this.config = {
      baseUrl: config?.baseUrl ?? env.LMSTUDIO_BASE_URL,
      apiKey: config?.apiKey ?? env.LMSTUDIO_API_KEY,
      judges: config?.judges,
      context: config?.context ?? "promptagent-poll-v1",
    };
  }

  /**
   * Measure using PoLL (3-judge panel with WLNK aggregation).
   *
   * Overloaded signatures for compatibility:
   * 1. Full input object (recommended)
   * 2. Simple query/response pair (legacy compatibility)
   */
  async measure(input: PoLLMetricInput): Promise<MetricResult>;
  async measure(query: string, response: string): Promise<MetricResult>;
  async measure(
    inputOrQuery: PoLLMetricInput | string,
    maybeResponse?: string,
  ): Promise<MetricResult> {
    // Normalize input
    const input: PoLLMetricInput =
      typeof inputOrQuery === "string"
        ? {
            query: inputOrQuery,
            instructions: "",
            response: maybeResponse ?? "",
          }
        : inputOrQuery;

    const promptId = input.promptId ?? crypto.randomUUID();
    const runId = input.runId ?? crypto.randomUUID();

    // Build config with optional custom judges
    const evalConfig: PoLLConfig = {
      ...this.config,
      judges: input.judges ?? this.config.judges,
    };

    // Run PoLL evaluation
    const result = await evaluateWithPoLL(
      input.query,
      input.instructions,
      input.response,
      promptId,
      runId,
      evalConfig,
    );

    // Build info object
    const info = this.buildInfo(result);

    return {
      score: result.score,
      info,
    };
  }

  /**
   * Build the info object from PoLL result.
   */
  private buildInfo(result: PoLLResult): PoLLMetricInfo {
    const assurance = result.assurance;

    return {
      gateDecision: assurance.gateDecision,
      status: assurance.status,

      numJudges: result.judges.length,
      congruenceLevel: result.congruenceLevel,
      congruenceLevelName: CL_NAMES[result.congruenceLevel as CongruenceLevel],
      maxInterJudgeDelta: result.maxInterJudgeDelta,

      rRaw: assurance.rRaw,
      rEff: assurance.rEff,
      fEff: assurance.fEff,
      clMin: assurance.clMin,
      phiApplied: assurance.scr.phiApplied,

      judgeScores: result.judges.map((j: JudgeOutput) => j.overallScore),
      wlnkCutset: assurance.scr.wlnkCutset,

      improvementPaths: assurance.improvementPaths,

      totalLatencyMs: result.totalLatencyMs,

      scoringMethod: "PoLL-WLNK-FPF-B3",
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// CONVENIENCE: Create with env defaults
// ═══════════════════════════════════════════════════════════════

export function createPoLLMetric(config?: Partial<PoLLConfig>): PoLLMetric {
  return new PoLLMetric(config);
}
