# 2026-10-08 Active Plan Continuation 与 1M 读取坐标修复

## 范围

- Active plan continuation：T1 建计划后 `needs_user`，T2 保持只读讨论不重建计划，T3 用户确认后复用同一 `planId` 真实写入并收敛 `edit-task-task-finished`。
- 1M Electron 复刻暴露的新缺陷：`editor.read_range` 在标题独占节上返回 `invalid_range`，导致 1M 大纲无法进入批次写入。

## 根因

`editor.read_range` 实际读取区间是 `section.start` 到 `section.end`（标题 + 正文），但 offset 校验使用 `section.charCount`（正文长度，不含标题）。两套坐标并存导致：

- 标题独占节 `charCount=0`，offset 0 被误判越界。
- 尾部分页 offset 大于正文长度但小于完整节区间时，`nextCursor` 继续读取被误拒。

## 修复

- [editorDocumentMap.ts](../src/services/editorDocumentMap.ts) 中 `read_range` 的 cursor 与显式 offset 校验统一改为 `Math.max(0, section.end - section.start)`。
- `outlineStructure.charCount` 语义不变，继续表示正文长度；文档地图与摘要消费方不受影响。
- 测试新增标题独占节可读、节内单一坐标分页两个用例，并把第二页断言校准为完整区间坐标。

## 验证

- TDD：红测 `1 failed | 13 passed` → 修复后 `14 passed`。
- 回归：`npm run test:services` → 133 files / 1562 tests 全绿。
- 类型：`npm run type-check` 通过。
- 构建：`npm run build:vue` 通过；仅既有登记 warning。
- Electron 真实 UI：`node scripts/verify-api-direct-write-electron.mjs` 全量 PASSED，含 1M 场景 `13-outline-million-document-edit-task.png`；整篇替换负路径仍被 `document_too_large_for_whole_replacement` 阻断，写入门禁未放宽。

## 收尾边界

- 版本保持 3.77.0，未封装。
- 台账：[_audit/TASK_LEDGERS/2026-10-08_active-plan-continuation.md](_audit/TASK_LEDGERS/2026-10-08_active-plan-continuation.md)。
