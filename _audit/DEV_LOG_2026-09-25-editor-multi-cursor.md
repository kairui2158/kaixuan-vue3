# 2026-09-25 F5 多光标与虚拟选区

## Scope

在不替换 textarea、不破坏 IME/API 直写/undo 的前提下，落地多选区模型与 Find All 入口。主页编辑器与大纲工作台共享同一套服务。

## Changes

- 新增 `src/services/editorSelectionModel.ts`：
  - `SelectionSet` 以“单主光标 + 虚拟光标集合”表达；
  - textarea 原生 selection 始终只承载 primary，其余光标在 overlay 渲染；
  - 所有 offset 先经过行索引/虚拟化映射，禁止直接依赖 DOM range。
- 接入 `EditorPanel.vue` 与 `OutlineWorkspace.vue`：
  - Find All Occurrences 把全部匹配变成虚拟选区；
  - 多光标插入、删除、换行进入同一 undo 事务；
  - 外部/API 写入时多光标降级为单主光标，并以 `documentVersion` 冲突检测保护。
- runTrace 与 DiagLogger 同步记录多光标创建、编辑、undo、降级事件，满足日志覆盖同步门禁。

## Verification Evidence

- `node scripts/verify-editor-multi-cursor-electron.mjs`
  - `PASS: 10/10 home + 10/10 outline multi-cursor rounds`
  - 断言：Find All 生成 23 个虚拟光标、插入/删除/换行、undo 事务、外部写入降级、trace + diag 覆盖、无 page error。
  - 报告：`_audit/verification-editor-multi-cursor/electron-10-rounds.json`
- 服务测试：`src/services/editorSelectionModel.spec.ts` 14/14 通过。
- 全量回归：106 files / 1070 tests 全绿；type-check、production wiring、build:vue 均通过。

## Remaining Risk

- F5 目前开放的是 Find All、插入、删除、换行与 undo；块选择的“复制后编辑”仍是后续扩展，不应在未验证前直接放开。
- IME 组合期间锁多光标编辑是硬边界，任何新命令都必须保留该锁。
