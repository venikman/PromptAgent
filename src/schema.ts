import { z } from "npm:zod@4.3.5";

// ─────────────────────────────────────────────────
// Epic Input Schema (Azure DevOps-style)
// ─────────────────────────────────────────────────

export const epicSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  businessValue: z.string().optional(),
  successMetrics: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  nonFunctional: z.array(z.string()).optional(),
  outOfScope: z.array(z.string()).optional(),
  personas: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export type Epic = z.infer<typeof epicSchema>;

// ─────────────────────────────────────────────────
// Azure DevOps Work Item Fields
// ─────────────────────────────────────────────────

export const adoFieldsSchema = z.object({
  "System.Title": z.string().min(5),
  "System.Description": z.string().min(10),
  "Microsoft.VSTS.Common.AcceptanceCriteria": z.string().min(10),
  "Microsoft.VSTS.Scheduling.StoryPoints": z
    .number()
    .int()
    .min(0)
    .max(21)
    .optional(),
  "System.Tags": z.string().optional(), // semicolon-separated
});

export type AdoFields = z.infer<typeof adoFieldsSchema>;

// ─────────────────────────────────────────────────
// User Story Schema
// ─────────────────────────────────────────────────

export const userStorySchema = z.object({
  title: z.string(),
  asA: z.string(),
  iWant: z.string(),
  soThat: z.string(),
  acceptanceCriteria: z.array(z.string()).min(2),
  ado: z.object({
    fields: adoFieldsSchema,
  }),
});

export type UserStory = z.infer<typeof userStorySchema>;

// ─────────────────────────────────────────────────
// Story Pack Schema (Generator Output)
// ─────────────────────────────────────────────────

export const storyPackSchema = z.object({
  epicId: z.string(),
  epicTitle: z.string(),
  userStories: z.array(userStorySchema).min(1),
  assumptions: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  followUps: z.array(z.string()).default([]),
});

export type StoryPack = z.infer<typeof storyPackSchema>;
