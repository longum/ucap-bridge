# 项目说明

这是一个最小可用的 UCAP bridge 服务。

目标：
- 从本地配置文件读取 UCAP 的 apiKey、agentId、baseUrl
- 对外暴露一个固定 HTTP 接口 POST /invoke
- 接收调用方传入的 input 文本
- 调用 UCAP 智能体接口
- 兼容 UCAP 返回的两种模式：SSE 和普通 JSON
- 从上游响应中提取最终文本
- 返回统一 JSON 给调用方
- 提供完整自动化测试和 README

## 技术约束

- 使用 Node.js 20 + TypeScript
- HTTP 框架使用 Fastify
- 测试使用 Vitest
- 不引入数据库
- 不引入前端页面
- 不引入 Docker 作为运行前提
- 不做后台管理功能
- 不做脚本执行能力
- 不做多项目、多租户
- 不做鉴权系统，除非为测试提供最小实现
- 依赖保持精简
- 优先使用简单直接、可维护的实现

## 配置要求

必须支持 config.json。
必须提供 config.example.json。
服务启动时校验配置合法性，缺失关键字段时直接失败退出并打印明确错误。

配置字段至少包括：
- listenPort
- ucapBaseUrl
- apiKey
- agentId
- requestTimeoutMs
- inputField
- responseMode
- jsonExtractPath

## 接口要求

对外只提供：
- POST /invoke
- GET /health

POST /invoke 请求体默认格式：
{
  "input": "你好"
}

成功返回：
{
  "success": true,
  "content": "最终文本",
  "traceId": "..."
}

失败返回：
{
  "success": false,
  "error": "错误信息",
  "traceId": "..."
}

## UCAP 调用要求

上游请求地址：
POST {ucapBaseUrl}/mp/openapi/api/v3/agent/chat

请求头：
- Accept: application/json
- Content-Type: application/json
- x-api-key: 从配置读取

请求体：
{
  "agent_id": "<config.agentId>",
  "input": "<调用方传入文本>",
  "vars": {}
}

## SSE 处理要求

如果上游响应 content-type 是 text/event-stream，按 SSE 解析。

处理规则：
- 忽略 quote 事件
- 拼接所有 message 事件的文本内容
- close 事件表示正常结束
- 即使没有 close，只要拼到了 message 内容也可以成功
- 如果完全没有 message 内容，返回错误

message 事件中的文本提取顺序：
1. content
2. text
3. message
4. delta
5. 如果 data 不是 JSON，则直接把原始 data 字符串拼接

## JSON 处理要求

如果上游返回普通 JSON：
- 按 config.jsonExtractPath 提取最终文本
- string 直接返回
- number / boolean 转成 string
- object / array 视为错误
- 路径不存在视为错误

## 工程要求

请保持目录清晰，至少拆分为：
- 配置加载
- 服务启动
- UCAP 客户端
- SSE 解析
- 内容提取
- 类型定义

不要把所有逻辑写进一个文件。

## 测试要求

必须补齐并运行测试：
- 配置加载测试
- JSON 提取测试
- SSE 解析测试
- JSON 模式集成测试
- SSE 模式集成测试
- 错误场景测试

完成前必须执行：
- npm run build
- npm test

## 完成标准

只有同时满足以下条件才算完成：
1. 能本地启动
2. README 写清楚如何配置和运行
3. 所有测试通过
4. 对 JSON 和 SSE 两种上游返回都可用
5. 错误处理清晰
6. 代码结构清楚，不是一次性脚本
