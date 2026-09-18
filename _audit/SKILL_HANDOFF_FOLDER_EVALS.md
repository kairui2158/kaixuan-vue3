# Folder SKILL 评测协议交接说明（evals.json）

> 交接对象：第三方 Folder SKILL 制作方  
> 适用范围：应用设置页「技能」中格式为 Folder 的技能包  
> 文档目的：说明 `evals.json` 怎么写、评测怎么跑、结果怎么读，让技能制作方能证明“这个技能真的有效”。

## 1. 一句话结论

在 folder 技能包根目录放一个 `evals.json`，写清楚若干测试用例和可判定断言。用户点击「运行评测」后，应用会把每个用例跑两遍：

1. **with**：启用你的 folder SKILL 完整链路（入口说明、模板、资源、脚本钩子）。
2. **baseline**：不带任何技能，用同一个输入直接问 API。

两边输出都跑同一组断言，最后给出「提升 / 持平 / 退化 / 无法判定」。这样技能改版后，不是靠感觉说变好了，而是有可比对的分数。

## 2. 文件放在哪里

放在技能包根目录，和 `SKILL.md`、`template.md` 同级：

```text
我的技能/
├── SKILL.md
├── template.md
├── meta.json
├── references/
│   └── world.md
└── evals.json
```

规则：

- 文件名固定为 `evals.json`，不能放在子目录。
- JSON 语法坏了不会导致导入失败，但会产生 `evals-invalid` warning，评测不会执行。
- `evals.json` 是元数据文件，不会作为参考资料注入模型上下文。
- 没有这个文件时，技能照常可用，只是设置页不会出现可执行的评测。

## 3. 完整示例

```json
{
  "schema": "shenyi.skill-evals/1",
  "name": "卷纲规划技能评测",
  "cases": [
    {
      "id": "volume-outline-basic",
      "name": "基础卷纲生成",
      "input": "请为一部九卷长篇小说规划第三卷的卷纲，主题是主角第一次正面失败。",
      "assertions": [
        { "type": "min_length", "min": 500 },
        { "type": "max_length", "max": 3000 },
        { "type": "contains", "value": "第三卷" },
        { "type": "not_contains", "value": "作为一个AI" },
        { "type": "resource_referenced", "value": "references/world.md" }
      ]
    },
    {
      "id": "volume-outline-json",
      "name": "结构化卷纲",
      "input": "请输出第三卷的结构化卷纲 JSON，字段包含 title、theme、plot、ending。",
      "assertions": [
        { "type": "json_valid" },
        { "type": "contains", "value": "plot" }
      ]
    }
  ]
}
```

## 4. 顶层字段

| 字段 | 必填 | 说明 |
|---|---:|---|
| `schema` | 建议 | 固定写 `shenyi.skill-evals/1`，当前版本不强制校验，但建议保留，便于后续协议升级 |
| `name` | 否 | 评测集名称，仅用于人类阅读 |
| `cases` | 是 | 用例数组，必须是非空数组 |

## 5. 用例字段

| 字段 | 必填 | 说明 |
|---|---:|---|
| `id` | 是 | 用例唯一标识，不能重复，建议用稳定英文 ID；改版时不要频繁换 ID，否则历史对比会断 |
| `name` | 否 | 用例显示名，缺省时显示 `id` |
| `input` | 是 | 发给模型的用户输入，不能为空；请写真实创作请求，不要写“测试一下” |
| `assertions` | 是 | 断言数组，必须非空 |

## 6. 六种断言

### 6.1 `min_length`：最短长度

```json
{ "type": "min_length", "min": 500 }
```

- `min` 是数字，按 JavaScript 字符串长度计数，中文一个字算 1，空格和换行也计入。
- 输出长度大于等于 `min` 通过。

### 6.2 `max_length`：最长长度

```json
{ "type": "max_length", "max": 3000 }
```

- 输出长度小于等于 `max` 通过。
- 用于防止技能把输出越写越长。

### 6.3 `contains`：必须包含

```json
{ "type": "contains", "value": "第三卷" }
```

- `value` 必填，输出中包含该文本则通过。
### 6.4 `not_contains`：禁止包含

```json
{ "type": "not_contains", "value": "作为一个AI" }
```

- 输出中不包含该文本则通过。
- 适合卡禁用词、套话、越权内容。

`contains` / `not_contains` 共同规则：

- 默认区分大小写。
- 英文场景想忽略大小写时写 `"caseSensitive": false`。
- 中文一般不需要设置这个字段。

### 6.5 `json_valid`：输出必须是有效 JSON

```json
{ "type": "json_valid" }
```

- 整段输出必须能被 `JSON.parse` 直接解析。
- 不能带 Markdown 代码围栏、前后说明文字或尾随逗号。
- 如果技能输出的是正文，不要用这个断言。

### 6.6 `resource_referenced`：技能包必须包含该资源

```json
{ "type": "resource_referenced", "value": "references/world.md" }
```

也可以写：

```json
{ "type": "resource_referenced", "resource": "references/world.md" }
```

注意这个断言的语义：它校验的是**技能包加载到的资源清单里是否有这个路径**，不是输出文本里是否提到了这个路径。用途是确认技能包的深层资源没有被导入器丢掉。

匹配规则是“资源路径包含指定文本”，所以写 `references/world.md` 是精确到文件；写 `references/` 则表示只要这个目录下有任一资源就算通过。

### 6.7 所有断言都可加 `message`

```json
{ "type": "contains", "value": "第三卷", "message": "卷纲必须明确写出卷号" }
```

`message` 会替换默认结果文案，方便在报告里直接看懂失败原因。它是可选字段。

## 7. 评测怎么跑

入口：设置页 → 技能 → 选择 folder 技能 → 测试 → 「运行评测」。

每个用例的执行顺序：

```text
读取 evals.json
  ↓
with：走 folder SKILL 完整执行链路
  （SKILL.md 正文 + template.md + 资源 + 脚本钩子）
  ↓
baseline：同一个 input，不带技能
  （system prompt 为通用文本处理提示）
  ↓
两边输出跑同一组本地断言
  ↓
输出 grading 与 benchmark
```

判定规则：

| 情况 | `skillEffect` |
|---|---|
| with 通过，baseline 不通过 | `improved`（提升） |
| with 不通过，baseline 通过 | `degraded`（退化） |
| 两边都通过或都不通过 | `same`（持平） |
| 两边执行都失败 | `indeterminate`（无法判定） |

一个用例通过的条件是：执行状态为成功，且全部断言通过。只要有一条断言失败，这个用例就是不通过。

## 8. 结果在哪里看

评测报告显示在测试弹窗里，包含：

- 技能与基线的通过数和通过率。
- 提升 / 持平 / 退化 / 无法判定的数量。
- 每个用例的 with、baseline 输出全文。
- 每条断言的通过与失败原因。

同时，评测会写入「运行记录」：

- 来源显示为「技能评测」。
- 每次真实 API 调用都有独立记录，包含请求、返回和耗时。
- 最终评测报告单独记录为 `eval-report` 事件。

用户可以把运行记录按次导出为 JSON 发给你，你就能完整复现评测现场。

## 9. 费用与触发规则

- 评测不会自动执行，只有用户明确点击「运行评测」才会调用 API。
- 每个用例至少产生 2 次 API 调用：一次 with，一次 baseline。
- with 链路内部有调用预算保护，执行异常不会无限重试。
- 请控制用例数量。建议单个技能 3 到 10 个用例，先覆盖核心行为，再逐步补充边界用例。

## 10. 写用例的建议

1. **断言要稳定，不要赌模型发挥**。`min_length` 给出宽松范围，`contains` 选必然出现的关键词，不要断言完整句子逐字复现。
2. **一个用例只测一个能力面**。基础生成、结构化输出、禁用词规避分开写，失败时才能定位是哪一类能力退化。
3. **`json_valid` 的模板必须强约束**。技能模板里要明确“只输出 JSON，不要代码围栏，不要解释文字”，否则很容易因格式噪声失败。
4. **`resource_referenced` 用来守资源完整性**。技能依赖世界观、风格、禁忌设定等资源文件时，建议至少放一条，防止包分发后资源被漏扫。
5. **ID 稳定，输入也要稳定**。改版时可以加用例，但尽量不要修改旧用例的 `id` 和 `input`，否则新旧版本分数不可比。
6. **不要把评测当生成入口**。评测输入不会注入章节变量、项目大纲等项目上下文；它测的是技能包自身的处理能力。需要项目上下文的场景请走生成流水线或工作台运行记录。

## 11. 常见失败原因

| 现象 | 常见原因 |
|---|---|
| 报告显示 `no-evals` | 技能包根目录没有 `evals.json`，或导入时 JSON 坏掉被忽略 |
| 报告显示 `invalid-evals` | `cases` 为空、用例缺 `id` / `input` / `assertions`、id 重复、断言类型不支持 |
| `json_valid` 失败 | 输出带 Markdown 围栏、解释文字、尾随逗号，或不是完整 JSON |
| `resource_referenced` 失败 | 路径写错、资源文件没放进技能包、导入时被资源扫描边界拦截 |
| `contains` 意外失败 | 输出里的词形与断言不一致，或英文大小写不同 |
| 大量 `indeterminate` | API 连接失败、供应商配置异常、技能执行抛错；先看运行记录中的 API 错误 |

## 12. 快速模板

复制下面这份再改，基本不会踩结构错误：

```json
{
  "schema": "shenyi.skill-evals/1",
  "name": "技能评测集",
  "cases": [
    {
      "id": "case-basic",
      "name": "基础能力",
      "input": "把你的真实测试请求写在这里。",
      "assertions": [
        { "type": "min_length", "min": 100 },
        { "type": "max_length", "max": 3000 },
        { "type": "contains", "value": "关键词" },
        { "type": "not_contains", "value": "禁止词" }
      ]
    }
  ]
}
```
