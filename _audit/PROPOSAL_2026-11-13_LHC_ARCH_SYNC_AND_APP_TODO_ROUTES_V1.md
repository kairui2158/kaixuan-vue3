# PROPOSAL - 2026-11-13 - LHC ARCH SYNC AND APP TODO ROUTES V1

> 目标：把凯旋正文层 LHC 现役架构作为“现役适配声明”同步给应用侧，并把三条历史应用待办改成有证据的处置路线。本方案先交审查，不直接改代码；执行轮只做方案内点改。

## 0. 结论摘要

1. LHC 不是请求应用新增兼容层。应用已经支持 S2/S3 的 `{body, metadata.extractedMeta}` 信封和 S1 的 legacy 行合同；本轮只需要同步现役形态、指纹和消费边界。
2. 三条待办必须改判：`postProcess usage` 已解决，应退役；`deai-model-profile` 是冻结门禁未释放，不是数据未注入；`S3 三败回退` 不是“完全无路由”，而是现有 targeted/full_chain 路由在 K73 实测中未触发，需要先做路由对账，再决定是否修一处接线。
3. 本方案不新增预算系统、调度器、UI、报告层或第二裁判；不向 SKILL 层提要求。
4. `run-trace-正文层-20261113-104548-deep` 已被 K69/K70 台账定性为修复前旧版回归样本，不能当作 LHC 现役失败样本；现役失败样本以 K73 `run-trace-正文层-20261113-172317-deep` 为准。

## 1. 事实核验

### 1.1 LHC 双形态兼容已经存在

1. `src/services/generationResult.ts:38-63`：先解析顶层 JSON 信封并剥离外层围栏，失败才回退 legacy `【正文交接】` 文本合同。
2. `src/services/chainExecution.ts:161-164`：`extractedMeta` 为数组时按行拼装终步账本。
3. `src/services/stepArtifactAcceptance.ts:205-209`：叙事递增 advisory 与章级叙事裁决从 `extractedMeta` 提取。
4. `src/services/skillDeaiContractValidation.ts:85-95`：`contractVersion` 白名单为 `1/2`；S1/S2/S3 三份 `meta.json` 都是 v2。
5. 完整消费面超过原声明所列两处，现役为 5 个文件 7 处：
   - `src/services/bodyArtifactOrchestrator.ts:444`
   - `src/components/pipeline/PipelinePanel.vue:5089`
   - `src/services/stepArtifactAcceptance.ts:419,437,470`
   - `src/services/protectedSkillContract.ts:83`

### 1.2 现役指纹

指纹口径是 `script.js` SHA256 前 8 位加字节数：

| 步骤 | 指纹 | 输出合同 |
| --- | --- | --- |
| S1 | `DA9D0338 / 28640B` | 骨架字符串 + `【正文交接】` |
| S2 | `5E2ABBDF / 49222B` | LHC JSON 信封 |
| S3 | `E4B3C58F / 73332B` | LHC JSON 信封 |

### 1.3 三条待办现状

1. `postProcess usage`：`src/services/realSkillExecutor.ts:1380-1385` 已向 postProcess 传 `{output, usage}`；`kaixuan-s1/script.js:587-601` 已消费 `usage.outputTokens` 与 `reasoningOutputTokens`；`realSkillExecutor.ts:42-43` 允许 `_perf` 字段；`:1400-1420` 会写入 `postProcessReport.perf`。此待办应退役，只保留下一次真实 trace 的观测确认。
2. `deai-model-profile`：`src/services/deaiModelProfile.ts:11` 硬编码 `RELEASED=false`，`:48` 因此永远返回空 guidance；`deaiCalibrationLedger.ts:3,141` 已有每规则 5 样本门槛。当前阻断是发布门禁，不是“无画像数据”这一个原因。
3. `S3 三败回退`：`src/services/bodyArtifactOrchestrator.ts:331-337` 的第一次修复就是 `targeted`；`planBodyArtifactExecution` 在 `:203-220` 会从生成步 S2 重跑并复用上游产物；PipelinePanel 在 `:6555-6569` 会展开该执行计划。但 K73 实测显示三败全程没有触发 S2 重跑，所以这不是“新增 S2 定向机制”，而是对现有路由做失败路径对账。

## 2. 给应用侧的 LHC 现役适配声明

可直接转发：

1. 凯旋正文层现役合同分两段：S1 保持骨架字符串 + `【正文交接】`；S2/S3 最终输出必须是 LHC JSON 信封，`body` 只装文学正文，`metadata.extractedMeta[0]` 装完整账本。禁止 body 与账本双写正文。
2. 应用不应再把 S2/S3 原始输出当作“正文 + 追加账本”假设。审计、计数、失败归因和 trace 摘要都要区分 envelope body、extractedMeta、原始 raw 三个口径。
3. 应用已具备兼容能力，本声明不是兼容层改造请求。不要为普通文本中的 `[]`、`【】` 加宽泛清洗；兼容策略只识别顶层 `{body, metadata}` 信封。
4. `requiresFullUpstreamContext=false` 是负载预算防线，与 LHC 输出形态是两个独立约束，不得互相推导或合并。
5. 现役指纹见第 1.2 节。运行基准不一致时应阻断运行，不应用旧版 SKILL 产出解释现役合同。
6. `run-trace-正文层-20261113-104548-deep` 是旧版回归样本；现役 LHC 诊断只能使用现役指纹后的 trace。

## 3. 处置路线

### Phase A：声明同步与待办改判

1. 将第 2 节文本同步给应用侧记录。
2. 台账将 `postProcess usage` 待办改为“已解决，观测期”。
3. 台账将 `deai-model-profile` 待办改为“冻结门禁待释放”。
4. 台账将 `S3 三败回退` 待办改为“现有路由未触发，需路由对账”。
5. 不改产品代码。

验收：

1. `rg -n "postProcess usage|calibration-not-ready|S3三败无上游S2回退" _audit/DEV_LOG_2026-11-13-body-layer-lhc-k73-trace172317.md _audit/PROPOSAL_2026-11-13_LHC_ARCH_SYNC_AND_APP_TODO_ROUTES_V1.md` 能看到旧表述与新改判并存，且 DEV_LOG 只补不篡改历史。
2. `git diff --check` 通过。

### Phase B：S3 失败路由对账

1. 用 K73 trace 构造最小复现：S3 三次失败时，检查 orchestrator 收到的 `callerStatus`、`structuredFailure`、`maxRepairAttempts` 和执行计划拓扑。
2. 判定规则：
   - 若第一次失败已被编排出 `targeted` 但 PipelinePanel 丢弃或固定了 stepIndex，修这一处接线。
   - 若 S3 的 `narrativeStatus:not_ready` 被 postProcess 判为 blocking 后变成 `failed` 而不是 `blocked`，只归一化状态分类，让现有 `handoffNotReady` 路由生效。
   - 若 K73 属于断点恢复导致执行计划被上游短路，则只补断点恢复分支的 route-consistency trace，不新增修复系统。
3. 修复后必须保留三态断言：首败 `none->targeted`、targeted 失败后一次 `full_chain` 兜底、`full_chain` 失败终态 failed。禁止连续 targeted 或多轮 full_chain。
4. 复用 `bodyArtifactOrchestrator.spec.ts:46,110,156,161` 现有测试，不新建测试框架。

验收：

1. focused spec 通过，并保留原始输出。
2. `npm run type-check`、`npm run build:vue` 通过。
3. 新增/修改断言能证明 K73 复现路径进入 targeted；负向断言证明 full_chain 不是默认首选。
4. 若改动用户可见 trace 文案或状态，按经验文件做真实 Electron 验证；否则说明该项不适用。

执行结论：根因不在编排器路由表，而在 `_runStepSkillsInner` 硬门禁把结构化 failed 结果转成裸异常。已在正文产物链 catch 路径单点转回结构化输出；blocked 叙事路由保持原优先级。编排器对非 handoff 的 failed 输出先经 LHC 解析与正文合同验收，有效输出仍放行，短文进入 targeted。本轮为不可见接线修复，真实 Electron 专项不适用，待 Phase D 真实 trace 对账。

### Phase C：deai-model-profile 最小释放

1. 不做自动调度、预算系统或 UI。只在现役数据达到画像门槛时释放。
2. 将 `DEAI_MODEL_PROFILE_RELEASED=false` 改为从快照推导：`snapshot.rules.length > 0` 即释放。因 `selectDeaiProfileRules` 已含 5 样本门槛，不需要新增阈值系统。
3. 保留 trace 的 `released`、`releaseGate`、`eligibleRuleCount`、`injectedRuleCount` 字段；无规则时仍返回空字符串并记 warn。
4. 更新已有 deai profile spec 的冻结/释放断言，禁止硬编码 true。
5. 释放后首次真实运行只做观测，不因 advisory 改文、不触发重试。

验收：

1. focused spec 通过。
2. `npm run type-check`、`npm run build:vue` 通过。
3. trace 断言：无规则不注入，有规则最多 3 条且 `guidanceChars <= 600`。
4. 用户可见状态变化时做一次真实 Electron 手工烟测。

### Phase D：观测闭环

1. 下一次真实正文层运行检查：`postProcessReport.perf` 是否在 reasoning ratio > 70% 时出现；如出现则退役观测项。
2. 若执行 Phase B/C，用真实运行记录对账 repairScope、profile 注入条数与 UI/trace 展示一致。
3. 更新 DEV_LOG 与 STACK 版本索引；不重写历史结论。

## 4. 过度设计自检

1. 不新增第二裁判：叙事有效性仍归 SKILL，平台合同仍归应用。
2. 不新增兼容层：只同步现役合同，解析器保持顶层 `{body, metadata}`。
3. 不新增预算/调度/UI：Phase C 只改释放条件。
4. 不新增修复系统：Phase B 只对账并接通既有 targeted/full_chain。
5. 不越界：不要求 folder SKILL 改动，不恢复已退役信封旧语义。

## 5. 风险与回滚

1. Phase B 最大风险是把 route 对账误判成“机制不存在”。因此先跑 K73 最小复现，再修单点；不能直接加新路由。
2. Phase C 最大风险是画像文本过短截断造成语义歧义。现有 600 字符截断保留；若截图测试发现歧义，先降为不注入，再加结构化裁剪规则。
3. Phase A/D 无代码风险；只允许新增文档与台账。
4. 每个 Phase 独立 commit；回滚只 revert 本 Phase，不牵连其他语义。

## 6. 经验文件对账

1. 兼容策略只识别顶层信封，不做宽泛正则清洗：对应 `EXPERIENCE.md:131`。
2. 旧语义区分合法展示分支与旧映射逻辑，测试断言语义而非禁词：对应 `EXPERIENCE.md:448-453`。
3. 用户可见改动必须真实 Electron 验证，生产包先 `npm run build:vue`：对应 2026-10-17 真实 UI 硬门禁。
4. 临时脚本只落 `scripts/tmp/`，交付前清理：对应 G1.21。
5. 本方案交付物锚定用户原话“LHC 现役架构声明同步 + 三条待办处置路线”：对应 G0.1。
6. 不堆砌预算系统、自动调度和 UI：对应过度设计门禁。
