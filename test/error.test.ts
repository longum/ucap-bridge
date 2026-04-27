import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server";
import { BridgeConfig } from "../src/types";
import { buildRequestSignature } from "../src/signature";
import { createMemoryTaskStore } from "./helpers";
import { ApprovalTaskWorker } from "../src/taskProcessor";

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

describe("errors", () => {
  it("rejects missing input", async () => {
    const app = createApp(config, {
      fetchImpl: vi.fn(),
    });

    const body = JSON.stringify({});
    const timestamp = String(Date.now());

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

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
    });

    await app.close();
  });

  it("returns a clear error when JSON path is missing", async () => {
    const taskStore = createMemoryTaskStore();
    const body = JSON.stringify({ input: "你好" });
    const timestamp = String(Date.now());
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

    await app.close();
  });

  it("rejects invalid signatures", async () => {
    const app = createApp(config, {
      fetchImpl: vi.fn(),
    });

    const body = JSON.stringify({ input: "你好" });
    const timestamp = String(Date.now());
    const response = await app.inject({
      method: "POST",
      url: "/invoke",
      payload: body,
      headers: {
        "content-type": "application/json",
        "x-timestamp": timestamp,
        "x-signature": "deadbeef",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      success: false,
      error: expect.stringContaining("签名校验失败"),
    });

    await app.close();
  });

  it("accepts an arbitrary outbound body when signature is disabled and inputField is $body", async () => {
    const taskStore = createMemoryTaskStore();
    const app = createApp(
      {
        ...config,
        requireSignature: false,
        inputField: "$body",
      },
      { taskStore, startWorker: false }
    );

    const body = JSON.stringify({
      action: "",
      actionName: "",
      userInfo: {
        id: "员工id",
        name: "张三",
        cellphone: "13111111111",
        email: "123@qq.com",
      },
      flowId: "",
      nodeId: "",
    });

    const response = await app.inject({
      method: "POST",
      url: "/invoke",
      payload: body,
      headers: {
        "content-type": "application/json",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      accepted: true,
    });
    expect(taskStore.tasks).toHaveLength(1);
    expect(taskStore.tasks[0]).toMatchObject({
      input: body,
      rawBody: body,
    });

    await app.close();
  });

  it("callbacks Ekuaibao approval when flowId and nodeId are present", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { answer: JSON.stringify({ approved: true, reason: "符合规则" }) } }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: { accessToken: "access-token" } }), {
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

    const body = JSON.stringify({
      action: "",
      actionName: "",
      flowId: "flow-1",
      nodeId: "node-1",
      userInfo: {
        name: "张三",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/invoke",
      payload: body,
      headers: {
        "content-type": "application/json",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      accepted: true,
    });
    const worker = new ApprovalTaskWorker({ ...config, requireSignature: false, inputField: "$body" }, taskStore, { fetchImpl });
    await worker.tick();

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("/api/openapi/v1/auth/getAccessToken");
    expect(JSON.parse(String((fetchImpl.mock.calls[1]?.[1] as RequestInit).body))).toMatchObject({
      appKey: "app-key",
      appSecurity: "app-security",
    });
    expect(String(fetchImpl.mock.calls[2]?.[0])).toContain("/api/openapi/v1/approval?accessToken=access-token");
    expect(JSON.parse(String((fetchImpl.mock.calls[2]?.[1] as RequestInit).body))).toMatchObject({
      signKey: "sign-secret",
      flowId: "flow-1",
      nodeId: "node-1",
      action: "accept",
      comment: "符合规则",
    });

    await app.close();
  });

  it("does not complete a task when Ekuaibao approval returns a non-204 business code", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { answer: JSON.stringify({ approved: true, reason: "符合规则" }) } }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: { accessToken: "access-token" } }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: { code: "401", message: "签名秘钥错误" } }), {
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
        taskMaxAttempts: 1,
      },
      { taskStore, startWorker: false }
    );

    const body = JSON.stringify({
      flowId: "flow-1",
      nodeId: "node-1",
    });

    await app.inject({
      method: "POST",
      url: "/invoke",
      payload: body,
      headers: {
        "content-type": "application/json",
      },
    });

    const worker = new ApprovalTaskWorker({ ...config, requireSignature: false, inputField: "$body", taskMaxAttempts: 1 }, taskStore, {
      fetchImpl,
    });
    await worker.tick();

    expect(taskStore.tasks[0]).toMatchObject({
      status: "failed",
      lastError: expect.stringContaining("签名秘钥错误"),
    });

    await app.close();
  });
});
