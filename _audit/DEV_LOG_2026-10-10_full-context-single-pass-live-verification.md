# 2026-10-10 全文上下文一次成型真实链路验证

## 范围

- 验证 `single-pass` 执行语义在真实 Electron UI 与真实外部供应商 API 下的端到端行为。
- 覆盖双入口（大纲工作台 / 首页编辑器）与双状态（无 SKILL / 加载 SKILL）组成的 4 个场景。
- 使用 74,293 字真实大纲执行同一整篇整理重排请求：按叙事逻辑重新排序、合并或删除重复项、统一中文标点和标题层级、按 Word 文档格式整理。
- 复核 runTrace 归属与 payload 完整性，确认真实请求携带全文与完整指令，SKILL 场景携带领域提示。

## 验证方式

- 验证脚本：`scripts/verify-single-pass-live-replay.mjs`。
- 证据目录：`_audit/verification-single-pass-live-replay/`。
- 供应商：`https://openapi.cloud-ai.cn/v1`，模型 `deepseek-v4-pro`。
- 每个场景均为真实 UI 操作、真实模型请求、真实编辑器写入，并导出完整 runTrace 与 payload。

## 结果

| 场景 | turnStatus | turnReason | 物理请求 | 工具调用 | finishReason | 前/后字数 | 耗时 |
|---|---|---|---:|---:|---|---|---:|
| outline-no-skill | success | final_draft_complete | 1 | 0 | stop | 74,293 -> 74,146 | 486s |
| outline-with-skill | success | final_draft_complete | 1 | 0 | stop | 74,293 -> 74,323 | 638s |
| home-with-skill | success | final_draft_complete | 1 | 0 | stop | 74,293 -> 74,282 | 541s |
| home-no-skill | success | final_draft_complete | 1 | 0 | stop | 74,293 -> 74,146 | 510s |

机器可读结果：`_audit/verification-single-pass-live-replay/verification-result.json`。

## 结论

- 整理重排不再触发读取循环或 `读取 x/y` 进度；4 个场景均为 0 次工具调用，且均为 1 次物理请求。
- 4 个场景全文均发生变化并成功写回编辑器，`turnReason` 均为 `final_draft_complete`，无崩溃、无 page error，renderer heap 峰值 total 为 37.5-39.0MB。
- 最新全量重跑生成时间 `2026-10-11T02:27:53.848Z`，完整结果见 `verification-result.json`；该结果取代 2026-10-10 23:37 与 2026-10-11 01:12 的旧复核记录。
- SKILL 场景通过真实 UI 下拉选择 `folder:L1-B` 完成，日志含 `[SKILL UI SELECTED]`；SKILL 只进入 system 提示，未改变工具面、权限与执行计划。
- 请求载荷包含完整大纲与完整用户指令，`user` 消息约 74,589 字；带 SKILL 场景的 `system` 提示从 304 字升至 1,891 字，证明 SKILL 领域能力真实进入请求且未触发工具循环。
- 四份 runTrace 已复核：`seq` 连续、无错误 `turnId` 归属、无 payload 完整性警告；除 `started` 与 `session-active` 外，所有事件均归属当前 turn。
- `src/stores/runTrace.ts` 的 `turnId` 修复有效：显式 `turnId: undefined` 不再覆盖 active turn 兜底值；`src/stores/runTrace.spec.ts` 已有对应回归。
- 主页终稿流 OOM 根因已归档至台账：旧实现把 `sourceContent/completedText/accumulatedText` 三份全文挂在聊天消息上，且每个流式事件都深克隆整个会话数组写盘；现在持久化层只保存 `FinalDraftTaskView` 瘦身视图，continue/resume/retry 经 checkpoint 恢复完整任务，写盘进入 250ms 合并窗口。
- OOM 修复新鲜验证：`npx vitest run src/stores/chat.spec.ts src/services/finalDraftCheckpoint.spec.ts src/services/crashMonitor.spec.ts src/services/finalDraftRunner.spec.ts` → 40 tests passed；`npm run type-check` → exit 0（2026-10-11 11:01-11:02）。

## 诚实边界

- `home-no-skill` 曾出现 2 次物理请求、2 个全文流，总耗时约 1,261 秒。2026-10-11 02:27 的最新重跑已收敛为 1 次物理请求、510 秒，`_audit/verification-single-pass-live-replay/verification-result.json` 为当前唯一口径；旧效率疑点关闭。
- outline-with-skill 首字延迟约 40 秒、home-with-skill 首字延迟约 68 秒；流式吞吐正常，但首字延迟偏高，登记为后续供应商/提示词效率观察项。
- live 证据覆盖的是单轮整篇重构请求；多轮会话上下文连续性由代码契约与单测保证，本轮未构造真实多轮 live 会话。
- 本轮不重新封装版本；当前版本保持 3.78.0。

## 台账

- [_audit/TASK_LEDGERS/2026-10-10_full-context-single-pass-restructure.md](TASK_LEDGERS/2026-10-10_full-context-single-pass-restructure.md)
