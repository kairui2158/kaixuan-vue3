# 2026-10-29 正文层内嵌降AI GitHub 基准审查报告

## 1. 审查目标与边界

用户目标原话：“你深度多轮次的搜索github里的去AI味项目或者SKILL后拉取多个精华，然后对账审查我们生成流水线的正文层内嵌去AI味，看我们的是否过时和有缺陷。给我详细的审查报告”。

本报告只审查，不修改产品源码。审查对象是生成流水线正文层的内嵌降AI机制，包括：

- 生成期提示词注入：`src/services/de-ai.js:736-768`、`src/components/pipeline/PipelinePanel.vue:3505-3554`
- 终步后处理：`src/components/pipeline/PipelinePanel.vue:5801-6005`
- 深度修复与保护门禁：`src/components/pipeline/PipelinePanel.vue:6089-6175`
- 终步重试反馈：`src/services/realSkillExecutor.ts:505-533`
- 结构化重试反馈：`src/services/schemaRetryFeedback.ts:66-108`

外部基准来自 2026-10-29 克隆的 9 个 GitHub 项目，本地研究目录为 `D:\codex\_research\deai-github-20261029\`。本轮只读源码，不引入依赖，不执行外部项目脚本，不发起 live API。

## 2. 总结论

结论：我们的降AI架构没有整体过时，方向甚至比多数社区项目更贴近小说生成流水线；但检测评分、过度修改防护、作者声纹和长文漂移四个方面落后于 2026 年社区精华项目，且存在两个必须修的观测诚信缺陷。

一句话判断：

- 架构定位：领先。生成期注入、检测与修复分离、契约复验、trace 观测、有界 retry 反馈，这些是社区项目普遍没有做到的工程化深度。
- 检测能力：过时。当前是“词表 + 密度 + 句长方差”的第一代规则检测，缺少 n-gram 重复指纹、长度自适应阈值、整体评分与 verdict。
- 防护能力：有缺口。有保护片段和完整性回滚，但没有变更率门禁，深度修复仍可能整段换腔。
- 风格能力：落后。没有作者声纹/文风样本档案接入，长章节也没有风格漂移检测。
- 观测诚信：P0 缺陷。`retentionRatio` 恒为 1、终步检测异常被静默吞掉，这两点会让上层误以为质量门禁比实际更可靠。

“降AI腔”和“绕过检测器”重叠但不等价。外部证据显示，商业检测器越来越看“谁组织了句子”，而不是单个词是否像 AI；因此生成期注入和作者素材组织是主杠杆，后处理只能修表层信号。

## 3. 外部基准清单

| 项目 | 上游 | 精华点 | 对我们的适用性 |
|---|---|---|---|
| im-not-ai | https://github.com/epoko77-ai/im-not-ai | 定量 route_hint、30%/50% 过度修改门禁、S1/S2/S3 信号分级 | 高：直接补我们缺失的变更率门禁和信号分级 |
| humanize / ai-check | https://github.com/harshaneel/humanize | 9 信号 0-27 分、证据引用、AI-edited fraction、verdict、双检测器基准 | 高：补整体评分与可信报告 |
| unslopify | https://github.com/youngfreezy/unslopify | 长度自适应阈值、4-gram 重复指纹、VoiceProfile | 高：补检测算法与作者声纹 |
| humanizer | https://github.com/blader/humanizer | 样本声纹优先、先标注后重写、事实不增不减 | 高：补中文小说的误报防护 |
| work-humanizer | https://github.com/phuryn/work-humanizer | “检测器看组成指纹而非措辞”的实证结论 | 战略高：决定我们把主杠杆放在生成期而非后处理 |
| humanizer-zh | https://github.com/ai-zixun/humanizer-zh | 中文作者声纹档案、档案优先级、不混用声音 | 高：中文场景最直接可借鉴 |
| no_ai_slop_writing_rules | https://github.com/realrossmanngroup/no_ai_slop_writing_rules | 长文漂移信号、hedging 审计、结构阈值 | 中高：补长章节质量监控 |
| slop-radar | https://github.com/renefichtmueller/slop-radar | 0-100 分扣分模型、before/after 复测 | 中：评分呈现和复测机制可借鉴，词表偏英德 |
| anti-ai-slop-writing | https://github.com/jalaalrd/anti-ai-slop-writing | 反公式化约束、明确立场、hedging seesaw 禁止 | 中：提示词规则可吸收，需中文化 |

### 3.1 星标与代表性补充

2026-10-29 通过 GitHub API 复核各仓星标与活跃度：

| 项目 | Stars | Forks | 最近 push | 代表性判断 |
|---|---:|---:|---|---|
| blader/humanizer | 61,949 | 4,899 | 2026-10-28 | 高星主流项目，但核心是 SKILL 指令，不提供确定性审计内核 |
| epoko77-ai/im-not-ai | 6,311 | 697 | 2026-10-12 | 高星、工程纪律强：route_hint、30%/50% 变更率门禁、信号分级可直接借鉴 |
| realrossmanngroup/no_ai_slop_writing_rules | 707 | 79 | 2026-05-30 | 中高星，长文漂移与 hedging 审计有价值，词表偏英文 |
| harshaneel/humanize | 584 | 66 | 2026-09-22 | 中星、研究引用密集：9 信号 0-27 分、AI-edited fraction、verdict 设计成熟 |
| jalaalrd/anti-ai-slop-writing | 576 | 59 | 2026-04-18 | 中星，提示词哲学可取，缺少可执行审计器 |
| ai-zixun/humanizer-zh | 202 | 16 | 2026-05-22 | 低星但中文直接可用，声纹档案与中文反翻译腔规则价值高 |
| phuryn/work-humanizer | 119 | 14 | 2026-10-10 | 低星，但“检测器看组成指纹而非措辞”的实证结论战略价值高 |
| renefichtmueller/slop-radar | 10 | 1 | 2026-10-03 | 低星，评分模型完整但英德词表不适配中文小说 |
| youngfreezy/unslopify | 0 | 0 | 2026-10-03 | 0 星但内核最工程化：长度自适应阈值、4-gram 指纹、VoiceProfile 均为确定性代码 |

结论：星标与内核先进性不能画等号。`unslopify` 是 0 星项目，但确定性审计内核最接近我们需要的工程形态；`blader/humanizer` 星标最高，但主要是提示词与流程指导，检测仪器化程度低于我们现有 trace/契约体系。

### 3.2 与正文层 folder SKILL 的适配判定

外部项目不能作为 folder SKILL 直接挂载使用，原因有三：

1. **文体不匹配**：`humanizer-zh` 明确定位博客、评论、产品分析、newsletter、书稿评论等长文本，未覆盖小说 FACT_LOCK、人物状态、剧情锁、章节契约；`humanize`、`unslopify`、`slop-radar` 偏英文/德文非虚构写作。
2. **执行协议不匹配**：我们的 folder SKILL 需要接入 `preProcess`、`template.md`、`postProcess`、schema 校验、链式 handoff 与 run trace；外部项目大多是独立 SKILL 指令或 CLI，没有我们的契约字段和断点恢复语义。
3. **职责冲突风险**：正文层 S1/S2/S3 已有骨架、创作、打磨分工；再直接挂一个通用 humanizer SKILL 会造成规则堆叠，形成第二套风格权威，和既有降AI提示词、创作风格卡片互相拉扯。

适配结论按机制拆分：

| 外部机制 | 是否可直接采纳 | 适配方式 |
|---|---|---|
| 30%/50% 变更率门禁 | 是，语言无关 | 内嵌到 `deep-fix` 后校验，超限回滚 |
| 长度自适应阈值 | 是，需中文校准 | 移植算法，不移植词表，用中文网文样本重算 |
| n-gram 重复指纹 | 是，需中文分词方案 | 做 2/3-gram 指纹，排除对白与高频功能词 |
| 9 信号评分、verdict、AI-edited fraction | 是，需中文化重构 | 保留结构，信号类目与阈值按中文小说重定义 |
| 作者声纹档案 | 是，但不能搬外部作者 | 复用我们已有创作风格卡片，投影为 `DeAiVoiceProfile` |
| 外部 humanizer 提示词/SKILL 全量挂载 | 否 | 只吸收规则哲学，压缩合并，不新增独立 SKILL 权威 |

因此正确路线不是“引入某个高星 SKILL 替换我们的实现”，而是把高价值机制移植进现有 `detectBody`、`deep-fix`、创作风格卡片与 trace 体系，保持正文层 folder SKILL 作为唯一执行权威。

## 4. 我们的领先点

### 4.1 生成期注入，而不是只做事后清洗

`resolveDeaiPromptForChainStep` 按链位置分流：单步或首步注入完整 17 条方法论，中间步注入 8 条创作执行约束，终步注入 6 条打磨契约，见 `src/services/de-ai.js:760-768`。流水线在正文 step 4 接入该分流，并把变体写入 run trace，见 `src/components/pipeline/PipelinePanel.vue:3505-3554`。

这与 `work-humanizer` 的结论一致：后处理换词不改变“谁组织了句子”，生成期约束才是主杠杆。我们已经在正确的主杠杆上。

### 4.2 检测、深度修复、兼容清洗三模式分离

终步后处理区分：

- `legacy-auto`：字符级兼容清洗，见 `src/components/pipeline/PipelinePanel.vue:5813-5882`
- 检测模式：只报告，不改写，见 `src/components/pipeline/PipelinePanel.vue:5883-5928`
- `deep-fix`：最小编辑 + 保护片段回对 + 完整性门禁，见 `src/components/pipeline/PipelinePanel.vue:5929-5973`

多数社区项目只有“检查/重写”两态。我们保留兼容模式但把默认质量路径切到检测/深度修复，方向正确。

### 4.3 深度修复有事实保护与回滚

深度修复会提取人名、设定、对白等保护片段，输出后执行 `verifyProtectedSpans` 和 `passesBodyIntegrityCheck`；未通过则保留原文，见 `src/components/pipeline/PipelinePanel.vue:6089-6168`。提示词也明确禁止整段重写、扩写、压缩和新增事实，见 `src/services/de-ai.js:60-67`。

这比单纯“重写得更像人”的社区项目更符合小说生产：事实锁和剧情锁优先于去AI效果。

### 4.4 后处理之后仍有契约复验

`legacy-auto` 和 `deep-fix` 都会在处理后重新执行 `validateBodyArtifact`，失败会写 `body-post-process-contract-rejected` 并中断，见 `src/components/pipeline/PipelinePanel.vue:5823-5847`、`src/components/pipeline/PipelinePanel.vue:5933-5958`。

这防止“去AI成功但字数/结构契约失败”的暗伤继续流转。

### 4.5 结构化重试反馈已经抑制候选全文

`buildSchemaRetryFeedback` 明确“不携带候选输出全文”，只保留最多 10 条错误、3 条锚点和头尾各 200 字符预览，见 `src/services/schemaRetryFeedback.ts:19-22`、`src/services/schemaRetryFeedback.ts:66-108`。

此前卷纲层指出的 schema retry 全文滚动放大问题，在当前源码中已修复，不再是缺口。

### 4.6 运行记录可审计

降AI提示词变体、检测报告、深度修复门禁、后处理报告、契约拒绝都有 trace 或 processing report 记录，见 `src/components/pipeline/PipelinePanel.vue:3505-3554`、`src/components/pipeline/PipelinePanel.vue:5885-5928`、`src/components/pipeline/PipelinePanel.vue:5975-6005`。

这比多数外部 SKILL 的“口头报告”更适合我们的客户调试场景。

## 5. P0 缺陷：必须修

### P0-1 `protectedSpans` 指标造假，`retentionRatio` 恒为 1

证据：

- 空报告直接返回 `retentionRatio: 1`，见 `src/services/de-ai.js:578-585`
- 正常检测报告把 `hit` 直接写成 `protectedSpans.length`，`missing` 永远为空，`retentionRatio` 永远为 1，见 `src/services/de-ai.js:706-712`

问题本质：`detectBody` 是只读检测，并没有“编辑后文本”可对账，却发布了一个看起来像对账结果的保留率指标。上层和 trace 会误以为保护片段已经全部保留。

外部对照：`humanize/ai-check` 要求每个评分信号必须引用具体证据，见 `ai-check/SKILL.md:19-38`、`ai-check/SKILL.md:426-433`；`slop-radar` 的分数必须来自可复现扣分明细，见 `skill/SKILL.md:19-23`。

修复方向：

1. 从 `detectBody` 报告中删除 `protectedSpans.hit/missing` 和 `retentionRatio`，只保留 `protectedSpans.total` 作为“已识别保护对象数”。
2. 保留率只在深度修复后由 `verifyProtectedSpans` 计算，并写入 `deai-minimal-edit` trace detail。
3. 增加单测：构造 must span 丢失的 edited 文本，断言 retentionRatio 不等于 1。

### P0-2 终步降AI检测异常被静默吞掉

证据：

- `collectFinalStepDeaiFindings` 的 `catch` 直接返回空数组，无日志、无 trace、无 warning，见 `src/services/realSkillExecutor.ts:521-531`
- 终步后处理异常时记录 `blocking: false` 并继续使用 raw body，见 `src/components/pipeline/PipelinePanel.vue:5975-6005`

问题本质：这不是“保底返回原文”的问题，保底是合理设计；问题是降AI质量门禁失效时没有运行级告警或降级状态。用户会看到生成成功，但不知道降AI检测根本没有执行成功。

外部对照：`im-not-ai` 在 metrics 失败时会写 `00_metrics.error` 并降级到 standard 路径，失败可见，见 `CLAUDE.md:125`；`humanizer` 要求最终稿再检查遗漏模式，见 `SKILL.md:37-39`。

修复方向：

1. `collectFinalStepDeaiFindings` 捕获异常后写入 run trace warning，错误信息进入最终反馈或验收事件。
2. `PipelinePanel` 的降AI异常不应标记 `blocking: false`，应引入 `quality_gate_degraded` 状态，终态可检索。
3. 生成结果若因降AI异常使用 raw body，UI 汇总中必须出现“降AI门禁降级”警示，不允许只在事件流深处可见。

### P0-3 缺少变更率门禁，深度修复可能过度修改

证据：

- 深度修复只校验保护片段和完整性，未计算编辑距离或变更率，见 `src/components/pipeline/PipelinePanel.vue:6154-6168`
- 全仓检索没有 `changeRate`、30%/50% 过度修改门禁逻辑

外部对照：`im-not-ai` 明确“变更率 30% 超过警告，50% 超过强制中断”，见 `CLAUDE.md:22`；其 S1/S2/S3 分级把“一次出现即AI”“多次重复才AI”“叠加强才AI”区分开，见 `CLAUDE.md:154-163`。

风险：模型可以在保留所有人名和设定的情况下，把整章语言组织方式全部换掉。保护片段门禁挡得住事实漂移，挡不住“过度润色”和“另一种公式腔”。

修复方向：

1. 深度修复前后计算字符级或句级变更率，30% 警告、50% 拒绝并保留原文。
2. 变更率写入 `deai-minimal-edit` trace detail 和 processing report。
3. 变更率阈值应随 blocking finding 数量分级，避免低风险文本也被强制大改。

### P0-4 缺少 n-gram 重复指纹与长度自适应阈值

证据：

- 当前阈值是固定值：`maxPerKilo.aiFreqWord: 3`、`bannedVocab: 0.8`、`cliche: 1`、`connector: 3.5`，见 `src/services/de-ai.js:48-58`
- 检测维度只有高频词、禁用词、禁用句式、连接词、句长趋同、句长方差、崩坏标点，见 `src/services/de-ai.js:599-698`
- 没有 n-gram 重复检测

外部对照：

- `unslopify/audit.py` 明确软阈值按文本长度缩放，见 `src/unslopify/audit.py:17-18`、`:57-69`
- 4-gram 重复用 `_ngram_counts` 统计，超 allowance 才报 `repeated-ngram`，见 `src/unslopify/audit.py:141`、`:295-307`

风险：固定阈值在 2,000 字章节和 20,000 字长章节上误报率完全不同；而“整段换词但句式指纹重复”的问题，当前词表检测完全看不见。

修复方向：

1. 中文 2-gram/3-gram 重复指纹检测，排除对白和高频功能词。
2. 所有 per-kilo 阈值按有效正文字数自适应缩放，短文设置最小样本阈值。
3. 报告同时给出绝对次数、密度和阈值，避免只报“超限”。

## 6. P1 缺陷：应尽快补

### P1-1 没有作者声纹/文风样本档案接入

证据：`de-ai.js` 的三套提示词都是全局规则，没有作者样本、句长分布、口癖、标点习惯输入，见 `src/services/de-ai.js:736-768`。

外部对照：

- `unslopify/voice.py` 从作者样本构建 `VoiceProfile`，见 `src/unslopify/voice.py:1-53`
- `humanizer` 规定用户样本优先于通用模式，见 `SKILL.md:43-45`
- `humanizer-zh` 提供中文作者声纹档案，并规定档案与 Core Rules 冲突时档案优先、不混用多位作者，见 `SKILL.md:45-55`、`references/voices/index.md:29-32`

影响：我们应用已有创作风格卡片，但降AI提示词没有消费它。结果是“风格卡片管风格，降AI提示词管去AI”，两套规则可能在同一章里互相拉扯。

建议：把大纲工作台锁定的创作风格卡片投影成 `DeAiVoiceProfile`，生成期注入与深度修复共用同一档案；档案规则优先于通用降AI禁令。

### P1-2 没有长章节风格漂移检测

证据：当前检测只输出单次报告，没有把长文按窗口切分对比前后风格指标，见 `src/services/de-ai.js:576-713`。

外部对照：`no_ai_slop_writing_rules/rossmann-voice` 明确长输出会回归“平均网络语气”，并给出缩略语消失、开头泛化、具体细节消失等漂移信号，见 `SKILL.md:66-77`。

影响：一章 8,000 字时，前 2,000 字可能很有作者味，后 2,000 字回到模型默认腔；当前整章平均密度会稀释这个漂移。

建议：按 2,000 字窗口计算句长 CV、连接词密度、高频词密度，首尾窗口差异超阈值时输出 `style_drift` finding。

### P1-3 没有情态/hedging 审计与场景豁免

证据：禁用词表把“可能”“或许”“似乎”“好像”等列为禁用词，见 `src/services/de-ai.js:337-360`；检测直接在全文上执行，没有区分叙述、对白和不确定事实场景，见 `src/services/de-ai.js:599-660`。

外部对照：`no_ai_slop_writing_rules/ai-writing-detection.md` 指出 AI hedging 是 4-7 倍于人写作者，并区分每段 3 次和每千字 8 次阈值，同时明确待定事实、争议事实应允许合理 hedging，见 `:266-288`。

影响：角色对白里的“可能”“或许”可能是人物口癖；把它们一律视为 AI 信号会误伤人味，深度修复还可能把对白改得更整齐、更AI。

建议：检测前先摘除对白和引语，或对对白使用独立宽容阈值；hedging 分叙述层和对白层报告。

### P1-4 缺少整体评分、verdict 和 AI-edited fraction

证据：`detectBody` 只返回 findings 和少量 metrics，没有总分、等级、置信度或“AI 编辑占比”估计，见 `src/services/de-ai.js:701-713`。

外部对照：

- `humanize/ai-check` 有 9 信号、每类 0-3 分、总分上限 27，并映射 verdict，见 `SKILL.md:19-38`、`:444-454`
- 它还要求估计 AI-edited fraction，见 `SKILL.md:374-410`
- `slop-radar` 输出 0-100 分、rating、语言、phrases、patterns、breakdown，见 `skill/SKILL.md:19-23`

影响：客户看到的是一串 finding，不知道“这章整体处于什么档位”“修复前后到底改善多少”。

建议：建立 0-100 分或 0-27 分中文评分模型，输出 `clean / advisory / suspicious / likely_ai / blocking` verdict，并记录 before/after 分数。

### P1-5 提示词规则与 SKILL 规则存在重复堆叠

证据：

- 首步注入 17 条方法论，见 `src/services/de-ai.js:736`
- 中间步 8 条创作约束、终步 6 条打磨契约，见 `src/services/de-ai.js:737-758`
- 正文层 SKILL 自身还有大量风格与降AI规则

外部对照：`work-humanizer` 强调保留作者自己的句子材料，而不是叠加更多规则，见 `SKILL.md:41-47`；`anti-ai-slop-writing` 强调明确立场、避免 hedging seesaw，而不是无限列举禁令，见 `SKILL.md:20-24`。

风险：规则越多，模型越容易机械执行“短句、具体动作、避免禁词”，形成另一套公式化腔调。此前用户已指出“过度纠错也是AI信号”，当前提示词已补这条，但规则总量仍偏重。

建议：首步保留结构与方法论，中步压缩到 5 条以内，终步保留事实与结构锁；风格细节交给作者声纹档案，不再靠通用禁令堆叠。

## 7. P2 风险：需要设计权衡

### P2-1 `legacy-auto` 硬替换可能制造新公式腔

`processBody` 仍是字符/词组替换路径，虽然检测不删除、兼容模式才改写，但替换表本身会把一种陈词换成另一种固定词，见 `src/services/de-ai.js:40-44`、`src/services/de-ai.js:513-573`。

建议：保留为兼容选项，但 UI 明示“字符替换模式不提高人味，只处理硬信号”；新项目默认禁用。

### P2-2 外部基准的语言与文体差异

9 个项目中，`humanizer-zh` 面向中文，`humanize`、`unslopify`、`slop-radar` 主要面向英文/德文，`im-not-ai` 文档为韩文。它们的阈值和词表不能直接搬进中文小说正文。

建议：只吸收机制，不直接搬词表；所有阈值必须用中文网文样本重新校准。

### P2-3 检测器分数不应成为最终目标

`work-humanizer` 的实证结论是：商业检测器更看“句子由谁组织”，AI 重写 AI 稿通常仍是 AI，而作者自己的句子材料存活率越高越像人，见 `skills/work-humanizer/SKILL.md:21`、`:41-47`。`humanize/README.md:533` 也明确不承诺商业检测器 0% AI。

这提醒我们：降AI目标应定义为“降低AI腔、保住事实与作者风格”，而不是追逐某个检测器分数。

## 8. 采纳优先级

建议按以下顺序立项：

1. P0-1/P0-2：先修观测诚信。指标不能造假，门禁失效必须显式降级。
2. P0-3：补变更率门禁，防止深度修复过度重写。
3. P0-4：补 n-gram 指纹与自适应阈值，升级检测内核。
4. P1-1：把创作风格卡片接入降AI提示词，建立中文作者声纹档案。
5. P1-4：补整体评分、verdict、before/after 复测。
6. P1-2/P1-3：补长文漂移检测和 hedging 场景豁免。
7. P1-5/P2：压缩提示词堆叠，限制 `legacy-auto` 使用场景。

## 9. 已验证与未验证边界

已验证：

- 本仓 6 个关键代码位置的当前源码行为。
- 9 个外部仓的机制与关键行号。
- schema retry 全文回传问题已修复。

未验证：

- 未执行 live API 生成对比。
- 未用真实中文网文样本跑新阈值校准。
- 未修改任何产品源码，因此本报告的修复建议尚未实现。
- 未对外部项目做许可合规审查；若要复制代码而不是借鉴机制，需先审查各仓 license 与依赖。
