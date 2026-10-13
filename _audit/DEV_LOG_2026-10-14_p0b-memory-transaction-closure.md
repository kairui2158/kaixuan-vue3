# 2026-10-14 P0-B Memory 状态事务系统收口

## 目标

按 [_audit/PROPOSAL_2026-10-13_OH_STORY_ADOPTED_UPGRADE_PLAN.md](_audit/PROPOSAL_2026-10-13_OH_STORY_ADOPTED_UPGRADE_PLAN.md) 落地 P0-B：把 memory 写入从“各调用点合并后整份赋回”改为单一事务队列 + 修订号乐观锁，并完成 Electron 级真实 UI 验证。

## 交付内容

- 新增 [src/services/trackingStateService.ts](../src/services/trackingStateService.ts)：项目级串行事务队列；`stale_state` / `delta_limit_exceeded` / `snapshot_limit_exceeded` 结构化拒绝；`stateRevision`、`lastCommittedChapter`、`lastCommittedAt`、`derivedViewHash` 统一维护。尺寸阈值按本应用语料先采样为 delta 20K/30K、context 6K/8K、snapshot 240K/320K 字符，不照抄上游字节值。
- [src/stores/project.ts](../src/stores/project.ts)：新增 `recordMemoryTransaction` 与 `recordMemoryImport` 单写入口；抽取、导入、覆盖导入、版本回滚、章节回滚全部进入事务队列；`normalizeMemories` 升级为五类记忆条目的字段级归一化，旧导出/手编 JSON 缺字段不再触发 UI 崩溃。
- [src/composables/useMemoryExtraction.ts](../src/composables/useMemoryExtraction.ts)、[src/components/pipeline/PipelinePanel.vue](../src/components/pipeline/PipelinePanel.vue)：抽取预览不再产出可提交 data，只保留 changes 预览和事务草稿；确认时提交事务，stale 时基于当前状态重建草稿，禁止拿旧 draft 直接覆盖。
- [src/components/common/MemoryPanel.vue](../src/components/common/MemoryPanel.vue)：导入、读取、解析、取消、回滚全部落 `infra` runTrace；提交结果统一写 `tracking_commit` 事件，失败不再静默。
- [src/components/editor/EditorPanel.vue](../src/components/editor/EditorPanel.vue)：首页编辑器记忆确认进入 traced 事务链路，拒绝时输出 `tracking_commit` 错误事件。
- 旧路径防复燃：[.dependency-cruiser.cjs](../.dependency-cruiser.cjs) 新增 `ui-no-direct-memory-merger`；[src/services/trackingStateWiring.spec.ts](../src/services/trackingStateWiring.spec.ts) 断言组件层不得出现 `recordMemoryChange(` / `mergeMemory(` / `mergeMemoryChanges(` 直调，导入与回滚必须发 `tracking_commit`。

## 关键修复过程

- 首轮 Electron 验证暴露 `CharacterCard.vue` 崩溃：外部导入实体缺数组字段时 `appearances.join()` 抛错。根因是导入链路只做结构校验，未做字段级归一化；已由 `normalizeMemories` 收口，并新增 `memoryIO.spec.ts` 回归用例。
- 原验证器把 stale 用例写成并发点击，但应用全局模态互斥使该路径在 UI 层不可达。根因是验证方案套用了单测形态；已改为真实可达的“抽取 → 导入 → 再抽取”顺序链路，真并发 stale 拒绝由 `trackingStateService.spec.ts` 覆盖。
- 修复验证器三处自身缺陷：导入后显式等待 `app-confirm` visible；确认按钮等待“消失或内容变化”；回滚按钮选择器收窄到 `.mem-history-actions .btn-secondary:last-child`，避免点错预览按钮。

## 验证

- `npm run type-check`：exit 0。
- `npm run test:services -- memoryIO trackingState`：17 tests passed。
- `npm run build:vue`：exit 0。
- `node scripts/verify-memory-transaction-electron.mjs`：5 Case 全部通过，见 [_audit/verification-memory-transaction-electron/report.json](_audit/verification-memory-transaction-electron/report.json)。
  - `two_extraction_transactions`：revision 3，两次抽取保留唯一实体。
  - `ui_merge_import`：revision 4，`tracking_commit` 成功且 recordId 与最新历史一致。
  - `sequential_rebuild_after_import`：revision 7，抽取/导入/抽取链路连续推进。
  - `ui_version_rollback`：revision 8，回滚进入事务队列并被审计。
  - `oversized_import_rejected`：revision 保持 1，`snapshot_limit_exceeded`，队列仍可继续提交。
- `npm run test:services`：151 files / 1817 tests all passed。
- `npm run verify:production-wiring`：427 modules / 1432 dependencies，0 violations。

Electron 验证是可见窗口 + 真实 DOM 点击 + 真实本地 HTTP provider，不用 DOM 注入冒充用户操作；provider 只替代外部供应商网络，应用链路仍是真实运行。

## 诚实边界

- 尺寸阈值为首版采样值，未做长期用户数据分布校准；后续若真实项目集中触发 `delta_limit_exceeded`，需要先采样再调阈值，不允许直接放宽。
- `runTrace` 目前记录事务结果与 revision，未记录完整 before/after 快照；完整快照会显著扩大 trace 体积，暂由项目内 history 审计承担。
- 本阶段只覆盖 memory 写入事务，P0-A 作用域上下文闭包尚未实现。

## 清理

- 已删除 `%TEMP%\shenyi-memory-import-valid.json` 与 `%TEMP%\shenyi-memory-import-oversize.json`。
- 已删除 `_data/memory-transaction-profile` 一次性验证 profile。
- 保留 `scripts/verify-memory-transaction-electron.mjs` 与 `report.json`：前者是可复跑的交付验证器，后者是不可再生的最终通过证据。

## 台账

- 七节台账：[_audit/TASK_LEDGERS/2026-10-14_p0b-memory-transaction-closure.md](_audit/TASK_LEDGERS/2026-10-14_p0b-memory-transaction-closure.md)

## 封装

- 版本：`package.json` 与 `package-lock.json` 均为 3.83.0。
- `npm run build`：exit 0，NSIS 产物 `dist/神意助手-Setup-3.83.0.exe`，231,523,277 bytes，SHA256 `FDD63FE66224A0561B6F54B83554F96000D2D0D5745A8BE8DA19DFC6586D1FF0`。
- 已清理 3.82.0 旧安装包与 blockmap，`dist` 仅保留 3.83.0 安装包、blockmap、builder 元数据、`latest.yml` 与 `win-unpacked`。
