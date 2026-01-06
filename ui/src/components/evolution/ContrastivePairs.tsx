import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { ContrastPair } from "@/types";
import {
  IconArrowRight,
  IconCheck,
  IconX,
  IconArrowsExchange,
  IconInfoCircle,
} from "@tabler/icons-react";

type PairCardProps = {
  pair: ContrastPair;
  index: number;
};

function PairCard({ pair, index }: PairCardProps) {
  const badStories = pair.bad.storyPack?.userStories.length ?? 0;
  const goodStories = pair.good.storyPack?.userStories.length ?? 0;
  const scoreDeltaPct = Math.round(pair.scoreDelta * 100);
  const similarityPct = Math.round(pair.similarity * 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Pair {index + 1}</Badge>
            <Badge variant="secondary" className="font-mono">
              {pair.epicId}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">
              Similarity: <span className="font-mono font-medium">{similarityPct}%</span>
            </span>
            <span className="text-muted-foreground">
              Delta: <span className="font-mono font-medium text-green-600">+{scoreDeltaPct}%</span>
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-start">
          {/* Bad Output */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="destructive" className="gap-1">
                <IconX className="h-3 w-3" />
                Bad
              </Badge>
              <span className="text-xs text-muted-foreground">
                Seed: {pair.bad.seed}
              </span>
            </div>
            <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  Score: {(pair.bad.score * 100).toFixed(0)}%
                </span>
                <span className="text-xs text-muted-foreground">
                  {badStories} stories
                </span>
              </div>
              <ScrollArea className="h-[120px]">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                  {pair.bad.rawText.slice(0, 500)}
                  {pair.bad.rawText.length > 500 && "..."}
                </pre>
              </ScrollArea>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex flex-col items-center justify-center pt-8 gap-1">
            <IconArrowRight className="h-6 w-6 text-muted-foreground" />
            <span className="text-xs text-green-600 font-medium">
              +{scoreDeltaPct}%
            </span>
          </div>

          {/* Good Output */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge className="gap-1 bg-green-500/10 text-green-600 border-green-500/20">
                <IconCheck className="h-3 w-3" />
                Good
              </Badge>
              <span className="text-xs text-muted-foreground">
                Seed: {pair.good.seed}
              </span>
            </div>
            <div className="rounded-md border border-green-500/20 bg-green-500/5 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  Score: {(pair.good.score * 100).toFixed(0)}%
                </span>
                <span className="text-xs text-muted-foreground">
                  {goodStories} stories
                </span>
              </div>
              <ScrollArea className="h-[120px]">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                  {pair.good.rawText.slice(0, 500)}
                  {pair.good.rawText.length > 500 && "..."}
                </pre>
              </ScrollArea>
            </div>
          </div>
        </div>

        {/* Analysis hint */}
        <div className="mt-4 p-2 rounded-md bg-muted/30 text-xs text-muted-foreground">
          <span className="font-medium">What differs?</span> Both outputs come from the same epic
          with {similarityPct}% similarity, yet the good one scores {scoreDeltaPct}% higher.
          This contrast reveals what the prompt needs to improve.
        </div>
      </CardContent>
    </Card>
  );
}

type ContrastivePairsProps = {
  pairs: ContrastPair[];
  loading?: boolean;
};

export function ContrastivePairs({ pairs, loading }: ContrastivePairsProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Contrastive Pairs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-48 animate-pulse bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (pairs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <Badge className="w-fit" variant="outline">
            <IconArrowsExchange className="h-3.5 w-3.5" />
            Step 1
          </Badge>
          <CardTitle>Contrastive Pairs</CardTitle>
          <CardDescription>
            Outputs from the same epic with high similarity but different quality scores.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <IconArrowsExchange className="h-12 w-12 mb-2 opacity-20" />
            <p>No contrastive pairs mined yet</p>
            <p className="text-xs mt-1">Run evaluation first, then mine pairs</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <IconArrowsExchange className="h-5 w-5" />
            Contrastive Pairs
          </h3>
          <p className="text-sm text-muted-foreground">
            {pairs.length} pairs found - similar inputs, different quality
          </p>
        </div>
      </div>

      {/* Educational note */}
      <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
        <IconInfoCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Why contrastive pairs?</span> When the same epic
          produces both good and bad outputs, the differences reveal what the prompt
          fails to consistently enforce. These pairs guide targeted improvements.
        </p>
      </div>

      <ScrollArea className="h-[500px]">
        <div className="space-y-4 pr-4">
          {pairs.map((pair, index) => (
            <PairCard key={`${pair.epicId}-${index}`} pair={pair} index={index} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
