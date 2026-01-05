/**
 * LM Studio model configuration for Mastra agents.
 *
 * Uses OpenAI-compatible API provided by LM Studio.
 * Configure via environment variables:
 *   LMSTUDIO_BASE_URL - API endpoint (default: http://127.0.0.1:1234/v1)
 *   LMSTUDIO_API_KEY  - API key (default: lm-studio, usually not required)
 *   LMSTUDIO_MODEL    - Model ID for generation
 *   LMSTUDIO_JUDGE_MODEL - Model ID for scoring (can differ from generator)
 */

export type ModelConfig = {
  url: string;
  id: `${string}/${string}`;
  apiKey: string;
};

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export function makeGeneratorModel(): ModelConfig {
  const modelId = getEnv("LMSTUDIO_MODEL", "openai/gpt-oss-20b");
  return {
    url: getEnv("LMSTUDIO_BASE_URL", "http://127.0.0.1:1234/v1"),
    id: `lmstudio/${modelId}` as const,
    apiKey: getEnv("LMSTUDIO_API_KEY", "lm-studio"),
  };
}

export function makeJudgeModel(): ModelConfig {
  const judgeModel = process.env.LMSTUDIO_JUDGE_MODEL;
  const generatorModel = getEnv("LMSTUDIO_MODEL", "openai/gpt-oss-20b");
  const modelId = judgeModel ?? generatorModel;

  return {
    url: getEnv("LMSTUDIO_BASE_URL", "http://127.0.0.1:1234/v1"),
    id: `lmstudio/${modelId}` as const,
    apiKey: getEnv("LMSTUDIO_API_KEY", "lm-studio"),
  };
}
