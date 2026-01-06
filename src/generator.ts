import { Agent } from "@mastra/core/agent";
import { storyPackSchema, type Epic, type StoryPack } from "./schema.ts";
import { makeGeneratorModel } from "./models.ts";
import { env } from "./config.ts";
import crypto from "node:crypto";
import type { ExecutionTrace } from "./judge/promptagent-fpf-judge.ts";

export const baseStoryAgent = new Agent({
  id: "story-generator",
  name: "Story Generator",
  instructions: "You generate Azure DevOps user stories from epics.",
  model: makeGeneratorModel(),
});

export type GenerateResult = {
  storyPack: StoryPack | null;
  rawText: string;
  seed?: number;
  error?: string;
  trace?: ExecutionTrace;
  instructions?: string;
  gammaTime?: string;
};

export type GenerateOptions = {
  /** Optional seed for reproducible outputs (LM Studio supports this) */
  seed?: number;
  /** Override temperature (default from env.GEN_TEMPERATURE) */
  temperature?: number;
  /** Override max tokens (default from env.GEN_MAX_TOKENS) */
  maxTokens?: number;
};

/**
 * Helper to build provider-specific options including seed.
 * LM Studio accepts `seed` in the OpenAI-compatible API.
 *
 * Note: We use `as any` because the exact ProviderOptions type is complex
 * and varies by Mastra version. The openai.seed option is valid for LM Studio.
 */
function buildProviderOptions(seed?: number): any {
  if (seed === undefined) return undefined;
  // Mastra passes providerOptions through to the underlying provider
  return { openai: { seed } };
}

type MinimalUsage = {
  inputTokens?: unknown;
  outputTokens?: unknown;
  totalTokens?: unknown;
};

type MinimalStep = {
  usage?: MinimalUsage;
  response?: { modelId?: string };
  finishReason?: string;
};

function coerceTokenCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const rounded = Math.floor(value);
  return rounded >= 0 ? rounded : undefined;
}

function normalizeTokenUsage(usage?: MinimalUsage) {
  const prompt = coerceTokenCount(usage?.inputTokens);
  const completion = coerceTokenCount(usage?.outputTokens);
  const total = coerceTokenCount(usage?.totalTokens);
  if (prompt === undefined && completion === undefined && total === undefined) return undefined;
  return { prompt, completion, total };
}

function buildExecutionTrace(
  response: { traceId?: string; steps?: MinimalStep[] },
  startedAt: string,
  endedAt: string
): ExecutionTrace {
  const runId = response.traceId ?? crypto.randomUUID();
  const steps =
    response.steps?.map((step, index) => ({
      id: `${runId}-step-${index + 1}`,
      kind: "llm_call" as const,
      name: step.response?.modelId ?? step.finishReason ?? undefined,
      tokenUsage: normalizeTokenUsage(step.usage),
    })) ?? [];

  return { runId, startedAt, endedAt, steps };
}

export async function generateStoryPack(
  epic: Epic,
  candidatePrompt: string,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const { seed, temperature = env.GEN_TEMPERATURE, maxTokens = env.GEN_MAX_TOKENS } = options;

  const messages = [
    {
      role: "user" as const,
      content: [
        "Epic (JSON):",
        "```json",
        JSON.stringify(epic, null, 2),
        "```",
      ].join("\n"),
    },
  ];

  const startedAt = new Date().toISOString();
  const gammaTime = startedAt;
  let storyPack: StoryPack | null = null;
  let rawText = "";
  let error: string | undefined;
  let trace: ExecutionTrace | undefined;
  let response: Awaited<ReturnType<typeof baseStoryAgent.generate>> | undefined;

  try {
    response = await baseStoryAgent.generate(messages, {
      instructions: candidatePrompt,
      structuredOutput: {
        schema: storyPackSchema,
        jsonPromptInjection: true,
        errorStrategy: "strict",
      },
      modelSettings: {
        temperature,
        maxOutputTokens: maxTokens,
      },
      providerOptions: buildProviderOptions(seed),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error = message;
  }

  const endedAt = new Date().toISOString();

  if (response) {
    rawText = response.text;
    const parsed = storyPackSchema.safeParse(response.object);
    if (parsed.success) {
      storyPack = parsed.data;
    } else {
      storyPack = null;
      error = error ?? "Structured output validation failed.";
    }
    trace = buildExecutionTrace(response, startedAt, endedAt);
  }

  return {
    storyPack,
    rawText,
    seed,
    error,
    trace,
    instructions: candidatePrompt,
    gammaTime,
  };
}
