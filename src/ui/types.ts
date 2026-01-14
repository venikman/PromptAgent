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

export type AdoFields = {
  "System.Title": string;
  "System.Description": string;
  "Microsoft.VSTS.Common.AcceptanceCriteria": string;
  "Microsoft.VSTS.Scheduling.StoryPoints"?: number;
  "System.Tags"?: string;
};

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

export type StoryPack = {
  epicId: string;
  epicTitle: string;
  userStories: UserStory[];
  assumptions: string[];
  risks: string[];
  followUps: string[];
};

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

export type ChampionPrompt = {
  base: string;
  patch: string;
  composed: string;
};

export type TelemetryEntry = {
  key: string;
  count: number;
  errors: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p90Ms: number;
  p99Ms: number;
  inFlight: number;
};

export type TelemetrySnapshot = {
  type: "telemetry";
  at: string;
  periodMs: number;
  uptimeMs: number;
  http: TelemetryEntry[];
  ai: TelemetryEntry[];
  aiResponses: {
    key: string;
    at: string;
    durationMs?: number;
    success: boolean;
    error?: string;
    preview?: string;
    previewTruncated?: boolean;
    tokenUsage?: {
      prompt?: number;
      completion?: number;
      total?: number;
    };
  }[];
};
