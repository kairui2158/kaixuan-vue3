# 生成流水线 · 卷纲层执行状态说明

> 面向对象：卷纲层 SKILL 制作方。本文记录当前版本的实际运行状态与输入契约，不描述历史改动过程。

## 1. 层级定位

卷纲层（Step 2）位于设定层之后、章节层之前。它的任务是：基于大纲、设定、绑定设定、卷数、全书字数、既有卷信息，产出当前应生成的卷纲 JSON。

当前生成模式：

| 模式 | 语义 |
| --- | --- |
| `auto` | AI 生成全卷，返回多卷数组 |
| `single` | 逐卷生成，每次只生成下一卷 |
| `continue` | 续生成，每次只生成下一卷 |

`single` 与 `continue` 的响应端都会把模型返回截取为 1 项；即使 SKILL/模型多返回，也只写入下一卷。相关判定在 `clampGeneratedVolumes`。

## 2. 基础 Prompt 构成

卷纲层基础 Prompt 由 `buildVolumePrompt` 构造，固定结构如下：

```text
[大纲]
{outlineText}

[设定]
{settingsText}

[绑定设定]      ← 仅存在绑定时
{boundText}

[卷数]
{effectiveVolumes}

[全书总字数]
{totalWords}字

[剩余待分配字数]   ← auto 模式没有；single/continue 有
{remainingWords}字

当前还没有任何卷纲… / 已生成N卷，上一卷为：…
请只生成第N+1卷的卷纲。输出JSON数组（正好1项）…
```

设定层的格式为每项一行：`名称 - JSON.stringify(attrs)`，没有重复来源，因此每一步都会完整保留。

## 3. Chain 模式的上下文契约（当前状态）

当本层选择 chain 模式且绑定多个 SKILL 时：

1. **首个执行步骤**（含断点恢复后的恢复步骤）是“主消费者”，拿到完整基础 Prompt：大纲全文、设定全文、绑定设定、卷数、字数等全部信息。
2. **非首个步骤**默认不再携带大纲全文。`[大纲]` 块会被替换为“大纲结构地图（S2+默认精简视图）”：

```text
[大纲]
[大纲结构地图（S2+默认精简视图）]
原文长度：N字；此视图仅保留结构标题，完整大纲由S1消费。
- 第一卷 起点
- 第一章 旧案
…
```

3. 精简规则是确定性的，不做语义猜测：
   - 只保留卷/章/节/部/序章/楔子/终章/尾声等结构标题行；
   - 每条标题最多 160 字；
   - 最多 300 条，超出部分写“结构标题省略：后N项”；
   - 完全没有标题时，只取前 160 字作为定位探针；
   - `[设定]`、`[绑定设定]`、`[卷数]`、`[全书总字数]` 等块不瘦身；
   - 上一步输出仍按原有 inline_block 通道完整传递。

4. **SKILL 可以显式申请全文**。folder SKILL 在 `meta.json` 中声明：

```json
{
  "chainHandoff": {
    "requiresFullPreviousOutput": true
  }
}
```

语义：该 SKILL 需要完整上游上下文（当前场景即大纲全文 + 基础 Prompt 全文）。声明后该步骤不会做大纲瘦身，仍按原始基础 Prompt 执行。`requiresFullPreviousOutput` 同时也是 handoff artifact 的全文申请开关；当前版本不引入第二个字段。

5. **断点恢复**：恢复到的第一个步骤视为主消费者，拿完整基础 Prompt；其后的步骤才进入默认精简。

### 3.1 上一步产物的交付契约

除基础 Prompt 外，每个非首个 chain 步骤还会收到“上一步 SKILL 输出”。当前版本默认交付全文，不做任何本地截断：

| folder `meta.json` 声明 | 实际交付 |
| --- | --- |
| 未声明 `chainHandoff` | 上一步输出全文 |
| `previousOutput: "full"` 或 `requiresFullPreviousOutput: true` | 上一步输出全文 |
| `previousOutput: "structured"` + `requires: ["facts", "constraints"]` | 只提取命中的 JSON 顶层键或同名 Markdown 标题节 |
| `previousOutput: "excerpt"` | 前 2400 字 canonical excerpt |

structured 是严格契约：`requires` 必须全部命中且非空，才按声明字段拼成 `## 字段名` 交到本步；JSON 解析失败、字段缺失、字段为空、Markdown 标题不匹配时，一律回退全文，并写入 `chain-handoff-contract-miss` warn 事件。应用不做语义猜测，不补字段，不部分命中。

非全文交付（structured / excerpt）时，本步输出会先过 SKILL 有效性校验；校验失败会自动升级为全文重试一次，成功则状态降级为 degraded 继续，失败才终止。trace 中会记录 `chain-handoff-escalation`。

每步 handoff 全文都会进入 runTrace 的 `chain-handoff` processing report；深度导出时外置为 payload 文件并带 sha256，SKILL 调试方不会因为本步拿到 structured/excerpt 而丢失上游全文证据。

## 4. 上一步输出的传递方式

- folder SKILL：上一步输出通过 `inline_block` 单独提供，头为 `--- 上一步 SKILL 完整输出 ---`。
- text SKILL 且模板已引用 `{{previousOutput}} / {{prevResponse}} / {{previousSkillOutput}}`：三个变量名等价，走模板变量，不再拼接独立块。变量值等于本步实际交付内容，例如声明 structured 后只包含命中的字段。
- text SKILL 未引用：同样 inline_block。

SKILL 输出后，应用会剥除回显的 `[相关记忆]` 块和上一步标题块，并记录 `chain-dedupe` 事件；输出回显超过阈值时记录 `chain-output-echo` 警告，但不会阻断生成。

## 5. Run Trace 证据

每个 chain 步骤都会产生：

| 事件 | 内容 |
| --- | --- |
| `chain-step` | 步骤序号、SKILL 名称、是否断点续跑 |
| `chain-context-slim` | 本步上下文决策：`slim` / `full`、原因、是否声明全文、原始/最终 Prompt 长度、大纲原文长度 |
| `chain-handoff` | 本步产物 hash、长度、delivery、是否申请全文、重复 hash 计数 |
| `chain-handoff-delivery` | 本步实际收到的上一步交付：delivery、全文长度、交付长度、声明模式、requires |
| `chain-handoff-contract-miss` | structured 契约未命中原因与缺失字段，随后回退全文 |
| `chain-handoff-escalation` | 非全文交付导致输出校验失败，已升级全文重试 |
| `chain-dedupe` | 中间产物剔除了多少回显字符（如有） |
| `chain-output-echo` | 输出与前序输入重叠警告（如有） |

`chain-context-slim` 的 `reason` 值：

| 值 | 含义 |
| --- | --- |
| `primary_consumer` | 本步是首个执行/恢复步骤，默认拿全文 |
| `declared_full_context` | SKILL 声明需要完整上游上下文 |
| `outline_block_absent` | Prompt 中没有可识别的 `[大纲]` 块，不瘦身 |
| `slimmed` | 已执行确定性大纲瘦身 |

## 6. 解析与产物契约

卷纲层期望输出为 JSON 数组，每项字段：

```json
[
  {
    "name": "卷名",
    "outline": "卷纲要",
    "summary": "卷摘要",
    "allocatedWords": 120000
  }
]
```

解析前会剥除 markdown fence。`auto` 模式返回多卷；`single` / `continue` 只取第 1 项并写入下一卷。字段校验失败时应用会重试一次（追加 JSON 纠正提示），SKILL 层仍应尽量一次输出纯 JSON。

## 7. SKILL 制作方适配建议

1. S1 类“结构/诊断”步骤不需要声明全文，它天然拿完整基础 Prompt。
2. 后续步骤默认应基于“上一步输出 + 结构地图 + 设定全文”工作，不要要求模型复述大纲全文。
3. 只有当某个中间步骤确实必须读大纲原文细节时，才在 folder `meta.json` 声明 `requiresFullPreviousOutput: true`。
4. 调试时优先看 `chain-context-slim`、`chain-handoff-delivery` 与 `chain-handoff` 事件，可以准确判断每一步实际拿到的基础 Prompt 形态与上一步交付形态。
5. 如果你的步骤只需要上一步的少量事实，在 `meta.json` 中声明 `chainHandoff.previousOutput: "structured"` 和 `requires` 数组；字段名必须与上一步 JSON 顶层键或 Markdown 标题完全一致。
6. 大纲共创和主页 API 对话不在本契约范围内：这两处的链式传递仍是原有全文/变量语义，structured/excerpt 声明不会生效。
