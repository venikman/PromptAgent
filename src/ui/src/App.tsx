import { useEffect, useMemo, useState } from "react";
import {
  CircleGaugeIcon,
  PenLineIcon,
  RepeatIcon,
  SearchIcon,
  TargetIcon,
  TrophyIcon,
  WandSparklesIcon,
} from "lucide-react";
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

type OptimizationStepKey =
  | "initializing"
  | "evaluating_champion"
  | "mining_pairs"
  | "generating_patches"
  | "tournament"
  | "promotion"
  | "meta_evolution"
  | "checkpointing"
  | "completed"
  | "failed";

type OptimizationTask = {
  taskId: string;
  status: "pending" | "running" | "completed" | "failed";
  config?: Record<string, unknown>;
  progress?: Record<string, unknown> & {
    step?: OptimizationStepKey;
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

type OptimizationConfig = {
  maxIterations: number;
  replicates: number;
  patchCandidates: number;
  metaEvolutionEnabled: boolean;
};

type FlowStepIcon = (props: { className?: string }) => JSX.Element;

type FlowStepDetail = {
  label: string;
  value: string;
};

type FlowStep = {
  title: string;
  description?: string;
  meta?: string;
  icon?: FlowStepIcon;
  details?: FlowStepDetail[];
};

type FlowDiagram = {
  id: "playground" | "optimization";
  kicker: string;
  title: string;
  description?: string;
  steps: FlowStep[];
  outcome: string;
  layout?: "linear" | "cycle";
  loopLabel?: string;
  inputs?: string[];
  explanation?: FlowExplanation;
};

type FlowExplanation = {
  title: string;
  summary: string;
  items: Array<{ label: string; icon: FlowStepIcon }>;
  note?: string;
};

const PLAYGROUND_STEPS: FlowStep[] = [
  {
    title: "Select epic",
    description: "Choose the epic to decompose.",
    icon: TargetIcon,
    details: [
      { label: "Input", value: "Epic list" },
      { label: "Output", value: "Chosen epic" },
    ],
  },
  {
    title: "Assemble prompt",
    description: "Champion prompt + override.",
    icon: PenLineIcon,
    details: [
      { label: "Input", value: "Champion + override" },
      { label: "Output", value: "Final prompt" },
    ],
  },
  {
    title: "Generate stories",
    description: "Model drafts the story pack.",
    icon: WandSparklesIcon,
    details: [
      { label: "Input", value: "Epic + prompt" },
      { label: "Output", value: "Story pack" },
    ],
  },
  {
    title: "Score and review",
    description: "Scorer gates and returns output.",
    icon: CircleGaugeIcon,
    details: [
      { label: "Input", value: "Story pack" },
      { label: "Output", value: "Score + gate" },
    ],
  },
];

const OPTIMIZATION_STEPS: FlowStep[] = [
  {
    title: "Score baseline",
    description: "Run all epics to set baseline.",
    icon: CircleGaugeIcon,
    details: [
      { label: "Input", value: "Current prompt" },
      { label: "Output", value: "Baseline score" },
    ],
  },
  {
    title: "Compare outputs",
    description: "Find strong vs weak examples.",
    icon: SearchIcon,
    details: [
      { label: "Input", value: "Scored runs" },
      { label: "Output", value: "Strengths/weaknesses" },
    ],
  },
  {
    title: "Try tweaks",
    description: "Generate patch candidates.",
    icon: PenLineIcon,
    details: [
      { label: "Input", value: "Contrast pairs" },
      { label: "Output", value: "Patch candidates" },
    ],
  },
  {
    title: "Keep winner",
    description: "Re-test and promote best.",
    icon: TrophyIcon,
    details: [
      { label: "Input", value: "Candidate scores" },
      { label: "Output", value: "New champion" },
    ],
  },
];

const OPTIMIZATION_STAGE_ORDER = [
  "score",
  "compare",
  "tweak",
  "promote",
] as const;

type OptimizationStageKey = typeof OPTIMIZATION_STAGE_ORDER[number];

const resolveOptimizationStage = (
  step?: OptimizationStepKey,
): OptimizationStageKey | null => {
  switch (step) {
    case "evaluating_champion":
      return "score";
    case "mining_pairs":
      return "compare";
    case "generating_patches":
    case "meta_evolution":
      return "tweak";
    case "tournament":
    case "promotion":
    case "checkpointing":
      return "promote";
    case "completed":
    case "failed":
      return "promote";
    default:
      return null;
  }
};

const OPTIMIZATION_STEP_ACTIVITY: Record<
  OptimizationStepKey,
  { action: string; waiting: string }
> = {
  initializing: {
    action: "Booting optimizer and loading inputs.",
    waiting: "Config + baseline prompt.",
  },
  evaluating_champion: {
    action: "Scoring the current champion across epics.",
    waiting: "Scoring results.",
  },
  mining_pairs: {
    action: "Comparing strong vs weak outputs.",
    waiting: "Contrast analysis.",
  },
  generating_patches: {
    action: "Drafting patch candidates.",
    waiting: "Patch proposals.",
  },
  tournament: {
    action: "Testing candidate patches.",
    waiting: "Candidate scores.",
  },
  promotion: {
    action: "Promoting the best patch.",
    waiting: "Champion update.",
  },
  meta_evolution: {
    action: "Exploring meta-evo variations.",
    waiting: "Meta patches.",
  },
  checkpointing: {
    action: "Saving the latest winner.",
    waiting: "Checkpoint write.",
  },
  completed: {
    action: "Optimization complete.",
    waiting: "Final summary.",
  },
  failed: {
    action: "Optimization failed.",
    waiting: "Error details.",
  },
};

const getOptimizationActivity = (step?: OptimizationStepKey) => {
  if (!step) {
    return {
      action: "Waiting for the first status update.",
      waiting: "Server initialization.",
    };
  }
  return OPTIMIZATION_STEP_ACTIVITY[step] ?? {
    action: "Running optimization.",
    waiting: "Status update.",
  };
};

const FLOW_DIAGRAMS: FlowDiagram[] = [
  {
    id: "playground",
    kicker: "Playground flow",
    title: "Single epic, end-to-end",
    description: "Pick, run, and review in one sweep.",
    steps: PLAYGROUND_STEPS,
    outcome: "Results and raw output show below.",
  },
  {
    id: "optimization",
    kicker: "Optimization flow",
    title: "Champion search loop",
    description: "Simple loop to keep the best prompt.",
    layout: "cycle",
    loopLabel: "Repeat until it stops improving.",
    steps: OPTIMIZATION_STEPS,
    outcome: "Best prompt stays active.",
  },
];

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
const TELEMETRY_POLL_MS = 30000;
const OPTIMIZATION_POLL_MS = 10000;

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

const cycleStepStyle = (index: number, total: number, radius: number) => {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;
  return {
    transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
  };
};

const StoryCard = (
  { story, index }: { story: StoryPack["userStories"][number]; index: number },
) => {
  const storyPoints =
    story.ado?.fields?.["Microsoft.VSTS.Scheduling.StoryPoints"];
  const criteria = Array.isArray(story.acceptanceCriteria)
    ? story.acceptanceCriteria
    : [];

  return (
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
        {typeof storyPoints === "number" && (
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
            {storyPoints} pts
          </span>
        )}
      </ArtifactHeader>
      <ArtifactContent className="space-y-2 pt-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Acceptance criteria
        </p>
        {criteria.length ? (
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-foreground/90">
            {criteria.map((item, itemIndex) => (
              <li key={`${story.title}-${itemIndex}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No acceptance criteria provided.
          </p>
        )}
      </ArtifactContent>
    </Artifact>
  );
};

const FlowExplanationPanel = (
  { explanation }: { explanation: FlowExplanation },
) => (
  <div className="rounded-none border border-border bg-muted/30 p-4 text-sm">
    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
      {explanation.title}
    </p>
    <p className="mt-2 text-sm text-foreground">{explanation.summary}</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {explanation.items.map((item) => {
        const ItemIcon = item.icon;
        return (
          <div
            key={`${explanation.title}-${item.label}`}
            className="flex items-center gap-2 rounded-none border border-border/60 bg-background/70 px-2.5 py-2"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">
              <ItemIcon className="h-4 w-4" />
            </span>
            <span className="text-xs font-semibold text-foreground">
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
    {explanation.note && (
      <p className="mt-3 text-xs text-muted-foreground">
        {explanation.note}
      </p>
    )}
  </div>
);

const FlowStepCard = (
  {
    step,
    index,
    size = "md",
    className,
    statusLabel,
    statusTone,
  }: {
    step: FlowStep;
    index: number;
    size?: "sm" | "md";
    className?: string;
    statusLabel?: string;
    statusTone?: "active" | "done" | "pending";
  },
) => {
  const StepIcon = step.icon;
  const isSmall = size === "sm";
  const badgeClass = isSmall
    ? "h-6 w-6 text-[0.65rem]"
    : "h-7 w-7 text-xs";
  const titleClass = isSmall ? "text-xs" : "text-sm";
  const descClass = isSmall ? "text-[0.65rem]" : "text-xs";
  const metaClass = isSmall ? "text-[0.55rem]" : "text-[0.6rem]";
  const detailLabelClass = isSmall ? "text-[0.55rem]" : "text-[0.6rem]";
  const detailValueClass = isSmall ? "text-[0.65rem]" : "text-[0.7rem]";
  const iconClass = isSmall ? "h-3.5 w-3.5" : "h-4 w-4";
  const statusToneClass = statusTone === "active"
    ? "border-primary/30 bg-primary/10 text-primary"
    : statusTone === "done"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
    : "border-border/60 bg-muted/40 text-muted-foreground";

  return (
    <div
      className={`h-full rounded-none border border-border bg-muted/40 px-3 py-3 ${
        className ?? ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`flex items-center justify-center rounded-full bg-primary/10 font-semibold text-primary ${badgeClass}`}
        >
          {index + 1}
        </span>
        {StepIcon && <StepIcon className={iconClass} />}
      </div>
      {statusLabel && (
        <span
          className={`mt-2 inline-flex items-center rounded-full border px-2 py-0.5 uppercase tracking-[0.2em] ${metaClass} ${statusToneClass}`}
        >
          {statusLabel}
        </span>
      )}
      <p className={`mt-2 font-semibold text-foreground ${titleClass}`}>
        {step.title}
      </p>
      {step.description && (
        <p className={`text-muted-foreground ${descClass}`}>
          {step.description}
        </p>
      )}
      {step.details && step.details.length > 0 && (
        <div className="mt-2 space-y-1">
          {step.details.map((detail) => (
            <div
              key={`${step.title}-${detail.label}`}
              className="flex items-center gap-2"
            >
              <span
                className={`uppercase tracking-[0.2em] text-muted-foreground ${detailLabelClass}`}
              >
                {detail.label}
              </span>
              <span className={`text-muted-foreground ${detailValueClass}`}>
                {detail.value}
              </span>
            </div>
          ))}
        </div>
      )}
      {step.meta && (
        <span
          className={`mt-2 inline-flex items-center rounded-full border border-border/60 px-2 py-0.5 uppercase tracking-[0.2em] text-muted-foreground ${metaClass}`}
        >
          {step.meta}
        </span>
      )}
    </div>
  );
};

const FlowDiagramCard = ({ diagram }: { diagram: FlowDiagram }) => (
  <div className="rounded-none border border-border bg-card p-5 text-sm shadow-sm">
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
        {diagram.kicker}
      </p>
      <h2 className="text-lg font-semibold text-foreground">
        {diagram.title}
      </h2>
      {diagram.description && (
        <p className="text-sm text-muted-foreground">{diagram.description}</p>
      )}
    </div>
    {diagram.inputs && diagram.inputs.length > 0 && (
      <div className="mt-3 flex flex-wrap gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
        {diagram.inputs.map((input) => (
          <span
            key={`${diagram.title}-${input}`}
            className="rounded-full border border-border bg-muted/40 px-2.5 py-1"
          >
            {input}
          </span>
        ))}
      </div>
    )}

    {diagram.layout === "cycle"
      ? (
        <div className="mt-4 space-y-3">
          <ol
            className="grid gap-3 md:grid-cols-4"
            aria-label={`${diagram.title} steps`}
          >
            {diagram.steps.map((step, index) => (
              <li
                key={`${diagram.title}-${step.title}`}
                className="relative md:pr-6"
              >
                <FlowStepCard step={step} index={index} />
                {index < diagram.steps.length - 1 && (
                  <>
                    <span className="pointer-events-none absolute right-2 top-1/2 hidden h-px w-5 -translate-y-1/2 bg-border md:block" />
                    <span className="pointer-events-none absolute right-1 top-1/2 hidden h-2 w-2 -translate-y-1/2 rotate-45 border-t border-r border-border md:block" />
                  </>
                )}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-2 rounded-none border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2 font-semibold text-foreground">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-primary">
                <RepeatIcon className="h-3.5 w-3.5" />
              </span>
              Loop
            </span>
            <span>
              {diagram.loopLabel ?? "Repeat until the iteration cap is reached."}
            </span>
          </div>
        </div>
      )
      : (
        <ol
          className="mt-4 grid gap-3 md:grid-cols-4"
          aria-label={`${diagram.title} steps`}
        >
          {diagram.steps.map((step, index) => (
            <li
              key={`${diagram.title}-${step.title}`}
              className="relative md:pr-6"
            >
              <FlowStepCard step={step} index={index} />
              {index < diagram.steps.length - 1 && (
                <>
                  <span className="pointer-events-none absolute right-2 top-1/2 hidden h-px w-5 -translate-y-1/2 bg-border md:block" />
                  <span className="pointer-events-none absolute right-1 top-1/2 hidden h-2 w-2 -translate-y-1/2 rotate-45 border-t border-r border-border md:block" />
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    <p className="mt-4 text-xs text-muted-foreground">
      Outcome: {diagram.outcome}
    </p>
  </div>
);

const OptimizationKickoff = (
  {
    currentStep,
    currentStepLabel,
    progress,
    config,
  }: {
    currentStep?: OptimizationStepKey;
    currentStepLabel?: string;
    progress?: OptimizationTask["progress"];
    config: OptimizationConfig;
  },
) => {
  const activeStage = resolveOptimizationStage(currentStep);
  const activeIndex = activeStage
    ? OPTIMIZATION_STAGE_ORDER.indexOf(activeStage)
    : -1;
  const activeStep = activeIndex >= 0 ? OPTIMIZATION_STEPS[activeIndex] : null;
  const nextStep = activeIndex === -1
    ? OPTIMIZATION_STEPS[0]
    : OPTIMIZATION_STEPS[activeIndex + 1];
  const iteration = progress?.iteration ?? 0;
  const maxIterations = progress?.maxIterations ?? config.maxIterations;
  const iterationPct = maxIterations > 0
    ? Math.min(1, iteration / maxIterations)
    : 0;
  const focusTitle = activeStep?.title ?? "Preparing run";
  const focusDescription = activeStep?.description ??
    "Warming up the run and loading inputs.";
  const focusDetails = activeStep?.details ?? [
    { label: "Input", value: "Run config" },
    { label: "Output", value: "Baseline ready" },
  ];
  const activity = getOptimizationActivity(currentStep);

  return (
    <div className="rounded-none border border-border bg-muted/30 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            During optimization
          </p>
          <p className="mt-2 text-lg font-semibold text-foreground">
            {focusTitle}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {focusDescription}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
            {focusDetails.map((detail) => (
              <span
                key={`${detail.label}-${detail.value}`}
                className="rounded-full border border-border/70 bg-background/60 px-2.5 py-1"
              >
                {detail.label}: {detail.value}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-none border border-border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
          <p className="uppercase tracking-[0.3em]">System step</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {currentStepLabel ?? "Initializing"}
          </p>
          {nextStep && (
            <p className="mt-2 text-xs text-muted-foreground">
              Next:{" "}
              <span className="font-semibold text-foreground">
                {nextStep.title}
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[2fr_1fr_1fr]">
        <div className="rounded-none border border-border bg-background/70 px-3 py-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span className="uppercase tracking-[0.3em]">Iteration</span>
            <span className="text-sm font-semibold text-foreground">
              {iteration} / {maxIterations}
            </span>
          </div>
          <div className="mt-2 h-1 w-full bg-border">
            <div
              className="h-1 bg-primary"
              style={{ width: `${iterationPct * 100}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
            <span className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1">
              {config.replicates} reruns
            </span>
            <span className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1">
              {config.patchCandidates} variations
            </span>
            {config.metaEvolutionEnabled && (
              <span className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1">
                meta-evo on
              </span>
            )}
          </div>
        </div>
        <div className="rounded-none border border-border bg-background/70 px-3 py-3 text-xs text-muted-foreground">
          <p className="uppercase tracking-[0.3em]">Run signals</p>
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between">
              <span>Elapsed</span>
              <span className="font-semibold text-foreground">
                {formatMs(progress?.totalElapsed)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Champion score</span>
              <span className="font-semibold text-foreground">
                {formatNumber(progress?.championObjective, 3)}
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-none border border-border bg-background/70 px-3 py-3 text-xs text-muted-foreground">
          <p className="uppercase tracking-[0.3em]">Server activity</p>
          <div className="mt-2 space-y-2">
            <div>
              <span className="uppercase tracking-[0.2em] text-muted-foreground">
                Doing
              </span>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {activity.action}
              </p>
            </div>
            <div>
              <span className="uppercase tracking-[0.2em] text-muted-foreground">
                Waiting on
              </span>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {activity.waiting}
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        The optimizer runs this loop automatically:
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        {OPTIMIZATION_STEPS.map((step, index) => {
          const isActive = activeIndex === index;
          const isDone = activeIndex !== -1 && index < activeIndex;
          const isNext = activeIndex !== -1 && index === activeIndex + 1;
          const toneClass = isActive
            ? "border-primary/40 bg-primary/10"
            : isDone
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-border bg-background";
          const statusLabel = isActive
            ? "Now"
            : isDone
            ? "Done"
            : isNext
            ? "Next"
            : undefined;
          const statusTone = isActive
            ? "active"
            : isDone
            ? "done"
            : "pending";

          return (
            <FlowStepCard
              key={`kickoff-${step.title}`}
              step={step}
              index={index}
              size="md"
              className={toneClass}
              statusLabel={statusLabel}
              statusTone={statusLabel ? statusTone : undefined}
            />
          );
        })}
      </div>
    </div>
  );
};

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

  const [optConfig, setOptConfig] = useState<OptimizationConfig>({
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
    let intervalId: number | null = null;
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

    const start = () => {
      if (intervalId) return;
      poll();
      intervalId = globalThis.setInterval(poll, TELEMETRY_POLL_MS);
    };

    const stop = () => {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
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
    let inFlight = false;
    let done = false;

    const poll = async () => {
      if (inFlight || done) return;
      inFlight = true;
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
          done = true;
          stop();
        }
      } catch (err) {
        if (!cancelled) {
          setOptimizationError(
            err instanceof Error ? err.message : String(err),
          );
        }
        done = true;
        stop();
      } finally {
        inFlight = false;
      }
    };

    const start = () => {
      if (intervalId || done) return;
      poll();
      intervalId = globalThis.setInterval(poll, OPTIMIZATION_POLL_MS);
    };

    const stop = () => {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
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

          <section id="flow-playground" className="grid scroll-mt-24 gap-6">
            {FLOW_DIAGRAMS.filter((diagram) => diagram.id === "playground").map(
              (diagram) => (
                <FlowDiagramCard key={diagram.title} diagram={diagram} />
              ),
            )}
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
                          .then((res) => {
                            if (!res.ok) {
                              throw new Error(`HTTP ${res.status}`);
                            }
                            return readJson<ChampionPrompt>(res);
                          })
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
                {(optimizationLoading ||
                  optimizationTask?.status === "running") && (
                  <OptimizationKickoff
                    currentStep={optimizationTask?.progress?.step}
                    currentStepLabel={optimizationTask?.progress?.stepLabel}
                    progress={optimizationTask?.progress}
                    config={optConfig}
                  />
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
                        const value = event.currentTarget?.value ?? "";
                        setOptConfig((current) => ({
                          ...current,
                          maxIterations: parsePositiveInt(
                            value,
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
                        const value = event.currentTarget?.value ?? "";
                        setOptConfig((current) => ({
                          ...current,
                          replicates: parsePositiveInt(
                            value,
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
                        const value = event.currentTarget?.value ?? "";
                        setOptConfig((current) => ({
                          ...current,
                          patchCandidates: parsePositiveInt(
                            value,
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

          <section id="flow-optimization" className="grid scroll-mt-24 gap-6">
            {FLOW_DIAGRAMS.filter(
              (diagram) => diagram.id === "optimization",
            ).map((diagram) => (
              <FlowDiagramCard key={diagram.title} diagram={diagram} />
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}
