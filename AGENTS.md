# AGENTS.md

Instructions for AI coding agents working with this repository.

## Project Overview

PromptAgent is a prompt optimization system that evolves prompts using a champion/challenger approach. It uses Mastra AI framework with local LLMs (via LM Studio) to:

1. **Generate** Azure DevOps User Stories from Epics using a candidate prompt
2. **Score** outputs against a fixed evaluation set using LLM-as-judge + heuristics
3. **Evolve** prompts by mutating and promoting the best-scoring candidate to "champion"

## Commands

```bash
bun install                          # Install dependencies
bun run --bun tsc --noEmit           # Type check
bun run src/cli/optimize.ts          # Run optimizer (main evolution loop)
bun run src/cli/generate.ts <EPIC_ID> # Generate stories for a single epic
```

## Architecture

```
src/
  config.ts         # Environment configuration
  models.ts         # LM Studio client factory (generator + judge models)
  schema.ts         # Zod schemas: Epic → StoryPack (ADO-compatible fields)
  generator.ts      # Mastra Agent with structured output
  scorer.ts         # Multi-metric scorer pipeline
  eval.ts           # Distributional evaluation
  pairMining.ts     # Contrastive pair mining for optimization
  patchEngineer.ts  # Prompt patch generation agent
  similarity.ts     # Cosine similarity utilities
  cli/
    optimize.ts     # Evolution loop: mutate → evaluate → promote
    generate.ts     # Single-shot generation for testing
    eval-dist.ts    # Distributional evaluation CLI
prompts/
  champion.md       # Current best prompt (versioned artifact)
  champion.base.md  # Base prompt (unchanged during optimization)
  champion.patch.md # Evolved patch section
data/
  epics.eval.json   # Fixed evaluation dataset
```

## Key Patterns

**Structured Output**: Use `jsonPromptInjection: true` when LM Studio's `response_format` support is incomplete:
```typescript
structuredOutput: {
  schema: storyPackSchema,
  jsonPromptInjection: true,
  errorStrategy: "strict",
}
```

**Separate Judge Model**: The scorer uses a separate model instance (`makeJudgeModel()`) to reduce "grading your own homework" bias.

**Scorer Pipeline**: Mastra scorers follow `preprocess → analyze → generateScore → generateReason` pattern with keyword coverage + LLM-as-judge components.

## Scoring Metrics

The composite score weights:
- 25% - Epic keyword coverage
- 30% - INVEST principles adherence
- 30% - Acceptance criteria testability (prefer Given/When/Then)
- 10% - Duplication penalty
- 5% - Story count sanity (4-8 optimal)

Schema validation is a hard gate (score = 0 if invalid).

## Dependencies

- `@mastra/core` - Agent, structured output, model providers
- `zod` - Schema validation (Zod 4.x)
- `p-limit` - Concurrency control for parallel evaluation
