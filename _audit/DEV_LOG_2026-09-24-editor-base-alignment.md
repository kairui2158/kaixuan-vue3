# 开发日志：编辑器底座与 API 直写对齐（2026-09-24）

## 目标

执行 `_audit/PROPOSAL_2026-09-24_EDITOR_BASE_AND_DIRECT_WRITE_ALIGNMENT.md`，把主页编辑器与大纲工作台的编辑器底座、上下文注入和撤销语义对齐，并用真实 UI 压测证明 API 直写双入口等价。

## 本轮状态记录

1. 大纲替换已单源化到 `src/services/outlineReplace.ts`：
   - `replaceOutlineCurrent` / `replaceOutlineAll` / `applyOutlineReplacement`。
   - 状态包含 `replaced`、`no-match`、`unchanged`、`invalid-selection`、`locked`。
   - `OutlineWorkspace.vue` 的替换按钮只负责 DOM、锁定门、提交和反馈。
2. 主页撤销已单栈化到 `stores/editor.ts`：
   - API 批次 checkpoint、气泡回滚、编辑器按钮撤销/重做全部使用 `tabUndoStacks / tabRedoStacks`。
   - 已删除 `EditorPanel.vue` 中的本地 `useUndoRedo` 幽灵栈及其全部调用。
   - 已确认无其他生产消费者后，删除 `src/composables/useUndoRedo.ts` 与对应测试，避免新旧撤销语义并存。
3. 主页手动输入语义：
   - `onInput` 只更新当前内容，不把新内容推进撤销栈。
   - 这与既有 `pushUndoState(tabId, currentContent)` 的“当前内容作为回滚目标”语义一致，避免把用户输入后的状态误当作可撤销前态。
4. 双入口等价性压测已加入 `scripts/verify-api-direct-write-electron.mjs`：
   - 主页场景 `dual-entry-outline-equivalence`，大纲场景 `dual-entry-equivalence`；两个场景隔离 mock payload，避免请求混算。
   - 同一 5000 字文档在主页与大纲执行 append、replace_match、move、delete。
   - 断言两边最终内容逐字节一致、操作序列一致、共享 editor 工具面逐轮一致、trace 全部闭合。
   - 大纲入口额外只允许 `outline.get_structure/read_range/search/get_summary` 四个只读工具；这是入口专属能力，不算双入口不等价。
   - 报告输出 `_audit/verification-api-direct-write-electron/dual-entry-equivalence.json`。
5. SKILL 说明文档已同步：
   - `editor.write` 的 operation 列表补回 `move`。
   - 增加 packed coverage、全文/分段读取、非活动 tab `contentVersion: 0` 的语义说明。

## 关键裁决

- `editor-ai-batch-checkpoint` 事件不再需要 EditorPanel 消费：ChatPanel 已在写入前调用 `editorStore.pushAiBatchCheckpoint`，事件只保留为展示层通知。
- `editor-external-change` 事件仍用于同步 textarea 展示，不再参与撤销状态计算。
- settings / 设定库快照中的 `contentVersion: 0` 表示无版本基线，不是失败。

## 最终门禁

按方案 Phase 4 执行：

1. `npm run test:services`
2. `npx vue-tsc --noEmit`
3. `npm run verify:production-wiring`
4. `npm run build:vue`
5. `node scripts/verify-api-direct-write-electron.mjs`

### 已取得的证据

1. `npx vitest run src/services/outlineReplace.spec.ts src/components/editor/EditorPanel.spec.ts src/services/conversationContextService.spec.ts`：35 项通过。
2. `npm run test:services`：926 项全部通过。
3. `npx vue-tsc --noEmit`：通过。
4. `npm run verify:production-wiring`：319 个模块 0 违规。
5. `npm run build:vue`：构建成功（仅既有 chunk 体积 warning，非本轮引入）。
6. `node scripts/verify-api-direct-write-electron.mjs`：输出 `===== API DIRECT WRITE ELECTRON STRESS E2E PASSED =====`，包含双入口、自然口语、长文档、1M 文档、上下文预算、trace 导出全场景。

### 回头看记录

1. 轮 1：发现双入口 E2E 的场景过滤口径写反，且大纲侧 trace 未按本次 4 个 turn 收窄；已修正为按 turnId 圈定。
2. 轮 2：发现“工具面完全一致”断言与 M66 设计冲突；大纲入口设计上多 4 个只读 outline 工具，已改为“共享 editor 工具面等价 + 额外工具白名单只读”。
3. 轮 3：`rg resolveHomeReadCapChars|useUndoRedo|undoRedo src scripts` 无生产残留；`_audit/call-graph.*` 是 9 月 15 日历史审计产物，非生产依赖。

回头看向用户汇报，封装不在本轮方案范围内。
