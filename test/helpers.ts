import { ApprovalTask, TaskStatus } from "../src/types";
import { TaskStore } from "../src/taskStore";

export function createMemoryTaskStore(): TaskStore & { tasks: ApprovalTask[] } {
  const tasks: ApprovalTask[] = [];

  return {
    tasks,
    enqueue(task) {
      const now = Date.now();
      tasks.push({
        id: task.id,
        status: "pending",
        traceId: task.traceId,
        rawBody: task.rawBody,
        input: task.input,
        attempts: 0,
        maxAttempts: task.maxAttempts,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      });
    },
    claimNext(now) {
      const task = tasks.find((candidate) => candidate.status === "pending" && candidate.nextRunAt <= now);
      if (!task) {
        return undefined;
      }
      task.status = "processing";
      task.attempts += 1;
      task.updatedAt = now;
      return { ...task };
    },
    complete(id) {
      const task = tasks.find((candidate) => candidate.id === id);
      if (task) {
        task.status = "completed";
        task.updatedAt = Date.now();
      }
    },
    fail(id, error, nextRunAt) {
      const task = tasks.find((candidate) => candidate.id === id);
      if (task) {
        task.status = task.attempts >= task.maxAttempts ? "failed" : "pending";
        task.lastError = error;
        task.nextRunAt = nextRunAt;
        task.updatedAt = Date.now();
      }
    },
    summary(now) {
      const counts: Record<TaskStatus, number> = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      };
      for (const task of tasks) {
        counts[task.status] += 1;
      }
      const pending = tasks.filter((task) => task.status === "pending").sort((a, b) => a.createdAt - b.createdAt)[0];
      return {
        counts,
        oldestPendingAgeMs: pending ? Math.max(0, now - pending.createdAt) : null,
        recentFailures: tasks
          .filter((task) => task.status === "failed" || task.lastError)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 10)
          .map((task) => ({
            id: task.id,
            traceId: task.traceId,
            status: task.status,
            attempts: task.attempts,
            maxAttempts: task.maxAttempts,
            lastError: task.lastError,
            updatedAt: task.updatedAt,
          })),
      };
    },
    close() {
      return;
    },
  };
}
