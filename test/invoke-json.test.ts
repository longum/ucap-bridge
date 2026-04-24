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
  ekuaibaoBaseUrl: "https://app.ekuaibao.com",
  ekuaibaoAppKey: "app-key",
  ekuaibaoAppSecurity: "app-security",
  requireSignature: true,
  requestTimeoutMs: 1000,
  inputField: "input",
  responseMode: "auto",
  jsonExtractPath: "data.answer",
  ucapParameters: {},
  ucapVars: {},
};

describe("invoke json", () => {
  it("returns extracted JSON content", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ data: { answer: "最终文本" } }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    });

    const timestamp = String(Date.now());
    const body = JSON.stringify({ input: "你好" });

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

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      content: "最终文本",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String((fetchImpl.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({
      agent_id: "agent-1",
      input: "你好",
      parameters: {
        userChatInput: "你好",
      },
      vars: {},
    });

    await app.close();
  });
});
