import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { FPFSubscores } from "@/types";
import { IconShield, IconInfoCircle } from "@tabler/icons-react";

type FPFRadarProps = {
  subscores: FPFSubscores | null;
  gateDecision?: "pass" | "degrade" | "block" | "abstain";
  loading?: boolean;
};

export function FPFRadar({ subscores, gateDecision, loading }: FPFRadarProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>FPF Quality Dimensions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  const hasData = subscores && (
    subscores.correctness !== undefined ||
    subscores.completeness !== undefined ||
    subscores.processQuality !== undefined ||
    subscores.safety !== undefined
  );

  const data = [
    {
      dimension: "Correctness",
      value: (subscores?.correctness ?? 0) * 100,
      fullMark: 100,
      description: "Output accuracy and factual correctness",
    },
    {
      dimension: "Completeness",
      value: (subscores?.completeness ?? 0) * 100,
      fullMark: 100,
      description: "Coverage of required elements",
    },
    {
      dimension: "Process",
      value: (subscores?.processQuality ?? 0) * 100,
      fullMark: 100,
      description: "Quality of reasoning and methodology",
    },
    {
      dimension: "Safety",
      value: (subscores?.safety ?? 0) * 100,
      fullMark: 100,
      description: "Absence of harmful or inappropriate content",
    },
  ];

  const gateColor = {
    pass: "bg-green-500/10 text-green-600 border-green-500/20",
    degrade: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    block: "bg-red-500/10 text-red-600 border-red-500/20",
    abstain: "bg-muted text-muted-foreground",
  };

  const gateLabel = {
    pass: "Pass",
    degrade: "Degraded",
    block: "Blocked",
    abstain: "No Decision",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <IconShield className="h-5 w-5" />
              FPF Quality Dimensions
            </CardTitle>
            <CardDescription>
              First Principles Framework subscores
            </CardDescription>
          </div>
          {gateDecision && (
            <Badge className={gateColor[gateDecision]}>
              Gate: {gateLabel[gateDecision]}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
            <IconShield className="h-12 w-12 mb-2 opacity-20" />
            <p>No FPF scores available</p>
            <p className="text-xs mt-1">Run evaluation with FPF judge enabled</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={data} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                <PolarGrid className="stroke-muted" />
                <PolarAngleAxis
                  dataKey="dimension"
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fontSize: 10 }}
                  className="text-muted-foreground"
                />
                <Radar
                  name="Score"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.3}
                  strokeWidth={2}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof data)[0];
                    return (
                      <div className="rounded-md border bg-background p-2 shadow-md">
                        <p className="font-medium">{d.dimension}</p>
                        <p className="text-sm text-primary">
                          {d.value.toFixed(1)}%
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {d.description}
                        </p>
                      </div>
                    );
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>

            {/* Score breakdown */}
            <div className="grid grid-cols-4 gap-2 mt-2">
              {data.map((d) => (
                <div key={d.dimension} className="text-center">
                  <p className="text-xs text-muted-foreground">{d.dimension}</p>
                  <p className="text-sm font-medium">{d.value.toFixed(0)}%</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Educational note */}
        <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 mt-4">
          <IconInfoCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">FPF Gate System:</span> Outputs can be{" "}
            <span className="text-green-600">passed</span> (full score),{" "}
            <span className="text-yellow-600">degraded</span> (85% penalty), or{" "}
            <span className="text-red-600">blocked</span> (score = 0) based on
            quality thresholds.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
