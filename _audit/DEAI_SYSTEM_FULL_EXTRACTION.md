# 去AI味系统完整抽取报告 — 第一项深度分析

> 生成日期: 2026-09-05
> 分析范围: 应用去AI味系统全部源码
> 目的: 搞清楚我们到底有什么、缺什么、什么没验证过

---

## 一、系统架构总览

我们的去AI味系统是**双层架构**，不是扁平的禁用词列表：

```
用户点击「去AI味」按钮
  ↓
useDeAi.process(text)
  ↓
  ├─ 第一层：AI 处理（需要 Provider + SKILL + Agent 配置）
  │   ├─ chain 模式：S1重写 → hardrule pre → S2验证 → hardrule post → cross-model → zhuque
  │   ├─ split-merge 模式：分片 → 并行重写 → 合并 → hardrule post → cross-model → zhuque
  │   └─ multi-step 模式：事件提取 → 视角选择 → 重构输出 → hardrule post → S2验证 → cross-model → zhuque
  │
  └─ 第二层：本地文本处理（纯前端，不需要 API）
      └─ applyTextFilter(result) — 最终兜底，处理所有模式输出后的文本
```

**关键结论：即使不配置任何 SKILL 和 Agent，第二层 applyTextFilter 仍然会执行。但第一层的完整链路从未端到端验证过。**

---

## 二、源码文件清单

| 文件 | 行数 | 职责 |
|------|------|------|
| `src/stores/deai.ts` | ~100 | Pinia store，配置持久化，状态管理 |
| `src/composables/useDeAi.ts` | ~368 | 三种模式的执行逻辑，AI 调用，cross-model，zhuque |
| `src/services/de-ai.js` | 2193 | DeAiProcessor 硬规则引擎，20 条规则的具体实现 |
| `src/services/deai-samples.js` | ~60 | 38 个人类写作风格参考样本 |
| `src/components/settings/DeAiSettings.vue` | UI | 设置页，20 个规则开关，模式选择，参数配置 |
| `src/components/editor/EditorPanel.vue` | UI | 编辑器「去AI味」按钮，调用 triggerDeAi |

---

## 三、DeAiStore 完整字段定义（src/stores/deai.ts）

```typescript
// 配置字段
enabled: ref(false)              // 总开关
mode: ref('chain')               // 处理模式：chain | split-merge | multi-step
skillIds: ref<string[]>([])      // 选中的 SKILL ID 列表
agentId: ref<string|null>(null)  // 绑定的 Agent ID
hardruleEnabled: ref(true)       // 硬规则总开关
hardRules: ref<Record<string, boolean>>({})  // 20 条规则的独立开关
version: ref('v3')               // V2 或 V3
level: ref('medium')             // 处理强度：light | medium | heavy
textType: ref('novel')           // 文本类型：novel | script | media
splitSize: ref(1000)             // 分片大小（split-merge 模式用）

// 运行时状态
isProcessing: ref(false)         // 是否正在处理
progress: ref(0)                 // 进度百分比
currentStep: ref('')             // 当前步骤名称
flowPreview: ref<string[]>([])   // 流程预览步骤列表
errorMessage: ref('')            // 错误信息
lastFailedStep: ref('')          // 最后失败的步骤
```

持久化键：`storageKey('deAiConfig')`，JSON 格式存储到本地。

---

## 四、20 条硬规则注册表（src/services/de-ai.js:31）

这是 HARD_RULES 数组，每条规则是一个**处理动作开关**，不是禁用词列表：

| 序号 | ID | 名称 | 作用 |
|------|-----|------|------|
| 1 | cliches | AI套话替换 | 60+ 条正则替换（如「值得注意的是」→「有意思的是」） |
| 2 | connectors | 连接词替换 | 10+ 条替换（如「然而」→「不过」，「因此」→「所以」） |
| 3 | dropNames | 去掉句首人名 | 删除段落开头的人名 |
| 4 | dropPronouns | 去掉句首他/她 | 删除段落开头的代词 |
| 5 | mergeShort | 合并短句 | 连续短句合并为长句 |
| 6 | narratorIntermediary | 中转词删除 | 删除「他看到」「她想到」等中转表述 |
| 7 | causalInversion | 因果倒装 | 因果句式倒装变换 |
| 8 | frameStripping | 框架剥离 | 剥离模板化框架句 |
| 9 | reduceSensory | 压缩感官描写 | 压缩过密的感官描写 |
| 10 | templateOpening | 替换模板化开头 | 替换套路化段落开头 |
| 11 | mergeShortPara | 合并短段落 | 合并过短段落 |
| 12 | shuffleListing | 打散列举模式 | 打散「首先…其次…最后」式列举 |
| 13 | breakUniformity | 修复段落趋同 | 段落长度差异化 |
| 14 | fixUniformLen | 修复句长趋同 | 句子长度差异化 |
| 15 | rhythmVariation | 段落节奏变化 | 段落长短交替节奏 |
| 16 | fixPeriods | 段首句号修复 | 段落开头短句句号转逗号 |
| 17 | breakConnectors | 打断连接词序列 | 打断连续的连接词 |
| 18 | deDiReplace | 的/地替换 | 结构助词「地」→「的」（排除 200+ 特例词） |
| 19 | dunhaoToComma | 顿号转逗号 | 顿号转逗号 |
| 20 | aiFreqDetect | AI高频词检测 | 检测 27 个 AI 高频词（检测不删除） |

---

## 五、具体规则内容统计

### 5.1 CLICHES 数组（de-ai.js:60）— 60+ 条正则替换

这是 AI 套话替换规则的具体内容。每条是 `{ pattern: 正则, replace: 替换文本 }` 结构。

示例（前 10 条）：

| 原文模式 | 替换为 |
|---------|-------|
| 值得注意的是 | 有意思的是 |
| 综上所述 | 说到底 |
| 总的来说 | 归根结底 |
| 总而言之 | 一句话 |
| 由此可见 | 这么看下来 |
| 与此同时 | 同时 |
| 换言之 | 换个说法 |
| 简而言之 | 长话短说 |
| 毫无疑问 | 不用说 |
| 不可否认 | 说实话 |

完整列表有 60+ 条，覆盖：
- AI 议论文套话（综上所述/总而言之/由此可见/显而易见/不难发现/不难看出）
- AI 过渡句（与此同时/此外/在这个过程中/在这个背景下）
- AI 书面化表达（进行了/做出了/存在着/产生了/形成了/极大的/显著的/深刻的/充分的/有效的）
- AI 说教句（只要掌握正确的方法/需要保持独立思考/应该选择适合自己的方法/只有不断学习）
- AI 总结句（这说明/这表明/这证明/这意味着）
- AI 句式（不仅…而且/不仅…还可以/为…创造了更多）

### 5.2 CONNECTOR_REPLACE 数组（de-ai.js:152）— 10+ 条

| 原文 | 替换为 |
|------|-------|
| 然而 | 不过 |
| 首先 | 一开始 |
| 其次 | 接着 |
| 最后 | 到头来 |
| 可以预见 | 往后看 |
| 可见 | 看得出来 |
| 因此 | 所以 |
| 另外 | 还有 |

### 5.3 AI_FREQ_WORDS 数组（de-ai.js:200 附近）— 27 个检测词

检测不删除，返回列表供 S2 验证参考：

```
缓缓地, 不禁, 一抹, 深邃的, 值得注意的是, 综上所述, 与此同时,
不仅, 而且, 然而, 因此, 此外, 另外, 总的来说, 总而言之,
首先, 其次, 最后, 值得一提的是, 众所周知, 不可否认,
毫无疑问, 显而易见, 换言之, 简而言之, 由此可见, 在这个过程中,
在这个背景下, 随着
```

### 5.4 DI_EXCEPTIONS 数组 — 200+ 条排除词

的/地替换规则的排除列表，覆盖所有不应替换的含「地」词语：
- 地理类（地上/地下/地面/地板/地毯…）
- 成语（天崩地裂/天翻地覆/惊天动地…）
- 副词（忽地/蓦地/陡地/猛地…）
- 固定搭配（目的地/本地/外地/内地…）

### 5.5 SUMMARY_PATTERNS — 段落总结句删除

正则删除段落末尾的 AI 总结句，如：
- 「因此，我们需要…」
- 「由此可见…」
- 「总的来说…」
- 「这说明了…」
- 「这是一种值得…的选择」
- 「只要…就能…」

### 5.6 applyTextFilter（useDeAi.ts:273）— 最终兜底层

这是在所有模式处理完成后**额外执行**的本地文本处理：

1. **18 个 AI 高频词直接删除**：值得注意的是/此外/与此同时/由此可见/综上所述/总而言之/从某种程度来说/进行了/做出了/存在着/发生了/产生了/形成了/极大的/显著的/深刻的/充分的/有效的
2. **句号转逗号**：段落内第一句小于等于30字时，句号转逗号
3. **短句合并**：连续 3 个短句（各小于等于15字）且总长小于等于50字时，句号转逗号合并

---

## 六、三种执行模式详解

### 6.1 chain 模式（useDeAi.ts:61）

```
原始文本
  → S1 重写（注入 3 个风格样本作为参考）
  → 首句主语验证（如果 S1 首句主语和原文相同，重试一次）
  → hardrule pre（DeAiProcessor 第一遍）
  → S2 验证（用第二个 SKILL 验证重写质量）
  → hardrule post（DeAiProcessor 第二遍）
  → cross-model 跨模型校验
  → zhuque 朱雀检测
  → applyTextFilter 最终兜底
```

需要配置：至少 1 个 SKILL（S1 重写），可选第 2 个 SKILL（S2 验证），可选 Agent。

### 6.2 split-merge 模式（useDeAi.ts:129）

```
原始文本
  → 按 splitSize 分片（智能断句）
  → 并行调用 API 重写每个分片
  → 合并所有分片
  → hardrule post（DeAiProcessor）
  → cross-model 跨模型校验
  → zhuque 朱雀检测
  → applyTextFilter 最终兜底
```

需要配置：至少 1 个 SKILL（重写模板），可选 Agent。

### 6.3 multi-step 模式（useDeAi.ts:190）

```
原始文本
  → 提取事件核心
  → 选择叙事视角
  → 重构输出
  → hardrule post（DeAiProcessor）
  → S2 验证
  → cross-model 跨模型校验
  → zhuque 朱雀检测
  → applyTextFilter 最终兜底
```

需要配置：至少 1 个 SKILL（重构模板），可选第二个 SKILL（验证），可选 Agent。

---

## 七、风格样本库（deai-samples.js）

38 个人类写作风格参考样本，在 chain 模式 S1 重写时注入到 prompt 前部作为风格参考：

```javascript
// useDeAi.ts:78
const allSamples = DeAiSamples.getAll()  // 获取 38 个样本
const selectedSamples = allSamples.slice(0, 3)  // 取前 3 个
s1Input = '[style reference]\n' + selectedSamples.join('\n') + '\n\n--- text ---\n' + current
```

样本来源：降得快（jdk_clone.py），涵盖多种题材的真实人类写作片段。

---

## 八、与 WriterHelper 的真实差距

| 维度 | 我们 | WriterHelper | 差距分析 |
|------|------|-------------|---------|
| 禁用词替换 | 60+ 条正则（CLICHES） | 200+ 条禁用词 | 我们少约 140 条，但架构支持直接扩展 |
| 禁用句式 | 无独立句式规则 | 33 条禁用句式 | 我们用 SUMMARY_PATTERNS 部分覆盖，但不系统 |
| 处理动作 | 20 条规则（含替换/删除/合并/倒装/节奏等） | 未知是否有等价处理动作 | 我们的更深层，不只是词级替换 |
| 的/地替换 | 200+ 排除词，完整实现 | 未知 | 我们已完整 |
| 高频词检测 | 27 个词（检测不删除） | 未知 | 我们有检测层 |
| 风格样本 | 38 个人类写作样本 | 12 种风格包 | 不同维度：我们是参考片段，他们是风格定义 |
| 跨模型校验 | 有（cross-model check） | 有 | 对等 |
| 朱雀检测 | 有（zhuque check） | 有 | 对等 |
| 处理模式 | 3 种（chain/split-merge/multi-step） | 未知 | 我们的更丰富 |
| 处理强度 | 3 档（light/medium/heavy） | 未知 | 我们有 |
| 文本类型 | 3 种（novel/script/media） | 未知 | 我们有 |
| 规则开关 UI | 20 个独立开关 | 未知 | 我们有 |
| 端到端验证 | **从未验证过** | 未知 | 这是最大风险 |

---

## 九、核心问题：从未端到端验证

### 9.1 未验证的原因

完整链路需要以下条件全部满足：
1. Provider 配置（API 供应商 + Key）— 用户侧配置
2. SKILL 配置（至少 1 个重写 SKILL）— 需要制作并导入
3. Agent 配置（可选，但影响质量）— 需要制作并导入
4. DeAiSettings 配置（模式选择 + 规则开关）— UI 已有

目前：UI 有，store 有，处理逻辑有，但从没做过「配置 SKILL + Agent → 点去AI味 → 验证输出」的完整闭环测试。

### 9.2 唯一能独立运行的部分

`applyTextFilter`（useDeAi.ts:273）是纯本地处理，不需要 API 调用。它会在所有模式处理完成后执行。如果第一层（AI 处理）跳过，只有这一层能跑：
- 18 个 AI 高频词删除
- 句号转逗号
- 短句合并

但这只是完整系统的兜底层，不是全部能力。

---

## 十、正确的行动方案

### 第一步：验证现有链路

不是扩词库，而是先确认整条链路能跑通：
1. 配置一个测试 Provider
2. 制作一个最简重写 SKILL（template 就写「重写以下文本，去除 AI 味，保持原意」）
3. 在设置页 DeAiSettings 选择 chain 模式 + 这个 SKILL
4. 在编辑器输入测试文本
5. 点击「去AI味」按钮
6. 验证：S1 重写是否调用 API → hardrule 是否执行 → applyTextFilter 是否执行 → 最终输出是否合理

### 第二步：补齐禁用词到 200+

链路验证通过后，把 CLICHES 数组从 60+ 条扩展到 200+ 条。这是数据层操作，不改架构。

### 第三步：补齐禁用句式

参考 WriterHelper 的 33 条禁用句式，在 CLICHES 或独立数组中补齐句式级规则。

### 第四步：风格样本和风格包联动

风格包 SKILL（第二项交接给 SKILL 层）制作完成后，可以作为 DeAi 的 SKILL 使用，让重写时注入风格约束。

---

## 十一、结论

报告说我们 DeAI 是「6/10，规则库远超不过对手」，实际情况是：

- 我们的**架构比 WriterHelper 更深**：20 条处理动作规则 + 60+ 条词替换 + 200+ 条排除词 + 27 个检测词 + 38 个风格样本 + 3 种处理模式 + 3 档强度 + 3 种文本类型 + 跨模型 + 朱雀检测
- 我们的**词库量级确实不够**：60+ vs 200+，差 140 条，但这是数据扩展，不是架构问题
- 我们**缺禁用句式**：没有独立的句式规则数组，SUMMARY_PATTERNS 只部分覆盖
- 我们**从未验证过**：这是最大风险，不是规则不够，是不知道能不能跑通

所以第一项的正确操作顺序是：**先验证 → 再扩词 → 再补句式**，不是直接移植 200+ 禁用词。
