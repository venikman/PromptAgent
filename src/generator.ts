import { Agent } from "@mastra/core/agent";
import { type Epic, type StoryPack, storyPackSchema } from "./schema.ts";
import { makeGeneratorModel } from "./models.ts";
import { env } from "./config.ts";
import { recordAiResponse, withAiTelemetry } from "./telemetry.ts";
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

type ValidationFailure = {
  message: string;
  issues: string[];
};

/**
 * Helper to build provider-specific options including seed.
 * LM Studio accepts `seed` in the OpenAI-compatible API.
 *
 * Note: The exact ProviderOptions type varies by Mastra version; a loose
 * JSON-compatible shape keeps this portable while still type-safe.
 */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

type ProviderOptionsLike = Record<string, Record<string, JsonValue>>;

function buildProviderOptions(
  seed?: number,
): ProviderOptionsLike | undefined {
  if (seed === undefined) return undefined;
  // Mastra passes providerOptions through to the underlying provider
  return { openai: { seed } };
}

type ProviderUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

const normalizeTokenUsage = (usage?: ProviderUsage) => {
  if (!usage) return undefined;
  const prompt = typeof usage.prompt_tokens === "number"
    ? usage.prompt_tokens
    : typeof usage.inputTokens === "number"
    ? usage.inputTokens
    : undefined;
  const completion = typeof usage.completion_tokens === "number"
    ? usage.completion_tokens
    : typeof usage.outputTokens === "number"
    ? usage.outputTokens
    : undefined;
  const total = typeof usage.total_tokens === "number"
    ? usage.total_tokens
    : typeof usage.totalTokens === "number"
    ? usage.totalTokens
    : undefined;

  if (prompt === undefined && completion === undefined && total === undefined) {
    return undefined;
  }
  return { prompt, completion, total };
};

const extractJsonCandidate = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return null;
};

const formatZodIssues = (issues: { path: PropertyKey[]; message: string }[]) =>
  issues.map((issue) => {
    const path = issue.path.length
      ? issue.path.map((part) => String(part)).join(".")
      : "(root)";
    return `${path}: ${issue.message}`;
  });

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? value as Record<string, unknown> : null;

const extractTextFromContent = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      const record = asRecord(part);
      return record && typeof record.text === "string" ? record.text : "";
    }).join("");
  }
  const record = asRecord(content);
  if (record && Array.isArray(record.parts)) {
    return extractTextFromContent(record.parts);
  }
  return "";
};

const extractTextFromMessage = (message: unknown): string => {
  const record = asRecord(message);
  if (!record) return "";
  if (record.content !== undefined) {
    return extractTextFromContent(record.content);
  }
  if (record.parts !== undefined) {
    return extractTextFromContent(record.parts);
  }
  return "";
};

const extractTextFromMessages = (messages: unknown[]): string => {
  if (messages.length === 0) return "";
  const assistant = [...messages].reverse().find((message) => {
    const record = asRecord(message);
    return record && record.role === "assistant";
  });
  const target = assistant ?? messages[messages.length - 1];
  return extractTextFromMessage(target);
};

const extractTextFromResponsePayload = (payload: unknown): string => {
  const record = asRecord(payload);
  if (!record) return "";
  const uiMessages = record.uiMessages;
  if (Array.isArray(uiMessages)) {
    const text = extractTextFromMessages(uiMessages);
    if (text.trim()) return text;
  }
  const messages = record.messages;
  if (Array.isArray(messages)) {
    return extractTextFromMessages(messages);
  }
  return "";
};

const extractStructuredOutputFromMessage = (message: unknown): unknown => {
  const record = asRecord(message);
  if (!record) return undefined;
  if (record.structuredOutput !== undefined) {
    return record.structuredOutput;
  }
  const content = asRecord(record.content);
  if (content && content.structuredOutput !== undefined) {
    return content.structuredOutput;
  }
  return undefined;
};

const extractResponseObject = (response: Record<string, unknown>): unknown => {
  if (response.object !== undefined) return response.object;
  const payload = asRecord(response.response);
  if (!payload) return undefined;
  const uiMessages = payload.uiMessages;
  if (Array.isArray(uiMessages)) {
    for (let i = uiMessages.length - 1; i >= 0; i -= 1) {
      const structured = extractStructuredOutputFromMessage(uiMessages[i]);
      if (structured !== undefined) return structured;
    }
  }
  const messages = payload.messages;
  if (Array.isArray(messages)) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const structured = extractStructuredOutputFromMessage(messages[i]);
      if (structured !== undefined) return structured;
    }
  }
  return undefined;
};

const extractResponseText = (response: Record<string, unknown>): string => {
  const direct = typeof response.text === "string" ? response.text : "";
  if (direct.trim()) return direct;
  const payloadText = extractTextFromResponsePayload(response.response);
  return payloadText || direct;
};

const safeStringify = (value: unknown): string => {
  if (value === undefined) return "";
  if (value === null) return "null";
  try {
    const json = JSON.stringify(value, null, 2);
    if (typeof json === "string") return json;
  } catch {
    // Fall through to inspect/string.
  }
  try {
    if (typeof Deno !== "undefined" && typeof Deno.inspect === "function") {
      return Deno.inspect(value, { depth: 6, colors: false });
    }
  } catch {
    // Ignore inspect failures.
  }
  return String(value);
};

const parseStoryPack = (value: unknown): { storyPack: StoryPack | null; error?: ValidationFailure } => {
  const parsed = storyPackSchema.safeParse(value);
  if (parsed.success) {
    return { storyPack: parsed.data };
  }

  return {
    storyPack: null,
    error: {
      message: "Structured output validation failed.",
      issues: formatZodIssues(parsed.error.issues),
    },
  };
};

export async function generateStoryPack(
  epic: Epic,
  candidatePrompt: string,
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const {
    seed,
    temperature = env.GEN_TEMPERATURE,
    maxTokens = env.GEN_MAX_TOKENS,
  } = options;
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
  let usage: { prompt?: number; completion?: number; total?: number } | undefined;
  let endedAt = startedAt;
  const steps: ExecutionTrace["steps"] = [];

  try {
    const abortSignal = AbortSignal.timeout(env.LLM_TIMEOUT_MS);
    const response = await withAiTelemetry(
      { name: "story-generator", model: env.LMSTUDIO_MODEL },
      () =>
        baseStoryAgent.generate(messages, {
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
          abortSignal,
        }),
    );

    endedAt = new Date().toISOString();
    const responseRecord = response as Record<string, unknown>;
    const rawUsage = responseRecord.usage ??
      responseRecord.totalUsage ??
      (asRecord(responseRecord.metadata)?.usage);
    usage = normalizeTokenUsage(rawUsage as ProviderUsage | undefined);

    const responseObject = extractResponseObject(responseRecord);
    const responseText = extractResponseText(responseRecord);
    const fallbackText = safeStringify(responseObject);
    rawText = responseText || fallbackText;
    if (!rawText) {
      rawText = safeStringify(responseRecord.response);
    }
    if (!rawText) {
      rawText = safeStringify(responseRecord);
    }

    let validation = parseStoryPack(responseObject);
    if (!validation.storyPack) {
      const candidate = extractJsonCandidate(responseText);
      if (candidate) {
        try {
          const parsedCandidate = JSON.parse(candidate);
          validation = parseStoryPack(parsedCandidate);
        } catch {
          // Keep validation error from the first attempt.
        }
      }
    }

    storyPack = validation.storyPack;
    if (!storyPack && validation.error) {
      const issue = validation.error.issues[0];
      error = issue
        ? `${validation.error.message} ${issue}`
        : validation.error.message;
    }
    const responseError = responseRecord.error;
    if (!storyPack && !rawText && responseError instanceof Error) {
      error = responseError.message;
    }
    steps.push({
      id: `${runId}-llm`,
      kind: "llm_call",
      name: "story-generator",
      input: { epicId: epic.id, seed, temperature, maxTokens },
      output: rawText || responseText,
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

  const durationMs = Date.parse(endedAt) - Date.parse(startedAt);
  recordAiResponse({
    name: "story-generator",
    model: env.LMSTUDIO_MODEL,
    durationMs: Number.isFinite(durationMs) ? durationMs : undefined,
    success: !error,
    text: rawText,
    error,
    tokenUsage: usage,
  });

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
