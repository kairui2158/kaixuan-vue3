# 正文层降AI内嵌 — SKILL 层交接文档

> 日期：2026-09-05
> 版本：3.23.0
> 交付方：应用层
> 接收方：SKILL 制作方
> 文件：src/components/pipeline/PipelinePanel.vue

---

## 一、本次改动概述

应用层在正文层（step 4）实现了降AI两步闭环：

1. **前置层**：17条降AI方法论在 API 调用时自动注入到 system prompt 末尾，模型在生成阶段就受到约束
2. **后处理层**：生成完成后自动调用 DeAiProcessor 硬规则清洗（255禁用词+34禁用句式+句长修复等）

SKILL 层无需做任何改动即可享受这两层能力。但了解机制有助于写出更好的 SKILL 模板。

---

## 二、system prompt 注入顺序（实际代码）

正文层（step 4）调用 API 时，system prompt 的拼接顺序为：

```
[1] SKILL template（compose 合并模板 或 chain 单步模板）
[2] Agent systemPrompt（Agent 配置中的 systemPrompt 字段）
[3] DEAI_METHODOLOGY_PROMPT（17条降AI方法论，仅 step===4 时注入）
```

三段用 \n\n 分隔，filter(Boolean) 过滤空值。

对应源码（PipelinePanel.vue 行2090）：

```typescript
const skillPart = promptParts?.systemSkill ?? skillTemplate ?? ""
const agentPart = agentConfig?.systemPrompt || ""
const deaiPrompt = step === 4 ? DEAI_METHODOLOGY_PROMPT : ""
const systemPrompt = [skillPart, agentPart, deaiPrompt].filter(Boolean).join("\n\n") || "你是专业小说创作助手。"
```

**关键点**：
- 降AI方法论是应用层自动注入的，SKILL 模板中不需要再写降AI规则
- 如果 SKILL 模板里也写了降AI相关指令，会和应用层注入的17条重复，不冲突但浪费 token
- 其他四层（设定/卷纲/章节）不会注入降AI方法论

---

## 三、17条方法论内容（DEAI_METHODOLOGY_PROMPT）

以下是应用层注入到 system prompt 末尾的完整内容，SKILL 层应了解这些规则已存在，避免重复：

1. 第一句必须是具体动作或感官细节
2. 句长方差要大（连续三句差异>30%，穿插短句和长句）
3. 用具体动作替代抽象形容
4. 场景结尾留下未解决张力
5. 戏剧价值决定篇幅（不均匀分配）
6. 连接词按叙事需要使用（禁止固定序列）
7. 叙述视角体现判断（不是评论员）
8. 段落结构要有变化（禁止描述-对话-描述循环）
9. 自然不等于混乱（不加语病错别字）
10. 小说正文特殊保护（人名/地点/时间/设定/伏笔不改）
11. 对话要有残缺和轻重（禁止等量微表情）
12. 对话中减少解释性从句
13. 叙事视角保持一致（禁止有限/全知跳转）
14. 节奏与情绪匹配
15. 密度阈值约束（特定词汇每500字不超1次）
16. 禁止 Chatbot 痕迹
17. 禁止 speculative gap-filling（禁止「似乎」「仿佛」填充）

完整原文见 `src/services/de-ai.js` 行2469 `DEAI_METHODOLOGY_PROMPT` 变量。

---

## 四、后处理层硬规则清单

生成完成后，应用层自动对正文跑 `DeAiProcessor.process()`，执行以下硬规则：

| 序号 | 规则ID | 名称 | 行为 |
|------|--------|------|------|
| 1 | cliche | AI套话替换 | 替换常见AI偏好词 |
| 2 | connectors | 连接词替换 | 替换首先/其次/最后等 |
| 3 | dropNames | 去掉句首人名 | 删除句首角色名 |
| 4 | dropPronouns | 去掉句首他/她 | 删除句首代词 |
| 5 | mergeShort | 合并短句 | 合并过短句子 |
| 6 | narratorIntermediary | 中转词删除 | 删除叙述中介词 |
| 7 | causalInversion | 因果倒装 | 调整因果语序 |
| 8 | frameStripping | 框架剥离 | 去除框架结构 |
| 9 | reduceSensory | 压缩感官描写 | 精简过度感官 |
| 10 | templateOpening | 替换模板化开头 | 修复模板开头 |
| 11 | mergeShortPara | 合并短段落 | 合并过短段落 |
| 12 | shuffleListing | 打散列举模式 | 打乱列举顺序 |
| 13 | breakUniformity | 修复段落趋同 | 打破段落一致性 |
| 14 | fixUniformLen | 修复句长趋同 | 变化句长 |
| 15 | rhythmVariation | 段落节奏变化 | 重排段落节奏 |
| 16 | fixPeriods | 段首句号修复 | 修复段首标点 |
| 17 | breakConnectors | 打断连接词序列 | 断开连续连接词 |
| 18 | deDiReplace | 的/地替换 | 规范用法 |
| 19 | dunhaoToComma | 顿号转逗号 | 标点规范化 |

另有 255 条禁用词替换和 34 条禁用句式删除。

**安全机制**：
- 对话保护：处理前先提取对话内容，处理后再还原，对话内容不被修改
- 字数保护：如果处理后文本低于原文 75%，自动回退原文
- 异常保护：try-catch 包裹，失败时用原文继续

---

## 五、SKILL 层需要知道的边界

### 5.1 不需要在 SKILL 模板中写降AI规则

应用层已自动注入17条方法论。SKILL 模板应专注于：
- 写作风格指导（技法/参考作家/常用词汇）
- 章节结构要求（场景数量/节奏/张力）
- 角色语言特征（对话风格/口头禅）
- 叙事视角要求

不需要重复写「禁止用首先其次」「句长要有变化」等规则。

### 5.2 后处理层会修改 SKILL 的输出

DeAiProcessor 会在 SKILL 输出后自动做硬规则清洗。这意味着：
- SKILL 输出中的 AI 套话会被自动替换
- 句首人名会被删除
- 短句会被合并
- 段落节奏会被调整

SKILL 不需要自己做这些文本修改。但如果 SKILL 有特定的格式要求（如必须保留某些句首人名），需要注意后处理可能改变它。

### 5.3 chain 和 compose 模式都覆盖

- **chain 模式**：每个 SKILL 步骤调用 API 时都会注入17条方法论
- **compose 模式**：合并后的 system prompt 也会注入17条方法论

无论用户选择哪种模式，降AI都生效。

### 5.4 正文层专属

降AI只在正文层（step 4）生效。设定层、卷纲层、章节层不受影响。SKILL 在这些层的输出不会被后处理清洗。

---

## 六、数据流（SKILL 输出到最终正文）

```
SKILL 模板（compose 合并或 chain 逐步）
  -> callApiWithAgent（注入降AI方法论到 system prompt）
  -> aiService.callAi（调用 API，流式返回）
  -> parseGenerationResult（解析返回，分离 body 和 metadata）
  -> DeAiProcessor.process(body)（后处理硬规则清洗）
  -> finalBody（最终正文）
  -> bodyResult.value（UI 显示）
  -> ch.body（项目存储）
  -> insertToEditor（插入编辑器）
  -> confirmBodyWithMemory（记忆抽取）
```

**关键**：DeAiProcessor 处理的是 `parseGenerationResult` 分离后的 body 部分，metadata 不受影响。

---

## 七、SKILL 层建议

1. **正文层 SKILL 模板不需要写降AI规则**，应用层已覆盖
2. **正文层 SKILL 应专注写作风格和结构指导**，如场景分配、节奏控制、角色语言
3. **如果使用 chain 模式（S1骨架-S2血肉-S3打磨）**，三步都会注入降AI方法论，三步的输出都不会被后处理跳过
4. **后处理会修改 SKILL 输出的文本**，但不会改变语义和结构，只做字符级替换和合并
5. **SKILL 输出的 metadata（如来源覆盖）不会被后处理触碰**，因为 parseGenerationResult 已分离 body 和 metadata

---

## 八、相关文件索引

| 文件 | 行号 | 内容 |
|------|------|------|
| src/services/de-ai.js | 2469 | DEAI_METHODOLOGY_PROMPT 17条全文 |
| src/services/de-ai.js | 31 | HARD_RULES 硬规则注册表 |
| src/services/de-ai.js | 259 | BANNED_VOCAB 255条禁用词 |
| src/services/de-ai.js | 305 | BANNED_PHRASES 34条禁用句式 |
| src/services/de-ai.js | 2103 | process() 后处理入口函数 |
| src/components/pipeline/PipelinePanel.vue | 892 | import 引入 |
| src/components/pipeline/PipelinePanel.vue | 2090 | callApiWithAgent 注入点 |
| src/components/pipeline/PipelinePanel.vue | 2710 | genBody 后处理调用点 |

---

## 九、UI 变化

正文层「AI生成正文」按钮旁新增「已内嵌降AI」标识，用户可见。纯展示，无交互按钮。

用户无需手动触发降AI，生成时自动执行。主页编辑器仍保留独立的降AI深度处理功能，供用户生成后手动深度打磨。

---

## 十、结论

SKILL 层无需做任何改动。应用层已在前置层（system prompt 注入）和后处理层（硬规则清洗）实现了完整的降AI闭环。SKILL 层应专注写作风格和结构指导，降AI由应用层负责。
