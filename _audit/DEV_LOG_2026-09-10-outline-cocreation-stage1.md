# 2026-09-10 开发日志：大纲工作台长文档共创阶段 1（读取地基）

## 项目功能

大纲工作台长文档共创底座阶段 1：把几十万字大纲的读取从“开头 12,000 字截断”升级为“结构地图 + 当前焦点全文 + 按需局部读取”。

## 用途

- 客户与 API 讨论长大纲时，模型先看全书结构地图，再按卷/章读取需要的局部全文，不再因为截断反复询问或漏看后文。
- 大纲工作台的 `multi_get_state`、`global_search`、`workspace_summary` 从“实际不可用”变为真实可调用。

## 实现内容

- `src/services/outlineStructure.ts`：解析 Markdown 标题与常见中文卷章序号，输出节点树、字符区间、摘要头；编号重复、无标题纯文本降级为段落块索引并标记 `degraded`；索引区间并集完整覆盖原文，无重叠、无缺口。
- `src/services/outlineTools.ts`：新增 `outline.get_structure`、`outline.read_range`、`outline.search`、`outline.get_summary` 四个只读工具；读取超限分页并返回 `nextOffset`，搜索空结果返回引导信息，错误返回结构化对象不抛异常。
- `src/components/common/OutlineWorkspace.vue`：补传 `getAllSnapshots`，注册 `outline.*` 工具组。
- `src/services/conversationContextService.ts`：ContextPack 化，注入事实优先级、大纲结构地图、当前焦点全文；每个上下文块带来源（outline/settings/memory/selection）与版本标记；移除大纲 12,000 字截断假象。

## 验证证据

- `npx vitest run src/services/outlineStructure.spec.ts`：6/6 通过。
- `npx vitest run src/services/outlineTools.spec.ts`：7/7 通过。
- `npx vitest run src/services/conversationContextService.spec.ts`：11/11 通过。
- `npm run type-check` exit 0；`npm run test:services` 20 files / 212 tests 通过；`npm run build:vue` 通过。
- `node scripts/verify-outline-cocreation-stage1.mjs`：14 项 PASS，覆盖 7 个工具 schema、`get_structure -> read_range` 两轮调用、第三卷第五章局部读取与气泡最终输出。
- `node scripts/verify-outline-cocreation-pipeline-smoke.mjs`：全部 PASS，五层生成入口不回归。

## 边界

- 设定、记忆、选中文本仍保留原有安全上限；大纲本体通过结构工具按需读取，不做以省成本为目的的截断。
- 阶段 1 只做读取地基，不涉及写入能力。

## 补账说明

本日志于 2026-09-11 对账补写。当时执行证据已写入方案 checklist 与源 Electron 探针，但未按项目要求生成独立开发日志，导致主索引断档；补账后归档为主索引第 181a 条。
