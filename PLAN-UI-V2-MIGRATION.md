# Plan: Migrate UI to V2 API Endpoints

## Goal

Migrate the PromptAgent UI from v1 endpoints (in-memory) to v2 endpoints (Deno KV persistence) for improved reliability and state management.

---

## Current State

### V1 Endpoints (UI currently uses)

| Endpoint | Storage | Issues |
|----------|---------|--------|
| `POST /evaluate` | In-memory Map | Lost on restart |
| `GET /evaluate/:id` | In-memory Map | No recovery |
| `POST /run-tournament` | In-memory Map | Lost on restart |
| `GET /tournament/:id` | In-memory Map | No recovery |

### V2 Endpoints (New, with Deno KV)

| Endpoint | Storage | Benefits |
|----------|---------|----------|
| `POST /v2/playground` | Orchestrator | Unified generation + scoring |
| `POST /v2/evaluate` | Deno KV | Persistent, recoverable |
| `GET /v2/tasks/:id` | Deno KV | Universal task polling |
| `POST /v2/optimize` | Deno KV | Full optimization loop |

---

## Migration Plan

### Phase 1: Update API Client

**File:** `ui/src/lib/api.ts` (create if needed)

```typescript
const API_BASE = "";

export const api = {
  // V2 Playground (replaces /generate-story)
  playground: async (epicId: string, promptOverride?: string) => {
    const res = await fetch(`${API_BASE}/v2/playground`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epicId, promptOverride }),
    });
    return res.json();
  },

  // V2 Evaluate (replaces /evaluate)
  startEvaluation: async (replicates: number, promptOverride?: string) => {
    const res = await fetch(`${API_BASE}/v2/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replicates, promptOverride }),
    });
    return res.json(); // { taskId, status }
  },

  // V2 Task polling (replaces /evaluate/:id and /tournament/:id)
  getTask: async (taskId: string) => {
    const res = await fetch(`${API_BASE}/v2/tasks/${taskId}`);
    return res.json();
  },

  // V2 Optimize (new)
  startOptimization: async (config: {
    maxIterations?: number;
    replicates?: number;
    patchCandidates?: number;
  }) => {
    const res = await fetch(`${API_BASE}/v2/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    return res.json(); // { taskId, status }
  },

  // Keep v1 for pair mining and patch generation (pure computation)
  minePairs: async (report: unknown) => {
    const res = await fetch(`${API_BASE}/mine-pairs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report }),
    });
    return res.json();
  },

  generatePatches: async (pairs: unknown[], count: number) => {
    const res = await fetch(`${API_BASE}/generate-patches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairs, count }),
    });
    return res.json();
  },
};
```

### Phase 2: Update Playground Component

**File:** `ui/src/components/playground/Playground.tsx`

Changes:
- Replace `/generate-story` with `/v2/playground`
- Response format is already compatible

```diff
- const res = await fetch("/generate-story", {
+ const res = await fetch("/v2/playground", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ epicId, promptOverride }),
  });
```

### Phase 3: Update EvalDashboard Component

**File:** `ui/src/components/evaluation/EvalDashboard.tsx`

Changes:
- Replace `/evaluate` with `/v2/evaluate`
- Replace `/evaluate/:id` polling with `/v2/tasks/:id`
- Update response parsing for unified task format

```diff
  // Start evaluation
- const res = await fetch("/evaluate", { ... });
+ const res = await fetch("/v2/evaluate", { ... });

  // Poll status
- const statusRes = await fetch(`/evaluate/${taskId}`);
+ const statusRes = await fetch(`/v2/tasks/${taskId}`);
  const data = await statusRes.json();
- const report = data.report;
+ const report = data.result; // V2 uses 'result' field
```

### Phase 4: Update EvolutionLab Component

**File:** `ui/src/components/evolution/EvolutionLab.tsx`

Changes:
- Keep `/mine-pairs` and `/generate-patches` (pure computation, no state)
- Option: Add `/v2/optimize` for full automation

```typescript
// New: One-click optimization
const handleAutoOptimize = async () => {
  const { taskId } = await api.startOptimization({
    maxIterations: 3,
    replicates: 3,
    patchCandidates: 3,
  });

  // Poll until complete
  while (true) {
    const task = await api.getTask(taskId);
    if (task.status === "completed") {
      setOptimizationResult(task.result);
      break;
    }
    if (task.status === "failed") {
      setError(task.error);
      break;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
};
```

### Phase 5: Add Task Recovery UI

**New Component:** `ui/src/components/TaskRecovery.tsx`

Show pending/running tasks from previous sessions:

```typescript
export function TaskRecovery() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);

  useEffect(() => {
    // Could add endpoint to list recent tasks
    // GET /v2/tasks?status=running
  }, []);

  return (
    <div>
      {tasks.map(task => (
        <TaskCard key={task.id} task={task} onResume={...} />
      ))}
    </div>
  );
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `ui/src/lib/api.ts` | Create centralized API client |
| `ui/src/components/playground/Playground.tsx` | Use `/v2/playground` |
| `ui/src/components/evaluation/EvalDashboard.tsx` | Use `/v2/evaluate` + `/v2/tasks/:id` |
| `ui/src/components/evolution/EvolutionLab.tsx` | Add `/v2/optimize` option |
| `ui/src/types/index.ts` | Add `TaskRecord` type |

---

## Testing Checklist

- [ ] Playground generates stories via v2 endpoint
- [ ] Evaluation polls v2 task endpoint correctly
- [ ] Evolution can trigger full optimization via v2
- [ ] Tasks survive page refresh (check Deno KV)
- [ ] Error handling works for all v2 endpoints
- [ ] Demo mode still works (no backend calls)

---

## Rollback Plan

Keep v1 endpoints available. If issues arise:
1. Revert UI changes
2. V1 endpoints remain functional
3. Debug v2 separately

---

## Success Criteria

1. All three UI flows work with v2 endpoints
2. Tasks persist across page refreshes
3. No regressions in existing functionality
4. Demo mode unaffected
