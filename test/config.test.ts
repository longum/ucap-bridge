import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig, parseConfig } from "../src/config";

const baseConfig = {
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
  requestTimeoutMs: 1000,
  inputField: "input",
  responseMode: "auto",
  jsonExtractPath: "data.answer",
  ucapParameters: {},
  ucapVars: {},
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("config", () => {
  it("parses a valid config", () => {
    const config = parseConfig(baseConfig);
    expect(config.listenPort).toBe(3000);
    expect(config.ucapBaseUrl).toBe("https://ucap.example.com");
    expect(config.responseMode).toBe("auto");
  });

  it("rejects invalid config", () => {
    expect(() => parseConfig({ ...baseConfig, listenPort: 0 })).toThrow("listenPort 缺失或无效");
  });

  it("loads config from CONFIG_PATH", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ucap-bridge-"));
    const file = path.join(dir, "config.json");
    await fs.writeFile(file, JSON.stringify(baseConfig), "utf8");

    vi.stubEnv("CONFIG_PATH", file);
    const config = await loadConfig();

    expect(config.agentId).toBe("agent-1");
  });
});
