# 2026-09-11 开发日志：大纲工作台长文档共创阶段 3（审批与体验）

## 项目功能

大纲工作台长文档共创底座阶段 3：让用户看得懂提案、找得到原文、确认状态不混乱。

## 用途

- AI 提出的修改在气泡内以 diff 卡片呈现，可逐条接受/拒绝，点击卡片定位并高亮原文区间。
- pending 批次有会话级生命周期：过期批次不可应用，同一批次重复确认不会翻转状态。
- 供应商不支持原生工具时，UI 明示“兼容模式：定位可靠性较低”，并给出使用结构锚点或更长唯一片段的建议。

## 实现内容

- `src/components/common/DiffModal.vue`：每条命令一张 diff 卡（before/after、命令类型、目标位置、命中方式）；批次卡区域最高 38vh、网格自适应；点击卡片触发定位事件，编辑器滚动并高亮原文区间。
- `src/services/editorBatchRecord.ts`、`src/services/editorEditSession.ts`：pending/applied/expired/rejected/rolled_back 状态机；终态不可变；切换目标、重新生成、关闭面板时旧批次标记 `expired`。
- `src/components/common/OutlineWorkspace.vue`：提案入口、确认状态、兼容模式提示，以及“模型正在读取结构 / 定位 / 提案”的过程状态展示。

## 验证证据

- `npx vitest run src/services/editorBatchRecord.spec.ts src/services/editorEditSession.spec.ts`：2 files / 8 tests 通过。
- `npm run type-check` exit 0；`npm run build:vue` 通过。
- `node scripts/verify-outline-cocreation-stage1.mjs`、`stage2.mjs`、`stage2-skills.mjs` 全 PASS，真实 UI 覆盖从提问到确认的全流程操作。

## 补账说明

本日志于 2026-09-11 对账补写。阶段 3 的 UI 与状态机在阶段 2 收口后同批落地，方案 checklist 已勾选，但未生成独立日志。补账后归档为主索引第 181c 条。
