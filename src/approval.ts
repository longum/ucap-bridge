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
  return undefined;
}

export function parseApprovalDecision(content: string): ApprovalDecision {
  const parsed = parseJsonObject(content);
  if (!parsed) {
    return {
      action: "refuse",
      approved: false,
      comment: "智能体返回格式不合法：必须返回 JSON 对象，且包含 boolean 类型的 approved 字段",
    };
  }

  const approved = readBoolean(parsed.approved);
  if (approved === undefined) {
    return {
      action: "refuse",
      approved: false,
      comment: "智能体返回格式不合法：approved 必须是 boolean 类型",
    };
  }

  const reason = readString(parsed.reason);
  if (!reason) {
    return {
      action: "refuse",
      approved: false,
      comment: "智能体返回格式不合法：reason 不能为空",
    };
  }

  return {
    action: approved ? "accept" : "refuse",
    approved,
    comment: reason,
  };
}
