import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { GenerateResult as GenerateResultType, ScorerResult, StoryPack } from "@/types";
import {
  IconCheck,
  IconAlertTriangle,
  IconX,
  IconTerminal2,
  IconRefresh,
  IconFileTypeCsv,
  IconBraces,
} from "@tabler/icons-react";
import { StoryPackDisplay } from "./StoryPackDisplay";

// ─────────────────────────────────────────────────
// Export Functions
// ─────────────────────────────────────────────────

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportToCSV(storyPack: StoryPack) {
  // CSV headers matching Azure DevOps import format
  const headers = [
    "Work Item Type",
    "Title",
    "Description",
    "Acceptance Criteria",
    "Story Points",
    "Tags",
  ];

  const rows = storyPack.userStories.map((story) => {
    const fields = story.ado.fields;
    return [
      "User Story",
      escapeCsvField(fields["System.Title"]),
      escapeCsvField(fields["System.Description"]),
      escapeCsvField(fields["Microsoft.VSTS.Common.AcceptanceCriteria"]),
      fields["Microsoft.VSTS.Scheduling.StoryPoints"]?.toString() || "",
      escapeCsvField(fields["System.Tags"] || ""),
    ];
  });

  const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  const filename = `${storyPack.epicId || "stories"}-${new Date().toISOString().slice(0, 10)}.csv`;
  downloadFile(csv, filename, "text/csv;charset=utf-8");
}

function escapeCsvField(value: string): string {
  if (!value) return '""';
  // Escape double quotes and wrap in quotes if contains comma, newline, or quote
  const escaped = value.replace(/"/g, '""');
  if (escaped.includes(",") || escaped.includes("\n") || escaped.includes('"')) {
    return `"${escaped}"`;
  }
  return escaped;
}

function exportToJSON(storyPack: StoryPack) {
  const json = JSON.stringify(storyPack, null, 2);
  const filename = `${storyPack.epicId || "stories"}-${new Date().toISOString().slice(0, 10)}.json`;
  downloadFile(json, filename, "application/json");
}

type GenerateResultProps = {
  result: GenerateResultType | null;
  scorerResult?: ScorerResult | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

// Parse error messages to categorize them
type ErrorCategory = "timeout" | "rate_limit" | "connection" | "json_parse" | "llm_error" | "unknown";

function categorizeError(error: string): { category: ErrorCategory; title: string; suggestion: string } {
  const lowerError = error.toLowerCase();

  if (lowerError.includes("timeout") || lowerError.includes("timed out") || lowerError.includes("deadline")) {
    return {
      category: "timeout",
      title: "Request Timeout",
      suggestion: "The LLM took too long to respond. Try again or reduce the prompt complexity.",
    };
  }

  if (lowerError.includes("rate limit") || lowerError.includes("429") || lowerError.includes("too many requests")) {
    return {
      category: "rate_limit",
      title: "Rate Limited",
      suggestion: "Too many requests. Wait a moment before retrying.",
    };
  }

  if (lowerError.includes("econnrefused") || lowerError.includes("connection refused") || lowerError.includes("fetch failed")) {
    return {
      category: "connection",
      title: "Connection Failed",
      suggestion: "Cannot reach the LLM server. Make sure LM Studio or your LLM provider is running.",
    };
  }

  if (lowerError.includes("json") || lowerError.includes("parse") || lowerError.includes("unexpected token")) {
    return {
      category: "json_parse",
      title: "Invalid Response",
      suggestion: "The LLM returned malformed output. Try regenerating with a different seed.",
    };
  }

  if (lowerError.includes("llm_error") || lowerError.includes("model")) {
    return {
      category: "llm_error",
      title: "LLM Error",
      suggestion: "The language model encountered an error. Check your model configuration.",
    };
  }

  return {
    category: "unknown",
    title: "Generation Failed",
    suggestion: "An unexpected error occurred. Check the console for details.",
  };
}

function ErrorIcon({ category }: { category: ErrorCategory }) {
  const className = "h-5 w-5";
  switch (category) {
    case "timeout":
      return <IconAlertTriangle className={className} />;
    case "rate_limit":
      return <IconAlertTriangle className={className} />;
    case "connection":
      return <IconX className={className} />;
    default:
      return <IconX className={className} />;
  }
}

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
  onRetry,
}: GenerateResultProps) {
  const errorInfo = error ? categorizeError(error) : null;

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

        {error && !loading && errorInfo && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4">
            <div className="flex items-start gap-3">
              <div className="text-destructive">
                <ErrorIcon category={errorInfo.category} />
              </div>
              <div className="flex-1 space-y-2">
                <p className="font-medium text-destructive">{errorInfo.title}</p>
                <p className="text-sm text-muted-foreground">{errorInfo.suggestion}</p>
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Show details
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-muted/50 p-2 font-mono text-destructive/80">
                    {error}
                  </pre>
                </details>
                {onRetry && (
                  <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
                    <IconRefresh className="mr-2 h-3 w-3" />
                    Retry
                  </Button>
                )}
              </div>
            </div>
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
                <div className="space-y-4">
                  {/* Export buttons */}
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportToCSV(result.storyPack!)}
                    >
                      <IconFileTypeCsv className="mr-1.5 h-4 w-4" />
                      Export CSV
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportToJSON(result.storyPack!)}
                    >
                      <IconBraces className="mr-1.5 h-4 w-4" />
                      Export JSON
                    </Button>
                  </div>
                  <StoryPackDisplay storyPack={result.storyPack} />
                </div>
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
