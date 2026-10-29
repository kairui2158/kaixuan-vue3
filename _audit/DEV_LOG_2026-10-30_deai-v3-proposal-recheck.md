# DEV LOG：正文层内嵌降AI V3 总方案逐条对账（2026-10-30）

## 背景

用户要求回头重新对账总方案，逐条确认每一条是否落实到应用，并反推测试与真实链路是否支撑结论。本轮以 `_audit/PROPOSAL_2026-10-29_BODY_EMBEDDED_DEAI_V3.md` 为唯一方案事实源，按 Phase 1-10 与验收矩阵逐条比对源码、测试与既有验证证据。

## 总结论

V3 的核心机制均已落地：观测诚信、变更率门禁、检测内核 V2、作者声纹、提示词压缩、legacy-auto 降级、trace 白名单、契约双路径接线、手册、集成回归、校准门禁都有源码与测试证据。

但它不是 100% 完成：

1. **验收矩阵第 7 行 UI 双状态未实现**：`finalStepDetection: 'off'` + 用户 `deep-fix` 的终步 findings 关断已有测试（`realSkillExecutor.spec.ts:1649`），但 UI 没有“终步降AI检测已由 SKILL 声明关闭，用户后处理仍执行”的双状态展示。
2. **Electron 端到端未覆盖两个验收场景**：`finalStepDetection: 'off'` + `deep-fix` 双状态、`conflictPolicy: 'skill-wins' / 'app-wins'` 真实 UI 链路。当前只有 default / skill-disabled / invalid-fallback 三场景。
3. **Phase 10 仍为 NOT_READY**：正样本每组 4 条（要求 30）、人写 suspicious+ 误伤 0.43（要求 <= 0.10）、最差作者 0.7（要求 <= 0.30）、召回 0.85（要求 >= 0.90）、CI 半宽 0.1565（要求 <= 0.05）。
4. **Phase 5 条文偏差**：S3 polish 是 6 条而不是方案写的 4 条；第 5 条“合法短句合并/标点合并例外”是后续按正文层 SKILL 反馈追加的，dev log 有记录，属可解释偏差。
5. **验证方式替代**：方案 §7 写 `npx playwright test`；实际 Electron 验证使用自研 `verify-deai-body-electron.mjs`，且未跑 Playwright test runner。
6. **Phase 4 验收未完整反推**：方案要求“锁定后 S1/S2/S3 携带同一投影”；当前测试覆盖投影函数与注入链，但没有一个用例同时断言三条链步骤的 `deai-voice-profile` 事件与实际 system prompt 携带同一投影。

## Phase 逐条对账

| Phase | 方案要求 | 落实证据 | 反推结论 | 状态 |
|---|---|---|---|---|
| 1 观测诚信 | 删除假 retention；只在深度修复后计算；检测异常显式降级；UI 可见 | `de-ai.js:685-686` 只保留 `protectedSpans.total`；`realSkillExecutor.ts:523-532` 进入 `quality_gate_degraded`；`PipelinePanel.vue:6312-6337` 深度修复后才计算 retention；`DeAiSettings.vue:227` 汇总警告；`de-ai-v2.spec.ts:20-35,176` | 假 retention 已删除且负向断言；异常路径有测试 | 落实 |
| 2 变更率门禁 | 句级 LCS；30%/50%；阈值按 blocking 分级；深度修复后、契约复验前 | `de-ai.js:470-531` 标准句级 LCS DP 与分级阈值；`PipelinePanel.vue:6282-6337` 门禁与回滚 | 交接摘要称“公共句计数近似”不准确，源码是 LCS；三态与 20k 性能测试在 `de-ai-v2.spec.ts:105-167` | 落实 |
| 3 检测内核 V2 | 自适应阈值、n-gram、分层、漂移、评分、verdict | `de-ai.js:537-689`；类型 `de-ai.d.ts`；测试 `de-ai-v2.spec.ts:37-103` | 阈值与评分权重保持 provisional，符合 Phase 10 断点 | 落实 |
| 4 作者声纹 | StyleProfile 单源投影；生成与深修共用；冲突 trace | `deaiVoiceProfile.ts:79,156,170`；`PipelinePanel.vue:908-915,2778,3651,6221`；测试 `deaiVoiceProfile.spec.ts` | 投影与双路径事件已接线；缺“S1/S2/S3 同一投影”集成断言 | 部分 |
| 5 提示词压缩 | S1 12 条；S2 5 条；S3 4 条 | `de-ai.js:1222,1233-1251` | S1 12、S2 5 达成；S3 6 条，第 5 条例外是 SKILL 反馈后的合法追加 | 偏差已解释 |
| 6 legacy-auto 降级 | 新项目默认关闭；UI 明示不提高人味；trace 区分处理器 | `deai.ts:66,94-98`；`DeAiSettings.vue:28-30`；`PipelinePanel.vue:5927-5986` | 默认 `detect-report`，旧显式选择保留 | 落实 |
| 7 trace/UI | 7 类事件进 retained 白名单；导出回读；UI 汇总 | `runTrace.ts:939-955`；`runTraceExportService`；`DeAiSettings.vue:300-309` | `deai-voice-profile` 在 folder `PipelinePanel.vue:2778` 与 agent `:3651` 都有 addEvent；Electron 证据未采样该事件 | 部分 |
| 8 契约收口 | 类型、默认值、校验、投影、folder/agent 接线、冲突策略、预检 | `skillDeaiContract.ts`、`skillDeaiContractValidation.ts`；`PipelinePanel.vue:2726-2779,3615-3651`；`skillPackageManager.ts:79-88`；测试 `skillDeaiContract.spec.ts`、`deai-injection-policy.spec.ts` | 上一轮 8 条质疑已收口；验收矩阵第 7 行 UI 双状态仍未实现 | 部分 |
| 8.5 手册 | 交付并防漂移 | `_audit/FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md`；`deai-injection-policy.spec.ts:41-56` 三处一致性测试 | 手册版本随契约更新 | 落实 |
| 9 集成回归 | 单测、集成、观测、UI、性能 | 定向 92/92；`_audit/verification-deai-body-electron/report.json` 三场景 + heartbeat；20k 性能测试 | Electron 场景缺 finalStepDetection-off 双状态与 conflictPolicy 真实 UI | 部分 |
| 10 样本校准 | provisional 不得解除；门禁量化 | `_audit/verification-deai-calibration/deai-release-gate-2026-10-29.json` NOT_READY；`DEV_LOG_2026-10-30_deai-scoring-redesign.md` | 5 项失败如实保留，正样本扩样是硬前置 | 未放行（设计内） |

## 验收矩阵反推

| 场景 | 源码/测试证据 | 状态 |
|---|---|---|
| `generation: 'off'` 双路径不注入 | `skillDeaiContract.spec.ts:46`；Electron `skill-disabled` 场景 variants 全 off | 已验证 |
| `generation: 'on'` 双路径同投影 | `deai-injection-policy.spec.ts:86` | 已验证 |
| 无声明默认注入 | `skillDeaiContract.spec.ts:94`；Electron `default-no-meta` | 已验证 |
| 非法值 warning + 回退 | `skillDeaiContract.spec.ts:25`；Electron `invalid-fallback` warningEvents 6 | 已验证 |
| 未知 contractVersion 宽容留痕 | `skillDeaiContract.spec.ts:25` | 已验证 |
| agent 无元数据 `app-default-no-skill-meta` | Electron `default-no-meta` source 记录 | 已验证 |
| `finalStepDetection: 'off'` + `deep-fix` | findings 关断测试已验证；用户后处理执行链存在；UI 双状态未实现 | 部分未闭环 |
| `skill-wins` 冲突处理 | 纯函数 `skillDeaiContract.spec.ts:133`；真实 UI 未采样 | 部分 |
| 双路径一致性四元组 | `deai-injection-policy.spec.ts:86` | 已验证 |
| 契约预检 | `skillPackageManager.spec.ts:122`；`skill-package.spec.js:22-29` | 已验证 |

## 本轮验证

- `npx vitest run src/services/de-ai-v2.spec.ts src/services/deaiVoiceProfile.spec.ts src/services/skillDeaiContract.spec.ts src/components/pipeline/__tests__/deai-injection-policy.spec.ts src/services/realSkillExecutor.spec.ts` → 5 files / 92 tests passed。
- `npm run type-check` → `vue-tsc --noEmit` exit 0。
- `git diff --check` → 本轮写入文件无 whitespace 错误。
- 源码对账命令：`rg` 确认白名单、事件 emit、契约消费、预检、提示词条数、变更率算法、legacy 默认值。

## 反推缺口清单（按优先级）

1. **P1**：补 `finalStepDetection: 'off'` + `deep-fix` 的 UI 双状态展示与测试。方案验收矩阵明确要求，当前缺失。
2. **P1**：Electron 验证器补两个场景：终步关闭双状态、`conflictPolicy` 真实 UI 链路。
3. **P2**：补 S1/S2/S3 三步同一声纹投影的集成断言，锁定事件与 system prompt 的一致性。
4. **P2**：`deai-voice-profile` 事件进入 Electron 端到端采样断言。
5. **P2**：若 Playwright test runner 仍是项目验证标准，需要补跑或正式更新方案验证命令；不得静默替代。
6. **P0 前置**：正样本扩样与评分校准，门禁解除前所有阈值与评分保持 provisional。

## 边界

- 本轮是只读对账加审计文档落盘，不修改运行时代码，不提交 git，不封装，版本保持 `3.110.7`。
- 现有 Electron 证据是 2026-10-29 的历史证据；本轮未重新启动 Electron。
- 校准门禁的失败项不是本轮事故，而是 Phase 10 的显式放行断点；不能为了“看起来完成”而放宽门禁。
