# 2026-10-29 正文层内嵌降AI V2 升级方案

## 0. 目标

把 2026-10-29 GitHub 基准审查确认的可采纳机制，移植进生成流水线正文层内嵌降AI，不引入外部 SKILL 作为第二执行权威。

核心目标：

1. 检测内核从“固定词表 + 固定阈值”升级为“自适应阈值 + n-gram 指纹 + 场景分层 + 整体评分”。
2. 深度修复补上 30%/50% 变更率门禁，防止整章换腔。
3. 创作风格卡片接入降AI链路，形成作者声纹单源。
4. 降AI异常和质量门禁降级显式可见，不再静默吞掉。
5. 保留现有架构优势：生成期注入、三模式分离、FACT_LOCK、契约复验、trace 观测。

非目标：

- 不直接挂载外部 humanizer SKILL。
- 不引入外部词表和英文阈值。
- 不改变正文层 folder SKILL 的执行协议。
- 不把商业检测器分数当作最终目标。

## 1. 基线与结论

当前实现保持 V1 架构：

- 生成期注入：`src/services/de-ai.js:736-768`、`src/components/pipeline/PipelinePanel.vue:3505-3554`
- 三模式后处理：`src/components/pipeline/PipelinePanel.vue:5801-6005`
- 深度修复保护：`src/components/pipeline/PipelinePanel.vue:6089-6168`
- 契约复验：`src/components/pipeline/PipelinePanel.vue:5823-5847`、`:5933-5958`

V2 是内核升级，不是架构重写。folder SKILL 仍是唯一执行权威；降AI只提供 guidance、确定性检测和本地门禁。

## 2. 经验门禁对账

| 门禁 | 对方案约束 |
|---|---|
| G0.3 诚实闭环 | 评分、阈值、voice profile 未校准前标记 `provisional`，不冒充已校准 |
| G0.6 方案成熟度 | 四层成熟度见第 9 节；阈值校准是唯一放行断点 |
| G0.9 影响圈 | 明确只碰 `de-ai`、Pipeline 降AI接线、trace、测试，不动 folder 协议 |
| G0.10 新旧并存清零 | trace 与报告字段同批迁移；旧假指标删除并有负向断言 |
| G1.4 验证分层 | 单测、链路集成、Electron UI、样本校准分层声明，不互相冒充 |
| G1.8 观测同步 | 新增 deai 事件必须进 runTrace、导出通道、测试白名单 |
| G1.9 状态机 | `quality_gate_degraded` 注册进终态映射，不允许语义漂移 |
| G1.14 性能账本 | 本地检测/变更率计算纳入分段耗时，防止新增门禁造成卡顿 |
| G1.15 自盲区 | 对“指标好看但正文变差”做反向验证，不只测分数下降 |
| G2.9 流水线 | 后处理仍复验 body contract，不因降AI放行失败产物 |
| G2.13 SKILL 单源 | 不新增第二 SKILL 权威，只吸收机制 |

## 3. 架构原则

1. **单源执行权威**：正文 folder SKILL 继续负责模板、postProcess、schema、handoff；降AI不接管执行。
2. **单源风格权威**：`StyleProfile` 与 `compileStyleContext('body')` 是唯一风格来源；降AI只消费投影，不另建风格卡片。
3. **检测与修复分层**：检测器只报告；深度修复才改写；变更率门禁决定是否回滚。
4. **本地确定性门禁**：n-gram、变更率、漂移、评分全部本地计算，不增加 API 请求。
5. **阈值可配置且可校准**：默认值为 `provisional`，经真实中文网文样本校准后定版。
6. **注入路径单源化**：降AI生成期提示只能由一个投影函数产出；folder 路径与 agent 变体路径共享同一结果，禁止两处手抄拼接。

## 4. 分阶段实施

### Phase 1 观测诚信修复（P0）

改动：

1. `detectBody` 删除 `protectedSpans.hit/missing` 与 `retentionRatio` 假指标，只保留 `protectedSpans.total`。
2. `retentionRatio` 只在深度修复后由 `verifyProtectedSpans` 计算，写入 `deai-minimal-edit`。
3. `collectFinalStepDeaiFindings` 异常不再返回静默空数组；写入 trace warning，并进入 `quality_gate_degraded`。
4. UI 汇总显示“降AI门禁降级”，不允许只在事件流深处可见。

验收：

- 单测证明 must span 丢失时 retentionRatio 不等于 1。
- 单测证明检测异常会产出 `quality_gate_degraded`。
- trace 导出可见 warning。

### Phase 2 变更率门禁（P0）

新增本地计算：

1. 原稿与修复稿按句切分，标点归一后计算句级 LCS。
2. `changeRate = 1 - LCS / max(sentenceCount, 1)`。
3. `changeRate >= 0.50` 拒绝修复，保留原文。
4. `0.30 <= changeRate < 0.50` 写 warning，允许继续但 trace 可见。
5. 阈值随 blocking findings 数量分级，低风险文本不被迫大改。

接线：

- `deep-fix` 输出后、契约复验前计算。
- 结果写入 `deai-minimal-edit` 与 processing report。

验收：

- 事实保留但整章重写的样稿被 50% 门禁拒绝。
- 局部合法打磨的样稿通过。
- 20,000 字章节本地计算耗时纳入性能账本。

### Phase 3 检测内核 V2（P0/P1）

新增检测能力：

1. **长度自适应阈值**：所有 per-kilo 阈值按有效正文字数缩放；短文设最小样本阈值。
2. **中文 2/3-gram 重复指纹**：排除对白、标点和高频功能词；报告绝对次数、密度、阈值。
3. **场景分层**：叙述层与对白层分别统计 hedging；对白使用宽容阈值，避免误伤人物口癖。
4. **长文漂移检测**：按 2,000 字窗口计算句长 CV、连接词密度、高频词密度，输出 `style_drift`。
5. **整体评分与 verdict**：输出 0-100 分、`clean/advisory/suspicious/likely_ai/blocking`、AI-edited fraction 估计。

输出结构：

```ts
interface DeAiDetectReportV2 {
  kernelVersion: 'v2'
  effectiveChars: number
  dialogueChars: number
  score: number
  verdict: 'clean' | 'advisory' | 'suspicious' | 'likely_ai' | 'blocking'
  aiEditedFraction: 'none' | 'light' | 'mixed' | 'heavy' | 'unknown'
  findings: DeAiFinding[]
  styleDrift?: { windowCount: number; firstLastDelta: number; severity: 'advisory' | 'blocking' }
  thresholds: { name: string; value: number; scaledValue: number; source: 'default' | 'calibrated' }[]
}
```

验收：

- 同一文本在 2,000 字与 20,000 字下阈值不同。
- 重复句式样稿触发 n-gram finding。
- 对白中的“可能/或许”不触发 blocking。
- 前后风格分裂样稿触发 `style_drift`。

### Phase 4 作者声纹接入（P1）

新增投影，不新增第二档案：

1. 从 `styleProfileEffective` 投影 `DeAiVoiceProfile`。
2. 字段来自现有 V2 结构：`voice`、`descriptionFocus`、`quantitative`、`positiveRules`、`prohibitions`。
3. 生成期注入与深度修复共用该投影。
4. 档案规则优先于通用降AI禁令；冲突时写 trace，不允许静默覆盖。

验收：

- 未锁定或无内容时不注入，保持行为不变。
- 锁定后 S1/S2/S3 实际请求都携带同一投影。
- 单一投影函数被测试锁定，禁止三处手抄。

### Phase 5 提示词压缩与规则去重（P1）

目标不是删安全规则，而是消除权威重叠：

1. S1 从 17 条压缩为 12 条：保留事实保护、视角、节奏、结构变化、反公式化。
2. S2 压缩为 5 条：结构组织、对话残缺、场景轻重、具体动作、章节契约。
3. S3 保留 4 条：信息无损、事实锁、合法语言打磨、只输出终稿。
4. 吸收外部哲学：明确立场、反 hedging seesaw、作者句子材料优先。
5. 风格细节交给 voice profile，不再用通用禁令堆叠。

验收：

- 提示词长度下降，但 FACT_LOCK 与章节契约测试不变红。
- 生成样稿做 A/B 对比，避免“分数变好、小说变差”。

### Phase 6 legacy-auto 降级（P2）

1. 新项目默认关闭 `legacy-auto`，只保留显式兼容入口。
2. UI 文案明确：字符替换不提高人味，只处理硬信号。
3. trace 区分 `legacy-auto` 与 `deep-fix` 的处理器版本。

验收：

- 默认路径不再使用硬替换。
- 旧项目显式开启仍可用，行为有测试守护。

### Phase 7 trace 与 UI 汇总

新增事件：

- `deai-kernel-v2`
- `deai-score`
- `deai-change-rate`
- `deai-voice-profile`
- `deai-style-drift`
- `deai-quality-gate-degraded`

同步面：

1. runTrace 存储类型。
2. 导出通道与外置 payload 索引。
3. 验证器白名单。
4. UI 汇总卡片：score、verdict、change rate、drift、degraded warning。

验收：

- 导出的 standard/deep trace 均可机器遍历新字段。
- 深层事件与 UI 汇总一致。

### Phase 8 folder SKILL 协同契约（P0/P1）

本节回应架构追问：降AI不能继续保持“应用层单方面硬塞 prompt、SKILL 层被动接收”的旧形态。当前源码有两个独立注入点：

1. folder 执行器路径：`PipelinePanel.vue:2657` 计算 `systemPromptSuffix`，经 `skillRouter.ts:200` 传入 `realSkillExecutor.ts:321`，与 skill 样例、guidance 拼接。
2. agent 变体路径：`PipelinePanel.vue:3505` 调 `resolveDeaiPromptForChainStep`，随后 `PipelinePanel.vue:3515` 以 `[skillPart, agentPart, deaiPrompt]` 手工拼接。

这两个入口一旦演化不同步，就会出现同一链路两种降AI语义。Phase 8 将其收口为契约，而不是继续依赖调用点自觉。

#### 8.1 SKILL 声明契约

folder SKILL 元数据新增可选 `deai` 声明块，挂在现有 `meta` 结构内，与 `chainHandoff` 同级：

```ts
interface SkillDeaiMeta {
  contractVersion?: 1                        // 缺省按 1 解析
  generation?: 'on' | 'off' | 'suffix-only'  // 是否注入生成期降AI提示
  finalStepDetection?: 'on' | 'off'          // 是否注入应用侧终步降AI反馈
  conflictPolicy?: 'skill-wins' | 'app-wins' | 'report'
}
```

规则：

1. 未声明任何字段时保持当前默认行为：生成期按 step 策略注入，终步检测开启。此规则保证既有 folder SKILL 不需要立即改模板。
2. `generation: 'off'` 只关闭生成期提示，不关闭用户显式选择的后处理模式；生成期注入、终步反馈、用户后处理是三个职责，不允许一个字段连坐。
3. `generation: 'suffix-only'` 表示应用只经 `systemPromptSuffix` 注入；它约束的是应用注入通道，不承诺审查 SKILL 模板正文本身。SKILL 正文是否重复堆规则，只能通过冲突检测以 advisory 方式报告。
4. `conflictPolicy` 只在 SKILL 自带降AI规则与应用投影规则重叠时生效；默认 `report`，trace 必须记录冲突清单。
5. `skill-wins` 表示应用投影删除重叠条目；`app-wins` 表示 SKILL 声明按 warning 记录但应用投影继续；两种结果都要写 trace，不允许静默覆盖。
6. `finalStepDetection` 只控制应用侧终步重试的降AI findings 注入，不关闭用户在降AI设置中选择的 `detect-report` / `deep-fix` / `legacy-auto` 后处理。用户执行模式权威优先于 SKILL 声明；若两者意图冲突，UI 与 trace 同时显示“SKILL 已关闭终步反馈，用户后处理模式仍执行”。
7. `contractVersion` 未知或高于应用支持的主版本时，不判死 SKILL：按兼容默认行为运行，写 warning 并记录原值。

#### 8.2 注入路径收口

1. 新增唯一投影函数 `resolveDeaiPromptForSkillStep(step, chainIndex, chainCount, skillDeaiMeta, context)`。
2. `PipelinePanel.vue:2657` folder 路径与 `PipelinePanel.vue:3505` agent 变体路径都必须调用它；两处只允许传参，不允许再各自拼接降AI规则。
3. agent 变体路径当前只接收 `skillTemplate`，拿不到 folder 元数据；实现时必须把解析后的 `skillDeaiMeta` 从调用方传入 `callApiWithAgentVariantOwned`。若调用方确实没有 SKILL 元数据，只能标 `source: 'app-default-no-skill-meta'`，不得伪装成 SKILL 声明。
4. `realSkillExecutor.ts` 继续只认 `systemPromptSuffix`，不感知降AI细节；降AI语义停留在应用投影层，执行器保持通用。
5. 投影结果带 `source: 'skill-declared' | 'app-default' | 'app-default-no-skill-meta' | 'skill-disabled'`，写入 `deai-voice-profile` 或新事件 `deai-injection-policy`，导出 trace 可审计。
6. 一致性测试比较的是同一输入下的降AI投影字符串、variant、policy 与 source，不比较整份 systemPrompt；folder 路径还有 samples/guidance，agent 路径还有 agent prompt，强制整份相等会把执行器协议误改成同一格式。

#### 8.3 冲突与降级可见性

1. SKILL 声明非法值时按配置错误处理：warning + 回退默认 + trace 记录原值，不允许解析失败后静默变成“未声明”。
2. `finalStepDetection: 'off'` 必须在 UI 汇总显示“终步降AI检测已由 SKILL 声明关闭”，防止用户误以为门禁仍在运行。
3. 双路径投影结果不一致时测试必须红，防止未来单边改动复活旧问题。
4. 新增 `validateSkillDeaiMeta` 纯函数并接入测试与 SKILL 包加载自检：folder SKILL 迭代后可在本地先发现非法声明，而不是等运行中才靠 trace warning 暴露。

#### 8.4 验收矩阵

| 场景 | 断言 |
|---|---|
| SKILL 声明 `generation: 'off'` | folder 与 agent 两条路径均不注入降AI prompt |
| SKILL 声明 `generation: 'on'` | 两条路径注入同一投影字符串 |
| SKILL 无声明 | 保持当前默认注入，行为与 V2 前基线一致 |
| 声明非法值 | warning + trace 保留原值 + 回退默认 |
| `contractVersion` 未知或更高 | 不阻断运行，warning 记录原值并回退兼容默认 |
| agent 路径拿不到 SKILL 元数据 | 注入按 `app-default-no-skill-meta` 记录，禁止伪装为 SKILL 声明 |
| SKILL `finalStepDetection: 'off'` 且用户选择 `deep-fix` | 终步反馈不注入，用户后处理仍执行，UI 双状态可见 |
| `conflictPolicy: 'skill-wins'` | 应用投影删除重叠条目，trace 记录冲突 |
| `finalStepDetection: 'off'` | 不执行终步降AI反馈，UI 显示关闭原因 |
| 双路径一致性 | 同输入下两条路径的降AI投影、variant、policy、source 一致 |
| 契约预检 | `validateSkillDeaiMeta` 拒绝非法枚举、非法版本、多余未知字段并返回错误清单 |

实施边界：

- 本阶段只改投影与元数据解析，不把降AI检测器搬进 SKILL；SKILL 仍是执行权威。
- `pkg.meta.agent` 继续保持 guidance 语义，不借本阶段复活 agent 字段权威。
- 旧模板不迁移即可运行；迁移属于 SKILL 层后续动作，应用层只负责契约与观测。

### Phase 8.5 folder SKILL 协同指导手册（P1，落地必交付）

Phase 8 是应用契约，落地时不能只交代码。folder SKILL 不是静态模板：它会经大量真实生成测试后持续迭代，模板、样例、postProcess、降AI规则都可能变。因此契约本身必须版本化，指导手册必须把“SKILL 是活的”当作常态来写。

交付物：

- [_audit/FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md](FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md)

手册与应用版本共同维护，最低内容：

1. **契约语义**：`meta.deai` 三个字段的含义、合法值、默认行为、禁止事项；特别说明 `generation: 'off'` 不会连坐关闭终步检测。
2. **版本策略**：契约携带 `contractVersion`（初始 `1`）；兼容性扩展走 minor，语义变化走 major；未知字段不报错但写 trace warning，避免应用升级把旧 SKILL 判死。
3. **SKILL 迭代流程**：SKILL 改模板、样例、postProcess、降AI规则后的自检清单；如何用本地 fixtures 与 trace 事件验证契约未破坏。
4. **trace 阅读指导**：`deai-injection-policy`、冲突事件、`quality_gate_degraded` 的含义与排查路径，让 SKILL 层能看懂应用为什么这样注入、为什么报冲突。
5. **冲突升级路径**：先 `report` 观察，再选 `skill-wins` 或 `app-wins`；何时该改 SKILL 规则、何时该改应用投影，避免双方各改各的继续打架。
6. **迁移示例**：旧 SKILL 零改动即可运行；显式控制降AI时的最小迁移片段；非法值回退示例。
7. **测试与验收**：Phase 8 各场景的测试名、fixture 位置、期望结果；SKILL 迭代后可直接复跑。
8. **变更登记**：降AI内核、提示词压缩、阈值校准每次变更后必须更新手册版本与影响说明；手册未更新时相关验收不得通过。

防手册漂移硬门禁：

- 手册接口片段由测试 fixture 锚定；fixture 变更而手册未同步，测试必须红。
- `DEAI_CONTRACT_VERSION`、事件名、字段名在应用、测试、手册三处一致，由一致性测试锁定。
- 手册必须给出 `validateSkillDeaiMeta` 的调用位置与错误清单读法；folder SKILL 迭代后先跑契约预检，再进入生成测试。
- 手册版本同步纳入发布收尾清单；跳过手册更新等同 Phase 8.5 未完成。

验收：

- 手册存在，并包含版本策略、迭代流程、trace 指导、迁移示例、防漂移门禁。
- Phase 8 全部场景测试引用的契约字段与手册一致。
- 发布收尾清单包含“手册版本同步”检查项。

## 5. 测试与验证矩阵

| 层级 | 证明范围 | 命令/方式 |
|---|---|---|
| 单测 | 阈值缩放、n-gram、漂移、变更率、retention、异常降级 | `npx vitest run src/services/de-ai.spec.ts` 等定向测试 |
| 集成 | Pipeline step 4 注入、postProcess、契约复验、trace 事件 | mock provider + folder skill fixture |
| 观测 | 新事件导出与消费、无旧假指标残留 | runTrace spec + Electron 导出回读 |
| UI | 汇总卡片、degraded warning、模式切换 | 真实 Electron + Playwright |
| 样本校准 | 中文阈值、误报率、漏报率 | 用户真实章节样本；未完成前标记 `provisional` |
| 性能 | 本地门禁耗时、无 UI 卡顿 | 20,000 字样稿基准 + 分段耗时账本 |

样本校准通过标准：

1. 对白 hedging 误伤率低于 5%。
2. n-gram 对重复句式的命中率高于 90%。
3. 变更率门禁拒绝“事实保留但整章重写”样稿。
4. 20,000 字本地检测 + 变更率计算低于 300ms。

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| 阈值误报 | provisional 标记 + 样本校准 + 对白分层 |
| n-gram 误伤重复口号、诗歌、咒语 | 白名单与窗口上下文豁免 |
| 变更率把合法重排判为过度修改 | 句级 LCS + 标点归一 + 分级阈值 |
| voice profile 与 SKILL 规则冲突 | 单源投影 + trace 冲突记录 + 档案优先 |
| 提示词压缩导致生成质量回归 | A/B 样稿对比 + 保留 FACT_LOCK 测试 |
| 新观测字段导致旧 trace 不兼容 | schemaVersion 升级 + 兼容测试 |
| folder SKILL 持续迭代导致契约误用 | contractVersion + 未知字段宽容 + Phase 8.5 指导手册 |
| 指导手册过时漂移 | fixture 锚定接口片段 + 三处字段一致性测试 + 发布收尾检查 |
| SKILL 声明覆盖用户后处理设置 | 权限分层：SKILL 只管注入与反馈，用户 hardRuleMode 管后处理执行 |
| 双路径被误要求生成同一 systemPrompt | 只锁定降AI投影一致性，保留 folder/agent 各自执行协议 |

## 7. 执行顺序

1. Phase 1：观测诚信。
2. Phase 2：变更率门禁。
3. Phase 3：检测内核 V2。
4. Phase 4：voice profile 接入。
5. Phase 5：提示词压缩。
6. Phase 6/7：legacy-auto 降级与 trace/UI 汇总。
7. Phase 8/8.5：folder SKILL 契约收口 + 协同指导手册。
8. 全量回归 + 真实 Electron UI 验证。
9. 样本校准，移除 `provisional`。

## 8. 决策点

| 决策点 | 建议 |
|---|---|
| 是否直接引入外部 SKILL | 否，只吸收机制 |
| `legacy-auto` 默认值 | 新项目默认关闭 |
| 阈值默认值 | 先 provisional，样本校准后定版 |
| voice profile 来源 | 复用现有 `StyleProfile`，不新建档案 |
| 降AI内嵌形态 | 升级为“应用投影 + SKILL 声明契约”，不再是应用单方面注入 |
| folder/agent 双注入点 | Phase 8 收口为单一投影函数，双路径一致性入测试 |
| folder SKILL 持续迭代 | 视为常态：契约版本化 + 未知字段宽容 + Phase 8.5 指导手册 |
| 分阶段还是一次成型 | 分阶段执行，每阶段有硬验收 |

## 9. 成熟度结论

| 层面 | 结论 |
|---|---|
| 执行器/工具层 | 成熟：本地确定性算法，测试可完全覆盖 |
| 应用方案/交互闭环 | 成熟：现有 UI 与 trace 接线点明确 |
| 实现接线 | 成熟：接入点均已在源码定位 |
| 架构协同/folder SKILL 契约 | 已补齐：Phase 8 定义声明契约、双注入点收口、冲突可见化与回归矩阵 |
| SKILL 迭代支持 | 已补齐：Phase 8.5 要求落地交付指导手册、版本策略、trace 排查路径与防漂移测试 |
| 验证标准 | 成熟；唯一断点是中文阈值样本校准，未校准前不得移除 provisional |

整体结论：方案成熟，可执行；架构协同与“SKILL 是活的”已由 Phase 8/8.5 补齐。阈值默认值属于可放行断点，不能在校准前宣称最终版。

## 10. 边界

- 本方案未写码，等待用户审核。
- Phase 8 为本轮追问补强：原 V2 只写“架构原则”，未把 folder SKILL 协同声明与双注入点收口落成契约；本次已补，但产品源码尚未实现。
- Phase 8.5 是落地后的必交付项：指导手册在实现完成并验证后产出，内容以本节清单为准。
- 未承诺商业检测器分数下降。
- 未执行 live API 对比。
- 外部项目只借鉴机制，不复制代码；若未来复制代码，需先审查 license。
