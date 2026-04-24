# UCAP Bridge

这是一个最小可用的 UCAP bridge 服务，用于接收合思出站消息，调用 UCAP `agent/chat` 判断审批结论，并在 EBot 场景下回调合思外部服务回调审批接口。

## 功能

- `GET /health`
- `POST /invoke`
- 支持 UCAP 的 JSON 和 SSE 两种响应
- 支持合思外部服务回调审批 `POST /api/openapi/v1/approval`
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
- `ekuaibaoAccessToken`
- `requestTimeoutMs`
- `inputField`
- `responseMode`
- `jsonExtractPath`

### 字段说明

- `listenPort`: 本地监听端口
- `ucapBaseUrl`: UCAP 基础地址，例如 `https://ucap.example.com`
- `apiKey`: UCAP 的 `x-api-key`
- `agentId`: UCAP agent id
- `signSecret`: 合思出站消息配置里的签名密钥，回调审批时作为 `signKey`
- `ekuaibaoBaseUrl`: 合思 OpenAPI 地址，默认可用 `https://app.ekuaibao.com`
- `ekuaibaoAccessToken`: 调用合思 OpenAPI 的 `accessToken`
- `requireSignature`: 是否校验调用本服务的入站签名；联调合思出站消息时可先设为 `false`
- `requestTimeoutMs`: 上游请求超时时间
- `inputField`: 调用方请求体里读取输入文本的字段名；设为 `$body` 时会把合思整段出站消息 body 传给 UCAP
- `responseMode`: `auto`、`json` 或 `sse`
- `jsonExtractPath`: JSON 模式下提取最终文本的点路径，例如 `data.answer`
- `ucapParameters`: 传给 UCAP 的 `parameters` 对象，桥接层会自动注入 `userChatInput`
- `ucapVars`: 传给 UCAP 的 `vars` 对象

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

如果你在 `config.json` 里配置了 `ucapVars`，它会原样合并到 `vars` 字段里。

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

### 合思审批回调

当合思出站消息 body 中包含 `flowId` 和 `nodeId` 时，bridge 会在拿到 UCAP 审核结论后调用：

```text
POST {ekuaibaoBaseUrl}/api/openapi/v1/approval?accessToken={ekuaibaoAccessToken}
```

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

## 返回格式

成功：

```json
{
  "success": true,
  "content": "最终文本",
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
