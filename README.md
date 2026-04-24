# UCAP Bridge

这是一个最小可用的 UCAP bridge 服务，用于把本地调用统一转发到 UCAP `agent/chat` 接口，并把上游响应整理成统一的 JSON 返回。

## 功能

- `GET /health`
- `POST /invoke`
- 支持 UCAP 的 JSON 和 SSE 两种响应
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
- `requestTimeoutMs`
- `inputField`
- `responseMode`
- `jsonExtractPath`

### 字段说明

- `listenPort`: 本地监听端口
- `ucapBaseUrl`: UCAP 基础地址，例如 `https://ucap.example.com`
- `apiKey`: UCAP 的 `x-api-key`
- `agentId`: UCAP agent id
- `signSecret`: 合思调用本服务时使用的签名密钥
- `requestTimeoutMs`: 上游请求超时时间
- `inputField`: 调用方请求体里读取输入文本的字段名，默认示例是 `input`
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
ts=$(node -e 'process.stdout.write(String(Date.now()))')
sig=$(node -e 'const crypto=require("node:crypto"); const ts=process.argv[1]; const body=process.argv[2]; const secret=process.argv[3]; process.stdout.write(crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex"))' "$ts" '{"input":"你好"}' '<signSecret>')
curl -X POST http://127.0.0.1:3000/invoke \
  -H 'Content-Type: application/json' \
  -H "x-timestamp: $ts" \
  -H "x-signature: $sig" \
  -d '{"input":"你好"}'
```

如果你把 `inputField` 改成了别的字段名，比如 `query`，那么请求体也要改成对应字段。

### 签名规则

当前服务对入站请求使用最小 HMAC 校验：

- `x-timestamp`：毫秒时间戳
- `x-signature`：`HMAC-SHA256(signSecret, "${x-timestamp}.${rawBody}")` 的十六进制结果

签名失败、缺少请求头或请求过期都会返回 `401`。

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
