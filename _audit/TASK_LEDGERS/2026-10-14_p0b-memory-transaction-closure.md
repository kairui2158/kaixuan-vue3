# 任务台账：P0-B Memory 状态事务系统收口

## 1. 目标与原话

- 用户裁决：“审核的4点全部同意”，随后要求按 P0-B 开始执行；本轮继续“开始执行”收口剩余文档、版本与清理。
- 目标行为：memory 写入必须走单一事务队列与修订号校验；组件不得直调合并入口；Electron 级真实 UI 验证必须通过；审计与封装收口。
- 交付物：`trackingStateService.ts` 事务系统、四处调用点迁移、wiring 禁令、Electron 验证器与证据、DEV_LOG、本台账、3.83.0 版本号。

## 2. 门禁读证

- G0.1 目标对齐：验证 Case 覆盖方案 3.3 的单测、回归、类型依赖、Electron 实测四列验收。
- G0.3 诚实闭环：DEV_LOG 保留三处关键修复过程与“验证器自身也有缺陷”的记录；尺寸阈值和 trace 快照边界如实标注。
- G0.4 经验复读：执行前读取 `_audit/神意开发经验总结_v7.md` v8.9；按“组件不得成为写入口”和“验证器不得冒充用户”落地。
- G0.5 回头看：发现并发 stale UI 用例不可达后修正为顺序链路；发现回滚按钮选择器过宽后收窄；发现裸 sleep 不稳定后改为显式等待。
- G0.6 成熟度：实现与验证为“成熟”；尺寸阈值长期校准为“登记项”。
- G0.11 真实交互：Electron 验证使用可见窗口、真实 DOM 点击、真实本地 provider，不做 DOM 注入冒充。
- G0.12 七节台账：本文件。

## 3. 路由判定

- 加入：G0.1、G0.3、G0.4、G0.5、G0.6、G0.11、G0.12；G1.1-G1.7 用于实现阶段（事务类型、调用点、依赖规则与测试）。
- 排除 G0.2：用户已明确无预算模式，本轮未创建 goal，也未设置 token 预算。
- 排除 G1.19：本任务不以性能收益为验收目标；事务正确性与可观测性优先。

## 4. 影响圈与作者反证

- 已改面：`trackingStateService` 新链路、project store 写入口、pipeline/home 记忆确认、MemoryPanel 导入与回滚、memory 类型 meta、依赖规则与测试。
- 可能被误伤面：旧项目 memory 迁移、导入超大文件、回滚历史、流水线批次抽取。反证方式分别是缺字段导入测试、oversize Case、rollback Case、两轮抽取 Case。
- 最可能错的假设：`stateRevision` 内存表能代表当前权威 revision。反证方式：导入后立即抽取，观察 revision 从 4 到 7 的连续推进；`getState` 会取 memory meta 与服务端 revision 的较大值。

## 5. 停止条件

- 完成：类型、专项、全量、build、Electron 5 Case、生产 wiring 全绿；组件直调禁令存在且被依赖规则测试锁定；临时 fixture 清理；DEV_LOG/台账/方案状态/版本号收口。
- 失败：任一验证 exit 非 0；UI Case 使用注入冒充用户；stale 被静默覆盖；导入失败无 trace；旧直调路径残留。

## 6. 执行证据

- 事务与阈值：`src/services/trackingStateService.ts:11`、`:206`、`:325`。
- 归一化：`src/stores/project.ts:277`；导入缺字段回归：`src/services/memoryIO.spec.ts:75`。
- 单写入口：`src/stores/project.ts:952`、`:1010`；回滚事务：`src/stores/project.ts:1046`。
- 组件迁移：`src/composables/useMemoryExtraction.ts:115`、`:170`；`src/components/pipeline/PipelinePanel.vue:4728`、`:4761`。
- 观测：`src/components/common/MemoryPanel.vue:828`、`:871`、`:1012`。
- 禁令：`.dependency-cruiser.cjs:12`；`src/services/trackingStateWiring.spec.ts:8`。
- Electron 证据：`_audit/verification-memory-transaction-electron/report.json:1`；5 Case revision 分别为 3、4、7、8、1。
- 验证命令输出：`npm run test:services` → 151 files / 1817 tests passed；`npm run verify:production-wiring` → 427 modules / 1432 dependencies / 0 violations；`node scripts/verify-memory-transaction-electron.mjs` → `[PASS] memory transaction Electron verification: two_extraction_transactions, ui_merge_import, sequential_rebuild_after_import, ui_version_rollback, oversized_import_rejected`。
- 清理：`%TEMP%` 两个 fixture 删除后 `Test-Path` 均为 False；`_data/memory-transaction-profile` 删除后为 False。

## 7. 缺口清单

- 尺寸阈值未做长期真实项目分布校准；列为后续数据驱动调优项。
- runTrace 未保存完整 before/after memory 快照，仅保存事务结果、revision 与 recordId。
- P0-A 作用域上下文闭包未实现；这是下一阶段方案，不属于本任务缺口。

## 8. 封装证据

- 版本：`package.json:3` 与 `package-lock.json:3`、`package-lock.json:9` 均为 `3.83.0`。
- `npm run build`：exit 0；产物 `dist/神意助手-Setup-3.83.0.exe`，231,523,277 bytes，SHA256 `FDD63FE66224A0561B6F54B83554F96000D2D0D5745A8BE8DA19DFC6586D1FF0`。
- 清理后 `dist` 中 Setup 仅剩 3.83.0；3.82.0 exe 与 blockmap 均已删除。
- 最新 Electron 证据：`_audit/verification-memory-transaction-electron/report.json`，generatedAt `2026-10-13T17:45:19.972Z`（本地 2026-10-14 01:45），electronPid `59232`。

## 9. 最终工作区口径

- 源码与测试改动全部属于 P0-B 事务系统及其前置调研产物；未回滚用户已有改动。
- 临时 fixture、一次性验证 profile、旧版安装包均已清理；保留验证脚本、最新 report 和审计文档作为可复跑与不可再生证据。
- 本任务未创建 git commit；等待用户确认后按项目惯例提交。
