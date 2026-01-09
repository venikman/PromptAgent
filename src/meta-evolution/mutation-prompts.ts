/**
 * Seed Mutation Prompts
 *
 * Initial population of mutation-prompts that can generate task-prompt improvements.
 * These will evolve through hypermutation to become more effective.
 *
 * Based on PromptBreeder's thinking-styles and mutation operators.
 */

import type { MutationPrompt, MutationType } from "./types.ts";

// ═══════════════════════════════════════════════════════════════
// DIRECT MUTATION PROMPTS
// ═══════════════════════════════════════════════════════════════

const DIRECT_MUTATIONS: Omit<MutationPrompt, "id" | "fitness" | "usageCount" | "successRate" | "generation">[] = [
  {
    type: "DIRECT_MUTATION",
    text: `Analyze the prompt and identify ONE specific weakness that causes low-quality outputs.
Propose a targeted rule to address this weakness.
Output ONLY the new rule, nothing else.`,
  },
  {
    type: "DIRECT_MUTATION",
    text: `You are a prompt optimization expert. Review the current prompt for:
1. Missing constraints that lead to schema violations
2. Ambiguous instructions that cause inconsistency
3. Gaps in coverage for edge cases

Propose ONE additional rule that would have the biggest impact on quality.
Be specific and actionable. Output ONLY the rule.`,
  },
  {
    type: "DIRECT_MUTATION",
    text: `Think step by step about what makes good user stories:
- Independent: No dependencies between stories
- Negotiable: Room for discussion
- Valuable: Clear user value
- Estimable: Can be sized
- Small: Completable in one sprint
- Testable: Verifiable acceptance criteria

Which INVEST principle is the prompt weakest on? Add a rule to strengthen it.
Output ONLY the new rule.`,
  },
];

// ═══════════════════════════════════════════════════════════════
// EDA-STYLE MUTATION PROMPTS
// ═══════════════════════════════════════════════════════════════

const EDA_MUTATIONS: Omit<MutationPrompt, "id" | "fitness" | "usageCount" | "successRate" | "generation">[] = [
  {
    type: "EDA_MUTATION",
    text: `Given these examples of GOOD outputs (that scored well) and BAD outputs (that scored poorly),
identify the KEY PATTERN that distinguishes them.

Express this pattern as a new rule that encourages the GOOD pattern.
Be specific—reference the actual difference you observed.
Output ONLY the rule.`,
  },
  {
    type: "EDA_MUTATION",
    text: `Analyze the contrastive pairs statistically:
- What features appear more often in GOOD outputs?
- What features appear more often in BAD outputs?

Create a rule that maximizes the GOOD features and minimizes the BAD features.
Output ONLY the rule, be specific about the pattern.`,
  },
];

// ═══════════════════════════════════════════════════════════════
// LAMARCKIAN MUTATION PROMPTS
// ═══════════════════════════════════════════════════════════════

const LAMARCKIAN_MUTATIONS: Omit<MutationPrompt, "id" | "fitness" | "usageCount" | "successRate" | "generation">[] = [
  {
    type: "LAMARCKIAN",
    text: `A high-scoring output has been provided as a working example.
Reverse-engineer what made it successful:
- What structural patterns does it follow?
- What makes its acceptance criteria testable?
- How does it handle complexity?

Create a rule that captures this success pattern for future outputs.
Output ONLY the rule.`,
  },
  {
    type: "LAMARCKIAN",
    text: `You have a successful example output. Extract the "secret sauce":
- Why did this decomposition work well?
- What implicit rules did it follow?

Turn these implicit rules into an explicit instruction.
Output ONLY the rule.`,
  },
];

// ═══════════════════════════════════════════════════════════════
// HYPERMUTATION PROMPTS (Meta-level)
// ═══════════════════════════════════════════════════════════════

const HYPER_MUTATIONS: Omit<MutationPrompt, "id" | "fitness" | "usageCount" | "successRate" | "generation">[] = [
  {
    type: "HYPERMUTATION",
    text: `You are improving a MUTATION PROMPT (a prompt that generates improvements to other prompts).

The current mutation prompt is:
{MUTATION_PROMPT}

Its success rate is {SUCCESS_RATE}% (improvements achieved / applications).

Make it MORE EFFECTIVE by:
- Making it more specific about what to look for
- Adding structure to guide the analysis
- Focusing on high-impact improvements

Output ONLY the improved mutation prompt.`,
  },
  {
    type: "HYPERMUTATION",
    text: `Meta-optimization task: Improve this prompt-improvement prompt.

Current mutation prompt:
{MUTATION_PROMPT}

This mutation has been applied {USAGE_COUNT} times with {SUCCESS_RATE}% success.

Analyze WHY it might be failing and create a better version.
Output ONLY the improved mutation prompt.`,
  },
];

// ═══════════════════════════════════════════════════════════════
// ZERO-ORDER HYPERMUTATION (Create new mutations from scratch)
// ═══════════════════════════════════════════════════════════════

const ZERO_ORDER_HYPER: Omit<MutationPrompt, "id" | "fitness" | "usageCount" | "successRate" | "generation">[] = [
  {
    type: "ZERO_ORDER_HYPER",
    text: `Create a NEW mutation prompt from scratch that will help improve user story generation prompts.

Consider these thinking styles:
- Analytical: Break down problems systematically
- Creative: Find novel approaches
- Critical: Identify weaknesses ruthlessly
- Synthetic: Combine ideas from different sources

Create a mutation prompt that uses one of these styles to generate prompt improvements.
Output ONLY the new mutation prompt.`,
  },
];

// ═══════════════════════════════════════════════════════════════
// CROSSOVER PROMPTS
// ═══════════════════════════════════════════════════════════════

const CROSSOVER_MUTATIONS: Omit<MutationPrompt, "id" | "fitness" | "usageCount" | "successRate" | "generation">[] = [
  {
    type: "CROSSOVER",
    text: `You have TWO successful prompt patches. Combine the best elements of both.

Patch A (fitness={FITNESS_A}):
{PATCH_A}

Patch B (fitness={FITNESS_B}):
{PATCH_B}

Create a NEW patch that combines the strengths of both.
Keep it concise—don't just concatenate them.
Output ONLY the combined patch.`,
  },
];

// ═══════════════════════════════════════════════════════════════
// SEED POPULATION FACTORY
// ═══════════════════════════════════════════════════════════════

/**
 * Create the initial population of mutation prompts.
 */
export function createSeedMutationPrompts(): MutationPrompt[] {
  const all = [
    ...DIRECT_MUTATIONS,
    ...EDA_MUTATIONS,
    ...LAMARCKIAN_MUTATIONS,
    ...HYPER_MUTATIONS,
    ...ZERO_ORDER_HYPER,
    ...CROSSOVER_MUTATIONS,
  ];

  return all.map((m, idx) => ({
    ...m,
    id: `mutation-${m.type.toLowerCase()}-${idx}`,
    fitness: 0.5, // Neutral starting fitness
    usageCount: 0,
    successRate: 0.5, // Assume 50% until proven otherwise
    generation: 0,
  }));
}

/**
 * Get mutation prompts by type.
 */
export function getMutationsByType(
  mutations: MutationPrompt[],
  type: MutationType
): MutationPrompt[] {
  return mutations.filter((m) => m.type === type);
}

/**
 * Select a mutation prompt using fitness-proportional selection.
 */
export function selectMutationByFitness(
  mutations: MutationPrompt[],
  excludeIds: string[] = []
): MutationPrompt {
  const eligible = mutations.filter((m) => !excludeIds.includes(m.id));
  if (eligible.length === 0) {
    throw new Error("No eligible mutations available");
  }

  // Fitness-proportional selection (roulette wheel)
  const totalFitness = eligible.reduce((sum, m) => sum + Math.max(0.1, m.fitness), 0);
  let random = Math.random() * totalFitness;

  for (const mutation of eligible) {
    random -= Math.max(0.1, mutation.fitness);
    if (random <= 0) {
      return mutation;
    }
  }

  // Fallback to last eligible
  return eligible[eligible.length - 1]!;
}

/**
 * Select top-K mutations by fitness (elitism).
 */
export function selectEliteMutations(
  mutations: MutationPrompt[],
  k: number
): MutationPrompt[] {
  return [...mutations]
    .sort((a, b) => b.fitness - a.fitness)
    .slice(0, k);
}
