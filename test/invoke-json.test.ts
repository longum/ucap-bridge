import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/server";
import { BridgeConfig } from "../src/types";
import { buildRequestSignature } from "../src/signature";
import { createMemoryTaskStore } from "./helpers";
import { clearEkuaibaoTokenCache } from "../src/ekuaibaoClient";

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
  requireSignature: true,
  logInboundBody: false,
  inboundLogPath: "logs/inbound.log",
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

afterEach(() => {
  clearEkuaibaoTokenCache();
});

describe("invoke json", () => {
  it("returns extracted JSON content", async () => {
    const taskStore = createMemoryTaskStore();
    const timestamp = String(Date.now());
    const body = JSON.stringify({ input: "你好" });

    const app = createApp(config, { taskStore, startWorker: false });
    const response = await app.inject({
      method: "POST",
      url: "/invoke/bot-a",
      payload: body,
      headers: {
        "content-type": "application/json",
        "x-timestamp": timestamp,
        "x-signature": buildRequestSignature(timestamp, body, "bot-a-secret"),
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

  it("writes inbound body to a file when enabled", async () => {
    const taskStore = createMemoryTaskStore();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ucap-bridge-log-"));
    const inboundLogPath = path.join(dir, "inbound.log");
    const body = JSON.stringify({ input: "你好" });

    const app = createApp(
      {
        ...config,
        requireSignature: false,
        logInboundBody: true,
        inboundLogPath,
      },
      { taskStore, startWorker: false }
    );
    const response = await app.inject({
      method: "POST",
      url: "/invoke/bot-a",
      payload: body,
      headers: {
        "content-type": "application/json",
      },
    });

    expect(response.statusCode).toBe(200);
    const logText = await fs.readFile(inboundLogPath, "utf8");
    const logEntry = JSON.parse(logText.trim());
    expect(logEntry).toMatchObject({
      botId: "bot-a",
      rawBody: body,
    });
    expect(logEntry.traceId).toBe(response.json().traceId);

    await app.close();
  });

  it("passes URL botId to UCAP vars", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: { accessToken: "access-token" } }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { answer: JSON.stringify({ approved: true, reason: "符合规则" }) } }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: { code: "204", message: "EBot执行完成" } }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        })
      );
    const taskStore = createMemoryTaskStore();
    const app = createApp(
      {
        ...config,
        requireSignature: false,
        inputField: "$body",
      },
      { taskStore, startWorker: false }
    );

    await app.inject({
      method: "POST",
      url: "/invoke/bot-a",
      payload: JSON.stringify({
        flowId: "flow-1",
        nodeId: "node-1",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const { ApprovalTaskWorker } = await import("../src/taskProcessor");
    const worker = new ApprovalTaskWorker({ ...config, requireSignature: false, inputField: "$body" }, taskStore, { fetchImpl });
    await worker.tick();

    const ucapBody = JSON.parse(String((fetchImpl.mock.calls[1]?.[1] as RequestInit).body));
    expect(ucapBody.vars).toMatchObject({
      botId: "bot-a",
      accessToken: "access-token",
    });

    await app.close();
  });
});
