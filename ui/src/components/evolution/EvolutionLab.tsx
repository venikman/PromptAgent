import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ContrastPair, DistRun, PromptDistReport } from "@/types";
import { ContrastivePairs } from "./ContrastivePairs";
import { PatchEditor } from "./PatchEditor";
import { TournamentView } from "./TournamentView";
import {
  MetaEvolutionView,
  DEMO_MUTATION_PROMPTS,
  DEMO_GENERATION_STATS,
  type MutationPrompt,
  type GenerationStats,
} from "./MetaEvolutionView";
import {
  IconArrowsExchange,
  IconDna,
  IconTrophy,
  IconDatabase,
  IconArrowRight,
  IconLoader2,
  IconPlayerPlay,
  IconFlame,
} from "@tabler/icons-react";

// Demo data for visualization without backend
const DEMO_BASE_PROMPT = `You are an expert Business Analyst specializing in Agile methodology.
Given an Epic description, generate a complete StoryPack with user stories.

Requirements:
- Each user story must follow the format: "As a [role], I want [feature], so that [benefit]"
- Include acceptance criteria for each story
- Estimate story points using Fibonacci sequence
- Identify assumptions, risks, and follow-up questions`;

const DEMO_CURRENT_PATCH = `Additional Guidelines:
- Ensure acceptance criteria are testable and specific
- Include edge cases in acceptance criteria
- Consider security implications for each story`;

const createDemoRun = (
  seed: number,
  score: number,
  pass: boolean,
  epicId: string,
  epicTitle: string,
): DistRun => ({
  seed,
  score,
  pass,
  storyPack: pass
    ? {
        epicId,
        epicTitle,
        userStories: Array(Math.floor(3 + Math.random() * 4)).fill({} as any),
        assumptions: [],
        risks: [],
        followUps: [],
      }
    : null,
  rawText: pass
    ? `Generated ${Math.floor(3 + Math.random() * 4)} user stories for ${epicTitle}...`
    : "Error: Schema validation failed",
  error: pass ? undefined : "Schema validation failed",
});

const DEMO_PAIRS: ContrastPair[] = [
  {
    epicId: "E-101",
    bad: createDemoRun(42, 0.45, true, "E-101", "SSO + MFA Integration"),
    good: createDemoRun(43, 0.85, true, "E-101", "SSO + MFA Integration"),
    similarity: 0.91,
    scoreDelta: 0.4,
  },
  {
    epicId: "E-303",
    bad: createDemoRun(44, 0.38, true, "E-303", "Invoice Export Feature"),
    good: createDemoRun(45, 0.72, true, "E-303", "Invoice Export Feature"),
    similarity: 0.88,
    scoreDelta: 0.34,
  },
  {
    epicId: "E-202",
    bad: createDemoRun(46, 0.52, true, "E-202", "Search Functionality"),
    good: createDemoRun(47, 0.79, true, "E-202", "Search Functionality"),
    similarity: 0.85,
    scoreDelta: 0.27,
  },
];

const DEMO_PATCH_CANDIDATES = [
  {
    id: "patch-1",
    patch: `When writing acceptance criteria:
- Include at least 3 testable conditions per story
- Cover happy path, error cases, and edge cases
- Use "Given/When/Then" format for clarity`,
    rationale:
      "The good outputs consistently had more specific, testable acceptance criteria. The bad outputs often had vague criteria like 'should work correctly' without measurable conditions.",
    targetedIssue: "Vague acceptance criteria",
  },
  {
    id: "patch-2",
    patch: `For security-related features:
- Always include authentication/authorization stories
- Add acceptance criteria for security edge cases
- Consider data validation and sanitization`,
    rationale:
      "Analysis shows that epics involving user data had lower scores when security stories were missing. The good outputs proactively addressed security concerns.",
    targetedIssue: "Missing security considerations",
  },
  {
    id: "patch-3",
    patch: `Story point estimation guidance:
- 1-2 points: Simple UI changes, config updates
- 3-5 points: New features with moderate complexity
- 8-13 points: Complex features requiring multiple integrations`,
    rationale:
      "Inconsistent story point estimation was flagged in the bad outputs. Good outputs showed calibrated estimates with clear rationale.",
    targetedIssue: "Inconsistent estimation",
  },
];

const DEMO_TOURNAMENT_CANDIDATES = [
  {
    id: "champion",
    name: "Champion v3",
    objective: 0.72,
    passRate: 0.867,
    meanScore: 0.697,
    p10Score: 0.53,
    isChampion: true,
    deltaVsChampion: 0,
    runsCompleted: 15,
    totalRuns: 15,
  },
  {
    id: "patch-1",
    name: "Patch #1 (Acceptance Criteria)",
    objective: 0.78,
    passRate: 0.933,
    meanScore: 0.752,
    p10Score: 0.61,
    isChampion: false,
    deltaVsChampion: 0.06,
    runsCompleted: 15,
    totalRuns: 15,
  },
  {
    id: "patch-2",
    name: "Patch #2 (Security)",
    objective: 0.71,
    passRate: 0.867,
    meanScore: 0.685,
    p10Score: 0.52,
    isChampion: false,
    deltaVsChampion: -0.01,
    runsCompleted: 15,
    totalRuns: 15,
  },
  {
    id: "patch-3",
    name: "Patch #3 (Estimation)",
    objective: 0.69,
    passRate: 0.8,
    meanScore: 0.668,
    p10Score: 0.48,
    isChampion: false,
    deltaVsChampion: -0.03,
    runsCompleted: 12,
    totalRuns: 15,
  },
];

type DataMode = "empty" | "demo" | "live";
type EvolutionStep = "pairs" | "patches" | "tournament" | "meta";
type PatchCandidate = {
  id: string;
  patch: string;
  rationale: string;
  targetedIssue: string;
  composedPrompt?: string;
};

type TournamentCandidate = {
  id: string;
  name: string;
  objective: number;
  passRate: number;
  meanScore: number;
  p10Score: number;
  isChampion: boolean;
  deltaVsChampion: number;
  runsCompleted: number;
  totalRuns: number;
};

type TournamentTaskResponse = {
  taskId: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: {
    candidateIdx: number;
    totalCandidates: number;
    runsCompleted: number;
    totalRuns: number;
  };
  candidates: TournamentCandidate[];
  championObjective: number;
  winner?: { id: string; objective: number; deltaVsChampion: number };
  error?: string;
};

export function EvolutionLab() {
  // Ref to track component mount state (prevents state updates after unmount)
  const mountedRef = useRef(true);

  const [dataMode, setDataMode] = useState<DataMode>("empty");
  const [loading, setLoading] = useState(false);
  const [pairs, setPairs] = useState<ContrastPair[]>([]);
  const [patchCandidates, setPatchCandidates] = useState<PatchCandidate[]>([]);
  const [activeStep, setActiveStep] = useState<EvolutionStep>("pairs");
  const [mutationPrompts, setMutationPrompts] = useState<MutationPrompt[]>([]);
  const [generationStats, setGenerationStats] = useState<GenerationStats[]>([]);
  const [currentGeneration, setCurrentGeneration] = useState(0);
  const [basePrompt, setBasePrompt] = useState(DEMO_BASE_PROMPT);
  const [currentPatch, setCurrentPatch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [miningPairs, setMiningPairs] = useState(false);
  const [generatingPatches, setGeneratingPatches] = useState(false);
  const [tournamentCandidates, setTournamentCandidates] = useState<
    TournamentCandidate[]
  >([]);
  const [runningTournament, setRunningTournament] = useState(false);
  const [tournamentProgress, setTournamentProgress] = useState<{
    runsCompleted: number;
    totalRuns: number;
  } | null>(null);

  // Cleanup mounted ref on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load champion prompt on mount
  useEffect(() => {
    fetch("/champion")
      .then((res) => res.json())
      .then((data) => {
        if (data.base) setBasePrompt(data.base);
        if (data.patch) setCurrentPatch(data.patch);
      })
      .catch(() => {});
  }, []);

  const handleLoadDemo = () => {
    setLoading(true);
    setTimeout(() => {
      setPairs(DEMO_PAIRS);
      setPatchCandidates(DEMO_PATCH_CANDIDATES);
      setCurrentPatch(DEMO_CURRENT_PATCH);
      setMutationPrompts(DEMO_MUTATION_PROMPTS);
      setGenerationStats(DEMO_GENERATION_STATS);
      setCurrentGeneration(DEMO_GENERATION_STATS.length - 1);
      setDataMode("demo");
      setLoading(false);
    }, 800);
  };

  const handleClear = () => {
    setPairs([]);
    setPatchCandidates([]);
    setTournamentCandidates([]);
    setTournamentProgress(null);
    setMutationPrompts([]);
    setGenerationStats([]);
    setCurrentGeneration(0);
    setError(null);
    setDataMode("empty");
    setActiveStep("pairs");
  };

  // Run tournament with patch candidates
  const handleRunTournament = async () => {
    if (patchCandidates.length === 0) {
      setError("No patch candidates. Generate patches first.");
      return;
    }

    setRunningTournament(true);
    setError(null);
    setTournamentCandidates([]);
    setTournamentProgress(null);

    try {
      // Start tournament
      const patches = patchCandidates.map((p, i) => ({
        id: p.id,
        patch: p.patch,
        name: p.targetedIssue
          ? `Patch #${i + 1} (${p.targetedIssue})`
          : `Patch #${i + 1}`,
      }));

      const startRes = await fetch("/run-tournament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patches, replicates: 3 }),
      });

      if (!startRes.ok) {
        throw new Error(`HTTP ${startRes.status}`);
      }

      const { taskId } = await startRes.json();

      // Poll for results using chained setTimeout (avoids race conditions)
      // Timeout after 5 minutes (150 polls × 2s interval)
      const MAX_POLL_ATTEMPTS = 150;
      let pollCount = 0;

      const poll = async () => {
        // Skip if component unmounted
        if (!mountedRef.current) return;

        // Timeout guard
        if (++pollCount > MAX_POLL_ATTEMPTS) {
          setRunningTournament(false);
          setError("Tournament timed out after 5 minutes");
          return;
        }

        try {
          const pollRes = await fetch(`/tournament/${taskId}`);
          if (!pollRes.ok) {
            throw new Error(`HTTP ${pollRes.status}`);
          }

          const data: TournamentTaskResponse = await pollRes.json();

          // Check again after async operation
          if (!mountedRef.current) return;

          setTournamentProgress({
            runsCompleted: data.progress.runsCompleted,
            totalRuns: data.progress.totalRuns,
          });
          setTournamentCandidates(data.candidates);

          if (data.status === "completed") {
            setRunningTournament(false);
            setActiveStep("tournament");
          } else if (data.status === "failed") {
            setRunningTournament(false);
            setError(data.error || "Tournament failed");
          } else {
            // Schedule next poll only after current one completes
            setTimeout(poll, 2000);
          }
        } catch (err) {
          if (!mountedRef.current) return;
          setRunningTournament(false);
          setError(
            err instanceof Error ? err.message : "Failed to poll tournament",
          );
        }
      };
      poll();
    } catch (err) {
      setRunningTournament(false);
      setError(
        err instanceof Error ? err.message : "Failed to start tournament",
      );
    }
  };

  // Mine contrastive pairs from evaluation report
  const handleMinePairs = async (report: PromptDistReport) => {
    setMiningPairs(true);
    setError(null);

    try {
      const res = await fetch("/mine-pairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setMiningPairs(false);
        return;
      }

      // Transform backend format to frontend format
      const frontendPairs: ContrastPair[] = (data.pairs || []).map(
        (p: any) => ({
          epicId: p.epicId,
          bad: {
            seed: p.bad.seed,
            score: p.bad.score,
            pass: p.bad.pass ?? true,
            storyPack: p.bad.storyPack,
            rawText: p.bad.rawText || "",
          },
          good: {
            seed: p.good.seed,
            score: p.good.score,
            pass: p.good.pass ?? true,
            storyPack: p.good.storyPack,
            rawText: p.good.rawText || "",
          },
          similarity: p.similarity,
          scoreDelta: p.scoreDelta,
        }),
      );

      setPairs(frontendPairs);
      setDataMode("live");
      setMiningPairs(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mine pairs");
      setMiningPairs(false);
    }
  };

  // Generate patches from pairs
  const handleGeneratePatches = async () => {
    if (pairs.length === 0) {
      setError("No pairs available. Mine pairs first.");
      return;
    }

    setGeneratingPatches(true);
    setError(null);

    try {
      // Transform pairs to backend format
      const backendPairs = pairs.map((p) => ({
        epicId: p.epicId,
        good: p.good,
        bad: p.bad,
        sim: p.similarity,
        delta: p.scoreDelta,
      }));

      const res = await fetch("/generate-patches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairs: backendPairs, count: 3 }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setGeneratingPatches(false);
        return;
      }

      setPatchCandidates(data.candidates || []);
      setActiveStep("patches");
      setGeneratingPatches(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate patches",
      );
      setGeneratingPatches(false);
    }
  };

  // Load evaluation report from localStorage
  const handleLoadFromEval = () => {
    const stored = localStorage.getItem("lastEvalReport");
    if (!stored) {
      setError(
        "No evaluation report found. Run an evaluation in the Evaluation tab first, then return here to evolve the prompt.",
      );
      return;
    }

    try {
      const report = JSON.parse(stored) as PromptDistReport;
      setError(null);
      // Automatically mine pairs from the loaded report
      handleMinePairs(report);
    } catch {
      setError("Failed to parse stored evaluation report.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Educational Header */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Flow C: Evolution Loop</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The evolution loop improves prompts through{" "}
              <span className="font-medium text-foreground">
                contrastive pair mining
              </span>
              . We find outputs where the same epic produced both good and bad
              results (similar inputs, different quality). These pairs reveal
              what the prompt needs to improve, guiding patch generation.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Select
              value={dataMode}
              onValueChange={(v) => {
                if (v === "demo") handleLoadDemo();
                else if (v === "empty") handleClear();
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="empty">No Data</SelectItem>
                <SelectItem value="demo">Demo Data</SelectItem>
                <SelectItem value="live" disabled>
                  Live Data
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Demo Mode Banner */}
      {dataMode === "demo" && (
        <div className="flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 p-3">
          <IconDatabase className="h-4 w-4 text-blue-600" />
          <p className="text-sm text-blue-600">
            <span className="font-medium">Demo Mode:</span> Showing sample
            evolution data. This simulates 3 contrastive pairs, 3 patch
            candidates, and a tournament with 4 participants.
          </p>
        </div>
      )}

      {/* Live Mode Banner */}
      {dataMode === "live" && (
        <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 p-3">
          <IconPlayerPlay className="h-4 w-4 text-green-600" />
          <p className="text-sm text-green-600">
            <span className="font-medium">Live Data:</span> Pairs mined from
            actual evaluation results.
          </p>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">
            <span className="font-medium">Error:</span> {error}
          </p>
        </div>
      )}

      {/* Pipeline Steps Indicator */}
      <div className="flex items-center justify-center gap-2 py-2 flex-wrap">
        <Badge
          variant={activeStep === "pairs" ? "default" : "outline"}
          className="cursor-pointer gap-1"
          onClick={() => setActiveStep("pairs")}
        >
          <IconArrowsExchange className="h-3.5 w-3.5" />
          1. Mine Pairs
        </Badge>
        <IconArrowRight className="h-4 w-4 text-muted-foreground" />
        <Badge
          variant={activeStep === "patches" ? "default" : "outline"}
          className="cursor-pointer gap-1"
          onClick={() => setActiveStep("patches")}
        >
          <IconDna className="h-3.5 w-3.5" />
          2. Generate Patches
        </Badge>
        <IconArrowRight className="h-4 w-4 text-muted-foreground" />
        <Badge
          variant={activeStep === "tournament" ? "default" : "outline"}
          className="cursor-pointer gap-1"
          onClick={() => setActiveStep("tournament")}
        >
          <IconTrophy className="h-3.5 w-3.5" />
          3. Tournament
        </Badge>
        <IconArrowRight className="h-4 w-4 text-muted-foreground" />
        <Badge
          variant={activeStep === "meta" ? "default" : "outline"}
          className="cursor-pointer gap-1"
          onClick={() => setActiveStep("meta")}
        >
          <IconFlame className="h-3.5 w-3.5" />
          4. Meta-Evolution
        </Badge>
      </div>

      {/* Step Content */}
      <Tabs
        value={activeStep}
        onValueChange={(v) => setActiveStep(v as typeof activeStep)}
      >
        <TabsList className="hidden">
          <TabsTrigger value="pairs">Pairs</TabsTrigger>
          <TabsTrigger value="patches">Patches</TabsTrigger>
          <TabsTrigger value="tournament">Tournament</TabsTrigger>
          <TabsTrigger value="meta">Meta-Evolution</TabsTrigger>
        </TabsList>

        <TabsContent value="pairs" className="mt-0">
          <ContrastivePairs pairs={pairs} loading={loading} />
        </TabsContent>

        <TabsContent value="patches" className="mt-0">
          <PatchEditor
            basePrompt={basePrompt}
            currentPatch={currentPatch}
            candidates={
              dataMode === "demo" ? DEMO_PATCH_CANDIDATES : patchCandidates
            }
            loading={loading || generatingPatches}
          />
        </TabsContent>

        <TabsContent value="tournament" className="mt-0">
          <TournamentView
            candidates={
              dataMode === "demo"
                ? DEMO_TOURNAMENT_CANDIDATES
                : tournamentCandidates
            }
            loading={loading || runningTournament}
            onRunTournament={handleRunTournament}
            progress={tournamentProgress}
          />
        </TabsContent>

        <TabsContent value="meta" className="mt-0">
          <MetaEvolutionView
            mutationPrompts={
              dataMode === "demo" ? DEMO_MUTATION_PROMPTS : mutationPrompts
            }
            generationStats={
              dataMode === "demo" ? DEMO_GENERATION_STATS : generationStats
            }
            currentGeneration={currentGeneration}
            loading={loading}
          />
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex items-center justify-center gap-4">
        {dataMode === "empty" && !miningPairs && (
          <>
            <Button onClick={handleLoadDemo} size="lg" variant="outline">
              <IconDatabase className="mr-2 h-4 w-4" />
              Load Demo Data
            </Button>
            <Button
              onClick={handleLoadFromEval}
              size="lg"
              disabled={miningPairs}
            >
              {miningPairs ? (
                <>
                  <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                  Mining Pairs...
                </>
              ) : (
                <>
                  <IconArrowsExchange className="mr-2 h-4 w-4" />
                  Mine from Evaluation
                </>
              )}
            </Button>
          </>
        )}

        {activeStep === "pairs" && pairs.length > 0 && (
          <Button
            onClick={handleGeneratePatches}
            size="lg"
            disabled={generatingPatches}
          >
            {generatingPatches ? (
              <>
                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <IconDna className="mr-2 h-4 w-4" />
                Generate Patches
              </>
            )}
          </Button>
        )}

        {activeStep === "patches" &&
          patchCandidates.length > 0 &&
          dataMode === "live" && (
            <Button
              onClick={handleRunTournament}
              size="lg"
              disabled={runningTournament}
            >
              {runningTournament ? (
                <>
                  <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running Tournament...
                </>
              ) : (
                <>
                  <IconTrophy className="mr-2 h-4 w-4" />
                  Run Tournament
                </>
              )}
            </Button>
          )}

        {(dataMode !== "empty" || error) && (
          <Button onClick={handleClear} size="lg" variant="outline">
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
