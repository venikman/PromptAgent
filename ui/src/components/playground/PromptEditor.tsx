import { useState, useEffect } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ChampionPrompt } from "@/types";
import { IconWand } from "@tabler/icons-react";

type PromptEditorProps = {
  promptOverride: string | null;
  onPromptChange: (prompt: string | null) => void;
  disabled?: boolean;
};

export function PromptEditor({
  promptOverride,
  onPromptChange,
  disabled,
}: PromptEditorProps) {
  const [champion, setChampion] = useState<ChampionPrompt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchChampion = async () => {
      try {
        const res = await fetch("/champion");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setChampion(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load champion prompt"
        );
      } finally {
        setLoading(false);
      }
    };
    fetchChampion();
  }, []);

  const effectivePrompt = promptOverride ?? champion?.composed ?? "";
  const isModified =
    promptOverride !== null && promptOverride !== champion?.composed;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">
            Error loading prompt
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge className="w-fit" variant="outline">
            <IconWand className="h-3.5 w-3.5" />
            Step 2
          </Badge>
          {isModified && <Badge variant="secondary">Modified</Badge>}
        </div>
        <CardTitle>System Prompt</CardTitle>
        <CardDescription>
          The champion prompt evolved through multiple optimization rounds. Edit
          to experiment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="prompt-editor">Active Prompt</Label>
          <Textarea
            id="prompt-editor"
            value={effectivePrompt}
            onChange={(e) => onPromptChange(e.target.value || null)}
            className="min-h-[160px] font-mono text-xs"
            disabled={disabled}
            placeholder="Enter a system prompt..."
          />
        </div>

        {champion && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="details" className="border-0">
              <AccordionTrigger className="py-2 text-xs text-muted-foreground hover:no-underline">
                View prompt components
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Base Prompt
                    </Label>
                    <div className="rounded-md bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap">
                      {champion.base || "(empty)"}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Evolution Patch
                    </Label>
                    <div className="rounded-md bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap">
                      {champion.patch || "(no patch)"}
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {isModified && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => onPromptChange(null)}
          >
            Reset to champion prompt
          </button>
        )}
      </CardContent>
    </Card>
  );
}
