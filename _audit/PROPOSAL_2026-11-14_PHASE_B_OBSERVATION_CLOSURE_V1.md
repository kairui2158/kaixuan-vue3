# 方案 · Phase B 观测闭环（V1）

状态：待用户审核
日期：2026-11-14
上游方案：`_audit/PROPOSAL_2026-11-13_LHC_ARCH_SYNC_AND_APP_TODO_ROUTES_V1.md`
上游台账：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-14_body-final-failure-transparency-f1-f5.md`
规则基准：`_audit/神意开发经验总结_v9.md`（v10.4.1）

## 1. 目标与原话

用户原话：

> 我看方案里还留有Phase B的后续项目，你根据经验文件里的相关门禁和执行纪律来做方案

Phase B 剩余项（来自上游方案 Phase D）：

1. 下一次真实正文层运行检查 `postProcessReport.perf` 是否在 reasoning ratio > 70% 时出现；如出现则退役观测项。
2. 若执行 Phase B/C，用真实运行记录对账 `repairScope`、profile 注入条数与 UI/trace 展示一致。
3. 更新 DEV_LOG 与 STACK 版本索引；不重写历史结论。

本轮做什么：把 Phase D 的三个观测项通过一次真实供应商 folder-chain 运行回填，并在同一运行中对 F1-F5（终步失败透传、trace 状态隔离、内联账本防空转等）提供行为证据。

本轮不做什么：

1. 不新增预算系统、调度器、UI、第二裁判或新 trace 字段。
2. 不改产品代码（PipelinePanel.vue、realSkillExecutor.ts、bodyArtifactOrchestrator.ts、deaiModelProfile.ts 均不动）。
3. 不改 folder SKILL 模板或叙事裁判权。
4. 不做正文质量对比或配对验证（那是独立方案，不属于 Phase B/D）。

## 2. 现状读证

| # | 事实 | 证据 |
|---|---|---|
| 1 | `postProcess usage` 注入已实现 | `realSkillExecutor.ts:1382-1385` 传 `{output,usage}` |
| 2 | `postProcessReport.perf` 三态已接线 | `realSkillExecutor.ts:1400-1420`（对象 / `thresholdNotMet` / `usageUnavailable`） |
| 3 | trace 类型已声明三态 | `runTrace.ts:701-718` `postProcessReport.perf` |
| 4 | `repairScope` 已落 trace | `PipelinePanel.vue:6679` `body-artifact-attempt` 事件 detail 含 `repairScope` |
| 5 | live 观测脚本存在但未覆盖三项 | `scripts/verify-deai-stage-guidance-live.mjs` `collectChapterObservation` 与 `assertObservations` 均无 perf / repairScope / trace-state 双跳读取 |
| 6 | live 脚本 `modelProfile.released=true` 是硬断言 | 同上 `assertObservations`：要求每步 released=true + injectedRuleCount>0 |
| 7 | F1-F5 live 证据用的是 compose 模式 | `scripts/verify-pipeline-provider-channel-electron.mjs`：`skillNames: []`，`skillMode: "compose"` |
| 8 | F1-F5 live 运行时指纹早于 F1-F5 提交 | `commit=b9d4eec0 / appVersion=3.127.6`；当前 HEAD=`c5ef9bee / 3.127.7` |
| 9 | 上一轮 Phase D 证据 `postProcessReport.perf` 缺失属版本时序 | `_audit/verification-body-final-contract-outcome-20261113-213305.json`：`commit=1fba97791944 / appVersion=3.127.4` |

结论：产品接线已完成；缺口在观测器（live 验证脚本）没有读/没有断言这三项字段，也没有在 folder-chain 模式下验证 F1-F5 行为。

## 3. G0.13 最小必要性五问

1. 用户目标必须依赖什么？——一次 3.127.7 folder-chain 真实供应商运行，回填 Phase D 三个观测项。
2. 不新增什么？——不加预算系统、调度器、UI、第二裁判、新 trace 字段、新修复路由。
3. 为什么只改验证器不改产品？——产品接线已存在；缺口在观测器没读/没断言这些字段。
4. 是否产生新状态？——否；只读既有 `run-trace.json` 与 `folderDiagnostics`。
5. 删除什么？——无；本轮只增强观测断言。

## 4. 修复项（承诺到行为）

### B1 · live 观测器增强（唯一代码改动文件：`scripts/verify-deai-stage-guidance-live.mjs`）

1. `collectChapterObservation` 新增三个只读采集项：
   - `postProcessPerf`：遍历 `run.folderDiagnostics`，收集每个 folder diagnostic 的 `postProcessReport.perf`（三态值或 `{warning, ratio, blocking}` 对象）。
   - `repairScopes`：从 `body-artifact-attempt` 事件 detail 收集 `{repairAttempt, repairScope, status, wordCount}`。
   - `traceStateTimeline`：统计 run status 历史中 failed→success 双跳次数（F5 行为对账）。
2. `assertObservations` 调整：
   - `runStatus === 'success'` 不变（观测闭环的业务前提）。
   - `postProcessPerf` 必须存在且为三态之一（对象 / `thresholdNotMet` / `usageUnavailable`）；缺字段视为接线缺陷，不假过。
   - `repairScopes[0].repairScope === 'none'`（首调），后续按既有 `none→targeted→full_chain` 协议对账顺序合法性；只观测不改路由。
   - `traceStateTimeline.failedToSuccessDoubleJump === 0`（F5 trace 状态隔离行为对账）。
   - `modelProfile` 放宽为三态断言：`rules.length > 0` 时 `released=true` + `injectedRuleCount>0 ≤3` + `guidanceChars>0 ≤600`；`rules.length === 0` 时 `released=false` + `releaseGate='calibration-not-ready'` + `injectedRuleCount=0`。两种形态都算观测通过，不强求有机账本必有成熟规则。
   - `stageGuidance` 与 UI 行断言不变。
3. 观测性分类：`classification` 仍为 `observational`，不作为 release gate；`verificationStatus` 区分 `observational-pass` / `observational-blocked` / `observational-failed`。业务失败且证据留存完整时为 `observational-blocked`；证据导出或 UI 观测本身失败时为 `observational-failed`。

### B2 · 真实供应商运行

| 项 | 值 |
|---|---|
| 供应商 | `prov-1793816697590`（glm-5.3，与 F1-F5 live 同供应商同模型） |
| 章节 | 3 章（脚本默认，3 次 S1→S2→S3 folder chain 调用） |
| 模式 | 正文层 chain 模式 + 三个真实 folder SKILL（kaixuan-s1/s2/s3），通过真实 UI 选择，不注入冒充（G0.11） |
| 命令 | `node scripts/verify-deai-stage-guidance-live.mjs` |
| 证据路径 | `_audit/verification-deai-stage-guidance-live/run-{stamp}/` |

预期：3 章全部 terminal=success（观测闭环的业务前提）。若业务失败，脚本仍导出失败 trace，则 `verificationStatus=observational-blocked`，Phase D 继续开放。

### B3 · 台账 + DEV_LOG + 收尾

1. 新台账 `TASK_LEDGER_2026-11-14_phase-b-observation-closure-v1.md` 七节（本轮先建骨架）。
2. DEV_LOG 记录观测结果；STACK.md 版本索引日期对齐 3.127.7。
3. 回填上游 Phase D 的 `untested` 状态（只追加不篡改历史结论）。
4. `git commit`（docs + script），如果 live 运行成功则 dev log 状态改为 `observational-pass`；不宣称"质量提升"——只宣称"接线观测闭环"。

## 5. 正反推研磨（G0.7）

正推：`postProcessReport.perf` 已在 executor 写入 `folderDiagnostics.postProcessReport`；live 脚本读 `run.folderDiagnostics` → 能看到三态。

反推 1：`folderDiagnostics` 在 run trace 导出中是否保留？→ `run.folderDiagnostics` 是 run 对象字段，`exportRunToJson` 保留 → 脚本加存在性断言兜底（若字段缺失则 `observational-blocked`，不假过）。

反推 2：`repairScope` 在首调时可能是 `post_process`（S3 内部 polish 入口）？→ 从 `bodyArtifactOrchestrator.spec.ts:124-177` 看编排入口首调是 `none`；`post_process` 是不同入口。观测器只对账 `body-artifact-attempt` 事件的顺序，不判 `post_process`。

反推 3：有机账本可能无成熟规则 → 三态断言已处理。

反推 4：run 失败时 script 已走 `preserveFailureEvidence` → observations 含失败 run → assertObservations 在 runStatus=success 处抛 → 正确：Phase D 业务前提不满足，`observational-blocked`，不算 pass。

反推 5：3 章中第 1 章成功后第 2 章失败 → observations 含部分成功 + 失败 → assertObservations 在失败处抛 → catch 转 failure → script throw → 退出码 1 → 正确标记 `observational-blocked`。

## 6. 影响圈

改：`scripts/verify-deai-stage-guidance-live.mjs`（唯一代码文件）。

不动：PipelinePanel.vue、realSkillExecutor.ts、bodyArtifactOrchestrator.ts、deaiModelProfile.ts、folder SKILL 模板。

不改但须对账：runTrace.ts 类型（只读）、package.json 版本（已 3.127.7）。

## 7. 验证分层（G1.4）

| 层 | 范围 | 命令 | 判定 |
|---|---|---|---|
| 静态 | 脚本语法 | `node --check scripts/verify-deai-stage-guidance-live.mjs` | exit 0 |
| 单测 | 不适用（验证器非产品代码） | — | 声明 |
| mock E2E | 不适用（`verify-deai-stage-guidance-electron.mjs` 已覆盖确定性链路） | — | 声明 |
| 真实供应商 + 真实 Electron UI | B2 全部 | `node scripts/verify-deai-stage-guidance-live.mjs` | 3章 success + 三态字段存在 |
| 全量服务回归 | 不适用（不改产品代码） | — | 声明 |

## 8. 停止条件（机器可判定）

完成条件：

1. `node --check` exit 0。
2. live run 3 章全部 success。
3. `summary.json` 3 个 observation 均含 `postProcessPerf` ∈ {对象, `thresholdNotMet`, `usageUnavailable`}。
4. `summary.json` 3 个 observation 的 `repairScopes[0].repairScope === 'none'` 且 `traceStateTimeline.failedToSuccessDoubleJump === 0`。
5. `modelProfile` 每条事件符合三态规则。
6. 台账七节补齐 + DEV_LOG + STACK.md 索引日期更新。
7. git commit + 工作区干净。

失败条件：任一不满足 → Phase D 保持 `untested` / `observational-blocked`，登记缺口，不宣称闭环。

## 9. 过度设计自检

- 只改一个验证器，不新增脚本/状态/UI/调度/预算。
- 不改产品代码，不改 SKILL。
- 断言面增加 3 项是为了关闭 Phase D 既定观测项，不是为了新体系。

## 10. 成熟度结论（G0.6）

| 层 | 结论 | 说明 |
|---|---|---|
| 执行器/工具层 | 成熟 | live 脚本已有完整 Electron+CDP+供应商解密链路 |
| 应用方案/交互闭环 | 成熟 | 观测口径已定，UI 不变 |
| 实现接线 | 成熟 | B1 已完成 `node --check` 与双向 trace 干跑：成功 trace 全部断言 PASS；失败 trace 在 runStatus=failed 处按设计阻断，负面证伪通过。产品代码未改动。 |
| 验证标准 | 成熟 | 分层表 + 机器可判定停止条件 |

结论：可执行。

## 11. 经验文件对账

| 门禁 | 对账方式 |
|---|---|
| G0.1 | 目标只锚定 Phase D 三个观测项 + F1-F5 行为证据，不扩面 |
| G0.2 | 未设置 token/时间/轮次预算 |
| G0.4 | 已读上游方案/台账/DEV_LOG/经验文件相关段 |
| G0.6 | 本文件含成熟度结论 |
| G0.7 | 第 5 节正反推 |
| G0.11 | 真实 UI 选择 SKILL，不注入冒充 |
| G0.12 | 台账骨架同步建立 |
| G0.13 | 第 3 节五问 |
| G1.4 | 第 7 节分层验证 |
| G1.14 | 第 6 节影响圈 + 反推 1-5 |
| G1.17 | B2 是真实用户路径证伪尝试（断点在脚本断言形状） |
| G1.21 | 无临时脚本，只改既有验证器 |
| G1.30 | 第 4 节承诺到行为 + 第 8 节停止条件 |
| G2.10 | 不适用（无直写/Agent/工具循环改动）；但证据使用真实 trace（强于回放） |
