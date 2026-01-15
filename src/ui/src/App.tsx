import { useEffect, useMemo, useState } from "react";
import type {
  ChampionPrompt,
  Epic,
  ScorerResult,
  StoryPack,
  TelemetrySnapshot,
} from "./types.ts";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "./components/ai-elements/message.tsx";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "./components/ai-elements/prompt-input.tsx";
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanHeader,
  PlanTitle,
} from "./components/ai-elements/plan.tsx";
import { Loader } from "./components/ai-elements/loader.tsx";
import {
  Artifact,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "./components/ai-elements/artifact.tsx";
import { SiteHeader } from "./components/site-header.tsx";

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

const wrapCodeBlock = (value: string) => `~~~markdown\n${value}\n~~~`;

type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "promptagent-theme";

const getStoredTheme = (): ThemeMode | null => {
  if (!("localStorage" in globalThis)) return null;
  try {
    const stored = globalThis.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return null;
  } catch {
    // Ignore storage access errors (private mode, blocked storage, etc.).
    return null;
  }
};

const getSystemTheme = (): ThemeMode => {
  const mql = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
  return mql?.matches ? "dark" : "light";
};

const getInitialTheme = (): ThemeMode => getStoredTheme() ?? getSystemTheme();

const gateTone = (decision: string) => {
  switch (decision) {
    case "pass":
      return "bg-emerald-500/15 text-emerald-700";
    case "degrade":
      return "bg-amber-500/15 text-amber-700";
    case "block":
      return "bg-rose-500/15 text-rose-700";
    case "abstain":
      return "bg-slate-400/15 text-slate-700";
    default:
      return "bg-slate-400/15 text-slate-700";
  }
};

const StoryCard = (
  { story, index }: { story: StoryPack["userStories"][number]; index: number },
) => (
  <Artifact className="rounded-none border border-border bg-card shadow-sm">
    <ArtifactHeader className="items-start gap-3 border-b border-border bg-muted/40">
      <div className="space-y-1">
        <ArtifactTitle className="text-base font-semibold text-foreground">
          {index + 1}. {story.title}
        </ArtifactTitle>
        <ArtifactDescription className="text-sm leading-relaxed text-muted-foreground">
          As a {story.asA}, I want {story.iWant} so that {story.soThat}.
        </ArtifactDescription>
      </div>
      {typeof story.ado.fields["Microsoft.VSTS.Scheduling.StoryPoints"] ===
          "number" && (
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
          {story.ado.fields["Microsoft.VSTS.Scheduling.StoryPoints"]} pts
        </span>
      )}
    </ArtifactHeader>
    <ArtifactContent className="space-y-2 pt-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Acceptance criteria
      </p>
      <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-foreground/90">
        {story.acceptanceCriteria.map((item, itemIndex) => (
          <li key={`${story.title}-${itemIndex}`}>{item}</li>
        ))}
      </ul>
    </ArtifactContent>
  </Artifact>
);

const PlaygroundResultView = ({ result }: { result: PlaygroundResponse }) => {
  const score = formatNumber(result.scorerResult?.score, 3);
  const gateDecision = result.scorerResult?.gateDecision ?? "n/a";
  const rawText = result.result.rawText?.trim();
  const storyPack = result.result.storyPack;
  const error = result.result.error;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
        <span className="rounded-full bg-secondary px-3 py-1 text-secondary-foreground">
          Score: {score}
        </span>
        <span className={`rounded-full px-3 py-1 ${gateTone(gateDecision)}`}>
          Gate: {gateDecision}
        </span>
      </div>
      {error && (
        <div className="rounded-none border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Error: {error}
        </div>
      )}

      {storyPack
        ? (
          <div className="space-y-3">
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
          <Artifact className="rounded-none border border-border bg-card text-xs text-muted-foreground">
            <ArtifactHeader className="border-b border-border bg-muted/40">
              <ArtifactTitle className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Raw output
              </ArtifactTitle>
            </ArtifactHeader>
            <ArtifactContent>
              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {rawText || "No output returned."}
              </pre>
            </ArtifactContent>
          </Artifact>
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

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [health, setHealth] = useState<HealthState>({ status: "loading" });
  const [epics, setEpics] = useState<Epic[]>([]);
  const [selectedEpicId, setSelectedEpicId] = useState("");
  const [champion, setChampion] = useState<ChampionPrompt | null>(null);

  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [promptOverride, setPromptOverride] = useState("");
  const [playgroundResult, setPlaygroundResult] = useState<
    PlaygroundResponse | null
  >(null);
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
  >(null);
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

    return champion.composed;
  }, [champion]);

  const selectedEpic = useMemo(() => {
    return epics.find((epic) => epic.id === selectedEpicId) ?? epics[0] ?? null;
  }, [epics, selectedEpicId]);

  const evolutionSubject = champion?.composed
    ? "Epic -> User Stories prompt"
    : "Prompt loading...";
  const evolutionMeta = epics.length
    ? `${epics.length} epics in eval set`
    : "No epics loaded";

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    if (!("localStorage" in globalThis)) return;
    try {
      globalThis.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage write errors (private mode, blocked storage, etc.).
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

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

  const runPlayground = async (override?: string) => {
    if (!selectedEpic?.id) {
      setPlaygroundError("Select an epic to continue.");
      return;
    }

    setPlaygroundLoading(true);
    setPlaygroundError("");
    setPlaygroundResult(null);

    const overrideText = override ?? promptOverride;

    try {
      const res = await fetch("/v2/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          epicId: selectedEpic.id,
          promptOverride: overrideText.trim() || undefined,
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

  const healthLabel = health.status === "loading"
    ? "Checking API"
    : health.status === "ok"
    ? "API online"
    : "API error";

  return (
    <div className="min-h-svh bg-background text-foreground">
      <SiteHeader
        healthLabel={healthLabel}
        healthTone={healthBadgeTone}
        inFlightLabel={inFlightLabel}
        inFlightTone={inFlightTone}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <main className="flex flex-1 flex-col px-6 py-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
          <section
            id="overview"
            className="grid scroll-mt-24 gap-6 lg:grid-cols-[1.15fr_0.85fr]"
          >
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
                PromptAgent Studio
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
                Prompt optimization,
                <span className="block text-primary">
                  focused and inspectable.
                </span>
              </h1>
              <p className="text-base leading-relaxed text-muted-foreground">
                Run story generation, track optimizer progress, and keep the
                champion prompt at hand in one workspace.
              </p>
            </div>
            <div className="space-y-4 border border-border bg-card p-5 text-sm shadow-sm">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  Evolution subject
                </p>
                <p className="text-base font-semibold text-foreground">
                  {evolutionSubject}
                </p>
                <p className="text-sm text-muted-foreground">
                  {evolutionMeta}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  Selected epic
                </p>
                <p className="text-sm text-foreground">
                  {selectedEpic
                    ? `${selectedEpic.id} - ${selectedEpic.title}`
                    : "No epic selected"}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Note: Toggle dark mode from the header.
              </p>
              {health.status === "error" && health.message && (
                <p className="text-sm text-destructive">{health.message}</p>
              )}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div id="playground" className="scroll-mt-24">
              <Plan
                className="rounded-none border border-border bg-card shadow-sm"
                defaultOpen
              >
                <PlanHeader className="border-b border-border">
                  <div>
                    <PlanDescription className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      Playground
                    </PlanDescription>
                    <PlanTitle className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                      Generate and score a single epic
                    </PlanTitle>
                  </div>
                </PlanHeader>
                <PlanContent className="space-y-4 pt-2">
                  <div className="grid gap-4">
                    {playgroundLoading && (
                      <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                        <Loader className="text-primary" size={14} />
                        Generating story pack...
                      </div>
                    )}
                    <div className="space-y-2">
                      <label
                        htmlFor="playground-epic"
                        className="text-sm font-medium text-foreground"
                      >
                        Epic
                      </label>
                      <select
                        id="playground-epic"
                        className="w-full rounded-none border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                        value={selectedEpicId}
                        onChange={(event) => {
                          setSelectedEpicId(event.currentTarget.value);
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

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        Prompt override (optional)
                      </label>
                      <PromptInput
                        onSubmit={(message) => {
                          setPromptOverride(message.text);
                          return runPlayground(message.text);
                        }}
                      >
                        <PromptInputBody>
                          <PromptInputTextarea
                            value={promptOverride}
                            onChange={(event) => {
                              setPromptOverride(event.currentTarget.value);
                            }}
                          />
                        </PromptInputBody>
                        <PromptInputFooter>
                          <span>
                            Leave blank to use the current champion prompt.
                          </span>
                          <PromptInputSubmit
                            disabled={playgroundLoading || !selectedEpic?.id}
                            status={playgroundLoading ? "submitted" : undefined}
                            size="sm"
                          >
                            {playgroundLoading ? "Running..." : "Generate"}
                          </PromptInputSubmit>
                        </PromptInputFooter>
                      </PromptInput>
                    </div>
                  </div>

                  {playgroundError && (
                    <div className="rounded-none border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {playgroundError}
                    </div>
                  )}

                  {playgroundResult && (
                    <div className="rounded-none border border-primary/20 bg-primary/5 p-4 text-sm">
                      <Message from="assistant" className="max-w-full">
                        <MessageContent className="text-foreground">
                          <div className="text-sm text-foreground">
                            <PlaygroundResultView
                              result={playgroundResult}
                            />
                          </div>
                        </MessageContent>
                      </Message>
                    </div>
                  )}
                </PlanContent>
              </Plan>
            </div>

            <div id="champion" className="scroll-mt-24">
              <Plan
                className="rounded-none border border-border bg-card shadow-sm"
                defaultOpen
              >
                <PlanHeader className="border-b border-border">
                  <div>
                    <PlanDescription className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      Champion
                    </PlanDescription>
                    <PlanTitle className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                      Current prompt baseline
                    </PlanTitle>
                  </div>
                  <PlanAction>
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
                      className="rounded-none border border-border px-3 py-1 text-xs font-semibold text-foreground transition hover:bg-muted"
                    >
                      Refresh
                    </button>
                  </PlanAction>
                </PlanHeader>
                <PlanContent className="space-y-4 pt-2">
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      Base prompt and patch are stitched into the champion
                      below.
                    </p>
                    <p className="text-sm">
                      Use the playground to test variations.
                    </p>
                  </div>
                  <Artifact className="rounded-none border border-border bg-background">
                    <ArtifactContent>
                      <Message from="assistant" className="max-w-full">
                        <MessageContent className="text-foreground">
                          <MessageResponse className="text-base leading-relaxed text-foreground">
                            {championMarkdown}
                          </MessageResponse>
                        </MessageContent>
                      </Message>
                    </ArtifactContent>
                  </Artifact>
                </PlanContent>
              </Plan>
            </div>
          </section>

          <section id="optimization" className="scroll-mt-24">
            <Plan
              className="rounded-none border border-border bg-card shadow-sm"
              defaultOpen
            >
              <PlanHeader className="border-b border-border">
                <div>
                  <PlanDescription className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    Optimization
                  </PlanDescription>
                  <PlanTitle className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                    Run streaming optimization
                  </PlanTitle>
                </div>
                <PlanAction>
                  <button
                    type="button"
                    onClick={startOptimization}
                    disabled={optimizationLoading}
                    className="rounded-none bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-sm transition hover:translate-y-[-1px] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {optimizationLoading ? "Starting..." : "Start optimization"}
                  </button>
                </PlanAction>
              </PlanHeader>
              <PlanContent className="space-y-4 pt-2">
                {(optimizationLoading ||
                  optimizationTask?.status === "running") && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <Loader className="text-primary" size={14} />
                    <span>
                      {optimizationLoading
                        ? "Starting optimization..."
                        : "Optimization running..."}
                    </span>
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-4">
                  <label className="text-sm font-medium text-foreground">
                    Iterations
                    <input
                      type="number"
                      min={1}
                      className="mt-2 w-full rounded-none border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                      value={optConfig.maxIterations}
                      onChange={(event) => {
                        setOptConfig((current) => ({
                          ...current,
                          maxIterations: parsePositiveInt(
                            event.currentTarget.value,
                            current.maxIterations,
                          ),
                        }));
                      }}
                    />
                  </label>
                  <label className="text-sm font-medium text-foreground">
                    Replicates
                    <input
                      type="number"
                      min={1}
                      className="mt-2 w-full rounded-none border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                      value={optConfig.replicates}
                      onChange={(event) => {
                        setOptConfig((current) => ({
                          ...current,
                          replicates: parsePositiveInt(
                            event.currentTarget.value,
                            current.replicates,
                          ),
                        }));
                      }}
                    />
                  </label>
                  <label className="text-sm font-medium text-foreground">
                    Patch candidates
                    <input
                      type="number"
                      min={1}
                      className="mt-2 w-full rounded-none border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                      value={optConfig.patchCandidates}
                      onChange={(event) => {
                        setOptConfig((current) => ({
                          ...current,
                          patchCandidates: parsePositiveInt(
                            event.currentTarget.value,
                            current.patchCandidates,
                          ),
                        }));
                      }}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground md:mt-7">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded-none border-input"
                      checked={optConfig.metaEvolutionEnabled}
                      onChange={(event) => {
                        setOptConfig((current) => ({
                          ...current,
                          metaEvolutionEnabled: event.currentTarget.checked,
                        }));
                      }}
                    />
                    Meta-evolution
                  </label>
                </div>

                {optimizationError && (
                  <div className="rounded-none border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {optimizationError}
                  </div>
                )}

                {optimizationTask && (
                  <Artifact className="rounded-none border border-border bg-muted/30 text-sm text-foreground">
                    <ArtifactHeader className="items-start justify-between gap-4 border-b border-border bg-muted/60">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                          Status
                        </p>
                        <p className="text-lg font-semibold text-foreground">
                          {optimizationTask.status}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {optimizationTask.progress?.stepLabel ||
                            "Starting"}
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Iteration {optimizationTask.progress?.iteration ?? 0} of
                        {" "}
                        {optimizationTask.progress?.maxIterations ??
                          optConfig.maxIterations}
                      </div>
                    </ArtifactHeader>
                    <ArtifactContent className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                            Champion objective
                          </p>
                          <p className="text-lg font-semibold text-foreground">
                            {formatNumber(
                              optimizationTask.progress?.championObjective,
                              3,
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                            Total elapsed
                          </p>
                          <p className="text-lg font-semibold text-foreground">
                            {formatMs(
                              optimizationTask.progress?.totalElapsed,
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                            Final objective
                          </p>
                          <p className="text-lg font-semibold text-foreground">
                            {formatNumber(
                              optimizationTask.result?.finalObjective,
                              3,
                            )}
                          </p>
                        </div>
                      </div>

                      {optimizationTask.result?.championPatch && (
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                            Champion patch
                          </p>
                          <Message from="assistant" className="mt-2 max-w-full">
                            <MessageContent className="text-foreground">
                              <MessageResponse className="text-sm leading-relaxed text-foreground">
                                {wrapCodeBlock(
                                  optimizationTask.result.championPatch,
                                )}
                              </MessageResponse>
                            </MessageContent>
                          </Message>
                        </div>
                      )}
                    </ArtifactContent>
                  </Artifact>
                )}
              </PlanContent>
            </Plan>
          </section>
        </div>
      </main>
    </div>
  );
}
