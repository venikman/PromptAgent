# AGENTS.md

Instructions for AI coding agents working with this repository.

## Project Overview

PromptAgent is a prompt optimization system that evolves prompts using a
champion/challenger approach. It uses Mastra AI framework with local LLMs (via
LM Studio) to:

1. **Generate** Azure DevOps User Stories from Epics using a candidate prompt
2. **Score** outputs against a fixed evaluation set using LLM-as-judge +
   heuristics
3. **Evolve** prompts by mutating and promoting the best-scoring candidate to
   "champion"

## Commands

```bash
deno task typecheck                  # Type check
deno task optimize                   # Run optimizer (main evolution loop)
deno task generate -- <EPIC_ID>      # Generate stories for a single epic
deno task lint                       # Lint
deno task fmt                        # Format
deno task test:e2e:install           # Install Playwright browsers
deno task test:e2e                   # Playwright e2e tests
deno task ui:dev                     # Run Fresh UI dev server
deno task ui:start                   # Run Fresh UI server
```

## Code Style (Functional)

- Prefer pure functions and immutable data; avoid in-place mutation and shared
  state.
- Use `const` and expression-based transforms (`map`, `reduce`, `filter`) over
  imperative loops.
- Avoid classes; favor functions + plain data.

## Architecture

```
src/
  cli/
    optimize.ts       # Evolution loop: mutate → evaluate → promote
    generate.ts       # Single-shot generation for testing
    eval-dist.ts      # Distributional evaluation CLI
  config.ts           # Environment configuration
  eval.ts             # Distributional evaluation
  fpf/                # FPF metrics + analysis
  generator.ts        # Mastra Agent with structured output
  judge/              # Judge prompt helpers
  meta-evolution/     # Meta-evolution engine
  models.ts           # LM Studio client factory (generator + judge models)
  orchestrator/       # Optimization orchestration + tools
  pairMining.ts       # Contrastive pair mining for optimization
  patchEngineer.ts    # Prompt patch generation agent
  schema.ts           # Zod schemas: Epic → StoryPack (ADO-compatible fields)
  scorer.ts           # Multi-metric scorer pipeline
  server/             # HTTP handlers
  similarity.ts       # Cosine similarity utilities
  telemetry.ts        # Telemetry stream + metrics
  ui/                 # Fresh SSR UI
prompts/
  champion.md       # Current best prompt (versioned artifact)
  champion.base.md  # Base prompt (unchanged during optimization)
  champion.patch.md # Evolved patch section
data/
  epics.eval.json   # Fixed evaluation dataset
```

## Key Patterns

**Structured Output**: Use `jsonPromptInjection: true` when LM Studio's
`response_format` support is incomplete:

```typescript
structuredOutput: {
  schema: storyPackSchema,
  jsonPromptInjection: true,
  errorStrategy: "strict",
}
```

**Separate Judge Model**: The scorer uses a separate model instance
(`makeJudgeModel()`) to reduce "grading your own homework" bias.

**Scorer Pipeline**: Mastra scorers follow
`preprocess → analyze → generateScore → generateReason` pattern with keyword
coverage + LLM-as-judge components.

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
