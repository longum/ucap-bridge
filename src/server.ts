import Fastify, { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { parseApprovalDecision } from "./approval";
import { callbackApproval } from "./ekuaibaoClient";
import { extractBridgeContent, getValueByPath } from "./extract";
import { BridgeConfig } from "./types";
import { invokeUcapChat, UcapClientOptions } from "./ucapClient";
import { verifyRequestSignature } from "./signature";

export interface CreateServerOptions extends UcapClientOptions {
  logger?: boolean;
}

function readInputFromBody(body: unknown, inputField: string, rawBody: string): string | undefined {
  if (inputField === "$body") {
    const trimmed = rawBody.trim();
    return trimmed.length > 0 ? rawBody : undefined;
  }

  if (typeof body !== "object" || body === null) {
    return undefined;
  }

  const value = inputField.includes(".") ? getValueByPath(body, inputField) : (body as Record<string, unknown>)[inputField];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? value : undefined;
}

function readRequiredString(body: unknown, fieldName: string): string | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }

  const value = (body as Record<string, unknown>)[fieldName];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

async function processOutboundMessage(
  config: BridgeConfig,
  options: CreateServerOptions,
  parsedBody: unknown,
  input: string,
  traceId: string
): Promise<void> {
  const upstream = await invokeUcapChat(config, input, { fetchImpl: options.fetchImpl });

  if (upstream.status < 200 || upstream.status >= 300) {
    throw new Error(`UCAP 返回非 2xx 状态码: ${upstream.status}`);
  }

  const extracted = extractBridgeContent(upstream, config);
  if ("error" in extracted) {
    throw new Error(extracted.error);
  }

  const flowId = readRequiredString(parsedBody, "flowId");
  const nodeId = readRequiredString(parsedBody, "nodeId");
  if (!flowId || !nodeId) {
    return;
  }

  const decision = parseApprovalDecision(extracted.content);
  const approval = await callbackApproval(
    config,
    {
      flowId,
      nodeId,
      action: decision.action,
      comment: decision.comment,
    },
    options.fetchImpl
  );

  if (approval.status < 200 || approval.status >= 300) {
    throw new Error(`合思审批回调返回非 2xx 状态码: ${approval.status}`);
  }

  if (options.logger) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ traceId, action: decision.action, approved: decision.approved }));
  }
}

export function createApp(config: BridgeConfig, options: CreateServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
  });

  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (request, body, done) => {
      done(null, body);
    }
  );

  app.get("/health", async () => {
    return {
      success: true,
      status: "ok",
    };
  });

  app.post("/invoke", async (request, reply) => {
    const traceId = randomUUID();
    const rawBody = typeof request.body === "string" ? request.body : "";
    const signatureResult = config.requireSignature ? verifyRequestSignature(rawBody, request.headers, config) : { ok: true as const };

    if (!signatureResult.ok) {
      return reply.status(401).send({
        success: false,
        error: signatureResult.error,
        traceId,
      });
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return reply.status(400).send({
        success: false,
        error: "请求体不是合法 JSON",
        traceId,
      });
    }

    const input = readInputFromBody(parsedBody, config.inputField, rawBody);

    if (!input) {
      return reply.status(400).send({
        success: false,
        error: `请求体缺少有效的 ${config.inputField} 字段`,
        traceId,
      });
    }

    void processOutboundMessage(config, options, parsedBody, input, traceId).catch((error) => {
      const message = error instanceof Error ? error.message : "未知错误";
      request.log.error({ traceId, error: message }, "处理合思出站消息失败");
    });

    return reply.send({
      success: true,
      accepted: true,
      traceId,
    });
  });

  return app;
}

export async function startServer(config: BridgeConfig, options: CreateServerOptions = {}): Promise<FastifyInstance> {
  const app = createApp(config, options);
  await app.listen({ port: config.listenPort, host: "0.0.0.0" });
  return app;
}
