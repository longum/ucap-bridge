import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server";
import { BridgeConfig } from "../src/types";
import { buildRequestSignature } from "../src/signature";
import { createMemoryTaskStore } from "./helpers";

const config: BridgeConfig = {
  listenPort: 3000,
  ucapBaseUrl: "https://ucap.example.com",
  apiKey: "secret",
  agentId: "agent-1",
  signSecret: "sign-secret",
  ekuaibaoBaseUrl: "https://app.ekuaibao.com",
  ekuaibaoAppKey: "app-key",
  ekuaibaoAppSecurity: "app-security",
  requireSignature: true,
  requestTimeoutMs: 1000,
  taskDbPath: "data/test.sqlite",
  taskMaxAttempts: 5,
  taskRetryDelayMs: 1000,
  taskPollIntervalMs: 1000,
  inputField: "input",
  responseMode: "auto",
  jsonExtractPath: "data.answer",
  ucapParameters: {},
  ucapVars: {},
};

describe("invoke sse", () => {
  it("ignores quote events and concatenates message events", async () => {
    const taskStore = createMemoryTaskStore();
    const timestamp = String(Date.now());
    const body = JSON.stringify({ input: "你好" });

    const app = createApp(config, { taskStore, startWorker: false });
    const response = await app.inject({
      method: "POST",
      url: "/invoke",
      payload: body,
      headers: {
        "content-type": "application/json",
        "x-timestamp": timestamp,
        "x-signature": buildRequestSignature(timestamp, body, config.signSecret),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      accepted: true,
    });
    expect(taskStore.tasks).toHaveLength(1);
    expect(taskStore.tasks[0]).toMatchObject({
      input: "你好",
      rawBody: body,
      status: "pending",
    });

    await app.close();
  });
});
