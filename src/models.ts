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

function getEnv(key: string): string | undefined {
  return Deno.env.get(key);
}

function getEnvWithFallback(
  primaryKey: string,
  fallbackKeys: string[],
  defaultValue: string,
): string {
  const primaryValue = getEnv(primaryKey);
  if (primaryValue) return primaryValue;
  for (const key of fallbackKeys) {
    const value = getEnv(key);
    if (value) return value;
  }
  return defaultValue;
}

export function makeGeneratorModel(): ModelConfig {
  const modelId = getEnvWithFallback(
    "LMSTUDIO_MODEL",
    ["LLM_MODEL"],
    "openai/gpt-oss-120b",
  );
  return {
    url: getEnvWithFallback(
      "LMSTUDIO_BASE_URL",
      ["LLM_BASE_URL", "LLM_API_BASE_URL"],
      "http://127.0.0.1:1234/v1",
    ),
    id: `lmstudio/${modelId}` as const,
    apiKey: getEnvWithFallback("LMSTUDIO_API_KEY", ["LLM_API_KEY"], "lm-studio"),
  };
}

export function makeJudgeModel(): ModelConfig {
  const judgeModel = getEnv("LMSTUDIO_JUDGE_MODEL") ?? getEnv("LLM_JUDGE_MODEL");
  const generatorModel = getEnvWithFallback(
    "LMSTUDIO_MODEL",
    ["LLM_MODEL"],
    "openai/gpt-oss-120b",
  );
  const modelId = judgeModel ?? generatorModel;

  return {
    url: getEnvWithFallback(
      "LMSTUDIO_BASE_URL",
      ["LLM_BASE_URL", "LLM_API_BASE_URL"],
      "http://127.0.0.1:1234/v1",
    ),
    id: `lmstudio/${modelId}` as const,
    apiKey: getEnvWithFallback("LMSTUDIO_API_KEY", ["LLM_API_KEY"], "lm-studio"),
  };
}
