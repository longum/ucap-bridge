import { describe, expect, it } from "vitest";
import { parseApprovalDecision } from "../src/approval";

describe("approval decision", () => {
  it("parses accept JSON", () => {
    expect(parseApprovalDecision('{"approved":true,"reason":"符合规则"}')).toEqual({
      action: "accept",
      approved: true,
      comment: "符合规则",
    });
  });

  it("parses refuse JSON", () => {
    expect(parseApprovalDecision('{"approved":false,"reason":"发票异常"}')).toEqual({
      action: "refuse",
      approved: false,
      comment: "发票异常",
    });
  });

  it("refuses non-JSON model output", () => {
    expect(parseApprovalDecision("审核通过")).toEqual({
      action: "refuse",
      approved: false,
      comment: "智能体返回格式不合法：必须返回 JSON 对象，且包含 boolean 类型的 approved 字段",
    });
  });

  it("refuses when approved is not a boolean", () => {
    expect(parseApprovalDecision('{"approved":"true","reason":"符合规则"}')).toEqual({
      action: "refuse",
      approved: false,
      comment: "智能体返回格式不合法：approved 必须是 boolean 类型",
    });
  });

  it("refuses when reason is empty", () => {
    expect(parseApprovalDecision('{"approved":true,"reason":""}')).toEqual({
      action: "refuse",
      approved: false,
      comment: "智能体返回格式不合法：reason 不能为空",
    });
  });
});
