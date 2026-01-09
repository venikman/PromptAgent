/**
 * FPF Meta-Evaluator Module
 *
 * Exports:
 * - Types: FormalityLevel, CongruenceLevel, AssuranceTuple, etc.
 * - PoLL: Panel of LLM Evaluators
 * - Constants: PHI penalties, CL thresholds
 */

// Types
export {
  FormalityLevel,
  CongruenceLevel,
  EvaluationCriterion,
  PHI,
  CL_THRESHOLDS,
  type JudgeConfig,
  type JudgeOutput,
  type CriterionEvaluation,
  type ClaimScope,
  type SourceCitationRecord,
  type ImprovementPaths,
  type AssuranceTuple,
  type PoLLResult,
} from "./types.ts";

// PoLL Evaluator (core)
export {
  evaluateWithPoLL,
  PoLLMetric as PoLLMetricCore,
  type PoLLConfig,
} from "./poll.ts";

// PoLL Metric Adapter (Mastra-compatible)
export {
  PoLLMetric,
  createPoLLMetric,
  isPoLLMetricInfo,
  type PoLLMetricInput,
  type PoLLMetricInfo,
} from "./poll-metric.ts";

// Assurance Tuple Extraction (for API responses)
export {
  extractAssuranceSummary,
  extractFromPoLL,
  extractFromSingleJudge,
  emptyAssuranceSummary,
  type AssuranceSummary,
} from "./assurance-extractor.ts";

// Creativity Characteristics (C.17)
export {
  computeNovelty,
  computeUseValue,
  computeSurprise,
  computeConstraintFit,
  computeDiversityP,
  computeCreativityProfile,
  applyCreativityGate,
  compareCreativityProfiles,
  type CreativityProfile,
  type CreativityGateResult,
  type CreativityInput,
  type CreativityConfig,
} from "./creativity.ts";

// NQD Portfolio Selector (C.18)
export {
  runNQDSelection,
  selectBestCandidate,
  isEligible,
  type Candidate,
  type ParetoFront,
  type IlluminationTelemetry,
  type NQDArchive,
  type NQDSelectorConfig,
} from "./nqd-selector.ts";
