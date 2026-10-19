# 任务台账：正文层终步元数据保真与反馈单源化

## 1. 目标与原话

用户已确认执行 v4.1 方案。原始目标：修复正文层终步 S3 元数据退化、终稿事实账变薄、终步 retry 复述诱导、降AI诊断与 schema retry 指令冲突；同时落实验证流程契约七项。

最终可感知行为：S3 后应用独立核对 S2 权威账本；终稿、断点恢复、下一章上下文三面同源；终步 retry 只有一个反馈块且不携带 S3 候选全文；folder 与非 folder、变长链、compose、非正文层、断点恢复边界全部可判定。

## 2. 门禁读证

- G0.3 诚实闭环：无法验证面必须登记 `untested`。
- G0.5 回头看：收尾前逐项对账方案、diff、入口、验证证据。
- G0.6 方案成熟度：以 v4.1 方案为执行依据。
- G0.9 影响圈声明：只改方案登记影响面。
- G0.10 新旧并存清零：旧终步反馈与旧账本通道必须反查清零。
- G0.12 本文件为执行凭证，七节不可空。
- G1.1 精准编辑：不借机重构无关代码。
- G1.5 验证器自身质量：证据哈希、超时、完整重跑、夹具职责差异、三面查账。
- G1.6 mock 与夹具契约：S2、S3 好样稿、label_drift、body_divergence 样稿互不相同。
- G1.7 构建产物新鲜度：Electron 验证先校验 dist 新鲜度。
- G1.8 日志与观测同步：新事件与字段同批升级存储、导出、验证器。
- G1.17 作者反证：执行边界反证矩阵不得删减。
- G2.9 终稿与流水线：断点、attempt、终稿产物同步传递。

## 3. 路由判定

加入：G0.3、G0.5、G0.6、G0.9、G0.10、G0.12、G1.1、G1.4、G1.5、G1.6、G1.7、G1.8、G1.17、G2.9。

排除：

- G1.18 本地确定性路径：本轮不改本地文件写入语义。
- G2.10 客户问题处置：本轮是流水线内部修复。
- G2.11 供应商软错误：不改供应商错误分类。

## 4. 影响圈与作者反证

打算改：`chainExecution.ts`、`stepArtifactAcceptance.ts`、`PipelinePanel.vue`、`realSkillExecutor.ts`、`de-ai.js`、相关 spec、trace 存储与导出、Electron 验证脚本、DEV_LOG 与经验文件。

可能碰到：断点恢复、attempt 生命周期、folder 与非 folder 双通道、compose 单调用、卷纲/设定层负向边界、下一章上下文。

作者反证：

- 假设一：终步只要传回账本即可。证伪：若终步角色未确认，可能把中间步账本误传给非打磨步，必须降级摘要并 warning。
- 假设二：conflicting 一律回填。证伪：body_divergence 会被标签回填掩盖为元数据问题，必须禁止回填。
- 假设三：retry 不传 S3 候选即可。证伪：若无上游 S2 输出与锚点，事实来源断供，会凭空重写。
- 假设四：单源反馈只改 folder 通道。证伪：非 folder 通道会继续注入矛盾协议，必须双通道覆盖。
- 假设五：773 秒可作为硬阈值。证伪：供应商单次波动会误判，必须记录阶段耗时、请求数、重试数同表对比。

## 5. 停止条件

- 方案停止条件 1-8 全部有本轮原始证据。
- S3 退化样例终稿 metadata 与 S2 权威账本逐键一致；body_divergence 不回填。
- 中间步摘要请求无账本原文回归。
- 终步 retry 无 S3 候选全文，仍携带 S2 上游输出与失败指标。
- 终步 retry 只有一个反馈块，矛盾指令对命中 0。
- folder、非 folder、变长链、compose、非正文层、断点恢复六项反证矩阵通过。
- 验证流程契约七项落实；证据哈希留存；无法验证面登记 `untested`。

## 6. 执行证据

状态：已收口。机器验证、反证矩阵、完整 Electron + 真实 API live 复跑均已留下原始证据；未验证面在第 7 节如实登记。

### GAP-2026-10-19-06 修复证据

- 根因修复：`src/services/volumeBatchOrchestrator.ts:178` 新增 `syncVolumePromptProgress()`；`src/services/volumeBatchOrchestrator.ts:207-216` 在每次请求前把 `[已生成卷数]` 回写为 `contract.existingCount + accepted.length`，`src/services/volumeBatchOrchestrator.ts:239-246` 将 `progressFactsSynced/progressFactsCount` 写入 prompt audit。
- 模板语义修复：`src/components/pipeline/PipelinePanel.vue:2492` 在卷纲层（step 2）把 `volumeCount` 注入为 `volumePlan.plannedVolumeCount`，S1 模板 `全书卷数` 恢复为计划卷数语义；其他层保持 `generatedVolumeCount` 原语义。
- 观测同步：`src/components/pipeline/PipelinePanel.vue:4212-4221` 将事件升级为 `volume-prompt-fact-audit`，同时输出事实同步审计与 prompt 长度。
- 回归证据：`npx vitest run src/services/volumeBatchOrchestrator.spec.ts` → exit 0，`Test Files 1 passed (1), Tests 24 passed (24)`。新增用例证明第二轮请求包含 `[已生成卷数]\n1`、`第1卷《第一卷》`、`本次只生成第2卷`，且不再匹配 `[已生成卷数]\n0`。

### 终步元数据保真修复证据

- 实现面：`src/services/stepArtifactAcceptance.ts` 增加正文终步元数据修复与事实偏差 warning；`src/services/finalStepFeedback.ts` 单源组装终步失败反馈；`src/services/chainExecution.ts` 在链式终步消费同一反馈面，保证 S3 retry 不再携带候选全文。
- 反证矩阵：`npx vitest run src/services/finalStepMetadataWiring.spec.ts src/services/finalStepFeedback.spec.ts src/services/finalStepMetadataReplay.spec.ts` → exit 0，`Test Files 3 passed (3), Tests 15 passed (15)`。覆盖 folder、非 folder、断点恢复、compose、非正文层与终步角色推断边界。
- 实现面回归：`npx vitest run src/services/chainExecution.spec.ts src/services/stepArtifactAcceptance.spec.ts src/services/realSkillExecutor.spec.ts src/services/de-ai.spec.ts src/services/volumeBatchOrchestrator.spec.ts` → exit 0，`Test Files 5 passed (5), Tests 107 passed (107)`。
- 全量回归：`npx vitest run` → exit 0，`Test Files 177 passed (177), Tests 2048 passed (2048)`。
- 类型与构建：`npm run type-check` → exit 0；`npm run build:vue` → exit 0，双产物 `dist-renderer/index.html` 与 `dist-renderer/providerProtocols.cjs` 构建完成。
- 第 12 轮完整 Electron + 真实 API live：终态输出 `===== PIPELINE ARTIFACT CONTRACT ELECTRON LIVE PASSED =====`；证据见 `_audit/verification-pipeline-artifact-contract-live/summary.json`（generatedAt `2026-10-19T20:14:41.920Z`）与 `_audit/verification-pipeline-artifact-contract-live/phase5b-summary.json`。
- Phase 5B 关键观测：Step 1/2/3/4 全部 `success`；Step 0 为 `degraded`，但已作为风格分析入口进入 run，运行与观测链路可追溯。Step 2 卷纲层 12 次 API/物理调用，`durationMs: 2078459`，3 卷完整收敛；Step 4 正文层 3 次 API、7 次物理调用、4 次 schema retry，`durationMs: 663091`。
- 终步元数据 live 证据：正文层 trace 已出现 `final-step-feedback-composed`、`body-final-step-metadata`、`body-final-step-metadata-repaired`，证明反馈组装、元数据提取与修复链路在真实 API 输出上闭环。

## 7. 缺口清单

状态：已收口。GAP-01 到 GAP-10 均已登记、裁决并按各自停止条件关闭；无静默扩项。

### GAP-2026-10-19-01：Step 0 风格分析缺少 API 调用观测

- 发现来源：Task 9 Electron 真实 UI 硬门禁，`verify-pipeline-artifact-contracts-electron.mjs` 在 Step 0 导出失败。
- 现象：run 存在、事件存在，但 `apiCalls = 0`；`exportLatestRun` 按契约只导出有 API 活动的 run，因此返回 `null`。
- 根因：`PipelinePanel.handlePipelineStyleAnalysisRequest()` 与 `OutlineWorkspace.handleStyleAnalysisRequest()` 直接调用 `aiService.callAi`，没有 `runTraceStore.startApiCall/finishApiCall`，也没有记录物理请求。
- 裁决：这是应用观测缺陷，不是验证器误报；验证器“无 API 活动的 run 不算证据”的口径保持不变。
- 修复：两个入口补齐 API 调用账本与物理请求记录；补回归测试；完整重跑 Electron 验证。
- 2026-10-19 18:25 完整重跑发现第二层缺口：API 调用已进入 run，但 run 名称仍为旧 UI 文案 `创作风格 AI 分析`，Step 0 导出契约要求 `大纲风格分析`。裁决为统一运行契约名，放宽验证器属于掩盖缺陷。
- 关闭证据：第 12 轮 live `summary.json` 中 Step 0 已有 `api-start`、`physical-call`、`api-success` 事件，状态 `degraded` 但运行、API 调用与观测链路可追溯；`phase5b-summary.json` 记录 `apiCallCount: 1, physicalCallCount: 1`。

### GAP-2026-10-19-03：验证器把 transport heartbeat 当作任务进度

- 发现来源：Task 9 第 4 次完整真实重跑，卷纲层 S2 在 480s 步骤超时内停滞，但 `waitForLayerCompletion` 未触发 `STALLED/DEAD_TIMEOUT`。
- 现象：S2 单请求 27,729 字节，仅 1 次 `stream_delta` 后 285s 无正文；`run-activity` 每 15s 追加 `physical_call_heartbeat`，导致 `events.length + lastEventType` 签名持续变化。
- 根因：验证器活性口径未对齐应用内 `toolRunSupervisor.physicalCallReportsProgress` 语义。heartbeat 是传输层保活，不是任务进度；事件数增长不能重置 idle 计时。
- 裁决：验证器缺陷，不是产品新缺陷；按 G1.5“验证器自身也是被测对象”修复，不允许为通过验证调大超时。
- 修复：`currentRunSnapshot` 输出忽略 heartbeat 后的有效事件数、最后有效事件、有效物理进度与最后进度时间；`waitForLayerCompletion` 用有效进度签名与 `lastProgressAtMs` 判定停滞。

### GAP-2026-10-19-04：卷纲链式请求混入与 folder SKILL 冲突的旧 JSON 输出协议

- 发现来源：GAP-03 失败现场的 `payloads/006-request.json` 与成功基线对照深读。
- 现象：S2 user prompt 同时包含 `请生成3卷的卷纲。输出JSON数组...`、`本次只生成第1卷...输出JSON数组...`，而 system 明确要求 `不得输出 JSON`、首字符必须是 `【`。
- 根因：`buildVolumePrompt` 面向旧直连 JSON 解析通道；`generateVolumeBatch` 又把该 prompt 作为 folder 链的初始 prompt 传入 `runStepSkills`。S1/S2 folder SKILL 的执行协议已改为标记文本，但旧输出协议未按调用形态剥离，形成协议混杂。成功样本同样混杂，说明这是慢性病灶，本次长推理将其放大。
- 裁决：应用层缺陷。不能靠 SKILL 层“自行忽略”解决；请求层必须在 folder 链入口移除已失效的 JSON 输出指令，同时保留大纲、设定、卷数、预算等事实内容。
- 修复：在 `volumeBatchOrchestrator` 的 prompt 构建单源处为 folder 链剥离旧 JSON 输出协议，并补正负测试证明事实内容与单卷约束未被破坏；完整重跑真实 UI/API 验证。

### GAP-2026-10-19-05：folder 卷纲链仍在重新注入直连 JSON 输出协议

- 发现来源：GAP-04 修复后第 5 次真实 UI/API 重跑失败，`failure-live-export/卷纲层/payloads/001-request.json` 仍含 `输出JSON数组...contractRisk`。
- 现象：请求从 27,729 字节降到 19,161 字节，证明旧直连协议剥离生效；但 user prompt 末尾仍追加 `VOLUME_OUTPUT_PROTOCOL`（9 字段、数组长度约束、contractRisk 枚举），与 S1 system 的“只输出解析产物、禁止 JSON、首字符必须是【”形成新冲突。
- 根因：`stripLegacyVolumeJsonProtocol()` 只清理 base prompt 旧协议，`buildVolumeBatchPromptWithAudit()` 的 3 个分支又无条件追加 `VOLUME_OUTPUT_PROTOCOL`。输出协议未按 folder/direct 通道分流。
- 对照：成功基线也残留旧 4 字段 JSON 指令，但 S1 模板明确“应用 JSON 指令只当任务边界，不改变输出协议”，因此旧指令是慢性杂质；本次新增 9 字段契约会诱导 S1 参与生成终产物并改变职责边界，属新引入冲突。
- 裁决：folder 链请求层禁止注入直连输出协议；直连链保持 JSON 输出契约。禁止放宽 S1 模板来迁就应用注入。
- 修复：`buildVolumeBatchPromptWithAudit` 增加 `outputProtocol: 'folder-chain' | 'direct-json'`，folder 形态不追加 `VOLUME_OUTPUT_PROTOCOL` 与数组长度指令，保留任务边界事实；补 folder/direct 正负测试；完整重跑真实 UI/API 验证。

### GAP-2026-10-19-06：卷纲逐批上下文把“已生成卷数”与“已生成卷事实清单”写成矛盾事实

- 发现来源：GAP-05 修复后第 6 次真实 Electron + 真实 API 完整重跑失败，证据导出于 `_audit/verification-pipeline-artifact-contract-live/failure-live-export/卷纲层/`。
- 现象：第一轮 S1-S4 全部走完并产出 JSON 卷纲后，验收为 `repairAttempt:0, status:"short", requestedCount:3, acceptedCount:1, missingStart:2, missingCount:2`；第二轮从第 2 卷重新整链生成，但 `payloads/021-request.json` 同时注入 `[已生成卷数] 0` 与 `[已生成卷事实清单] 第1卷《风暴起点》分配字数3333`，模型在 `024-reasoning.json` 中明确指出两处事实矛盾并困惑。
- 初步定位方向：`已生成卷数` 与事实清单疑似不同源、不同步；同时需要核对验收口径为何第一批只接受 1 卷，以及 900s 步骤超时对“3 卷 × 整链 4 步长推理”的结构性匹配。
- 裁决：先按本条登记再深挖；GAP-05 的协议剥离已生效（请求中无 `VOLUME_OUTPUT_PROTOCOL`/直连数组输出残留），S4 JSON 属于 folder SKILL 自身终产物协议，不在本缺口回滚范围内。禁止通过放宽验收或调大超时掩盖事实注入缺陷。

### GAP-2026-10-19-07：验证器把持续流式推进的长链误判为固定超时

- 发现来源：GAP-06 修复后第 7 次真实 Electron + 真实 API 完整重跑，Step 2 在 900000ms 预算到期时失败。
- 现象：第 1 卷 S1-S4 完整收敛，切换第 2 卷后 `physical-call`、`run-activity` 与 `lastProgressAtMs` 持续刷新，`physicalProgress=true`，无停滞；但固定单层 15 分钟预算到期切断运行。
- 根因：3 卷真实链按实测第 1 卷约 12 分钟推算需要约 36-48 分钟，`waitForLayerCompletion` 却复用固定 `STEP_TIMEOUT_MS`。已有停滞/死亡监控足以发现无效等待，固定总预算却把健康长流式任务判死，违反 G1.19“持续 heartbeat 与流式增量被总时长超时切断时登记超时策略缺陷”。
- GAP-06 复查：`failure-live-export/卷纲层/payloads/021-request.json` 已含 `[已生成卷数] 1`、`第1卷《风暴起点》`、`本次只生成第2卷`，事实同步修复未复发。
- 裁决：验证器缺陷，不是应用或供应商缺陷；不允许用隐式环境变量掩盖结构性预算错误。
- 修复：`waitForLayerCompletion` 增加逐层 `timeoutMs`；卷纲层显式使用 `STEP_TIMEOUT_MS * 3` 覆盖 3 卷真实链，停滞 2 分钟、死亡 5 分钟监控保持不变。
- 验证：`node --check scripts/verify-pipeline-artifact-contracts-electron.mjs` 通过；完整 Electron + 真实 API 复跑待执行，未提前宣称通过。

### GAP-2026-10-19-08：卷纲验证器仍把旧 batch 一次性措辞当作唯一合法证据

- 发现来源：GAP-07 修复后第 8 次真实 Electron + 真实 API 完整重跑，生成链路成功，验证器在卷纲层断言失败。
- 现象：run 终态 `success`，`volumeCount: 3`，验收事件 `actualCount: 3, status: complete`；请求里存在 `全书卷数：3`、`[卷数]\n3`、`本次只生成第1/2/3卷`、`[已生成卷事实清单]`，但不存在字面短语 `生成3卷的卷纲`。
- 根因：应用已按逐卷生成口径组装请求；`生成${expectedCount}卷的卷纲` 只存在于 batch 模式。验证器把旧 batch 措辞当作唯一断言，对真实成功的逐卷链形成过拟合误报。
- 对照：GAP-06 的事实同步未复发；第 1/2/3 卷请求分别携带各自单卷边界，历史卷事实账本存在。
- 裁决：验证器断言缺陷，不是应用或 SKILL 缺陷；禁止回退应用逐卷语义来迁就旧断言。
- 修复：断言改为语义事实组合：三卷计划事实（`全书卷数：3` / `[卷数]\n3` / `全书计划到第3卷` / 旧 batch 短语任一）+ 第 1/2/3 卷各自单卷边界 + 历史卷事实账本。
- 验证：`node --check`、基于 failure-live-export 的离线断言回放、完整 Electron + 真实 API 复跑，三项齐备后才可关闭。
- 关闭证据：第 12 轮 live 终态 `===== PIPELINE ARTIFACT CONTRACT ELECTRON LIVE PASSED =====`；`scripts/verify-pipeline-artifact-contracts-electron.mjs:955-960` 已消费语义事实组合；Step 2 卷纲层 `success`，3 卷完整收敛，逐卷语义未回退。

### GAP-2026-10-19-09：卷纲层预算仍按“每卷三次调用”旧形态估算

- 发现来源：GAP-08 修复后第 9 次真实 Electron + 真实 API 完整重跑，Step 2 在 1440000ms 总预算到期时失败，证据导出于 `_audit/verification-pipeline-artifact-contract-live/failure-live-export/卷纲层/`。
- 现象：第 1 卷 S1-S4 完整完成并触发 `volume-prompt-fact-audit`；进入第 2 卷 1/4 后 `physical-call`、`physicalProgress=true`、`lastProgressAtMs` 持续刷新，无停滞。总预算到期时运行仍处于健康流式状态。
- 根因：GAP-07 将卷纲预算提升为 `STEP_TIMEOUT_MS * 3`，其注释与估算仍基于“每卷三次 API 调用”的旧形态；实测单卷四步链约 15-20 分钟，三卷顺序生成需要 45-60 分钟以上。固定 24 分钟预算对真实逐卷链仍过紧。
- 对照：GAP-06 事实同步未复发；GAP-08 语义断言已通过离线回放。本缺口不是应用、SKILL 或供应商缺陷。
- 裁决：验证器预算缺陷；不允许用环境变量或放宽停滞监控掩盖。停滞 2 分钟、死亡 5 分钟监控保持不变，因此延长结构性总预算不会掩盖真停滞。
- 修复：卷纲层显式预算调整为 `STEP_TIMEOUT_MS * 9`（72 分钟），并同步修正注释为实测四步逐卷链口径。
- 验证：`node --check` 通过后完整 Electron + 真实 API 复跑，得到终态输出 `===== PIPELINE ARTIFACT CONTRACT ELECTRON LIVE PASSED =====` 才可关闭。
- 关闭证据：第 12 轮 live Step 2 `success`，`durationMs: 2078459`（约 34.64 分钟），12 次调用完成三卷四步链；`scripts/verify-pipeline-artifact-contracts-electron.mjs:1358` 使用 `STEP_TIMEOUT_MS * 9`，全程未触发结构性预算切断。

### GAP-2026-10-19-10：正文层预算把三步真实链误套为单步 8 分钟

- 发现来源：GAP-09 修复后第 10 次真实 Electron + 真实 API 完整重跑，Step 4 正文层在 480000ms 到期时失败，证据导出于 `_audit/verification-pipeline-artifact-contract-live/failure-live-export/正文层/`。
- 现象：S1 134.778s 完成；S2 含 `schema_retry` 共 317.093s，终态 `api-success`，统一验收 `decision:"accept", reason:"contract_valid"`，`【正文交接】` 与 `FACT_LOCK` 元数据完整；S3 于第 466.562s 发起，15.014s 后已有 `stream_delta`，运行保持 `physicalProgress=true` 且 `lastProgressAtMs` 持续刷新。480s 墙钟到期时无停滞、无失败。
- 根因：`generateBodyThroughUi()` 复用单步默认预算 `STEP_TIMEOUT_MS`，而正文层是 S1/S2/S3 三次真实 API 调用，S2 还可能包含 schema retry。这与 GAP-09 的“验证器预算按旧形态估算”同型；实测健康三步链已超过单步预算，结构性总预算必然提前切断。
- 对照：S2 统一验收通过；终步 `final-step-role-unresolved` 是 Fix B 已定义的显式 warning，不是静默失败；S3 已收到流式正文，说明不是模型停摆。
- 裁决：验证器预算缺陷，不是应用、SKILL 或供应商缺陷。禁止通过放宽断言、缩短链路或降低真实 API 强度造通过；停滞 2 分钟、死亡 5 分钟监控保持不变。
- 修复：正文层显式预算调整为 `STEP_TIMEOUT_MS * 3`（24 分钟），覆盖 S1/S2/S3 三步链及合理 schema retry；注释写明三步链口径。
- 验证：`node --check scripts/verify-pipeline-artifact-contracts-electron.mjs` 通过；完整 Electron + 真实 API 复跑得到 `===== PIPELINE ARTIFACT CONTRACT ELECTRON LIVE PASSED =====` 后才可关闭。
- 关闭证据：第 12 轮 live Step 4 `success`，3 次 API、7 次物理调用、4 次 schema retry，`durationMs: 663091`（约 11.05 分钟）；`scripts/verify-pipeline-artifact-contracts-electron.mjs:727` 使用 `STEP_TIMEOUT_MS * 3`，预算与真实三步链形态匹配。

### 无法验证面登记（untested）

- 供应商形态覆盖：本轮 live 使用 `deepseek-v4-pro` 单一供应商形态，其他供应商/模型组合未做同强度 live 复跑，登记 `untested`，不得宣称已覆盖。
- SKILL 层 1500 字结构下限与降 AI 约束冲突：应用保持结构下限与降 AI 约束不放宽，冲突定性为 SKILL 层缺口，转交 SKILL 层整改；应用侧本轮只保证元数据、反馈与验收链路可观测、可修复、不吞失败。
- 长尾模型输出形态：终步元数据修复只覆盖本轮反证矩阵与真实 API 观测到的形态；未来新形态必须先由 trace 证据登记，再进入新缺口，不允许静默修复。
