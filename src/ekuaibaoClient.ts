import { BridgeConfig } from "./types";

const APPROVAL_PATH = "/api/openapi/v1/approval";
const ACCESS_TOKEN_PATH = "/api/openapi/v1/auth/getAccessToken";

export interface EkuaibaoApprovalRequest {
  flowId: string;
  nodeId: string;
  action: "accept" | "refuse";
  comment: string;
}

export interface EkuaibaoApprovalResponse {
  status: number;
  bodyText: string;
}

export interface EkuaibaoTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expireTime?: number;
  corporationId?: string;
}

function buildUrl(baseUrl: string, path: string): URL {
  return new URL(path, `${baseUrl}/`);
}

async function getAccessToken(
  config: Pick<BridgeConfig, "ekuaibaoBaseUrl" | "ekuaibaoAppKey" | "ekuaibaoAppSecurity" | "ekuaibaoAccessToken" | "requestTimeoutMs">,
  fetchImpl: typeof fetch
): Promise<string> {
  if (config.ekuaibaoAccessToken) {
    return config.ekuaibaoAccessToken;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetchImpl(buildUrl(config.ekuaibaoBaseUrl, ACCESS_TOKEN_PATH).toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appKey: config.ekuaibaoAppKey,
        appSecurity: config.ekuaibaoAppSecurity,
      }),
      signal: controller.signal,
    });

    const bodyText = await response.text();
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`获取合思 accessToken 失败: HTTP ${response.status} ${bodyText}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      throw new Error("获取合思 accessToken 失败: 响应不是合法 JSON");
    }

    const value = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>).value : undefined;
    const accessToken = typeof value === "object" && value !== null ? (value as Record<string, unknown>).accessToken : undefined;
    if (typeof accessToken !== "string" || accessToken.trim().length === 0) {
      throw new Error("获取合思 accessToken 失败: 响应缺少 value.accessToken");
    }

    return accessToken;
  } finally {
    clearTimeout(timeout);
  }
}

export async function callbackApproval(
  config: Pick<
    BridgeConfig,
    "ekuaibaoBaseUrl" | "ekuaibaoAppKey" | "ekuaibaoAppSecurity" | "ekuaibaoAccessToken" | "signSecret" | "requestTimeoutMs"
  >,
  request: EkuaibaoApprovalRequest,
  fetchImpl: typeof fetch = fetch
): Promise<EkuaibaoApprovalResponse> {
  const accessToken = await getAccessToken(config, fetchImpl);
  const url = buildUrl(config.ekuaibaoBaseUrl, APPROVAL_PATH);
  url.searchParams.set("accessToken", accessToken);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetchImpl(url.toString(), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        signKey: config.signSecret,
        flowId: request.flowId,
        nodeId: request.nodeId,
        action: request.action,
        comment: request.comment,
      }),
      signal: controller.signal,
    });

    return {
      status: response.status,
      bodyText: await response.text(),
    };
  } finally {
    clearTimeout(timeout);
  }
}
