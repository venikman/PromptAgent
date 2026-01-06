import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { EpicDistResult, PromptDistReport } from "@/types";
import { IconCheck, IconX } from "@tabler/icons-react";

type RunsTableProps = {
  report: PromptDistReport | null;
  loading?: boolean;
};

function EpicRow({ epic }: { epic: EpicDistResult }) {
  const passRatePct = Math.round(epic.passRate * 100);
  const meanPct = Math.round(epic.meanScore * 100);
  const p10Pct = Math.round(epic.p10Score * 100);

  return (
    <AccordionItem value={epic.epicId} className="border-0">
      <AccordionTrigger className="hover:no-underline px-4 py-3 [&[data-state=open]]:bg-muted/50">
        <div className="flex items-center justify-between w-full pr-4">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="font-mono">
              {epic.epicId}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {epic.runs.length} runs
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Pass:</span>
              <Badge
                variant={passRatePct >= 80 ? "default" : passRatePct >= 50 ? "secondary" : "destructive"}
                className="font-mono"
              >
                {passRatePct}%
              </Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Mean:</span>
              <span className="font-mono font-medium">{meanPct}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">P10:</span>
              <span className="font-mono font-medium">{p10Pct}%</span>
            </div>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Seed</TableHead>
                <TableHead className="w-[80px]">Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead className="w-[100px]">Stories</TableHead>
                <TableHead className="text-right">Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {epic.runs.map((run) => (
                <TableRow key={run.seed}>
                  <TableCell className="font-mono text-xs">{run.seed}</TableCell>
                  <TableCell>
                    {run.pass ? (
                      <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                        <IconCheck className="h-3 w-3 mr-1" />
                        Pass
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <IconX className="h-3 w-3 mr-1" />
                        Fail
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress
                        value={run.score * 100}
                        className="h-2 w-20"
                      />
                      <span className="font-mono text-xs w-12">
                        {(run.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {run.storyPack?.userStories.length ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {run.error ? (
                      <span className="text-xs text-destructive truncate max-w-[200px] block">
                        {run.error}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Epic stats summary */}
        <div className="grid grid-cols-4 gap-4 mt-4 p-3 rounded-md bg-muted/30">
          <div>
            <p className="text-xs text-muted-foreground">Mean Score</p>
            <p className="font-mono font-medium">{epic.meanScore.toFixed(3)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">P10 Score</p>
            <p className="font-mono font-medium">{epic.p10Score.toFixed(3)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Std Dev</p>
            <p className="font-mono font-medium">{epic.stdScore.toFixed(3)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Discoverability</p>
            <p className="font-mono font-medium">
              {(epic.discoverabilityK * 100).toFixed(0)}%
            </p>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export function RunsTable({ report, loading }: RunsTableProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Per-Epic Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!report) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Per-Epic Breakdown</CardTitle>
          <CardDescription>
            Detailed statistics for each epic in the evaluation set.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[200px] text-muted-foreground">
            Run an evaluation to see per-epic results
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalRuns = report.perEpic.reduce((sum, e) => sum + e.runs.length, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Per-Epic Breakdown</CardTitle>
        <CardDescription>
          {report.perEpic.length} epics, {totalRuns} total runs
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          <Accordion type="multiple" className="w-full">
            {report.perEpic.map((epic) => (
              <EpicRow key={epic.epicId} epic={epic} />
            ))}
          </Accordion>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
