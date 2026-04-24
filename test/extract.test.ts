import { describe, expect, it } from "vitest";
import { extractBridgeContent, getValueByPath } from "../src/extract";
import { parseSseEvents } from "../src/sseParser";

describe("extract", () => {
  it("reads values by dot and array path", () => {
    const data = {
      data: {
        answer: [
          {
            text: "hello",
          },
        ],
      },
    };

    expect(getValueByPath(data, "data.answer[0].text")).toBe("hello");
  });

  it("extracts string from JSON path", () => {
    const result = extractBridgeContent(
      {
        status: 200,
        contentType: "application/json",
        bodyText: JSON.stringify({ data: { answer: "final text" } }),
      },
      {
        responseMode: "auto",
        jsonExtractPath: "data.answer",
      }
    );

    expect("content" in result ? result.content : "").toBe("final text");
  });

  it("converts numeric JSON values to string", () => {
    const result = extractBridgeContent(
      {
        status: 200,
        contentType: "application/json",
        bodyText: JSON.stringify({ data: { answer: 42 } }),
      },
      {
        responseMode: "auto",
        jsonExtractPath: "data.answer",
      }
    );

    expect("content" in result ? result.content : "").toBe("42");
  });

  it("parses SSE events", () => {
    const events = parseSseEvents([
      "event: quote",
      "data: skip",
      "",
      "event: message",
      'data: {"content":"a"}',
      "",
      "event: close",
      "data: done",
      "",
    ].join("\n"));

    expect(events).toEqual([
      { event: "quote", data: "skip" },
      { event: "message", data: '{"content":"a"}' },
      { event: "close", data: "done" },
    ]);
  });

  it("returns clear SSE error text", () => {
    const result = extractBridgeContent(
      {
        status: 200,
        contentType: "text/event-stream",
        bodyText: [
          "event:error",
          'data:{"code":400,"message":"缺少必要参数","success":false}',
          "",
          "event:close",
          'data:{"code":200,"message":"处理完毕","success":true}',
          "",
        ].join("\n"),
      },
      {
        responseMode: "auto",
        jsonExtractPath: "data.answer",
      }
    );

    expect(result).toEqual({
      error: expect.stringContaining("缺少必要参数"),
    });
  });

  it("extracts UCAP nested result.content from SSE messages", () => {
    const result = extractBridgeContent(
      {
        status: 200,
        contentType: "text/event-stream",
        bodyText: [
          'event:message',
          'data:{"code":200,"message":"处理成功","result":{"agentType":"flow","content":"你好","context":"","moduleId":"xYZJEDRCGbkU","type":"text"},"success":true}',
          '',
          'event:message',
          'data:{"code":200,"message":"处理成功","result":{"agentType":"flow","content":"呀","context":"","moduleId":"xYZJEDRCGbkU","type":"text"},"success":true}',
          '',
          'event:close',
          'data:{"code":200,"message":"处理完毕","result":{"agentType":"flow","content":"","context":"","moduleId":"","type":"text"},"success":true}',
          '',
        ].join('\n'),
      },
      {
        responseMode: "auto",
        jsonExtractPath: "data.answer",
      }
    );

    expect(result).toEqual({
      content: "你好呀",
      mode: "sse",
    });
  });
});
