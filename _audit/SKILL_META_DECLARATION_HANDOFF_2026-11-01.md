# 给 SKILL 层：folder meta.json 磁盘声明补齐说明（2026-11-01）

## 1. 背景与责任裁决

你在大纲共创、卷纲、章节或正文生成时看到 API 进度条出现“文件夹磁盘声明缺失”，含义是：对应 folder SKILL 的磁盘 `meta.json` 没有声明 `intents` 或 `contextPolicy`，应用按设计清空缺失字段并退回默认上下文策略。它不是 API 报错，也不会阻断生成。

这轮的责任裁决：直接缺口在 SKILL 磁盘包元数据，但根因是应用侧切换磁盘权威源时没有把新声明规范写进你们收到的适配手册。2026-11-01 前不算 SKILL 违规；本说明发布后，声明要求已经明确，请按下文补齐。

权威规范全文：[_audit/FOLDER_SKILL_META_DECLARATION_SPEC_2026-11-01.md](_audit/FOLDER_SKILL_META_DECLARATION_SPEC_2026-11-01.md)。本文件是执行清单，规范冲突时以规范为准。

## 2. 你需要做的事

给每一层 folder SKILL 的每个步骤 `meta.json` 补齐两个字段：

```json
{
  "intents": ["generate"],
  "contextPolicy": {
    "chatHistory": "none",
    "includeOutline": true
  }
}
```

按层调整建议值：

| 层 | intents | chatHistory | includeOutline |
|---|---|---|---|
| L1 大纲层 | `["outline", "generate"]` | `recent` | `true` |
| L2 设定层 | `["analyze", "generate"]` | `recent` | `true` |
| L3 卷纲层 | `["generate"]` | `none` | `true` |
| L4 章节层 | `["generate"]` | `none` | `true` |
| 正文层 | `["generate"]` | `none` | `true` |

## 3. 不要做的事

1. 不要把字段写进 `template.md` 或 `SKILL.md` 就当已声明；执行期只读 `meta.json`。
2. 不要使用 `latest` 或 `all` 作为 `chatHistory`；合法值只有 `none / recent / summary / full`。
3. 不要声明空对象 `{}` 后以为有策略；空对象没有子字段，仍然等于默认值。
4. 不要因为补新字段而删除既有 `sampleCount`、`smartSamples`、`deai`、`chainHandoff` 合同。
5. 如果你的模板已经通过 `{{outlineContent}}` 携带大纲全文，评估是否把 `includeOutline` 设为 `false`，避免同一大纲全文重复注入。`includeOutline: false` 只关闭应用额外注入的大纲上下文包，不影响模板变量本身。

## 4. 各层当前缺口

2026-11-01 全量扫描结果：

| 层 | 步骤 | intents | contextPolicy |
|---|---|---|---|
| L1 大纲层 | `L1-B-大纲共创主编` | 已声明 | 缺失 |
| L2 设定层 | `l2-s1`、`l2-s2` | 缺失 | 缺失 |
| L3 卷纲层 | `l3-s1` 至 `l3-s4` | 缺失 | 缺失 |
| L4 章节层 | `l4-s1` 至 `l4-s4` | 已声明 | 缺失 |
| 正文层 | `kaixuan-s1` 至 `kaixuan-s3` | 缺失 | 缺失 |

结论：`contextPolicy` 全层缺失；`intents` 只有大纲层和章节层已声明。请按上表逐层补齐。

## 5. 验收标准

1. `meta.json` 是合法 JSON，且每个步骤都显式包含 `intents` 与 `contextPolicy`。
2. 应用“设置 → 技能”体检不再出现：
   - `meta.intents`
   - `meta.contextPolicy`
3. 对应层重新生成时，API 进度条不再显示“文件夹磁盘声明缺失”。
4. `chatHistory` 不出现 `latest` / `all`；`includeOutline` 只使用布尔值。

## 6. 与既有合同的关系

本次只新增元数据声明，不改变你已经收到的任何执行合同：

- 正文层受保护契约、候选账本、word-gap：见 [_audit/FOLDER_SKILL_BODY_PROTECTED_CONTRACT_GUIDE_2026-10-30.md](_audit/FOLDER_SKILL_BODY_PROTECTED_CONTRACT_GUIDE_2026-10-30.md)
- 叙事 verdict 与卷契约终局裁决：见 [_audit/SKILL_NARRATIVE_VERDICT_HANDOFF_2026-10-31.md](_audit/SKILL_NARRATIVE_VERDICT_HANDOFF_2026-10-31.md)

如果补齐 `contextPolicy` 后你发现某层模板出现上下文重复或缺失，先记录模板变量与声明值的组合，再向应用层提出对账；不要回退到“不声明”状态来规避问题。
