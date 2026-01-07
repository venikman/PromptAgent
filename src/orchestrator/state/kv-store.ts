/**
 * Deno KV State Store
 *
 * Persistent storage for tasks and session checkpoints.
 * Replaces in-memory Maps for production reliability.
 *
 * Key schema:
 * - ["tasks", taskId] → TaskRecord
 * - ["tasks:by-status", status, taskId] → taskId (index)
 * - ["checkpoints", checkpointId] → SessionCheckpoint
 * - ["checkpoints:by-session", sessionId, checkpointId] → checkpointId (index)
 */

import type { OptimizationState } from "../types.ts";

// ─────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────

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

export interface SessionCheckpoint {
  id: string;
  sessionId: string;
  state: OptimizationState;
  createdAt: string;
}

// ─────────────────────────────────────────────────
// KV Store Singleton
// ─────────────────────────────────────────────────

let _kv: Deno.Kv | null = null;

/**
 * Get or create the KV store instance.
 * Uses lazy initialization to avoid top-level await issues.
 */
async function getKv(): Promise<Deno.Kv> {
  if (!_kv) {
    _kv = await Deno.openKv();
  }
  return _kv;
}

// ─────────────────────────────────────────────────
// Task Management
// ─────────────────────────────────────────────────

/**
 * Save a task to the store.
 */
export async function saveTask(task: TaskRecord): Promise<void> {
  const kv = await getKv();
  await kv.atomic()
    .set(["tasks", task.id], task)
    .set(["tasks:by-status", task.status, task.id], task.id)
    .commit();
}

/**
 * Get a task by ID.
 */
export async function getTask(taskId: string): Promise<TaskRecord | null> {
  const kv = await getKv();
  const result = await kv.get<TaskRecord>(["tasks", taskId]);
  return result.value;
}

/**
 * Update task progress (optimized for frequent updates).
 */
export async function updateTaskProgress(
  taskId: string,
  progress: { completed: number; total: number }
): Promise<void> {
  const kv = await getKv();
  const task = await getTask(taskId);
  if (task) {
    task.progress = progress;
    await kv.set(["tasks", taskId], task);
  }
}

/**
 * Update task status with optional result.
 */
export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  options?: { result?: unknown; error?: string }
): Promise<void> {
  const kv = await getKv();
  const task = await getTask(taskId);
  if (!task) return;

  const oldStatus = task.status;
  task.status = status;

  if (options?.result !== undefined) {
    task.result = options.result;
  }
  if (options?.error !== undefined) {
    task.error = options.error;
  }
  if (status === "completed" || status === "failed") {
    task.completedAt = new Date().toISOString();
  }

  // Atomic update: remove from old index, add to new index
  await kv.atomic()
    .delete(["tasks:by-status", oldStatus, taskId])
    .set(["tasks", taskId], task)
    .set(["tasks:by-status", status, taskId], taskId)
    .commit();
}

/**
 * Complete a task with result.
 */
export async function completeTask(taskId: string, result: unknown): Promise<void> {
  await updateTaskStatus(taskId, "completed", { result });
}

/**
 * Fail a task with error.
 */
export async function failTask(taskId: string, error: string): Promise<void> {
  await updateTaskStatus(taskId, "failed", { error });
}

/**
 * List tasks by status.
 */
export async function listTasksByStatus(status: TaskStatus): Promise<TaskRecord[]> {
  const kv = await getKv();
  const tasks: TaskRecord[] = [];

  const entries = kv.list<string>({ prefix: ["tasks:by-status", status] });
  for await (const entry of entries) {
    const task = await getTask(entry.value);
    if (task) tasks.push(task);
  }

  return tasks;
}

/**
 * Create a new task.
 */
export async function createTask(
  type: TaskType,
  options?: { totalProgress?: number }
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

// ─────────────────────────────────────────────────
// Checkpoint Management
// ─────────────────────────────────────────────────

/**
 * Save a checkpoint for recovery.
 */
export async function saveCheckpoint(
  sessionId: string,
  state: OptimizationState
): Promise<string> {
  const kv = await getKv();
  const checkpointId = crypto.randomUUID();
  const checkpoint: SessionCheckpoint = {
    id: checkpointId,
    sessionId,
    state,
    createdAt: new Date().toISOString(),
  };

  await kv.atomic()
    .set(["checkpoints", checkpointId], checkpoint)
    .set(["checkpoints:by-session", sessionId, checkpointId], checkpointId)
    .commit();

  return checkpointId;
}

/**
 * Get a checkpoint by ID.
 */
export async function getCheckpoint(checkpointId: string): Promise<SessionCheckpoint | null> {
  const kv = await getKv();
  const result = await kv.get<SessionCheckpoint>(["checkpoints", checkpointId]);
  return result.value;
}

/**
 * Get the latest checkpoint for a session.
 */
export async function getLatestCheckpoint(sessionId: string): Promise<SessionCheckpoint | null> {
  const kv = await getKv();
  const entries = kv.list<string>({
    prefix: ["checkpoints:by-session", sessionId],
  });

  // Collect all checkpoint IDs and get the latest by timestamp
  const checkpointIds: string[] = [];
  for await (const entry of entries) {
    checkpointIds.push(entry.value);
  }

  if (checkpointIds.length === 0) return null;

  // Get all checkpoints and find the newest
  const checkpoints: SessionCheckpoint[] = [];
  for (const id of checkpointIds) {
    const cp = await getCheckpoint(id);
    if (cp) checkpoints.push(cp);
  }

  if (checkpoints.length === 0) return null;

  // Sort by creation time (newest first)
  checkpoints.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return checkpoints[0] ?? null;
}

/**
 * List all checkpoints for a session (newest first).
 */
export async function listCheckpoints(sessionId: string): Promise<SessionCheckpoint[]> {
  const kv = await getKv();
  const checkpoints: SessionCheckpoint[] = [];

  const entries = kv.list<string>({
    prefix: ["checkpoints:by-session", sessionId],
  });

  for await (const entry of entries) {
    const checkpoint = await getCheckpoint(entry.value);
    if (checkpoint) checkpoints.push(checkpoint);
  }

  // Sort by creation time (newest first)
  checkpoints.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return checkpoints;
}

// ─────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────

/**
 * Clean up old completed/failed tasks.
 * @param olderThanMs Delete tasks older than this many milliseconds
 * @returns Number of tasks deleted
 */
export async function cleanupOldTasks(olderThanMs: number): Promise<number> {
  const kv = await getKv();
  const cutoff = Date.now() - olderThanMs;
  let deleted = 0;

  for await (const entry of kv.list<TaskRecord>({ prefix: ["tasks"] })) {
    const task = entry.value;
    if (
      task.completedAt &&
      new Date(task.completedAt).getTime() < cutoff
    ) {
      await kv.atomic()
        .delete(["tasks", task.id])
        .delete(["tasks:by-status", task.status, task.id])
        .commit();
      deleted++;
    }
  }

  return deleted;
}

/**
 * Clean up old checkpoints, keeping only the N most recent per session.
 * @param keepPerSession Number of checkpoints to keep per session
 * @returns Number of checkpoints deleted
 */
export async function cleanupOldCheckpoints(keepPerSession: number): Promise<number> {
  const kv = await getKv();
  let deleted = 0;

  // Group checkpoints by session
  const sessions = new Map<string, string[]>();
  for await (const entry of kv.list<SessionCheckpoint>({ prefix: ["checkpoints"] })) {
    if (entry.key.length === 2 && entry.key[0] === "checkpoints") {
      const checkpoint = entry.value;
      const existing = sessions.get(checkpoint.sessionId) ?? [];
      existing.push(checkpoint.id);
      sessions.set(checkpoint.sessionId, existing);
    }
  }

  // Delete old checkpoints for each session
  for (const [sessionId, checkpointIds] of sessions) {
    if (checkpointIds.length > keepPerSession) {
      // Get all checkpoints with timestamps
      const checkpoints: SessionCheckpoint[] = [];
      for (const id of checkpointIds) {
        const cp = await getCheckpoint(id);
        if (cp) checkpoints.push(cp);
      }

      // Sort by creation time (newest first)
      checkpoints.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Delete all but the newest N
      for (const cp of checkpoints.slice(keepPerSession)) {
        await kv.atomic()
          .delete(["checkpoints", cp.id])
          .delete(["checkpoints:by-session", sessionId, cp.id])
          .commit();
        deleted++;
      }
    }
  }

  return deleted;
}

// ─────────────────────────────────────────────────
// Export kvStore object for compatibility
// ─────────────────────────────────────────────────

export const kvStore = {
  // Task management
  saveTask,
  getTask,
  updateTaskProgress,
  updateTaskStatus,
  completeTask,
  failTask,
  listTasksByStatus,
  createTask,

  // Checkpoint management
  saveCheckpoint,
  getCheckpoint,
  getLatestCheckpoint,
  listCheckpoints,

  // Cleanup
  cleanupOldTasks,
  cleanupOldCheckpoints,
};
