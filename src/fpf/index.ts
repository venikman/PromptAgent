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
  type AssuranceTuple,
  CL_THRESHOLDS,
  type ClaimScope,
  CongruenceLevel,
  type CriterionEvaluation,
  EvaluationCriterion,
  FormalityLevel,
  type ImprovementPaths,
  type JudgeConfig,
  type JudgeOutput,
  PHI,
  type PoLLResult,
  type SourceCitationRecord,
} from "./types.ts";

// PoLL Evaluator (core)
export {
  evaluateWithPoLL,
  type PoLLConfig,
  PoLLMetric as PoLLMetricCore,
} from "./poll.ts";

// PoLL Metric Adapter (Mastra-compatible)
export {
  createPoLLMetric,
  isPoLLMetricInfo,
  PoLLMetric,
  type PoLLMetricInfo,
  type PoLLMetricInput,
} from "./poll-metric.ts";

// Assurance Tuple Extraction (for API responses)
export {
  type AssuranceSummary,
  emptyAssuranceSummary,
  extractAssuranceSummary,
  extractFromPoLL,
  extractFromSingleJudge,
} from "./assurance-extractor.ts";

// Creativity Characteristics (C.17)
export {
  applyCreativityGate,
  compareCreativityProfiles,
  computeConstraintFit,
  computeCreativityProfile,
  computeDiversityP,
  computeNovelty,
  computeSurprise,
  computeUseValue,
  type CreativityConfig,
  type CreativityGateResult,
  type CreativityInput,
  type CreativityProfile,
} from "./creativity.ts";

// NQD Portfolio Selector (C.18)
export {
  type Candidate,
  type IlluminationTelemetry,
  isEligible,
  type NQDArchive,
  type NQDSelectorConfig,
  type ParetoFront,
  runNQDSelection,
  selectBestCandidate,
} from "./nqd-selector.ts";

// Confidence Intervals
export {
  autoConfidenceInterval,
  bootstrapInterval,
  type ConfidenceInterval,
  formatConfidenceInterval,
  interJudgeInterval,
  intervalsOverlap,
  intervalWidth,
  mean,
  normalInterval,
  percentile,
  scoreWithBootstrapConfidence,
  type ScoreWithConfidence,
  scoreWithJudgeConfidence,
  standardError,
  stdDev,
  tInterval,
  wilsonInterval,
} from "./confidence-interval.ts";
