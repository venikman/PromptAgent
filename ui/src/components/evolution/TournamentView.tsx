import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  IconTrophy,
  IconCrown,
  IconArrowUp,
  IconArrowDown,
  IconMinus,
  IconInfoCircle,
  IconPlayerPlay,
} from "@tabler/icons-react";

type TournamentCandidate = {
  id: string;
  name: string;
  objective: number;
  passRate: number;
  meanScore: number;
  p10Score: number;
  isChampion: boolean;
  deltaVsChampion: number;
  runsCompleted: number;
  totalRuns: number;
};

type TournamentViewProps = {
  candidates: TournamentCandidate[];
  loading?: boolean;
  onRunTournament?: () => void;
  onPromoteChampion?: (candidateId: string) => void;
};

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <Badge variant="outline" className="gap-1 font-mono">
        <IconMinus className="h-3 w-3" />
        0%
      </Badge>
    );
  }
  if (delta > 0) {
    return (
      <Badge className="gap-1 font-mono bg-green-500/10 text-green-600 border-green-500/20">
        <IconArrowUp className="h-3 w-3" />
        +{(delta * 100).toFixed(1)}%
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1 font-mono">
      <IconArrowDown className="h-3 w-3" />
      {(delta * 100).toFixed(1)}%
    </Badge>
  );
}

export function TournamentView({
  candidates,
  loading,
  onRunTournament: _onRunTournament,
  onPromoteChampion,
}: TournamentViewProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tournament</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const sortedCandidates = [...candidates].sort((a, b) => b.objective - a.objective);
  const champion = sortedCandidates.find((c) => c.isChampion);
  const challenger = sortedCandidates.find((c) => !c.isChampion && c.deltaVsChampion > 0);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <IconTrophy className="h-5 w-5" />
          Tournament
        </h3>
        <p className="text-sm text-muted-foreground">
          Candidates compete on the evaluation set
        </p>
      </div>

      {/* Educational note */}
      <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
        <IconInfoCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Champion/Challenger:</span> Each candidate prompt
          runs the full evaluation. The one with the highest objective score becomes
          champion. This ensures improvements are validated, not just proposed.
        </p>
      </div>

      {candidates.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <IconTrophy className="h-12 w-12 mb-2 opacity-20" />
              <p>No tournament results yet</p>
              <p className="text-xs mt-1">Generate patches and run tournament</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2">
            {champion && (
              <Card className="border-yellow-500/30 bg-yellow-500/5">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <IconCrown className="h-5 w-5 text-yellow-600" />
                    <CardTitle className="text-base">Current Champion</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="font-medium">{champion.name}</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    {(champion.objective * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Pass: {(champion.passRate * 100).toFixed(0)}% | Mean: {(champion.meanScore * 100).toFixed(0)}%
                  </p>
                </CardContent>
              </Card>
            )}
            {challenger && (
              <Card className="border-green-500/30 bg-green-500/5">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <IconArrowUp className="h-5 w-5 text-green-600" />
                    <CardTitle className="text-base">Best Challenger</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="font-medium">{challenger.name}</p>
                  <p className="text-2xl font-bold text-green-600">
                    {(challenger.objective * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-green-600">
                      +{(challenger.deltaVsChampion * 100).toFixed(1)}%
                    </span>{" "}
                    vs champion
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Leaderboard Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Leaderboard</CardTitle>
              <CardDescription>
                {candidates.length} candidates evaluated
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Candidate</TableHead>
                    <TableHead className="text-right">Objective</TableHead>
                    <TableHead className="text-right">Pass Rate</TableHead>
                    <TableHead className="text-right">Mean</TableHead>
                    <TableHead className="text-right">P10</TableHead>
                    <TableHead className="text-right">vs Champion</TableHead>
                    <TableHead className="w-20">Progress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCandidates.map((candidate, index) => (
                    <TableRow key={candidate.id}>
                      <TableCell className="font-mono">
                        {index === 0 ? (
                          <IconCrown className="h-4 w-4 text-yellow-600" />
                        ) : (
                          index + 1
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{candidate.name}</span>
                          {candidate.isChampion && (
                            <Badge variant="outline" className="text-xs">
                              Champion
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {(candidate.objective * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {(candidate.passRate * 100).toFixed(0)}%
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {(candidate.meanScore * 100).toFixed(0)}%
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {(candidate.p10Score * 100).toFixed(0)}%
                      </TableCell>
                      <TableCell className="text-right">
                        <DeltaBadge delta={candidate.deltaVsChampion} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={candidate.totalRuns > 0 ? (candidate.runsCompleted / candidate.totalRuns) * 100 : 0}
                            className="h-2 w-12"
                          />
                          <span className="text-xs text-muted-foreground">
                            {candidate.runsCompleted}/{candidate.totalRuns}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-center gap-4">
            <Button disabled variant="outline">
              <IconPlayerPlay className="mr-2 h-4 w-4" />
              Run Tournament (Requires LLM)
            </Button>
            {challenger && challenger.deltaVsChampion > 0 && (
              <Button
                disabled
                onClick={() => onPromoteChampion?.(challenger.id)}
              >
                <IconCrown className="mr-2 h-4 w-4" />
                Promote Challenger
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
