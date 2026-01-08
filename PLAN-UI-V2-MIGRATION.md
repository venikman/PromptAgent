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

// Centralized error handling for all API calls
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
    return handleResponse<{ story: string; scorerResult?: unknown }>(res);
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
  getTask: async (taskId: string) => {
    const res = await fetch(`${API_BASE}/v2/tasks/${taskId}`);
    return handleResponse<TaskRecord>(res);
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

  // List tasks (for task recovery)
  listTasks: async (filter?: { status?: string }) => {
    const params = new URLSearchParams();
    if (filter?.status) params.set("status", filter.status);
    const res = await fetch(`${API_BASE}/v2/tasks?${params}`);
    return handleResponse<{ tasks: TaskRecord[] }>(res);
  },

  // Keep v1 for pair mining and patch generation (pure computation)
  minePairs: async (report: unknown) => {
    const res = await fetch(`${API_BASE}/mine-pairs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report }),
    });
    return handleResponse<{ pairs: unknown[] }>(res);
  },

  generatePatches: async (pairs: unknown[], count: number) => {
    const res = await fetch(`${API_BASE}/generate-patches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairs, count }),
    });
    return handleResponse<{ patches: unknown[] }>(res);
  },
};
```

### Phase 2: Update Playground Component

**File:** `ui/src/components/playground/Playground.tsx`

Changes:
- Import and use centralized `api` client
- Remove direct fetch calls
- Error handling is now centralized

```diff
+ import { api } from "@/lib/api";

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
-     const res = await fetch("/generate-story", {
-       method: "POST",
-       headers: { "Content-Type": "application/json" },
-       body: JSON.stringify({ epicId: selectedEpic.id, promptOverride }),
-     });
-     if (!res.ok) throw new Error("Generation failed");
-     const data = await res.json();
+     const data = await api.playground(selectedEpic.id, promptOverride);
      setResult(data.story);
      setScorerResult(data.scorerResult);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
```

### Phase 3: Update EvalDashboard Component

**File:** `ui/src/components/evaluation/EvalDashboard.tsx`

Changes:
- Import and use centralized `api` client
- Use `api.startEvaluation()` and `api.getTask()` for polling
- Update response parsing for unified task format

```diff
+ import { api } from "@/lib/api";

  const handleEvaluate = async () => {
    setLoading(true);
    setError(null);
    try {
-     const res = await fetch("/evaluate", {
-       method: "POST",
-       headers: { "Content-Type": "application/json" },
-       body: JSON.stringify({ replicates, promptOverride }),
-     });
-     const { taskId } = await res.json();
+     const { taskId } = await api.startEvaluation(replicates, promptOverride);

      // Poll for completion
      while (true) {
-       const statusRes = await fetch(`/evaluate/${taskId}`);
-       const data = await statusRes.json();
+       const task = await api.getTask(taskId);
-       if (data.status === "completed") {
-         setReport(data.report);
+       if (task.status === "completed") {
+         setReport(task.result);
          break;
        }
-       if (data.status === "failed") {
-         throw new Error(data.error);
+       if (task.status === "failed") {
+         throw new Error(task.error);
        }
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
```

### Phase 4: Update EvolutionLab Component

**File:** `ui/src/components/evolution/EvolutionLab.tsx`

Changes:
- Import and use centralized `api` client
- Keep `/mine-pairs` and `/generate-patches` via `api.minePairs()` and `api.generatePatches()`
- Add `/v2/optimize` for full automation with **robust polling**

```typescript
import { api } from "@/lib/api";

// New: One-click optimization with robust polling
const handleAutoOptimize = async () => {
  setLoading(true);
  setError(null);

  try {
    const { taskId } = await api.startOptimization({
      maxIterations: 3,
      replicates: 3,
      patchCandidates: 3,
    });

    // Robust polling with timeout and exponential backoff
    const MAX_ATTEMPTS = 60;
    const BASE_DELAY_MS = 2000;
    const MAX_DELAY_MS = 30000;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
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
      } catch (pollError) {
        // Log but continue polling on transient network errors
        console.warn(`Polling attempt ${attempt + 1} failed:`, pollError);
      }

      // Exponential backoff: 2s, 4s, 8s, ... capped at 30s
      const delayMs = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
      await new Promise(r => setTimeout(r, delayMs));
    }

    // If we exhausted all attempts
    setError("Optimization timed out after 60 attempts");
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};
```

### Phase 5: Add Task Recovery UI

**File:** `ui/src/types/index.ts` - Add TaskRecord type:

```typescript
export interface TaskRecord {
  id: string;
  type: "evaluation" | "optimization";
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
  updatedAt?: string;
  result?: unknown;
  error?: string;
}
```

**New Component:** `ui/src/components/TaskRecovery.tsx`

Show pending/running tasks from previous sessions:

```typescript
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { TaskRecord } from "@/types";

interface TaskCardProps {
  task: TaskRecord;
  onResume: (taskId: string) => Promise<void>;
}

function TaskCard({ task, onResume }: TaskCardProps) {
  return (
    <div className="border rounded p-4 mb-2">
      <div className="flex justify-between items-center">
        <div>
          <span className="font-medium">{task.type}</span>
          <span className="text-sm text-gray-500 ml-2">
            {new Date(task.createdAt).toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge badge-${task.status}`}>{task.status}</span>
          {task.status === "running" && (
            <button
              onClick={() => onResume(task.id)}
              className="btn btn-sm btn-primary"
            >
              Resume
            </button>
          )}
        </div>
      </div>
      {task.error && (
        <div className="text-red-500 text-sm mt-2">{task.error}</div>
      )}
    </div>
  );
}

export function TaskRecovery() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const { tasks } = await api.listTasks({ status: "running" });
        setTasks(tasks);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, []);

  const handleResume = async (taskId: string) => {
    // Navigate to appropriate component based on task type
    // or emit event for parent to handle
  };

  if (loading) return <div>Loading tasks...</div>;
  if (error) return <div className="text-red-500">{error}</div>;
  if (tasks.length === 0) return null;

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
      <h3 className="font-medium mb-2">Pending Tasks</h3>
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
| `ui/src/lib/api.ts` | Create centralized API client with error handling |
| `ui/src/types/index.ts` | Add `TaskRecord` interface |
| `ui/src/components/playground/Playground.tsx` | Use `api.playground()` |
| `ui/src/components/evaluation/EvalDashboard.tsx` | Use `api.startEvaluation()` + `api.getTask()` |
| `ui/src/components/evolution/EvolutionLab.tsx` | Use `api.startOptimization()` with robust polling |
| `ui/src/components/TaskRecovery.tsx` | New component for task recovery UI |

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
