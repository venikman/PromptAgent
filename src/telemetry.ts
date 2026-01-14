import { env } from "./config.ts";

type Histogram = {
  count: number;
  sum: number;
  min: number;
  max: number;
  buckets: number[];
  errors: number;
};

type TelemetryEntry = {
  key: string;
  count: number;
  errors: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p90Ms: number;
  p99Ms: number;
  inFlight: number;
};

type AiResponseEntry = {
  key: string;
  at: string;
  durationMs?: number;
  success: boolean;
  error?: string;
  preview?: string;
  previewTruncated?: boolean;
  tokenUsage?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
};

type TelemetrySnapshot = {
  type: "telemetry";
  at: string;
  periodMs: number;
  uptimeMs: number;
  http: TelemetryEntry[];
  ai: TelemetryEntry[];
  aiResponses: AiResponseEntry[];
};

const BUCKETS_MS = [
  25,
  50,
  100,
  250,
  500,
  1000,
  2500,
  5000,
  10000,
  30000,
  60000,
  120000,
];

const httpMetrics = new Map<string, Histogram>();
const aiMetrics = new Map<string, Histogram>();
const aiInFlight = new Map<string, number>();
const aiResponses = new Map<string, AiResponseEntry>();
const startedAt = Date.now();
let lastFlush = Date.now();
let reporterId: number | null = null;
const subscribers = new Set<(snapshot: TelemetrySnapshot) => void>();

const makeHistogram = (): Histogram => ({
  count: 0,
  sum: 0,
  min: Number.POSITIVE_INFINITY,
  max: 0,
  buckets: new Array(BUCKETS_MS.length + 1).fill(0),
  errors: 0,
});

const recordHistogram = (
  metrics: Map<string, Histogram>,
  key: string,
  durationMs: number,
  isError: boolean,
) => {
  const bucketIndex = BUCKETS_MS.findIndex((limit) => durationMs <= limit);
  const index = bucketIndex === -1 ? BUCKETS_MS.length : bucketIndex;
  const value = Math.max(0, Math.round(durationMs));

  const entry = metrics.get(key) ?? makeHistogram();
  const nextBuckets = entry.buckets.map((bucket, bucketIndex) =>
    bucketIndex === index ? bucket + 1 : bucket
  );
  const nextEntry: Histogram = {
    ...entry,
    count: entry.count + 1,
    sum: entry.sum + value,
    min: Math.min(entry.min, value),
    max: Math.max(entry.max, value),
    buckets: nextBuckets,
    errors: entry.errors + (isError ? 1 : 0),
  };
  metrics.set(key, nextEntry);
};

const percentile = (entry: Histogram, p: number) => {
  if (entry.count === 0) return 0;
  const target = Math.ceil(entry.count * p);
  const result = entry.buckets.reduce(
    (state, bucket, index) => {
      if (state.matched) return state;
      const seen = state.seen + bucket;
      if (seen >= target) {
        return {
          seen,
          matched: true,
          value: BUCKETS_MS[index] ?? entry.max,
        };
      }
      return {
        seen,
        matched: false,
        value: state.value,
      };
    },
    { seen: 0, matched: false, value: entry.max },
  );
  return result.matched ? result.value : entry.max;
};

const summarize = (
  metrics: Map<string, Histogram>,
  inFlight: Map<string, number>,
  limit = 25,
): TelemetryEntry[] => {
  const entries = new Map<string, TelemetryEntry>();

  for (const [key, entry] of metrics.entries()) {
    const avgMs = entry.count > 0 ? Math.round(entry.sum / entry.count) : 0;
    entries.set(key, {
      key,
      count: entry.count,
      errors: entry.errors,
      avgMs,
      minMs: entry.min === Number.POSITIVE_INFINITY ? 0 : entry.min,
      maxMs: entry.max,
      p50Ms: percentile(entry, 0.5),
      p90Ms: percentile(entry, 0.9),
      p99Ms: percentile(entry, 0.99),
      inFlight: inFlight.get(key) ?? 0,
    });
  }

  for (const [key, active] of inFlight.entries()) {
    if (!entries.has(key)) {
      entries.set(key, {
        key,
        count: 0,
        errors: 0,
        avgMs: 0,
        minMs: 0,
        maxMs: 0,
        p50Ms: 0,
        p90Ms: 0,
        p99Ms: 0,
        inFlight: active,
      });
    }
  }

  return Array.from(entries.values())
    .sort((a, b) => b.count - a.count || b.inFlight - a.inFlight)
    .slice(0, limit);
};

export const normalizePath = (pathname: string) =>
  pathname
    .replace(/\/[0-9a-fA-F-]{36}(?=\/|$)/g, "/:id")
    .replace(/\/\d+(?=\/|$)/g, "/:id");

export const recordHttpRequest = (params: {
  key: string;
  status: number;
  durationMs: number;
}) => {
  recordHistogram(
    httpMetrics,
    params.key,
    params.durationMs,
    params.status >= 500,
  );
};

const aiKey = (params: { name: string; model?: string }) =>
  params.model ? `${params.name} (${params.model})` : params.name;

const truncatePreview = (value: string, limit: number) => {
  if (limit <= 0) return { preview: undefined, truncated: false };
  if (value.length <= limit) return { preview: value, truncated: false };
  return { preview: `${value.slice(0, limit)}…`, truncated: true };
};

const summarizeAiResponses = (limit = 25): AiResponseEntry[] => {
  return Array.from(aiResponses.values())
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
};

const notifySubscribers = () => {
  if (subscribers.size === 0) return;
  const snapshot = buildSnapshot();
  for (const listener of subscribers) {
    listener(snapshot);
  }
};

const updateInFlight = (key: string, delta: number) => {
  const current = aiInFlight.get(key) ?? 0;
  const next = current + delta;
  if (next <= 0) {
    aiInFlight.delete(key);
  } else {
    aiInFlight.set(key, next);
  }
};

export const recordAiStart = (params: { name: string; model?: string }) => {
  const key = aiKey(params);
  updateInFlight(key, 1);
  notifySubscribers();
};

export const recordAiCall = (params: {
  name: string;
  model?: string;
  durationMs: number;
  success: boolean;
}) => {
  const key = aiKey(params);
  recordHistogram(aiMetrics, key, params.durationMs, !params.success);
};

export const recordAiResponse = (params: {
  name: string;
  model?: string;
  durationMs?: number;
  success: boolean;
  text?: string;
  error?: string;
  tokenUsage?: { prompt?: number; completion?: number; total?: number };
}) => {
  const key = aiKey(params);
  const text = params.text ?? "";
  const includeOutput = env.TELEMETRY_INCLUDE_LLM_OUTPUT;
  const { preview, truncated } = includeOutput
    ? truncatePreview(text, env.TELEMETRY_LLM_PREVIEW_CHARS)
    : { preview: undefined, truncated: false };

  aiResponses.set(key, {
    key,
    at: new Date().toISOString(),
    durationMs: params.durationMs,
    success: params.success,
    error: params.error,
    preview,
    previewTruncated: truncated,
    tokenUsage: params.tokenUsage,
  });
  notifySubscribers();
};

export const withAiTelemetry = async <T>(
  params: { name: string; model?: string },
  fn: () => Promise<T>,
): Promise<T> => {
  const started = performance.now();
  recordAiStart(params);
  try {
    const result = await fn();
    recordAiCall({
      name: params.name,
      model: params.model,
      durationMs: performance.now() - started,
      success: true,
    });
    updateInFlight(aiKey(params), -1);
    notifySubscribers();
    return result;
  } catch (err) {
    recordAiCall({
      name: params.name,
      model: params.model,
      durationMs: performance.now() - started,
      success: false,
    });
    updateInFlight(aiKey(params), -1);
    notifySubscribers();
    throw err;
  }
};

const buildSnapshot = (
  options?: { includeAiResponses?: boolean },
): TelemetrySnapshot => {
  const now = Date.now();
  const includeAiResponses = options?.includeAiResponses ?? true;
  return {
    type: "telemetry",
    at: new Date(now).toISOString(),
    periodMs: now - lastFlush,
    uptimeMs: now - startedAt,
    http: summarize(httpMetrics, new Map()),
    ai: summarize(aiMetrics, aiInFlight),
    aiResponses: includeAiResponses ? summarizeAiResponses() : [],
  };
};

export const getTelemetrySnapshot = () => buildSnapshot();

export const flushTelemetry = () => {
  const snapshot = buildSnapshot({ includeAiResponses: false });
  lastFlush = Date.now();
  console.log(JSON.stringify(snapshot));
};

export const startTelemetryReporter = (intervalMs = 60_000) => {
  if (reporterId !== null) return;
  reporterId = setInterval(() => flushTelemetry(), intervalMs);
};

export const subscribeTelemetry = (
  listener: (snapshot: TelemetrySnapshot) => void,
) => {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
};

export const createTelemetryStream = (signal: AbortSignal) => {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (snapshot: TelemetrySnapshot) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(snapshot)}\n\n`),
        );
      };

      const unsubscribe = subscribeTelemetry(push);
      push(buildSnapshot());

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 15000);

      cleanup = () => {
        clearInterval(keepAlive);
        unsubscribe();
      };

      signal.addEventListener(
        "abort",
        () => {
          cleanup();
          controller.close();
        },
        { once: true },
      );
    },
    cancel() {
      cleanup();
      return;
    },
  });
};
