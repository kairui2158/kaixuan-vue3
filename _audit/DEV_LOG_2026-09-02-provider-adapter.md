# 供应商协议适配与主进程网络桥交付日志（3.14.0）

- 日期：2026-09-02
- 版本：3.13.1 -> 3.14.0
- 状态：本地闭环完成，待客户实操

## 本次交付

1. 新增供应商协议层 `src/services/providerProtocols.ts`：
   - 支持 OpenAI 兼容、DeepSeek、Anthropic、Google Gemini、Azure OpenAI 五类协议。
   - 统一 URL 解析，完整聊天/模型 endpoint 不再二次拼接。
   - 统一 headers、请求体、响应、流式 delta、模型列表解析。
   - 诊断日志 URL 脱敏，API Key 不进入日志。
2. Electron 主进程网络桥：
   - `electron/ipc/api.js` 新增 `providerNet:request`、`providerNet:stream`、`providerNet:streamChunk`、`providerNet:abort`。
   - `electron/preload.js` 暴露对应桥接 API。
   - Electron 环境中供应商请求走主进程 Node 网络栈，规避 Chromium CORS 边界。
3. `aiService` 接入协议层和主进程网络桥：
   - 非流式请求走 `providerNet:request`。
   - 流式请求走 `providerNet:stream`。
   - 浏览器开发模式保留 renderer `fetch` 兜底。
   - 诊断日志新增 `providerType`、`transport`、`finalUrl`、`statusCode`、`providerErrorSummary`。
4. 设置页供应商类型与高级接口配置：
   - 新增供应商类型选择、地址模式、自定义聊天/模型路径、Azure deployment/api-version。
   - 旧供应商默认归一为 OpenAI 兼容，保存后写入新字段。
5. 连接测试优化：
   - 模型列表接口 404/405 时，使用最小聊天请求降级验证连接。
   - UI 会说明该方式可能消耗极小 token。

## 根因修复记录

### 流式请求双发

- 现象：真实 Electron 探针观察到每次聊天有两次 `POST /chat/completions`。
- 根因：`aiService._rawCall()` 原逻辑在 Electron 且流式时，仍先执行 renderer `fetch` 预请求，然后再调用主进程 `providerNet:stream`。第一次请求只为拿到 Response 对象，但流式解析实际使用主进程桥，造成额外真实网络请求。
- 修复：主进程可用时，非流式只走 `providerNet:request`，流式只走 `providerNet:stream`；renderer `fetch` 仅保留给浏览器开发模式。
- 验证：修复后本地 mock 仅出现 1 次聊天请求，且为流式、Bearer 鉴权、主进程传输。

### 探针异步落盘误判

- 现象：保存后立即读取磁盘，`generateProvider` 为空；重启后又能正确恢复。
- 根因：设置页供应商保存是异步 IPC 写盘，探针读取过早。
- 修复：探针等待生成用途落盘完成，并补充 store 即时状态断言。业务无需修改。

### 探针成功路径跳过恢复

- 现象：断言通过后 `_data/wa_providers.json` 残留探针供应商。
- 根因：脚本在 `try` 内 `process.exit(0)`，跳过 `finally` 恢复。
- 修复：成功路径移除强制退出，恢复配置后写回结果文件，并核验 `restored=true`、无残留探针 ID。

## 验证证据

### 主进程 HTTP 错误丢失重试语义

- 现象：主进程网络桥把 HTTP 错误包装成 `AiServiceError` 后，`callAi` 只识别 renderer `Response` 对象的错误分支。
- 后果：Electron 客户路径的 429 不再进入限流重试，401/403 不再走鉴权终止，日志可能丢失 `statusCode` 与供应商错误摘要。
- 修复：主进程错误保留 `statusCode/providerErrorSummary`；`callAi` 同时识别 `Response` 与已分类 `AiServiceError`，按状态码继续执行 429/502/503 重试、400 自适应和 401/403 终止。
- 验证：新增主进程 401 与 429 两条服务测试，`test:services` 达到 74/74。

| 验证项 | 结果 |
|---|---|
| `npm run type-check` | 通过 |
| `npm run test:services` | 74/74 通过 |
| `npm run build:vue` | 通过，重新生成 `dist-renderer/providerProtocols.cjs` |
| 源 Electron 真实操作 | 16/16 断言通过 |
| 配置恢复 | `restored=true`，`residualProbeIds=[]` |

真实 Electron 探针结果：`_audit/tmp/provider_rootfix_realops_result.json`

已验证断言包括：

- 主进程网络桥存在。
- 获取模型成功，URL 正确推导为 `/v1/models`。
- 连接测试成功。
- 供应商保存与重启恢复成功。
- 生成用途切换后落盘正确。
- 聊天回复成功。
- 恰好一次聊天请求。
- 聊天请求为流式。
- 聊天请求使用 `Authorization: Bearer`。
- 模型请求使用正确地址。
- 诊断日志包含 `providerId/providerType/transport/finalUrl`。
- 探针后配置恢复，无残留。

## 未验证项

1. DeepSeek 真实 402 文案：本轮未使用用户真实 Key 复测。
2. tbtk 与 openapi.cloud-ai.cn：本轮未使用真实 Key 复测。
3. Anthropic、Gemini、Azure 真实供应商：仅服务层 fixture 验证，未做真实外网请求。
4. 安装包客户路径：`3.14.0` 安装包生成后待客户安装实测。

## 客户实操入口

1. 设置页新增/编辑供应商，选择供应商类型。
2. 分别填写基础地址和完整接口地址，点击“获取模型”。
3. 点击“测试连接”。
4. 主页发送一条消息，导出诊断日志，检查 `providerType/transport/finalUrl`。
5. 重启应用，确认供应商配置仍存在。

## 交付说明

- 安装包：`dist/神意助手-Setup-3.14.0.exe`
- 签名状态：未签名。Windows SmartScreen 可能提示未知发布者。
