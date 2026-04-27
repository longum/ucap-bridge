import { ApprovalTask } from "../src/types";
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
    close() {
      return;
    },
  };
}
