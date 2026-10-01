# 2026-09-25 F3 API 写入后的行内 Diff 视图

## Scope

把 API 直写批次从“只能整体撤销”升级为“逐处可见、可跳转、可单命令回滚”的行内 Diff 层。覆盖主页编辑器与大纲工作台两个入口，并保持 EditTask checkpoint 的文档版本校验。

## Changes

- 新增 `src/services/editorDiffHunks.ts`：
  - `buildEditHunks()` 以 batch plan 为单位生成 before/after/context hunk；
  - `rebaseHunksAfterReject()` 在单命令回滚后重放剩余命令并重算 hunk 位置，显式返回 `rebaseEvents`；
  - 不复用旧 range，避免拒绝/回滚后位置漂移。
- 新增 `src/components/editor/EditorDiffLayer.vue`：
  - added/removed 两套视觉状态；
  - hunk 列表与编辑器位置双向跳转；
  - 支持单 hunk 回滚与整批回滚。
- 接入 `EditorPanel.vue`、`OutlineWorkspace.vue`、`ChatPanel.vue`、`ChatMessage.vue`：
  - 单命令回滚通过原始 batch plan 重放 accepted 命令；
  - 用户手动编辑导致 `documentVersion` 变化后，旧 hunk 进入 stale/locked 状态，禁止单命令回滚；
  - runTrace/DiagLogger 记录 `hunkCount`、`rejectedIndexes`、`rebaseEvents`。

## Verification Evidence

- `node scripts/verify-editor-diff-electron.mjs`
  - `PASS: 10/10 main + 10/10 outline diff rounds`
  - 断言：行内层渲染、单 hunk 回滚/rebase、跳转、整批回滚、stale 锁定、trace + diag 覆盖、无 page error。
  - 报告：`_audit/verification-editor-diff/electron-10-rounds.json`
- 服务测试：`src/services/editorDiffHunks.spec.ts` 覆盖 hunk 构建、拒绝后 rebase、事件记录。
- 全量回归（2026-09-25 本轮收口时执行）：
  - `npm run test:services`：106 files / 1070 tests 全绿；
  - `npm run type-check`：通过；
  - `npm run verify:production-wiring`：349 modules / 1139 deps 无违规；
  - `npm run build:vue`：双构建通过，仅既有 chunk-size 与 Vite config warning。

## Remaining Risk

- 主页入口的 harness 中 trace 由组件自有事件覆盖，DiagLogger 作为外部观察者记录；若后续调整 chat 侧 trace 聚合，需要保留这两个观察点。
- 回滚安全依赖 checkpoint 的 `documentVersion + contentHash`，任何绕过该校验的新入口都必须显式登记为例外。
