import { describe, expect, it } from "vitest";
import { createApp } from "../src/server";
import { BridgeConfig } from "../src/types";
import { createMemoryTaskStore } from "./helpers";

const config: BridgeConfig = {
  listenPort: 3000,
  ucapBaseUrl: "https://ucap.example.com",
  apiKey: "secret",
  agentId: "agent-1",
  signSecret: "sign-secret",
  outboundBots: [{ botId: "bot-a", signSecret: "bot-a-secret" }, { botId: "bot-b", signSecret: "bot-b-secret" }],
  ekuaibaoBaseUrl: "https://app.ekuaibao.com",
  ekuaibaoAppKey: "app-key",
  ekuaibaoAppSecurity: "app-security",
  requireSignature: false,
  requestTimeoutMs: 1000,
  taskDbPath: "data/test.sqlite",
  taskMaxAttempts: 2,
  taskRetryDelayMs: 1000,
  taskPollIntervalMs: 1000,
  inputField: "$body",
  responseMode: "auto",
  jsonExtractPath: "data.answer",
  ucapParameters: {},
  ucapVars: {},
};

describe("healthz", () => {
  it("returns ok when there are no failed tasks", async () => {
    const taskStore = createMemoryTaskStore();
    const app = createApp(config, { taskStore, startWorker: false });

    const response = await app.inject({
      method: "GET",
      url: "/healthz",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      status: "ok",
      tasks: {
        counts: {
          failed: 0,
        },
      },
    });

    await app.close();
  });

  it("returns degraded when there are failed tasks", async () => {
    const taskStore = createMemoryTaskStore();
    taskStore.enqueue({
      id: "task-1",
      traceId: "trace-1",
      rawBody: "{}",
      input: "{}",
      maxAttempts: 1,
    });
    taskStore.claimNext(Date.now());
    taskStore.fail("task-1", "boom", Date.now());
    const app = createApp(config, { taskStore, startWorker: false });

    const response = await app.inject({
      method: "GET",
      url: "/healthz",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      success: false,
      status: "degraded",
      tasks: {
        counts: {
          failed: 1,
        },
        recentFailures: [
          {
            id: "task-1",
            lastError: "boom",
          },
        ],
      },
    });

    await app.close();
  });
});
