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

describe("invoke sse", () => {
  it("ignores quote events and concatenates message events", async () => {
    const sseBody = [
      "event: quote",
      'data: {"content":"忽略"}',
      "",
      "event: message",
      'data: {"content":"你"}',
      "",
      "event: message",
      'data: {"text":"好"}',
      "",
      "event: close",
      "data: done",
      "",
    ].join("\n");

    const fetchImpl = vi.fn(async () => {
      return new Response(sseBody, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
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
      accepted: true,
    });
    await vi.waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
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
