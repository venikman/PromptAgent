# Plan: Migrate UI to V2 API Endpoints

## Goal

Migrate the PromptAgent UI from v1 endpoints (in-memory) to v2 endpoints (Deno KV persistence) for improved reliability and state management.

---

## Current State

### V1 Endpoints (UI currently uses)

| Endpoint | Storage | Issues |
|----------|---------|--------|
| `POST /evaluate` | In-memory Map | Tasks are lost on restart |
| `GET /evaluate/:id` | In-memory Map | No task recovery mechanism |
| `POST /run-tournament` | In-memory Map | Tasks are lost on restart |
| `GET /tournament/:id` | In-memory Map | No task recovery mechanism |

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
import type { PromptDistReport, ContrastPair, TaskRecord } from "../types";

const API_BASE = "";

// Helper function for consistent error handling
async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: `HTTP Error: ${res.status}` }));
    throw new Error(errorBody.error || `HTTP Error: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // V2 Playground (replaces /generate-story)
  playground: async (epicId: string, promptOverride?: string) => {
    const res = await fetch(`${API_BASE}/v2/playground`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epicId, promptOverride }),
    });
    return handleResponse(res);
  },

  // V2 Evaluate (replaces /evaluate)
  startEvaluation: async (replicates: number, promptOverride?: string) => {
    const res = await fetch(`${API_BASE}/v2/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replicates, promptOverride }),
    });
    return handleResponse<{ taskId: string; status: string }>(res);
  },

  // V2 Task polling (replaces /evaluate/:id and /tournament/:id)
  getTask: async (taskId: string): Promise<TaskRecord> => {
    const res = await fetch(`${API_BASE}/v2/tasks/${taskId}`);
    return handleResponse<TaskRecord>(res);
  },

  // V2 List tasks (for task recovery)
  // NOTE: Backend does not yet expose a task-listing endpoint.
  // To support recovery, first add an endpoint such as GET /v2/tasks?status=running
  listTasks: async (filter?: { status?: string }): Promise<{ tasks: TaskRecord[] }> => {
    const params = new URLSearchParams();
    if (filter?.status) params.set("status", filter.status);
    const res = await fetch(`${API_BASE}/v2/tasks?${params}`);
    return handleResponse<{ tasks: TaskRecord[] }>(res);
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
    return handleResponse<{ taskId: string; status: string }>(res);
  },

  // Keep v1 for pair mining and patch generation (pure computation)
  minePairs: async (report: PromptDistReport) => {
    const res = await fetch(`${API_BASE}/mine-pairs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report }),
    });
    return handleResponse(res);
  },

  generatePatches: async (pairs: ContrastPair[], count: number) => {
    const res = await fetch(`${API_BASE}/generate-patches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairs, count }),
    });
    return handleResponse(res);
  },
};
```

### Phase 2: Update Playground Component

**File:** `ui/src/components/playground/Playground.tsx`

Changes:
- Replace the legacy `/generate-story` call with the v2 `/v2/playground` endpoint
- Use the shared `api` client from Phase 1 instead of calling `fetch` directly
- Response format is already compatible

```diff
+import { api } from "../../lib/api";
+
 // Replace direct fetch with api client
- const res = await fetch("/generate-story", {
-   method: "POST",
-   headers: { "Content-Type": "application/json" },
-   body: JSON.stringify({ epicId, promptOverride }),
- });
- // ... existing error handling and data parsing
+ const data = await api.playground(selectedEpic.id, promptOverride);
+ setResult(data.result || null);
+ setScorerResult(data.scorerResult || null);
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
// New: One-click optimization with robust polling
const handleAutoOptimize = async () => {
  try {
    const { taskId } = await api.startOptimization({
      maxIterations: 3,
      replicates: 3,
      patchCandidates: 3,
    });

    // Poll with bounded retries at fixed 2s intervals
    // Max ~1 minute: 30 attempts × 2s delay
    const MAX_ATTEMPTS = 30;
    const POLL_INTERVAL_MS = 2000;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

      try {
        const task = await api.getTask(taskId);
        if (task.status === "completed") {
          setOptimizationResult(task.result);
          return;
        }
        if (task.status === "failed") {
          setError(task.error || "Optimization failed");
          return;
        }
      } catch (pollErr) {
        // Handle fetch errors during polling
        const message = pollErr instanceof Error ? pollErr.message : "Polling failed";
        setError(`Polling failed: ${message}`);
        return;
      }
    }

    // Timeout reached
    setError("Optimization is taking longer than expected. Please try again later.");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start optimization";
    setError(message);
  }
};
```

### Phase 5: Add Task Recovery UI

**New Component:** `ui/src/components/TaskRecovery.tsx`

Show pending/running tasks from previous sessions:

```typescript
import { useState, useEffect } from "react";
import { api } from "../lib/api";
import type { TaskRecord } from "../types";

interface TaskCardProps {
  task: TaskRecord;
  onResume: (taskId: string) => Promise<void>;
}

function TaskCard({ task, onResume }: TaskCardProps) {
  return (
    <div className="task-card">
      <span>{task.type} - {task.status}</span>
      <span>Started: {new Date(task.startedAt).toLocaleString()}</span>
      <button onClick={() => onResume(task.id)}>Resume</button>
    </div>
  );
}

export function TaskRecovery() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // NOTE: Backend does not yet expose a task-listing endpoint.
    // To support recovery, first implement GET /v2/tasks?status=running on the backend.
    api.listTasks({ status: "running" })
      .then(res => setTasks(res.tasks))
      .catch(err => {
        console.error("Failed to load tasks:", err);
        setError(err instanceof Error ? err.message : "Failed to load tasks");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleResume = async (taskId: string) => {
    // Navigate to appropriate component based on task type
    // or start polling for this task's status
    console.log("Resuming task:", taskId);
  };

  if (loading) return <div>Loading tasks...</div>;
  if (error) return <div>Error: {error}</div>;
  if (tasks.length === 0) return null;

  return (
    <div className="task-recovery">
      <h3>Pending Tasks</h3>
      {tasks.map(task => (
        <TaskCard key={task.id} task={task} onResume={handleResume} />
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

### TaskRecord Type Definition

Add the following type to `ui/src/types/index.ts`:

```typescript
// Task types for v2 API
export type TaskType = "evaluation" | "optimization" | "tournament" | "playground";
export type TaskStatus = "pending" | "running" | "completed" | "failed";

export interface TaskRecord {
  id: string;
  type: TaskType;
  status: TaskStatus;
  progress: { completed: number; total: number };
  result?: unknown;
  error?: string;
  startedAt: string;
  completedAt?: string;
}
```

---

## Testing Checklist

- [ ] Playground generates stories via v2 endpoint
- [ ] Evaluation polls v2 task endpoint correctly
- [ ] Evolution can trigger full optimization via v2
- [ ] Tasks survive page refresh: start a task, note its `taskId`, refresh the page, and verify you can still query its status via `GET /v2/tasks/:id`
- [ ] Error handling works for all v2 endpoints (test with invalid inputs, network errors)
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
