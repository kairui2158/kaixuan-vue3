# 开发日志：大纲工作台 compose + folder skill 修复 V2 验证闭环

日期：2026-09-13

## 背景与任务

本任务承接 `_audit/PROPOSAL_2026-09-13_OUTLINE_COMPOSE_FOLDER_REPAIR_V2.md`。此前已确认 compose + folder 组合没有完整接入统一意图路由、运行记录与 `editor.propose_edits` 写入闭环。本轮目标是完成真实源 Electron + CDP 验证，再回写日志与经验文件。

## 根因

1. **compose + folder 旁路**：compose 模式曾经只把 folder 当模板文本处理，未复用统一对话底座，导致讨论/编辑意图、工具面、运行记录与写入提案链路分裂。
2. **运行记录 prompt 外置哈希缺陷**：`promptIdentityContent()` 计算哈希时剔除 `id/builtAt/apiCallId/turnId/payloadRef`，但 `collectPayloads()` 返回的原始快照被直接写入 `prompt.json`。真实大纲共创快照包含这些字段，导出后 5 个 prompt 载荷全部 hashMismatch。
3. **旧验证掩盖缺陷**：旧深度化验证使用的合成 prompt 恰好没有这些易变字段，因此单测与旧 E2E 均无法暴露该问题。

## 修复内容

1. E2E 脚本 `scripts/verify-outline-compose-folder-repair-v2.mjs`：
   - 使用 `SHENYI_TEST_USER_DATA_DIR` 隔离用户数据，避免读取开发者默认项目状态。
   - mock 供应商支持非流式 JSON 与流式 SSE 双协议，并支持原生 `tool_calls`。
   - 使用 `toolCall + followUp` 剧本，工具结果回传后生成收尾文本。
   - `send()` 等待条件改为发送前后 assistant 消息数量对比，防止旧消息导致断言抢跑。
   - 伪 approved 测试改为“前后批次数量与编辑器均不变”。
   - proposal-missing 场景按真实用户路径执行：先断言意图路由短路，再点击“按推荐技能继续”。
   - 深度导出断言按 V2 语义区分逻辑 API call 与物理请求，并从 `export.json` 读取 payloadVerification。
2. `electron/ipc/runTrace.js`：
   - `payloadContent('prompt', snapshot)` 统一使用 `promptIdentityContent()`，确保哈希计算与实际落盘内容完全一致。
   - `buildRunWithPayloadRefs()` 返回的 payload 项也统一规范化，避免 dedup 元数据混入写盘内容。
3. `electron/ipc/runTrace.spec.js`：新增“prompt payload 字节与声明的 sha256 一致”回归测试，直接复现真实快照含 `id/apiCallId/turnId/builtAt` 的场景。

## 验证过程

1. `npx vitest run electron/ipc/runTrace.spec.js`
   - 5 tests passed。
2. `node scripts/verify-outline-compose-folder-repair-v2.mjs`
   - 真实源 Electron + CDP + mock SSE。
   - 验证 compose 恢复真实 folder skill。
   - 讨论轮：1 次物理请求，仅读工具，无写工具，folder 入口与 template 均注入，编辑器不变。
   - 编辑轮：暴露 `editor.propose_edits`，原生工具调用，工具结果以 `role: tool` 回传，生成 pending batch，用户确认前编辑器 hash 不变，UI 确认后应用，确认本身不额外请求。
   - 第二编辑轮：再次生成 pending batch，取消后 rejected，编辑器不变，取消本身不额外请求。
   - 伪 approved 文本：不新增批次，不改编辑器。
   - 歧义 edit：不静默发 API，出现 fallback 确认卡片，用户点击后才执行。
   - 深度导出：5 条逻辑 API call、至少 7 次物理请求、5 个 prompt snapshot、36 个外置载荷，`payloadVerification: {"total":36,"missing":[],"hashMismatch":[],"ok":true}`。
3. `npm run type-check`：通过。
4. `npm run test:services`：14 files / 198 tests 全部通过。
5. `npm run build:vue`：renderer 与 provider protocols 双构建通过。
6. `npx vitest run`：61 files / 507 tests 全部通过。
7. 临时 profile 与导出目录在 E2E finally 中清理，复查 `%TEMP%` 无 `outline-compose-folder-repair-v2-*` 残留。

## 交付边界

- 本轮不升级版本、不封装安装包。
- 未修改 `realSkillExecutor.ts`、`skill-loader.js`、`folderSkillEval.ts`、`de-ai.js`、`chainIntentRouter.ts` 判定本体与生成流水线层级语义。
- 写入安全模型保持不变：模型不能直写，只能通过 `editor.propose_edits` 提案；工具成功状态只能是 `pending_user_confirmation`；`approved/applied` 只能由 UI 用户确认产生。

## 经验沉淀

- payload 哈希必须与落盘字节同源生成，不能一套内容算哈希、另一套内容写文件。
- 合成测试数据必须覆盖真实字段形态；易变字段差异会导致导出校验假绿。
- 真实源 Electron + 原生工具循环 E2E 是判断对话/写入闭环的唯一可信门禁。
