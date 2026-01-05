import { z } from "zod";
import { createScorer } from "@mastra/core/scores";
import { KeywordCoverageMetric } from "@mastra/evals/nlp";
import type { Epic, StoryPack } from "../schema.ts";
import { storyPackSchema } from "../schema.ts";
import { makeJudgeModel } from "../models.ts";

type ScorerInput = Epic;
type ScorerOutput = {
  storyPack: StoryPack | null;
  rawText: string;
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function createStoryDecompositionScorer() {
  const judgeModel = makeJudgeModel();
  const keywordMetric = new KeywordCoverageMetric();

  return createScorer<ScorerInput, ScorerOutput>({
    name: "EpicToUserStoriesQuality",
    description: "Schema gate + keyword coverage + INVEST/testability judge",
    judge: {
      model: judgeModel,
      instructions:
        "You are a strict product coach. Score user stories consistently. Penalize vague acceptance criteria and oversized stories.",
    },
  })
    .preprocess(async ({ run }) => {
      const input = run.input!;
      const epicText = `${input.title}\n\n${input.description}`;
      const rawText = run.output.rawText ?? "";

      const parsed = storyPackSchema.safeParse(run.output.storyPack);
      const isValid = parsed.success;
      const storyCount = isValid ? parsed.data.userStories.length : 0;

      // Calculate keyword coverage
      const coverageResult = await keywordMetric.measure(epicText, rawText);

      return {
        epicText,
        rawText,
        isValid,
        storyCount,
        coverageScore: coverageResult.score,
      };
    })
    .analyze({
      description:
        "Judge INVEST, acceptance criteria testability, and duplication.",
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

      // Story count scoring: 4-8 is optimal
      const countScore =
        p.storyCount >= 4 && p.storyCount <= 8
          ? 1
          : p.storyCount === 3 || p.storyCount === 9
            ? 0.7
            : 0.4;

      // Weighted composite score
      const score =
        0.25 * p.coverageScore +
        0.3 * a.invest +
        0.3 * a.acceptanceCriteria +
        0.1 * a.duplication +
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
