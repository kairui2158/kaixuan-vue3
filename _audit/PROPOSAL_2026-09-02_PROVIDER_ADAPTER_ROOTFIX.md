# 供应商接口连接缺陷根治方案

- 日期：2026-09-02
- 状态：待审核，未执行
- 当前版本：3.13.1
- 建议版本：3.14.0，原因是新增供应商协议适配、主进程网络桥和诊断字段，属于功能级改动

## 1. 结论

这不是单一 URL 拼接错误，而是三层问题叠加：

1. **URL 归一化缺陷**：`providerAdapter.buildChatUrl()` 只识别“host”和“host/v1”两种输入。用户如果填完整 endpoint，例如 `https://x.com/v1/chat/completions`，当前会被错误追加成 `/v1/chat/completions/v1/chat/completions`。
2. **协议覆盖缺陷**：当前统一服务层的生成调用实际只按 OpenAI 兼容协议组装 URL、请求头和请求体；Anthropic、Gemini、Azure 等地址格式与鉴权方式不会被正确适配。
3. **网络边界缺陷**：`aiService` 的生成请求在渲染进程直接 `fetch`，会受 Chromium CORS 限制；而 Electron 主进程里的部分测试/取模型实现又使用 Node 网络栈。同一个供应商可能在“测试连接”和“真实生成”中走不同边界，导致客户看到“填了但连不上”。

本方案不改统一 AI 前台的业务语义。所有 AI 调用仍必须从 `aiService.callAi`、`fetchModels`、`testConnection` 进入，只是把底下的 URL 解析、协议适配和实际网络传输补齐。

## 2. 当前事实与证据

| 位置 | 当前行为 | 问题 |
|---|---|---|
| `src/services/providerAdapter.ts:34` | `buildChatUrl()` 只保留已有 `/vN`，否则追加 `/v1/chat/completions` | 不识别完整 `/chat/completions`，会双重拼接 |
| `src/services/providerAdapter.ts:52` | 统一使用 `Authorization: Bearer` | 覆盖不了 Anthropic 的 `x-api-key`、Gemini 的 query key、Azure 的 `api-key` |
| `src/services/aiService.ts:341` | 生成调用用 `buildChatUrl()` + 渲染进程 `fetch` | 主流生成链路受浏览器网络边界影响 |
| `src/services/aiService.ts:526` | 取模型仍按 OpenAI `/models` 组装 | 不支持协议差异，错误文案过浅 |
| `src/services/aiService.ts:587` | 连接测试等于一次取模型 | 只支持聊天不支持 models 的网关会被误判为不可用 |
| `electron/ipc/api.js:6` | 主进程手写 OpenAI `/models` 请求 | 与 `providerAdapter` 规则不一致 |
| `electron/main.js:210` | 主进程手写测试连接请求 | 与统一服务层错误分类、URL 规则不一致 |
| `src/main.ts:57` | 浏览器 mock 也有独立的 `/v1/models` 判断 | 第三套 URL 规则，继续扩大漂移风险 |

用户三条供应商的诊断结论：

1. DeepSeek 官网：链路此前可通；近期失败是 `HTTP 402`，属于余额/额度问题，不是应用连接失败。当前应用只显示“HTTP 402”，没有解析供应商返回的 `error.message`，体验不合格。
2. `tbtk.asia/v1`：外部网络可达；渲染进程聊天请求在 0-2ms 内 `Failed to fetch`。外部 curl 能得到 `401`，说明站点不是宕机，但浏览器网络边界可能因为 CORS/响应头导致状态被吞掉。根因必须用本地受控探针锁死，不能只凭推断。
3. `openapi.cloud-ai.cn/v1`：历史日志有成功记录，当前证据不足，需要在修复后重测。

## 3. 设计原则

1. **唯一 AI 入口不变**：业务层继续只认 `aiService`，不新增第二前台。
2. **网络边界收敛**：Electron 生产环境中的供应商 HTTP 请求必须走主进程网络桥；浏览器开发模式才允许 renderer `fetch` 兜底。
3. **协议显式配置**：优先使用用户选择的供应商类型；仅在用户没有选择时按 OpenAI 兼容兼容旧配置。不做“悄悄猜协议”。
4. **URL 只解析一次**：输入 URL 统一解析为结构化结果，再由协议适配器生成最终 endpoint。
5. **旧配置兼容**：没有 `providerType` 的旧供应商默认 `openai-compatible`，读取不丢字段，保存后写入新字段。
6. **错误必须说人话**：401 是鉴权失败，402 是余额/额度不足，404 是接口路径不匹配，429 是限流，5xx 是供应商侧异常；同时保留供应商原始错误摘要。
7. **禁止假成功**：连接失败、模型获取失败、生成失败都必须落到诊断日志；不得静默回退到另一个供应商。

## 4. 数据模型

`Provider` 新增可选字段：

```ts
export type ProviderType =
  | 'openai-compatible'
  | 'deepseek'
  | 'anthropic'
  | 'gemini'
  | 'azure-openai'

export interface Provider {
  // 既有字段保持不变
  providerType?: ProviderType
  endpointMode?: 'auto' | 'base' | 'full'
  chatPath?: string
  modelsPath?: string
}
```

兼容规则：

1. 旧数据没有 `providerType`：读取时归一为 `openai-compatible`。
2. `endpointMode` 缺省为 `auto`。
3. `chatPath`、`modelsPath` 仅作为高级覆盖字段，为空时由协议适配器决定。
4. 保存时写新字段；删除供应商类型不属于本次范围。
5. API Key 继续走现有加密存储，不得明文写日志。

## 5. URL 解析规范

新增统一解析函数，禁止再在主进程、渲染进程、mock 中各写一套字符串拼接。

### 输入形态

| 用户输入 | 归一结果 |
|---|---|
| `https://api.example.com` | OpenAI 兼容：`https://api.example.com/v1/chat/completions` |
| `https://api.example.com/v1` | OpenAI 兼容：`https://api.example.com/v1/chat/completions` |
| `https://api.example.com/v1/` | 去尾斜杠后同上 |
| `https://api.example.com/v1/chat/completions` | 识别为完整聊天 endpoint，原样使用 |
| `https://api.example.com/v1/models` | 识别为完整模型 endpoint，仅模型获取使用 |
| `https://api.deepseek.com` | DeepSeek：优先 `/chat/completions`，若失败按诊断结果回退 `/v1/chat/completions` |
| `https://api.anthropic.com` | Anthropic：`/v1/messages` |
| `https://generativelanguage.googleapis.com` | Gemini：`/v1beta/models/{model}:generateContent` |
| `https://{resource}.openai.azure.com` | Azure：由 deployment 与 `api-version` 生成 endpoint |

### 判定顺序

1. 显式 `endpointMode === 'full'` 时，用户 URL 必须是完整 endpoint，不再追加路径。
2. 显式 `endpointMode === 'base'` 时，按所选协议的默认路径拼接。
3. `auto` 模式先检测已知 endpoint 后缀：`/chat/completions`、`/messages`、`:generateContent`、`:streamGenerateContent`、`/models`。
4. 检测不到已知后缀时，才按协议默认路径追加。
5. 自定义 `chatPath` / `modelsPath` 优先级最高，但 UI 必须标注“高级覆盖”。
6. URL 解析结果必须返回 `{ ok, url, reason }`，非法 URL 不发请求。

## 6. 协议适配器

新增 `src/services/providerProtocols/` 目录，或等价地在 `providerAdapter.ts` 内拆分注册表。推荐前者，避免文件继续膨胀。

### 6.1 openai-compatible

覆盖 OpenAI、OneAPI、NewAPI、硅基流动、Moonshot、智谱兼容入口等。

1. 聊天：`POST {base}/chat/completions`
2. 模型：`GET {base}/models`
3. 鉴权：`Authorization: Bearer <key>`
4. 请求体：沿用当前 OpenAI 兼容结构。
5. 响应：沿用 `choices[0].message.content` 与 SSE delta。

### 6.2 deepseek

DeepSeek 官方单独列类型，避免和通用 OpenAI 地址混淆。

1. 默认不强制 `/v1`，官方地址使用 `https://api.deepseek.com/chat/completions`。
2. 用户填 `/v1` 时尊重用户输入，不重复追加。
3. 鉴权：Bearer。
4. 响应：OpenAI 兼容。

### 6.3 anthropic

1. 聊天：`POST /v1/messages`
2. 鉴权：`x-api-key: <key>`
3. 必要头：`anthropic-version: 2023-06-01`
4. 请求体转换：`systemPrompt` 转为 `system`；业务 messages 转 `messages`；`max_tokens` 必填。
5. 响应转换：提取 `content[].text`。
6. 流式转换：`content_block_delta.delta.text` 归一为应用内 delta。

### 6.4 gemini

1. 非流式：`POST /v1beta/models/{model}:generateContent?key=<key>`
2. 流式：`POST /v1beta/models/{model}:streamGenerateContent?alt=sse&key=<key>`
3. 请求体转换：`systemInstruction`、`contents[].role/text`。
4. 响应转换：`candidates[0].content.parts[].text`。
5. 模型列表：`GET /v1beta/models?key=<key>`。
6. 日志中必须脱敏 query 里的 key。

### 6.5 azure-openai

1. 聊天：`/openai/deployments/{deployment}/chat/completions?api-version=<version>`
2. 鉴权：`api-key: <key>`
3. `deployment`、`api-version` 作为供应商高级字段保存。
4. 不支持模型列表时，允许用户手动维护模型/deployment 列表。

## 7. 主进程网络桥

这是本方案的关键修复，不只是加几个 URL 判断。

### 7.1 新 IPC 能力

1. `providerNet:request`：非流式请求。
2. `providerNet:stream`：流式请求，返回 `streamId`。
3. `providerNet:streamChunk`：主进程向 renderer 推送 chunk。
4. `providerNet:abort`：renderer 取消时通知主进程中止 fetch。

### 7.2 请求结构

```ts
interface ProviderNetRequest {
  providerId: string
  providerType: ProviderType
  url: string
  headers: Record<string, string>
  body?: unknown
  timeoutMs: number
  signalId?: string
}
```

约束：

1. 主进程只做传输，不做业务 prompt 拼接。
2. 协议 body 仍在 renderer 的 provider protocol adapter 内生成，保证统一服务层仍拥有取消、重试、JSON 修复、日志等横切能力。
3. API Key 只能出现在 headers/query 组装结果中，诊断日志必须脱敏。
4. timeout / canceled / network / http / auth / json 错误分类由主进程返回原始分类素材，`aiService` 统一转成 `AiServiceError`。

### 7.3 浏览器开发模式

`src/main.ts` 的 mock 网络能力必须改为引用同一个 URL 解析器。浏览器里没有主进程时，允许继续使用 renderer `fetch`，但要提示这是浏览器开发模式；不得把这条兜底路径当作 Electron 客户路径的验证证据。

## 8. 连接测试与模型获取

1. `fetchModels()` 继续是模型列表唯一入口。
2. `testConnection()` 不再等价于“models 成功”。
3. 测试策略：
   - 第一层：按协议获取模型列表。
   - 第二层：如果供应商不支持 models 或返回 404/405，测试连接才允许使用最小聊天请求，`max_tokens=1`，并在 UI 说明会消耗极小 token。
   - 第三层：如果模型列表失败但最小聊天成功，返回“连接可用，但模型列表不可用，请手动填写模型”。
4. 生成入口的模型获取失败不得伪装成生成失败以外的错误。
5. Azure 和不支持模型列表的自定义网关必须允许手动维护模型列表。

## 9. 错误解析与诊断日志

新增供应商错误归一化：

| 状态码 | 用户可见文案 |
|---|---|
| 400 | 请求参数或模型不被当前供应商接受 |
| 401 / 403 | API Key 无效、无权限或未授权模型 |
| 402 | 余额不足或额度耗尽 |
| 404 | 接口路径或模型不存在，请检查 URL/协议 |
| 408 / timeout | 供应商响应超时 |
| 429 | 请求过于频繁，已限流 |
| 500 / 502 / 503 / 504 | 供应商服务异常 |

日志字段增加：

```json
{
  "providerId": "string",
  "providerType": "openai-compatible",
  "purpose": "generate",
  "model": "string",
  "finalUrl": "已脱敏完整 URL",
  "transport": "main-process",
  "statusCode": 402,
  "errorKind": "http",
  "durationMs": 123,
  "providerErrorSummary": "Insufficient Balance"
}
```

规则：

1. 记录 finalUrl，但移除 key、token、签名 query。
2. 记录供应商 JSON 的 `error.message`、`message`、`error.type` 等摘要，不记录完整请求体和 API Key。
3. `providerErrorSummary` 最长 500 字符。
4. 模型获取和生成都必须落同一套错误分类。

## 10. 设置页 UI

1. 供应商编辑表单增加“供应商类型”选择器，中文文案：
   - OpenAI 兼容
   - DeepSeek
   - Anthropic
   - Google Gemini
   - Azure OpenAI
2. 地址输入框的 placeholder 按类型变化。
3. 增加一个“高级接口设置”折叠区：
   - 接口地址模式：自动识别 / 基础地址 / 完整接口地址
   - 自定义聊天路径
   - 自定义模型列表路径
   - Azure deployment
   - Azure api-version
4. 供应商卡片显示协议类型徽标，例如“OpenAI 兼容”。
5. 所有新增文案使用中文，不出现 General/Endpoint/API Base 这类未经解释的英文词。
6. 旧供应商打开编辑表单时显示“OpenAI 兼容”，保存后写入新字段。

## 11. 执行阶段

### P0 影响圈冻结与根因探针

1. `rg` 锁定 `providerAdapter`、`aiService`、`provider.ts`、`ApiSettings.vue`、`src/main.ts`、Electron IPC 的全部调用点。
2. 备份源 Electron 数据目录 `_data/wa_providers.json`。
3. 写一个 `.cjs` 三段式探针：
   - 前置快照。
   - 启动三个本地 mock 供应商：CORS 允许、CORS 拒绝、完整 endpoint；分别测试 renderer fetch 与主进程网络桥。
   - finally 恢复供应商配置。
4. 目标结论：
   - 证明完整 endpoint 当前是否双重拼接。
   - 证明“外部可达但浏览器 Failed to fetch”是否由 CORS/网络边界造成。
   - 证明主进程桥可以绕开 Chromium CORS 限制。
5. 产出 `_audit/tmp/provider_adapter_p0_probe.json`。
6. 如果 tbtk 供应商仍无法用真实 Key 复现，明确标记 `UNVERIFIED`，不得推断通过。

### P1 URL 解析器

1. 实现 `parseProviderEndpoint()`、`buildProviderChatUrl()`、`buildProviderModelsUrl()`。
2. `providerAdapter` 改为消费统一解析器。
3. 删除或降级其他散落 URL 拼接逻辑，`electron/ipc/api.js`、`electron/main.js`、`src/main.ts` 必须引用同一规则。
4. 单测覆盖：
   - host
   - host/v1
   - host/v1/
   - host/v2
   - host/v1/chat/completions
   - host/v1/models
   - DeepSeek 无 /v1
   - Anthropic
   - Gemini
   - Azure
   - 非法 URL
5. 验证命令：`npm run test:services`。

### P2 协议适配器注册表

1. 实现五个协议适配器：`openai-compatible`、`deepseek`、`anthropic`、`gemini`、`azure-openai`。
2. 每个适配器负责：URL、headers、请求体、非流式响应、流式 delta、finish_reason、models 解析。
3. `aiService._rawCall()` 只拿归一化请求，不再直接假设 OpenAI。
4. 错误分类和日志字段同步接入。
5. 先只做文本聊天；图片、视频、TTS 只保留 purpose，不实现协议。
6. 验证命令：`npm run test:services`。

### P3 主进程网络桥

1. 实现 `providerNet:request`、`providerNet:stream`、`providerNet:streamChunk`、`providerNet:abort`。
2. Electron 环境下 `aiService` 默认走主进程网络桥。
3. 浏览器 mock 走同一 URL/协议解析器，仅在无主进程时 renderer fetch。
4. 流式保持现有 UI 事件顺序，不新增重复气泡。
5. 取消必须同时中止 renderer 等待和主进程实际请求。
6. 回归取消路径：取消后不得继续写日志成功、不得继续追加正文。

### P4 模型获取与连接测试

1. `fetchModelsForProvider()` 接协议适配器。
2. `testConnectionForProvider()` 实现 models 失败后的最小 chat 降级。
3. UI 显示三种状态：连接成功、连接成功但模型列表不可用、连接失败。
4. 支持手动模型列表。
5. 验证命令：`npm run test:services` + CDP 真实点击“获取模型”“测试连接”。

### P5 错误文案与诊断

1. 解析供应商 JSON 错误体。
2. 402 显示“余额不足或额度耗尽”。
3. 日志加入 `providerType`、`transport`、`finalUrl`、`statusCode`、`providerErrorSummary`。
4. 诊断日志导出后可用脚本确认敏感 key 不存在。
5. 验证命令：`npm run test:services` + 诊断导出检查脚本。

### P6 设置页与迁移

1. 增加供应商类型、地址模式、高级路径字段。
2. 旧配置读取兼容，保存写新字段。
3. 表单校验：非法 URL、Azure 缺 deployment、Gemini 缺 key、Anthropic 地址错误要给出中文提示。
4. 供应商卡片显示协议类型。
5. UI 验证必须覆盖默认宽度、窄宽度、长地址、长模型名、中英混排。

### P7 回归验证

#### 服务层

1. `npm run type-check`
2. `npm run test:services`
3. URL 表格测试全部通过。
4. 五个协议的请求体与响应解析测试通过。

#### 真实 Electron 操作

1. `npm run build:vue`
2. 杀掉旧 Electron 进程。
3. 使用仓库内 `node_modules\electron\dist\electron.exe . --remote-debugging-port=9227` 源应用启动。
4. CDP 脚本完成三段式：
   - 前置：备份 `_data/wa_providers.json`。
   - 操作：新增本地 mock 供应商、测试连接、获取模型、发送流式消息、取消、修改完整 endpoint、保存后重启。
   - finally：恢复配置、清理测试消息和临时文件。
5. 断言：
   - 设置页供应商类型显示正确。
   - 获取模型列表正确。
   - 测试连接状态正确。
   - 流式聊天能收到 chunk。
   - 取消后无继续写入。
   - 重启后配置仍在。
   - 诊断日志包含本次 providerId/providerType/model/durationMs/finalUrl。

#### 真实供应商

1. DeepSeek：如果仍 402，必须显示余额/额度文案，日志有 402。
2. tbtk：如果 Key 有效应能连通；如果 401，必须显示鉴权失败；如果仍失败，日志必须给出 finalUrl 和供应商错误摘要。
3. openapi.cloud-ai.cn：按用户现有配置重测，结果只能通过日志核销，不得预标通过。
4. 真实供应商验证只做最小请求，不做大批量生成。

### P8 收尾交付

1. 更新版本号 `3.13.1 -> 3.14.0`。
2. 更新 `DEV_LOG`：
   - 已验证项。
   - 未验证项。
   - 客户实操入口。
   - 安装包未签名标注。
3. 更新 `_audit/神意开发经验总结_v2.md`：
   - §8 新增：供应商协议必须显式类型化；完整 endpoint 不能二次拼接；Electron 供应商请求必须走主进程网络桥；模型列表和连接测试不是同一语义。
   - §2 新增：CORS 探针必须用本地 mock 控制允许/拒绝边界，不能用外部站点推测。
4. `npm run build`。
5. 生成 `dist/神意助手-Setup-3.14.0.exe`。
6. 清理本轮临时探针；历史 `_audit/tmp` 不做全局清理。
7. 提交并推送，只提交本任务源码、测试、日志、经验文件、版本文件。

## 12. 新旧对比

| 项目 | 现状 | 目标 |
|---|---|---|
| URL 输入 | 只识别 host 和 `/v1` | host、`/vN`、完整 endpoint、协议专属 endpoint 全覆盖 |
| 协议 | 生成链路实际只有 OpenAI 兼容 | OpenAI 兼容、DeepSeek、Anthropic、Gemini、Azure |
| 鉴权 | 统一 Bearer | 按协议选择 Bearer、x-api-key、query key、api-key |
| 网络边界 | 生成走 renderer fetch，部分测试走 Node | Electron 统一走主进程网络桥 |
| 模型获取 | 只认 OpenAI `/models` | 协议适配 + 不支持时手动模型 |
| 连接测试 | models 成功才算连接 | models 失败可用最小 chat 降级 |
| 错误 | 常见只显示 HTTP 状态码 | 中文错误文案 + 供应商错误摘要 |
| 日志 | 基础 provider/model/耗时 | 增加 providerType、transport、finalUrl、statusCode、providerErrorSummary |
| 旧配置 | purpose string/array 兼容 | 继续兼容，并新增 providerType 缺省兼容 |

## 13. 风险与控制

| 风险 | 影响 | 控制 |
|---|---|---|
| 主进程流式桥实现复杂 | 流式卡住、chunk 乱序、取消失效 | IPC 事件带 streamId/sequence；取消双向断言；专门回归 |
| Anthropic/Gemini 响应差异 | 文本、reasoning、usage 解析错误 | 每协议独立 fixture 测试 |
| Azure 字段误填 | 请求路径错误 | 表单必填校验 + 404 中文提示 |
| CORS 根因误判 | 修了 URL 但没修网络边界 | P0 用本地 CORS 允许/拒绝 mock 分离变量 |
| 旧供应商被误改协议 | 已能用的 DeepSeek/OpenAI 入口失效 | 无 `providerType` 默认 OpenAI 兼容；保存前显示当前类型 |
| 诊断日志泄密 | API Key 泄漏到日志/导出 | finalUrl 脱敏、headers 不落盘、导出后脚本扫描 |
| 最小 chat 降级产生费用 | 用户误以为测试免费 | UI 明确说明会消耗极小 token |
| 改动污染设置页 | 引入 UI 回归 | 按 §1 M1-M3 影响圈冻结，apply_patch 逐行改，不整文件复制 |

## 14. 明确不做

1. 不改统一 `aiService` 对业务层的接口语义。
2. 不把 Skill/Agent prompt 拼接迁到主进程。
3. 不实现图片、视频、TTS 供应商协议。
4. 不做自动寻找可用供应商或静默切换。
5. 不把供应商 API Key 写入日志、截图或报告。
6. 不用“服务层测试通过”替代真实 Electron 客户路径验证。

## 15. 验收标准

1. 完整 endpoint 不会被二次拼接。
2. Electron 下真实生成请求走主进程网络桥，诊断日志 `transport === 'main-process'`。
3. 五种供应商类型都能通过本地 mock 完成模型获取、测试连接、非流式聊天、流式聊天。
4. DeepSeek 402 显示余额/额度不足，而不是裸 HTTP 402。
5. tbtk 在 Key 正确时可连通；Key 错误时显示鉴权失败；仍失败时诊断日志能说明 finalUrl 与供应商错误摘要。
6. 原有 OpenAI 兼容供应商无需改动即可继续使用。
7. 旧配置保存后出现新字段，已有 purpose、模型、Key 加密机制不丢失。
8. `type-check`、`test:services`、真实 Electron CDP 三道验证门全部通过。
9. 安装包版本为 3.14.0，交付说明标注未签名。

