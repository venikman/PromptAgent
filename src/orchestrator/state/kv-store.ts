// deno-lint-ignore-file require-await
/**
 * In-memory State Store
 *
 * Simple, non-persistent storage for tasks and session checkpoints.
 * This replaces the Deno KV-backed store to avoid runtime dependencies.
 */

import type { OptimizationState } from "../types.ts";

import type { OptimizationTask } from "../optimization-progress.ts";

// ─────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────

export type TaskType =
  | "evaluation"
  | "optimization"
  | "tournament"
  | "playground";
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

export interface SessionCheckpoint {
  id: string;
  sessionId: string;
  state: OptimizationState;
  createdAt: string;
}

// ─────────────────────────────────────────────────
// In-memory state
// ─────────────────────────────────────────────────

const tasks = new Map<string, TaskRecord>();
const tasksByStatus = new Map<TaskStatus, Set<string>>();
const optimizationTasks = new Map<string, OptimizationTask>();
const checkpoints = new Map<string, SessionCheckpoint>();
const checkpointsBySession = new Map<string, Set<string>>();

const ensureStatusSet = (status: TaskStatus) => {
  const existing = tasksByStatus.get(status);
  if (existing) return existing;
  const created = new Set<string>();
  tasksByStatus.set(status, created);
  return created;
};

const ensureSessionSet = (sessionId: string) => {
  const existing = checkpointsBySession.get(sessionId);
  if (existing) return existing;
  const created = new Set<string>();
  checkpointsBySession.set(sessionId, created);
  return created;
};

const indexTask = (task: TaskRecord) => {
  ensureStatusSet(task.status).add(task.id);
};

const deindexTask = (task: TaskRecord) => {
  const set = tasksByStatus.get(task.status);
  if (!set) return;
  set.delete(task.id);
  if (set.size === 0) {
    tasksByStatus.delete(task.status);
  }
};

// ─────────────────────────────────────────────────
// Task Management
// ─────────────────────────────────────────────────

export async function saveTask(task: TaskRecord): Promise<void> {
  const existing = tasks.get(task.id);
  if (existing) {
    deindexTask(existing);
  }
  tasks.set(task.id, task);
  indexTask(task);
}

export async function getTask(taskId: string): Promise<TaskRecord | null> {
  const task = tasks.get(taskId);
  return task ? { ...task } : null;
}

export async function updateTaskProgress(
  taskId: string,
  progress: { completed: number; total: number },
): Promise<void> {
  const task = tasks.get(taskId);
  if (!task) return;
  task.progress = progress;
  tasks.set(taskId, task);
}

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  options?: { result?: unknown; error?: string },
): Promise<void> {
  const task = tasks.get(taskId);
  if (!task) return;

  const oldStatus = task.status;
  if (oldStatus !== status) {
    deindexTask(task);
    task.status = status;
  }

  if (options?.result !== undefined) {
    task.result = options.result;
  }
  if (options?.error !== undefined) {
    task.error = options.error;
  }
  if (status === "completed" || status === "failed") {
    task.completedAt = new Date().toISOString();
  }

  tasks.set(taskId, task);
  indexTask(task);
}

export async function completeTask(
  taskId: string,
  result: unknown,
): Promise<void> {
  await updateTaskStatus(taskId, "completed", { result });
}

export async function failTask(taskId: string, error: string): Promise<void> {
  await updateTaskStatus(taskId, "failed", { error });
}

export async function listTasksByStatus(
  status: TaskStatus,
): Promise<TaskRecord[]> {
  const ids = tasksByStatus.get(status);
  if (!ids) return [];
  return Array.from(ids)
    .map((id) => tasks.get(id))
    .filter((task): task is TaskRecord => Boolean(task));
}

export async function createTask(
  type: TaskType,
  options?: { totalProgress?: number },
): Promise<TaskRecord> {
  const task: TaskRecord = {
    id: crypto.randomUUID(),
    type,
    status: "pending",
    progress: { completed: 0, total: options?.totalProgress ?? 0 },
    startedAt: new Date().toISOString(),
  };
  await saveTask(task);
  return task;
}

export async function saveOptimizationTask(
  task: OptimizationTask,
): Promise<void> {
  optimizationTasks.set(task.id, task);
}

export async function getOptimizationTask(
  taskId: string,
): Promise<OptimizationTask | null> {
  const task = optimizationTasks.get(taskId);
  return task ? { ...task } : null;
}

// ─────────────────────────────────────────────────
// Checkpoint Management
// ─────────────────────────────────────────────────

export async function saveCheckpoint(
  sessionId: string,
  state: OptimizationState,
): Promise<string> {
  const checkpointId = crypto.randomUUID();
  const checkpoint: SessionCheckpoint = {
    id: checkpointId,
    sessionId,
    state,
    createdAt: new Date().toISOString(),
  };

  checkpoints.set(checkpointId, checkpoint);
  ensureSessionSet(sessionId).add(checkpointId);

  return checkpointId;
}

export async function getCheckpoint(
  checkpointId: string,
): Promise<SessionCheckpoint | null> {
  const cp = checkpoints.get(checkpointId);
  return cp ? { ...cp } : null;
}

export async function getLatestCheckpoint(
  sessionId: string,
): Promise<SessionCheckpoint | null> {
  const ids = checkpointsBySession.get(sessionId);
  if (!ids || ids.size === 0) return null;

  const list = Array.from(ids)
    .map((id) => checkpoints.get(id))
    .filter((checkpoint): checkpoint is SessionCheckpoint =>
      Boolean(checkpoint)
    );

  if (list.length === 0) return null;

  list.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const latest = list[0];
  return latest ? { ...latest } : null;
}

export async function listCheckpoints(
  sessionId: string,
): Promise<SessionCheckpoint[]> {
  const ids = checkpointsBySession.get(sessionId);
  if (!ids || ids.size === 0) return [];

  const list = Array.from(ids)
    .map((id) => checkpoints.get(id))
    .filter((checkpoint): checkpoint is SessionCheckpoint =>
      Boolean(checkpoint)
    );

  list.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return list;
}

// ─────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────

export async function cleanupOldTasks(olderThanMs: number): Promise<number> {
  const cutoff = Date.now() - olderThanMs;
  let deleted = 0;

  for (const [taskId, task] of tasks.entries()) {
    if (
      task.completedAt &&
      new Date(task.completedAt).getTime() < cutoff
    ) {
      tasks.delete(taskId);
      deindexTask(task);
      deleted++;
    }
  }

  return deleted;
}

export async function cleanupOldCheckpoints(
  keepPerSession: number,
): Promise<number> {
  let deleted = 0;

  for (const [sessionId, ids] of checkpointsBySession.entries()) {
    const list = Array.from(ids)
      .map((id) => checkpoints.get(id))
      .filter((checkpoint): checkpoint is SessionCheckpoint =>
        Boolean(checkpoint)
      )
      .sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

    if (list.length <= keepPerSession) continue;

    for (const checkpoint of list.slice(keepPerSession)) {
      checkpoints.delete(checkpoint.id);
      ids.delete(checkpoint.id);
      deleted++;
    }

    if (ids.size === 0) {
      checkpointsBySession.delete(sessionId);
    }
  }

  return deleted;
}

// ─────────────────────────────────────────────────
// Export kvStore object for compatibility
// ─────────────────────────────────────────────────

export const kvStore = {
  saveTask,
  getTask,
  updateTaskProgress,
  updateTaskStatus,
  completeTask,
  failTask,
  listTasksByStatus,
  createTask,
  saveOptimizationTask,
  getOptimizationTask,

  saveCheckpoint,
  getCheckpoint,
  getLatestCheckpoint,
  listCheckpoints,

  cleanupOldTasks,
  cleanupOldCheckpoints,
};
