import { serveDir, serveFile } from "jsr:@std/http/file-server";
import { fromFileUrl } from "jsr:@std/path";

// Import PromptAgent modules
import { evalPromptDistribution, type PromptDistReport } from "../src/eval.ts";
import { mineContrastivePairs, formatPairsForPrompt, type ContrastPair, type ScoredOutput } from "../src/pairMining.ts";
import { generatePatchCandidates, composePrompt } from "../src/patchEngineer.ts";
import { createStoryDecompositionScorer } from "../src/scorer.ts";
import type { Epic, StoryPack } from "../src/schema.ts";

// Create scorer instance (reused across requests)
const scorer = createStoryDecompositionScorer();

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
  progress: { candidateIdx: number; totalCandidates: number; runsCompleted: number; totalRuns: number };
  candidates: TournamentCandidateResult[];
  championObjective: number;
  winner?: { id: string; objective: number; deltaVsChampion: number };
  error?: string;
  startedAt: string;
  completedAt?: string;
};

const tournamentTasks = new Map<string, TournamentTask>();

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

/**
 * Parse acceptance criteria from various formats:
 * - Given/When/Then (GWT) blocks
 * - Numbered lists (1. 2. 3.)
 * - Bullet points (-, •, *, ◦)
 * - Checkbox format (- [ ], - [x])
 * - Plain newline-separated lines
 */
function parseAcceptanceCriteria(raw: string): string[] {
  if (!raw || typeof raw !== "string") return [];

  const trimmed = raw.trim();
  if (!trimmed) return [];

  const criteria: string[] = [];

  // Check for Given/When/Then format
  const gwtPattern = /\b(Given|When|Then|And|But)\b[:\s]+(.+?)(?=\b(?:Given|When|Then|And|But)\b|$)/gis;
  const gwtMatches = [...trimmed.matchAll(gwtPattern)];

  if (gwtMatches.length >= 2) {
    // Has GWT format - group into scenarios
    let currentScenario: string[] = [];

    for (const match of gwtMatches) {
      const keyword = match[1]!.toLowerCase();
      const content = match[2]!.trim().replace(/\n+/g, " ");

      if (keyword === "given" && currentScenario.length > 0) {
        // Start of new scenario, save previous
        criteria.push(currentScenario.join(" → "));
        currentScenario = [];
      }

      currentScenario.push(`${match[1]} ${content}`);
    }

    // Don't forget the last scenario
    if (currentScenario.length > 0) {
      criteria.push(currentScenario.join(" → "));
    }

    if (criteria.length > 0) return criteria;
  }

  // Check for numbered list format (1. or 1) or a. or a))
  const numberedPattern = /(?:^|\n)\s*(?:\d+[.)]\s*|[a-z][.)]\s*)/i;
  if (numberedPattern.test(trimmed)) {
    const items = trimmed.split(/(?:^|\n)\s*(?:\d+[.)]\s*|[a-z][.)]\s*)/i)
      .map((s) => s.trim().replace(/\n+/g, " "))
      .filter((s) => s.length > 3);
    if (items.length > 0) return items;
  }

  // Check for bullet/checkbox format
  // Matches: -, •, *, ◦, ▪, ►, →, and checkbox variants
  const bulletPattern = /(?:^|\n)\s*[-•*◦▪►→]\s*(?:\[[ x]\]\s*)?/i;
  if (bulletPattern.test(trimmed)) {
    const items = trimmed.split(/(?:^|\n)\s*[-•*◦▪►→]\s*(?:\[[ x]\]\s*)?/)
      .map((s) => s.trim().replace(/\n+/g, " "))
      .filter((s) => s.length > 3);
    if (items.length > 0) return items;
  }

  // Check for HTML list format (often from rich text)
  if (trimmed.includes("<li>")) {
    const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    const liMatches = [...trimmed.matchAll(liPattern)];
    const items = liMatches
      .map((m) => m[1]!.replace(/<[^>]+>/g, "").trim())
      .filter((s) => s.length > 3);
    if (items.length > 0) return items;
  }

  // Fallback: split by newlines (if multi-line) or return as single criterion
  const lines = trimmed.split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);

  if (lines.length > 1) {
    return lines;
  }

  // Single criterion - return as array
  return trimmed.length > 3 ? [trimmed] : [];
}

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
      } catch { /* ignore if exists */ }

      // Backup current champion with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const currentChampion = await loadChampionPrompt();
      if (currentChampion.composed) {
        await Deno.writeTextFile(
          `${versionsDir}/champion.${timestamp}.md`,
          currentChampion.composed
        );
      }

      // Save new champion
      await Deno.writeTextFile(`${PROMPTS_ROOT}/champion.md`, newComposed);

      // Clear cache so next load gets fresh data
      cachedChampion = null;

      // Load and return the updated champion
      const updated = await loadChampionPrompt();
      return jsonResponse({
        success: true,
        champion: updated,
        backupFile: currentChampion.composed ? `champion.${timestamp}.md` : null,
      });
    } catch (err) {
      return jsonResponse(
        { error: `Failed to save champion: ${err instanceof Error ? err.message : String(err)}` },
        500
      );
    }
  }

  if (url.pathname === "/champion/versions" && req.method === "GET") {
    // List available prompt versions
    try {
      const versionsDir = `${PROMPTS_ROOT}/versions`;
      const versions: { name: string; timestamp: string }[] = [];

      for await (const entry of Deno.readDir(versionsDir)) {
        if (entry.isFile && entry.name.startsWith("champion.") && entry.name.endsWith(".md")) {
          // Extract timestamp from filename: champion.2024-01-15T10-30-00-000Z.md
          const match = entry.name.match(/champion\.(.+)\.md$/);
          if (match) {
            versions.push({
              name: entry.name,
              timestamp: match[1].replace(/-/g, ":").replace("T", " ").slice(0, -1), // Approximate restore
            });
          }
        }
      }

      // Sort by filename (timestamp) descending
      versions.sort((a, b) => b.name.localeCompare(a.name));

      return jsonResponse({ versions });
    } catch {
      return jsonResponse({ versions: [] });
    }
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
        // Priority: 1) ```json blocks, 2) raw JSON starting with [ or {
        let jsonStr = "";

        const jsonBlockMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonBlockMatch) {
          jsonStr = jsonBlockMatch[1];
        } else {
          // Try to find raw JSON (array or object) in the response
          const jsonStartMatch = rawText.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
          if (jsonStartMatch) {
            jsonStr = jsonStartMatch[1];
          } else {
            jsonStr = rawText;
          }
        }

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

              // Parse acceptance criteria (handles GWT, numbered, bullet formats)
              const acRaw = String(item["Microsoft.VSTS.Common.AcceptanceCriteria"] ?? "");
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

      // Run scorer if we have a valid storyPack
      let scorerResult = null;
      if (storyPack && !parseError) {
        try {
          const epicInput: Epic = {
            id: epicId,
            title: (epic as { title?: string }).title ?? "Epic",
            description: (epic as { description?: string }).description ?? JSON.stringify(epic),
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
          // deno-lint-ignore no-explicit-any
          const preprocessResult = (result as any).results?.preprocessStepResult;
          const fpfInfo = preprocessResult?.fpfJudgeResult?.info;

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
    const epics = await loadEpics() as Epic[];
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
      progress: { candidateIdx: 0, totalCandidates, runsCompleted: 0, totalRuns },
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
              task.progress.runsCompleted = overallRunsCompleted + completed;
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
        const sorted = [...task.candidates].sort((a, b) => b.objective - a.objective);
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
