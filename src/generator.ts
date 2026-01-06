import { Agent } from "npm:@mastra/core@0.24.9/agent";
import { storyPackSchema, type Epic, type StoryPack } from "./schema.ts";
import { makeGeneratorModel } from "./models.ts";
import { env } from "./config.ts";
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
  instructions: string;
  trace: ExecutionTrace | null;
  gammaTime?: string;
  seed?: number;
  error?: string;
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

type ProviderUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

const normalizeTokenUsage = (usage?: ProviderUsage) => {
  if (!usage) return undefined;
  const prompt = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined;
  const completion =
    typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined;
  const total = typeof usage.total_tokens === "number" ? usage.total_tokens : undefined;

  if (prompt === undefined && completion === undefined && total === undefined) return undefined;
  return { prompt, completion, total };
};

export async function generateStoryPack(
  epic: Epic,
  candidatePrompt: string,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const { seed, temperature = env.GEN_TEMPERATURE, maxTokens = env.GEN_MAX_TOKENS } = options;
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

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

  let storyPack: StoryPack | null = null;
  let rawText = "";
  let error: string | undefined;
  let endedAt = startedAt;
  const steps: ExecutionTrace["steps"] = [];

  try {
    const response = await baseStoryAgent.generate(messages, {
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

    endedAt = new Date().toISOString();
    const responseMetadata = (response as Record<string, unknown>).metadata;
    const rawUsage =
      responseMetadata && typeof responseMetadata === "object"
        ? (responseMetadata as { usage?: unknown }).usage
        : undefined;
    const usage = normalizeTokenUsage(rawUsage as ProviderUsage | undefined);

    const parsed = storyPackSchema.safeParse(response.object);
    if (parsed.success) {
      storyPack = parsed.data;
    } else {
      storyPack = null;
      error = error ?? "Structured output validation failed.";
    }
    rawText = response.text;
    steps.push({
      id: `${runId}-llm`,
      kind: "llm_call",
      name: "story-generator",
      input: { epicId: epic.id, seed, temperature, maxTokens },
      output: response.text,
      tokenUsage: usage,
      startedAt,
      endedAt,
    });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    endedAt = new Date().toISOString();
    steps.push({
      id: `${runId}-error`,
      kind: "note",
      name: "generation-error",
      input: { epicId: epic.id, seed, temperature, maxTokens },
      output: { error },
      startedAt,
      endedAt,
    });
  }

  const trace: ExecutionTrace = {
    runId,
    startedAt,
    endedAt,
    steps,
  };

  return {
    storyPack,
    rawText,
    instructions: candidatePrompt,
    trace,
    gammaTime: startedAt,
    seed,
    error,
  };
}
