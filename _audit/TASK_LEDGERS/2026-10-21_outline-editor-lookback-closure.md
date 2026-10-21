# 2026-10-21 大纲编辑器回头看收口台账

## 1. 目标与原话

用户目标：根据经验文件对之前修了很久的大纲编辑器回头看，用积累的经验找出暗伤、隐患和没有捋顺的问题；对找出的待裁决隐患按建议执行，并做到可执行、可验证、无后患。

本轮收口目标：把已完成的代码修复、真实 Electron 回放、全量测试与类型检查登记为可追溯台账，并把新增纪律回写经验文件，完成临时运行态清理。

## 2. 门禁读证

- G0.3：完成声明必须区分已验证、未验证、历史证据保留。
- G0.5：回头看必须对账目标、diff、生产入口、验证器与证据归属。
- G0.8：清理可再生成运行态，保留本轮证据与源码。
- G0.12：非平凡任务必须建台账并逐项登记。
- G1.15：症状、链路、组合、机制四层递进，不把预算缺陷误判为模型缺陷。
- G1.17：验证默认证伪，重点排查执行者自盲区。
- G1.20：预算随真实执行形态派生，预算实例单源，回放锚点随协议迁移。
- G2.1：工具循环状态与预算必须单源。
- G2.10：真实 trace 回放必须复刻用户意图与执行形态，不得注入冒充。

## 3. 路由判定

- 加入：大纲编辑器 API 直写、Agent 工具循环、长文档执行计划、历史 trace 回放、删除授权语义、Electron 真实 UI 验证。
- 排除：生成流水线卷纲/章节/正文链路；本轮只处理大纲编辑器与首页共用底座暴露的问题。
- 排除：SKILL 提示词内容；SKILL 保持中立，本轮不修改 SKILL 文本。

## 4. 影响圈与作者反证

实际修改：

- `src/services/toolRunBudget.ts`：direct 写任务预算按真实执行形态调整为读 36、写 12、物理请求 52。
- `src/services/agentOrchestrator.ts`：优先消费 live `toolRunBudgetInstance`，删除第二预算。
- `src/services/agentDialogueRuntime.ts`：透传 live 预算实例。
- `src/components/common/OutlineWorkspace.vue`：同时传 snapshot 与 live 实例；删除 `__outlineDeletionReplayMaxToolIterations`；`maxToolIterations` 按执行计划派生。
- `src/services/outlineDeletionAuthorization.ts`：新增删除授权单源，区分 `user-confirmation` 与 `workflow-contract`。
- `src/services/outlineDeletionAuthorization.spec.ts`：覆盖精确匹配、批次不匹配、混合批次、malformed 授权与覆盖场景。
- `src/services/outlineStructureSemanticIdProbe.spec.ts`：负向断言当前客户大纲不产生旧位置型 ID。
- `src/services/editorContextPipeline.ts` / `editorContextPolicy.ts`：未知窗口改用共享 unknown-window planning budget。
- `src/services/longDocumentExecutionPlanner.ts`：新增语义负向模式，防止语义重组/整理被 local-transform 劫持。
- `scripts/verify-outline-deletion-confirmation-electron.mjs`：回放器显式迁移三个旧位置型 sectionId 到语义 ID。

作者反证：

- 反证一：预算是否只提高了数值？结论：没有。预算来源改为执行计划，且 live 实例单源，测试覆盖双预算与写容量。
- 反证二：回放迁移是否会变成产品兼容旧协议？结论：不会。迁移只在验证器边界，产品保持语义 ID 单源，并有负向断言。
- 反证三：删除授权是否可能变成 workflow 越权？结论：单源授权门显式区分 user confirmation 与 workflow contract，测试覆盖 malformed 与混合批次。

## 5. 停止条件

- 真实 Electron 回放复刻客户 turn 6 意图，删除动作必须经过用户确认门。
- 预算单源且无隐藏第二预算。
- 历史回放锚点迁移登记完整，并保留旧协议负向断言。
- 全量测试、类型检查、构建通过。
- 台账、DEV_LOG、经验文件、主索引完成；临时 profile 清理；证据保留。

## 6. 执行证据

- 构建：`npm run build:vue` 通过，两个 Vite 产物生成。
- 真实 Electron：`node scripts/verify-outline-deletion-confirmation-electron.mjs` exit 0。
  - 21 次物理请求、41 次工具调用、7 次 `editor.write`。
  - 3 次 `missing_field`、4 次标题删除被授权门拦截。
  - 3 个历史 `write_only_mode` locate 失败在新语义下变为 success。
  - 授权后删除 1,566 字；拒绝后保留 74,841 字。
  - 证据：`_audit/verification-outline-deletion-gate/electron/result.json`、三张截图。
  - 客户 trace：`_audit/verification-outline-deletion-gate/client-turn6-trace/`。
- 全量测试：`npx vitest run` 通过，187 files / 2103 tests。
- 类型检查：`npm run type-check` 通过。
- 测试收口：
  - `outlineStructureSemanticIdProbe.spec.ts` 增加显式非空守卫。
  - `longDocumentWriteProtocol.spec.ts` 断言从 12 迁移到 52，属于 G1.5/G1.20 锚点迁移。
- 回放锚点迁移：
  - `heading-16801` -> `heading-2-z4sxm8`
  - `heading-17356` -> `heading-2-10q4nra`
  - `heading-18104` -> `heading-2-28do6r`

## 7. 缺口清单

- 外部 live 供应商矩阵未复跑；本轮 Electron 为本地 OpenAI-compatible provider，属于真实 UI 与真实执行链路验证，但不覆盖外部供应商差异。
- `callApiWithAgentTimeout` 是否仍为死代码未复核；若确认无调用方，下一轮可清理。
- `immediateContextMessages` 与 `conversationContextService.ts` 内部存储迁移函数 `legacyMessages()` 语义相近但用途不同，需防止后续误删或误并。
- 版本保持 `3.101.0`，本轮未升版、未封装，等待用户审核。
