/**
 * Frontend type definitions for PromptAgent UI
 * These mirror the backend types from src/schema.ts and src/eval.ts
 */

// ─────────────────────────────────────────────────
// Epic Input (Azure DevOps-style)
// ─────────────────────────────────────────────────

export type Epic = {
  id: string;
  title: string;
  description: string;
  businessValue?: string;
  successMetrics?: string[];
  constraints?: string[];
  nonFunctional?: string[];
  outOfScope?: string[];
  personas?: string[];
  tags?: string[];
};

// ─────────────────────────────────────────────────
// Azure DevOps Work Item Fields
// ─────────────────────────────────────────────────

export type AdoFields = {
  "System.Title": string;
  "System.Description": string;
  "Microsoft.VSTS.Common.AcceptanceCriteria": string;
  "Microsoft.VSTS.Scheduling.StoryPoints"?: number;
  "System.Tags"?: string;
};

// ─────────────────────────────────────────────────
// User Story
// ─────────────────────────────────────────────────

export type UserStory = {
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  acceptanceCriteria: string[];
  ado: {
    fields: AdoFields;
  };
};

// ─────────────────────────────────────────────────
// Story Pack (Generator Output)
// ─────────────────────────────────────────────────

export type StoryPack = {
  epicId: string;
  epicTitle: string;
  userStories: UserStory[];
  assumptions: string[];
  risks: string[];
  followUps: string[];
};

// ─────────────────────────────────────────────────
// Generation Result
// ─────────────────────────────────────────────────

export type GenerateResult = {
  storyPack: StoryPack | null;
  rawText: string;
  instructions: string;
  error?: string;
  gammaTime?: string;
};

// ─────────────────────────────────────────────────
// Scoring Result
// ─────────────────────────────────────────────────

export type FPFSubscores = {
  correctness?: number;
  completeness?: number;
  processQuality?: number;
  safety?: number;
};

export type ScorerResult = {
  score: number;
  reason: string;
  fpfSubscores?: FPFSubscores;
  gateDecision?: "pass" | "degrade" | "block" | "abstain";
};

// ─────────────────────────────────────────────────
// Distributional Evaluation
// ─────────────────────────────────────────────────

export type DistRun = {
  seed: number;
  score: number;
  pass: boolean;
  storyPack: StoryPack | null;
  rawText: string;
  error?: string;
};

export type EpicDistResult = {
  epicId: string;
  runs: DistRun[];
  meanScore: number;
  p10Score: number;
  stdScore: number;
  passRate: number;
  discoverabilityK: number;
};

export type PromptDistReport = {
  promptId: string;
  perEpic: EpicDistResult[];
  agg: {
    meanOfMeans: number;
    meanPassRate: number;
    meanP10: number;
    meanStd: number;
    objective: number;
  };
};

// ─────────────────────────────────────────────────
// Evolution / Contrastive Pairs
// ─────────────────────────────────────────────────

export type ContrastPair = {
  epicId: string;
  good: {
    seed: number;
    score: number;
    rawText: string;
    storyPack: StoryPack | null;
  };
  bad: {
    seed: number;
    score: number;
    rawText: string;
    storyPack: StoryPack | null;
  };
  similarity: number;
  scoreDelta: number;
};

// ─────────────────────────────────────────────────
// Champion Prompt
// ─────────────────────────────────────────────────

export type ChampionPrompt = {
  base: string;
  patch: string;
  composed: string;
};

// ─────────────────────────────────────────────────
// API Response Types
// ─────────────────────────────────────────────────

export type ApiResponse<T> = {
  data?: T;
  error?: string;
};

export type EvalStatus = "idle" | "running" | "complete" | "error";

export type EvalTask = {
  taskId: string;
  status: EvalStatus;
  progress?: { completed: number; total: number };
  report?: PromptDistReport;
  error?: string;
};
