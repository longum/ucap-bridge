import Fastify, { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createTaskStore, TaskStore } from "./taskStore";
import { ApprovalTaskWorker, readInputFromBody } from "./taskProcessor";
import { BridgeConfig } from "./types";
import { UcapClientOptions } from "./ucapClient";
import { verifyRequestSignature } from "./signature";

export interface CreateServerOptions extends UcapClientOptions {
  logger?: boolean;
  taskStore?: TaskStore;
  startWorker?: boolean;
}

function readBodyString(body: unknown, fieldName: string): string | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const value = (body as Record<string, unknown>)[fieldName];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveSignSecret(config: BridgeConfig, body: unknown): string {
  const candidates = [readBodyString(body, "botId"), readBodyString(body, "action"), readBodyString(body, "actionName")].filter(
    (value): value is string => Boolean(value)
  );

  for (const candidate of candidates) {
    const bot = config.outboundBots.find((item) => item.botId === candidate);
    if (bot) {
      return bot.signSecret;
    }
  }

  return config.signSecret;
}

export function createApp(config: BridgeConfig, options: CreateServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
  });
  const store = options.taskStore ?? createTaskStore(config.taskDbPath);
  const worker = new ApprovalTaskWorker(config, store, options);

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

  app.get("/healthz", async (request, reply) => {
    const summary = store.summary(Date.now());
    const healthy = summary.counts.failed === 0;

    return reply.status(healthy ? 200 : 503).send({
      success: healthy,
      status: healthy ? "ok" : "degraded",
      tasks: summary,
    });
  });

  app.get("/tasks/summary", async () => {
    return {
      success: true,
      tasks: store.summary(Date.now()),
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

    store.enqueue({
      id: randomUUID(),
      traceId,
      signSecret: resolveSignSecret(config, parsedBody),
      rawBody,
      input,
      maxAttempts: config.taskMaxAttempts,
    });

    return reply.send({
      success: true,
      accepted: true,
      traceId,
    });
  });

  app.addHook("onReady", async () => {
    if (options.startWorker !== false) {
      worker.start();
    }
  });

  app.addHook("onClose", async () => {
    worker.stop();
    if (!options.taskStore) {
      store.close();
    }
  });

  return app;
}

export async function startServer(config: BridgeConfig, options: CreateServerOptions = {}): Promise<FastifyInstance> {
  const app = createApp(config, options);
  await app.listen({ port: config.listenPort, host: "0.0.0.0" });
  return app;
}
