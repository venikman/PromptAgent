import { useEffect, useMemo, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type {
  ChampionPrompt,
  Epic,
  ScorerResult,
  StoryPack,
  TelemetrySnapshot,
} from "../types.ts";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "../components/ai-elements/message.tsx";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "../components/ai-elements/prompt-input.tsx";
import "../twind_client.ts";

type HealthState = {
  status: "loading" | "ok" | "error";
  message?: string;
};

type PlaygroundResponse = {
  result: {
    storyPack: StoryPack | null;
    rawText: string;
    error?: string;
  };
  scorerResult?: ScorerResult;
};

type OptimizationTask = {
  taskId: string;
  status: "pending" | "running" | "completed" | "failed";
  config?: Record<string, unknown>;
  progress?: Record<string, unknown> & {
    stepLabel?: string;
    iteration?: number;
    maxIterations?: number;
    championObjective?: number;
    totalElapsed?: number;
  };
  result?: Record<string, unknown> & {
    finalObjective?: number;
    improvementVsBaseline?: number;
    championPatch?: string;
    totalIterations?: number;
  };
  error?: string;
  startedAt?: string;
  completedAt?: string;
};

const formatNumber = (value?: number, digits = 2) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
  return value.toFixed(digits);
};

const formatMs = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
  return `${Math.round(value / 1000)}s`;
};

const parsePositiveInt = (value: string, fallback: number) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
};

const wrapCodeBlock = (value: string) => `~~~text\n${value}\n~~~`;
const DEMO_MAX_TOKENS = 1200;

const gateTone = (decision: string) => {
  switch (decision) {
    case "pass":
      return "bg-emerald-500/10 text-emerald-700";
    case "degrade":
      return "bg-amber-500/10 text-amber-700";
    case "block":
      return "bg-rose-500/10 text-rose-700";
    case "abstain":
      return "bg-slate-400/10 text-slate-700";
    default:
      return "bg-slate-400/10 text-slate-700";
  }
};

const StoryCard = (
  { story, index }: { story: StoryPack["userStories"][number]; index: number },
) => (
  <div class="rounded-2xl border border-border/60 bg-white/80 p-4 shadow-sm">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm font-semibold text-foreground">
        {index + 1}. {story.title}
      </p>
      {typeof story.ado.fields["Microsoft.VSTS.Scheduling.StoryPoints"] ===
          "number" && (
        <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          {story.ado.fields["Microsoft.VSTS.Scheduling.StoryPoints"]} pts
        </span>
      )}
    </div>
    <p class="mt-2 text-xs text-muted-foreground">
      As a {story.asA}, I want {story.iWant} so that {story.soThat}.
    </p>
    <div class="mt-3">
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Acceptance criteria
      </p>
      <ul class="mt-2 list-disc space-y-1 pl-4 text-xs text-foreground/80">
        {story.acceptanceCriteria.map((item, itemIndex) => (
          <li key={`${story.title}-${itemIndex}`}>{item}</li>
        ))}
      </ul>
    </div>
  </div>
);

const PlaygroundResultView = ({ result }: { result: PlaygroundResponse }) => {
  const score = formatNumber(result.scorerResult?.score, 3);
  const gateDecision = result.scorerResult?.gateDecision ?? "n/a";
  const rawText = result.result.rawText?.trim();
  const storyPack = result.result.storyPack;
  const error = result.result.error;

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-center gap-3 text-xs font-semibold">
        <span class="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
          Score: {score}
        </span>
        <span class={`rounded-full px-3 py-1 ${gateTone(gateDecision)}`}>
          Gate: {gateDecision}
        </span>
      </div>
      {error && (
        <div class="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          Error: {error}
        </div>
      )}

      {storyPack
        ? (
          <div class="space-y-3">
            {storyPack.userStories.map((story, index) => (
              <StoryCard
                key={`${story.title}-${index}`}
                story={story}
                index={index}
              />
            ))}
          </div>
        )
        : (
          <div class="rounded-2xl border border-border/60 bg-white/80 p-4 text-xs text-muted-foreground">
            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Raw output
            </p>
            <pre class="mt-2 whitespace-pre-wrap text-xs text-foreground/80">
            {rawText || "No output returned."}
            </pre>
          </div>
        )}
    </div>
  );
};

const endpointLabel = (res: Response) => {
  try {
    return new URL(res.url).pathname || "endpoint";
  } catch {
    return "endpoint";
  }
};

const readJson = async <T,>(res: Response): Promise<T> => {
  const text = await res.text();
  if (!text) {
    throw new Error(`Empty response from ${endpointLabel(res)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON from ${endpointLabel(res)}`);
  }
};

type PanelProps = {
  eyebrow: string;
  title: string;
  action?: ComponentChildren;
  children: ComponentChildren;
};

const Panel = ({ eyebrow, title, action, children }: PanelProps) => (
  <section class="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.45)] backdrop-blur">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs uppercase tracking-[0.35em] text-muted-foreground">
          {eyebrow}
        </p>
        <h2 class="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
      </div>
      {action}
    </div>
    <div class="mt-6 space-y-4">{children}</div>
  </section>
);

export default function Studio() {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });
  const [epics, setEpics] = useState<Epic[]>([]);
  const [selectedEpicId, setSelectedEpicId] = useState("");
  const [champion, setChampion] = useState<ChampionPrompt | null>(null);

  const [demoMode, setDemoMode] = useState(true);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [promptOverride, setPromptOverride] = useState("");
  const [playgroundResult, setPlaygroundResult] = useState<
    PlaygroundResponse | null
  >(
    null,
  );
  const [playgroundLoading, setPlaygroundLoading] = useState(false);
  const [playgroundError, setPlaygroundError] = useState("");

  const [optConfig, setOptConfig] = useState({
    maxIterations: 4,
    replicates: 3,
    patchCandidates: 4,
    metaEvolutionEnabled: false,
  });
  const [optimizationTask, setOptimizationTask] = useState<
    OptimizationTask | null
  >(
    null,
  );
  const [optimizationError, setOptimizationError] = useState("");
  const [optimizationLoading, setOptimizationLoading] = useState(false);

  const inFlightTotal = useMemo(() => {
    if (!telemetry) return 0;
    return telemetry.ai.reduce((sum, entry) => sum + entry.inFlight, 0);
  }, [telemetry]);

  const inFlightLabel = telemetry
    ? `AI in flight: ${inFlightTotal}`
    : "AI in flight: n/a";
  const inFlightTone = !telemetry
    ? "bg-slate-400/10 text-slate-700"
    : inFlightTotal > 0
    ? "bg-amber-500/10 text-amber-700"
    : "bg-emerald-500/10 text-emerald-700";

  const championMarkdown = useMemo(() => {
    if (!champion?.composed) {
      return "Loading champion prompt...";
    }

    return wrapCodeBlock(champion.composed);
  }, [champion]);

  const selectedEpic = useMemo(() => {
    return epics.find((epic) => epic.id === selectedEpicId) ?? epics[0] ?? null;
  }, [epics, selectedEpicId]);

  const evolutionSubject = champion?.composed
    ? "Epic → User Stories prompt"
    : "Prompt loading...";
  const evolutionMeta = epics.length
    ? `${epics.length} epics in eval set`
    : "No epics loaded";

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const checkHealth = async () => {
      try {
        const res = await fetch("/health", { signal: controller.signal });
        if (!res.ok) {
          const data = await readJson<{ error?: string }>(res).catch(
            () => ({ error: undefined }),
          );
          if (!cancelled) {
            setHealth({
              status: "error",
              message: data.error || `HTTP ${res.status}`,
            });
          }
          return;
        }

        if (!cancelled) {
          setHealth({ status: "ok" });
        }
      } catch (err) {
        if (!cancelled) {
          setHealth({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const loadEpics = async () => {
      try {
        const res = await fetch("/epics");
        const data = await readJson<{ epics?: Epic[]; error?: string }>(res);
        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        if (!cancelled) {
          setEpics(data.epics ?? []);
          setSelectedEpicId((current) => current || data.epics?.[0]?.id || "");
        }
      } catch (err) {
        if (!cancelled) {
          setHealth({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    };

    const loadChampion = async () => {
      try {
        const res = await fetch("/champion");
        const data = await readJson<ChampionPrompt & { error?: string }>(res);
        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        if (!cancelled) {
          setChampion(data);
        }
      } catch (err) {
        if (!cancelled) {
          setHealth({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    };

    checkHealth();
    loadEpics();
    loadChampion();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/telemetry");
        if (!res.ok) return;
        const data = await readJson<TelemetrySnapshot>(res);
        if (!cancelled) {
          setTelemetry(data);
        }
      } catch {
        return;
      }
    };

    poll();
    const intervalId = globalThis.setInterval(poll, 5000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const runPlayground = async () => {
    if (!selectedEpic?.id) {
      setPlaygroundError("Select an epic to continue.");
      return;
    }

    setPlaygroundLoading(true);
    setPlaygroundError("");
    setPlaygroundResult(null);

    try {
      const res = await fetch("/v2/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          epicId: selectedEpic.id,
          promptOverride: promptOverride.trim() || undefined,
          maxTokens: demoMode ? DEMO_MAX_TOKENS : undefined,
        }),
      });

      const data = await readJson<PlaygroundResponse & { error?: string }>(res);
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setPlaygroundResult(data);
    } catch (err) {
      setPlaygroundError(err instanceof Error ? err.message : String(err));
    } finally {
      setPlaygroundLoading(false);
    }
  };

  const startOptimization = async () => {
    setOptimizationError("");
    setOptimizationLoading(true);
    setOptimizationTask(null);

    try {
      const res = await fetch("/v3/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...optConfig,
          maxTokens: demoMode ? DEMO_MAX_TOKENS : undefined,
        }),
      });

      const data = await readJson<
        {
          taskId: string;
          status: OptimizationTask["status"];
          config?: Record<string, unknown>;
          error?: string;
        }
      >(res);
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setOptimizationTask({
        taskId: data.taskId,
        status: data.status,
        config: data.config,
      });
    } catch (err) {
      setOptimizationError(err instanceof Error ? err.message : String(err));
    } finally {
      setOptimizationLoading(false);
    }
  };

  useEffect(() => {
    if (!optimizationTask?.taskId) return;

    let cancelled = false;
    let intervalId: number | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`/v3/optimize/${optimizationTask.taskId}`);
        const data = await readJson<OptimizationTask & { error?: string }>(res);

        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        if (!cancelled) {
          setOptimizationTask(data);
        }

        if (data.status === "completed" || data.status === "failed") {
          if (intervalId) clearInterval(intervalId);
        }
      } catch (err) {
        if (!cancelled) {
          setOptimizationError(
            err instanceof Error ? err.message : String(err),
          );
        }
        if (intervalId) clearInterval(intervalId);
      }
    };

    poll();
    intervalId = globalThis.setInterval(poll, 2500);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [optimizationTask?.taskId]);

  const healthBadgeTone = health.status === "ok"
    ? "bg-emerald-500/10 text-emerald-700"
    : health.status === "error"
    ? "bg-rose-500/10 text-rose-700"
    : "bg-slate-400/10 text-slate-700";

  return (
    <div class="relative min-h-screen overflow-hidden">
      <div class="pointer-events-none absolute inset-0 -z-10">
        <div class="absolute -top-32 right-[-20%] h-80 w-80 rounded-full bg-[radial-gradient(circle_at_top,#f97316_0%,transparent_70%)] opacity-40 blur-3xl" />
        <div class="absolute left-[-10%] top-40 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_top,#38bdf8_0%,transparent_70%)] opacity-35 blur-3xl" />
        <div class="absolute bottom-[-20%] right-10 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,#facc15_0%,transparent_70%)] opacity-30 blur-3xl" />
      </div>

      <main class="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
        <header class="flex flex-col gap-6">
          <div class="flex flex-wrap items-start justify-between gap-6">
            <div class="max-w-xl space-y-4">
              <p class="text-xs uppercase tracking-[0.4em] text-muted-foreground">
                PromptAgent Studio
              </p>
              <h1 class="text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
                Prompt optimization,
                <span class="block text-primary">refined and visual.</span>
              </h1>
              <p class="text-base text-muted-foreground md:text-lg">
                Run story generation, track streaming optimization, and keep the
                champion prompt in one clear control room.
              </p>
            </div>
            <div class="flex flex-col gap-4 rounded-2xl border border-white/70 bg-white/80 p-4 text-sm shadow-lg">
              <div
                class={`flex items-center gap-2 rounded-full px-3 py-1 ${healthBadgeTone}`}
              >
                <span class="h-2 w-2 rounded-full bg-current" />
                <span class="font-medium">
                  {health.status === "loading" && "Checking API"}
                  {health.status === "ok" && "API online"}
                  {health.status === "error" && "API error"}
                </span>
              </div>
              <div
                class={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${inFlightTone}`}
              >
                <span class="h-2 w-2 rounded-full bg-current" />
                <span>{inFlightLabel}</span>
              </div>
              <div class="space-y-1">
                <p class="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  Evolution subject
                </p>
                <p class="text-sm font-semibold text-foreground">
                  {evolutionSubject}
                </p>
                <p class="text-xs text-muted-foreground">
                  {evolutionMeta}
                </p>
              </div>
              {health.status === "error" && health.message && (
                <p class="text-xs text-rose-700">{health.message}</p>
              )}
            </div>
          </div>
        </header>

        <div class="grid gap-6 md:grid-cols-2">
          <Panel
            eyebrow="Playground"
            title="Generate and score a single epic"
          >
            <div class="grid gap-4">
              <label class="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-border"
                  checked={demoMode}
                  onChange={(event) => {
                    const target = event.currentTarget as HTMLInputElement;
                    setDemoMode(target.checked);
                  }}
                />
                Demo mode (short output)
              </label>
              {playgroundLoading && (
                <div class="flex items-center gap-2 text-xs font-semibold text-primary">
                  <span class="h-2 w-2 animate-pulse rounded-full bg-primary" />
                  Generating story pack...
                </div>
              )}
              <div class="space-y-2">
                <label
                  for="playground-epic"
                  class="text-sm font-medium text-foreground"
                >
                  Epic
                </label>
                <select
                  id="playground-epic"
                  class="w-full rounded-2xl border border-border/60 bg-white/80 px-4 py-2 text-sm shadow-sm focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={selectedEpicId}
                  onChange={(event) => {
                    const target = event.currentTarget as HTMLSelectElement;
                    setSelectedEpicId(target.value);
                  }}
                >
                  {epics.length === 0
                    ? <option value="">No epics available</option>
                    : (
                      epics.map((epic) => (
                        <option key={epic.id} value={epic.id}>
                          {epic.id} - {epic.title}
                        </option>
                      ))
                    )}
                </select>
              </div>

              <div class="space-y-2">
                <label class="text-sm font-medium text-foreground">
                  Prompt override (optional)
                </label>
                <PromptInput
                  onSubmit={(event) => {
                    event.preventDefault();
                    runPlayground();
                  }}
                >
                  <PromptInputBody>
                    <PromptInputTextarea
                      value={promptOverride}
                      onInput={(event) => {
                        const target = event
                          .currentTarget as HTMLTextAreaElement;
                        setPromptOverride(target.value);
                      }}
                    />
                  </PromptInputBody>
                  <PromptInputFooter>
                    <span>Leave blank to use the current champion prompt.</span>
                    <PromptInputSubmit
                      disabled={playgroundLoading || !selectedEpic?.id}
                    >
                      {playgroundLoading ? "Running..." : "Generate"}
                    </PromptInputSubmit>
                  </PromptInputFooter>
                </PromptInput>
              </div>
            </div>

            {playgroundError && (
              <div class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {playgroundError}
              </div>
            )}

            {playgroundResult && (
              <div class="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm">
                <Message from="assistant" class="max-w-full">
                  <MessageContent class="text-emerald-900">
                    <MessageResponse className="text-sm text-emerald-900">
                      <PlaygroundResultView result={playgroundResult} />
                    </MessageResponse>
                  </MessageContent>
                </Message>
              </div>
            )}
          </Panel>

          <Panel
            eyebrow="Champion"
            title="Current prompt baseline"
            action={
              <button
                type="button"
                onClick={() => {
                  const previous = champion;
                  setChampion(null);
                  fetch("/champion")
                    .then((res) => readJson<ChampionPrompt>(res))
                    .then((data) => setChampion(data))
                    .catch(() => setChampion(previous));
                }}
                class="rounded-full border border-border/70 px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary/60"
              >
                Refresh
              </button>
            }
          >
            <div class="space-y-2 text-sm text-muted-foreground">
              <p>Base prompt and patch are stitched into the champion below.</p>
              <p class="text-xs">Use the playground to test variations.</p>
            </div>
            <div class="rounded-2xl border border-border/60 bg-white/70 p-4">
              <Message from="assistant" class="max-w-full">
                <MessageContent class="text-foreground/80">
                  <MessageResponse className="text-xs text-foreground/80">
                    {championMarkdown}
                  </MessageResponse>
                </MessageContent>
              </Message>
            </div>
          </Panel>
        </div>

        <Panel
          eyebrow="Optimization"
          title="Run streaming optimization"
          action={
            <button
              type="button"
              onClick={startOptimization}
              disabled={optimizationLoading}
              class="rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background shadow-lg transition hover:translate-y-[-1px] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
            >
              {optimizationLoading ? "Starting..." : "Start optimization"}
            </button>
          }
        >
          {(optimizationLoading || optimizationTask?.status === "running") && (
            <div class="flex items-center gap-2 text-xs font-semibold text-primary">
              <span class="h-2 w-2 animate-pulse rounded-full bg-primary" />
              <span>
                {optimizationLoading
                  ? "Starting optimization..."
                  : "Optimization running..."}
              </span>
            </div>
          )}
          <div class="grid gap-4 md:grid-cols-4">
            <label class="text-sm font-medium text-foreground">
              Iterations
              <input
                type="number"
                min={1}
                class="mt-2 w-full rounded-2xl border border-border/60 bg-white/80 px-4 py-2 text-sm shadow-sm focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={optConfig.maxIterations}
                onChange={(event) => {
                  const target = event.currentTarget as HTMLInputElement;
                  setOptConfig((current) => ({
                    ...current,
                    maxIterations: parsePositiveInt(
                      target.value,
                      current.maxIterations,
                    ),
                  }));
                }}
              />
            </label>
            <label class="text-sm font-medium text-foreground">
              Replicates
              <input
                type="number"
                min={1}
                class="mt-2 w-full rounded-2xl border border-border/60 bg-white/80 px-4 py-2 text-sm shadow-sm focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={optConfig.replicates}
                onChange={(event) => {
                  const target = event.currentTarget as HTMLInputElement;
                  setOptConfig((current) => ({
                    ...current,
                    replicates: parsePositiveInt(
                      target.value,
                      current.replicates,
                    ),
                  }));
                }}
              />
            </label>
            <label class="text-sm font-medium text-foreground">
              Patch candidates
              <input
                type="number"
                min={1}
                class="mt-2 w-full rounded-2xl border border-border/60 bg-white/80 px-4 py-2 text-sm shadow-sm focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={optConfig.patchCandidates}
                onChange={(event) => {
                  const target = event.currentTarget as HTMLInputElement;
                  setOptConfig((current) => ({
                    ...current,
                    patchCandidates: parsePositiveInt(
                      target.value,
                      current.patchCandidates,
                    ),
                  }));
                }}
              />
            </label>
            <label class="flex items-center gap-2 text-sm font-medium text-foreground md:mt-7">
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-border"
                checked={optConfig.metaEvolutionEnabled}
                onChange={(event) => {
                  const target = event.currentTarget as HTMLInputElement;
                  setOptConfig((current) => ({
                    ...current,
                    metaEvolutionEnabled: target.checked,
                  }));
                }}
              />
              Meta-evolution
            </label>
          </div>

          {optimizationError && (
            <div class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {optimizationError}
            </div>
          )}

          {optimizationTask && (
            <div class="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700">
              <div class="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p class="text-xs uppercase tracking-[0.3em] text-slate-500">
                    Status
                  </p>
                  <p class="text-lg font-semibold text-slate-900">
                    {optimizationTask.status}
                  </p>
                  <p class="text-xs text-slate-500">
                    {optimizationTask.progress?.stepLabel || "Starting"}
                  </p>
                </div>
                <div class="text-xs text-slate-500">
                  Iteration {optimizationTask.progress?.iteration ?? 0} of{" "}
                  {optimizationTask.progress?.maxIterations ??
                    optConfig.maxIterations}
                </div>
              </div>

              <div class="mt-4 grid gap-3 md:grid-cols-3">
                <div>
                  <p class="text-xs uppercase tracking-[0.3em] text-slate-500">
                    Champion objective
                  </p>
                  <p class="text-lg font-semibold text-slate-900">
                    {formatNumber(
                      optimizationTask.progress?.championObjective,
                      3,
                    )}
                  </p>
                </div>
                <div>
                  <p class="text-xs uppercase tracking-[0.3em] text-slate-500">
                    Total elapsed
                  </p>
                  <p class="text-lg font-semibold text-slate-900">
                    {formatMs(optimizationTask.progress?.totalElapsed)}
                  </p>
                </div>
                <div>
                  <p class="text-xs uppercase tracking-[0.3em] text-slate-500">
                    Final objective
                  </p>
                  <p class="text-lg font-semibold text-slate-900">
                    {formatNumber(optimizationTask.result?.finalObjective, 3)}
                  </p>
                </div>
              </div>

              {optimizationTask.result?.championPatch && (
                <div class="mt-4">
                  <p class="text-xs uppercase tracking-[0.3em] text-slate-500">
                    Champion patch
                  </p>
                  <Message from="assistant" class="mt-2 max-w-full">
                    <MessageContent class="text-slate-700">
                      <MessageResponse className="text-xs text-slate-700">
                        {wrapCodeBlock(optimizationTask.result.championPatch)}
                      </MessageResponse>
                    </MessageContent>
                  </Message>
                </div>
              )}
            </div>
          )}
        </Panel>
      </main>
    </div>
  );
}
