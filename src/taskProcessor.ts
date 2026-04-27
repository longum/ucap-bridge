import { parseApprovalDecision } from "./approval";
import { callbackApproval } from "./ekuaibaoClient";
import { extractBridgeContent } from "./extract";
import { getValueByPath } from "./extract";
import { TaskStore } from "./taskStore";
import { ApprovalTask, BridgeConfig } from "./types";
import { invokeUcapChat, UcapClientOptions } from "./ucapClient";

export interface TaskProcessorOptions extends UcapClientOptions {
  logger?: boolean;
}

function readRequiredString(body: unknown, fieldName: string): string | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }

  const value = (body as Record<string, unknown>)[fieldName];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function readInputFromBody(body: unknown, inputField: string, rawBody: string): string | undefined {
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

export async function processApprovalTask(config: BridgeConfig, task: ApprovalTask, options: TaskProcessorOptions = {}): Promise<void> {
  const parsedBody = JSON.parse(task.rawBody) as unknown;
  const upstream = await invokeUcapChat(config, task.input, task.botId ? { botId: task.botId } : {}, { fetchImpl: options.fetchImpl });

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
    throw new Error("合思出站消息缺少 flowId 或 nodeId，无法回调审批");
  }

  const decision = parseApprovalDecision(extracted.content);
  const callbackConfig = {
    ...config,
    signSecret: task.signSecret || config.signSecret,
  };
  const approval = await callbackApproval(
    callbackConfig,
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

  if (approval.code !== "204") {
    throw new Error(`合思审批回调失败: code=${approval.code ?? "unknown"} message=${approval.message ?? approval.bodyText}`);
  }

  if (options.logger) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ traceId: task.traceId, taskId: task.id, action: decision.action, approved: decision.approved }));
  }
}

export class ApprovalTaskWorker {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly config: BridgeConfig,
    private readonly store: TaskStore,
    private readonly options: TaskProcessorOptions = {}
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.config.taskPollIntervalMs);
    void this.tick();
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async tick(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      while (true) {
        const task = this.store.claimNext(Date.now());
        if (!task) {
          break;
        }

        try {
          await processApprovalTask(this.config, task, this.options);
          this.store.complete(task.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : "未知错误";
          this.store.fail(task.id, message, Date.now() + this.config.taskRetryDelayMs);
          if (this.options.logger) {
            // eslint-disable-next-line no-console
            console.error(JSON.stringify({ traceId: task.traceId, taskId: task.id, error: message }));
          }
        }
      }
    } finally {
      this.running = false;
    }
  }
}
