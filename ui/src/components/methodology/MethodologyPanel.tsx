import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  IconChartBar,
  IconGitCompare,
  IconDna,
  IconScale,
  IconUsers,
  IconTarget,
  IconBulb,
  IconShield,
  IconInfoCircle,
  IconExternalLink,
} from "@tabler/icons-react";

// ═══════════════════════════════════════════════════════════════
// METHODOLOGY OVERVIEW
// ═══════════════════════════════════════════════════════════════

function MethodologyOverview() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconBulb className="h-5 w-5 text-yellow-500" />
          <CardTitle>Research-Backed Methodology</CardTitle>
        </div>
        <CardDescription>
          PromptAgent implements a rigorous prompt optimization methodology based on
          academic research and the First Principles Framework (FPF).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <MethodCard
            icon={<IconChartBar className="h-5 w-5" />}
            title="Distributional Evaluation"
            description="Run prompts multiple times to capture statistical distribution, not just point estimates"
            badge="Paper 3.1"
            color="blue"
          />
          <MethodCard
            icon={<IconGitCompare className="h-5 w-5" />}
            title="Contrastive Pairs"
            description="Find similar outputs with quality gaps to learn what improvements work"
            badge="OPRO-style"
            color="purple"
          />
          <MethodCard
            icon={<IconDna className="h-5 w-5" />}
            title="Patch Evolution"
            description="Small additive improvements to prompts, never full rewrites"
            badge="Paper 3.3"
            color="green"
          />
        </div>

        <div className="rounded-lg border bg-muted/30 p-4">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <IconScale className="h-4 w-4" />
            The Objective Formula
          </h4>
          <code className="block bg-background rounded p-3 text-sm font-mono">
            Objective = 0.45 × passRate + 0.35 × meanScore + 0.20 × p10Score - λ × stdScore
          </code>
          <p className="text-xs text-muted-foreground mt-2">
            This composite score balances reliability (pass rate), quality (mean),
            worst-case performance (p10), and consistency (std penalty).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

type MethodCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge: string;
  color: "blue" | "purple" | "green" | "orange";
};

function MethodCard({ icon, title, description, badge, color }: MethodCardProps) {
  const colorClasses = {
    blue: "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30",
    purple: "border-purple-200 bg-purple-50 dark:border-purple-900 dark:bg-purple-950/30",
    green: "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30",
    orange: "border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30",
  };

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-muted-foreground">{icon}</div>
        <Badge variant="outline" className="text-xs">{badge}</Badge>
      </div>
      <h4 className="font-medium text-sm">{title}</h4>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FPF META-EVALUATOR
// ═══════════════════════════════════════════════════════════════

function FPFEvaluatorSection() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconUsers className="h-5 w-5 text-blue-500" />
          <CardTitle>FPF Meta-Evaluator</CardTitle>
        </div>
        <CardDescription>
          Panel of LLM Evaluators (PoLL) with WLNK aggregation for robust scoring.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="poll">
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <IconUsers className="h-4 w-4" />
                PoLL: 3-Judge Panel
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Instead of a single LLM judge, PromptAgent uses a panel of 3 diverse
                  judges with different temperatures (0.3, 0.5, 0.7) for evaluation diversity.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <JudgeBadge temp={0.3} label="Conservative" />
                  <JudgeBadge temp={0.5} label="Balanced" />
                  <JudgeBadge temp={0.7} label="Creative" />
                </div>
                <div className="rounded bg-muted p-3">
                  <p className="text-xs font-mono">
                    Benefits: 7x cheaper than single large model, less bias through diversity
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="wlnk">
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <IconShield className="h-4 w-4" />
                WLNK Aggregation
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Weakest-Link aggregation prevents "trust inflation" from optimistic judges.
                </p>
                <code className="block bg-muted rounded p-3 text-sm font-mono">
                  R_eff = max(0, min(R_i) - Φ(CL_min))
                </code>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>R_i</strong>: Individual judge scores</p>
                  <p><strong>Φ(CL)</strong>: Penalty based on judge disagreement (congruence level)</p>
                  <p><strong>Result</strong>: Conservative score that reflects true reliability</p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="congruence">
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <IconTarget className="h-4 w-4" />
                Congruence Levels (CL0-CL3)
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Congruence measures judge agreement. Higher disagreement = lower trust.
                </p>
                <div className="space-y-2">
                  <CongruenceLevel level="CL3" name="Verified" delta="< 0.10" penalty="0.00" />
                  <CongruenceLevel level="CL2" name="Validated" delta="< 0.25" penalty="0.05" />
                  <CongruenceLevel level="CL1" name="Plausible" delta="< 0.40" penalty="0.15" />
                  <CongruenceLevel level="CL0" name="Weak Guess" delta=">= 0.40" penalty="0.30" />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

function JudgeBadge({ temp, label }: { temp: number; label: string }) {
  return (
    <div className="text-center p-2 rounded border bg-background">
      <div className="text-lg font-bold">{temp}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function CongruenceLevel({ level, name, delta, penalty }: {
  level: string;
  name: string;
  delta: string;
  penalty: string;
}) {
  const colors: Record<string, string> = {
    CL3: "bg-green-100 dark:bg-green-900/30 border-green-300",
    CL2: "bg-blue-100 dark:bg-blue-900/30 border-blue-300",
    CL1: "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300",
    CL0: "bg-red-100 dark:bg-red-900/30 border-red-300",
  };

  return (
    <div className={`flex items-center justify-between p-2 rounded border ${colors[level]}`}>
      <div className="flex items-center gap-2">
        <Badge variant="outline">{level}</Badge>
        <span className="text-sm font-medium">{name}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        δ {delta} → Φ = {penalty}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// NQD SELECTION
// ═══════════════════════════════════════════════════════════════

function NQDSelectionSection() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconTarget className="h-5 w-5 text-purple-500" />
          <CardTitle>NQD Portfolio Selection</CardTitle>
        </div>
        <CardDescription>
          Pareto-front selection instead of single "best" candidate picking.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="pareto">
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <IconChartBar className="h-4 w-4" />
                Pareto Front Selection
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Instead of picking the single "best" prompt, NQD maintains a front of
                  non-dominated candidates across multiple quality dimensions.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <DimensionCard name="R_eff" desc="Reliability (from PoLL)" />
                  <DimensionCard name="Use-Value" desc="Improvement vs baseline" />
                </div>
                <p className="text-xs text-muted-foreground">
                  A candidate is dominated only if another beats it on ALL dimensions.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="creativity">
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <IconBulb className="h-4 w-4" />
                Creativity Characteristics
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  FPF Creativity-CHR metrics for tie-breaking and portfolio diversity.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <CreativityMetric
                    name="Novelty"
                    desc="Distance from reference prompts"
                    icon="N"
                  />
                  <CreativityMetric
                    name="Use-Value"
                    desc="Measured improvement"
                    icon="U"
                  />
                  <CreativityMetric
                    name="Constraint-Fit"
                    desc="Schema compliance"
                    icon="C"
                  />
                  <CreativityMetric
                    name="Diversity"
                    desc="Portfolio contribution"
                    icon="D"
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="eligibility">
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <IconShield className="h-4 w-4" />
                Eligibility Gate
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Candidates must pass a creativity gate to be considered:
                </p>
                <div className="rounded bg-muted p-3 text-sm">
                  <p><strong>Gate 1:</strong> Constraint-Fit = 1.0 (perfect schema compliance)</p>
                  <p className="text-muted-foreground">OR</p>
                  <p><strong>Gate 2:</strong> Use-Value &gt; 0 (improvement over baseline)</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ineligible candidates are tracked but excluded from Pareto selection.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

function DimensionCard({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="p-2 rounded border bg-muted/50">
      <div className="font-mono text-sm font-bold">{name}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
    </div>
  );
}

function CreativityMetric({ name, desc, icon }: { name: string; desc: string; icon: string }) {
  return (
    <div className="p-2 rounded border bg-background">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="h-6 w-6 p-0 flex items-center justify-center text-xs">
          {icon}
        </Badge>
        <span className="text-sm font-medium">{name}</span>
      </div>
      <div className="text-xs text-muted-foreground mt-1">{desc}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// METRICS GLOSSARY
// ═══════════════════════════════════════════════════════════════

function MetricsGlossary() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconInfoCircle className="h-5 w-5 text-gray-500" />
          <CardTitle>Metrics Glossary</CardTitle>
        </div>
        <CardDescription>
          Definitions of all metrics used in evaluation and selection.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2">
          <MetricDefinition
            name="Pass Rate"
            formula="valid_runs / total_runs"
            description="Percentage of runs producing schema-valid output"
          />
          <MetricDefinition
            name="Mean Score"
            formula="mean(scores)"
            description="Average quality across all runs"
          />
          <MetricDefinition
            name="P10 Score"
            formula="percentile(scores, 10)"
            description="10th percentile - worst-case quality"
          />
          <MetricDefinition
            name="Std Dev"
            formula="std(scores)"
            description="Consistency measure - lower is better"
          />
          <MetricDefinition
            name="R_eff"
            formula="max(0, min(R_i) - Φ)"
            description="Effective reliability after WLNK aggregation"
          />
          <MetricDefinition
            name="Objective"
            formula="0.45P + 0.35M + 0.20P10 - λσ"
            description="Composite ranking score for champion selection"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function MetricDefinition({ name, formula, description }: {
  name: string;
  formula: string;
  description: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="p-3 rounded border bg-muted/30 cursor-help">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{name}</span>
              <code className="text-xs bg-background px-1 rounded">{formula}</code>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Click to see detailed explanation</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ═══════════════════════════════════════════════════════════════
// REFERENCES
// ═══════════════════════════════════════════════════════════════

function References() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconExternalLink className="h-5 w-5 text-gray-500" />
          <CardTitle>Research References</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <ReferenceLink
            title="PoLL: Panel of LLM Evaluators"
            url="https://arxiv.org/abs/2404.18796"
            description="3-judge panel methodology"
          />
          <ReferenceLink
            title="OPRO: Large Language Models as Optimizers"
            url="https://arxiv.org/abs/2309.03409"
            description="Contrastive pair mining approach"
          />
          <ReferenceLink
            title="PromptEval: Efficient Multi-Prompt Evaluation"
            url="https://arxiv.org/pdf/2405.17202"
            description="Distributional evaluation methodology"
          />
          <ReferenceLink
            title="FPF: First Principles Framework"
            url="#"
            description="Trust calculus and assurance tuples"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ReferenceLink({ title, url, description }: {
  title: string;
  url: string;
  description: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between p-2 rounded border hover:bg-muted/50 transition-colors"
    >
      <div>
        <span className="font-medium">{title}</span>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <IconExternalLink className="h-4 w-4 text-muted-foreground" />
    </a>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════

export function MethodologyPanel() {
  return (
    <div className="space-y-6">
      <MethodologyOverview />
      <div className="grid gap-6 lg:grid-cols-2">
        <FPFEvaluatorSection />
        <NQDSelectionSection />
      </div>
      <MetricsGlossary />
      <References />
    </div>
  );
}
