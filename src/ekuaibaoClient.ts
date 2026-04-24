import { BridgeConfig } from "./types";

const APPROVAL_PATH = "/api/openapi/v1/approval";

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

export async function callbackApproval(
  config: Pick<BridgeConfig, "ekuaibaoBaseUrl" | "ekuaibaoAccessToken" | "signSecret" | "requestTimeoutMs">,
  request: EkuaibaoApprovalRequest,
  fetchImpl: typeof fetch = fetch
): Promise<EkuaibaoApprovalResponse> {
  if (!config.ekuaibaoAccessToken) {
    throw new Error("ekuaibaoAccessToken 缺失，无法回调合思审批接口");
  }

  const url = new URL(APPROVAL_PATH, `${config.ekuaibaoBaseUrl}/`);
  url.searchParams.set("accessToken", config.ekuaibaoAccessToken);

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
