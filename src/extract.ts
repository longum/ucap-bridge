import { parseSseEvents } from "./sseParser";
import { BridgeConfig, ExtractedContent, JsonSuccessResult, UcapUpstreamResponse } from "./types";

function splitPath(pathExpression: string): string[] {
  return pathExpression
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function getValueByPath(value: unknown, pathExpression: string): unknown {
  const segments = splitPath(pathExpression);
  let current: unknown = value;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }

    return undefined;
  }

  return current;
}

function stringifyPrimitive(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function extractMessageText(data: string): string | undefined {
  const parsed = tryParseJson(data);

  if (parsed === undefined) {
    return data;
  }

  const primitive = stringifyPrimitive(parsed);
  if (primitive !== undefined) {
    return primitive;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }

  const record = parsed as Record<string, unknown>;
  for (const key of ["content", "text"]) {
    const value = stringifyPrimitive(record[key]);
    if (value !== undefined) {
      return value;
    }
  }

  const result = record.result;
  if (typeof result === "object" && result !== null) {
    const resultRecord = result as Record<string, unknown>;
    for (const key of ["content", "text", "message", "delta"]) {
      const value = stringifyPrimitive(resultRecord[key]);
      if (value !== undefined) {
        return value;
      }
    }
  }

  for (const key of ["message", "delta"]) {
    const value = stringifyPrimitive(record[key]);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function extractSseErrorText(data: string): string {
  const parsed = tryParseJson(data);
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    const message = stringifyPrimitive(record.message) ?? stringifyPrimitive(record.content) ?? stringifyPrimitive(record.error);
    if (message) {
      const code = stringifyPrimitive(record.code);
      return code ? `UCAP SSE error ${code}: ${message}` : `UCAP SSE error: ${message}`;
    }
  }

  return `UCAP SSE error: ${data}`;
}

function extractFromSse(bodyText: string): JsonSuccessResult | { error: string } {
  const events = parseSseEvents(bodyText);
  let content = "";

  for (const event of events) {
    if (event.event === "quote") {
      continue;
    }

    if (event.event === "error") {
      return { error: extractSseErrorText(event.data) };
    }

    if (event.event === "close") {
      break;
    }

    if (event.event !== "message") {
      continue;
    }

    const text = extractMessageText(event.data);
    if (text) {
      content += text;
    }
  }

  if (!content) {
    return { error: "SSE 响应中没有可用的 message 内容" };
  }

  return { content };
}

function extractFromJson(bodyText: string, jsonExtractPath: string): JsonSuccessResult | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { error: "上游 JSON 响应不是合法 JSON" };
  }

  const value = getValueByPath(parsed, jsonExtractPath);
  if (value === undefined) {
    return { error: `JSON 路径不存在: ${jsonExtractPath}` };
  }

  const content = stringifyPrimitive(value);
  if (content === undefined) {
    return { error: `JSON 路径 ${jsonExtractPath} 对应的值不是字符串、数字或布尔值` };
  }

  return { content };
}

function normalizeContentType(contentType: string): string {
  return contentType.toLowerCase();
}

export function extractBridgeContent(
  upstream: UcapUpstreamResponse,
  config: Pick<BridgeConfig, "responseMode" | "jsonExtractPath">
): ExtractedContent | { error: string } {
  const contentType = normalizeContentType(upstream.contentType);
  const useSse = config.responseMode === "sse" || (config.responseMode === "auto" && contentType.includes("text/event-stream"));

  if (useSse) {
    const result = extractFromSse(upstream.bodyText);
    if ("error" in result) {
      return result;
    }
    return { content: result.content, mode: "sse" };
  }

  const result = extractFromJson(upstream.bodyText, config.jsonExtractPath);
  if ("error" in result) {
    return result;
  }

  return { content: result.content, mode: "json" };
}
