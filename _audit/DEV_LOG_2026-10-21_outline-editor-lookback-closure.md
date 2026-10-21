# 2026-10-21 大纲编辑器回头看收口

## 交付范围

- direct 写任务预算从通用常量改为真实执行形态派生：读 36、写 12、物理请求 52。
- Agent 编排器、对话运行时与大纲工作台统一消费同一个 live `toolRunBudgetInstance`，删除双预算通道。
- 新增 `outlineDeletionAuthorization` 单源授权门：标题删除必须区分用户确认与工作流契约，批次不匹配和 malformed 授权不写入。
- 删除回放专用后门 `__outlineDeletionReplayMaxToolIterations`，工具轮次按执行计划派生。
- 历史回放锚点在验证器边界迁移为语义 ID，产品层不兼容旧位置型 sectionId，并新增负向断言。
- 未知窗口改用共享 unknown-window planning budget，长文档执行计划新增语义负向模式，防止语义重组/整理被 local-transform 劫持。
- 经验文件收口为 v8.17，新增 G1.20 预算派生与回放锚点契约。

## 验证

- `npm run build:vue`：通过，两个 Vite 产物生成。
- `node scripts/verify-outline-deletion-confirmation-electron.mjs`：exit 0；21 次物理请求、41 次工具调用、7 次 `editor.write`；3 次 `missing_field`、4 次删除被授权门拦截；授权后删除 1,566 字，拒绝后保留 74,841 字。
- `npx vitest run`：187 files / 2103 tests 通过。
- `npm run type-check`：通过。
- 证据保留：`_audit/verification-outline-deletion-gate/client-turn6-trace/`、`_audit/verification-outline-deletion-gate/electron/result.json` 与三张截图。

## 诚实边界

- Electron 供应商为本地 OpenAI-compatible provider；外部 live 供应商矩阵未复跑，登记 `untested`。
- 回放中的 console error 是历史失败重放，不是本轮产品回归；脚本最终 PASS，删除动作必须经过用户确认门。
- 本轮未升版、未封装；版本保持 `3.101.0`，等待用户审核。
- 若后续修改源码，需要重建并重跑对应验证；本轮收口仅改文档，不触发重跑。
