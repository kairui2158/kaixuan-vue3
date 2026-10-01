# Folder SKILL 官方规范 V1

适用版本：神意助手 3.28.x  
更新日期：2026-09-07  
状态：当前实现的真实协议，不描述未来计划

## 1. 总览

Folder SKILL 是一个「文件夹即技能」的分发单位。应用在执行时实时读取磁盘文件，不把脚本、schema、样本复制进技能库快照；技能库只保存 `id/name/folderPath/template` 等索引字段。因此修改磁盘上的 `template.md`、`script.js`、`schema.json` 后，下一次执行会使用新内容（加载器有 5 秒短缓存）。

## 2. 目录结构

```text
my-folder-skill/
  SKILL.md        必需，技能入口与 YAML 元信息
  template.md     必需，静态模板
  meta.json       可选，执行能力与 Agent 默认值
  script.js       可选，preProcess / postProcess / plan / afterStep
  samples.txt     可选，风格样本，每行一条
  schema.json     可选，JSON Schema 输出校验
```

约定：

1. 只认这六个文件名，不扫描其他文件，也不扫描同级子目录。
2. 文件夹名不等于技能 ID。技能 ID 以 `SKILL.md` 的 `id` 字段为准；缺失时回退为文件夹名。
3. `composite` 模式例外：`meta.children` 指向的子目录必须位于同一技能包内，当前每层最多嵌套 2 层。

## 3. SKILL.md 与 YAML

```yaml
---
schema: shenyi-skill-folder
version: 1
id: my-folder-skill
name: 我的文件夹技能
description: 技能用途的一句话说明
format: folder
---

这里写给技能使用者看的说明；不会参与 API system prompt。
```

字段说明：

| 字段 | 必需 | 说明 |
|---|---|---|
| `schema` | 是 | 固定为 `shenyi-skill-folder` |
| `version` | 是 | 当前为 `1` |
| `id` | 是 | 技能唯一标识，建议英文、数字、中划线 |
| `name` | 是 | 设置页显示名，建议中文 |
| `description` | 建议 | 技能用途说明 |
| `format` | 建议 | 固定为 `folder` |

YAML 解析器当前是简化实现，只支持单层 `key: value`。不要使用数组、对象嵌套或引号包裹的多段值。

## 4. template.md

`template.md` 是静态模板。chain 模式下，流水线会先解析 `{{变量}}`，把解析结果作为该技能的基础模板传给执行器；compose 模式下，多个技能的模板会合并成一份大模板，此时只有第一个 folder 技能的脚本与 schema 参与执行。

常用流水线变量：

```text
{{outlineContent}} {{novelTitle}} {{worldview}} {{characters}}
{{volumeIndex}} {{volumeTitle}} {{volumeSummary}}
{{chapterTitle}} {{chapterSummary}} {{chapterPlot}}
{{prevChapterSummary}} {{wordsPerChapter}} {{styleTags}} {{pacingParams}}
```

不要把变量解析逻辑写进 `script.js`。当前 `preProcess(input)` 的输入是字符串，无法读取章节上下文变量。

## 5. meta.json

### 5.1 执行能力

```json
{
  "executionMode": "single",
  "passes": [
    { "name": "结构清理" },
    { "name": "语言压缩", "input": "previous" }
  ],
  "apiCallLimit": 3,
  "sampleCount": 2,
  "smartSamples": true
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `executionMode` | string | `single`（默认）、`multi-pass`、`composite` |
| `passes` | array | 仅 `multi-pass` 有效；每项可含 `name`、`input`（`original`/`previous`），最多 5 轮 |
| `apiCallLimit` | number | 该技能在本轮任务中的调用上限 |
| `sampleCount` | number | 样本数量，1-5，默认 3 |
| `smartSamples` | boolean | 开启按输入关键词智能选样 |
| `children` | array | 仅 `composite` 有效，相对父目录的子技能路径 |

### 5.2 Agent 默认值（V1）

```json
{
  "agent": {
    "model": "optional-model-name",
    "temperature": 0.45,
    "maxTokens": 8192,
    "systemPrompt": "可选，追加在模板前"
  }
}
```

优先级从高到低：

1. 用户在应用内显式绑定的技能级智能体
2. 子技能 `meta.agent`
3. 父技能 / 步骤级智能体
4. 供应商默认参数

注意区分两类配置：应用内技能级 Agent 绑定依赖本地 Agent ID，composite/compose 不支持；技能包内的 `meta.agent` 可移植默认值在 chain 和 composite 子技能中生效，用户显式绑定仍拥有最高优先级。compose 一次 API 调用只能有一个 Agent，因此不支持子技能级 `meta.agent`。

## 6. script.js 协议

脚本在 Electron 主进程的隔离 VM 中执行，不能使用 `require`、`process`、`__dirname`，单钩子执行超时 5 秒，动态模板最长 20000 字符。

```js
module.exports = {
  preProcess(input) {
    return { input: input.trim() }
  },
  postProcess(output) {
    return { output }
  }
}
```

| 钩子 | 输入 | 合法返回字段 |
|---|---|---|
| `preProcess(input)` | 字符串 | `input`、`template`（旧协议保留）、`samples`（旧协议保留） |
| `postProcess(output)` | 字符串 | `output`、`valid`、`message`、`errors` |
| `plan(input)` | 字符串 | `order`（数组）、`mode`（仅支持 sequential） |
| `afterStep(state)` | `{ stepId, output, attempts, input }` | `action`（continue/retry/skip/stop）、`maxRetries` |

动态改写模板使用 `api.setTemplate(text)`；写日志使用 `api.log(message)`。

注意：`preProcess` 的 `template` 返回字段是旧协议兼容，推荐使用 `api.setTemplate`。compose 模式会优先保留合并模板，防止 folder 自身模板覆盖合并结果。

## 7. schema.json

`schema.json` 是 JSON Schema 的简化子集。执行器将模型输出按 JSON 解析，并使用 `outputFormat: json` 校验。若 `postProcess` 返回 `valid` 字段，则以脚本校验为准，不再使用 `schema.json`。

校验失败时最多重试 3 次；三次仍失败则返回 `degraded`，并保留最后一次输出与诊断。

## 8. samples.txt

每行一条样本。存在 `samples.txt` 时优先使用技能样本；为空或不存在时回退到应用内置样本。`smartSamples: true` 时，会按输入关键词挑选最相关样本，样本总字符预算 4000。

内容边界：

1. `samples.txt` 是风格参考，不是输出范例。只放短句、语气片段或带 `{{占位符}}` 的结构示例。
2. 禁止放置完整成品输出。完整卷纲、完整章节、完整大纲会被应用体检标记为 warning，但应用不会修改第三方技能文件夹。
3. 长结构化示例请保留字段结构，把具体内容替换为 `{{volumeName}}`、`{{volumeSummary}}` 等占位符，避免模型复制示例内容。

## 9. 输入输出协议

Folder SKILL 的输入输出都是字符串：

1. `preProcess(input)` 接收字符串，可返回 `{ input: "..." }` 改写输入。
2. API 输出传给 `postProcess(output)`，可返回 `{ output: "..." }` 改写输出。
3. 最终输出是普通文本，除非 `schema.json` 要求 JSON。
4. 文本写作场景推荐纯文本输出，结构化数据仅在确实需要机器消费时使用 JSON。

### 9.1 大纲/主页写入协议（重要）

Folder SKILL 可以在明确写入意图下直接改写编辑器。应用的安全模型是：`discuss/analyze` 只读；用户明确下达“插入/写入/修改/删除”等 edit/generate 指令时，才暴露 `editor.write` 并执行直写；执行仍受定位唯一、hash/版本校验、锁定只读、重复写入守卫、undo 与批次记录保护。同一轮内允许多次不同目标或不同内容的写入；连续 3 次完全相同写入会被拦截。

1. 读范围用 `outline.get_structure`、`outline.read_range`、`outline.search`。
2. 需要写入时必须调用 `editor.write`，不要只输出【修改预览】文本。
3. `editor.write` 返回 `status: written` 表示写入已执行；返回失败状态时禁止输出“已写入/已插入”。
4. 未收到 `editor.write` 的 `status: written` 结果前，禁止输出“已写入/已插入”。
5. 写入失败要按失败原因回复用户：目标不唯一、hash/版本冲突、编辑器锁定、连续重复写入被拦截均表示本次未写入。
6. 用户说“插入/写入/改到大纲”属于 edit 意图；讨论、分析属于 discuss/analyze，此时不要调用写入工具。
7. 判断“明确写入但模型未写入”的方法：先确认 turn 的 `actualToolSurface` 包含 `editor.write`，再看 API call 的 `toolCalls` 是否为空；为空则表示模型没有提交写入工具调用。

## 10. 执行模式能力边界

| 模式 | folder 真实执行 | script/schema/预算 | 技能级 Agent |
|---|---|---|---|
| chain | 是 | 全部生效 | 是 |
| compose 单 folder | 是 | 全部生效 | 否，使用步骤级 Agent |
| compose 多 folder | 部分 | 仅第一个 folder 的 script/schema | 否 |
| split-merge | 否，模板文本降级 | 否 | 否 |
| multi-step | 否，模板文本降级 | 否 | 否 |
| composite | 是 | 全部生效 | 应用内绑定不生效；子技能 `meta.agent` 默认值生效 |

## 11. 校验器

发布前运行：

```powershell
node scripts/validate-folder-skill.cjs path\to\my-folder-skill
```

校验器只做静态检查，不执行脚本、不调用 API。失败时输出中文错误并返回非 0 退出码。它也无法发现 `script.js` 的运行时语法错误；这类错误会在应用执行时降级并写入诊断。

## 12. 最小示例

完整示例见 `_audit/folder-skill-template/`。
