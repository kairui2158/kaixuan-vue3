# Chain 中间产物与 Handoff 交付协议

日期：2026-09-16
适用范围：生成流水线 chain 模式中所有 folder SKILL 与 text SKILL

## 当前状态

生成流水线 chain 模式已经按“消费契约”执行中间产物传递。默认仍是全文，只有 SKILL 显式声明时才改变交付形态：

```json
{
  "chainHandoff": {
    "previousOutput": "structured",
    "requires": ["facts", "constraints"]
  }
}
```

| 声明 | 交付 |
| --- | --- |
| 未声明 | 全文 |
| `previousOutput: "full"` / `requiresFullPreviousOutput: true` | 全文 |
| `previousOutput: "structured"` + `requires` | 只提取声明的字段 |
| `previousOutput: "excerpt"` | 前 2400 字 |

text SKILL 如果模板引用了 `{{previousOutput}} / {{prevResponse}} / {{previousSkillOutput}}`，三个变量名等价，实际值由本步交付契约决定（默认全文，声明 structured 时是结构化摘要）；folder SKILL 的 template 不走这些变量，上一步输出会以独立块提供。

## structured 提取规则

1. 上一步输出是 JSON object 时，按 `requires` 提取同名顶层键。
2. 上一步输出是 Markdown 时，按 `requires` 提取同名标题节。
3. 必须全部命中且非空才生效；任一字段缺失、为空、JSON 无法解析、标题不匹配，都回退全文。
4. 应用不改写字段、不改名、不做语义补全，不做部分命中。
5. `requires` 只接受字符串数组，长度 1-16，单字段名不超过 64 字符；非法声明按未声明处理，即全文。

## 输出铁律

1. 非末步输出结构化事实，不输出叙述性重放。
2. 不复述任务指令、上游资料、记忆块和上一步标题。
3. 不复写 `[相关记忆]`、`--- 上一步 SKILL 完整输出 ---` 标记；应用会在注入前剥除这些回显块，并记录 `chain-dedupe` 事件。
4. 末步才输出面向用户的完整定稿产物。
5. 如果你的输出要给下游 structured 消费，保持 JSON 顶层键或 Markdown 标题与下游 `requires` 完全一致。

## 失败升级

非全文交付时，本步输出会经过 SKILL 有效性校验。校验失败后应用会：

1. 记录 `chain-handoff-escalation`；
2. 用上一步全文重试一次；
3. 重试成功则状态降级为 degraded 并继续；
4. 重试失败才终止链路。

## Run Trace 证据

| 证据 | 含义 |
| --- | --- |
| `chain-handoff-delivery` | 本步实际收到的交付形态、全文长度、交付长度、声明模式 |
| `chain-handoff-contract-miss` | structured 契约未命中，已回退全文 |
| `chain-handoff-escalation` | 非全文交付失败，已升级全文重试 |
| `chain-handoff` processing report | 每步 handoff 全文存档；深度导出为 payload 文件并带 sha256 |
| `chain-dedupe` | 中间产物回显块被剥除 |
| `chain-output-echo` | 当前输出与前序输入重叠过高警告 |

SKILL 调试方可以同时拿到“本步实际消费的交付形态”和“上游全文存档”，既能定位字段声明错误，也不会丢失完整现场。

生成流水线的 delivery / contract-miss / escalation 事件会同步进入诊断日志面板（分类 `pipeline/chain-handoff`）。大纲共创与主页 API 对话的对话链每步 handoff artifact 也会以 `chain-handoff` 事件进入运行记录，`delivery` 恒为 `full_text`。

## 边界说明

当前版本只接入生成流水线 chain 主链。大纲共创和主页 API 对话的 `workspaceSkillEngine` 链路仍按原有全文/变量传递方式执行，`chain_handoff` 事件只用于记录，不接 `resolveChainPreviousOutput()` 交付决策器。若 SKILL 在这两处运行，请仍按全文消费设计，不要依赖 structured/excerpt 契约。
