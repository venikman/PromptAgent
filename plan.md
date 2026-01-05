You can build a “prompt champion” optimizer by treating **the prompt itself as a versioned artifact** (genotype), running it against a **fixed Epic test set**, scoring the generated user stories with **repeatable metrics**, and then promoting the best candidate to **champion**. Mastra gives you the building blocks you need: Agents (generation), structured output (parseable JSON), and scorers/custom scorers for evaluation.

Below is a practical, local-first setup that works **without Azure DevOps access** (Epics come from local JSON), using only **local LLMs via LM Studio**.

---

## 1) Target behavior you’re optimizing

Input: an **Epic** (Azure DevOps-style: title + description + constraints).

Output: a **pack of Azure DevOps User Stories**:

* Each story has “As a / I want / So that”
* Acceptance criteria are testable (preferably Given/When/Then)
* Small enough to fit a sprint
* Output is machine-usable for later ADO creation (fields like `System.Title`, `System.Description`, `Microsoft.VSTS.Common.AcceptanceCriteria`)

The optimizer’s job: keep generating **prompt variants** and keep the one that scores best on your evaluation set.

---

## 2) Local setup with Mastra + LM Studio

### Install Mastra packages

Mastra’s own installation guidance shows `mastra@latest`, `@mastra/core@latest` and `zod` as a typical base.
Scorers are provided via `@mastra/evals`.

Example (you can adjust tooling like `tsx` as you prefer):

```bash
bun init -y
bun add @mastra/core@latest @mastra/evals@latest zod@^4
bun add -d typescript @types/node p-limit
```

### Configure LM Studio in Mastra

Mastra supports LM Studio as a provider and shows an “advanced configuration” pattern: create an OpenAI-compatible client with a base URL like `http://127.0.0.1:1234/v1`, then use `lmstudio()` with that client.

Put this in your `.env`:

```bash
LMSTUDIO_BASE_URL=http://127.0.0.1:1234/v1
LMSTUDIO_API_KEY=lm-studio
LMSTUDIO_MODEL=openai/gpt-oss-120b

LMSTUDIO_JUDGE_MODEL=openai/gpt-oss-120b
```

> Note: LM Studio often doesn’t require a real API key, but some client libraries want something present.

### Structured output reliability

Mastra structured output returns a typed `response.object`, and you can enable `jsonPromptInjection: true` when the provider doesn’t support `response_format`.
This matters for local OpenAI-compatible servers where `response_format` support may be incomplete.

---

## 3) Minimal project structure

```
src/
  mastra/
    models.ts
    schema.ts
    agents/
      storyGenerator.ts
    scorers/
      storyDecompositionScorer.ts
  cli/
    optimize.ts
    generate.ts
prompts/
  champion.md
data/
  epics.eval.json
runs/
  (optimizer outputs)
```

---

## 4) Core code

### `src/mastra/models.ts`

LM Studio model factory (generator + judge can be different):

```ts
import { lmstudio } from "@mastra/core/llm";
import { createOpenAI } from "@ai-sdk/openai";

function makeLmStudioClient() {
  const baseURL = process.env.LMSTUDIO_BASE_URL ?? "http://127.0.0.1:1234/v1";
  const apiKey = process.env.LMSTUDIO_API_KEY ?? "lm-studio";
  return createOpenAI({ baseURL, apiKey });
}

export function makeGeneratorModel() {
  const client = makeLmStudioClient();
  const modelId = process.env.LMSTUDIO_MODEL ?? "openai/gpt-oss-120b";
  return lmstudio(modelId, { client });
}

export function makeJudgeModel() {
  const client = makeLmStudioClient();
  const modelId = process.env.LMSTUDIO_JUDGE_MODEL ?? process.env.LMSTUDIO_MODEL ?? "openai/gpt-oss-120b";
  return lmstudio(modelId, { client });
}
```

Mastra’s LM Studio provider + baseURL pattern is shown in their models docs.

---

### `src/mastra/schema.ts`

Epic input + ADO-like user story output (Zod ensures shape):

```ts
import { z } from "zod";

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

export const adoFieldsSchema = z.object({
  "System.Title": z.string().min(5),
  "System.Description": z.string().min(10),
  "Microsoft.VSTS.Common.AcceptanceCriteria": z.string().min(10),

  // optional but useful later
  "Microsoft.VSTS.Scheduling.StoryPoints": z.number().int().min(0).max(21).optional(),
  "System.Tags": z.string().optional(), // semicolon-separated
});

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

export const storyPackSchema = z.object({
  epicId: z.string(),
  epicTitle: z.string(),
  userStories: z.array(userStorySchema).min(1),
  assumptions: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  followUps: z.array(z.string()).default([]),
});

export type StoryPack = z.infer<typeof storyPackSchema>;
```

---

### `prompts/champion.md`

Start with a decent “baseline champion” (you’ll evolve it later):

```md
You are a senior product engineer. Decompose an Azure DevOps Epic into Azure DevOps User Stories.

Rules:
1) Output MUST be valid JSON matching the requested schema. No extra keys.
2) Create 4–8 user stories. Each story must be small enough for <= 1 sprint.
3) Each story MUST include:
   - title (short, action-oriented)
   - asA / iWant / soThat
   - acceptanceCriteria: >= 2 items, objectively testable
4) Prefer acceptance criteria in Given/When/Then style.
5) Do NOT invent requirements. If something is unclear, put it in assumptions or followUps.
6) Reflect constraints/nonFunctional/outOfScope from the Epic.

Azure DevOps mapping:
- System.Title: story title
- System.Description: include As a / I want / So that in readable Markdown
- Microsoft.VSTS.Common.AcceptanceCriteria: Markdown bullet list of criteria
- StoryPoints: optional estimate (0–21), only if you can justify it from the epic

Return JSON only.
```

---

### `src/mastra/agents/storyGenerator.ts`

One base agent; we override `instructions` per candidate prompt during optimization.

Structured output returns `response.object` (Zod-validated) and still gives you `response.text`.

````ts
import { Agent } from "@mastra/core/agent";
import { storyPackSchema, type Epic, type StoryPack } from "../schema";
import { makeGeneratorModel } from "../models";

export const baseStoryAgent = new Agent({
  name: "story-generator",
  model: makeGeneratorModel(),
  instructions: "You generate Azure DevOps user stories from epics.",
});

export async function generateStoryPack(epic: Epic, candidatePrompt: string): Promise<{ storyPack: StoryPack; rawText: string }> {
  const messages = [
    {
      role: "user" as const,
      content: [
        "Epic (JSON):",
        "```json",
        JSON.stringify(epic, null, 2),
        "```",
      ].join("\n"),
    },
  ];

  const response = await baseStoryAgent.generate(messages, {
    instructions: candidatePrompt,
    structuredOutput: {
      schema: storyPackSchema,
      jsonPromptInjection: true, // fallback when response_format isn't supported 
      errorStrategy: "strict",
    },
    modelSettings: {
      temperature: 0.3,
      maxOutputTokens: 2200,
    },
  });

  return {
    storyPack: response.object,
    rawText: response.text,
  };
}
````

---

## 5) Scoring: what “good” looks like

You need scoring that correlates with what your product team wants.

A good starter set:

1. **Schema validity (hard gate)**
2. **Epic keyword coverage** (does the output cover the Epic’s important terms?)
   Mastra provides a keyword coverage scorer that compares input vs output keyword overlap.
3. **INVEST + acceptance criteria testability** (LLM-as-judge)
4. **Story count sanity** (prefer 4–8)
5. **Duplication penalty** (don’t generate the same story 5 times)

### `src/mastra/scorers/storyDecompositionScorer.ts`

```ts
import { z } from "zod";
import { createScorer } from "@mastra/core/scores";
import { createKeywordCoverageScorer } from "@mastra/evals/scorers/code";
import type { Epic, StoryPack } from "../schema";
import { storyPackSchema } from "../schema";
import { makeJudgeModel } from "../models";

type OutputUnderTest = {
  storyPack: StoryPack | null;
  rawText: string;
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

export function createStoryDecompositionScorer() {
  const judgeModel = makeJudgeModel();
  const keywordScorer = createKeywordCoverageScorer();

  return createScorer<Epic, OutputUnderTest>({
    name: "EpicToUserStoriesQuality",
    description: "Schema gate + keyword coverage + INVEST/testability judge",
    judge: {
      model: judgeModel,
      instructions:
        "You are a strict product coach. Score user stories consistently. Penalize vague acceptance criteria and oversized stories.",
    },
  })
    .preprocess(async ({ run }) => {
      const epicText = `${run.input.title}\n\n${run.input.description}`;
      const rawText = run.output.rawText ?? "";

      const parsed = storyPackSchema.safeParse(run.output.storyPack);
      const isValid = parsed.success;
      const storyCount = isValid ? parsed.data.userStories.length : 0;

      const coverage = await keywordScorer.run({
        input: epicText,
        output: rawText,
      });

      return {
        epicText,
        rawText,
        isValid,
        storyCount,
        coverageScore: coverage.score,
      };
    })
    .analyze({
      description: "Judge INVEST, acceptance criteria testability, and duplication.",
      outputSchema: z.object({
        invest: z.number().min(0).max(1),
        acceptanceCriteria: z.number().min(0).max(1),
        duplication: z.number().min(0).max(1),
        notes: z.string(),
      }),
      createPrompt: ({ results }) => {
        const p = results.preprocessStepResult;
        return [
          "Evaluate this decomposition of an Epic into User Stories.",
          "",
          "Epic:",
          p.epicText,
          "",
          "Generated output (raw):",
          p.rawText,
          "",
          "Rubric (0..1):",
          "- invest: Independent, Negotiable, Valuable, Estimable, Small, Testable",
          "- acceptanceCriteria: objectively testable, no vague words like 'fast', 'user friendly' without thresholds",
          "- duplication: 1 means no duplication; 0 means heavy duplication / same story repeated",
          "",
          "Return ONLY JSON matching the schema.",
        ].join("\n");
      },
    })
    .generateScore(({ results }) => {
      const p = results.preprocessStepResult;
      if (!p.isValid) return 0;

      const a = results.analyzeStepResult;

      const countScore =
        p.storyCount >= 4 && p.storyCount <= 8 ? 1 :
        p.storyCount === 3 || p.storyCount === 9 ? 0.7 :
        0.4;

      const score =
        0.25 * p.coverageScore +
        0.30 * a.invest +
        0.30 * a.acceptanceCriteria +
        0.10 * a.duplication +
        0.05 * countScore;

      return clamp01(score);
    })
    .generateReason(({ score, results }) => {
      const p = results.preprocessStepResult;
      if (!p.isValid) return `Score=${score}. Schema validation failed.`;

      const a = results.analyzeStepResult;
      return [
        `Score=${score.toFixed(3)}`,
        `coverage=${p.coverageScore.toFixed(3)}`,
        `invest=${a.invest.toFixed(3)}`,
        `criteria=${a.acceptanceCriteria.toFixed(3)}`,
        `dup=${a.duplication.toFixed(3)}`,
        `stories=${p.storyCount}`,
        `notes=${a.notes}`,
      ].join(" | ");
    });
}
```

Custom scorers + the preprocess/analyze/generateScore pipeline is the standard Mastra pattern.

---

## 6) The optimizer loop

This is the “evolution” part:

* Keep `championPrompt`
* Generate `K` mutated prompts
* Evaluate each prompt on the same Epic test set
* Promote the best prompt if it beats the champion

### `src/cli/optimize.ts`

```ts
import fs from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";
import { epicSchema, type Epic } from "../mastra/schema";
import { generateStoryPack } from "../mastra/agents/storyGenerator";
import { createStoryDecompositionScorer } from "../mastra/scorers/storyDecompositionScorer";

type Candidate = {
  id: string;
  prompt: string;
  parentId: string;
  mutation: string;
};

function mutatePrompt(prompt: string, mutationSeed: number): { prompt: string; mutation: string } {
  // Deterministic-ish simple mutations (you can add more operators)
  const ops = [
    () => ({
      mutation: "Add stricter G/W/T requirement",
      prompt: prompt + "\n\nExtra rule: All acceptance criteria MUST use Given/When/Then format.\n",
    }),
    () => ({
      mutation: "Force explicit non-functional handling",
      prompt: prompt + "\n\nExtra rule: If epic has nonFunctional constraints, ensure at least one story covers them explicitly.\n",
    }),
    () => ({
      mutation: "Tighten story count",
      prompt: prompt.replace(/Create 4–8 user stories\./g, "Create 5–7 user stories."),
    }),
    () => ({
      mutation: "Add 'no invention' reminder",
      prompt: prompt + "\n\nReminder: If information is missing, do NOT guess; add to followUps.\n",
    }),
  ];

  const pick = ops[mutationSeed % ops.length];
  return pick();
}

async function readChampion(): Promise<string> {
  return fs.readFile(path.join("prompts", "champion.md"), "utf8");
}

async function writeChampion(prompt: string) {
  await fs.writeFile(path.join("prompts", "champion.md"), prompt, "utf8");
}

async function loadEpics(): Promise<Epic[]> {
  const raw = await fs.readFile(path.join("data", "epics.eval.json"), "utf8");
  const parsed = JSON.parse(raw) as unknown[];
  return parsed.map((e) => epicSchema.parse(e));
}

async function scoreCandidate(candidate: Candidate, epics: Epic[], concurrency = 2) {
  const scorer = createStoryDecompositionScorer();
  const limit = pLimit(concurrency);

  const perEpic = await Promise.all(
    epics.map((epic) =>
      limit(async () => {
        try {
          const gen = await generateStoryPack(epic, candidate.prompt);
          const scoreResult = await scorer.run({
            input: epic,
            output: { storyPack: gen.storyPack, rawText: gen.rawText },
          });

          return {
            epicId: epic.id,
            score: scoreResult.score,
            reason: scoreResult.reason,
          };
        } catch (err: any) {
          return {
            epicId: epic.id,
            score: 0,
            reason: `Generation/scoring failed: ${err?.message ?? String(err)}`,
          };
        }
      }),
    ),
  );

  const avg =
    perEpic.reduce((sum, r) => sum + r.score, 0) / Math.max(1, perEpic.length);

  return { avg, perEpic };
}

export async function main() {
  const epics = await loadEpics();
  let champion = await readChampion();
  let championScore = -1;

  // bootstrap champion score
  {
    const baseline: Candidate = { id: "champion", prompt: champion, parentId: "none", mutation: "baseline" };
    const scored = await scoreCandidate(baseline, epics, 2);
    championScore = scored.avg;
    console.log("Champion baseline:", championScore.toFixed(3));
  }

  const iterations = 10;
  const candidatesPerIter = 6;

  for (let iter = 1; iter <= iterations; iter++) {
    const candidates: Candidate[] = [];

    // Always include current champion
    candidates.push({ id: `iter${iter}-champion`, prompt: champion, parentId: "champion", mutation: "none" });

    // Mutants
    for (let i = 0; i < candidatesPerIter - 1; i++) {
      const mut = mutatePrompt(champion, iter * 100 + i);
      candidates.push({
        id: `iter${iter}-cand${i}`,
        prompt: mut.prompt,
        parentId: "champion",
        mutation: mut.mutation,
      });
    }

    // Evaluate
    const scored = [];
    for (const c of candidates) {
      const r = await scoreCandidate(c, epics, 2);
      scored.push({ candidate: c, result: r });
      console.log(`[iter ${iter}] ${c.id} avg=${r.avg.toFixed(3)} | ${c.mutation}`);
    }

    // Pick best
    scored.sort((a, b) => b.result.avg - a.result.avg);
    const best = scored[0];

    // Promote if better
    if (best.result.avg > championScore + 0.01) {
      champion = best.candidate.prompt;
      championScore = best.result.avg;
      await writeChampion(champion);
      console.log(`✅ Promoted new champion: score=${championScore.toFixed(3)} | ${best.candidate.mutation}`);
    } else {
      console.log(`No improvement (best=${best.result.avg.toFixed(3)}, champion=${championScore.toFixed(3)})`);
    }

    // Save run log
    await fs.mkdir("runs", { recursive: true });
    await fs.writeFile(
      path.join("runs", `iter-${iter}.json`),
      JSON.stringify(
        {
          iter,
          championScore,
          candidates: scored.map((s) => ({
            id: s.candidate.id,
            mutation: s.candidate.mutation,
            avg: s.result.avg,
            perEpic: s.result.perEpic,
          })),
        },
        null,
        2,
      ),
      "utf8",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

This is intentionally “simple evolution”: mutate → evaluate → promote.

If you later want more “self-referential” behavior:

* add a **Prompt Mutator Agent** that reads score breakdowns and proposes a better prompt (instead of fixed mutations)
* keep the **judge model separate** from the generator model to reduce “grading your own homework” bias

---

## 7) Local eval dataset

### `data/epics.eval.json`

A tiny set is enough to start; expand to 20–50 later.

```json
[
  {
    "id": "E-101",
    "title": "SSO + MFA for Internal Admin Portal",
    "description": "Implement Azure AD SSO for the admin portal. Require MFA. Users must be able to log in, log out, and handle expired sessions. Provide audit logging for sign-in events. Out of scope: redesigning UI.",
    "constraints": ["Must work with existing React app", "No breaking changes to current local login until rollout is complete"],
    "nonFunctional": ["Audit log retained for 90 days", "Login flow must be resilient to IdP outages"],
    "outOfScope": ["Full UI redesign"]
  },
  {
    "id": "E-202",
    "title": "Search in Product Catalog",
    "description": "Add search to product catalog by name, SKU, and tags. Support filtering by category and price range. Must return results within 500ms for typical queries. Must include analytics events for search usage.",
    "nonFunctional": ["p95 latency <= 500ms", "Track search events in analytics"],
    "constraints": ["Backend is Node + Postgres, no Elasticsearch in this phase"]
  },
  {
    "id": "E-303",
    "title": "Invoice Export for Finance",
    "description": "Finance needs CSV export of invoices for a date range, including customer, line items totals, tax, and status. Export must be accessible only to Finance role. Provide an audit record when export happens.",
    "constraints": ["Role model already exists", "CSV format must match existing finance template"]
  }
]
```

---

## 8) A “generate only” CLI (to see outputs)

### `src/cli/generate.ts`

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { epicSchema } from "../mastra/schema";
import { generateStoryPack } from "../mastra/agents/storyGenerator";

async function main() {
  const epicId = process.argv[2];
  if (!epicId) throw new Error("Usage: tsx src/cli/generate.ts <EPIC_ID>");

  const raw = await fs.readFile(path.join("data", "epics.eval.json"), "utf8");
  const epics = (JSON.parse(raw) as unknown[]).map((e) => epicSchema.parse(e));
  const epic = epics.find((e) => e.id === epicId);
  if (!epic) throw new Error(`Epic not found: ${epicId}`);

  const prompt = await fs.readFile(path.join("prompts", "champion.md"), "utf8");
  const out = await generateStoryPack(epic, prompt);

  console.log(JSON.stringify(out.storyPack, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

---

## 9) (Later) Azure DevOps integration, without breaking local testing

Design it as a replaceable port:

```ts
export interface EpicSource {
  listEpics(): Promise<Epic[]>;
  getEpic(id: string): Promise<Epic>;
}

export interface StorySink {
  createUserStories(epic: Epic, stories: StoryPack): Promise<void>;
}
```

* For local: `LocalJsonEpicSource("data/epics.eval.json")`, `ConsoleStorySink()`
* For Azure DevOps later: `AzureDevOpsEpicSource(PAT, org, project)` and `AzureDevOpsStorySink(...)`

This keeps your optimizer + generator identical in both modes.

---

## 10) Notes that will save you time

* **Separate generator and judge models** if you can (even if both are local), because it reduces evaluation bias.
* Keep a **hold-out Epic set** that the optimizer never sees; run it at the end to detect prompt overfitting.
* Use `jsonPromptInjection: true` for local OpenAI-compatible servers when you hit structured output API errors.
* If your local model struggles to produce perfect structured output, Mastra can use a **separate structuring model** (2-step) to extract structured objects.

---

If you want, I can also show a “Mastra Studio friendly” variant where the optimizer runs as a workflow and you can inspect runs in a UI—same logic, different packaging.

