# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PromptAgent is a prompt optimization system that evolves prompts using a champion/challenger approach. It uses Mastra AI framework with local LLMs (via LM Studio) to:

1. **Generate** Azure DevOps User Stories from Epics using a candidate prompt
2. **Score** outputs against a fixed evaluation set using LLM-as-judge + heuristics
3. **Evolve** prompts by mutating and promoting the best-scoring candidate to "champion"

## Build & Run Commands

```bash
# Install dependencies
bun install

# Type check
bun run --bun tsc --noEmit

# Run optimizer (main evolution loop)
bun run src/cli/optimize.ts

# Generate stories for a single epic (uses champion prompt)
bun run src/cli/generate.ts <EPIC_ID>
```

## Environment Setup

Create `.env` with LM Studio configuration:
```bash
LMSTUDIO_BASE_URL=http://127.0.0.1:1234/v1
LMSTUDIO_API_KEY=lm-studio
LMSTUDIO_MODEL=openai/gpt-oss-20b
LMSTUDIO_JUDGE_MODEL=openai/gpt-oss-20b  # Can differ from generator
```

## Architecture

```
src/
  mastra/
    models.ts           # LM Studio client factory (generator + judge models)
    schema.ts           # Zod schemas: Epic → StoryPack (ADO-compatible fields)
    agents/
      storyGenerator.ts # Mastra Agent with structured output
    scorers/
      storyDecompositionScorer.ts  # Multi-metric scorer pipeline
  cli/
    optimize.ts         # Evolution loop: mutate → evaluate → promote
    generate.ts         # Single-shot generation for testing
prompts/
  champion.md           # Current best prompt (versioned artifact)
data/
  epics.eval.json       # Fixed evaluation dataset
runs/
  iter-*.json           # Optimizer run logs
```

### Key Patterns

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

**Port Pattern for Data Sources**: Design `EpicSource` and `StorySink` interfaces to swap between local JSON and Azure DevOps without changing optimizer logic.

## Scoring Metrics

The composite score weights:
- 25% - Epic keyword coverage
- 30% - INVEST principles adherence
- 30% - Acceptance criteria testability (prefer Given/When/Then)
- 10% - Duplication penalty
- 5% - Story count sanity (4-8 optimal)

Schema validation is a hard gate (score = 0 if invalid).

## Adding New Mutations

Add mutation operators in `optimize.ts`:
```typescript
const ops = [
  () => ({ mutation: "description", prompt: modifiedPrompt }),
  // ... add new operators here
];
```

## Dependencies

- `@mastra/core` - Agent, structured output, model providers
- `@mastra/evals` - Scorer primitives, keyword coverage
- `zod` - Schema validation (Zod 4.x)
- `p-limit` - Concurrency control for parallel evaluation
