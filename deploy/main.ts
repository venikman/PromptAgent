import { serveDir, serveFile } from "jsr:@std/http/file-server";
import { fromFileUrl } from "jsr:@std/path";

// Import PromptAgent modules
import { evalPromptDistribution, type PromptDistReport } from "../src/eval.ts";
import { mineContrastivePairs, formatPairsForPrompt, type ContrastPair, type ScoredOutput } from "../src/pairMining.ts";
import { generatePatchCandidates, composePrompt } from "../src/patchEngineer.ts";
import type { Epic } from "../src/schema.ts";

// LM Studio OpenAI-compatible API
const LLM_API_BASE_URL =
  Deno.env.get("LLM_API_BASE_URL") ?? "http://localhost:1234/v1";
const LLM_API_KEY = Deno.env.get("LLM_API_KEY") ?? ""; // Optional for LM Studio
const DEFAULT_MODEL = Deno.env.get("LLM_MODEL") ?? "gpt-oss-120b";

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
// Data paths
// ─────────────────────────────────────────────────

const DATA_ROOT = fromFileUrl(new URL("../data", import.meta.url));
const PROMPTS_ROOT = fromFileUrl(new URL("../prompts", import.meta.url));

// Cached data
let cachedEpics: unknown[] | null = null;
let cachedChampion: { base: string; patch: string; composed: string } | null = null;

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

async function loadChampionPrompt(): Promise<{ base: string; patch: string; composed: string }> {
  if (cachedChampion) return cachedChampion;
  try {
    const [base, patch, composed] = await Promise.all([
      Deno.readTextFile(`${PROMPTS_ROOT}/champion.base.md`).catch(() => ""),
      Deno.readTextFile(`${PROMPTS_ROOT}/champion.patch.md`).catch(() => ""),
      Deno.readTextFile(`${PROMPTS_ROOT}/champion.md`).catch(() => ""),
    ]);
    cachedChampion = { base: base.trim(), patch: patch.trim(), composed: composed.trim() };
    return cachedChampion;
  } catch {
    return { base: "", patch: "", composed: "" };
  }
}

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders,
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

type GenerateRequest = {
  prompt?: string;
  model?: string;
  system?: string;
  options?: Record<string, unknown>;
};

const UI_ROOT = fromFileUrl(new URL("../ui/dist", import.meta.url));
const UI_INDEX = fromFileUrl(new URL("../ui/dist/index.html", import.meta.url));

const wantsHtml = (req: Request): boolean => {
  const accept = req.headers.get("accept") ?? "";
  return accept.includes("text/html");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);

  if (url.pathname === "/health") {
    return jsonResponse({ status: "ok", time: new Date().toISOString() });
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

  if (url.pathname === "/generate-story" && req.method === "POST") {
    // Uses LM Studio's OpenAI-compatible API
    let payload: { epicId?: string; promptOverride?: string; seed?: number } | null = null;
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
    const epic = (epics as Array<{ id: string }>).find((e) => e.id === epicId);
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

    const model = DEFAULT_MODEL;

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

      const upstream = await fetch(
        `${LLM_API_BASE_URL.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
        }
      );

      const raw = await upstream.text();
      if (!upstream.ok) {
        return jsonResponse(
          { error: "llm_error", status: upstream.status, detail: safeJson(raw) },
          upstream.status
        );
      }

      // OpenAI format: { choices: [{ message: { content: "..." } }] }
      const data = safeJson(raw) as { choices?: Array<{ message?: { content?: string } }> };
      const rawText = data?.choices?.[0]?.message?.content ?? "";

      // Try to parse the response as JSON
      let storyPack = null;
      let parseError: string | undefined;
      try {
        // Find JSON in the response (might be wrapped in markdown code blocks)
        const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) ||
                         rawText.match(/```\s*([\s\S]*?)\s*```/) ||
                         [null, rawText];
        const jsonStr = jsonMatch[1] || rawText;
        const parsed = JSON.parse(jsonStr.trim());

        // Transform LLM output to UI-expected format
        // LLM returns array of ADO items, UI expects { epicId, epicTitle, userStories, ... }
        if (Array.isArray(parsed)) {
          storyPack = {
            epicId: epicId,
            epicTitle: (epic as { title?: string }).title ?? "Generated Stories",
            userStories: parsed.map((item: Record<string, unknown>) => {
              // Parse "As a X, I want Y, so that Z" from description
              const desc = String(item["System.Description"] ?? "");
              const asAMatch = desc.match(/\*\*As a\*\*\s*([^,*]+)/i) || desc.match(/As a\s+([^,]+)/i);
              const iWantMatch = desc.match(/\*\*I want\*\*\s*([^,*]+)/i) || desc.match(/I want\s+([^,]+)/i);
              const soThatMatch = desc.match(/\*\*so that\*\*\s*([^,*]+)/i) || desc.match(/so that\s+(.+)/i);

              // Parse acceptance criteria
              const acRaw = String(item["Microsoft.VSTS.Common.AcceptanceCriteria"] ?? "");
              const acceptanceCriteria = acRaw
                .split(/[-•*]\s+/)
                .map((s) => s.trim())
                .filter((s) => s.length > 0);

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
                    "Microsoft.VSTS.Common.AcceptanceCriteria": item["Microsoft.VSTS.Common.AcceptanceCriteria"],
                    "Microsoft.VSTS.Scheduling.StoryPoints": item["StoryPoints"] ?? item["Microsoft.VSTS.Scheduling.StoryPoints"],
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
            epicTitle: parsed.epicTitle ?? (epic as { title?: string }).title ?? "Generated Stories",
            userStories: parsed.userStories ?? [],
            assumptions: parsed.assumptions ?? [],
            risks: parsed.risks ?? [],
            followUps: parsed.followUps ?? [],
          };
        }
      } catch (err) {
        parseError = err instanceof Error ? err.message : "JSON parse failed";
      }

      return jsonResponse({
        result: {
          storyPack,
          rawText,
          instructions: systemPrompt,
          error: parseError,
          seed: payload?.seed,
        },
        scorerResult: null,
      });
    } catch (err) {
      return jsonResponse(
        { error: err instanceof Error ? err.message : String(err) },
        500
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

    const model = payload?.model?.trim() || DEFAULT_MODEL;

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
      temperature: (payload?.options as Record<string, unknown>)?.temperature ?? 0.7,
      max_tokens: -1,
    };

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (LLM_API_KEY) {
      headers["authorization"] = `Bearer ${LLM_API_KEY}`;
    }

    const upstream = await fetch(
      `${LLM_API_BASE_URL.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      }
    );

    const raw = await upstream.text();
    if (!upstream.ok) {
      return jsonResponse(
        {
          error: "llm_error",
          status: upstream.status,
          detail: safeJson(raw),
        },
        upstream.status
      );
    }

    const data = safeJson(raw) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data?.choices?.[0]?.message?.content ?? "";
    return jsonResponse({ provider: "lm-studio", model, response: content });
  }

  // ─────────────────────────────────────────────────
  // Flow B: Distributional Evaluation
  // ─────────────────────────────────────────────────

  // Start async evaluation
  if (url.pathname === "/evaluate" && req.method === "POST") {
    let payload: { replicates?: number; promptOverride?: string } | null = null;
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    const taskId = crypto.randomUUID();
    const epics = await loadEpics() as Epic[];
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
      return jsonResponse({ error: "report with perEpic is required" }, 400);
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
        count
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
        500
      );
    }
  }

  if (url.pathname === "/") {
    if (wantsHtml(req)) {
      try {
        return await serveFile(req, UI_INDEX);
      } catch {
        return jsonResponse({ error: "ui_not_built" }, 503);
      }
    }
    return jsonResponse({
      service: "PromptAgent Deno Deploy API",
      routes: {
        "GET /health": "Service health check",
        "POST /generate": "Proxy to Ollama Cloud generate endpoint",
        "GET /ui": "HTML demo interface",
      },
    });
  }

  if (url.pathname === "/ui") {
    try {
      return await serveFile(req, UI_INDEX);
    } catch {
      return jsonResponse({ error: "ui_not_built" }, 503);
    }
  }

  const staticResponse = await serveDir(req, { fsRoot: UI_ROOT, urlRoot: "" });
  if (staticResponse.status !== 404) {
    return staticResponse;
  }

  if (wantsHtml(req)) {
    try {
      return await serveFile(req, UI_INDEX);
    } catch {
      return jsonResponse({ error: "ui_not_built" }, 503);
    }
  }

  return jsonResponse({ error: "not_found" }, 404);
});
