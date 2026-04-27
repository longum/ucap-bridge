import { describe, expect, it } from "vitest";
import { createMemoryTaskStore } from "./helpers";

describe("task store", () => {
  it("claims, retries, and completes tasks", () => {
    const store = createMemoryTaskStore();
    store.enqueue({
      id: "task-1",
      traceId: "trace-1",
      rawBody: "{}",
      input: "{}",
      maxAttempts: 2,
    });

    const first = store.claimNext(Date.now());
    expect(first).toMatchObject({
      id: "task-1",
      attempts: 1,
      status: "processing",
    });

    store.fail("task-1", "boom", Date.now() - 1);
    expect(store.tasks[0]).toMatchObject({
      status: "pending",
      lastError: "boom",
    });

    const second = store.claimNext(Date.now());
    expect(second).toMatchObject({
      attempts: 2,
      status: "processing",
    });

    store.complete("task-1");
    expect(store.tasks[0]).toMatchObject({
      status: "completed",
    });
  });
});
