/**
 * PoLL - Panel of LLM Evaluators
 *
 * Implements FPF B.3 Trust & Assurance Calculus with:
 * - 3 diverse judges (different temperatures for diversity)
 * - Per-criterion evaluation (decomposed INVEST + GWT)
 * - WLNK aggregation: R_eff = max(0, min(R_i) - Φ(CL_min))
 * - Full SCR audit trail
 *
 * Based on:
 * - PoLL paper (arXiv 2404.18796): "Panel of LLM Evaluators"
 * - FPF-Spec B.3: Trust & Assurance Calculus
 */

import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { env } from "../config.ts";
import { withAiTelemetry } from "../telemetry.ts";

import {
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

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const DEFAULT_JUDGES: JudgeConfig[] = [
  {
    id: "judge-1",
    model: "gpt-4o-mini",
    temperature: 0.3,
    provider: "lmstudio",
  },
  {
    id: "judge-2",
    model: "gpt-4o-mini",
    temperature: 0.5,
    provider: "lmstudio",
  },
  {
    id: "judge-3",
    model: "gpt-4o-mini",
    temperature: 0.7,
    provider: "lmstudio",
  },
];

const CRITERIA_WEIGHTS: Record<EvaluationCriterion, number> = {
  [EvaluationCriterion.CORRECTNESS]: 0.2,
  [EvaluationCriterion.COMPLETENESS]: 0.15,
  [EvaluationCriterion.SAFETY]: 0.15,
  [EvaluationCriterion.INDEPENDENT]: 0.08,
  [EvaluationCriterion.NEGOTIABLE]: 0.08,
  [EvaluationCriterion.VALUABLE]: 0.08,
  [EvaluationCriterion.ESTIMABLE]: 0.08,
  [EvaluationCriterion.SMALL]: 0.06,
  [EvaluationCriterion.TESTABLE]: 0.06,
  [EvaluationCriterion.GWT_FORMAT]: 0.03,
  [EvaluationCriterion.SCHEMA_VALID]: 0.03,
};

const SUPPORT_THRESHOLD = 0.5; // Min R for G_eff inclusion
const SATISFIED_THRESHOLD = 0.7;
const VIOLATED_THRESHOLD = 0.3;

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

// ═══════════════════════════════════════════════════════════════
// LLM JUDGE SCHEMA (What we ask the LLM to return)
// ═══════════════════════════════════════════════════════════════

const LLMJudgeResponseSchema = z.object({
  criteria: z.array(
    z.object({
      criterion: z.string(),
      score: z.number().min(0).max(1),
      reasoning: z.string(),
    }),
  ),
  overallAssessment: z.string(),
});

type LLMJudgeResponse = z.infer<typeof LLMJudgeResponseSchema>;

// ═══════════════════════════════════════════════════════════════
// JUDGE PROMPT TEMPLATE
// ═══════════════════════════════════════════════════════════════

const buildJudgePrompt = (
  query: string,
  instructions: string,
  response: string,
): string =>
  `You are an expert evaluator for AI-generated user stories.

Evaluate the RESPONSE against the QUERY and INSTRUCTIONS using these criteria:

## INVEST Criteria (for user stories):
- **independent**: Can this story be developed independently of others?
- **negotiable**: Is there room for discussion and refinement?
- **valuable**: Does it deliver clear value to the user/stakeholder?
- **estimable**: Can the effort be reasonably estimated?
- **small**: Is it small enough to complete in one iteration?
- **testable**: Are acceptance criteria clear and verifiable?

## Format Criteria:
- **gwt_format**: Does it follow Given-When-Then format correctly?
- **schema_valid**: Does it match the required JSON schema?

## Quality Criteria:
- **correctness**: Is the content factually/logically correct?
- **completeness**: Are all required elements present?
- **safety**: Is the content appropriate and non-harmful?

For each criterion, provide:
- score: 0.0 to 1.0 (0 = completely fails, 1 = perfect)
- reasoning: Brief explanation (1-2 sentences)

QUERY:
${query}

INSTRUCTIONS:
${instructions}

RESPONSE:
${response}

Evaluate each criterion honestly and conservatively. Do not over-score.`;

// ═══════════════════════════════════════════════════════════════
// SINGLE JUDGE EVALUATION
// ═══════════════════════════════════════════════════════════════

async function evaluateWithJudge(
  judge: JudgeConfig,
  query: string,
  instructions: string,
  response: string,
  promptId: string,
  runId: string,
  baseUrl: string,
  apiKey: string,
): Promise<JudgeOutput> {
  const startTime = Date.now();

  const openai = createOpenAI({
    baseURL: baseUrl,
    apiKey: apiKey,
  });

  const prompt = buildJudgePrompt(query, instructions, response);

  const abortSignal = AbortSignal.timeout(env.LLM_TIMEOUT_MS);
  const result = await withAiTelemetry(
    { name: `poll-${judge.id}`, model: judge.model },
    () =>
      generateObject({
        model: openai(judge.model),
        schema: LLMJudgeResponseSchema,
        prompt,
        temperature: judge.temperature,
        abortSignal,
      }),
  );

  const latencyMs = Date.now() - startTime;

  // Map LLM response to our criterion evaluations
  const llmResponse = result.object as LLMJudgeResponse;
  const criteriaEvals: CriterionEvaluation[] = llmResponse.criteria.map(
    (c) => ({
      criterion: c.criterion as EvaluationCriterion,
      score: c.score,
      reasoning: c.reasoning,
      evidence: [],
    }),
  );

  // Compute weighted overall score
  let overallScore = 0;
  let totalWeight = 0;

  for (const eval_ of criteriaEvals) {
    const weight = CRITERIA_WEIGHTS[eval_.criterion as EvaluationCriterion] ??
      0.05;
    overallScore += eval_.score * weight;
    totalWeight += weight;
  }

  if (totalWeight > 0) {
    overallScore = overallScore / totalWeight;
  }

  return {
    judgeId: judge.id,
    promptId,
    runId,
    criteriaEvals,
    overallScore: clamp01(overallScore),
    latencyMs,
    tokensUsed: result.usage?.totalTokens,
    timestamp: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
// CONGRUENCE LEVEL COMPUTATION
// Per FPF B.3: CL based on inter-judge agreement
// ═══════════════════════════════════════════════════════════════

function computeCongruenceLevel(judgeOutputs: JudgeOutput[]): {
  level: CongruenceLevel;
  maxDelta: number;
} {
  if (judgeOutputs.length < 2) {
    return { level: CongruenceLevel.CL0_WEAK_GUESS, maxDelta: 1.0 };
  }

  // Compute max delta between any pair of judges
  let maxDelta = 0;

  for (let i = 0; i < judgeOutputs.length; i++) {
    for (let j = i + 1; j < judgeOutputs.length; j++) {
      const judgeI = judgeOutputs[i]!;
      const judgeJ = judgeOutputs[j]!;
      const delta = Math.abs(judgeI.overallScore - judgeJ.overallScore);
      maxDelta = Math.max(maxDelta, delta);
    }
  }

  // Map to CL based on thresholds
  let level: CongruenceLevel;
  if (maxDelta < CL_THRESHOLDS.CL3) {
    level = CongruenceLevel.CL3_VERIFIED;
  } else if (maxDelta < CL_THRESHOLDS.CL2) {
    level = CongruenceLevel.CL2_VALIDATED;
  } else if (maxDelta < CL_THRESHOLDS.CL1) {
    level = CongruenceLevel.CL1_PLAUSIBLE;
  } else {
    level = CongruenceLevel.CL0_WEAK_GUESS;
  }

  return { level, maxDelta };
}

// ═══════════════════════════════════════════════════════════════
// WLNK AGGREGATION (B.3:4.4)
// The heart of FPF's conservative trust calculus
// ═══════════════════════════════════════════════════════════════

function computeAssuranceTuple(
  judgeOutputs: JudgeOutput[],
  congruence: { level: CongruenceLevel; maxDelta: number },
  promptId: string,
  context: string,
): AssuranceTuple {
  // 1. Formality: For now, derive from schema validity scores
  // In full implementation, this would be a separate structural analysis
  const schemaScores = judgeOutputs.map((j) => {
    const schemaEval = j.criteriaEvals.find(
      (e) => e.criterion === EvaluationCriterion.SCHEMA_VALID,
    );
    return schemaEval?.score ?? 0.5;
  });
  const avgSchemaScore = schemaScores.reduce((a, b) => a + b, 0) /
    schemaScores.length;

  // Map to formality level (ordinal)
  let fEff: FormalityLevel;
  if (avgSchemaScore >= 0.9) {
    fEff = FormalityLevel.F2_FORMALIZABLE;
  } else if (avgSchemaScore >= 0.7) {
    fEff = FormalityLevel.F1_STRUCTURED;
  } else {
    fEff = FormalityLevel.F0_INFORMAL;
  }

  // 2. Reliability: WLNK (weakest-link)
  const rInputs = judgeOutputs.map((j) => j.overallScore);
  const rRaw = Math.min(...rInputs);

  // Apply congruence penalty: R_eff = max(0, R_raw - Φ(CL_min))
  const phiApplied = PHI[congruence.level];
  const rEff = clamp01(Math.max(0, rRaw - phiApplied));

  // 3. Scope: For now, single type. In full implementation, would track per-epic-type
  const gEff: ClaimScope = {
    epicTypes: rEff > SUPPORT_THRESHOLD ? ["user_story"] : [],
    confidencePerType: { user_story: rEff },
    totalCoverage: rEff > SUPPORT_THRESHOLD ? 1.0 : 0.0,
  };

  // 4. Identify cutset (what capped the scores)
  const wlnkCutset: string[] = [];
  for (const judge of judgeOutputs) {
    if (judge.overallScore === rRaw) {
      wlnkCutset.push(`${judge.judgeId}:R=${rRaw.toFixed(3)}`);
    }
  }

  // 5. Build SCR (Source Citation Record)
  const scr: SourceCitationRecord = {
    claimId: `ast-${Date.now()}-${promptId.slice(0, 8)}`,
    context,
    scope: "run",
    judgeOutputs,
    fInputs: judgeOutputs.map(() => fEff), // Simplified for now
    rInputs,
    clEdges: [congruence.level],
    wlnkCutset,
    phiApplied,
    evidencePins: [], // Would include hashes in full implementation
    timestamp: new Date().toISOString(),
  };

  // 6. Generate improvement paths
  const improvementPaths: ImprovementPaths = {
    raiseF: avgSchemaScore < 0.9
      ? ["Improve schema compliance", "Add structured JSON validation"]
      : [],
    raiseG: gEff.totalCoverage < 1.0
      ? ["Add coverage for more epic types", "Increase test variety"]
      : [],
    raiseR: rRaw < 0.8
      ? ["Address issues from lowest-scoring judge", "Improve weak criteria"]
      : [],
    raiseCL: congruence.maxDelta > CL_THRESHOLDS.CL2
      ? [
        `Investigate judge disagreement (delta=${
          congruence.maxDelta.toFixed(3)
        })`,
      ]
      : [],
  };

  // 7. Determine gate decision
  let gateDecision: "pass" | "degrade" | "block";
  let status: "satisfied" | "violated" | "inconclusive";

  if (rEff >= SATISFIED_THRESHOLD) {
    gateDecision = "pass";
    status = "satisfied";
  } else if (rEff <= VIOLATED_THRESHOLD) {
    gateDecision = "block";
    status = "violated";
  } else {
    gateDecision = "degrade";
    status = "inconclusive";
  }

  return {
    fEff,
    gEff,
    rEff,
    rRaw,
    clMin: congruence.level,
    scr,
    improvementPaths,
    gateDecision,
    status,
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN POLL EVALUATOR
// ═══════════════════════════════════════════════════════════════

export interface PoLLConfig {
  judges?: JudgeConfig[];
  baseUrl: string;
  apiKey: string;
  context?: string;
}

export async function evaluateWithPoLL(
  query: string,
  instructions: string,
  response: string,
  promptId: string,
  runId: string,
  config: PoLLConfig,
): Promise<PoLLResult> {
  const startTime = Date.now();
  const judges = config.judges ?? DEFAULT_JUDGES;
  const context = config.context ?? "promptagent-eval-v1";

  // Run all judges in parallel
  const judgePromises = judges.map((judge) =>
    evaluateWithJudge(
      judge,
      query,
      instructions,
      response,
      promptId,
      runId,
      config.baseUrl,
      config.apiKey,
    )
  );

  const judgeOutputs = await Promise.all(judgePromises);

  // Compute congruence level
  const congruence = computeCongruenceLevel(judgeOutputs);

  // Compute assurance tuple with WLNK aggregation
  const assurance = computeAssuranceTuple(
    judgeOutputs,
    congruence,
    promptId,
    context,
  );

  const totalLatencyMs = Date.now() - startTime;

  return {
    judges: judgeOutputs,
    congruenceLevel: congruence.level,
    maxInterJudgeDelta: congruence.maxDelta,
    assurance,
    score: assurance.rEff, // Legacy compatibility
    totalLatencyMs,
  };
}

// ═══════════════════════════════════════════════════════════════
// CONVENIENCE: Metric-compatible wrapper
// ═══════════════════════════════════════════════════════════════

export class PoLLMetric {
  private readonly config: PoLLConfig;

  constructor(config: PoLLConfig) {
    this.config = config;
  }

  async measure(
    query: string,
    instructions: string,
    response: string,
    promptId?: string,
    runId?: string,
  ): Promise<{ score: number; info: PoLLResult }> {
    const result = await evaluateWithPoLL(
      query,
      instructions,
      response,
      promptId ?? crypto.randomUUID(),
      runId ?? crypto.randomUUID(),
      this.config,
    );

    return {
      score: result.score,
      info: result,
    };
  }
}
