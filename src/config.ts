import fs from "node:fs/promises";
import path from "node:path";
import { BridgeConfig, OutboundBotConfig, RawConfig, ResponseMode } from "./types";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  throw new Error(`${fieldName} 必须是布尔值`);
}

function parseResponseMode(value: unknown): ResponseMode {
  if (value === "auto" || value === "json" || value === "sse") {
    return value;
  }
  throw new Error("responseMode 必须是 auto、json 或 sse");
}

function parseOutboundBots(value: unknown): OutboundBotConfig[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("outboundBots 必须是数组");
  }

  return value.map((item, index) => {
    if (!isPlainObject(item)) {
      throw new Error(`outboundBots[${index}] 必须是对象`);
    }
    if (!isNonEmptyString(item.botId)) {
      throw new Error(`outboundBots[${index}].botId 缺失或无效`);
    }
    if (!isNonEmptyString(item.signSecret)) {
      throw new Error(`outboundBots[${index}].signSecret 缺失或无效`);
    }
    return {
      botId: item.botId,
      signSecret: item.signSecret,
    };
  });
}

export function parseConfig(raw: RawConfig): BridgeConfig {
  if (!isPositiveInteger(raw.listenPort)) {
    throw new Error("listenPort 缺失或无效");
  }
  if (!isNonEmptyString(raw.ucapBaseUrl)) {
    throw new Error("ucapBaseUrl 缺失或无效");
  }
  if (!isNonEmptyString(raw.apiKey)) {
    throw new Error("apiKey 缺失或无效");
  }
  if (!isNonEmptyString(raw.agentId)) {
    throw new Error("agentId 缺失或无效");
  }
  const outboundBots = parseOutboundBots(raw.outboundBots);
  if (!isNonEmptyString(raw.signSecret) && outboundBots.length === 0) {
    throw new Error("signSecret 缺失或无效");
  }
  if (raw.ekuaibaoBaseUrl !== undefined && !isNonEmptyString(raw.ekuaibaoBaseUrl)) {
    throw new Error("ekuaibaoBaseUrl 缺失或无效");
  }
  if (raw.ekuaibaoAccessToken !== undefined && !isNonEmptyString(raw.ekuaibaoAccessToken)) {
    throw new Error("ekuaibaoAccessToken 缺失或无效");
  }
  if (raw.ekuaibaoAccessToken === undefined && !isNonEmptyString(raw.ekuaibaoAppKey)) {
    throw new Error("ekuaibaoAppKey 缺失或无效");
  }
  if (raw.ekuaibaoAccessToken === undefined && !isNonEmptyString(raw.ekuaibaoAppSecurity)) {
    throw new Error("ekuaibaoAppSecurity 缺失或无效");
  }
  if (!isPositiveInteger(raw.requestTimeoutMs)) {
    throw new Error("requestTimeoutMs 缺失或无效");
  }
  if (raw.taskDbPath !== undefined && !isNonEmptyString(raw.taskDbPath)) {
    throw new Error("taskDbPath 缺失或无效");
  }
  if (raw.taskMaxAttempts !== undefined && !isPositiveInteger(raw.taskMaxAttempts)) {
    throw new Error("taskMaxAttempts 缺失或无效");
  }
  if (raw.taskRetryDelayMs !== undefined && !isPositiveInteger(raw.taskRetryDelayMs)) {
    throw new Error("taskRetryDelayMs 缺失或无效");
  }
  if (raw.taskPollIntervalMs !== undefined && !isPositiveInteger(raw.taskPollIntervalMs)) {
    throw new Error("taskPollIntervalMs 缺失或无效");
  }
  if (!isNonEmptyString(raw.inputField)) {
    throw new Error("inputField 缺失或无效");
  }
  if (!isNonEmptyString(raw.jsonExtractPath)) {
    throw new Error("jsonExtractPath 缺失或无效");
  }
  if (raw.ucapParameters !== undefined && !isPlainObject(raw.ucapParameters)) {
    throw new Error("ucapParameters 必须是对象");
  }
  if (raw.ucapVars !== undefined && !isPlainObject(raw.ucapVars)) {
    throw new Error("ucapVars 必须是对象");
  }

  let normalizedBaseUrl: string;
  let normalizedEkuaibaoBaseUrl: string;
  try {
    normalizedBaseUrl = new URL(raw.ucapBaseUrl).toString().replace(/\/$/, "");
  } catch {
    throw new Error("ucapBaseUrl 必须是合法 URL");
  }
  try {
    normalizedEkuaibaoBaseUrl = new URL((raw.ekuaibaoBaseUrl as string | undefined) ?? "https://app.ekuaibao.com").toString().replace(/\/$/, "");
  } catch {
    throw new Error("ekuaibaoBaseUrl 必须是合法 URL");
  }

  return {
    listenPort: raw.listenPort,
    ucapBaseUrl: normalizedBaseUrl,
    apiKey: raw.apiKey,
    agentId: raw.agentId,
    signSecret: isNonEmptyString(raw.signSecret) ? raw.signSecret : outboundBots[0].signSecret,
    outboundBots,
    ekuaibaoBaseUrl: normalizedEkuaibaoBaseUrl,
    ekuaibaoAppKey: isNonEmptyString(raw.ekuaibaoAppKey) ? raw.ekuaibaoAppKey : "",
    ekuaibaoAppSecurity: isNonEmptyString(raw.ekuaibaoAppSecurity) ? raw.ekuaibaoAppSecurity : "",
    ekuaibaoAccessToken: isNonEmptyString(raw.ekuaibaoAccessToken) ? raw.ekuaibaoAccessToken : undefined,
    requireSignature: raw.requireSignature === undefined ? true : parseBoolean(raw.requireSignature, "requireSignature"),
    logInboundBody: raw.logInboundBody === undefined ? false : parseBoolean(raw.logInboundBody, "logInboundBody"),
    requestTimeoutMs: raw.requestTimeoutMs,
    taskDbPath: isNonEmptyString(raw.taskDbPath) ? raw.taskDbPath : "data/bridge.sqlite",
    taskMaxAttempts: typeof raw.taskMaxAttempts === "number" ? raw.taskMaxAttempts : 5,
    taskRetryDelayMs: typeof raw.taskRetryDelayMs === "number" ? raw.taskRetryDelayMs : 60000,
    taskPollIntervalMs: typeof raw.taskPollIntervalMs === "number" ? raw.taskPollIntervalMs : 5000,
    inputField: raw.inputField,
    responseMode: parseResponseMode(raw.responseMode ?? "auto"),
    jsonExtractPath: raw.jsonExtractPath,
    ucapParameters: raw.ucapParameters ?? {},
    ucapVars: raw.ucapVars ?? {},
  };
}

export async function loadConfig(configPath = process.env.CONFIG_PATH ?? path.resolve(process.cwd(), "config.json")): Promise<BridgeConfig> {
  const rawText = await fs.readFile(configPath, "utf8");
  let raw: RawConfig;
  try {
    raw = JSON.parse(rawText) as RawConfig;
  } catch {
    throw new Error(`无法解析配置文件: ${configPath}`);
  }

  return parseConfig(raw);
}
