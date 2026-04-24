import fs from "node:fs/promises";
import path from "node:path";
import { BridgeConfig, RawConfig, ResponseMode } from "./types";

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
  if (!isNonEmptyString(raw.signSecret)) {
    throw new Error("signSecret 缺失或无效");
  }
  if (!isPositiveInteger(raw.requestTimeoutMs)) {
    throw new Error("requestTimeoutMs 缺失或无效");
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
  try {
    normalizedBaseUrl = new URL(raw.ucapBaseUrl).toString().replace(/\/$/, "");
  } catch {
    throw new Error("ucapBaseUrl 必须是合法 URL");
  }

  return {
    listenPort: raw.listenPort,
    ucapBaseUrl: normalizedBaseUrl,
    apiKey: raw.apiKey,
    agentId: raw.agentId,
    signSecret: raw.signSecret,
    requireSignature: raw.requireSignature === undefined ? true : parseBoolean(raw.requireSignature, "requireSignature"),
    requestTimeoutMs: raw.requestTimeoutMs,
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
