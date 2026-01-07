import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { Epic, GenerateResult, ScorerResult, ChampionPrompt, UserStory } from "@/types";
import { categorizeError } from "@/lib/errors";
import { exportToCSV, exportToJSON } from "@/lib/export";
import {
  IconPlayerPlay,
  IconRefresh,
  IconAlertCircle,
  IconCircleCheck,
  IconLoader2,
  IconChevronRight,
  IconFileTypeCsv,
  IconBraces,
  IconCheck,
  IconUser,
  IconWand,
  IconTarget,
  IconDeviceFloppy,
  IconSparkles,
} from "@tabler/icons-react";

// ─────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────

export function Playground() {
  // Data loading
  const [epics, setEpics] = useState<Epic[]>([]);
  const [champion, setChampion] = useState<ChampionPrompt | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  // User state
  const [selectedEpic, setSelectedEpic] = useState<Epic | null>(null);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [scorerResult, setScorerResult] = useState<ScorerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Prompt saving
  const [saving, setSaving] = useState(false);

  // Load epics and champion prompt on mount
  useEffect(() => {
    Promise.all([
      fetch("/epics").then(r => r.json()),
      fetch("/champion").then(r => r.json()),
    ]).then(([epicsData, championData]) => {
      setEpics(epicsData.epics || []);
      setChampion(championData);
    }).catch(() => {
      // Silent fail - will show empty states
    }).finally(() => setLoadingData(false));
  }, []);

  const effectivePrompt = promptOverride ?? champion?.composed ?? "";
  const isPromptModified = promptOverride !== null && promptOverride !== champion?.composed;
  const canGenerate = selectedEpic && !generating;

  const handleGenerate = async () => {
    if (!selectedEpic) return;

    setGenerating(true);
    setError(null);
    setResult(null);
    setScorerResult(null);

    try {
      const res = await fetch("/generate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          epicId: selectedEpic.id,
          ...(promptOverride && { promptOverride }),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setResult(data.result || null);
      setScorerResult(data.scorerResult || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  const handleSavePrompt = async () => {
    if (!promptOverride) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/champion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ composed: promptOverride }),
      });
      const data = await res.json();
      if (res.ok) {
        setChampion(data.champion);
        setPromptOverride(null);
      } else {
        setError(data.error || "Failed to save prompt");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save prompt");
    } finally {
      setSaving(false);
    }
  };

  const errorInfo = error ? categorizeError(error) : null;

  return (
    <div className="space-y-8">
      {/* Pipeline visualization */}
      <div className="flex items-center justify-center gap-3 py-4">
        <Step number={1} label="Epic" active={!selectedEpic} done={!!selectedEpic} />
        <IconChevronRight className="h-4 w-4 text-muted-foreground/50" />
        <Step number={2} label="Prompt" active={!!selectedEpic && !result} done={!!result} />
        <IconChevronRight className="h-4 w-4 text-muted-foreground/50" />
        <Step number={3} label="Generate" active={generating} done={!!result && !error} />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left: Input */}
        <div className="space-y-6">
          {/* Epic Selection */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium tracking-tight">Select Epic</h3>
              {selectedEpic && (
                <Badge variant="outline" className="font-mono text-xs">
                  {selectedEpic.id}
                </Badge>
              )}
            </div>

            <Select
              value={selectedEpic?.id || ""}
              onValueChange={(id) => setSelectedEpic(epics.find(e => e.id === id) || null)}
              disabled={loadingData || generating}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder={loadingData ? "Loading..." : "Choose an epic to decompose"} />
              </SelectTrigger>
              <SelectContent>
                {epics.map((epic) => (
                  <SelectItem key={epic.id} value={epic.id}>
                    <span className="font-medium">{epic.title}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedEpic && (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <p className="leading-relaxed text-muted-foreground">
                  {selectedEpic.description}
                </p>
                {selectedEpic.tags && selectedEpic.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selectedEpic.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <Separator />

          {/* Prompt */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium tracking-tight">System Prompt</h3>
              {isPromptModified && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPromptOverride(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Reset
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSavePrompt}
                    disabled={saving}
                    className="h-7 text-xs"
                  >
                    {saving ? (
                      <IconLoader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <IconDeviceFloppy className="mr-1 h-3 w-3" />
                    )}
                    Save
                  </Button>
                </div>
              )}
            </div>

            <Textarea
              value={effectivePrompt}
              onChange={(e) => setPromptOverride(e.target.value || null)}
              disabled={generating || loadingData}
              placeholder="Loading champion prompt..."
              className="min-h-[200px] font-mono text-xs leading-relaxed resize-none"
            />
          </section>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={!canGenerate}
            size="lg"
            className="w-full h-12 text-base font-medium"
          >
            {generating ? (
              <>
                <IconLoader2 className="mr-2 h-5 w-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <IconSparkles className="mr-2 h-5 w-5" />
                Generate User Stories
              </>
            )}
          </Button>
        </div>

        {/* Right: Output */}
        <div className="space-y-4">
          {/* Error State */}
          {error && errorInfo && (
            <div className="rounded-lg border-2 border-orange-500/30 bg-orange-500/5 p-5">
              <div className="flex gap-4">
                <IconAlertCircle className="h-6 w-6 shrink-0 text-orange-500" />
                <div className="space-y-2">
                  <h4 className="font-semibold text-foreground">{errorInfo.title}</h4>
                  <p className="text-sm text-muted-foreground">{errorInfo.message}</p>
                  <p className="text-sm font-medium text-orange-600 dark:text-orange-400">
                    {errorInfo.action}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerate}
                    className="mt-2"
                  >
                    <IconRefresh className="mr-2 h-4 w-4" />
                    Try Again
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {generating && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="relative">
                <div className="h-16 w-16 rounded-full border-4 border-muted" />
                <div className="absolute inset-0 h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
              <p className="mt-6 text-sm font-medium">Generating stories...</p>
              <p className="mt-1 text-xs text-muted-foreground">This may take 30-60 seconds</p>
            </div>
          )}

          {/* Empty State */}
          {!generating && !result && !error && (
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-16 text-center">
              <div className="rounded-full bg-muted p-4">
                <IconPlayerPlay className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Select an epic and click Generate
              </p>
            </div>
          )}

          {/* Results */}
          {result && !generating && (
            <ResultDisplay result={result} scorerResult={scorerResult} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────

function Step({ number, label, active, done }: { number: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className={`flex items-center gap-2 transition-opacity ${active || done ? "opacity-100" : "opacity-40"}`}>
      <div className={`
        flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors
        ${done ? "bg-primary text-primary-foreground" : active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}
      `}>
        {done ? <IconCheck className="h-4 w-4" /> : number}
      </div>
      <span className={`text-sm font-medium ${active || done ? "text-foreground" : "text-muted-foreground"}`}>
        {label}
      </span>
    </div>
  );
}

function ResultDisplay({ result, scorerResult }: { result: GenerateResult; scorerResult: ScorerResult | null }) {
  const pack = result.storyPack;

  if (!pack || !pack.userStories?.length) {
    return (
      <div className="rounded-lg border bg-muted/30 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No stories generated. {result.error && <span className="text-destructive">{result.error}</span>}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with score and export */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="font-mono">{pack.epicId}</Badge>
          <Badge className="bg-primary/10 text-primary border-0">
            {pack.userStories.length} stories
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => exportToCSV(pack)} className="h-8 px-2">
            <IconFileTypeCsv className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => exportToJSON(pack)} className="h-8 px-2">
            <IconBraces className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Score bar */}
      {scorerResult && (
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
          <div className="flex-1">
            <Progress value={scorerResult.score * 100} className="h-2" />
          </div>
          <span className="text-sm font-bold tabular-nums">
            {Math.round(scorerResult.score * 100)}%
          </span>
          {scorerResult.gateDecision === "pass" && (
            <IconCircleCheck className="h-5 w-5 text-green-500" />
          )}
        </div>
      )}

      {/* Stories */}
      <ScrollArea className="h-[500px] pr-4">
        <div className="space-y-3">
          {pack.userStories.map((story, i) => (
            <StoryItem key={i} story={story} index={i} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function StoryItem({ story, index }: { story: UserStory; index: number }) {
  const points = story.ado?.fields?.["Microsoft.VSTS.Scheduling.StoryPoints"];
  const criteria = story.acceptanceCriteria || [];

  return (
    <Accordion type="single" collapsible className="rounded-lg border bg-card">
      <AccordionItem value="item" className="border-0">
        <AccordionTrigger className="px-4 py-3 hover:no-underline">
          <div className="flex items-center gap-3 text-left">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-muted text-xs font-bold">
              {index + 1}
            </span>
            <span className="font-medium">{story.title || "Untitled"}</span>
            {points && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {points} pts
              </Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
          <div className="space-y-4">
            {/* User story narrative */}
            <div className="space-y-2 text-sm">
              {story.asA && (
                <div className="flex items-start gap-2">
                  <IconUser className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <span><strong>As a</strong> {story.asA}</span>
                </div>
              )}
              {story.iWant && (
                <div className="flex items-start gap-2">
                  <IconWand className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <span><strong>I want</strong> {story.iWant}</span>
                </div>
              )}
              {story.soThat && (
                <div className="flex items-start gap-2">
                  <IconTarget className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <span><strong>So that</strong> {story.soThat}</span>
                </div>
              )}
            </div>

            {/* Acceptance criteria */}
            {criteria.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Acceptance Criteria
                  </p>
                  <ul className="space-y-1.5">
                    {criteria.map((c: string, j: number) => (
                      <li key={j} className="flex items-start gap-2 text-sm">
                        <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                        <span className="text-muted-foreground">{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
