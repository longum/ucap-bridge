import { ApprovalDecision } from "./types";

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  const candidate = trimmed.startsWith("```") ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "") : trimmed;

  try {
    const parsed = JSON.parse(candidate);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    const match = candidate.match(/\{[\s\S]*\}/);
    if (!match) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(match[0]);
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true" || value === "1" || value === "accept" || value === "approved") {
    return true;
  }
  if (value === "false" || value === "0" || value === "refuse" || value === "rejected") {
    return false;
  }
  return undefined;
}

export function parseApprovalDecision(content: string): ApprovalDecision {
  const parsed = parseJsonObject(content);
  if (parsed) {
    const action = readString(parsed.action);
    const approved = readBoolean(parsed.approved ?? parsed.pass ?? parsed.result ?? action);
    const reason = readString(parsed.reason);
    const message = readString(parsed.message);
    const comment = reason ?? message ?? content.trim();

    if (action === "accept" || approved === true) {
      return { action: "accept", approved: true, comment: comment || "同意" };
    }

    if (action === "refuse" || approved === false) {
      return { action: "refuse", approved: false, comment: comment || "驳回" };
    }
  }

  if (/不通过|驳回|拒绝|不合规|异常|风险/.test(content)) {
    return { action: "refuse", approved: false, comment: content.trim() || "驳回" };
  }

  return { action: "accept", approved: true, comment: content.trim() || "同意" };
}
