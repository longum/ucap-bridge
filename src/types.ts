export type ResponseMode = "auto" | "json" | "sse";

export interface BridgeConfig {
  listenPort: number;
  ucapBaseUrl: string;
  apiKey: string;
  agentId: string;
  signSecret: string;
  ekuaibaoBaseUrl: string;
  ekuaibaoAppKey: string;
  ekuaibaoAppSecurity: string;
  ekuaibaoAccessToken?: string;
  requireSignature: boolean;
  requestTimeoutMs: number;
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
  ekuaibaoBaseUrl?: unknown;
  ekuaibaoAppKey?: unknown;
  ekuaibaoAppSecurity?: unknown;
  ekuaibaoAccessToken?: unknown;
  requireSignature?: unknown;
  requestTimeoutMs?: unknown;
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
