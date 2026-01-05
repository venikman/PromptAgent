import { Agent } from "@mastra/core/agent";
import { storyPackSchema, type Epic, type StoryPack } from "../schema.ts";
import { makeGeneratorModel } from "../models.ts";
import { env } from "../../config.ts";

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

    return {
      storyPack: response.object as StoryPack,
      rawText: response.text,
      seed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      storyPack: null,
      rawText: "",
      seed,
      error: message,
    };
  }
}
