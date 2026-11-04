# DEV_LOG：正文层 S1 供应商 401 失败诊断

日期：2026-11-03
关联台账：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-03_body-s1-provider-401-diagnosis.md`

## 结论

两次最新安装版正文层失败都停在 S1 首个 folder SKILL 物理请求，主根因是供应商 `chat/completions` 通道返回 HTTP 401：`No enabled CodeBuddy credential is available`。这不是应用请求组装错误，也不是 SKILL 模板或降AI 协同导致的失败。

第一次 run `run-1793714226251-1` 先经历一次 `fetch failed` 网络重试，第二次物理请求返回 401，总耗时 582706ms。第二次 run `run-1793714863152-115` 直接返回 401，总耗时 183964ms。两次均无模型输出，S2/S3 与 SKILL postProcess 未执行。

## 责任拆分

1. 供应商：`chat/completions` 凭据/权限异常。同供应商 `/v1/models` 请求 213ms 成功，说明不是简单的 key 全失效，而是模型列表通道可用、生成通道凭据不可用。
2. 应用：失败判定正确，401/403 被分类为 `auth` 并终止；但 run trace 丢失 `statusCode/providerErrorSummary/finalUrl/transport`，导出记录无法自证根因。
3. SKILL：无责任证据。S1 没有模型输出，后续层未执行。
4. 降AI V6.1：方法论真实注入。两次请求 system 消息均包含 5 条、358 字符的骨架与因果指导包；模型画像因校准未达标按设计冻结，不是失效。

## 证据

- 渲染日志：`statusCode=401`、`providerErrorSummary=No enabled CodeBuddy credential is available`、`finalUrl=https://openapi.cloud-ai.cn/v1/chat/completions`、`transport=main-process`。
- 两次请求 payload SHA-256 相同：`4f2bf19f5a20f3d1893d294de341b49212b78e5fff8466002664d7ee75038136`，对应同章节同输入，不是重复生成缺陷。
- 源码：`electron/ipc/api.js:417-420`、`:486-493` 已返回结构化诊断；`src/services/aiService.ts:3782-3845`、`:4167-4168` 在物理调用事件边界丢弃结构化字段；`src/stores/runTrace.ts:320-381`、`:822-860`、`:1790-1916` 未存储这些字段。

## 最小修复建议

只做观测闭环，不做过度设计：

1. `PhysicalCallEvent` 增加 `statusCode/providerErrorSummary/finalUrl/transport`。
2. `reportPhysical` 从当前错误对象或请求上下文传入结构化诊断。
3. `PhysicalCallInput`、`RunTracePhysicalCall`、`appendPhysicalCall`、导出通道同批扩展。
4. 同步所有 `appendPhysicalCall` 调用面：PipelinePanel、OutlineWorkspace、ChatPanel 等，不只修流水线。
5. 401/403 在 UI 与 trace 中显示明确认证失败，不伪装成网络错误或 SKILL 失败。

不新增 preflight、自动供应商切换或健康系统；这些超出本次目标，且会引入新的状态与并发风险。

## 安装包说明

3.112.0 安装包 `dist/神意助手-Setup-3.112.0.exe` 的 SHA-256 为 `f1dbd221b10a94b97d8d5262945b8b6b0135bfb70b6d4e4a31f144ae2397a5d4`。构建 manifest 指向父提交 `b9499a342c4b` 是因为构建发生在 release commit `a2329f8c` 之前；运行时物理请求中存在 V6.1 方法论，证明安装包实际包含该功能。
