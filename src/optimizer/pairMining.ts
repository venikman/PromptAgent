/**
 * Contrastive Pair Mining for Prompt Optimization
 *
 * Implements the paper's approach: find "semantic nearest neighbors with large
 * quality delta" to guide OPRO-style prompt optimization.
 *
 * The idea: if two outputs are very similar but one scores much higher,
 * the difference reveals what makes outputs good vs bad. Feeding these
 * pairs to the patch engineer helps it identify targeted improvements.
 */

import type { StoryPack } from "../mastra/schema.ts";
import { cosine, hashVector } from "./similarity.ts";
import { env } from "../config.ts";

// ─────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────

/** A scored output from distributional evaluation */
export type ScoredOutput = {
  epicId: string;
  seed: number;
  score: number;
  pass: boolean;
  storyPack: StoryPack | null;
  rawText: string;
};

/** A contrastive pair: similar outputs with different quality */
export type ContrastPair = {
  epicId: string;
  /** Cosine similarity between the two outputs */
  sim: number;
  /** Absolute score difference */
  delta: number;
  /** The higher-scoring output */
  good: ScoredOutput;
  /** The lower-scoring output */
  bad: ScoredOutput;
};

// ─────────────────────────────────────────────────
// Text Extraction
// ─────────────────────────────────────────────────

/**
 * Extract a compact text representation from a StoryPack for similarity.
 *
 * Includes: story titles, narratives (asA/iWant/soThat), and acceptance criteria.
 * Excludes: ADO fields (redundant), assumptions/risks/followUps (metadata).
 */
function compactText(sp: StoryPack | null): string {
  if (!sp) return "";

  const parts: string[] = [];
  for (const story of sp.userStories) {
    parts.push(
      story.title,
      story.asA,
      story.iWant,
      story.soThat,
      ...story.acceptanceCriteria
    );
  }
  return parts.join("\n");
}

// ─────────────────────────────────────────────────
// Pair Mining
// ─────────────────────────────────────────────────

export type MineContrastivePairsParams = {
  /** Scored outputs from distributional evaluation */
  runs: ScoredOutput[];
  /** Minimum cosine similarity to consider "near neighbors" (default: env.PAIR_MIN_SIM) */
  minSim?: number;
  /** Minimum score delta to consider "contrastive" (default: env.PAIR_MIN_DELTA) */
  minDelta?: number;
  /** Maximum pairs to return (default: env.PAIR_MAX_PAIRS) */
  maxPairs?: number;
};

/**
 * Mine contrastive pairs from scored outputs.
 *
 * Algorithm:
 * 1. Group runs by epic (pairs must come from the same epic)
 * 2. For each pair of runs within an epic:
 *    - Compute cosine similarity between their outputs
 *    - Compute absolute score delta
 *    - Keep if sim >= minSim AND delta >= minDelta
 * 3. Sort by delta (descending), then by sim (descending)
 * 4. Return top maxPairs
 *
 * Time complexity: O(E * R^2) where E = epics, R = replicates per epic.
 * With R=5 and E=3, this is ~75 comparisons total—trivial.
 */
export function mineContrastivePairs(params: MineContrastivePairsParams): ContrastPair[] {
  const minSim = params.minSim ?? env.PAIR_MIN_SIM;
  const minDelta = params.minDelta ?? env.PAIR_MIN_DELTA;
  const maxPairs = params.maxPairs ?? env.PAIR_MAX_PAIRS;

  // Group runs by epic
  const byEpic = new Map<string, ScoredOutput[]>();
  for (const run of params.runs) {
    const existing = byEpic.get(run.epicId) ?? [];
    existing.push(run);
    byEpic.set(run.epicId, existing);
  }

  const candidates: ContrastPair[] = [];

  for (const [epicId, runs] of byEpic.entries()) {
    // Pre-compute vectors for all runs in this epic
    const texts = runs.map((r) => compactText(r.storyPack));
    const vectors = texts.map((t) => hashVector(t));

    // Compare all pairs
    for (let i = 0; i < runs.length; i++) {
      for (let j = i + 1; j < runs.length; j++) {
        const a = runs[i]!;
        const b = runs[j]!;

        // Skip if both outputs are empty (both failed)
        if (!a.storyPack && !b.storyPack) continue;

        const sim = cosine(vectors[i]!, vectors[j]!);
        const delta = Math.abs(a.score - b.score);

        // Apply thresholds
        if (sim < minSim) continue;
        if (delta < minDelta) continue;

        // Determine which is good vs bad
        const good = a.score >= b.score ? a : b;
        const bad = a.score >= b.score ? b : a;

        candidates.push({ epicId, sim, delta, good, bad });
      }
    }
  }

  // Sort: highest delta first, then highest similarity
  candidates.sort((p, q) => {
    const deltaDiff = q.delta - p.delta;
    if (Math.abs(deltaDiff) > 0.001) return deltaDiff;
    return q.sim - p.sim;
  });

  return candidates.slice(0, maxPairs);
}

// ─────────────────────────────────────────────────
// Formatting for Prompt Engineer
// ─────────────────────────────────────────────────

/**
 * Format contrastive pairs into a context string for the prompt patch engineer.
 *
 * Each pair shows:
 * - Epic ID, similarity, and delta
 * - GOOD output (score, seed, story pack)
 * - BAD output (score, seed, story pack)
 */
export function formatPairsForPrompt(pairs: ContrastPair[]): string {
  if (pairs.length === 0) {
    return "No contrastive pairs found (outputs too different or scores too similar).";
  }

  return pairs
    .map((p, idx) => {
      const lines: string[] = [
        `### PAIR ${idx + 1}`,
        `Epic: ${p.epicId} | Similarity: ${p.sim.toFixed(2)} | Delta: ${p.delta.toFixed(3)}`,
        "",
        `**GOOD** (score=${p.good.score.toFixed(3)}, seed=${p.good.seed})`,
        "```json",
        JSON.stringify(p.good.storyPack, null, 2),
        "```",
        "",
        `**BAD** (score=${p.bad.score.toFixed(3)}, seed=${p.bad.seed})`,
        "```json",
        JSON.stringify(p.bad.storyPack, null, 2),
        "```",
      ];
      return lines.join("\n");
    })
    .join("\n\n---\n\n");
}
