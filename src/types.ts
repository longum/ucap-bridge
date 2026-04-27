export type ResponseMode = "auto" | "json" | "sse";

export interface BridgeConfig {
  listenPort: number;
  ucapBaseUrl: string;
  apiKey: string;
  agentId: string;
  signSecret: string;
  outboundBots: OutboundBotConfig[];
  ekuaibaoBaseUrl: string;
  ekuaibaoAppKey: string;
  ekuaibaoAppSecurity: string;
  ekuaibaoAccessToken?: string;
  requireSignature: boolean;
  requestTimeoutMs: number;
  taskDbPath: string;
  taskMaxAttempts: number;
  taskRetryDelayMs: number;
  taskPollIntervalMs: number;
  inputField: string;
  responseMode: ResponseMode;
  jsonExtractPath: string;
  ucapParameters: Record<string, unknown>;
  ucapVars: Record<string, unknown>;
}

export interface RawConfig {
  listenPort?: unknown;
  ucapBaseUrl?: unknown;
  apiKey?: unknown;
  agentId?: unknown;
  signSecret?: unknown;
  outboundBots?: unknown;
  ekuaibaoBaseUrl?: unknown;
  ekuaibaoAppKey?: unknown;
  ekuaibaoAppSecurity?: unknown;
  ekuaibaoAccessToken?: unknown;
  requireSignature?: unknown;
  requestTimeoutMs?: unknown;
  taskDbPath?: unknown;
  taskMaxAttempts?: unknown;
  taskRetryDelayMs?: unknown;
  taskPollIntervalMs?: unknown;
  inputField?: unknown;
  responseMode?: unknown;
  jsonExtractPath?: unknown;
  ucapParameters?: unknown;
  ucapVars?: unknown;
}

export interface UcapUpstreamResponse {
  status: number;
  contentType: string;
  bodyText: string;
}

export interface ExtractedContent {
  content: string;
  mode: "sse" | "json";
}

export interface JsonErrorResult {
  error: string;
}

export interface JsonSuccessResult {
  content: string;
}

export type ApprovalAction = "accept" | "refuse";

export interface ApprovalDecision {
  action: ApprovalAction;
  comment: string;
  approved: boolean;
}

export type TaskStatus = "pending" | "processing" | "completed" | "failed";

export interface ApprovalTask {
  id: string;
  status: TaskStatus;
  traceId: string;
  signSecret: string;
  rawBody: string;
  input: string;
  attempts: number;
  maxAttempts: number;
  nextRunAt: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TaskSummary {
  counts: Record<TaskStatus, number>;
  oldestPendingAgeMs: number | null;
  recentFailures: Array<Pick<ApprovalTask, "id" | "traceId" | "status" | "attempts" | "maxAttempts" | "lastError" | "updatedAt">>;
}

export interface OutboundBotConfig {
  botId: string;
  signSecret: string;
}
