# 生成流水线正文层 SKILL 全链路说明 2026-11-14

> 版本：V1.1  文档基线：2026-11-14  适用：凯旋正文层 kaixuan-s1/s2/s3
> 本文只描述当前实现，不新增机制、不替 SKILL 定叙事规则。运行时以 trace 和文件夹指纹为准。

## 0. 定位与责任边界

正文层链路是 S1 -> S2 -> S3 的 folder-chain。应用负责平台合同、路由、预算、trace、供应商通道与产物交付；SKILL 负责叙事结构与质量判断。同一维度只有一个裁判：叙事有效性由 SKILL 声明，应用不推断；平台合同由应用验收，SKILL 不兜底平台终态。

S1 是 analysis，S2 是 generator，S3 是 polish。三个 `meta.json` 均声明 `deai.contractVersion=2`、`generation=on`、`finalStepDetection=on`、`conflictPolicy=report`、`guidanceOwnership=app`。`chainHandoff.role` 是链路身份的唯一声明源。

## 1. 链路总览与数据流

1. 应用冻结供应商通道并启动 run trace。
2. 正文步 `step 4` 构建 S1/S2/S3 链，读取 `chainHandoff.role`，并解析正文生成步索引与终步角色。
3. 应用对生成步注入受保护正文契约句，缺失时阻止物理调用。
4. S1 输出骨架；S2 消费骨架输出 LHC 信封；S3 消费上游账本与信封正文，输出打磨后的 LHC 信封。
5. 应用按净字数与结构化失败路由重试或修复。
6. 终稿过硬信号后处理与契约复验，然后写回章节并记录终态。

关键证据：

- 链提示组装与账本格式：`src/services/chainExecution.ts:101-130`、`:139-206`。
- 角色解析：`src/services/chainExecution.ts:431-505`。
- 契约句与注入门禁：`src/services/chainExecution.ts:50-56`、`src/services/realSkillExecutor.ts:1039-1105`。
- 终稿验收：`src/services/bodyArtifactOrchestrator.ts:390-470`。

## 2. 各步输出合同

### 2.1 S1：analysis

现役形态是骨架字符串 + `【正文交接】`，不是 JSON 信封。应用用 legacy 分段解析账本区块。S1 不交付正文，不声明正文长度合同；它的账本是 S2 施工输入和诊断骨架来源。

模板变量渲染会识别代码围栏和行内代码中的占位符，但不把它们当注入目标。流水线声明清单之外的多余变量记录 `folder-template-variables-missing`；空值渲染为“未设置”；模板内存在未被注入的 `{{...}}` 时记录 `template-placeholder-unresolved` 并阻止请求：`src/services/realSkillExecutor.ts:620-684`、`:865`。

### 2.2 S2：generator

现役形态是 LHC JSON 信封：

```json
{
  "body": "正文纯文本",
  "metadata": {
    "extractedMeta": [
      "【正文交接】\n账本内容\n【正文交接结束】"
    ]
  }
}
```

`body` 必须是纯正文，不混账本、JSON 说明或协议标记。`metadata.extractedMeta[0]` 是完整交接账本。解析入口先尝试 JSON 信封，再回退 legacy：`src/services/generationResult.ts:39-62`。

### 2.3 S3：polish

输出同样必须为 LHC 信封，语义是“body=打磨后的完整正文；extractedMeta=与生成步对账后的交接账本”。S3 不得整段删减正文来过字数门禁，不得虚构事实。终步消费的是上游权威账本，不由 S3 重造。

### 2.4 账本字段与终步账本

应用识别的骨架字段包括：章节、POV、已完成场景、未完成场景、来源覆盖状态、角色状态变化、章末状态、下一章必须使用、场景总数、FACT_LOCK、NEW_FACT。这是重试骨架抽取的当前清单：`src/services/schemaRetryFeedback.ts:28-42`。

终步 `final_step_ledger` 模式把生成步账本作为权威输入。单段上限 4000 字符，总上限 12000 字符：`src/services/chainExecution.ts:151-180`。缺权威账本会抛出 `正文生成步账本缺失`，不允许无 FACT_LOCK 交付：`src/components/pipeline/PipelinePanel.vue:5118-5126`。

S2 产物通过后，终步对账会把上游元数据重置为权威生成步账本；S3 的账本漂移不会覆盖权威账本。执行计划在 attempt 开始时清空上一轮终步元数据缓存，避免跨 attempt 污染：`src/components/pipeline/PipelinePanel.vue:5186-5189`、`:6592-6602`。

## 3. 应用注入面

### 3.1 受保护正文契约

3500 字目标按应用合同解析为下限 2800、上限 7000。最终注入句是：

```text
请生成本章节正文，目标约3500字（不低于2800字，不超过7000字）。正文本体后必须追加【正文交接】区块。
```

该句在 folder preProcess 之后追加到最终 user prompt 尾部，并在物理调用前检查是否存在。缺失时记录 `protected-contract-missing` 并直接失败，不调用 API：`src/services/realSkillExecutor.ts:1039-1105`。候选账本与验收都使用剥除账本后的净正文。

### 3.2 降AI方法指导

S1/S2/S3 的 meta 声明应用拥有注入权。应用只做方法指导，不改稿、不做第二裁判。基础指导包上限 6 条、1200 字符；声纹 700 字符；注入总预算 1900 字符。模型画像当前由账本规则推导，有规则时最多 3 条、600 字符；无规则时不注入。

S2 输出后，应用做阶段诊断并把 `deai-stage-guidance` 拼到 S3 prompt。这属于生成前指导，不修改 S2 成稿，不触发应用侧重试。

证据：指导包上限在 `src/services/deaiGuidancePack.ts:186-232`；模型画像上限在 `src/services/deaiModelProfile.ts:8-10,45-61`；S2 到 S3 阶段指导在 `src/components/pipeline/PipelinePanel.vue:5174-5200`。

注入顺序是：先在下一轮 prompt 尾部拼接阶段诊断指导，再在其上方拼接模型事实画像。S2 后诊断只设置 `pendingStageDiagnosisGuidance`；画像解析发生在每个链步开始时。因此 S1/S2/S3 都可能收到模型画像，而阶段诊断只应出现在 S3：`src/components/pipeline/PipelinePanel.vue:4736-4805`。

### 3.3 重试反馈

每步最多 3 次 attempt。结构化反馈进入 system message；folder-pass-input 导出通常只保存 user prompt，所以不能凭 `payload-prompt.json` 判断反馈缺失，必须看完整 request 或 trace 长度。

反馈策略单源为 bounded-summary、word-gap、handoff-repair、candidate-anchored。word-gap 骨架来源可为 candidate/upstream/none；骨架 800 字符截断。反馈不带候选全文。终步反馈明确说明账本由应用维护，S3 不要复述反馈。

证据：`RETRY_LIMIT=3` 在 `src/services/realSkillExecutor.ts:43-45`；反馈注入位置在 `realSkillExecutor.ts:1030-1046`；策略实现与限长在 `src/services/schemaRetryFeedback.ts:18-82`；终步反馈在 `src/services/finalStepFeedback.ts:32-124`。

第三次 attempt 的调用温度会在原值基础上加 `0.05`，上限 1.0：`src/services/realSkillExecutor.ts:1185`。这是对连续不收敛候选的轻微扰动，不是放宽合同。

### 3.4 物理调用与预算

每个 folder SKILL 调用获得独立预算 16；folder `meta.apiCallLimit` 可作为局部上限。逻辑 attempt 的第 3 次才触发本次 attempt 的自然重试。物理层面的 `retry`、`heartbeat_retry`、`direct_retry`、`continuation` 都会额外扣预算。`retry` 汇报会按 `physicalCallId` 去重，心跳探测同一物理调用不会重复计数。

预算耗尽返回 `blocked`，不产出正文候选。预算证据：`src/components/pipeline/PipelinePanel.vue:3363`；消耗与阻断在 `src/services/realSkillExecutor.ts:999-1005,1113-1140`。

### 3.5 有效性、直出重试与续写

应用先对模型返回做有效性分类，再交给 SKILL postProcess：

- `truncated`：按 body token（completion tokens 减 reasoning tokens）或 finishReason 判定，先续写合并。
- `reasoning_exhausted` / `empty`：按供应商能力选择 `thinking_disabled` 或 `max_tokens_raised` 直出重试。
- 续写返回“已到达协议终点/无待续写内容”时视为协议终点，不拼进正文。
- 直出重试和续写都是可能增加物理调用的平台恢复动作，不改变每步 3 次逻辑 attempt 的语义。

证据：`src/services/generationValidity.ts:62-145`；直出重试与续写在 `src/services/realSkillExecutor.ts:1216-1345`；续写自检在 `src/services/continuationSelfCheck.ts:1-7`。

## 4. 测量、候选账本与保留规则

净字数口径是 CJK 字符逐字计数加 ASCII 词组计数：`src/services/bodyArtifactContract.ts:8-10`。受保护正文测量先提取正文，再计数：`src/services/protectedSkillContract.ts:46-77`。

每个 attempt 记录 rawChars、netWords、handoffCount、contractDistance、missingHandoff、valid、errorCount。重试耗尽后优先保留 valid 候选，否则按错误少、有交接、距离小、更早 attempt 保留：`src/services/realSkillExecutor.ts:1713-1760`。

最终验收不使用原始输出计数，而使用 `parseGenerationResult` 提取后的 body：`src/services/bodyArtifactOrchestrator.ts:394-470`。

## 5. 叙事裁决与路由

应用只消费 SKILL 显式 verdict，不推断叙事质量。

- `narrativeStatus: ready`：继续正常验收。
- `narrativeStatus: not_ready`：第一次物理返回即标记 `chapter-narrative-not-ready`，不进入正文层普通重试。
- `[NOT-READY]` 或 `[BLOCK]` 且 retryable：走 targeted 修复，从生成步重跑，复用 S1。

证据：`src/services/chapterEventDensity.ts:1-97`；结构化失败归一在 `src/services/bodyArtifactOrchestrator.ts:78-106`。

## 6. 修复路由

初次生成 `repairScope=none`。阻断类失败走 targeted；质量失败先 targeted；targeted 失败后 full_chain 兜底。targeted 的执行计划从生成步开始，复用上游产物；full_chain 从链首重跑：`src/services/bodyArtifactOrchestrator.ts:192-240,330-360`。

targeted prompt 明确说明旧稿全文不进入本次请求；交接阻断时提示“上一版结果是 SKILL 交接阻断消息，不是可用正文”：`src/services/bodyArtifactOrchestrator.ts:241-292`。

候选账本重试耗尽后有两条不同状态：SKILL 硬门禁阻断标记 `blockingGateFailed=true` 并返回 `failed`；只有结构化 schema 警告时返回 `degraded`，同时保留最佳候选交由产物契约门裁决。这个状态差是应用侧 targeted/full_chain 路由的输入，不是对 SKILL 质量的改判：`src/services/realSkillExecutor.ts:1746-1763`。

postProcess 使用 `{ output, usage }` 输入。SKILL 可返回 `output`、`valid`、`errors/issues/warnings`、`_perf`；`_perf` 是 advisory，不是阻断器。应用只信任 blocking issue 的阻断作用，并把 `perf` 记录为 advisory 对象、`usageUnavailable` 或 `thresholdNotMet`：`src/services/realSkillExecutor.ts:43,1369-1425`。

断点恢复和 targeted 复用上游 S2/S3 产物前，必须通过 `isGeneratorEnvelopeArtifact`。该检查只看交付形态：JSON 信封、非空 body、非空 extractedMeta，不评质量。失败降级整链并记录 `body-resume-artifact-invalid` 或 `body-targeted-repair-artifact-missing`：`src/services/chainExecution.ts:384-401`、`src/components/pipeline/PipelinePanel.vue:4519-4588`。

## 7. 断点恢复与产物状态

断点产物若是旧信封或不可恢复形态，会先迁移或重置；恢复到生成步之后时，若产物不是生成器信封，则从头执行。历史物理调用 failed 只在最终产物未被接受时毒化 run 终态；终稿交付后，历史调用失败只体现为 recoveredFromDegraded，不覆盖成功终态：`src/services/pipelineRunOutcome.ts:24-60`。

旧 `__shenyiStepArtifact` 信封只允许在断点恢复边界迁移。成功或降级的合法旧信封提取内部 `output`；解析失败或非法状态重置为链首并记录 `legacy-step-artifact-breakpoint-sanitized`。该兼容层不出现在新生成路径，S2/S3 新产物必须直接使用 LHC 信封：`src/components/pipeline/PipelinePanel.vue:4447-4468`。

正文链多步时，缺失正文契约会直接失败；生成步索引无法唯一识别时抛出 `generator_not_identified`，禁止向所有步骤注入契约：`src/components/pipeline/PipelinePanel.vue:6602-6632`。

## 8. trace 观测点

对账时按事件读语义，不要用心跳或日志行数倒推物理调用。

| 事件 | 含义 |
|---|---|
| `chain-context-slim` | 链步上下文裁剪决策 |
| `folder-pass-input` | SKILL 前置输入测量 |
| `folder-skill-version-mismatch` | 中途磁盘 SKILL 与 run 指纹不一致 |
| `folder-skill-blocking-gate` | SKILL 硬门禁失败 |
| `folder-skill-degraded-with-error` | 降级但有可交付产物 |
| `schema-retry-feedback-composed` | 结构化重试反馈合成 |
| `final-step-feedback-composed` | 终步重试或教学反馈合成 |
| `protected-contract-missing` | 受保护契约未进入请求，已阻止调用 |
| `deai-injection-policy` | 降AI注入归属与变体 |
| `deai-guidance-pack` | 基础指导包实际条数与预算 |
| `deai-conflict-policy` | 应用投影与 SKILL 重叠处理 |
| `deai-prompt-variant` | 实际注入变体与字符数 |
| `deai-stage-guidance` | S2 后诊断到 S3 的生成前指导 |
| `deai-model-profile` | 模型画像释放与注入条数 |
| `deai-calibration` | 终稿诊断入校准账本 |
| `legacy-step-artifact-breakpoint-sanitized` | 旧信封断点产物迁移或重置 |
| `generation-invalid` | 正文有效性分类失败 |
| `direct-retry-start` / `direct-retry-finished` | 直出重试开始与结果 |
| `continuation-self-check-skipped` | 续写返回协议终点，保留原候选 |
| `template-placeholder-unresolved` | 模板占位符未注入，已阻止请求 |
| `api-budget-blocked` | API 调用预算耗尽，返回 blocked |
| `body-generator-step-resume-restored` | attempt 开始恢复生成步索引 |
| `body-generator-step-unresolved` | 生成步无法唯一识别 |
| `body-resume-artifact-invalid` | 断点产物缺生成器信封，整链重跑 |
| `body-targeted-repair-artifact-missing` | 定点修复缺上游产物，整链重跑 |
| `chapter-narrative-not-ready` | SKILL 显式叙事阻断 |
| `body-final-step-metadata` | 终步元数据对账 |
| `body-artifact-attempt` | 每轮修复 attempt 的验收细节 |
| `body-post-process-contract-rejected` | 后处理破坏合同，禁止交付 |
| `body-artifact-terminal` | 正文验收终态失败 |
| `body-artifact-validated` | 终稿验收通过 |

trace 保留审计事件白名单，渲染内存事件有上限；导出产物仍保留磁盘全量。证据：`src/stores/runTrace.ts:1035-1060`。

## 9. 指纹 pin 与导入覆盖

run 首次加载 folder SKILL 时钉住指纹。运行中途磁盘文件变化会触发 `skill_version_mismatch`，阻断继续执行：`src/services/realSkillExecutor.ts:764-770,974-1010`。

当前声明指纹：

- S1：`DA9D0338 / 28640B`
- S2：`5E2ABBDF / 49222B`
- S3：`E4B3C58F / 73332B`

这些值是 2026-11-13 修复后的快照，不是永久契约。SKILL 更新、导入覆盖或版本升级后必须以新 run 的 trace 指纹为准；不得假设旧指纹永远有效。

## 10. 当前未闭环项

1. `postProcessReport.perf` 已接线为 advisory 对象、`usageUnavailable`、`thresholdNotMet` 三态。真实供应商 trace 需在 3.127.5+ 运行中回填；回填前 Phase D 保持 untested。
2. 模型画像释放已从硬编码 false 改为按账本规则推导，但当前样本仍可能为 0 规则。观测以 `deai-model-profile.released / releaseGate / injectedRuleCount` 为准。
3. targeted/full_chain 路由已实现并由真实 trace 验证；后续仍需按新运行记录持续对账 S3 多败时的路由决策，不新增修复系统。
4. B6 效果验证仍为 provisional，不宣称方法指导已产生稳定质量增益。

## 11. 禁止事项

1. S2/S3 禁止把账本混进 body，禁止输出裸账本字符串作为成品。
2. S3 禁止为了过字数删掉事实、场景结果或整段压缩。
3. SKILL 不得假设应用会回填缺失账本为“可用正文”；权威账本缺失就是交付形态失败。
4. SKILL 不得把平台合同验收当成叙事裁判，也不得把降AI指导当成改稿指令。
5. 诊断不得只看 user prompt 推断重试反馈缺失；要看完整 request 和 trace。
6. 诊断不得把心跳、reasoning-only、provider retry 事件当成额外物理调用。
7. 任何层不得用旧指纹或旧手册字段推翻当前 trace。
8. 新生成不得重新使用 `__shenyiStepArtifact`；它只允许作为旧断点产物的一次性迁移边界。
9. 不得把直出重试、续写或心跳恢复当成叙事质量修复；它们只处理空输出、reasoning-only 和 truncation。
10. 不得把 `_perf` advisory 当作阻断信号，也不得为 advisory 扩大重试次数。

## 12. 变更纪律

本文是当前实现的说明文案，不是需求变更单。SKILL 结构迭代仍归 SKILL；若输出形态、角色声明或账本边界变化，必须同步更新本文和 trace 对账口径。新增机制必须先过责任边界与过度设计门禁。
