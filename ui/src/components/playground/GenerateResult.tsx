import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { GenerateResult as GenerateResultType, ScorerResult } from "@/types";
import {
  IconCheck,
  IconAlertTriangle,
  IconX,
  IconTerminal2,
} from "@tabler/icons-react";
import { StoryPackDisplay } from "./StoryPackDisplay";

type GenerateResultProps = {
  result: GenerateResultType | null;
  scorerResult?: ScorerResult | null;
  loading?: boolean;
  error?: string | null;
};

function GateBadge({ decision }: { decision?: string }) {
  if (!decision || decision === "abstain") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        No gate
      </Badge>
    );
  }
  if (decision === "pass") {
    return (
      <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
        <IconCheck className="mr-1 h-3 w-3" />
        Pass
      </Badge>
    );
  }
  if (decision === "degrade") {
    return (
      <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
        <IconAlertTriangle className="mr-1 h-3 w-3" />
        Degrade
      </Badge>
    );
  }
  if (decision === "block") {
    return (
      <Badge variant="destructive">
        <IconX className="mr-1 h-3 w-3" />
        Block
      </Badge>
    );
  }
  return <Badge variant="outline">{decision}</Badge>;
}

function ScoreBar({ label, value }: { label: string; value?: number }) {
  const pct = value !== undefined ? Math.round(value * 100) : 0;
  const hasValue = value !== undefined;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{hasValue ? `${pct}%` : "—"}</span>
      </div>
      <Progress value={hasValue ? pct : 0} className="h-2" />
    </div>
  );
}

export function GenerateResult({
  result,
  scorerResult,
  loading,
  error,
}: GenerateResultProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <Badge className="w-fit" variant="outline">
          <IconTerminal2 className="h-3.5 w-3.5" />
          Step 3
        </Badge>
        <CardTitle>Result</CardTitle>
        <CardDescription>
          View the generated user stories and quality scores.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="space-y-3 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">Generating...</p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {result && !loading && (
          <Tabs defaultValue="stories" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="stories">Stories</TabsTrigger>
              <TabsTrigger value="scores">Scores</TabsTrigger>
              <TabsTrigger value="raw">Raw</TabsTrigger>
            </TabsList>

            <TabsContent value="stories" className="mt-4">
              {result.storyPack ? (
                <StoryPackDisplay storyPack={result.storyPack} />
              ) : (
                <div className="rounded-md bg-muted/50 p-4 text-sm text-muted-foreground">
                  No valid story pack was generated.
                  {result.error && (
                    <p className="mt-2 text-destructive">{result.error}</p>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="scores" className="mt-4">
              {scorerResult ? (
                <div className="space-y-6">
                  {/* Overall Score */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Overall Score</span>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold">
                          {Math.round(scorerResult.score * 100)}%
                        </span>
                        <GateBadge decision={scorerResult.gateDecision} />
                      </div>
                    </div>
                    <Progress
                      value={scorerResult.score * 100}
                      className="h-3"
                    />
                  </div>

                  <Separator />

                  {/* FPF Subscores */}
                  {scorerResult.fpfSubscores && (
                    <div className="space-y-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        FPF Subscores
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <ScoreBar
                          label="Correctness"
                          value={scorerResult.fpfSubscores.correctness}
                        />
                        <ScoreBar
                          label="Completeness"
                          value={scorerResult.fpfSubscores.completeness}
                        />
                        <ScoreBar
                          label="Process Quality"
                          value={scorerResult.fpfSubscores.processQuality}
                        />
                        <ScoreBar
                          label="Safety"
                          value={scorerResult.fpfSubscores.safety}
                        />
                      </div>
                    </div>
                  )}

                  <Separator />

                  {/* Reason */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Scoring Reason
                    </p>
                    <p className="rounded-md bg-muted/50 p-3 font-mono text-xs">
                      {scorerResult.reason}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-md bg-muted/50 p-4 text-sm text-muted-foreground">
                  No scoring data available. Scores are computed when using the
                  /generate-story endpoint.
                </div>
              )}
            </TabsContent>

            <TabsContent value="raw" className="mt-4">
              <Textarea
                readOnly
                value={result.rawText || "(empty)"}
                className="min-h-[400px] font-mono text-xs"
              />
            </TabsContent>
          </Tabs>
        )}

        {!result && !loading && !error && (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              Select an epic and click Generate to see results.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
