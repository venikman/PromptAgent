/**
 * Prompt Patch Engineer Agent
 *
 * This agent takes contrastive pairs (similar outputs with different quality)
 * and proposes small additive patches to improve the prompt.
 *
 * Key design choices (from the paper):
 * 1. Only generate "additions" — never rewrite the base prompt
 * 2. Keep patches short (~10-15 lines) to avoid overfitting
 * 3. Focus on patterns that distinguish GOOD from BAD outputs
 */

import { Agent } from "@mastra/core/agent";
import { makeJudgeModel } from "./models.ts";
import { env } from "./config.ts";
import { withAiTelemetry } from "./telemetry.ts";

// ─────────────────────────────────────────────────
// Agent Definition
// ─────────────────────────────────────────────────

const PATCH_ENGINEER_INSTRUCTIONS = `
You are a prompt optimization expert. Your task is to analyze contrastive pairs
of outputs (GOOD vs BAD) and propose a SMALL ADDITIVE PATCH to improve the prompt.

## Rules

1. **Output ONLY the patch text.** No markdown fences, no explanations.
2. **The patch must be additive rules.** Do NOT rewrite the base prompt.
3. **Keep it short:** max 10-15 lines of additional rules.
4. **Focus on patterns** that distinguish GOOD outputs from BAD outputs.
5. **Be specific and actionable.** Avoid vague directives like "be more careful".

## What to Fix (in priority order)

1. **Schema violations** — if BAD outputs have structural issues
2. **Coverage gaps** — if BAD outputs miss requirements from the epic
3. **Hallucinations** — if BAD outputs invent unsupported claims
4. **Testability** — if BAD outputs have vague acceptance criteria
5. **Duplication** — if BAD outputs repeat similar stories
6. **Story count** — if BAD outputs have too few or too many stories

## Example Patch Format

Extra rule: If the epic mentions specific personas, ensure each persona has at least one story addressing their needs.

Extra rule: Non-functional requirements (performance, security, compliance) must have dedicated acceptance criteria with measurable thresholds.

Extra rule: Before finalizing, verify each story is independent—no story should block another.
`.trim();

export const promptPatchEngineerAgent = new Agent({
  id: "prompt-patch-engineer",
  name: "Prompt Patch Engineer",
  instructions: PATCH_ENGINEER_INSTRUCTIONS,
  model: makeJudgeModel(), // Use judge model for meta-optimization
});

// ─────────────────────────────────────────────────
// Patch Generation
// ─────────────────────────────────────────────────

export type GeneratePatchParams = {
  /** The base prompt (should not be modified) */
  basePrompt: string;
  /** The current patch (may be empty) */
  currentPatch: string;
  /** Formatted contrastive pairs context */
  pairsContext: string;
  /** Override temperature (default: env.OPT_PATCH_TEMPERATURE) */
  temperature?: number;
};

/**
 * Generate a new patch candidate based on contrastive pairs.
 *
 * Returns the raw patch text (no markdown fences).
 */
export async function generatePatchCandidate(
  params: GeneratePatchParams,
): Promise<string> {
  const {
    basePrompt,
    currentPatch,
    pairsContext,
    temperature = env.OPT_PATCH_TEMPERATURE,
  } = params;

  const prompt = [
    "## BASE PROMPT (do not rewrite)",
    "```",
    basePrompt.trim(),
    "```",
    "",
    "## CURRENT PATCH",
    "```",
    currentPatch.trim() || "(none)",
    "```",
    "",
    "## CONTRASTIVE PAIRS",
    "Analyze these pairs. GOOD outputs scored higher; BAD outputs scored lower.",
    "Your patch should push future outputs toward GOOD and away from BAD.",
    "",
    pairsContext,
    "",
    "## YOUR TASK",
    "Propose a NEW PATCH (replacing the current one) that improves the prompt.",
    "Output ONLY the patch text, no explanations.",
  ].join("\n");

  const abortSignal = AbortSignal.timeout(env.LLM_TIMEOUT_MS);
  const response = await withAiTelemetry(
    {
      name: "patch-engineer",
      model: env.LMSTUDIO_JUDGE_MODEL ?? env.LMSTUDIO_MODEL,
    },
    () =>
      promptPatchEngineerAgent.generate(prompt, {
        modelSettings: {
          temperature,
          maxOutputTokens: 1024,
        },
        abortSignal,
      }),
  );

  // Clean up the response (remove any markdown fences if present)
  let patch = response.text ?? "";
  patch = patch
    .replace(/^```[\w]*\n?/gm, "")
    .replace(/\n?```$/gm, "")
    .trim();

  return patch;
}

// ─────────────────────────────────────────────────
// Multi-Candidate Generation
// ─────────────────────────────────────────────────

/**
 * Generate multiple patch candidates for tournament selection.
 *
 * Uses slightly varying temperatures to encourage diversity.
 */
export async function generatePatchCandidates(
  params: Omit<GeneratePatchParams, "temperature">,
  count: number = env.OPT_PATCH_CANDIDATES,
): Promise<string[]> {
  const candidates: string[] = [];

  for (let i = 0; i < count; i++) {
    // Vary temperature slightly for diversity (base ± 0.1)
    const tempVariation = (i - count / 2) * 0.05;
    const temperature = Math.max(
      0.1,
      Math.min(1.5, env.OPT_PATCH_TEMPERATURE + tempVariation),
    );

    const patch = await generatePatchCandidate({ ...params, temperature });

    // Skip empty or very short patches
    if (patch.length >= 20) {
      candidates.push(patch);
    }
  }

  return candidates;
}

// ─────────────────────────────────────────────────
// Prompt Composition
// ─────────────────────────────────────────────────

/**
 * Compose a full prompt from base + patch.
 */
export function composePrompt(base: string, patch: string): string {
  const trimmedPatch = patch.trim();
  if (!trimmedPatch) return base;

  return `${base.trim()}

## PATCH SECTION (auto-generated)
${trimmedPatch}
`;
}
