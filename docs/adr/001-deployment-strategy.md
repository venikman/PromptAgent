# ADR-001: Deployment Strategy

**Status:** Accepted\
**Date:** 2026-01-09\
**Decision Makers:** @venikman

## Context

PromptAgent requires a deployment strategy that supports:

1. **Local development** with LM Studio (free, offline LLM inference)
2. **Staging environment** for testing before production
3. **Production deployment** with cloud LLM providers (OpenRouter, OpenAI, etc.)

The challenge is managing configuration across these environments without:

- Accidentally deploying localhost URLs to production
- Requiring complex build-time configuration
- Breaking backwards compatibility when renaming env vars

## Decision

### Multi-Environment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ENVIRONMENTS                              │
├─────────────────┬─────────────────┬─────────────────────────────┤
│     LOCAL       │     STAGING     │        PRODUCTION           │
├─────────────────┼─────────────────┼─────────────────────────────┤
│ LM Studio       │ OpenRouter      │ OpenRouter / OpenAI         │
│ localhost:1234  │ Deno Deploy     │ Deno Deploy                 │
│ No API key req  │ promptagent-    │ promptagent                 │
│                 │ staging         │                             │
├─────────────────┼─────────────────┼─────────────────────────────┤
│ .env (local)    │ Deno Deploy     │ Deno Deploy                 │
│                 │ env vars        │ env vars                    │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

### Deployment Triggers

| Branch    | Target Project        | Trigger       |
| --------- | --------------------- | ------------- |
| `main`    | `promptagent`         | Push / Manual |
| `staging` | `promptagent-staging` | Push / Manual |

### Environment Detection (Fail-Fast)

Production environments are detected via `DENO_DEPLOYMENT_ID` (automatically set
by Deno Deploy). On detection, the app validates configuration and fails
immediately on startup if misconfigured:

```typescript
const isDeployed = !!Deno.env.get("DENO_DEPLOYMENT_ID");

if (isDeployed) {
  if (!Deno.env.get("LLM_BASE_URL") && !Deno.env.get("LLM_API_BASE_URL")) {
    throw new Error("LLM_BASE_URL is required in production");
  }
  if (LLM_BASE_URL.includes("localhost")) {
    throw new Error("LLM_BASE_URL cannot be localhost in production");
  }
  if (!LLM_API_KEY) {
    throw new Error("LLM_API_KEY is required in production");
  }
}
```

**Rationale:** Fail-fast on deploy prevents silent failures on user requests.
Errors surface immediately in deploy logs, not 3am user complaints.

### Environment Variables

| Variable           | Local Default         | Production Required |
| ------------------ | --------------------- | ------------------- |
| `LLM_BASE_URL`     | `localhost:1234/v1`   | Yes                 |
| `LLM_API_BASE_URL` | (legacy alias)        | Supported           |
| `LLM_API_KEY`      | `""`                  | Yes                 |
| `LLM_MODEL`        | `openai/gpt-oss-120b` | Recommended         |

**Backwards Compatibility:** Both `LLM_BASE_URL` and `LLM_API_BASE_URL` are
supported via nullish coalescing:

```typescript
const LLM_BASE_URL = Deno.env.get("LLM_BASE_URL") ??
  Deno.env.get("LLM_API_BASE_URL") ??
  "http://localhost:1234/v1";
```

## Alternatives Considered

### 1. Build-Time Configuration

**Approach:** Inject env vars at build time via a static UI bundler.

**Rejected because:**

- Requires separate builds per environment
- Secrets potentially embedded in artifacts
- More complex CI/CD pipeline

### 2. Single Project with Feature Flags

**Approach:** One Deno Deploy project, use feature flags for staging features.

**Rejected because:**

- No isolation between staging and production
- Staging bugs affect production users
- Harder to test deployment process itself

### 3. Docker/Kubernetes

**Approach:** Containerized deployment with K8s.

**Rejected because:**

- Overkill for current scale
- Higher operational complexity
- Deno Deploy provides simpler edge deployment

### 4. Branch-Based Env Vars (Deno Deploy native)

**Approach:** Use Deno Deploy's branch deployments with different env vars per
branch.

**Considered viable but:**

- Less explicit control over which branches deploy where
- Current approach with separate projects is clearer

## Consequences

### Positive

- **Clear separation:** Staging and production are completely isolated
- **Safe defaults:** localhost fallback only works locally, fails in production
- **Simple workflow:** Push to branch → auto-deploy
- **Test coverage:** `tests/deploy/deploy-config.test.ts` catches localhost fallback issues
- **Backwards compatible:** Legacy env var names still work

### Negative

- **Two Deno Deploy projects** to manage (but they're free tier)
- **Env vars set in two places** (GitHub vars + Deno Deploy settings)
- **Staging branch** needs to be created and maintained

### Risks

| Risk                                      | Mitigation                                               |
| ----------------------------------------- | -------------------------------------------------------- |
| Forgetting to set env vars in new project | Deploy fails fast with clear error message               |
| Env var naming drift                      | Tests verify both names are supported                    |
| Staging getting stale                     | Workflow supports `workflow_dispatch` for manual deploys |

## Setup Checklist

### GitHub Repository Settings

1. **Secrets** (Settings → Secrets and variables → Actions → Secrets):
   - `DENO_DEPLOY_TOKEN` - Deno Deploy access token

2. **Variables** (Settings → Secrets and variables → Actions → Variables):
   - `DENO_DEPLOY_PROJECT` = `promptagent`
   - `DENO_DEPLOY_PROJECT_STAGING` = `promptagent-staging`

### Deno Deploy Projects

For each project (`promptagent` and `promptagent-staging`):

1. Go to project → Settings → Environment Variables
2. Add:
   - `LLM_BASE_URL` = `https://openrouter.ai/api/v1` (or your provider)
   - `LLM_API_KEY` = your API key
   - `LLM_MODEL` = `google/gemini-2.0-flash-001` (or your model)

### Create Staging Branch

```bash
git checkout main
git checkout -b staging
git push -u origin staging
```

## Related

- `.github/workflows/deploy-deno.yml` - Production workflow
- `.github/workflows/deploy-staging.yml` - Staging workflow
- `deploy/main.ts` - Server entry point with production env validation
- `tests/deploy/deploy-config.test.ts` - Configuration tests
- `.env.example` - Environment variable documentation
