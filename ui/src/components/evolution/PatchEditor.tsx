import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  IconDna,
  IconSparkles,
  IconCopy,
  IconCheck,
  IconInfoCircle,
} from "@tabler/icons-react";

type PatchCandidate = {
  id: string;
  patch: string;
  rationale: string;
  targetedIssue: string;
};

type PatchEditorProps = {
  basePrompt: string;
  currentPatch: string;
  candidates: PatchCandidate[];
  onSelectCandidate?: (candidate: PatchCandidate) => void;
  loading?: boolean;
};

export function PatchEditor({
  basePrompt,
  currentPatch,
  candidates,
  onSelectCandidate,
  loading,
}: PatchEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSelect = (candidate: PatchCandidate) => {
    setSelectedId(candidate.id);
    onSelectCandidate?.(candidate);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Patch Candidates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 animate-pulse bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <IconDna className="h-5 w-5" />
          Patch Candidates
        </h3>
        <p className="text-sm text-muted-foreground">
          AI-generated improvements based on contrastive pair analysis
        </p>
      </div>

      {/* Educational note */}
      <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
        <IconInfoCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">How patches work:</span> The system analyzes
          what distinguishes good outputs from bad ones, then generates targeted
          prompt additions. Each patch addresses a specific failure mode discovered
          in the contrastive pairs.
        </p>
      </div>

      {/* Current Prompt State */}
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="current" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Current Prompt</span>
              <Badge variant="outline" className="text-xs">
                {basePrompt.split("\n").length} lines
              </Badge>
              {currentPatch && (
                <Badge variant="secondary" className="text-xs">
                  +patch
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Base Prompt</Label>
                <Textarea
                  readOnly
                  value={basePrompt}
                  className="mt-1 h-32 font-mono text-xs"
                />
              </div>
              {currentPatch && (
                <div>
                  <Label className="text-xs text-muted-foreground">Current Patch</Label>
                  <Textarea
                    readOnly
                    value={currentPatch}
                    className="mt-1 h-20 font-mono text-xs bg-yellow-500/5 border-yellow-500/20"
                  />
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Candidate Patches */}
      {candidates.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <IconDna className="h-12 w-12 mb-2 opacity-20" />
              <p>No patch candidates generated yet</p>
              <p className="text-xs mt-1">Mine contrastive pairs first</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="space-y-3 pr-4">
            {candidates.map((candidate, index) => (
              <Card
                key={candidate.id}
                className={`cursor-pointer transition-all ${
                  selectedId === candidate.id
                    ? "ring-2 ring-primary border-primary"
                    : "hover:border-muted-foreground/50"
                }`}
                onClick={() => handleSelect(candidate)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">#{index + 1}</Badge>
                      <Badge variant="secondary" className="text-xs">
                        {candidate.targetedIssue}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(candidate.patch, candidate.id);
                      }}
                    >
                      {copiedId === candidate.id ? (
                        <IconCheck className="h-4 w-4 text-green-600" />
                      ) : (
                        <IconCopy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Patch</Label>
                    <div className="mt-1 p-2 rounded-md bg-muted/50 font-mono text-xs whitespace-pre-wrap">
                      {candidate.patch}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Rationale</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {candidate.rationale}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Generate Button */}
      <Button disabled className="w-full" variant="outline">
        <IconSparkles className="mr-2 h-4 w-4" />
        Generate New Patches (Requires LLM)
      </Button>
    </div>
  );
}
