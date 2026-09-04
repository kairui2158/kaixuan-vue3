# 参考大纲上下文传递方案：结构化大纲索引（SOI）替代500字截断

> 日期：2026-09-04
> 状态：待审核
> 经验文件引用：§8 规则62（outlineContent按activeTab.mode区分）、§8 规则67（编辑器内容为主、大纲为参考）
> 社区调研基础：Agent-Skills-for-Context-Engineering v2.5.0、Awesome-Context-Engineering (arXiv:2507.13334)、argOS Hierarchical Summarization、Craft Agents intent-aware summarization

---

## 一、问题根因

### 当前实现

ChatPanel.vue 中 `referenceOutline`（原 `outlineContent`）在所有非主编辑器页签中都被设置为：

```typescript
referenceOutline = (someText || '').slice(0, 500)
```

涉及位置（6处）：

| 函数 | 行号 | 页签模式 | 截断来源 |
|------|------|----------|----------|
| buildTemplateContext | 310 | vol-outline | projectStore.outlineText 前500字 |
| buildTemplateContext | 316 | ch-plot | volumes[vi].outline/summary 前500字 |
| buildTemplateContext | 327 | ch-body | ch.plot/summary 前500字 |
| sendMessage chatCtx | 671 | vol-outline | projectStore.outlineText 前500字 |
| sendMessage chatCtx | 679 | ch-plot | volumes[vi].outline/summary 前500字 |
| sendMessage chatCtx | 698 | ch-body | ch2.plot/summary 前500字 |

### 为什么500字无效

1. **信息密度极低**：十几万字大纲的前500字通常是项目标题和开头几行，与用户当前讨论的卷/章节内容毫无关联。
2. **丢失结构信息**：截断丢弃了卷名、卷摘要、章节列表等结构信息，模型无法知道大纲的整体架构。
3. **社区验证**：Context Engineering 领域的共识是「context quality matters more than quantity」——500字低质量上下文远不如结构化的摘要索引有效。
4. **lost-in-middle现象**：即使传入完整大纲，中间位置的注意力也最弱，截断反而强化了「只看到开头」的偏差。

---

## 二、社区调研结论

### 1. Agent-Skills-for-Context-Engineering v2.5.0

核心发现：
- **结构化摘要优于激进压缩**：「Structured summarization with explicit sections preserves more useful information than aggressive compression」
- **tokens-per-task优化目标**：正确优化目标不是「每次请求少用token」，而是「每个任务的有效信息密度」
- **文件系统作为上下文**：用 `ls`、`grep`、`read_file` 做目标性上下文发现，优于语义搜索的结构性查询

**对号入座**：我们的大纲本身就是结构化文件（卷→章节→剧情点），应该提取结构索引而非截断文本。

### 2. Awesome-Context-Engineering (arXiv:2507.13334)

核心发现：
- **Context Scaling**：长文档不应整体塞入上下文，应分层管理
- **Self-Generated Context**：让模型先生成摘要再用于后续请求
- **Compaction**：在上下文接近限制时做摘要压缩，保留结构化信息

**对号入座**：大纲作为背景参考时，应该用「结构化压缩」生成卷名+摘要列表，而非暴力截断。

### 3. argOS Linguistic Simulation Engine

核心发现：
- **Hierarchical Summarization**：多级摘要，从高层概览到详细细节
- **Relevance Filtering**：根据当前上下文和查询智能选择最相关信息
- **Contextual Grounding**：LLM交互前序列化相关世界状态，而非全量数据

**对号入座**：用户在讨论第三卷第五章时，应该提供「全卷列表+当前卷摘要+相关章节列表」的分级上下文。

### 4. Craft Agents

核心发现：
- **intent-aware summarization**：工具响应超过60KB时自动用Claude Haiku做摘要，注入 `_intent` 字段保持摘要焦点
- **Large Response Handling**：大响应不直接传入，而是按意图提取关键信息

**对号入座**：大纲参考也应按当前页签意图提取相关结构信息，而非固定截断500字。

---

## 三、方案设计：结构化大纲索引（SOI）

### 核心思路

不再截断大纲文本，而是从项目数据中提取「结构化大纲索引」（Structured Outline Index, SOI），包含：

1. **全局卷概览**：所有卷的卷名 + 一句话摘要（每卷限100字）
2. **当前上下文锚点**：根据当前页签模式，附加更详细的层级信息
3. **token预算控制**：SOI总长度控制在2000-4000字符，远比500字有效，但不会占满上下文

### SOI 数据结构

```typescript
interface StructuredOutlineIndex {
  // 全局概览：所有卷的卷名和摘要
  volumeOverview: string
  // 当前锚点：根据页签模式附加的详细结构
  currentAnchor: string
  // 完整大纲可选原文（仅主编辑器页签使用）
  fullOutline?: string
}
```

### 各页签模式下的填充策略

#### 模式1：vol-outline（卷纲要页签）

```typescript
referenceOutline = buildSOI({
  volumeOverview: volumes.map(v => `${v.name || v.title || '未命名'}：${(v.summary || v.outline || '').slice(0, 100)}`).join('\n'),
  currentAnchor: `${currentVol.name} 的卷纲要：
${currentVol.outline || currentVol.summary || '（空）'}

本卷包含 ${chaptersOfVol.length} 章：
${chaptersOfVol.map((ch, i) => `  ${i+1}. ${ch.title || ch.name || '未命名'}${ch.summary ? ' — ' + ch.summary.slice(0, 50) : ''}`).join('\n')}`
})
```

**效果**：
- 模型看到所有卷的概览（知道全局架构）
- 当前卷的完整纲要
- 当前卷下所有章节标题和摘要（知道有哪些章节）

#### 模式2：ch-plot（章节剧情页签）

```typescript
referenceOutline = buildSOI({
  volumeOverview: volumes.map(v => `${v.name}：${(v.summary || '').slice(0, 60)}`).join('\n'),
  currentAnchor: `${currentVol.name}（第${volIdx+1}卷）
本卷纲要：${(currentVol.outline || currentVol.summary || '').slice(0, 500)}

当前章节：${currentCh.title}
章节剧情：${editorContent}

前后章节：
  前一章：${prevCh?.title || '无'}
  后一章：${nextCh?.title || '无'}`
})
```

**效果**：
- 全局卷概览（简略版，每卷60字）
- 当前卷纲要（500字，因为现在讨论的是章节，卷纲要做背景）
- 当前章节标题和剧情（作为主创作上下文在 editorContent 中）
- 前后章节标题（保持叙事连贯性）

#### 模式3：ch-body（正文页签）

```typescript
referenceOutline = buildSOI({
  volumeOverview: volumes.map(v => `${v.name}：${(v.summary || '').slice(0, 60)}`).join('\n'),
  currentAnchor: `${currentVol.name}（第${volIdx+1}卷）
本卷纲要：${(currentVol.outline || currentVol.summary || '').slice(0, 300)}

当前章节：${currentCh.title}
章节剧情：${(currentCh.plot || currentCh.summary || '').slice(0, 500)}

前一章摘要：${prevCh ? (prevCh.summary || prevCh.plot || '').slice(0, 200) : '无'}`
})
```

**效果**：
- 全局卷概览（简略版）
- 当前卷纲要（300字，正文创作时只需背景）
- 当前章节剧情（500字，正文创作的直接依据）
- 前一章摘要（200字，保持连续性）

#### 模式4：主编辑器（无页签）

```typescript
referenceOutline = projectStore.outlineText || ''  // 完整大纲，保持现有逻辑
```

**效果**：主编辑器讨论时完整大纲仍然可用，不改变现有行为。

---

## 四、实现细节

### 新增函数：buildSOI

位置：ChatPanel.vue 内或 projectStore 工具函数

```typescript
/**
 * 构建结构化大纲索引（SOI），替代500字截断
 * 参考：Agent-Skills-for-Context-Engineering「Structured summarization preserves more useful information」
 */
function buildSOI(parts: { volumeOverview: string; currentAnchor: string; fullOutline?: string }): string {
  const sections: string[] = []
  
  // 全局卷概览
  if (parts.volumeOverview) {
    sections.push('【全局卷概览】\n' + parts.volumeOverview)
  }
  
  // 当前上下文锚点
  if (parts.currentAnchor) {
    sections.push('【当前上下文锚点】\n' + parts.currentAnchor)
  }
  
  // 完整大纲（仅主编辑器）
  if (parts.fullOutline) {
    sections.push('【完整大纲】\n' + parts.fullOutline)
  }
  
  return sections.join('\n\n')
}
```

### 修改 buildTemplateContext（行299-345）

将6处 `.slice(0, 500)` 替换为对应的 `buildSOI(...)` 调用。

### 修改 sendMessage chatCtx（行660-730）

将6处 `.slice(0, 500)` 替换为对应的 `buildSOI(...)` 调用。

### 系统提示注入（行726-730）

现有逻辑：
```typescript
if (!chatCtx.referenceOutline) {
  chatCtx.referenceOutline = projectStore.outlineText || ''
}
if (chatCtx.referenceOutline) {
  systemParts.push('参考资料-大纲概要：\n' + chatCtx.referenceOutline)
}
```

修改为：
```typescript
if (!chatCtx.referenceOutline) {
  // 无页签时使用完整大纲
  chatCtx.referenceOutline = projectStore.outlineText || ''
}
if (chatCtx.referenceOutline) {
  systemParts.push('参考资料-大纲索引：\n' + chatCtx.referenceOutline)
}
```

标签从「大纲概要」改为「大纲索引」以反映结构化内容。

---

## 五、对比分析

### Before（当前500字截断）

| 场景 | 传入内容 | 模型能获取的信息 | 有效性 |
|------|----------|-------------------|--------|
| 讨论第三卷 | 大纲前500字 | 项目标题+前几行 | 几乎无效 |
| 讨论第五章 | 卷纲要前500字 | 卷纲要开头 | 低 |
| 讨论正文 | 章节剧情前500字 | 章节剧情开头 | 中低 |

### After（SOI结构化索引）

| 场景 | 传入内容 | 模型能获取的信息 | 有效性 |
|------|----------|-------------------|--------|
| 讨论第三卷 | 全卷概览+当前卷完整纲要+章节列表 | 全局架构+当前卷详情+章节结构 | 高 |
| 讨论第五章 | 卷概览+卷纲要500字+前后章节标题 | 全局架构+卷背景+章节位置 | 高 |
| 讨论正文 | 卷概览+卷纲要300字+章节剧情500字+前章摘要 | 全局架构+卷背景+章节依据+连续性 | 高 |

### Token消耗对比

| 方案 | 平均token消耗 | 信息密度 |
|------|-------------|-----------|
| 500字截断 | ~250 tokens | 极低 |
| SOI结构化索引 | ~800-1500 tokens | 高 |
| 完整大纲 | ~10000-30000 tokens | 高但可能超限 |

SOI在信息密度和token消耗之间取得最优平衡。

---

## 六、风险与边界

### 不改变的部分

1. `editorContent`（编辑器内容）仍然是主创作上下文，优先级高于 referenceOutline。
2. 系统提示注入顺序不变：agentPrompt → 编辑器内容 → 设定 → 记忆 → 参考大纲。
3. 主编辑器页签仍使用完整大纲，不影响现有行为。
4. SKILL 模板变量 `outlineContent` 保留兼容（值等于 `referenceOutline`）。

### 需要注意的边界

1. **空项目边界**：无卷时 `volumeOverview` 为空字符串，`buildSOI` 应处理空值不报错。
2. **单卷项目**：只有一卷时概览只有一行，不影响功能。
3. **超多卷项目**：20+卷时概览可能较长，每卷摘要限制100字，20卷=2000字，仍在可控范围。
4. **无章节的卷**：章节列表为空时显示「本卷暂无章节」，不报错。
5. **与大纲工作台的隔离**：大纲工作台锁定服务流水线（闭环A），主页编辑器共创服务（闭环B），两套独立闭环不混用 SOI 逻辑。

---

## 七、验证计划

### 源码级验证

1. 修改后 `rg 'slice.*500' ChatPanel.vue` 应返回0结果（除注释外）
2. `buildSOI` 函数在所有4种页签模式下都能正确生成结构化内容
3. 空项目、单卷项目、多卷项目都能正常工作

### Electron启动验证

1. 启动应用，打开有多卷多章节的项目
2. 切换到卷纲要页签，发送消息，检查 API 请求中 system prompt 是否包含「全局卷概览」+「当前上下文锚点」
3. 切换到章节剧情页签，发送消息，检查是否包含前后章节标题
4. 切换到正文页签，发送消息，检查是否包含前一章摘要
5. 主编辑器页签发送消息，确认仍使用完整大纲

---

## 八、经验文件引用

| 经验规则 | 相关性 |
|----------|--------|
| §8 规则62 | outlineContent不能恒注入完整大纲，按activeTab.mode区分 → SOI遵循此规则，按模式分级提取 |
| §8 规则67 | 编辑器内容为主、大纲为参考 → SOI只修改 referenceOutline，不影响 editorContent 的优先级 |
| §1 规则6 | store saveConfig不重新赋值 → 本方案不涉及 store 写入，只读取 volumes/chapters |
| §2 规则37 | Electron 33 CDP Runtime可能假死 → 验证时优先用rg扫描+type-check，CDP作为辅助 |

---

## 九、社区参考来源

| 来源 | 关键发现 | 对应方案设计 |
|------|----------|-------------|
| Agent-Skills-for-Context-Engineering v2.5.0 | 结构化摘要优于激进压缩；tokens-per-task优化 | SOI结构化索引设计 |
| Awesome-Context-Engineering (arXiv:2507.13334) | Context Scaling分层管理；Self-Generated Context | 全局概览+当前锚点分层 |
| argOS Linguistic Simulation Engine | Hierarchical Summarization多级摘要 | 卷概览→卷纲要→章节列表多级结构 |
| Craft Agents | intent-aware summarization按意图提取 | 根据页签模式提取不同层级的结构信息 |

---

## 十、执行步骤

### P0：新增 buildSOI 函数
- 在 ChatPanel.vue 中新增 `buildSOI` 函数
- 处理空值边界
- 单元测试4种页签模式

### P1：重构 buildTemplateContext 的3处截断
- 行310：vol-outline模式
- 行316：ch-plot模式
- 行327：ch-body模式
- 替换为 buildSOI 调用

### P2：重构 sendMessage chatCtx 的3处截断
- 行671：vol-outline模式
- 行679：ch-plot模式
- 行698：ch-body模式
- 替换为 buildSOI 调用

### P3：更新系统提示标签
- 行730：「大纲概要」→「大纲索引」
- 确保主编辑器页签仍使用完整大纲

### P4：源码级验证
- rg扫描确认无残留500字截断
- type-check通过
- 空项目/单卷/多卷边界检查

### P5：Electron启动验证
- 启动应用
- 多卷项目下4种页签模式各发一条消息
- 检查API请求中system prompt的结构化内容
- 确认主编辑器仍使用完整大纲

### P6：更新经验文件
- 写入规则68：referenceOutline不得使用固定字数截断，必须使用SOI结构化索引
- 写入规则69：buildSOI函数的分层策略和token预算控制

### P7：收尾
- 清理临时文件
- 提交代码
- 更新开发日志
