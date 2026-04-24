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
});
