import { BridgeConfig, UcapUpstreamResponse } from "./types";

const UCAP_CHAT_PATH = "/mp/openapi/api/v3/agent/chat";

export interface UcapClientOptions {
  fetchImpl?: typeof fetch;
}

function buildChatUrl(baseUrl: string): string {
  return new URL(UCAP_CHAT_PATH, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

export async function invokeUcapChat(
  config: BridgeConfig,
  input: string,
  options: UcapClientOptions = {}
): Promise<UcapUpstreamResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetchImpl(buildChatUrl(config.ucapBaseUrl), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
      },
      body: JSON.stringify({
        agent_id: config.agentId,
        input,
        parameters: {
          ...config.ucapParameters,
          userChatInput: input,
        },
        vars: config.ucapVars,
      }),
      signal: controller.signal,
    });

    const bodyText = await response.text();
    return {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      bodyText,
    };
  } finally {
    clearTimeout(timeout);
  }
}
