# 2026-09-19 API Direct Write Protocol Maturity - Phase 1

## Scope

执行 `PROPOSAL_2026-09-19_API_DIRECT_WRITE_PROTOCOL_MATURITY_V1.md` Phase 1：协议单源、严格校验、协议版本接线和验证门禁。

## Changes

1. 协议单源收敛到 `src/services/editorEditSemantics.ts`：
   - `EDITOR_EDIT_PROTOCOL_VERSION = 1`
   - operation / position / 别名映射只有这一处定义
   - `OutlineWorkspace.vue` 的第三套 `OutlineEditOperation` / `OutlineEditCommand` 死代码删除
   - 生产代码中的 `insert_after` / `replace_section` / `rewrite_section` 仅剩共享别名迁移入口
2. `.dependency-cruiser.cjs` 新增 `ui-no-direct-editor-semantics`：
   - UI 组件禁止直接 import `editorEditSemantics.ts`
   - 语义必须经 `editorEditProtocol.ts` / `editorTools.ts` 暴露
3. `protocolVersion` 全链路接线：
   - 服务层 6 个触发点：兼容协议 3 处 + native tool loop 3 处
   - `runTrace.ts` 的 tool call 输入、事件与 `appendToolCall`
   - `OutlineWorkspace.vue` / `ChatPanel.vue` 透传
4. 校验补强：
   - `AgentToolDefinition.inputSchema` 支持 `additionalProperties`
   - `editorTools.ts` 命令映射先解析 operation / position，再做位置校验
   - 空值 position 不会绕过 `isEditorEditPositionAllowed`
5. 服务层语义修正：
   - 工具未暴露时返回 `tool_not_found`，不再误报 `permission_denied`
   - `tool_not_found` 分支补写诊断日志，保证 SKILL 调试可见未暴露工具的拒绝
6. E2E 断言成熟化：
   - 讨论意图下强制写入存在两种合法拒绝：`tool_not_found`（工具面未暴露）或 `permission_denied`（工具面暴露但意图拒绝）
   - 两种形态都要求编辑器内容不变、错误可读、诊断可见
   - 未暴露工具时不得伪造 `tool-permission-denied` 事件

## Verification

- `npm run type-check` → exit 0
- `npx vitest run` → 70 files / 671 tests passed
- `npm run verify:production-wiring` → 271 modules / 896 dependencies, no violations
- `npm run build:vue` → success
- `node scripts/verify-api-direct-write-v2-e2e.mjs` → `API DIRECT WRITE V2 E2E PASSED`
  - 14 张真实 Electron UI 截图
  - 导出 trace 包含 write / reveal / presentation 证据
  - 诊断覆盖包含成功写入、拒绝写入、锁定态、重复写入

## Schema Decision

`runTrace.ts` 的 JSON 导出是宽松字段模型，`protocolVersion` 为新增可选字段，旧 v9 数据可读且不破坏导出结构。`schemaVersion` 维持 9，不因新增可选字段升号。

## Lessons

1. 语义修正必须同步审计旧断言：`tool_not_found` 修正后，E2E 里“必须 permission_denied”的旧假设立即失效。修语义时要把验证脚本当生产规格一起对账。
2. 每一个工具拒绝分支都必须进诊断日志。`tool_not_found` 曾只回传给模型，导致用户与 SKILL 调试层看不到失败原因，这类分支以后默认必须写日志。
3. “工具面未暴露”和“意图拒绝”是两种不同失败，trace 不得混淆：前者记录 failed tool call，后者才允许发 `tool-permission-denied`。
