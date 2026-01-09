/**
 * Meta-Evolution View Component
 *
 * Visualizes PromptBreeder-style mutation-prompt evolution:
 * - Mutation prompts with fitness scores
 * - Selection pressure (which mutations get picked)
 * - Hypermutation events (mutations of mutations)
 */

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  IconDna,
  IconFlame,
  IconTrendingUp,
  IconTrendingDown,
  IconSparkles,
  IconArrowsShuffle,
} from "@tabler/icons-react";

// ─────────────────────────────────────────────────────────────
// Types (mirror backend types for UI)
// ─────────────────────────────────────────────────────────────

export type MutationType =
  | "DIRECT_MUTATION"
  | "EDA_MUTATION"
  | "HYPERMUTATION"
  | "LAMARCKIAN"
  | "CROSSOVER"
  | "ZERO_ORDER_HYPER";

export interface MutationPrompt {
  id: string;
  text: string;
  type: MutationType;
  fitness: number;
  usageCount: number;
  successRate: number;
  generation: number;
  parentId?: string;
}

export interface GenerationStats {
  generation: number;
  bestFitness: number;
  meanFitness: number;
  mutationsApplied: number;
  successfulMutations: number;
  hypermutations: number;
  bestMutationId: string;
}

export interface MetaEvolutionViewProps {
  mutationPrompts: MutationPrompt[];
  generationStats: GenerationStats[];
  currentGeneration: number;
  loading?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Demo Data
// ─────────────────────────────────────────────────────────────

export const DEMO_MUTATION_PROMPTS: MutationPrompt[] = [
  {
    id: "mut-1",
    text: "Improve the prompt by adding more specific acceptance criteria guidelines. Focus on testability and measurability.",
    type: "DIRECT_MUTATION",
    fitness: 0.72,
    usageCount: 8,
    successRate: 0.625,
    generation: 0,
  },
  {
    id: "mut-2",
    text: "Analyze the differences between good and bad outputs, then suggest targeted improvements to address the specific failure modes.",
    type: "EDA_MUTATION",
    fitness: 0.81,
    usageCount: 12,
    successRate: 0.75,
    generation: 0,
  },
  {
    id: "mut-3",
    text: "Rewrite the prompt section that handles story point estimation, using concrete examples for each Fibonacci value.",
    type: "LAMARCKIAN",
    fitness: 0.65,
    usageCount: 5,
    successRate: 0.4,
    generation: 1,
    parentId: "mut-1",
  },
  {
    id: "mut-4",
    text: "Combine the best aspects of the top two performing prompts, merging their acceptance criteria approaches.",
    type: "CROSSOVER",
    fitness: 0.78,
    usageCount: 3,
    successRate: 0.67,
    generation: 2,
  },
];

export const DEMO_GENERATION_STATS: GenerationStats[] = [
  { generation: 0, bestFitness: 0.68, meanFitness: 0.52, mutationsApplied: 4, successfulMutations: 2, hypermutations: 0, bestMutationId: "mut-2" },
  { generation: 1, bestFitness: 0.74, meanFitness: 0.61, mutationsApplied: 5, successfulMutations: 3, hypermutations: 1, bestMutationId: "mut-2" },
  { generation: 2, bestFitness: 0.81, meanFitness: 0.68, mutationsApplied: 4, successfulMutations: 3, hypermutations: 0, bestMutationId: "mut-4" },
];

// ─────────────────────────────────────────────────────────────
// Utility Components
// ─────────────────────────────────────────────────────────────

const MUTATION_TYPE_LABELS: Record<MutationType, { label: string; color: string; icon: typeof IconDna }> = {
  DIRECT_MUTATION: { label: "Direct", color: "bg-blue-500/20 text-blue-700 dark:text-blue-300", icon: IconDna },
  EDA_MUTATION: { label: "EDA", color: "bg-purple-500/20 text-purple-700 dark:text-purple-300", icon: IconTrendingUp },
  HYPERMUTATION: { label: "Hyper", color: "bg-orange-500/20 text-orange-700 dark:text-orange-300", icon: IconFlame },
  LAMARCKIAN: { label: "Lamarck", color: "bg-green-500/20 text-green-700 dark:text-green-300", icon: IconSparkles },
  CROSSOVER: { label: "Crossover", color: "bg-pink-500/20 text-pink-700 dark:text-pink-300", icon: IconArrowsShuffle },
  ZERO_ORDER_HYPER: { label: "Zero-Order", color: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300", icon: IconFlame },
};

function MutationTypeBadge({ type }: { type: MutationType }) {
  const config = MUTATION_TYPE_LABELS[type];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`${config.color} gap-1`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function FitnessBar({ fitness, label }: { fitness: number; label?: string }) {
  const percentage = Math.round(fitness * 100);
  const color = fitness >= 0.7 ? "bg-green-500" : fitness >= 0.5 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="space-y-1">
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
      <div className="flex items-center gap-2">
        <Progress value={percentage} className="h-2 flex-1" />
        <span className="text-xs font-medium w-10 text-right">{percentage}%</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

export function MetaEvolutionView({
  mutationPrompts,
  generationStats,
  currentGeneration,
  loading = false,
}: MetaEvolutionViewProps) {
  // Sort mutations by fitness (highest first)
  const sortedMutations = useMemo(
    () => [...mutationPrompts].sort((a, b) => b.fitness - a.fitness),
    [mutationPrompts]
  );

  // Calculate aggregate stats
  const stats = useMemo(() => {
    if (generationStats.length === 0) return null;
    const latest = generationStats[generationStats.length - 1]!;
    const totalHypermutations = generationStats.reduce((sum, g) => sum + g.hypermutations, 0);
    const totalMutations = generationStats.reduce((sum, g) => sum + g.mutationsApplied, 0);
    const totalSuccesses = generationStats.reduce((sum, g) => sum + g.successfulMutations, 0);

    return {
      currentBest: latest.bestFitness,
      improvement: latest.bestFitness - generationStats[0]!.bestFitness,
      totalHypermutations,
      overallSuccessRate: totalMutations > 0 ? totalSuccesses / totalMutations : 0,
    };
  }, [generationStats]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconDna className="h-5 w-5 animate-pulse" />
            Meta-Evolution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading mutation prompts...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (mutationPrompts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconDna className="h-5 w-5" />
            Meta-Evolution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <IconDna className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No mutation prompts yet.</p>
            <p className="text-sm mt-1">
              Enable meta-evolution in the optimization config to see mutation-prompt evolution.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{(stats.currentBest * 100).toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">Best Fitness</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold flex items-center gap-1">
                {stats.improvement >= 0 ? (
                  <IconTrendingUp className="h-5 w-5 text-green-500" />
                ) : (
                  <IconTrendingDown className="h-5 w-5 text-red-500" />
                )}
                {stats.improvement >= 0 ? "+" : ""}{(stats.improvement * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">Improvement</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.totalHypermutations}</div>
              <p className="text-xs text-muted-foreground">Hypermutations</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{(stats.overallSuccessRate * 100).toFixed(0)}%</div>
              <p className="text-xs text-muted-foreground">Success Rate</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Mutation Prompts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <IconDna className="h-5 w-5" />
              Mutation Prompts
            </span>
            <Badge variant="outline">Gen {currentGeneration}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <TooltipProvider>
            {sortedMutations.map((mutation, idx) => (
              <div
                key={mutation.id}
                className={`rounded-lg border p-4 space-y-3 ${
                  idx === 0 ? "border-green-500/50 bg-green-500/5" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2">
                    {idx === 0 && (
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge className="bg-green-500">Best</Badge>
                        </TooltipTrigger>
                        <TooltipContent>Highest fitness mutation</TooltipContent>
                      </Tooltip>
                    )}
                    <MutationTypeBadge type={mutation.type} />
                    {mutation.parentId && (
                      <Badge variant="outline" className="text-xs">
                        Derived from {mutation.parentId}
                      </Badge>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Gen {mutation.generation}
                  </span>
                </div>

                <p className="text-sm line-clamp-2">{mutation.text}</p>

                <div className="grid grid-cols-3 gap-4">
                  <FitnessBar fitness={mutation.fitness} label="Fitness" />
                  <FitnessBar fitness={mutation.successRate} label="Success Rate" />
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Usage</span>
                    <div className="text-sm font-medium">{mutation.usageCount} times</div>
                  </div>
                </div>
              </div>
            ))}
          </TooltipProvider>
        </CardContent>
      </Card>

      {/* Generation History */}
      {generationStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconTrendingUp className="h-5 w-5" />
              Generation History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {generationStats.map((gen) => (
                <div
                  key={gen.generation}
                  className="flex items-center gap-4 text-sm"
                >
                  <Badge variant="outline" className="w-16 justify-center">
                    Gen {gen.generation}
                  </Badge>
                  <div className="flex-1">
                    <Progress
                      value={gen.bestFitness * 100}
                      className="h-2"
                    />
                  </div>
                  <span className="w-12 text-right font-medium">
                    {(gen.bestFitness * 100).toFixed(1)}%
                  </span>
                  <span className="w-24 text-muted-foreground text-xs">
                    {gen.successfulMutations}/{gen.mutationsApplied} success
                  </span>
                  {gen.hypermutations > 0 && (
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge variant="outline" className="bg-orange-500/20 text-orange-700 dark:text-orange-300">
                          <IconFlame className="h-3 w-3 mr-1" />
                          {gen.hypermutations}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        {gen.hypermutations} hypermutation(s) this generation
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
