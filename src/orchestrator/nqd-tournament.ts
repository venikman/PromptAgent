/**
 * NQD Tournament Adapter
 *
 * Integrates the FPF NQD Portfolio Selector (C.18) into the
 * optimization loop's tournament phase.
 *
 * Instead of single-objective ranking (sort by objective),
 * uses multi-objective Pareto selection over:
 * - R_eff (reliability from PoLL or objective proxy)
 * - Use-Value (improvement vs champion baseline)
 *
 * Plus tie-breakers: Diversity_P, Novelty@context
 */

import {
  type Candidate,
  type NQDArchive,
  type NQDSelectorConfig,
  runNQDSelection,
} from "../fpf/nqd-selector.ts";
import type { TournamentCandidate } from "./types.ts";
import type { PromptDistReport } from "../eval.ts";

// ═══════════════════════════════════════════════════════════════
// ADAPTER TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Extended tournament candidate with evaluation details.
 */
export interface NQDTournamentCandidate extends TournamentCandidate {
  /** Full prompt text for creativity analysis */
  promptText: string;
  /** Pass rate from distributional evaluation */
  passRate: number;
  /** Whether schema validation passed */
  schemaValid: boolean;
  /** R_eff from PoLL (if available) */
  rEff?: number;
}

/**
 * NQD tournament result with Pareto analysis.
 */
export interface NQDTournamentResult {
  /** All candidates sorted by NQD selection */
  candidates: NQDTournamentCandidate[];
  /** The selected winner (may be null if all ineligible) */
  winner: NQDTournamentCandidate | null;
  /** Full NQD archive with Pareto front */
  archive: NQDArchive;
  /** Whether NQD changed the winner vs simple objective sort */
  nqdChangedWinner: boolean;
}

/**
 * Configuration for NQD tournament.
 */
export interface NQDTournamentConfig {
  /** Champion's objective score (baseline for use-value) */
  championObjective: number;
  /** Champion's prompt text (reference for novelty) */
  championPrompt?: string;
  /** All prompt texts in current portfolio */
  portfolioPrompts?: string[];
  /** Minimum constraint-fit threshold (default 1.0) */
  constraintFitThreshold?: number;
  /** Whether to include illumination telemetry */
  includeIllumination?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// CONVERSION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Convert a tournament candidate to NQD candidate format.
 */
function toNQDCandidate(
  candidate: NQDTournamentCandidate,
): Candidate {
  return {
    id: candidate.id,
    name: candidate.id,
    promptText: candidate.promptText,
    objective: candidate.objective,
    passRate: candidate.passRate,
    schemaValid: candidate.schemaValid,
    rEff: candidate.rEff,
  };
}

/**
 * Convert NQD candidate back to tournament format.
 */
function fromNQDCandidate(
  nqdCandidate: Candidate,
  originalCandidate: NQDTournamentCandidate,
): NQDTournamentCandidate {
  return {
    ...originalCandidate,
    // Update with any computed values from NQD
    objective: nqdCandidate.objective,
  };
}

// ═══════════════════════════════════════════════════════════════
// NQD TOURNAMENT RUNNER
// ═══════════════════════════════════════════════════════════════

/**
 * Run NQD selection on tournament candidates.
 *
 * Replaces simple objective sorting with multi-objective
 * Pareto selection per FPF C.18.
 */
export function runNQDTournament(
  candidates: NQDTournamentCandidate[],
  config: NQDTournamentConfig,
): NQDTournamentResult {
  if (candidates.length === 0) {
    return {
      candidates: [],
      winner: null,
      archive: createEmptyArchive(),
      nqdChangedWinner: false,
    };
  }

  // Build reference prompts (champion + portfolio)
  const referencePrompts: string[] = [];
  if (config.championPrompt) {
    referencePrompts.push(config.championPrompt);
  }
  if (config.portfolioPrompts) {
    referencePrompts.push(...config.portfolioPrompts);
  }

  // Convert to NQD format
  const nqdCandidates = candidates.map(toNQDCandidate);

  // Run NQD selection
  const nqdConfig: NQDSelectorConfig = {
    baselineObjective: config.championObjective,
    referencePrompts,
    constraintFitThreshold: config.constraintFitThreshold ?? 1.0,
    useValueThreshold: 0,
    includeDominated: true,
    maxFrontSize: 10,
  };

  const archive = runNQDSelection(nqdCandidates, nqdConfig);

  // Get simple objective winner for comparison
  const simpleWinner = [...candidates].sort(
    (a, b) => b.objective - a.objective,
  )[0];

  // Get NQD winner
  const nqdWinner = archive.selectedWinner;

  // Convert winner back to tournament format
  let winner: NQDTournamentCandidate | null = null;
  if (nqdWinner) {
    const originalCandidate = candidates.find((c) => c.id === nqdWinner.id);
    if (originalCandidate) {
      winner = fromNQDCandidate(nqdWinner, originalCandidate);
    }
  }

  // Check if NQD changed the winner
  const nqdChangedWinner = simpleWinner !== undefined &&
    winner !== null &&
    simpleWinner.id !== winner.id;

  // Sort candidates by NQD ranking:
  // 1. Front members first (by use-value)
  // 2. Dominated next
  // 3. Ineligible last
  const frontIds = new Set(archive.paretoFront.front.map((c) => c.id));
  const dominatedIds = new Set(archive.paretoFront.dominated.map((c) => c.id));

  const sortedCandidates = [...candidates].sort((a, b) => {
    const aOnFront = frontIds.has(a.id);
    const bOnFront = frontIds.has(b.id);

    // Front members first
    if (aOnFront && !bOnFront) return -1;
    if (!aOnFront && bOnFront) return 1;

    // Within same tier, sort by objective
    if (aOnFront && bOnFront) {
      // Within front, use creativity comparison if available
      const aNqd = archive.paretoFront.front.find((c) => c.id === a.id);
      const bNqd = archive.paretoFront.front.find((c) => c.id === b.id);
      if (aNqd?.creativity && bNqd?.creativity) {
        return (bNqd.creativity.useValue ?? 0) -
          (aNqd.creativity.useValue ?? 0);
      }
      return b.objective - a.objective;
    }

    // Dominated before ineligible
    const aDominated = dominatedIds.has(a.id);
    const bDominated = dominatedIds.has(b.id);
    if (aDominated && !bDominated) return -1;
    if (!aDominated && bDominated) return 1;

    // Within dominated or ineligible, sort by objective
    return b.objective - a.objective;
  });

  return {
    candidates: sortedCandidates,
    winner,
    archive,
    nqdChangedWinner,
  };
}

/**
 * Quick selection: Get best candidate using NQD.
 */
export function selectNQDWinner(
  candidates: NQDTournamentCandidate[],
  config: NQDTournamentConfig,
): NQDTournamentCandidate | null {
  const result = runNQDTournament(candidates, config);
  return result.winner;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Create empty archive
// ═══════════════════════════════════════════════════════════════

function createEmptyArchive(): NQDArchive {
  return {
    paretoFront: {
      front: [],
      dominated: [],
      ineligible: [],
      stats: {
        totalCandidates: 0,
        eligibleCount: 0,
        frontSize: 0,
        dominatedCount: 0,
        ineligibleCount: 0,
      },
    },
    illumination: {
      coverage: 0,
      qdScore: 0,
      avgNovelty: 0,
      avgDiversity: 0,
      objectiveSpread: 0,
    },
    selectedWinner: null,
    timestamp: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
// ADAPTER: Convert basic tournament to NQD tournament
// ═══════════════════════════════════════════════════════════════

/**
 * Enrich basic tournament candidates with NQD-required fields.
 *
 * Use when you have basic TournamentCandidate[] and want to
 * run NQD selection.
 */
export function enrichForNQD(
  candidates: TournamentCandidate[],
  evalReports: Map<string, PromptDistReport>,
  promptTexts: Map<string, string>,
): NQDTournamentCandidate[] {
  return candidates.map((candidate) => {
    const report = evalReports.get(candidate.id);
    const promptText = promptTexts.get(candidate.id) ?? "";

    return {
      ...candidate,
      promptText,
      passRate: report?.agg.meanPassRate ?? 1.0,
      schemaValid: (report?.agg.meanPassRate ?? 1.0) > 0,
      // rEff would come from PoLL if enabled
    };
  });
}

/**
 * Simple enrichment when you only have prompt texts.
 *
 * Assumes perfect pass rate (for backward compatibility).
 */
export function enrichWithPrompts(
  candidates: TournamentCandidate[],
  getPromptText: (candidateId: string, patch: string) => string,
): NQDTournamentCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    promptText: getPromptText(candidate.id, candidate.patch),
    passRate: 1.0, // Assume perfect if we don't have eval data
    schemaValid: true,
  }));
}
