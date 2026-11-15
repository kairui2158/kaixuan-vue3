# 正文层商业标准设计重审报告 V1

日期：2026-11-16  
范围：K88 运行证据、正文层执行链、终态裁决、上游消费面、恢复语义、经验文件门禁。  
性质：设计与完成度重审。本报告不改代码；修复需另行方案并经用户裁决。

## 结论

正文层本体不再是从前那种“链式 SKILL + API 简单跑通”的小本体，而是一个已被事故驱动的修复推到多层防御的工程体。当前结构化通道、账本解析、结构化失败透传、恢复语义、断点与 trace 主要路径都有真实修复，但商业标准下还不能称为终态稳定。

最大风险不是某个校验缺失，而是**失败路径仍按成功路径的产物形状设计**。K88 证明：S1 明明 caller failed、extractedWordCount=0，但 raw 骨架有 3177 字符、metadata 有完整账本；后续 targeted 修复只检查“有产物形状”，不检查“产物是否来自失败步骤”，于是失败骨架和失败账本进入 S2，S2 写出被污染的正文，S3 只能对污染结果打磨，终稿 9/9 对账自然通过。这是链路语义缺陷，不是单点模型故障。

## 商业标准完成度

| 维度 | 状态 | 依据 | 商业标准判断 |
| --- | --- | ---: | --- |
| 执行器与 SKILL 调用 | 成熟偏稳 | 结构化失败、blocking gate、folder-pass input、usage 通道、假成功防护均已落地 | 可作为主链底座；仍需失败拓扑回归 |
| 正文应用闭环 | 半成熟 | K87 三项修复在代码中存在；但失败产物仍可进入上游消费面 | 有真实闭合，也有可被污染的旁路 |
| 接线一致性 | 不成熟 | targeted prompt 声明“旧稿不进入请求”，链式执行却注入上游 raw 骨架；两个 prompt 信号冲突 | 这是当前最大设计缝 |
| 恢复与终态 | 成熟偏稳 | `folderDiagnosticsStatus` 的 tail recovery 是单源输入，`PipelinePanel.vue:2030-2036` 把它交给 `resolvePipelineRunOutcome`；K88 EVT126 有恢复警告 | 终态语义一致；遗留只是恢复来源标签不细分 |
| 观测与可审计 | 半成熟 | attempt、metadata、decisionPath、physical-call 已丰富；但 step-level 失败没有被 stateHistory 捕获，success 可能掩盖内容污染 | 观测面足够，语义分层仍混 |
| 回归验证 | 不成熟 | 现有单测覆盖合同函数，缺少“失败上游形状 + targeted 修复 + 内容污染”的组合拓扑测试 | 商业交付必须补失败拓扑矩阵 |
| 文档与交接 | 成熟 | spec、K 条目、摸底文档、交接说明均已更新 | 但 runtime 指纹与新架构语义需要持续同步 |

整体评估：约 **72%-78%**。低于此前 78%-82% 的表面估值，原因不是功能退步，而是商业标准要求审计失败路径、组合路径和接线语义；这些新暴露的缝此前没有被纳入完成度分母。

## K88 四项复核

### 1. S1 failed + 非空候选被 targeted 降级：属实

证据：EVT23 中 `callerStatus:"failed"`、`extractedWordCount:0`、`blockingGateFailed:true`，但 raw 骨架 3177 字符且 `extractedMeta` 完整。EVT35 中 S2 success，其账本与失败 S1 几乎逐字一致。  
定性：不是 G2.9 targeted-first 本身错误，而是 repairScope 判定缺少产物形状语义。当前 targeted-first 假设失败物是有 body 的正文草稿；S1 产物是骨架，形状不同，不能套用同一规则。

### 2. 失败步骤 extractedMeta 成为终稿权威 FACT_LOCK：属实

证据：EVT118 的终步对账 9/9 matched；EVT35 的 S2 账本源自失败 S1 账本。  
定性：结构化验收路径本身没有 vacuous pass，但“内容级权威来源”没有阻断失败步骤。应用按平台合同接受结构，SKILL/叙事侧按内容施工，中间没有“失败产物不得成为事实权威”的边界闸。

### 3. S1 failed 后终态 success、stateHistory 无 failed：终态正确，观测标签偏轻

证据：EVT128 为 `running → success`；本轮确认 stateHistory 写入点在 `runTrace.ts:1210` 与 `:2726`，均为 run 级终态记录。  
定性：stateHistory 记录 run 终态属于设计语义，不应把 step-level failure 混入；folderDiagnostics 仍保留历史 failed，且 `PipelinePanel.vue:2030-2036` 用 tail recovery 后的聚合状态参与 run 裁决。因此“历史失败把成功吞掉”的问题已经修复。真实残留是观测粒度：tail recovery 把“失败后恢复成功”折算成 degraded，EVT126 只说“曾降级”，没有明确“曾失败后恢复”，排障者需要翻 folderDiagnostics 才知道原貌。这是标签精度问题，不是终态裁决缺陷。

### 4. S3 reasoning-only 断流：供应商观测项，维持不阻断

证据与既有 K 条目一致。不作为应用设计缺陷；应继续记录、聚合命中率，若供应商连续出现再进入路由策略。

## 新发现的结构性缺陷

### F-A：targeted 修复只验形状，不验来源

`PipelinePanel.vue:4587-4608` 的 `upstreamUsable` 检查 envelope、非空骨架或非空 output，但不检查上游 `callerStatus`。因此失败 S1 的 raw 骨架被视作可用上游。

商业标准下，“产物存在”不等于“产物可信”。失败步骤的产物只能进入失败诊断与重试反馈，不能直接成为下一生成步的事实权威。

### F-B：同一请求存在两个相反 prompt 语义

`bodyArtifactOrchestrator.ts:230-267` 明确说 targeted 修复“旧稿全文不进入本次请求”；但 `_runStepSkillsInner` 链式执行又把 S1 骨架 raw output 设为 current 注入 S2。模型同时收到“不要旧稿”和“这就是上游产物”，只能自行猜测。  
这不是模型不守约，而是应用两个组装层没有共同语义。

### F-C：恢复来源标签精度不足

恢复语义本身已经单源闭环：`runTrace.ts:748-766` 做 tail recovery，`PipelinePanel.vue:2030-2036` 用其结果作为 `resolvePipelineRunOutcome` 的 `folderStatus`。因此失败后成功恢复不会在 outcome 层被误判。  
残留缺口是：恢复后统一表现为 degraded/recoveredFromDegraded，无法直接区分“曾 failed 后恢复”与“原本就是 degraded”。这不是终态风险，而是审计可读性缺口。

### F-D：K87 修复真实存在，不能重开

`stepArtifactAcceptance.ts:226` 已支持内联 FACT_LOCK；`:322-337` 已在权威账本为 0 时输出 `generator_ledger_missing`；结构化失败与 trace 双跳的修复也已在代码路径中。K87 不应列入新修复项，只需纳入回归。

## 设计归属修正

1. `proseWordContract.ts:1` 的 0.8 是应用合同设计值。K88 targeted 产物 2892/3500=0.826 通过，不能归咎应用误判；95% 是 SKILL 域门禁，其是否仍应生效归 SKILL。
2. G2.9 targeted-first 是已验收设计，不是简单错误。缺陷是失败拓扑假设：正文草稿可 targeted，失败骨架应走 full_chain。修复不能把 quality_failed 一律改成 full_chain，否则违反 targeted-first 与物理调用预算。
3. S1 failed 后不进入 S2，不是要新增质量裁判，而是平台合同中“失败产物不得作为权威上游”的执行边界。

## 门禁反查

| 门禁 | 本次执行情况 |
| --- | --- |
| G0.6 四层成熟度 | 已按执行器、应用闭环、接线、验证分层打分 |
| G0.7 正反推 | 每个核心缺陷均有 trace 证据、代码锚点与爆炸半径 |
| G0.9 影响圈七面 | 报告覆盖生产入口、服务层、trace、测试、文档；本轮不改脚本与 UI |
| G0.13 过度设计五问 | 修复方向只加边界语义与测试，不新增裁判、预算系统或调度器 |
| G1.14/G1.15 | 已从症状追到失败拓扑与组装语义 |
| G1.16 | 新增四条纪律候选，见下 |
| G1.17 执行者自盲区 | 承认此前把“已有闸”当成“全拓扑安全”，没有枚举失败产物进入成功路径的缝 |
| G1.31 | K88 未按聚合数字定责，已逐条回对账 |

## 爆炸半径

F-A/F-B 是主风险。若不修，会出现三类反复事故：失败骨架污染正文账本、S3 对账通过但内容权威错误、终态 success 掩盖中途失败。它们不会每次发生，但只要上游失败且 raw 产物非空，就可能发生；这类“低频高害”路径在商业标准中不能靠偶然通过。

F-C 的爆炸半径较低，只是审计误读成本：终态正确，但“曾失败后恢复”需要翻 folderDiagnostics 才能还原。

## 修复核心候选

以下为下一方案的范围，不是本次改动。

1. **失败产物分类**：平台层引入产物形状判定，区分“可修正文草稿”和“不可直接消费的失败骨架/信封”。失败骨架允许作为重试反馈摘要，不允许作为 S2 upstream 权威产物。
2. **targeted/full_chain 裁决升级**：repairScope 不再只看 blockingVerdict 与 previousBody 是否非空，还看失败步骤角色、产物是否含 body、callerStatus。生成步失败且产物不含 body 时走 full_chain；终稿质量失败且有 body 时仍走 targeted。
3. **prompt 组装语义单源化**：targeted prompt 与链式注入必须由同一 executionPlan 决定。要么声明“只注入权威上游产物”，要么声明“失败骨架仅作错误摘要”；不允许一边说不进旧稿，一边链路自动塞 raw。
4. **失败权威阻断**：S2/S3 的 authoritative metadata 只能来自 callerStatus=success 的产物；失败产物账本必须标记 `failed-authority`，不得进入终稿 FACT_LOCK 对账。
5. **恢复来源标签细化**：tail recovery 已是终态单源，不需要改终态裁决；仅在恢复事件或恢复标记中区分 `recoveredFromFailed` 与 `recoveredFromDegraded`，避免“曾失败”被“曾降级”掩盖。此项属低风险观测完善。
6. **失败拓扑回归矩阵**：至少覆盖 S1 failed+raw 骨架、S1 failed+空产物、S2 failed+信封、S2 success+失败上游残留、S3 failure+正文已写、targeted 修复成功、full_chain 修复成功、写入后失败。测试不是锁行，而是锁语义。

## 新纪律候选

按 G1.16 提炼，待用户确认后写入经验文件：

1. **消费面枚举**：任何失败产物在修复或恢复前，必须枚举其全部消费面；只拦返回值不拦注入面不算修复。
2. **失败拓扑枚举**：每个生成步都要回答“failed/degraded/blocked 时产物形状是什么、谁会继续消费它”。
3. **双通道审计**：结构化返回与内容注入是两条通道，必须同时审计；只审结构化通道会把污染藏进内容通道。
4. **组合语义审计**：多个 prompt 组装层必须在同一执行计划下声明产物用途；禁止同一请求出现互相矛盾的授权语义。

## 不纳入本方案

1. 不重开 K87 已修复项。
2. 不改 0.8 应用合同；0.8 是设计值，需变更时另走合同评审。
3. 不因 S3 供应商断流新增阻断策略。
4. 不为本次问题增加新的质量裁判、调度器、预算系统或 UI 面板。
5. 不在本轮清理临时证据文件，待用户确认报告后按 G0.8 收尾记录，再归档 `_audit/tmp-k88-trace-evidence.json`。

## 交付判断

当前可以进入“修复前终审”，不能宣称商业终态。若用户批准上述候选，下一份执行方案应按影响圈七面与失败拓扑矩阵排期；执行顺序建议：F-A/F-B/F-D 回归基线、失败权威阻断、恢复观测收口、失败拓扑矩阵、真实 Electron 烟测。
