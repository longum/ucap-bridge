# 执行计划

## 目标

实现一个最小可用的 UCAP bridge 服务，供合思调用。

## 范围

### 包含
- 本地配置文件读取
- POST /invoke
- GET /health
- 调用 UCAP agent/chat
- 兼容 SSE 和 JSON
- 提取最终文本
- 自动化测试
- README

### 不包含
- 页面
- 数据库
- 后台管理
- 多租户
- 复杂鉴权
- 脚本引擎
- Docker 必需化部署

## 输入输出约定

### 调用方请求
POST /invoke
{
  "input": "你好"
}

### 上游请求
POST {ucapBaseUrl}/mp/openapi/api/v3/agent/chat
Headers:
- Accept: application/json
- Content-Type: application/json
- x-api-key: <apiKey>

Body:
{
  "agent_id": "<agentId>",
  "input": "<input>",
  "vars": {}
}

### 调用方成功返回
{
  "success": true,
  "content": "文本",
  "traceId": "..."
}

### 调用方失败返回
{
  "success": false,
  "error": "错误信息",
  "traceId": "..."
}

## 实现步骤

1. 初始化 Node + TypeScript 项目
2. 建立目录结构
3. 实现配置加载与校验
4. 实现 GET /health
5. 实现 UCAP 客户端
6. 实现 JSON 提取逻辑
7. 实现 SSE 解析与 message 拼接
8. 实现 POST /invoke 主流程
9. 实现错误处理和 traceId
10. 编写 README
11. 编写并跑通全部测试
12. 自查代码并整理

## 关键设计

### 配置
使用 config.json。
如果环境变量存在 CONFIG_PATH，可优先读取该路径。

### JSON 提取
实现一个安全的点路径读取函数，如 data.answer。
不引入重型依赖。

### SSE 解析
实现轻量解析器，按空行分隔事件。
支持 event: 和 data:。
多行 data 需要拼接。

### HTTP
给上游请求加超时控制。
上游非 2xx 时返回 502。

## 验收

- npm run build 成功
- npm test 全部通过
- README 可让非开发者完成本地运行
