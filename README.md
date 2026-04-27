# UCAP Bridge

这是一个最小可用的 UCAP bridge 服务，用于接收合思出站消息，立即返回接收成功，再异步调用 UCAP `agent/chat` 判断审批结论，并在 EBot 场景下回调合思外部服务回调审批接口。

## 功能

- `GET /health`
- `GET /healthz`
- `GET /tasks/summary`
- `POST /invoke`
- 支持 UCAP 的 JSON 和 SSE 两种响应
- 支持合思外部服务回调审批 `POST /api/openapi/v1/approval`
- 使用 SQLite 持久化审批任务，服务重启后会继续处理未完成任务
- 从 `config.json` 读取配置
- 自动化测试覆盖配置、提取、SSE、JSON 和错误场景

## 配置

先复制示例配置：

```bash
cp config.example.json config.json
```

然后编辑 `config.json`，至少需要这些字段：

- `listenPort`
- `ucapBaseUrl`
- `apiKey`
- `agentId`
- `signSecret`
- `ekuaibaoBaseUrl`
- `ekuaibaoAppKey`
- `ekuaibaoAppSecurity`
- `requestTimeoutMs`
- `taskDbPath`
- `taskMaxAttempts`
- `taskRetryDelayMs`
- `taskPollIntervalMs`
- `inputField`
- `responseMode`
- `jsonExtractPath`

### 字段说明

- `listenPort`: 本地监听端口
- `ucapBaseUrl`: UCAP 基础地址，例如 `https://ucap.example.com`
- `apiKey`: UCAP 的 `x-api-key`
- `agentId`: UCAP agent id
- `signSecret`: 合思出站消息配置里的签名密钥，回调审批时作为 `signKey`
- `outboundBots`: 多个合思出站 bot 的签名密钥配置；每个 bot 配一个 `botId` 和 `signSecret`
- `ekuaibaoBaseUrl`: 合思 OpenAPI 地址，默认可用 `https://app.ekuaibao.com`
- `ekuaibaoAppKey`: 合思开放接口接入账号，用于获取 `accessToken`
- `ekuaibaoAppSecurity`: 合思开放接口接入密码，用于获取 `accessToken`
- `requireSignature`: 是否校验调用本服务的入站签名；联调合思出站消息时可先设为 `false`
- `requestTimeoutMs`: 上游请求超时时间
- `taskDbPath`: 审批任务 SQLite 文件路径，默认 `data/bridge.sqlite`
- `taskMaxAttempts`: 单个任务最大尝试次数
- `taskRetryDelayMs`: 任务失败后的重试等待时间
- `taskPollIntervalMs`: 后台 worker 轮询任务间隔
- `inputField`: 调用方请求体里读取输入文本的字段名；设为 `$body` 时会把合思整段出站消息 body 传给 UCAP
- `responseMode`: `auto`、`json` 或 `sse`
- `jsonExtractPath`: JSON 模式下提取最终文本的点路径，例如 `data.answer`
- `ucapParameters`: 传给 UCAP 的 `parameters` 对象，桥接层会自动注入 `userChatInput`
- `ucapVars`: 传给 UCAP 的 `vars` 对象，默认空对象

## 安装

```bash
npm install
```

## 启动

```bash
npm run build
npm start
```

服务启动时会自动读取 `config.json`，如果配置缺失或非法会直接失败退出，并打印明确错误。

## 调试示例

### 健康检查

```bash
curl http://127.0.0.1:3000/health
```

### 队列健康检查

```bash
curl http://127.0.0.1:3000/healthz
```

`/healthz` 会返回任务队列统计。如果存在最终失败的审批任务，HTTP 状态码会变成 `503`，便于接入云监控或 uptime 监控。

### 查看任务概览

```bash
curl http://127.0.0.1:3000/tasks/summary
```

返回内容包含 pending、processing、completed、failed 数量，最早待处理任务等待时间，以及最近失败任务和错误信息。

### 调用桥接接口

```bash
curl -X POST http://127.0.0.1:3000/invoke \
  -H 'Content-Type: application/json' \
  -d '{"flowId":"MK48h7s2yQ6Y00","nodeId":"FLOW:251847192:631543649","action":"","actionName":"","userInfo":{"id":"员工id","name":"张三"}}'
```

如果你把 `inputField` 改成了别的字段名，比如 `query`，那么请求体也要改成对应字段。

### 签名规则

当前服务对入站请求使用最小 HMAC 校验：

- `x-timestamp`：毫秒时间戳
- `x-signature`：`HMAC-SHA256(signSecret, "${x-timestamp}.${rawBody}")` 的十六进制结果

签名失败、缺少请求头或请求过期都会返回 `401`。

联调合思出站消息时，如果合思不能按上述自定义请求头签名，可以先设置：

```json
{
  "requireSignature": false,
  "inputField": "$body"
}
```

### UCAP 请求体

桥接层会发送类似下面的请求体给 UCAP：

```json
{
  "agent_id": "2047207682919788545",
  "input": "你好",
  "parameters": {
    "userChatInput": "你好"
  },
  "vars": {}
}
```

如果你在 `config.json` 里配置了 `ucapVars`，它会原样作为 UCAP 请求体的 `vars` 字段；默认是空对象 `{}`。

### 智能体返回约定

建议让 UCAP 智能体只返回 JSON：

```json
{
  "approved": true,
  "reason": "符合规则"
}
```

不通过时：

```json
{
  "approved": false,
  "reason": "发票异常，建议驳回"
}
```

bridge 会把 `approved=true` 转成合思回调审批接口的 `action=accept`，把 `approved=false` 转成 `action=refuse`，并把 `reason` 作为审批意见 `comment`。

如果智能体没有返回合法 JSON、`approved` 不是 boolean，或 `reason` 为空，bridge 会按审核不通过处理并回调 `action=refuse`，避免格式异常时误通过。

### 多个出站审批

如果在合思里配置多个 EBot/出站审批，每个出站消息会有不同的签名密钥。可以在 `config.json` 配置：

```json
{
  "outboundBots": [
    {
      "botId": "finance-audit",
      "signSecret": "OH31Y6CPYFSP"
    },
    {
      "botId": "travel-audit",
      "signSecret": "another-sign-key"
    }
  ]
}
```

合思出站消息不需要额外传 `botId` 字段。每个出站消息配置不同 URL 即可：

```text
http://43.153.166.170:3000/invoke/finance-audit
http://43.153.166.170:3000/invoke/travel-audit
```

bridge 会用 URL 里的 `finance-audit` 或 `travel-audit` 去匹配 `outboundBots[].botId`，再选择对应的签名密钥回调合思审批接口。

如果只有一个出站审批，也可以继续使用：

```text
http://43.153.166.170:3000/invoke
```

此时 bridge 使用顶层 `signSecret`。

### 合思审批回调

当合思出站消息 body 中包含 `flowId` 和 `nodeId` 时，bridge 会在拿到 UCAP 审核结论后调用：

```text
POST {ekuaibaoBaseUrl}/api/openapi/v1/approval?accessToken={accessToken}
```

调用回调审批前，bridge 会先通过 `POST /api/openapi/v1/auth/getAccessToken` 使用 `ekuaibaoAppKey` 和 `ekuaibaoAppSecurity` 获取 `accessToken`。

请求体包含：

```json
{
  "signKey": "<signSecret>",
  "flowId": "<flowId>",
  "nodeId": "<nodeId>",
  "action": "accept",
  "comment": "符合规则"
}
```

合思回调审批接口返回 HTTP 200 还不够，bridge 会继续检查响应体里的 `value.code`。只有 `value.code` 等于 `"204"` 时才把任务标记为完成；如果是 `"400"`、`"401"`、`"412"` 或 `"500"`，任务会按失败处理并进入重试/失败状态。

`POST /invoke` 会先返回 HTTP 200：

```json
{
  "success": true,
  "accepted": true,
  "traceId": "..."
}
```

这个 200 表示 bridge 已接收合思出站消息。实际审批通过或驳回会在后台通过合思审批回调接口完成。

收到 `/invoke` 后，bridge 会先把任务写入 SQLite，再返回 200。后台 worker 会从 SQLite 中领取任务执行 UCAP 调用和合思审批回调；如果服务重启，未完成任务会在下次启动后继续处理。

生产运行建议至少监控：

- `GET /healthz` 是否返回 200
- `failed` 任务数是否大于 0
- `oldestPendingAgeMs` 是否持续增长
- `pm2 logs ucap-bridge` 中是否有处理失败日志

## 返回格式

成功：

```json
{
  "success": true,
  "accepted": true,
  "traceId": "..."
}
```

失败：

```json
{
  "success": false,
  "error": "错误信息",
  "traceId": "..."
}
```

## 测试

```bash
npm test
```

## 说明

- 本项目只实现最小可用的 bridge 功能
- 不包含页面、数据库、多租户、脚本执行或复杂鉴权
- 上游非 2xx 状态会被映射成桥接层错误
