# API 直写 100% 闭环 Phase 5 开发日志（运行时协议防线与观测收口）

日期：2026-09-24  
版本：3.60.0（Phase 8 统一升版）  
关联方案：`_audit/PROPOSAL_2026-09-23_API_DIRECT_WRITE_100_CLOSURE_FINAL.md`

## 背景

Phase 5 的目标是补齐运行时协议防线与意图语料收口。审计发现工具拒绝行为已经存在：未知工具返回 `tool_not_found`，参数校验返回 `invalid_input` / `missing_field` / `unsupported_protocol_version`，写入权限返回 `permission_denied`，范围错误返回 `invalid_range` / `range_too_large` / `section_not_found`。

真正的缺口在观测层：run trace 的工具调用记录缺少 `toolCapability`，错误码只藏在 `result` JSON 内部，无法按拒绝原因检索；`rejected_invalid_protocol` 也没有归一化语义。DiagLogger 虽已有 `toolCapability`，但 run trace 与 DiagLogger 没有统一的拒绝分类字段。

## 修复内容

1. `src/services/aiService.ts`
   - 新增 `classifyToolRejection()` 纯函数，把错误码归一化为 `unknown_tool` / `schema_invalid` / `permission_denied` / `range_invalid` / `invalid_protocol` / `other`。
   - `unsupported_protocol_version` 映射为 `invalid_protocol`，补齐 `rejected_invalid_protocol` 语义。
   - `onToolCall` 事件新增 `toolCapability` 与 `rejectionCategory`。
   - native 工具路径、JSON 兼容路径的所有 `onToolCall` 调用点统一传入新字段。
   - `logToolRequest()` 自动推导拒绝分类，DiagLogger 侧同步携带 `rejectionCategory`。

2. `src/stores/runTrace.ts`
   - `RunTraceToolCall` 与 `ToolCallInput` 新增 `toolCapability` 和 `rejectionCategory`。
   - `appendToolCall()` 新建与重复更新两个分支都落位新字段。
   - `exportRunToText()` 工具调用区块输出 `协议能力：` 与 `拒绝分类：`。

3. 调用组件
   - `src/components/chat/ChatPanel.vue` 与 `src/components/common/OutlineWorkspace.vue` 的工具调用记录函数同步传递新字段，主页和大纲工作台观测口径一致。

4. `src/services/diag.js`
   - `_topLevelKeys` 加入 `rejectionCategory`，诊断面板顶层可直接展示拒绝分类。

本阶段只增强观测，不改变任何工具拒绝行为、权限判断或执行结果。

## 意图语料审计

按语料规格如实统计：

- Gold：`HOLDOUT_REAL_TRACE_SAMPLES` 28 条，其中 train 10 / dev 9 / test 9。目标为 Gold 30 条（v2 已降目标，原 200 条为过时口径），当前未达标，差 2 条。
- Silver：`INTENT_FACTORY_ACCRETION_SAMPLES` 49 条，只用于工厂回归，不进入生产阈值选择。
- Adversarial：37 条。
- Bronze/Negative：18 条，其中 4 条来自社区样本，14 条本地构造。

结论：统计成熟度未达 100%。Gold 语料只能来自真实用户 confirmed 样本，不允许用合成语料伪造达标。此差距登记为后续项，不在本阶段用放宽阈值或合成数据掩盖。

## 验证证据

- `npm run test:services -- --run src/services/aiService.spec.ts src/stores/runTrace.spec.ts`：170/170 通过。
- `npm run test:services`：88 个测试文件、899 条测试全部通过。
- `npm run type-check`：通过。
- `rg` 回头看：`rejectionCategory` 与 `toolCapability` 只有一套生产实现，未发现旧字段并存。

## 遗留项

1. Gold 语料 28/30，等待真实用户 confirmed 样本回流。
2. Phase 6 观测与日志增强、Phase 7 全链路验证、Phase 8 版本封装仍按总方案顺序执行。
