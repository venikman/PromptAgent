# PromptAgent

A prompt optimization system that evolves prompts using a champion/challenger
approach. Uses Mastra AI framework with local LLMs (via LM Studio) to
automatically improve prompts through iterative evaluation.

## How It Works

### Overview

PromptAgent optimizes prompts by treating them as candidates in an evolutionary
process:

```
┌─────────────────────────────────────────────────────────────────┐
│                     OPTIMIZATION LOOP                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐             │
│   │ Champion │ ──►  │  Mutate  │ ──►  │Challenger│             │
│   │  Prompt  │      │          │      │  Prompt  │             │
│   └──────────┘      └──────────┘      └──────────┘             │
│        │                                    │                   │
│        │                                    │                   │
│        ▼                                    ▼                   │
│   ┌──────────┐                        ┌──────────┐             │
│   │ Generate │                        │ Generate │             │
│   │ Stories  │                        │ Stories  │             │
│   └──────────┘                        └──────────┘             │
│        │                                    │                   │
│        │         ┌──────────┐               │                   │
│        └────────►│  Score   │◄──────────────┘                   │
│                  │ & Compare│                                   │
│                  └────┬─────┘                                   │
│                       │                                         │
│                       ▼                                         │
│              ┌─────────────────┐                                │
│              │ Better score?   │                                │
│              │ Promote to      │                                │
│              │ Champion        │                                │
│              └─────────────────┘                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### The Three Phases

**1. Generate** - Use a prompt to transform Epics into User Stories

```
Epic (input)              Prompt                    Stories (output)
┌────────────────┐       ┌────────────────┐       ┌────────────────┐
│ "As a platform │  ──►  │ System prompt  │  ──►  │ Story 1: ...   │
│  admin, I need │       │ with rules for │       │ Story 2: ...   │
│  user mgmt..." │       │ decomposition  │       │ Story 3: ...   │
└────────────────┘       └────────────────┘       └────────────────┘
```

**2. Score** - Evaluate output quality using multiple metrics

```
┌─────────────────────────────────────────────────────────────┐
│                    SCORING PIPELINE                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐                                        │
│  │ Schema Valid?   │──── No ────► Score = 0 (hard fail)     │
│  └────────┬────────┘                                        │
│           │ Yes                                             │
│           ▼                                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              WEIGHTED COMPOSITE SCORE               │    │
│  ├─────────────────────────────────────────────────────┤    │
│  │  25% ── Epic keyword coverage                       │    │
│  │  30% ── INVEST principles (LLM-as-judge)            │    │
│  │  30% ── Acceptance criteria testability (GWT)       │    │
│  │  10% ── Duplication penalty                         │    │
│  │   5% ── Story count sanity (4-8 optimal)            │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**3. Evolve** - Mutate prompts and promote winners

```
Generation N                              Generation N+1
┌────────────┐                           ┌────────────┐
│  Champion  │ ── mutate ──► Challenger  │  Champion  │
│  Score: 72 │               Score: 78   │  Score: 78 │ ◄── promoted!
└────────────┘                           └────────────┘
```

### Separate Judge Model

To avoid "grading your own homework" bias, the system uses two models:

```
┌─────────────────┐         ┌─────────────────┐
│  Generator LLM  │         │   Judge LLM     │
│  (creates)      │         │   (evaluates)   │
├─────────────────┤         ├─────────────────┤
│ Writes stories  │         │ Scores INVEST   │
│ from prompts    │         │ compliance      │
└─────────────────┘         └─────────────────┘
        │                           │
        │                           │
        └───────────────────────────┘
              Can be different models
```

## Project Structure

```
src/
  cli/                  # CLI entrypoints (optimize/generate/eval)
  config.ts             # Environment configuration
  eval.ts               # Distributional evaluation
  fpf/                  # FPF metrics + analysis
  generator.ts          # Mastra Agent with structured output
  judge/                # Judge prompt helpers
  meta-evolution/       # Meta-evolution engine
  models.ts             # LM Studio client (generator + judge)
  orchestrator/         # Optimization orchestration + tools
  pairMining.ts         # Contrastive pair mining
  patchEngineer.ts      # Prompt patch generation agent
  schema.ts             # Zod schemas: Epic → StoryPack
  scorer.ts             # Multi-metric scorer pipeline
  server/               # HTTP handlers
  similarity.ts         # Cosine similarity utilities
  telemetry.ts          # Telemetry stream + metrics
  ui/                   # Fresh SSR UI
prompts/
  champion.md           # Current best prompt (versioned artifact)
  champion.base.md      # Base prompt (unchanged during optimization)
  champion.patch.md     # Evolved patch section
data/
  epics.eval.json       # Fixed evaluation dataset
tests/
  ...                   # Deno + Playwright tests
```

## Quick Start

```bash
# Configure LM Studio connection
cp .env.example .env
# Edit .env with your LM Studio settings

# Run the optimizer
deno task optimize

# Generate stories for a single epic
deno task generate -- <EPIC_ID>
```

## UI + API (Single App)

The backend API and Fresh SSR UI run as a single app locally.

```bash
# Starts backend + Fresh UI on :8000
deno task dev
```

- App (UI + API): `http://localhost:8000`

## Environment Setup

Create `.env` with LM Studio configuration:

```bash
LMSTUDIO_BASE_URL=http://127.0.0.1:1234/v1
LMSTUDIO_API_KEY=lm-studio
LMSTUDIO_MODEL=openai/gpt-oss-120b
LMSTUDIO_JUDGE_MODEL=openai/gpt-oss-120b  # Can differ from generator
```

## Deno Deploy (Ollama Cloud)

This repo uses Deno for local optimization (with LM Studio) and also includes a
lightweight Deno Deploy API that proxies to Ollama Cloud. It lives at
`deploy/main.ts` and exposes:

- `GET /health` for a basic health check
- `POST /generate` to proxy a `prompt` to Ollama Cloud (non-streaming)
- `GET /` for the Fresh SSR UI

### UI Demo (Fresh SSR)

The UI lives in `src/ui/` and is rendered by Fresh. For Deno Deploy, run
`deno task ui:build` (CI does this) to generate `src/ui/_fresh` before deploy.

### Required Deno Deploy Environment Variables

Set these in the Deno Deploy project settings:

- `OLLAMA_API_KEY` (Ollama Cloud API key)
- `OLLAMA_MODEL` (default model name for requests)
- `OLLAMA_API_BASE_URL` (optional; defaults to `https://ollama.com/api`)

### Example Request

```bash
curl -X POST https://<your-deploy-domain>/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Summarize this epic into 5 user stories.","model":"<your-model>"}'
```

### GitHub Actions Deployment

The workflow `.github/workflows/deploy-deno.yml` deploys on `main` pushes using
`deployctl`. Set a GitHub repository variable:

- `DENO_DEPLOY_PROJECT` (your Deno Deploy project name)

If not set, it defaults to `promptagent`.

Add a GitHub repository **secret** for authentication:

- `DENO_DEPLOY_TOKEN` (Deno Deploy access token)

## Dependencies

- `@mastra/core` - Agent framework with structured output
- `@mastra/evals` - Scorer primitives, keyword coverage
- `zod` - Schema validation
- `p-limit` - Concurrency control
