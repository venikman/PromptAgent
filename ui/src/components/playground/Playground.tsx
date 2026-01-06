import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Epic, GenerateResult as GenerateResultType, ScorerResult } from "@/types";
import { EpicInput } from "./EpicInput";
import { PromptEditor } from "./PromptEditor";
import { GenerateResult } from "./GenerateResult";
import { IconPlayerPlay } from "@tabler/icons-react";

export function Playground() {
  const [selectedEpic, setSelectedEpic] = useState<Epic | null>(null);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResultType | null>(null);
  const [scorerResult, setScorerResult] = useState<ScorerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!selectedEpic) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setScorerResult(null);

    try {
      const payload: { epicId: string; promptOverride?: string } = {
        epicId: selectedEpic.id,
      };
      if (promptOverride) {
        payload.promptOverride = promptOverride;
      }

      const res = await fetch("/generate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Educational Header */}
      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold">Flow A: Single Generation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This demonstrates the core generation pipeline:{" "}
          <span className="font-medium text-foreground">Epic → StoryPack</span>.
          Select an epic from the evaluation dataset, optionally modify the
          system prompt, and generate structured user stories with Azure DevOps
          fields.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Column 1: Epic Selection */}
        <EpicInput
          selectedEpic={selectedEpic}
          onEpicChange={setSelectedEpic}
          disabled={loading}
        />

        {/* Column 2: Prompt Editor */}
        <div className="space-y-4">
          <PromptEditor
            promptOverride={promptOverride}
            onPromptChange={setPromptOverride}
            disabled={loading}
          />
          <Button
            onClick={handleGenerate}
            disabled={!selectedEpic || loading}
            className="w-full"
            size="lg"
          >
            <IconPlayerPlay className="mr-2 h-4 w-4" />
            {loading ? "Generating..." : "Generate Stories"}
          </Button>
        </div>

        {/* Column 3: Result */}
        <GenerateResult
          result={result}
          scorerResult={scorerResult}
          loading={loading}
          error={error}
        />
      </div>
    </div>
  );
}
