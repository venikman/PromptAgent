/**
 * LLM model configuration for Mastra agents.
 *
 * LMSTUDIO_* values resolve to LM Studio locally and OpenRouter on deploy
 * (see src/config.ts).
 */

import { env } from "./config.ts";

export type ModelConfig = {
  url: string;
  id: `${string}/${string}`;
  apiKey: string;
};

export function makeGeneratorModel(): ModelConfig {
  return {
    url: env.LMSTUDIO_BASE_URL,
    id: `lmstudio/${env.LMSTUDIO_MODEL}` as const,
    apiKey: env.LMSTUDIO_API_KEY,
  };
}

export function makeJudgeModel(): ModelConfig {
  return {
    url: env.LMSTUDIO_BASE_URL,
    id: `lmstudio/${env.LMSTUDIO_JUDGE_MODEL ?? env.LMSTUDIO_MODEL}` as const,
    apiKey: env.LMSTUDIO_API_KEY,
  };
}
