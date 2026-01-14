import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import {
  DEFAULT_META_CONFIG,
  type MutationPrompt,
} from "../../src/meta-evolution/types.ts";
import {
  createSeedMutationPrompts,
  getMutationsByType,
  selectEliteMutations,
  selectMutationByFitness,
} from "../../src/meta-evolution/mutation-prompts.ts";
import { MetaEvolutionEngine } from "../../src/meta-evolution/evolution-engine.ts";

describe("Meta-Evolution Types", () => {
  it("should have valid default config", () => {
    expect(DEFAULT_META_CONFIG.taskPopulationSize).toBeGreaterThan(0);
    expect(DEFAULT_META_CONFIG.mutationPopulationSize).toBeGreaterThan(0);
    expect(DEFAULT_META_CONFIG.maxGenerations).toBeGreaterThan(0);
    expect(DEFAULT_META_CONFIG.eliteCount).toBeGreaterThan(0);
    expect(DEFAULT_META_CONFIG.hypermutationRate).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_META_CONFIG.hypermutationRate).toBeLessThanOrEqual(1);
    expect(DEFAULT_META_CONFIG.crossoverRate).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_META_CONFIG.crossoverRate).toBeLessThanOrEqual(1);
  });
});

describe("Seed Mutation Prompts", () => {
  it("should have all mutation types represented", () => {
    const prompts = createSeedMutationPrompts();
    const types = prompts.map((p) => p.type);
    expect(types).toContain("DIRECT_MUTATION");
    expect(types).toContain("EDA_MUTATION");
    expect(types).toContain("HYPERMUTATION");
    expect(types).toContain("LAMARCKIAN");
    expect(types).toContain("CROSSOVER");
    expect(types).toContain("ZERO_ORDER_HYPER");
  });

  it("should create seed mutation prompts with unique IDs", () => {
    const prompts = createSeedMutationPrompts();
    const ids = prompts.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should initialize fitness scores to 0.5", () => {
    const prompts = createSeedMutationPrompts();
    for (const p of prompts) {
      expect(p.fitness).toBe(0.5);
    }
  });

  it("should initialize usage counts to 0", () => {
    const prompts = createSeedMutationPrompts();
    for (const p of prompts) {
      expect(p.usageCount).toBe(0);
    }
  });

  it("should initialize success rates to 0.5", () => {
    const prompts = createSeedMutationPrompts();
    for (const p of prompts) {
      expect(p.successRate).toBe(0.5);
    }
  });

  it("should set generation to 0 for seed prompts", () => {
    const prompts = createSeedMutationPrompts();
    for (const p of prompts) {
      expect(p.generation).toBe(0);
    }
  });
});

describe("getMutationsByType", () => {
  it("should filter mutations by type", () => {
    const prompts = createSeedMutationPrompts();

    const directMutations = getMutationsByType(prompts, "DIRECT_MUTATION");
    expect(directMutations.length).toBeGreaterThan(0);
    for (const m of directMutations) {
      expect(m.type).toBe("DIRECT_MUTATION");
    }

    const hyperMutations = getMutationsByType(prompts, "HYPERMUTATION");
    expect(hyperMutations.length).toBeGreaterThan(0);
    for (const m of hyperMutations) {
      expect(m.type).toBe("HYPERMUTATION");
    }
  });

  it("should return empty array for missing type", () => {
    const result = getMutationsByType([], "DIRECT_MUTATION");
    expect(result).toHaveLength(0);
  });
});

describe("Mutation Selection", () => {
  const testMutations: MutationPrompt[] = [
    {
      id: "m1",
      type: "DIRECT_MUTATION",
      text: "mutation 1",
      fitness: 0.9,
      usageCount: 10,
      successRate: 0.8,
      generation: 0,
    },
    {
      id: "m2",
      type: "DIRECT_MUTATION",
      text: "mutation 2",
      fitness: 0.5,
      usageCount: 5,
      successRate: 0.5,
      generation: 0,
    },
    {
      id: "m3",
      type: "DIRECT_MUTATION",
      text: "mutation 3",
      fitness: 0.1,
      usageCount: 3,
      successRate: 0.2,
      generation: 0,
    },
  ];

  it("should select mutations with fitness-proportionate probability", () => {
    // Run multiple selections to verify statistical bias
    const selections: Record<string, number> = { m1: 0, m2: 0, m3: 0 };
    for (let i = 0; i < 1000; i++) {
      const selected = selectMutationByFitness(testMutations);
      selections[selected.id] = (selections[selected.id] ?? 0) + 1;
    }

    // High fitness should be selected more often than low fitness
    expect(selections.m1!).toBeGreaterThan(selections.m3!);
  });

  it("should exclude specified IDs from selection", () => {
    const selected = selectMutationByFitness(testMutations, ["m1", "m2"]);
    expect(selected.id).toBe("m3");
  });

  it("should throw when all mutations are excluded", () => {
    expect(() => {
      selectMutationByFitness(testMutations, ["m1", "m2", "m3"]);
    }).toThrow("No eligible mutations available");
  });

  it("should select elite mutations by fitness", () => {
    const elites = selectEliteMutations(testMutations, 2);
    expect(elites).toHaveLength(2);
    expect(elites[0]!.id).toBe("m1"); // Highest fitness
    expect(elites[1]!.id).toBe("m2"); // Second highest
  });

  it("should handle requesting more elites than available", () => {
    const elites = selectEliteMutations(testMutations, 10);
    expect(elites).toHaveLength(3); // Only 3 available
  });

  it("should handle empty mutation list gracefully", () => {
    const elites = selectEliteMutations([], 2);
    expect(elites).toHaveLength(0);
  });
});

describe("MetaEvolutionEngine", () => {
  it("should initialize with base prompt and config", () => {
    const engine = new MetaEvolutionEngine(
      "Test base prompt",
      "initial patch",
      {
        taskPopulationSize: 4,
        maxGenerations: 3,
      },
    );

    expect(engine).toBeDefined();
    const population = engine.getPopulation();
    expect(population.taskPrompts).toHaveLength(1);
    expect(population.taskPrompts[0]!.base).toBe("Test base prompt");
    expect(population.taskPrompts[0]!.patch).toBe("initial patch");
  });

  it("should initialize with seed mutation prompts", () => {
    const engine = new MetaEvolutionEngine("Base", "");
    const population = engine.getPopulation();

    expect(population.mutationPrompts.length).toBeGreaterThan(0);

    // Verify all standard types are present
    const types = new Set(population.mutationPrompts.map((m) => m.type));
    expect(types.has("DIRECT_MUTATION")).toBe(true);
    expect(types.has("HYPERMUTATION")).toBe(true);
  });

  it("should start with generation 0", () => {
    const engine = new MetaEvolutionEngine("Base", "");
    const population = engine.getPopulation();
    expect(population.generation).toBe(0);
  });

  it("should track best fitness and prompt ID", () => {
    const engine = new MetaEvolutionEngine("Base", "");
    const population = engine.getPopulation();

    expect(population.bestFitness).toBe(0);
    expect(population.bestTaskPromptId).toBe("task-0");
  });

  it("should return best prompt correctly", () => {
    const engine = new MetaEvolutionEngine("Test prompt", "with patch");
    const bestPrompt = engine.getBestPrompt();

    expect(bestPrompt).toBeDefined();
    expect(bestPrompt!.base).toBe("Test prompt");
    expect(bestPrompt!.patch).toBe("with patch");
  });

  it("should accept partial config overrides", () => {
    const engine = new MetaEvolutionEngine("Base", "", {
      taskPopulationSize: 16,
      maxGenerations: 50,
    });

    // The engine uses merged config internally
    expect(engine).toBeDefined();
  });
});

describe("TaskPrompt structure", () => {
  it("should have correct structure from engine initialization", () => {
    const engine = new MetaEvolutionEngine("My base", "My patch");
    const task = engine.getBestPrompt()!;

    expect(task.id).toBeDefined();
    expect(task.base).toBe("My base");
    expect(task.patch).toBe("My patch");
    expect(task.fitness).toBe(0);
    expect(task.generation).toBe(0);
    expect(task.mutationId).toBeUndefined();
    expect(task.parentId).toBeUndefined();
  });
});

describe("Population structure", () => {
  it("should contain all required fields", () => {
    const engine = new MetaEvolutionEngine("Base", "Patch");
    const pop = engine.getPopulation();

    expect(Array.isArray(pop.taskPrompts)).toBe(true);
    expect(Array.isArray(pop.mutationPrompts)).toBe(true);
    expect(typeof pop.generation).toBe("number");
    expect(typeof pop.bestFitness).toBe("number");
    expect(typeof pop.bestTaskPromptId).toBe("string");
  });
});
