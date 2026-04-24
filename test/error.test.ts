import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/server";
import { BridgeConfig } from "../src/types";
import { buildRequestSignature } from "../src/signature";

const config: BridgeConfig = {
  listenPort: 3000,
  ucapBaseUrl: "https://ucap.example.com",
  apiKey: "secret",
  agentId: "agent-1",
  signSecret: "sign-secret",
  requireSignature: true,
  requestTimeoutMs: 1000,
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
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    });

    const body = JSON.stringify({ input: "你好" });
    const timestamp = String(Date.now());
    const app = createApp(config, { fetchImpl });
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

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      success: false,
      error: expect.stringContaining("JSON 路径不存在"),
    });

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
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ data: { answer: "ok" } }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    });
    const app = createApp(
      {
        ...config,
        requireSignature: false,
        inputField: "$body",
      },
      { fetchImpl }
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
      content: "ok",
    });
    expect(JSON.parse(String((fetchImpl.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({
      input: body,
      parameters: {
        userChatInput: body,
      },
    });

    await app.close();
  });
});
