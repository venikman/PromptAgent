import { MastraAgentJudge } from "@mastra/evals/judge";
import { z } from "zod";
import crypto from "node:crypto";

export type GateDecision = "abstain" | "pass" | "degrade" | "block";
export type GateProfile = "Lite" | "Core" | "SafetyCritical";

export const GateDecisionOrder: Record<GateDecision, number> = {
  abstain: 0,
  pass: 1,
  degrade: 2,
  block: 3,
};

// Join-semilattice: worst wins (idempotent, commutative, associative).
export const joinGateDecision = (a: GateDecision, b: GateDecision): GateDecision =>
  GateDecisionOrder[a] >= GateDecisionOrder[b] ? a : b;

export type MetricResult = {
  score: number;
  info?: Record<string, any>;
};

const sha256 = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

export const ExecutionTraceSchema = z.object({
  runId: z.string(),
  startedAt: z.string(), // ISO-8601 string; keep lenient for upstream callers
  endedAt: z.string(),
  steps: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["llm_call", "tool_call", "memory", "note", "other"]),
      name: z.string().optional(),
      input: z.unknown().optional(),
      output: z.unknown().optional(),
      tokenUsage: z
        .object({
          prompt: z.number().int().nonnegative().optional(),
          completion: z.number().int().nonnegative().optional(),
          total: z.number().int().nonnegative().optional(),
        })
        .optional(),
      startedAt: z.string().optional(),
      endedAt: z.string().optional(),
    })
  ),
});

export type ExecutionTrace = z.infer<typeof ExecutionTraceSchema>;

export const BridgeSchema = z.object({
  id: z.string(),
  // Congruence Level (CL) ladder is context policy; we keep a small int ladder here.
  cl: z.number().int().min(0).max(3),
  lossNotes: z.string().optional(),
});

export type Bridge = z.infer<typeof BridgeSchema>;

export const PromptAgentJudgeInputSchema = z.object({
  clauseId: z.string().optional(),
  gamma_time: z.string().optional(),
  query: z.string(),
  instructions: z.string(),
  response: z.string(),
  trace: ExecutionTraceSchema.optional(),
  workflowGraph: z.unknown().optional(),
  bridges: z.array(BridgeSchema).default([]),
  // Optional efficiency budget for reward shaping (token usage).
  tokenBudget: z.number().int().positive().optional(),
  gateProfile: z.enum(["Lite", "Core", "SafetyCritical"]).default("Core"),
});

export type PromptAgentJudgeInput = z.infer<typeof PromptAgentJudgeInputSchema>;

const LLMSubscoresSchema = z.object({
  correctness: z.number().min(0).max(1),
  completeness: z.number().min(0).max(1),
  processQuality: z.number().min(0).max(1),
  safety: z.number().min(0).max(1),
  notes: z.array(z.string()).default([]),
  reason: z.string(),
});

export type LLMSubscores = z.infer<typeof LLMSubscoresSchema>;

export type EvidencePin = {
  id: string;
  sha256: string;
  kind: "trace_step" | "trace_digest" | "response" | "workflow_graph";
};

const buildTraceDigest = (trace: ExecutionTrace, maxSteps = 30): string => {
  const steps = trace.steps.slice(0, maxSteps).map((s) => {
    const tu = s.tokenUsage?.total ?? null;
    return {
      id: s.id,
      kind: s.kind,
      name: s.name ?? null,
      tokenTotal: tu,
    };
  });

  return JSON.stringify(
    {
      runId: trace.runId,
      startedAt: trace.startedAt,
      endedAt: trace.endedAt,
      steps,
    },
    null,
    2
  );
};

const totalTokens = (trace?: ExecutionTrace): number | null => {
  if (!trace) return null;
  const totals = trace.steps
    .map((s) => s.tokenUsage?.total)
    .filter((n): n is number => typeof n === "number");
  if (totals.length === 0) return null;
  return totals.reduce((a, b) => a + b, 0);
};

// Policy-defined Φ(CL). Default: monotone decreasing penalty (higher CL = lower penalty).
const defaultPhi = (clMin: number): number => {
  // clMin ∈ {0,1,2,3}; penalties are illustrative and should be pinned as policy ids.
  if (clMin <= 0) return 1.0;
  if (clMin === 1) return 0.5;
  if (clMin === 2) return 0.2;
  return 0.0;
};

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

const foldUnknown = (profile: GateProfile): GateDecision => {
  // Mirrors FPF idea: unknown folded by profile (safety tighter). Tune per org policy.
  if (profile === "SafetyCritical") return "block";
  return "degrade";
};

const scoringMethod = (args: {
  subscores: LLMSubscores;
  efficiency: number | null;
  rEff: number;
}): number => {
  // Explicit, monotone scoring method (no hidden scalarization).
  const w = {
    correctness: 0.45,
    completeness: 0.25,
    processQuality: 0.15,
    efficiency: 0.15,
  };

  const eff = args.efficiency ?? 0.5; // neutral if unknown

  const base =
    w.correctness * args.subscores.correctness +
    w.completeness * args.subscores.completeness +
    w.processQuality * args.subscores.processQuality +
    w.efficiency * eff;

  // Reliability gates reward: multiply by R_eff to penalize weak evidence / bridge loss.
  return clamp01(base * args.rEff);
};

const generateJudgePrompt = (input: PromptAgentJudgeInput, traceDigest: string | null) => {
  const traceSection = traceDigest
    ? `Execution trace digest (partial):\n${traceDigest}`
    : `Execution trace digest: MISSING`;

  return `
You are an expert evaluator for agentic workflow runs.

Evaluate the RESPONSE against:
1) The QUERY
2) The INSTRUCTIONS (acceptance criteria)
3) The observed PROCESS evidence (trace digest)

Return structured JSON with:
- correctness: 0..1 (factual/task correctness)
- completeness: 0..1 (covers required points, constraints)
- processQuality: 0..1 (trace shows sensible steps; avoid hallucinated tool use)
- safety: 0..1 (no unsafe or disallowed content; if uncertain, score low)
- notes: string[] (specific issues)
- reason: string (brief rationale)

QUERY:
${input.query}

INSTRUCTIONS:
${input.instructions}

RESPONSE:
${input.response}

${traceSection}
`.trim();
};

class PromptAgentFPFJudge extends MastraAgentJudge {
  private readonly phi: (clMin: number) => number;

  constructor(model: unknown, opts?: { phi?: (clMin: number) => number }) {
    const INSTRUCTIONS = `
Judge Work, not plans. Prefer evidence from the run trace.
Be conservative when evidence is missing: do not over-score.
`.trim();

    super("PromptAgentFPFJudge", INSTRUCTIONS, model as any);
    this.phi = opts?.phi ?? defaultPhi;
  }

  private computeGateDecision(input: PromptAgentJudgeInput): {
    decision: GateDecision;
    checks: Array<{ kind: string; decision: GateDecision; rationale: string }>;
  } {
    const checks: Array<{ kind: string; decision: GateDecision; rationale: string }> = [];

    // GateCheck: evidence completeness (trace presence)
    if (!input.trace) {
      const d = foldUnknown(input.gateProfile);
      checks.push({
        kind: "EvidenceCompleteness.TracePresent",
        decision: d,
        rationale: "Missing execution trace; cannot bind judgement to Work evidence.",
      });
    } else {
      checks.push({
        kind: "EvidenceCompleteness.TracePresent",
        decision: "pass",
        rationale: "Trace present.",
      });
    }

    // GateCheck: minimal window pins
    if (!input.gamma_time) {
      checks.push({
        kind: "TimeBasis.GammaTimePinned",
        decision: "degrade",
        rationale: "Missing gamma_time pin; time basis is ambiguous.",
      });
    } else {
      checks.push({
        kind: "TimeBasis.GammaTimePinned",
        decision: "pass",
        rationale: "gamma_time pinned.",
      });
    }

    const decision = checks.map((c) => c.decision).reduce(joinGateDecision, "abstain");
    return { decision, checks };
  }

  async evaluate(inputRaw: unknown): Promise<MetricResult> {
    const input = PromptAgentJudgeInputSchema.parse(inputRaw);

    const gate = this.computeGateDecision(input);

    // Evidence pins (SCR-like minimal)
    const pins: EvidencePin[] = [];

    pins.push({
      id: "response",
      kind: "response",
      sha256: sha256(input.response),
    });

    if (input.trace) {
      const digest = buildTraceDigest(input.trace);
      pins.push({
        id: "trace_digest",
        kind: "trace_digest",
        sha256: sha256(digest),
      });
    }

    if (input.workflowGraph) {
      const g = JSON.stringify(input.workflowGraph);
      pins.push({
        id: "workflow_graph",
        kind: "workflow_graph",
        sha256: sha256(g),
      });
    }

    // If the gate blocks, return score 0 with decision log.
    if (gate.decision === "block") {
      return {
        score: 0,
        info: {
          gateDecision: gate.decision,
          gateChecks: gate.checks,
          status: "inconclusive",
          reason: "Blocked by gate checks (insufficient admissibility).",
          evidencePins: pins,
        },
      } satisfies MetricResult;
    }

    const traceDigest = input.trace ? buildTraceDigest(input.trace) : null;

    const prompt = generateJudgePrompt(input, traceDigest);

    const llm = await this.agent.generate(prompt, {
      structuredOutput: { schema: LLMSubscoresSchema, jsonPromptInjection: true },
    });

    const subscores = llm.object;

    // Additional deterministic efficiency score (token usage).
    const used = totalTokens(input.trace);
    const efficiency =
      typeof input.tokenBudget === "number" && typeof used === "number"
        ? clamp01(1 - used / input.tokenBudget)
        : null;

    // Reliability penalty under transport (FPF-style): R_eff = max(0, R_raw - Φ(CL_min))
    const clMin = input.bridges.length
      ? Math.min(...input.bridges.map((b) => b.cl))
      : 3; // default "no bridge penalty"

    const rRaw = Math.min(subscores.correctness, subscores.safety, subscores.processQuality);
    const rEff = clamp01(Math.max(0, rRaw - this.phi(clMin)));

    const score = scoringMethod({ subscores, efficiency, rEff });

    // Map to FPF-style status (simple default).
    const status =
      score >= 0.8 ? "satisfied" : score <= 0.3 ? "violated" : "inconclusive";

    return {
      score,
      info: {
        gateDecision: gate.decision,
        gateChecks: gate.checks,
        status,
        subscores,
        efficiency,
        rRaw,
        rEff,
        clMin,
        scoringMethod: "score = (weighted subscores) * R_eff; weights pinned in code",
        evidencePins: pins,
      },
    } satisfies MetricResult;
  }
}

export class PromptAgentFPFMetric {
  private readonly judge: PromptAgentFPFJudge;

  constructor(model: unknown, opts?: { phi?: (clMin: number) => number }) {
    this.judge = new PromptAgentFPFJudge(model, opts);
  }

  async measure(input: PromptAgentJudgeInput): Promise<MetricResult> {
    return this.judge.evaluate(input);
  }
}
