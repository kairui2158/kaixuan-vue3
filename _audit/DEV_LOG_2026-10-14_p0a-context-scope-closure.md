# 2026-10-14 P0-A 作用域上下文闭包收口

## 目标

按 [_audit/PROPOSAL_2026-10-13_OH_STORY_ADOPTED_UPGRADE_PLAN.md](_audit/PROPOSAL_2026-10-13_OH_STORY_ADOPTED_UPGRADE_PLAN.md) 落地 P0-A：正文层从“携带全书/全卷原文”改为“按当前单元闭包供给”，失败路径结构化、可观测、不静默降级。

## 交付内容

- 新增 [src/services/outlineContextScope.ts](../src/services/outlineContextScope.ts)：解析 `> 作用域：卷级常任 / 单元级 {unitId}` 段位契约；输出卷级常任 + 当前单元 + 当前章情绪弧线切片；12K target / 24K max 字节预算，超出时按整段落入 `trimmed`，不截半段；旧卷纲缺段位时只允许“卷概要 + 当前章细纲”显式降级，并标记 `legacy_outline_no_scope`。
- [src/services/chapterExecutionPackage.ts](../src/services/chapterExecutionPackage.ts)：执行包升级 v2，携带 `contextScope` 元数据；`buildChapterExecutionPrompt` 在闭包为空时直接抛错，禁止回退全书大纲。
- [src/components/pipeline/PipelinePanel.vue](../src/components/pipeline/PipelinePanel.vue)：正文层构建闭包并写入 `context_scope` trace 事件；闭包校验失败进入 failed 终态；记忆检索写入 `memory_context` trace 事件，暴露 priority、charCount 与被裁类别。
- [src/services/memoryRetriever.ts](../src/services/memoryRetriever.ts)：记忆上下文分当前章证据、当前单元因果、全局常任三档固定优先级；预算裁剪记录 `trimmed`，不再静默丢段落。
- 新增 [scripts/verify-outline-context-scope-electron.mjs](../scripts/verify-outline-context-scope-electron.mjs)：可见 Electron + Playwright CDP + 本地 OpenAI-compatible provider，覆盖正例、legacy 降级、缺失单元负向三 Case。

## 关键修复过程

- 第一轮失败暴露验证器导出断言错误：IPC 实际返回 `{ success, path, ... }`，脚本误读 `directory`；已按 `electron/ipc/runTrace.js` 真实返回值修正。
- 第二个真实根因是 mock provider 返回普通 JSON，但产品 `generate` 默认 `stream:true`，流式解析器只消费 SSE delta，导致正文为空。验证器已改为按请求体 `stream` 字段返回 SSE 或 JSON，模拟真实默认协议。
- SSE 打通后暴露产品质量门禁拦截：25 字测试正文低于 1800 字下限。测试样本扩到 2000 字，保持同一句语义，只消除验证样本缺陷。
- 回头看补漏：记忆上下文裁剪原本只存在于返回值中，runTrace 不可见；新增 `memory_context` 事件，并把检索与拼装拆成两个可复用函数。

## 验证

- `npm run type-check`：exit 0。
- `npm run test:services -- outlineContextScope memoryRetriever chapterExecutionPackage chapterContextScopeWiring`：4 files / 25 tests passed。
- `npm run test:services`：154 files / 1837 tests passed。
- `npm run build:vue`：exit 0。
- `node scripts/verify-outline-context-scope-electron.mjs`：`===== OUTLINE CONTEXT SCOPE ELECTRON PASSED =====`，证据见 [_audit/verification-outline-context-scope-electron/report.json](_audit/verification-outline-context-scope-electron/report.json)。
  - `unit_closure_real_ui`：success；`context_scope.mode=unit_closure`，unitId `D1-03`，closureBytes 319，无关单元 D1-04 未进入 prompt。
  - `legacy_outline_records_explicit_fallback`：success；`degradedReason=legacy_outline_no_scope`，闭包为卷概要 + 当前章细纲。
  - `scoped_missing_unit_fails_without_silent_fallback`：failed；结构化错误 `unit_not_found:找不到单元 D1-03，不静默降级`。
- 正例导出 trace 包含 `memory_context` 事件：`chapterId=chapter-context-12`、`unitId=D1-03`、`charCount=0`、`trimmed=[]`。

Electron 验证使用可见窗口、真实 DOM 操作和本地 SSE provider；provider 只替代外部网络，应用内构建闭包、调用、解析、验收、落盘、导出 trace 全部真实运行。

## 诚实边界

- 本轮未接外部 live 供应商；真实 live 对账应在流水线 before/after 账本中执行。
- 章节 `unitId` 仍存在剧情文本正则推断路径，最终应由卷纲/章节生成层显式写入。
- 12K/24K 闭包预算是首版采样值，需要真实项目分布继续校准。

## 清理

- 已删除一次性 `_data/outline-context-scope-profile`。
- 保留验证脚本、`report.json`、三份导出 trace、截图、provider 请求与 heartbeat 作为可复跑与不可再生证据。

## 台账

- 七节台账：[_audit/TASK_LEDGERS/2026-10-14_p0a-context-scope-closure.md](_audit/TASK_LEDGERS/2026-10-14_p0a-context-scope-closure.md)

## 封装

- 版本：3.84.0。
- `npm run build`：exit 0；NSIS 产物 `dist/神意助手-Setup-3.84.0.exe`，231,526,544 bytes，SHA256 `9F1353A9EB0697B5223FA8F9E75F1F8E2DC0BD2A8FDABBCC44AECDE629DB2AE9`。
- 已清理 3.83.0 旧安装包与 blockmap，`dist` 仅保留 3.84.0 当前产物。
