// Import PromptAgent modules
import { evalPromptDistribution, type PromptDistReport } from "../eval.ts";
import {
  type ContrastPair,
  formatPairsForPrompt,
  mineContrastivePairs,
  type ScoredOutput,
} from "../pairMining.ts";
import { composePrompt, generatePatchCandidates } from "../patchEngineer.ts";
import { createStoryDecompositionScorer } from "../scorer.ts";
import type { Epic, StoryPack } from "../schema.ts";

// Import orchestrator for v2 endpoints
import {
  completeTask,
  completeTaskIteration,
  createOptimizationTask,
  createTask,
  failTask,
  getOptimizationTask,
  getTask,
  type IterationResult,
  kvStore,
  // Streaming optimization imports
  type OptimizationTask,
  Orchestrator,
  runOptimizationLoop,
  saveOptimizationTask,
  updateTaskEvalProgress,
  updateTaskProgress,
  updateTaskStep,
  updateTaskTournamentProgress,
} from "../orchestrator/index.ts";

import { env } from "../config.ts";
import { getTelemetrySnapshot } from "../telemetry.ts";
import { parseAcceptanceCriteria } from "../utils/acceptanceCriteria.ts";

// Create scorer instance (reused across requests)
const scorer = createStoryDecompositionScorer();

export type ApiConfig = {
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  dataRoot: string;
  promptsRoot: string;
};

let LLM_BASE_URL = "";
let LLM_API_KEY = "";
let LLM_MODEL = "";
let DATA_ROOT = "";
let PROMPTS_ROOT = "";

const MIN_MAX_TOKENS = 100;
const MAX_MAX_TOKENS = 16384;

const normalizeMaxTokens = (value: unknown): number | undefined => {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  const normalized = Math.floor(value);
  if (normalized < MIN_MAX_TOKENS || normalized > MAX_MAX_TOKENS) {
    return undefined;
  }
  return normalized;
};

// ─────────────────────────────────────────────────
// Async Task Store (in-memory for demo)
// ─────────────────────────────────────────────────

type EvalTask = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: { completed: number; total: number };
  report?: PromptDistReport;
  error?: string;
  startedAt: string;
  completedAt?: string;
};

const evalTasks = new Map<string, EvalTask>();

// ─────────────────────────────────────────────────
// Tournament Task Store
// ─────────────────────────────────────────────────

type TournamentCandidateResult = {
  id: string;
  name: string;
  patch: string;
  objective: number;
  passRate: number;
  meanScore: number;
  p10Score: number;
  isChampion: boolean;
  deltaVsChampion: number;
  runsCompleted: number;
  totalRuns: number;
  report?: PromptDistReport;
};

type TournamentTask = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: {
    candidateIdx: number;
    totalCandidates: number;
    runsCompleted: number;
    totalRuns: number;
  };
  candidates: TournamentCandidateResult[];
  championObjective: number;
  winner?: { id: string; objective: number; deltaVsChampion: number };
  error?: string;
  startedAt: string;
  completedAt?: string;
};

const tournamentTasks = new Map<string, TournamentTask>();

// ─────────────────────────────────────────────────
// Streaming Optimization Task Store (V3)
// ─────────────────────────────────────────────────

const optimizationTasks = new Map<string, OptimizationTask>();
const optimizationTaskLastPersisted = new Map<string, number>();
const OPTIMIZATION_PERSIST_INTERVAL_MS = 2_000;
const TASK_TTL_MS = 60 * 60 * 1000;
const TASK_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let taskCleanupScheduled = false;

const cleanupOldTasks = <T extends { completedAt?: string }>(
  store: Map<string, T>,
  ttlMs: number,
) => {
  const now = Date.now();
  for (const [id, task] of store) {
    if (!task.completedAt) continue;
    const completedTime = Date.parse(task.completedAt);
    if (!Number.isFinite(completedTime)) continue;
    if (now - completedTime > ttlMs) {
      store.delete(id);
    }
  }
};

const persistOptimizationTask = async (
  task: OptimizationTask,
  force = false,
) => {
  const now = Date.now();
  if (!force) {
    const lastPersisted = optimizationTaskLastPersisted.get(task.id) ?? 0;
    if (now - lastPersisted < OPTIMIZATION_PERSIST_INTERVAL_MS) {
      return;
    }
  }
  optimizationTaskLastPersisted.set(task.id, now);
  await saveOptimizationTask(task);
};

const queuePersistOptimizationTask = (
  task: OptimizationTask,
  force = false,
) => {
  void persistOptimizationTask(task, force).catch((err) => {
    console.warn("Failed to persist optimization task", err);
  });
};

const scheduleTaskCleanup = () => {
  if (taskCleanupScheduled) return;
  taskCleanupScheduled = true;
  setInterval(() => {
    cleanupOldTasks(evalTasks, TASK_TTL_MS);
    cleanupOldTasks(tournamentTasks, TASK_TTL_MS);
    cleanupOldTasks(optimizationTasks, TASK_TTL_MS);
    for (const taskId of optimizationTaskLastPersisted.keys()) {
      if (!optimizationTasks.has(taskId)) {
        optimizationTaskLastPersisted.delete(taskId);
      }
    }
  }, TASK_CLEANUP_INTERVAL_MS);
};

scheduleTaskCleanup();

// Scorer result type (mastra/core doesn't export intermediate step types)
type ScorerResultWithSteps = {
  score: number;
  reason: string;
  results?: {
    preprocessStepResult?: {
      fpfJudgeResult?: {
        info?: {
          gateDecision?: "pass" | "degrade" | "block" | "abstain";
          subscores?: {
            correctness?: number;
            completeness?: number;
            processQuality?: number;
            safety?: number;
          };
        };
      };
    };
  };
};

// ─────────────────────────────────────────────────
// Data paths
// ─────────────────────────────────────────────────

// Cached data
let cachedEpics: unknown[] | null = null;
let cachedChampion: { base: string; patch: string; composed: string } | null =
  null;

// Cached orchestrator (lazy initialized)
let cachedOrchestrator: Orchestrator | null = null;

async function loadEpics(): Promise<unknown[]> {
  if (cachedEpics) return cachedEpics;
  try {
    const text = await Deno.readTextFile(`${DATA_ROOT}/epics.eval.json`);
    cachedEpics = JSON.parse(text);
    return cachedEpics!;
  } catch {
    return [];
  }
}

async function loadChampionPrompt(): Promise<{
  base: string;
  patch: string;
  composed: string;
}> {
  if (cachedChampion) return cachedChampion;
  try {
    const [base, patch, composed] = await Promise.all([
      Deno.readTextFile(`${PROMPTS_ROOT}/champion.base.md`).catch(() => ""),
      Deno.readTextFile(`${PROMPTS_ROOT}/champion.patch.md`).catch(() => ""),
      Deno.readTextFile(`${PROMPTS_ROOT}/champion.md`).catch(() => ""),
    ]);
    cachedChampion = {
      base: base.trim(),
      patch: patch.trim(),
      composed: composed.trim(),
    };
    return cachedChampion;
  } catch {
    return { base: "", patch: "", composed: "" };
  }
}

/**
 * Get or create the orchestrator instance.
 * Uses lazy initialization to avoid startup delays.
 */
async function getOrchestrator(): Promise<Orchestrator> {
  if (!cachedOrchestrator) {
    const epics = (await loadEpics()) as Epic[];
    const champion = await loadChampionPrompt();
    cachedOrchestrator = new Orchestrator({
      epics,
      champion: { base: champion.base, patch: champion.patch },
    });
  }
  return cachedOrchestrator;
}

const corsBaseHeaders = {
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

const rawCorsAllowedOrigins = env.CORS_ALLOWED_ORIGINS
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const corsAllowlist = rawCorsAllowedOrigins.filter((origin) => origin !== "*");

const isDeployed = Boolean(Deno.env.get("DENO_DEPLOYMENT_ID"));
const allowAllOrigins = !isDeployed &&
  (rawCorsAllowedOrigins.length === 0 || rawCorsAllowedOrigins.includes("*"));

const resolveCorsOrigin = (origin: string | null, requestUrl: string) => {
  if (allowAllOrigins) return "*";
  if (!origin) return null;
  if (corsAllowlist.length === 0) {
    const requestOrigin = new URL(requestUrl).origin;
    return origin === requestOrigin ? origin : null;
  }
  return corsAllowlist.includes(origin) ? origin : null;
};

const applyCorsHeaders = (response: Response, origin: string | null) => {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsBaseHeaders)) {
    headers.set(key, value);
  }
  if (origin) {
    headers.set("access-control-allow-origin", origin);
    if (origin !== "*") {
      headers.append("vary", "Origin");
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });

const safeJson = (text: string) => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

type LlmChatMessage = {
  content?: string;
  reasoning_content?: string;
  reasoningContent?: string;
};

const extractChatMessageText = (message?: LlmChatMessage): string => {
  if (!message) return "";
  const content = typeof message.content === "string" ? message.content : "";
  if (content.trim()) return content;
  if (typeof message.reasoning_content === "string") {
    return message.reasoning_content;
  }
  if (typeof message.reasoningContent === "string") {
    return message.reasoningContent;
  }
  return content;
};

type GenerateRequest = {
  prompt?: string;
  model?: string;
  system?: string;
  options?: Record<string, unknown>;
};

export function createApiHandler(config: ApiConfig) {
  LLM_BASE_URL = config.llmBaseUrl;
  LLM_API_KEY = config.llmApiKey;
  LLM_MODEL = config.llmModel;
  DATA_ROOT = config.dataRoot;
  PROMPTS_ROOT = config.promptsRoot;
  cachedEpics = null;
  cachedChampion = null;
  cachedOrchestrator = null;

  return async (req: Request) => {
    const corsOrigin = resolveCorsOrigin(req.headers.get("origin"), req.url);
    const response = await (async () => {
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204 });
      }

      const url = new URL(req.url);

      if (url.pathname === "/health") {
        return jsonResponse({ status: "ok", time: new Date().toISOString() });
      }

      // Debug endpoint - shows LLM config (key is redacted for security)
      if (url.pathname === "/debug/config") {
        return jsonResponse({
          llm: {
            baseUrl: LLM_BASE_URL,
            model: LLM_MODEL,
            hasKey: !!LLM_API_KEY,
            keyLength: LLM_API_KEY.length,
          },
        });
      }

      if (url.pathname === "/telemetry" && req.method === "GET") {
        return jsonResponse(getTelemetrySnapshot());
      }

      // ─────────────────────────────────────────────────
      // New API endpoints for PromptAgent UI
      // ─────────────────────────────────────────────────

      if (url.pathname === "/epics" && req.method === "GET") {
        const epics = await loadEpics();
        return jsonResponse({ epics });
      }

      if (url.pathname === "/champion" && req.method === "GET") {
        const champion = await loadChampionPrompt();
        return jsonResponse(champion);
      }

      if (url.pathname === "/champion" && req.method === "POST") {
        // Save a new champion prompt
        let payload: { composed: string } | null = null;
        try {
          payload = await req.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const newComposed = payload?.composed?.trim();
        if (!newComposed) {
          return jsonResponse({ error: "composed prompt is required" }, 400);
        }

        try {
          // Create versions directory if it doesn't exist
          const versionsDir = `${PROMPTS_ROOT}/versions`;
          try {
            await Deno.mkdir(versionsDir, { recursive: true });
          } catch {
            /* ignore if exists */
          }

          // Backup current champion with timestamp
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const currentChampion = await loadChampionPrompt();
          if (currentChampion.composed) {
            await Deno.writeTextFile(
              `${versionsDir}/champion.${timestamp}.md`,
              currentChampion.composed,
            );
          }

          const patchMarker = "## PATCH SECTION (auto-generated)";
          const markerIndex = newComposed.indexOf(patchMarker);
          let nextBase = newComposed;
          let nextPatch = "";

          if (markerIndex !== -1) {
            nextBase = newComposed.slice(0, markerIndex).trim();
            nextPatch = newComposed.slice(markerIndex + patchMarker.length)
              .trim();
          }

          // Save new champion prompt and keep base/patch in sync
          const normalizedComposed = composePrompt(nextBase, nextPatch);
          await Promise.all([
            Deno.writeTextFile(
              `${PROMPTS_ROOT}/champion.md`,
              normalizedComposed,
            ),
            Deno.writeTextFile(`${PROMPTS_ROOT}/champion.base.md`, nextBase),
            Deno.writeTextFile(`${PROMPTS_ROOT}/champion.patch.md`, nextPatch),
          ]);

          // Clear caches so next load gets fresh data
          cachedChampion = null;
          cachedOrchestrator = null;

          // Load and return the updated champion
          const updated = await loadChampionPrompt();
          return jsonResponse({
            success: true,
            champion: updated,
            backupFile: currentChampion.composed
              ? `champion.${timestamp}.md`
              : null,
          });
        } catch (err) {
          return jsonResponse(
            {
              error: `Failed to save champion: ${
                err instanceof Error ? err.message : String(err)
              }`,
            },
            500,
          );
        }
      }

      if (url.pathname === "/champion/versions" && req.method === "GET") {
        // List available prompt versions
        try {
          const versionsDir = `${PROMPTS_ROOT}/versions`;
          const versions: { name: string; timestamp: string }[] = [];

          for await (const entry of Deno.readDir(versionsDir)) {
            if (
              entry.isFile &&
              entry.name.startsWith("champion.") &&
              entry.name.endsWith(".md")
            ) {
              // Extract timestamp from filename: champion.2024-01-15T10-30-00-000Z.md
              const match = entry.name.match(/champion\.(.+)\.md$/);
              const timestamp = match?.[1];
              if (timestamp) {
                versions.push({
                  name: entry.name,
                  timestamp: timestamp
                    .replace(/-/g, ":")
                    .replace("T", " ")
                    .slice(0, -1), // Approximate restore
                });
              }
            }
          }

          // Sort by filename (timestamp) descending
          versions.sort((a, b) => b.name.localeCompare(a.name));

          return jsonResponse({ versions });
        } catch (err) {
          console.error("Failed to list champion versions:", err);
          return jsonResponse({ versions: [] });
        }
      }

      if (url.pathname === "/generate-story" && req.method === "POST") {
        // Uses LM Studio's OpenAI-compatible API
        let payload: {
          epicId?: string;
          promptOverride?: string;
          seed?: number;
        } | null = null;
        try {
          payload = await req.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const epicId = payload?.epicId;
        if (!epicId) {
          return jsonResponse({ error: "epicId is required" }, 400);
        }

        // Find the epic
        const epics = await loadEpics();
        const epic = (epics as Array<{ id: string }>).find((e) =>
          e.id === epicId
        );
        if (!epic) {
          return jsonResponse({ error: `Epic not found: ${epicId}` }, 404);
        }

        // Get prompt
        const champion = await loadChampionPrompt();
        const systemPrompt = payload?.promptOverride || champion.composed;

        // Build the user message
        const userMessage = [
          "Epic (JSON):",
          "```json",
          JSON.stringify(epic, null, 2),
          "```",
        ].join("\n");

        const model = LLM_MODEL;

        // Call LM Studio (OpenAI-compatible chat completions API)
        const requestBody = {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          temperature: 0.3,
          max_tokens: -1,
          stream: false,
        };

        try {
          const headers: Record<string, string> = {
            "content-type": "application/json",
          };
          if (LLM_API_KEY) {
            headers["authorization"] = `Bearer ${LLM_API_KEY}`;
          }

          const timeoutMs = env.LLM_TIMEOUT_MS;
          const upstream = await fetch(
            `${LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`,
            {
              method: "POST",
              headers,
              body: JSON.stringify(requestBody),
              signal: AbortSignal.timeout(timeoutMs),
            },
          );

          const raw = await upstream.text();
          if (!upstream.ok) {
            return jsonResponse(
              {
                error: "llm_error",
                status: upstream.status,
                detail: safeJson(raw),
              },
              upstream.status,
            );
          }

          // OpenAI format: { choices: [{ message: { content: "..." } }] }
          const data = safeJson(raw) as {
            choices?: Array<{ message?: LlmChatMessage }>;
          };
          const rawText = extractChatMessageText(data?.choices?.[0]?.message);

          // Try to parse the response as JSON
          let storyPack = null;
          let parseError: string | undefined;
          try {
            // Find JSON in the response (might be wrapped in markdown code blocks)
            // Priority: 1) ```json blocks, 2) raw JSON starting with [ or {
            let jsonStr = "";

            const jsonBlockMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
            const jsonBlock = jsonBlockMatch?.[1];
            if (jsonBlock) {
              jsonStr = jsonBlock;
            } else {
              // Try to find raw JSON - use non-greedy match and validate
              // First try to find a JSON array or object at the start (most common)
              const trimmed = rawText.trim();
              if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
                jsonStr = trimmed;
              } else {
                // Find the first [ or { and try to parse from there
                const arrayStart = rawText.indexOf("[");
                const objStart = rawText.indexOf("{");
                const startIdx = arrayStart === -1
                  ? objStart
                  : objStart === -1
                  ? arrayStart
                  : Math.min(arrayStart, objStart);
                if (startIdx !== -1) {
                  jsonStr = rawText.slice(startIdx);
                } else {
                  jsonStr = rawText;
                }
              }
            }

            const parsed = JSON.parse(jsonStr.trim());

            // Transform LLM output to UI-expected format
            // LLM returns array of ADO items, UI expects { epicId, epicTitle, userStories, ... }
            if (Array.isArray(parsed)) {
              storyPack = {
                epicId: epicId,
                epicTitle: (epic as { title?: string }).title ??
                  "Generated Stories",
                userStories: parsed.map((item: Record<string, unknown>) => {
                  // Parse "As a X, I want Y, so that Z" from description
                  const desc = String(item["System.Description"] ?? "");
                  const asAMatch = desc.match(/\*\*As a\*\*\s*([^,*]+)/i) ||
                    desc.match(/As a\s+([^,]+)/i);
                  const iWantMatch = desc.match(/\*\*I want\*\*\s*([^,*]+)/i) ||
                    desc.match(/I want\s+([^,]+)/i);
                  const soThatMatch =
                    desc.match(/\*\*so that\*\*\s*([^,*]+)/i) ||
                    desc.match(/so that\s+(.+)/i);

                  // Parse acceptance criteria (handles GWT, numbered, bullet formats)
                  const acRaw = String(
                    item["Microsoft.VSTS.Common.AcceptanceCriteria"] ?? "",
                  );
                  const acceptanceCriteria = parseAcceptanceCriteria(acRaw);

                  return {
                    title: item["System.Title"] ?? "Untitled",
                    asA: asAMatch?.[1]?.trim() ?? "",
                    iWant: iWantMatch?.[1]?.trim() ?? "",
                    soThat: soThatMatch?.[1]?.trim() ?? "",
                    acceptanceCriteria,
                    ado: {
                      fields: {
                        "System.Title": item["System.Title"],
                        "System.Description": item["System.Description"],
                        "Microsoft.VSTS.Common.AcceptanceCriteria":
                          item["Microsoft.VSTS.Common.AcceptanceCriteria"],
                        "Microsoft.VSTS.Scheduling.StoryPoints":
                          item["StoryPoints"] ??
                            item["Microsoft.VSTS.Scheduling.StoryPoints"],
                      },
                    },
                  };
                }),
                assumptions: [],
                risks: [],
                followUps: [],
              };
            } else if (parsed && typeof parsed === "object") {
              // Already in expected format or close to it
              storyPack = {
                epicId: parsed.epicId ?? epicId,
                epicTitle: parsed.epicTitle ??
                  (epic as { title?: string }).title ??
                  "Generated Stories",
                userStories: parsed.userStories ?? [],
                assumptions: parsed.assumptions ?? [],
                risks: parsed.risks ?? [],
                followUps: parsed.followUps ?? [],
              };
            }
          } catch (err) {
            parseError = err instanceof Error
              ? err.message
              : "JSON parse failed";
          }

          // Run scorer if we have a valid storyPack
          let scorerResult = null;
          if (storyPack && !parseError) {
            try {
              const epicInput: Epic = {
                id: epicId,
                title: (epic as { title?: string }).title ?? "Epic",
                description: (epic as { description?: string }).description ??
                  JSON.stringify(epic),
              };

              const result = await scorer.run({
                input: epicInput,
                output: {
                  storyPack: storyPack as StoryPack,
                  rawText,
                  instructions: systemPrompt,
                },
              });

              // Extract FPF info from nested results
              const typedResult = result as ScorerResultWithSteps;
              const fpfInfo = typedResult.results?.preprocessStepResult
                ?.fpfJudgeResult?.info;

              scorerResult = {
                score: result.score,
                reason: result.reason,
                gateDecision: fpfInfo?.gateDecision ?? "abstain",
                fpfSubscores: fpfInfo?.subscores ?? undefined,
              };
            } catch (scorerErr) {
              console.error("Scorer error:", scorerErr);
              // Continue without scorer result on error
            }
          }

          return jsonResponse({
            result: {
              storyPack,
              rawText,
              instructions: systemPrompt,
              error: parseError,
              seed: payload?.seed,
            },
            scorerResult,
          });
        } catch (err) {
          return jsonResponse(
            { error: err instanceof Error ? err.message : String(err) },
            500,
          );
        }
      }

      if (url.pathname === "/generate" && req.method === "POST") {
        let payload: GenerateRequest | null = null;
        try {
          payload = (await req.json()) as GenerateRequest;
        } catch {
          payload = null;
        }

        const prompt = payload?.prompt?.trim();
        if (!prompt) {
          return jsonResponse({ error: "prompt is required" }, 400);
        }

        const model = payload?.model?.trim() || LLM_MODEL;

        // LM Studio OpenAI-compatible format
        const messages: Array<{ role: string; content: string }> = [];
        if (payload?.system) {
          messages.push({ role: "system", content: payload.system });
        }
        messages.push({ role: "user", content: prompt });

        const requestBody = {
          model,
          messages,
          stream: false,
          temperature:
            (payload?.options as Record<string, unknown>)?.temperature ??
              0.7,
          max_tokens: -1,
        };

        const headers: Record<string, string> = {
          "content-type": "application/json",
        };
        if (LLM_API_KEY) {
          headers["authorization"] = `Bearer ${LLM_API_KEY}`;
        }

        const timeoutMs = env.LLM_TIMEOUT_MS;
        const upstream = await fetch(
          `${LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(timeoutMs),
          },
        );

        const raw = await upstream.text();
        if (!upstream.ok) {
          return jsonResponse(
            {
              error: "llm_error",
              status: upstream.status,
              detail: safeJson(raw),
            },
            upstream.status,
          );
        }

        const data = safeJson(raw) as {
          choices?: Array<{ message?: LlmChatMessage }>;
        };
        const content = extractChatMessageText(data?.choices?.[0]?.message);
        return jsonResponse({
          provider: "lm-studio",
          model,
          response: content,
        });
      }

      // ─────────────────────────────────────────────────
      // Flow B: Distributional Evaluation
      // ─────────────────────────────────────────────────

      // Start async evaluation
      if (url.pathname === "/evaluate" && req.method === "POST") {
        let payload: { replicates?: number; promptOverride?: string } | null =
          null;
        try {
          payload = await req.json();
        } catch {
          payload = {};
        }

        const taskId = crypto.randomUUID();
        const epics = (await loadEpics()) as Epic[];
        const champion = await loadChampionPrompt();
        const promptText = payload?.promptOverride || champion.composed;
        const replicates = payload?.replicates ?? 3; // Default to 3 for faster demo

        if (epics.length === 0) {
          return jsonResponse({ error: "No epics available" }, 400);
        }

        // Create task
        const task: EvalTask = {
          id: taskId,
          status: "pending",
          progress: { completed: 0, total: epics.length * replicates },
          startedAt: new Date().toISOString(),
        };
        evalTasks.set(taskId, task);

        // Start evaluation in background (don't await)
        (async () => {
          task.status = "running";
          try {
            const report = await evalPromptDistribution({
              promptId: "web-eval",
              promptText,
              epics,
              replicates,
              concurrency: 1, // Serial for stability
              onProgress: (completed, total) => {
                task.progress = { completed, total };
              },
            });
            task.status = "completed";
            task.report = report;
            task.completedAt = new Date().toISOString();
          } catch (err) {
            task.status = "failed";
            task.error = err instanceof Error ? err.message : String(err);
            task.completedAt = new Date().toISOString();
          }
        })();

        return jsonResponse({ taskId, status: "pending" });
      }

      // Poll evaluation status
      if (url.pathname.startsWith("/evaluate/") && req.method === "GET") {
        const taskId = url.pathname.split("/")[2]?.trim();

        if (!taskId) {
          return jsonResponse({ error: "Invalid task ID" }, 400);
        }

        const task = evalTasks.get(taskId);

        if (!task) {
          return jsonResponse({ error: "Task not found" }, 404);
        }

        return jsonResponse({
          taskId: task.id,
          status: task.status,
          progress: task.progress,
          report: task.report,
          error: task.error,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
        });
      }

      // ─────────────────────────────────────────────────
      // Flow C: Evolution - Pair Mining
      // ─────────────────────────────────────────────────

      if (url.pathname === "/mine-pairs" && req.method === "POST") {
        let payload: { report: PromptDistReport } | null = null;
        try {
          payload = await req.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        if (!payload?.report?.perEpic) {
          return jsonResponse(
            { error: "report with perEpic is required" },
            400,
          );
        }

        // Flatten the report into ScoredOutput format
        const runs: ScoredOutput[] = payload.report.perEpic.flatMap((epic) =>
          epic.runs.map((run) => ({
            epicId: epic.epicId,
            seed: run.seed,
            score: run.score,
            pass: run.pass,
            storyPack: run.storyPack,
            rawText: run.rawText,
          }))
        );

        // Mine pairs (pure computation, no LLM)
        const pairs = mineContrastivePairs({ runs });

        // Transform to frontend format
        const frontendPairs = pairs.map((p) => ({
          epicId: p.epicId,
          similarity: p.sim,
          scoreDelta: p.delta,
          good: {
            seed: p.good.seed,
            score: p.good.score,
            storyPack: p.good.storyPack,
            rawText: p.good.rawText,
          },
          bad: {
            seed: p.bad.seed,
            score: p.bad.score,
            storyPack: p.bad.storyPack,
            rawText: p.bad.rawText,
          },
        }));

        return jsonResponse({ pairs: frontendPairs });
      }

      // ─────────────────────────────────────────────────
      // Flow C: Evolution - Patch Generation
      // ─────────────────────────────────────────────────

      if (url.pathname === "/generate-patches" && req.method === "POST") {
        let payload: { pairs: ContrastPair[]; count?: number } | null = null;
        try {
          payload = await req.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        if (!payload?.pairs || payload.pairs.length === 0) {
          return jsonResponse({ error: "pairs array is required" }, 400);
        }

        const champion = await loadChampionPrompt();
        const pairsContext = formatPairsForPrompt(payload.pairs);
        const count = payload.count ?? 3;

        try {
          const patches = await generatePatchCandidates(
            {
              basePrompt: champion.base,
              currentPatch: champion.patch,
              pairsContext,
            },
            count,
          );

          // Return patches with metadata
          const candidates = patches.map((patch, i) => ({
            id: `patch-${i + 1}`,
            patch,
            rationale: "Generated based on contrastive pair analysis",
            targetedIssue: "Quality improvement",
            composedPrompt: composePrompt(champion.base, patch),
          }));

          return jsonResponse({ candidates });
        } catch (err) {
          return jsonResponse(
            { error: err instanceof Error ? err.message : String(err) },
            500,
          );
        }
      }

      // ─────────────────────────────────────────────────
      // Flow C: Evolution - Tournament
      // ─────────────────────────────────────────────────

      if (url.pathname === "/run-tournament" && req.method === "POST") {
        let payload: {
          patches: Array<{ id: string; patch: string; name?: string }>;
          replicates?: number;
        } | null = null;

        try {
          payload = await req.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        if (!payload?.patches || payload.patches.length === 0) {
          return jsonResponse({ error: "patches array is required" }, 400);
        }

        const taskId = crypto.randomUUID();
        const epics = (await loadEpics()) as Epic[];
        const champion = await loadChampionPrompt();
        const replicates = payload.replicates ?? 3;

        if (epics.length === 0) {
          return jsonResponse({ error: "No epics available" }, 400);
        }

        const runsPerCandidate = epics.length * replicates;
        // +1 for champion evaluation
        const totalCandidates = payload.patches.length + 1;
        const totalRuns = runsPerCandidate * totalCandidates;

        // Create task
        const task: TournamentTask = {
          id: taskId,
          status: "pending",
          progress: {
            candidateIdx: 0,
            totalCandidates,
            runsCompleted: 0,
            totalRuns,
          },
          candidates: [],
          championObjective: 0,
          startedAt: new Date().toISOString(),
        };
        tournamentTasks.set(taskId, task);

        // Run tournament in background
        (async () => {
          task.status = "running";
          let overallRunsCompleted = 0;

          try {
            // Step 1: Evaluate champion first
            task.progress.candidateIdx = 0;
            const championReport = await evalPromptDistribution({
              promptId: "champion",
              promptText: champion.composed,
              epics,
              replicates,
              concurrency: 1,
              onProgress: (completed, _total) => {
                task.progress.runsCompleted = completed;
              },
            });

            const championObjective = championReport.agg.objective;
            task.championObjective = championObjective;
            overallRunsCompleted += runsPerCandidate;

            task.candidates.push({
              id: "champion",
              name: "Champion (Current)",
              patch: champion.patch,
              objective: championObjective,
              passRate: championReport.agg.meanPassRate,
              meanScore: championReport.agg.meanOfMeans,
              p10Score: championReport.agg.meanP10,
              isChampion: true,
              deltaVsChampion: 0,
              runsCompleted: runsPerCandidate,
              totalRuns: runsPerCandidate,
              report: championReport,
            });

            // Step 2: Evaluate each patch candidate
            for (let i = 0; i < payload!.patches.length; i++) {
              const patch = payload!.patches[i]!;
              task.progress.candidateIdx = i + 1;

              const candidatePrompt = composePrompt(champion.base, patch.patch);
              const report = await evalPromptDistribution({
                promptId: patch.id,
                promptText: candidatePrompt,
                epics,
                replicates,
                concurrency: 1,
                onProgress: (completed, _total) => {
                  task.progress.runsCompleted = overallRunsCompleted +
                    completed;
                },
              });

              overallRunsCompleted += runsPerCandidate;

              const delta = report.agg.objective - championObjective;
              task.candidates.push({
                id: patch.id,
                name: patch.name || `Patch #${i + 1}`,
                patch: patch.patch,
                objective: report.agg.objective,
                passRate: report.agg.meanPassRate,
                meanScore: report.agg.meanOfMeans,
                p10Score: report.agg.meanP10,
                isChampion: false,
                deltaVsChampion: delta,
                runsCompleted: runsPerCandidate,
                totalRuns: runsPerCandidate,
                report,
              });
            }

            // Step 3: Find winner
            const sorted = [...task.candidates].sort(
              (a, b) => b.objective - a.objective,
            );
            const best = sorted[0]!;
            task.winner = {
              id: best.id,
              objective: best.objective,
              deltaVsChampion: best.objective - championObjective,
            };

            task.status = "completed";
            task.completedAt = new Date().toISOString();
          } catch (err) {
            task.status = "failed";
            task.error = err instanceof Error ? err.message : String(err);
            task.completedAt = new Date().toISOString();
          }
        })();

        return jsonResponse({ taskId, status: "pending" });
      }

      // Poll tournament status
      if (url.pathname.startsWith("/tournament/") && req.method === "GET") {
        const taskId = url.pathname.split("/")[2]?.trim();

        if (!taskId) {
          return jsonResponse({ error: "Invalid task ID" }, 400);
        }

        const task = tournamentTasks.get(taskId);

        if (!task) {
          return jsonResponse({ error: "Task not found" }, 404);
        }

        // Return candidates without full reports (too large for polling)
        const candidatesForUI = task.candidates.map((c) => ({
          id: c.id,
          name: c.name,
          objective: c.objective,
          passRate: c.passRate,
          meanScore: c.meanScore,
          p10Score: c.p10Score,
          isChampion: c.isChampion,
          deltaVsChampion: c.deltaVsChampion,
          runsCompleted: c.runsCompleted,
          totalRuns: c.totalRuns,
        }));

        return jsonResponse({
          taskId: task.id,
          status: task.status,
          progress: task.progress,
          candidates: candidatesForUI,
          championObjective: task.championObjective,
          winner: task.winner,
          error: task.error,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
        });
      }

      // ─────────────────────────────────────────────────
      // V2 API: Orchestrator-based endpoints with Deno KV
      // ─────────────────────────────────────────────────

      // V2 Playground: Single epic generation with scoring
      if (url.pathname === "/v2/playground" && req.method === "POST") {
        let payload: {
          epicId: string;
          promptOverride?: string;
          seed?: number;
          maxTokens?: number;
        } | null = null;
        try {
          payload = await req.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        const epicId = payload?.epicId;
        if (!epicId) {
          return jsonResponse({ error: "epicId is required" }, 400);
        }

        const maxTokens = normalizeMaxTokens(payload?.maxTokens);
        if (payload?.maxTokens !== undefined && maxTokens === undefined) {
          return jsonResponse(
            {
              error:
                `maxTokens must be an integer between ${MIN_MAX_TOKENS} and ${MAX_MAX_TOKENS}`,
            },
            400,
          );
        }

        try {
          const orchestrator = await getOrchestrator();
          const result = await orchestrator.runPlayground(epicId, {
            promptOverride: payload?.promptOverride,
            seed: payload?.seed,
            maxTokens,
          });

          return jsonResponse({
            result: {
              storyPack: result.generation.storyPack,
              rawText: result.generation.rawText,
              error: result.generation.error,
            },
            scorerResult: result.score,
          });
        } catch (err) {
          return jsonResponse(
            { error: err instanceof Error ? err.message : String(err) },
            500,
          );
        }
      }

      // V2 Evaluate: Start async evaluation with Deno KV persistence
      if (url.pathname === "/v2/evaluate" && req.method === "POST") {
        let payload: {
          replicates?: number;
          promptOverride?: string;
          maxTokens?: number;
        } | null = null;
        try {
          payload = await req.json();
        } catch {
          payload = {};
        }

        const epics = (await loadEpics()) as Epic[];
        if (epics.length === 0) {
          return jsonResponse({ error: "No epics available" }, 400);
        }

        const replicates = payload?.replicates ?? 3;
        const maxTokens = normalizeMaxTokens(payload?.maxTokens);
        if (payload?.maxTokens !== undefined && maxTokens === undefined) {
          return jsonResponse(
            {
              error:
                `maxTokens must be an integer between ${MIN_MAX_TOKENS} and ${MAX_MAX_TOKENS}`,
            },
            400,
          );
        }
        const totalRuns = epics.length * replicates;

        // Create task in Deno KV
        const task = await createTask("evaluation", {
          totalProgress: totalRuns,
        });

        // Run evaluation in background using orchestrator
        (async () => {
          try {
            await kvStore.updateTaskStatus(task.id, "running");

            const orchestrator = await getOrchestrator();
            const champion = await loadChampionPrompt();
            const promptText = payload?.promptOverride || champion.composed;

            const result = await orchestrator.runEvaluation({
              promptText,
              epics,
              replicates,
              maxTokens,
              onProgress: (completed, total) => {
                updateTaskProgress(task.id, { completed, total });
              },
            });

            await completeTask(task.id, result);
          } catch (err) {
            await failTask(
              task.id,
              err instanceof Error ? err.message : String(err),
            );
          }
        })();

        return jsonResponse({ taskId: task.id, status: "pending" });
      }

      // V2 Task status: Get task from Deno KV
      if (url.pathname.startsWith("/v2/tasks/") && req.method === "GET") {
        const taskId = url.pathname.split("/")[3]?.trim();

        if (!taskId) {
          return jsonResponse({ error: "Invalid task ID" }, 400);
        }

        const task = await getTask(taskId);

        if (!task) {
          return jsonResponse({ error: "Task not found" }, 404);
        }

        return jsonResponse({
          taskId: task.id,
          type: task.type,
          status: task.status,
          progress: task.progress,
          result: task.result,
          error: task.error,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
        });
      }

      // V2 Optimization: Start async optimization loop with Deno KV persistence
      if (url.pathname === "/v2/optimize" && req.method === "POST") {
        let payload: {
          maxIterations?: number;
          replicates?: number;
          patchCandidates?: number;
          maxTokens?: number;
        } | null = null;

        try {
          payload = await req.json();
        } catch {
          payload = {};
        }

        const epics = (await loadEpics()) as Epic[];
        if (epics.length === 0) {
          return jsonResponse({ error: "No epics available" }, 400);
        }

        const maxTokens = normalizeMaxTokens(payload?.maxTokens);
        if (payload?.maxTokens !== undefined && maxTokens === undefined) {
          return jsonResponse(
            {
              error:
                `maxTokens must be an integer between ${MIN_MAX_TOKENS} and ${MAX_MAX_TOKENS}`,
            },
            400,
          );
        }

        // Create task in Deno KV
        const task = await createTask("optimization");

        // Run optimization in background using orchestrator
        (async () => {
          try {
            await kvStore.updateTaskStatus(task.id, "running");

            const orchestrator = await getOrchestrator();
            const finalState = await orchestrator.runOptimization(
              {
                maxIterations: payload?.maxIterations,
                replicates: payload?.replicates,
                patchCandidates: payload?.patchCandidates,
                maxTokens,
              },
              {
                onProgress: (completed, total) => {
                  updateTaskProgress(task.id, { completed, total });
                },
              },
            );

            await completeTask(task.id, finalState);
          } catch (err) {
            await failTask(
              task.id,
              err instanceof Error ? err.message : String(err),
            );
          }
        })();

        return jsonResponse({ taskId: task.id, status: "pending" });
      }

      // ─────────────────────────────────────────────────
      // V3 Streaming Optimization (detailed step progress)
      // ─────────────────────────────────────────────────

      // Start optimization with streaming progress
      if (url.pathname === "/v3/optimize" && req.method === "POST") {
        let payload: {
          maxIterations?: number;
          replicates?: number;
          patchCandidates?: number;
          metaEvolutionEnabled?: boolean;
          maxTokens?: number;
        } | null = null;

        try {
          payload = await req.json();
        } catch {
          payload = {};
        }

        const epics = (await loadEpics()) as Epic[];
        if (epics.length === 0) {
          return jsonResponse({ error: "No epics available" }, 400);
        }

        const maxTokens = normalizeMaxTokens(payload?.maxTokens);
        if (payload?.maxTokens !== undefined && maxTokens === undefined) {
          return jsonResponse(
            {
              error:
                `maxTokens must be an integer between ${MIN_MAX_TOKENS} and ${MAX_MAX_TOKENS}`,
            },
            400,
          );
        }

        const champion = await loadChampionPrompt();
        const taskId = crypto.randomUUID();

        // Configuration with defaults from env
        const config = {
          maxIterations: payload?.maxIterations ?? env.OPT_ITERATIONS,
          replicates: payload?.replicates ?? env.EVAL_REPLICATES,
          patchCandidates: payload?.patchCandidates ?? env.OPT_PATCH_CANDIDATES,
          metaEvolutionEnabled: payload?.metaEvolutionEnabled ?? false,
          maxTokens,
        };

        // Create streaming optimization task
        const task = createOptimizationTask(taskId, config);
        optimizationTasks.set(taskId, task);
        queuePersistOptimizationTask(task, true);

        const startTime = Date.now();

        // Run optimization in background with detailed progress callbacks
        (async () => {
          task.status = "running";
          queuePersistOptimizationTask(task, true);
          let iterationStartTime = startTime;

          try {
            const finalState = await runOptimizationLoop(
              epics,
              { base: champion.base, patch: champion.patch },
              {
                maxIterations: config.maxIterations,
                replicates: config.replicates,
                patchCandidates: config.patchCandidates,
                metaEvolutionEnabled: config.metaEvolutionEnabled,
                promotionThreshold: env.OPT_PROMOTION_THRESHOLD,
                concurrency: env.OPT_CONCURRENCY,
                maxTokens: config.maxTokens,

                // Iteration callbacks for step-level progress
                onIterationStart: (iteration: number) => {
                  iterationStartTime = Date.now();
                  task.progress.iteration = iteration;
                  updateTaskStep(task, "evaluating_champion", {
                    totalElapsed: Date.now() - startTime,
                  });
                  queuePersistOptimizationTask(task);
                },

                onIterationEnd: (result: IterationResult) => {
                  completeTaskIteration(task, result);
                  task.progress.totalElapsed = Date.now() - startTime;
                  task.progress.iterationElapsed = Date.now() -
                    iterationStartTime;
                  queuePersistOptimizationTask(task);
                },

                // Evaluation progress callback
                onProgress: (completed: number, total: number) => {
                  // Determine if we're in initial eval or tournament based on step
                  if (task.progress.step === "evaluating_champion") {
                    updateTaskEvalProgress(task, { completed, total });
                  } else if (task.progress.step === "tournament") {
                    // During tournament, update tournament progress
                    const totalCandidates = config.patchCandidates + 1;
                    const runsPerCandidate = total > 0
                      ? total / totalCandidates
                      : 1;
                    const rawCandidateIdx = Math.floor(
                      completed / runsPerCandidate,
                    );
                    const candidateIdx = Math.min(
                      Math.max(rawCandidateIdx, 0),
                      config.patchCandidates,
                    );
                    updateTaskTournamentProgress(task, {
                      candidateIdx,
                      totalCandidates,
                      runsCompleted: completed,
                      totalRuns: total,
                    });
                  }
                  task.progress.totalElapsed = Date.now() - startTime;
                  queuePersistOptimizationTask(task);
                },
              },
              { enableCheckpoints: true },
            );

            // Mark completed with final results
            task.status = "completed";
            task.completedAt = new Date().toISOString();
            updateTaskStep(task, "completed");

            const baselineObjective =
              task.progress.history[0]?.championObjective ??
                0;
            task.result = {
              finalObjective: finalState.championObjective,
              totalIterations: finalState.iteration,
              improvementVsBaseline: finalState.championObjective -
                baselineObjective,
              championPatch: finalState.championPrompt.patch,
              history: task.progress.history,
            };
            queuePersistOptimizationTask(task, true);
          } catch (err) {
            task.status = "failed";
            task.error = err instanceof Error ? err.message : String(err);
            task.completedAt = new Date().toISOString();
            updateTaskStep(task, "failed");
            queuePersistOptimizationTask(task, true);
          }
        })();

        return jsonResponse({
          taskId,
          status: "pending",
          config,
        });
      }

      // Poll streaming optimization progress
      if (url.pathname.startsWith("/v3/optimize/") && req.method === "GET") {
        const taskId = url.pathname.split("/")[3]?.trim();

        if (!taskId) {
          return jsonResponse({ error: "Invalid task ID" }, 400);
        }

        let task = optimizationTasks.get(taskId);
        if (!task) {
          task = await getOptimizationTask(taskId) ?? undefined;
          if (task) {
            optimizationTasks.set(taskId, task);
          }
        }

        if (!task) {
          return jsonResponse({ error: "Task not found" }, 404);
        }

        return jsonResponse({
          taskId: task.id,
          status: task.status,
          config: task.config,
          progress: task.progress,
          result: task.result,
          error: task.error,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
        });
      }

      return jsonResponse({ error: "not_found" }, 404);
    })();

    return applyCorsHeaders(response, corsOrigin);
  };
}
