import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PromptDistReport } from "@/types";

type DistributionChartProps = {
  report: PromptDistReport | null;
  loading?: boolean;
};

// Bucket scores into ranges for histogram
function bucketScores(report: PromptDistReport): { range: string; count: number; pass: number; fail: number }[] {
  const buckets = [
    { min: 0, max: 0.2, label: "0-20%" },
    { min: 0.2, max: 0.4, label: "20-40%" },
    { min: 0.4, max: 0.6, label: "40-60%" },
    { min: 0.6, max: 0.8, label: "60-80%" },
    { min: 0.8, max: 1.01, label: "80-100%" },
  ];

  const result = buckets.map((b) => ({
    range: b.label,
    count: 0,
    pass: 0,
    fail: 0,
  }));

  for (const epic of report.perEpic) {
    for (const run of epic.runs) {
      const bucketIdx = buckets.findIndex(
        (b) => run.score >= b.min && run.score < b.max
      );
      if (bucketIdx >= 0) {
        result[bucketIdx].count++;
        if (run.pass) {
          result[bucketIdx].pass++;
        } else {
          result[bucketIdx].fail++;
        }
      }
    }
  }

  return result;
}

export function DistributionChart({ report, loading }: DistributionChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Score Distribution</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!report) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Score Distribution</CardTitle>
          <CardDescription>
            Histogram showing how scores are distributed across all runs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            Run an evaluation to see the distribution
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = bucketScores(report);
  const totalRuns = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Score Distribution</CardTitle>
        <CardDescription>
          {totalRuns} runs across {report.perEpic.length} epics
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="range"
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
              label={{
                value: "Count",
                angle: -90,
                position: "insideLeft",
                className: "fill-muted-foreground text-xs",
              }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[0];
                return (
                  <div className="rounded-md border bg-background p-2 shadow-md">
                    <p className="font-medium">{d.range}</p>
                    <p className="text-sm text-muted-foreground">
                      Total: {d.count} runs
                    </p>
                    <p className="text-sm text-green-600">Pass: {d.pass}</p>
                    <p className="text-sm text-red-600">Fail: {d.fail}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    entry.count === 0
                      ? "hsl(var(--muted))"
                      : index >= 3
                        ? "hsl(142, 76%, 36%)" // green for 60%+
                        : index >= 2
                          ? "hsl(48, 96%, 53%)" // yellow for 40-60%
                          : "hsl(0, 84%, 60%)" // red for <40%
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-red-500" />
            <span className="text-muted-foreground">Poor (&lt;40%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-yellow-500" />
            <span className="text-muted-foreground">Fair (40-60%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-green-600" />
            <span className="text-muted-foreground">Good (60%+)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
