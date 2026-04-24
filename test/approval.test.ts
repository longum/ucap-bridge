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
});
