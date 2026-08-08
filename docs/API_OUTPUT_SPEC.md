# 写作助手 — API 输出格式规范

> 版本: 2.7.7 | 更新日期: 2026-07-26
> 源码依据: renderer_v2.js (apiGenerate, line 844-995) + pipeline-manager.js (各步骤解析逻辑)

---

## 总体原则

1. **Step 1-4 返回 JSON 数组**，Step 5 返回纯文本
2. JSON 数组用 `text.match(/\[[\s\S]*\]/)` 提取，因此：
   - 允许 JSON 前后有解释文字（解析器只取第一个 `[...]` 段）
   - 允许 Markdown 代码块包裹（```json ... ``` 也能被提取）
   - **不需要**包裹在 `{code: 0, data: [...]}` 等外层结构里
   - 数组必须以 `[` 开头、`]` 结尾
3. 如果 JSON 解析失败，各步骤有不同的容错策略（见下文）

---

## Step 1: 大纲 (outline)

| 项目 | 说明 |
|------|------|
| API type | 不调用 API（用户手动输入/导入） |
| 输入 | 用户在编辑器中输入或从文件导入 |
| 输出格式 | 纯文本，无格式要求 |
| 解析逻辑 | 直接存入 `pl.outlineText`，不做解析 |

---

## Step 2: 设定 (settings)

### 期望返回格式

```json
[
  {
    "name": "陈暮",
    "category": "人物",
    "description": "末日幸存者，菌膜装甲共生体",
    "attrs": {
      "描述": "性格内敛谨慎，责任感驱动",
      "特点": "习惯性孤狼思维，缜密",
      "关系": "方岫岩的弟子，五位战友恋人"
    }
  },
  {
    "name": "菌毯网络",
    "category": "世界观",
    "description": "覆盖大陆的真菌生态系统",
    "attrs": {
      "描述": "能过滤空气和水源",
      "特点": "有节点和中继结构",
      "关系": "与盖亚巨树共生"
    }
  }
]
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 设定名称 |
| category | string | 是 | 分类，用于自动归类（见下方映射规则） |
| description | string | 否 | 设定描述（映射到存储的 content 字段） |
| attrs | object | 否 | 属性对象，键值对形式 |

### category 自动映射规则（_plSaveSettings, line 348-352）

| category 包含 | 归入分类 |
|--------------|---------|
| "世界" | worldview |
| "物种" 或 "种族" | species |
| "物"（但不包含"人物"） | items |
| 其他（含"人物"、默认） | characters |

### 容错策略

- 如果返回的不是 JSON 数组（如返回了校验报告），会触发 `_plGenSettingsFromReport` 二次生成
- 二次生成 prompt 会明确要求"只返回JSON数组，不要返回报告或说明文字"

### 注意：prompt 与系统提示词的不一致

| 来源 | 要求字段 |
|------|---------|
| 系统提示词 (line 849) | name, category, description, attrs |
| 用户 prompt (line 435) | name, category, attrs: {描述, 特点, 关系} |

**差异**: prompt 用 `attrs` 的子键（描述/特点/关系），系统提示词用独立的 `description` 字段。代码解析时两者都兼容（line 354: `item.attrs || {}` 和 `item.description || ""`），但建议 API 返回时同时包含 `description` 和 `attrs` 以确保兼容。

---

## Step 3: 卷纲 (volumes)

### 期望返回格式

```json
[
  {
    "name": "第一卷·菌毯之上",
    "outline": "陈暮从低温休眠中苏醒，发现世界被菌毯覆盖..."
  },
  {
    "name": "第二卷·裂谷与平原",
    "outline": "陈暮穿越裂谷，遭遇融合型感染者..."
  }
]
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 卷名（缺失时回退为 "Volume N"） |
| outline | string | 是 | 卷纲概要（同时映射到 summary 字段） |

### 解析逻辑 (line 524)

```javascript
var vols = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || "[]");
pl.volumes = vols.map(function(v, idx) {
  return {
    id: "vol_" + Date.now() + "_" + idx,
    name: v.name || ("Volume " + (idx+1)),
    outline: v.outline || "",
    summary: v.outline || "",  // outline 同时写入 summary
    chapters: [],
    confirmed: false
  };
});
```

### 容错策略

- JSON 解析失败：显示原始文本，toast 警告"AI返回的卷纲格式异常"
- 不做二次生成，用户需手动重试

---

## Step 4: 章节 (chapters)

### 期望返回格式

```json
[
  {
    "title": "第一章·苏醒",
    "plot": "陈暮在废弃实验室中苏醒，发现菌膜装甲已与身体融合",
    "summary": "主角觉醒，初步展示菌膜能力"
  },
  {
    "title": "第二章·废墟",
    "plot": "陈暮探索废墟城市，遭遇首批变异体",
    "summary": "建立世界观，引入威胁"
  }
]
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 是 | 章节标题（缺失时回退为"第N章"） |
| plot | string | 是 | 章节剧情点（缺失时回退到 summary） |
| summary | string | 否 | 章节摘要（可选，plot 的备选） |

### 解析逻辑 (line 808-812)

```javascript
var chaps = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || "[]");
vol.chapters = chaps.map(function(c, idx) {
  return {
    id: "ch_" + Date.now() + "_" + idx,
    title: c.title || ("第" + (idx+1) + "章"),
    plot: c.plot || c.summary || "",  // plot 优先，回退到 summary
    summary: c.summary || "",
    confirmed: false,
    wordCount: pl.chapterWordCount || 2000,
    body: "",
    bodyGenerated: false
  };
});
```

### 注意：prompt 与系统提示词的不一致

| 来源 | 要求字段 |
|------|---------|
| 系统提示词 (line 851) | title, summary |
| 用户 prompt (line 794) | title, plot, summary |

**差异**: 系统提示词只要求 `title` 和 `summary`，但用户 prompt 要求 `title`、`plot`、`summary`。代码解析时 `plot` 会回退到 `summary`，所以只返回 `title` + `summary` 也能工作，但建议同时返回 `plot` 字段以确保章节卡片正确显示剧情点。

### 容错策略

- JSON 解析失败：显示原始文本，toast 警告"AI返回的章节格式异常"
- 不做二次生成

---

## Step 5: 正文 (body)

### 期望返回格式

**纯文本**，无 JSON 结构。

### 解析逻辑 (line 1074-1083)

```javascript
// 直接使用返回的文本，不做任何解析
ch.body = text;
ch.bodyGenerated = true;
pl.bodyText = text;
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| (返回值整体) | string | 正文文本，直接存入 chapter.body |

### prompt 构造 (line 1067)

```
[全书大纲] {outline}
[设定摘要] {settings}
[当前卷概要] {vol.name}: {vol.outline}
[当前章节剧情点] {ch.title}: {ch.plot}
请为本章节生成约{wordCount}字的正文内容。
```

### maxTokens 计算

`maxTokens = wordCount * 5`（line 1071），例如 2000 字 → 10000 tokens

---

## 通用解析机制

### JSON 提取正则

所有 Step 2-4 使用同一正则提取 JSON：

```javascript
text.match(/\[[\s\S]*\]/)
```

- 匹配第一个 `[` 到最后一个 `]` 之间的内容
- 允许 JSON 前后有任意文本
- 允许 Markdown 代码块包裹
- **不支持嵌套数组**（正则是贪婪匹配，会取最外层 `[...]`）

### 不支持的外层结构

以下格式**不被支持**（解析器不会提取）：

```json
{ "code": 0, "data": [...] }     // 不支持：外层是对象不是数组
{ "result": [...] }               // 不支持：同上
{ "success": true, "items": [...] } // 不支持：同上
```

如果 API 返回上述格式，解析器会找不到 `[...]` 段，触发容错逻辑。

---

## Agent 注入对格式的影响

当用户在生成流水线中选择了 Agent（line 888-898）：

| Agent 属性 | 覆盖内容 |
|-----------|---------|
| systemPrompt | 替换默认系统提示词 |
| model | 覆盖 API 模型 |
| temperature | 覆盖温度参数 |
| maxTokens | 覆盖最大 token 数 |

**注意**: 如果 Agent 的 systemPrompt 没有要求返回 JSON 格式，API 可能返回非 JSON 文本，导致解析失败。建议 Agent 的 systemPrompt 中明确包含格式要求。

---

## Skill 注入对格式的影响

### 单个 Skill（append 模式, line 904-910）

Skill 的 template 被追加到 prompt 末尾：

```
{原始prompt}

--- 技能约束 ---
【{skillName}】: {skill.template}
```

### 多个 Skill（链式模式, line 911-976）

Skill 顺序执行，前一个的输出作为后一个的输入：

```
Skill 1: 原始prompt + Skill1.template → 输出1
Skill 2: "以下是上一个技能的输出结果" + Skill2.template + 输出1 → 输出2
Skill 3: 同上 → 最终输出
```

**注意**: 链式模式下，最终输出格式取决于最后一个 Skill 的 template 要求。如果最后一个 Skill 没有要求返回 JSON，解析器可能无法提取 JSON。

---

## 格式规范总结表

| 步骤 | API type | 返回格式 | 必填字段 | 可选字段 | 容错 |
|------|---------|---------|---------|---------|------|
| Step 1 大纲 | (无API) | 纯文本 | - | - | - |
| Step 2 设定 | settings | JSON数组 | name, category | description, attrs | 二次生成 |
| Step 3 卷纲 | volumes | JSON数组 | name, outline | - | 显示原文 |
| Step 4 章节 | chapters | JSON数组 | title, plot | summary | 显示原文 |
| Step 5 正文 | body | 纯文本 | (整体) | - | - |

---

## 已知格式不一致问题

1. **Step 2 设定**: prompt 要求 `attrs: {描述, 特点, 关系}`，系统提示词要求 `description` 字段。两者都被解析但来源不同。
2. **Step 4 章节**: prompt 要求 `plot` 字段，系统提示词只要求 `summary`。代码用 `c.plot || c.summary` 兼容。
3. **Skill 链式模式**: 最终输出格式取决于最后一个 Skill，可能与步骤期望格式不匹配。
