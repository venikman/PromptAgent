import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PromptDistReport } from "@/types";
import {
  IconCheck,
  IconTrendingUp,
  IconChartBar,
  IconFlame,
  IconInfoCircle,
} from "@tabler/icons-react";

type MetricCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  tooltip: string;
  variant?: "default" | "success" | "warning" | "muted";
};

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  tooltip,
  variant = "default",
}: MetricCardProps) {
  const valueColor = {
    default: "text-foreground",
    success: "text-green-600",
    warning: "text-yellow-600",
    muted: "text-muted-foreground",
  }[variant];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {title}
              </CardTitle>
              <div className="text-muted-foreground">{icon}</div>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
              )}
            </CardContent>
          </Card>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[250px]">
          <p className="text-sm">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

type MetricsPanelProps = {
  report: PromptDistReport | null;
  loading?: boolean;
};

export function MetricsPanel({ report, loading }: MetricsPanelProps) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 w-20 bg-muted rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!report) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          title="Pass Rate"
          value="—"
          icon={<IconCheck className="h-4 w-4" />}
          tooltip="Percentage of runs that produce valid, schema-compliant output"
          variant="muted"
        />
        <MetricCard
          title="Mean Score"
          value="—"
          icon={<IconTrendingUp className="h-4 w-4" />}
          tooltip="Average quality score across all runs (0-1)"
          variant="muted"
        />
        <MetricCard
          title="P10 Score"
          value="—"
          icon={<IconChartBar className="h-4 w-4" />}
          tooltip="10th percentile score - worst-case quality measure"
          variant="muted"
        />
        <MetricCard
          title="Std Dev"
          value="—"
          icon={<IconChartBar className="h-4 w-4" />}
          tooltip="Standard deviation - lower means more consistent results"
          variant="muted"
        />
        <MetricCard
          title="Objective"
          value="—"
          icon={<IconFlame className="h-4 w-4" />}
          tooltip="Composite score used for prompt ranking (higher is better)"
          variant="muted"
        />
      </div>
    );
  }

  const { agg } = report;
  const passRatePct = Math.round(agg.meanPassRate * 100);
  const meanScorePct = Math.round(agg.meanOfMeans * 100);
  const p10Pct = Math.round(agg.meanP10 * 100);
  const objectivePct = Math.round(agg.objective * 100);

  return (
    <div className="space-y-4">
      {/* Pass Rate with Progress Bar */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
            <Badge
              variant={passRatePct >= 80 ? "default" : passRatePct >= 50 ? "secondary" : "destructive"}
            >
              {passRatePct}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={passRatePct} className="h-3" />
          <p className="text-xs text-muted-foreground">
            Percentage of runs producing valid output
          </p>
        </CardContent>
      </Card>

      {/* Metric Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Mean Score"
          value={`${meanScorePct}%`}
          subtitle={agg.meanOfMeans.toFixed(3)}
          icon={<IconTrendingUp className="h-4 w-4" />}
          tooltip="Average quality score across all runs. Combines heuristic checks (keyword coverage, INVEST compliance) with FPF judge scores."
          variant={meanScorePct >= 70 ? "success" : "default"}
        />
        <MetricCard
          title="P10 (Worst Case)"
          value={`${p10Pct}%`}
          subtitle={agg.meanP10.toFixed(3)}
          icon={<IconChartBar className="h-4 w-4" />}
          tooltip="10th percentile score - represents worst-case quality. A prompt with high mean but low P10 is unreliable."
          variant={p10Pct >= 50 ? "success" : p10Pct >= 30 ? "warning" : "default"}
        />
        <MetricCard
          title="Std Deviation"
          value={agg.meanStd.toFixed(3)}
          subtitle="Lower is better"
          icon={<IconChartBar className="h-4 w-4" />}
          tooltip="Standard deviation of scores. Lower values mean more consistent, predictable results."
          variant={agg.meanStd <= 0.1 ? "success" : agg.meanStd <= 0.2 ? "default" : "warning"}
        />
        <MetricCard
          title="Objective"
          value={`${objectivePct}%`}
          subtitle="Composite ranking score"
          icon={<IconFlame className="h-4 w-4" />}
          tooltip="Composite objective function: 45% pass rate + 35% mean score + 20% P10 - penalties for variance and failures. Used to rank and select champion prompts."
          variant="success"
        />
      </div>

      {/* Educational Note */}
      <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
        <IconInfoCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Why distributional metrics?</span> A
          single evaluation can be "lucky". Running each epic multiple times
          with different seeds reveals reliability. High mean + low P10 means
          the prompt sometimes fails badly.
        </p>
      </div>
    </div>
  );
}
