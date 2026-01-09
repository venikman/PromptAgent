/**
 * Assurance Tuple Extractor
 *
 * Helper functions to extract F-G-R assurance tuples from scorer results.
 * Provides a unified interface for both PoLL and single-judge FPF results.
 *
 * Per FPF B.3, the assurance tuple consists of:
 * - F (Formality): Ordinal level of structural rigor
 * - G (ClaimScope): What the claim covers (set-based)
 * - R (Reliability): Confidence in the claim [0,1]
 */

import {
  type AssuranceTuple,
  type PoLLResult,
  FormalityLevel,
  CongruenceLevel,
} from "./types.ts";
import { isPoLLMetricInfo, type PoLLMetricInfo } from "./poll-metric.ts";
import {
  isPromptAgentJudgeInfo,
  type PromptAgentJudgeInfo,
} from "../judge/promptagent-fpf-judge.ts";

// ═══════════════════════════════════════════════════════════════
// ASSURANCE SUMMARY (Simplified for API responses)
// ═══════════════════════════════════════════════════════════════

/**
 * Simplified assurance summary for API responses.
 * Contains the key F-G-R values plus metadata.
 */
export interface AssuranceSummary {
  // The F-G-R tuple
  formality: {
    level: number;
    name: string;
  };
  claimScope: {
    coverage: number;
    types: string[];
  };
  reliability: {
    raw: number;
    effective: number;
  };

  // Congruence (from PoLL multi-judge)
  congruence: {
    level: number;
    name: string;
    maxDelta: number;
    penalty: number;
  } | null;

  // Gate decision
  gate: {
    decision: "pass" | "degrade" | "block" | "abstain";
    status: "satisfied" | "violated" | "inconclusive";
  };

  // Improvement guidance
  improvements: {
    raiseF: string[];
    raiseG: string[];
    raiseR: string[];
    raiseCL: string[];
  } | null;

  // Source info
  source: "poll" | "single-judge" | "none";
  numJudges: number;
}

// ═══════════════════════════════════════════════════════════════
// FORMALITY LEVEL NAMES
// ═══════════════════════════════════════════════════════════════

const FORMALITY_NAMES: Record<FormalityLevel, string> = {
  [FormalityLevel.F0_INFORMAL]: "F0 (Informal)",
  [FormalityLevel.F1_STRUCTURED]: "F1 (Structured)",
  [FormalityLevel.F2_FORMALIZABLE]: "F2 (Formalizable)",
  [FormalityLevel.F3_PROOF_GRADE]: "F3 (Proof-Grade)",
};

const CONGRUENCE_NAMES: Record<CongruenceLevel, string> = {
  [CongruenceLevel.CL0_WEAK_GUESS]: "CL0 (Weak Guess)",
  [CongruenceLevel.CL1_PLAUSIBLE]: "CL1 (Plausible)",
  [CongruenceLevel.CL2_VALIDATED]: "CL2 (Validated)",
  [CongruenceLevel.CL3_VERIFIED]: "CL3 (Verified)",
};

// ═══════════════════════════════════════════════════════════════
// EXTRACTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Extract assurance summary from PoLL metric info.
 */
export function extractFromPoLL(info: PoLLMetricInfo): AssuranceSummary {
  return {
    formality: {
      level: info.fEff,
      name: FORMALITY_NAMES[info.fEff as FormalityLevel] ?? `F${info.fEff}`,
    },
    claimScope: {
      coverage: 1.0, // PoLL currently evaluates single type
      types: ["user_story"],
    },
    reliability: {
      raw: info.rRaw,
      effective: info.rEff,
    },
    congruence: {
      level: info.congruenceLevel,
      name: info.congruenceLevelName,
      maxDelta: info.maxInterJudgeDelta,
      penalty: info.phiApplied,
    },
    gate: {
      decision: info.gateDecision,
      status: info.status,
    },
    improvements: info.improvementPaths,
    source: "poll",
    numJudges: info.numJudges,
  };
}

/**
 * Extract assurance summary from single-judge FPF info.
 */
export function extractFromSingleJudge(
  info: PromptAgentJudgeInfo
): AssuranceSummary {
  // Map single-judge to F-G-R (simplified)
  const fLevel =
    info.rEff !== undefined && info.rEff >= 0.7
      ? FormalityLevel.F2_FORMALIZABLE
      : info.rEff !== undefined && info.rEff >= 0.4
        ? FormalityLevel.F1_STRUCTURED
        : FormalityLevel.F0_INFORMAL;

  return {
    formality: {
      level: fLevel,
      name: FORMALITY_NAMES[fLevel],
    },
    claimScope: {
      coverage: info.rEff !== undefined && info.rEff > 0.5 ? 1.0 : 0.0,
      types: info.rEff !== undefined && info.rEff > 0.5 ? ["user_story"] : [],
    },
    reliability: {
      raw: info.rRaw ?? 0,
      effective: info.rEff ?? 0,
    },
    congruence: null, // Single judge has no inter-judge congruence
    gate: {
      decision: info.gateDecision ?? "abstain",
      status: info.status,
    },
    improvements: null, // Single judge doesn't provide improvement paths
    source: "single-judge",
    numJudges: 1,
  };
}

/**
 * Create empty assurance summary when no judge info is available.
 */
export function emptyAssuranceSummary(): AssuranceSummary {
  return {
    formality: {
      level: 0,
      name: "Unknown",
    },
    claimScope: {
      coverage: 0,
      types: [],
    },
    reliability: {
      raw: 0,
      effective: 0,
    },
    congruence: null,
    gate: {
      decision: "abstain",
      status: "inconclusive",
    },
    improvements: null,
    source: "none",
    numJudges: 0,
  };
}

/**
 * Extract assurance summary from scorer preprocess result.
 *
 * Prioritizes PoLL result over single-judge FPF.
 */
export function extractAssuranceSummary(preprocessResult: {
  pollResult?: { info?: unknown } | null;
  fpfJudgeResult?: { info?: unknown } | null;
}): AssuranceSummary {
  // Try PoLL first (preferred)
  if (preprocessResult.pollResult?.info) {
    if (isPoLLMetricInfo(preprocessResult.pollResult.info)) {
      return extractFromPoLL(preprocessResult.pollResult.info as PoLLMetricInfo);
    }
  }

  // Fall back to single-judge FPF
  if (preprocessResult.fpfJudgeResult?.info) {
    if (isPromptAgentJudgeInfo(preprocessResult.fpfJudgeResult.info)) {
      return extractFromSingleJudge(
        preprocessResult.fpfJudgeResult.info as PromptAgentJudgeInfo
      );
    }
  }

  // No judge info available
  return emptyAssuranceSummary();
}
