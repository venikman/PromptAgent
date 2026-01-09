/**
 * FPF Core Types for PromptAgent Meta-Evaluator
 *
 * Based on FPF-Spec December 2025:
 * - B.3: Trust & Assurance Calculus (F-G-R)
 * - C.17: Creativity-CHR
 * - C.18: NQD-CAL
 */

import { z } from "npm:zod@4.3.5";

// ═══════════════════════════════════════════════════════════════
// FORMALITY LEVEL (Ordinal - NEVER average)
// Based on FPF A.16 Formality-Openness Ladder
// ═══════════════════════════════════════════════════════════════

export enum FormalityLevel {
  F0_INFORMAL = 0,      // Freeform prose, no structure
  F1_STRUCTURED = 1,    // Structured narrative (sections, bullets)
  F2_FORMALIZABLE = 2,  // Schema-compliant, machine-readable
  F3_PROOF_GRADE = 3,   // Formally verified structure
}

// ═══════════════════════════════════════════════════════════════
// CONGRUENCE LEVEL (Ordinal - NEVER average)
// Measures inter-judge agreement quality
// ═══════════════════════════════════════════════════════════════

export enum CongruenceLevel {
  CL0_WEAK_GUESS = 0,       // High disagreement, Φ = 0.30
  CL1_PLAUSIBLE = 1,        // Moderate agreement, Φ = 0.15
  CL2_VALIDATED = 2,        // Strong agreement, Φ = 0.05
  CL3_VERIFIED = 3,         // Near-unanimous, Φ = 0.00
}

/**
 * Congruence penalty function Φ(CL)
 * Per FPF B.3:4.4: monotone decreasing, bounded
 */
export const PHI: Record<CongruenceLevel, number> = {
  [CongruenceLevel.CL0_WEAK_GUESS]: 0.30,
  [CongruenceLevel.CL1_PLAUSIBLE]: 0.15,
  [CongruenceLevel.CL2_VALIDATED]: 0.05,
  [CongruenceLevel.CL3_VERIFIED]: 0.00,
};

/**
 * CL thresholds based on max inter-judge delta
 */
export const CL_THRESHOLDS = {
  CL3: 0.10,  // < 0.10 delta → CL3 (verified)
  CL2: 0.25,  // < 0.25 delta → CL2 (validated)
  CL1: 0.40,  // < 0.40 delta → CL1 (plausible)
  // >= 0.40 → CL0 (weak guess)
};

// ═══════════════════════════════════════════════════════════════
// EVALUATION CRITERIA (Decomposed per FPF best practices)
// ═══════════════════════════════════════════════════════════════

export enum EvaluationCriterion {
  // INVEST criteria (for user stories)
  INDEPENDENT = "independent",
  NEGOTIABLE = "negotiable",
  VALUABLE = "valuable",
  ESTIMABLE = "estimable",
  SMALL = "small",
  TESTABLE = "testable",

  // GWT format compliance
  GWT_FORMAT = "gwt_format",

  // Schema compliance
  SCHEMA_VALID = "schema_valid",

  // Overall quality
  CORRECTNESS = "correctness",
  COMPLETENESS = "completeness",
  SAFETY = "safety",
}

// ═══════════════════════════════════════════════════════════════
// JUDGE CONFIGURATION
// ═══════════════════════════════════════════════════════════════

export const JudgeConfigSchema = z.object({
  id: z.string(),
  model: z.string(),
  temperature: z.number().min(0).max(2),
  provider: z.enum(["lmstudio", "openai", "anthropic", "google"]),
});

export type JudgeConfig = z.infer<typeof JudgeConfigSchema>;

// ═══════════════════════════════════════════════════════════════
// CRITERION EVALUATION (Per-criterion scores from a single judge)
// ═══════════════════════════════════════════════════════════════

export const CriterionEvaluationSchema = z.object({
  criterion: z.nativeEnum(EvaluationCriterion),
  score: z.number().min(0).max(1),
  reasoning: z.string(),
  evidence: z.array(z.string()).default([]),
});

export type CriterionEvaluation = z.infer<typeof CriterionEvaluationSchema>;

// ═══════════════════════════════════════════════════════════════
// JUDGE OUTPUT (Complete output from a single judge)
// ═══════════════════════════════════════════════════════════════

export const JudgeOutputSchema = z.object({
  judgeId: z.string(),
  promptId: z.string(),
  runId: z.string(),

  // Per-criterion evaluations
  criteriaEvals: z.array(CriterionEvaluationSchema),

  // Aggregated within-judge scores
  overallScore: z.number().min(0).max(1),

  // Metadata
  latencyMs: z.number(),
  tokensUsed: z.number().optional(),
  timestamp: z.string(),
});

export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;

// ═══════════════════════════════════════════════════════════════
// CLAIM SCOPE (G) - What the prompt reliably handles
// Set-based, NOT numeric (FPF G is coverage, not a score)
// ═══════════════════════════════════════════════════════════════

export const ClaimScopeSchema = z.object({
  epicTypes: z.array(z.string()),
  confidencePerType: z.record(z.string(), z.number()),
  totalCoverage: z.number().min(0).max(1),
});

export type ClaimScope = z.infer<typeof ClaimScopeSchema>;

// ═══════════════════════════════════════════════════════════════
// EVIDENCE PIN (For audit trail - FPF A.10)
// ═══════════════════════════════════════════════════════════════

export const EvidencePinSchema = z.object({
  id: z.string(),
  sha256: z.string(),
  kind: z.enum(["judge_output", "response", "trace", "prompt"]),
});

export type EvidencePin = z.infer<typeof EvidencePinSchema>;

// ═══════════════════════════════════════════════════════════════
// SOURCE CITATION RECORD (SCR) - Complete audit trail
// Required for every assurance claim (FPF A.10)
// ═══════════════════════════════════════════════════════════════

export const SourceCitationRecordSchema = z.object({
  claimId: z.string(),
  context: z.string(),
  scope: z.enum(["design", "run"]),

  // Input evidence
  judgeOutputs: z.array(JudgeOutputSchema),

  // Aggregation inputs (for audit)
  fInputs: z.array(z.nativeEnum(FormalityLevel)),
  rInputs: z.array(z.number()),
  clEdges: z.array(z.nativeEnum(CongruenceLevel)),

  // Computation record
  wlnkCutset: z.array(z.string()),  // Which nodes capped F/G/R
  phiApplied: z.number(),
  evidencePins: z.array(EvidencePinSchema),

  timestamp: z.string(),
});

export type SourceCitationRecord = z.infer<typeof SourceCitationRecordSchema>;

// ═══════════════════════════════════════════════════════════════
// IMPROVEMENT PATH (What to do to raise F/G/R/CL)
// Per FPF B.3:4.7
// ═══════════════════════════════════════════════════════════════

export const ImprovementPathsSchema = z.object({
  raiseF: z.array(z.string()),
  raiseG: z.array(z.string()),
  raiseR: z.array(z.string()),
  raiseCL: z.array(z.string()),
});

export type ImprovementPaths = z.infer<typeof ImprovementPathsSchema>;

// ═══════════════════════════════════════════════════════════════
// ASSURANCE TUPLE - The core F-G-R output (FPF B.3)
// ═══════════════════════════════════════════════════════════════

export const AssuranceTupleSchema = z.object({
  // The three characteristics
  fEff: z.nativeEnum(FormalityLevel),
  gEff: ClaimScopeSchema,
  rEff: z.number().min(0).max(1),

  // Raw values before WLNK
  rRaw: z.number().min(0).max(1),
  clMin: z.nativeEnum(CongruenceLevel),

  // Audit trail
  scr: SourceCitationRecordSchema,

  // Improvement guidance
  improvementPaths: ImprovementPathsSchema,

  // Gate decision (for backwards compatibility)
  gateDecision: z.enum(["pass", "degrade", "block"]),
  status: z.enum(["satisfied", "violated", "inconclusive"]),
});

export type AssuranceTuple = z.infer<typeof AssuranceTupleSchema>;

// ═══════════════════════════════════════════════════════════════
// POLL RESULT - Combined output from Panel of LLM Evaluators
// ═══════════════════════════════════════════════════════════════

export const PoLLResultSchema = z.object({
  // Individual judge outputs
  judges: z.array(JudgeOutputSchema),

  // Congruence analysis
  congruenceLevel: z.nativeEnum(CongruenceLevel),
  maxInterJudgeDelta: z.number(),

  // Final assurance tuple
  assurance: AssuranceTupleSchema,

  // Legacy score (for backwards compatibility)
  score: z.number().min(0).max(1),

  // Timing
  totalLatencyMs: z.number(),
});

export type PoLLResult = z.infer<typeof PoLLResultSchema>;
