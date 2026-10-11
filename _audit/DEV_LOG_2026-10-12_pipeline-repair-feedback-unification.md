# 2026-10-12 流水线修复反馈与链路可观测统一

## 背景

正文层反馈四项问题经复核全部真实：schema 裸重试、warning 埋在事件流、S2 真实请求口径被上游 100K 口径掩盖、DEAI 负面方法论压制创作步。本方案按共享执行底座修复，正文、卷纲、章节、设定四层共用同一反馈与观测语义，不改 API 直写权限协议。

## 实现

- schema 重试反馈：`realSkillExecutor.ts` 在下一轮 system prompt 注入上一轮具体校验错误；每次 attempt 捕获最终 messages，`attemptRequestMessages` 可按 pass/attempt 复盘。
- folder pass 口径：新增 `folder-pass-input` 事件，记录 inputMode、user/system 实长、sampleCount、isRetry、upstream 声明与应用结果；`chain-context-slim` 标注 `measurement: upstream_prompt_only`，不再冒充物理请求长度。
- warning 可见性：五类 chain warning 通过 `pipelineStepLog` 聚合进步骤日志，同 code 重复警告合并计数，事件流照旧保留。
- S2 上下文契约：`requiresFullUpstreamContext` 由 SKILL meta 声明，应用在 `input=previous` pass 中保留声明上游；未声明则维持原行为，声明但上游为空时 warning 降级。
- DEAI 分步：S1/S3 使用完整方法论，S2 使用 `DEAI_CREATIVE_PROMPT` 正向风格指令；folder 与 text skill 路径同源分派。
- 防滚雪球：truncated 只续写一次；续写请求保留原始 system/template 上下文，仅把 user 换成 32,000 字符尾部窗口。终步回显 `>=0.85` 触发一次带反馈修复重试，中间步仅 warning。
- 章节/卷纲修复请求携带上一次验收错误与禁止重复的历史标题/卷名清单。

## 验证

- 专项测试：`npx vitest run realSkillExecutor/chainExecution/pipelineStepLog/de-ai/chapterBatchOrchestrator/volumeBatchOrchestrator` → 83 tests passed。
- type-check：`npm run type-check` → exit 0。
- Electron live：`node scripts/verify-pipeline-repair-feedback-electron.mjs`，真实可见窗口、真实下拉选择 SKILL、真实供应商 API；baseline 6 次调用、schema-retry 3 次、echo-repair 4 次，三场景终态均 success。
- 回放：三份新 trace `RESULT: ACCEPTED`；旧正文层历史 trace 保持 `EXPECTED-FAIL`，证明旧缺陷真实存在且新能力不是补写历史。
- 回头看追加修正：发现续写请求曾只发尾部 user 消息、丢失 SKILL system 上下文，与方案风险控制口径冲突；已修为保留非 user 上下文 + 有界尾部续写，并新增单测断言 system 保留与 32K 上限。

## 证据

- 方案：`_audit/PROPOSAL_2026-10-12_PIPELINE_REPAIR_FEEDBACK_AND_CHAIN_VISIBILITY_UNIFICATION.md`
- live 证据：`_audit/verification-pipeline-repair-feedback-live/summary.json`
- trace 原件：`_audit/verification-pipeline-repair-feedback-live/live-export/{baseline,schema-retry,echo-repair}`
- 验证器：`scripts/verify-pipeline-repair-feedback-electron.mjs`、`scripts/verify-pipeline-repair-feedback-replay.mjs`

## 运维口径

- live 默认超时固定为单步 30 分钟、全局 3 小时。真实供应商单步可能数分钟，10 分钟默认会误杀合法长请求；如需覆盖仍可用 `SHENYI_REPAIR_FEEDBACK_STEP_TIMEOUT_MS` / `SHENYI_REPAIR_FEEDBACK_GLOBAL_TIMEOUT_MS`。
- 测试 SKILL `preProcess` 必须按生产协议接收 `{ hook, payload }` 包装对象。
- deep 导出的 request payload 为平铺 `NNN-request.json`，不是 `payloads/` 子目录；trace 导出与归档必须在断言前执行，失败也保留现场。
