# Chain Handoff 真执行 V2 方案

## 目标

把生成流水线 chain 模式的中间产物传递从“只记录 handoff，实际仍传全文”升级为“按 SKILL 消费契约执行”，并以质量优先、风险最低为硬约束：

- 默认仍传全文，保证质量和第三方 SKILL 兼容；
- folder `meta.json` 显式声明 `structured` 后才启用结构化提取；
- `excerpt` 仅作为显式声明的低风险压缩选项，不作为默认策略；
- 全文始终进入 runTrace payload 存档，SKILL 调试方不丢证据；
- 结构化提取失败、字段缺失、输出校验失败时一律回退或升级全文，禁止盲截断。

## 现状锚点

- 当前实际注入仍是全文：`src/components/pipeline/PipelinePanel.vue:2850` `current = stepOutput`，下一步直接消费 `current`。
- handoff artifact 已有 excerpt/hash/delivery：`src/services/chainHandoff.ts:60`。
- 断点已保存全文：`src/services/chainBreakpoint.ts` 的 `lastOutput`。
- runTrace 已支持大文本 payload 外置与 sha256：`electron/ipc/runTrace.js:264`、`electron/ipc/runTrace.js:342`。
- 生成流水线之外还有同款入口：`src/services/workspaceSkillEngine.ts:1172` 的对话 chain；本方案第一期只改生成流水线 chain，对话链路明确排除。
- `RunTraceProcessingReport.processor` 是受限字面量类型；新增 `chain-handoff` 必须同步类型定义、Electron 收集器与面板/Diff 展示。
- JSON 提取必须复用 `src/services/jsonExtraction.ts` 的平衡括号提取，禁止用正则截取 JSON。

## 消费契约

folder `meta.json`：

```json
{
  "chainHandoff": {
    "previousOutput": "excerpt",
    "requiresFullPreviousOutput": false,
    "requires": ["facts", "constraints"]
  }
}
```

解析优先级：

1. 默认 → 全文；不做任何截断，保证未声明契约的 SKILL 和第三方 SKILL 不受影响；
2. `requiresFullPreviousOutput: true` 或 `previousOutput: "full"` → 全文；
3. `previousOutput: "structured"` 且 `requires` 非空 → 结构化提取；
4. `previousOutput: "excerpt"` → canonical excerpt（2400 字），仅显式声明时使用。

质量守门规则：

- structured 提取必须命中全部 `requires` 字段；任一字段缺失即回退全文；
- JSON 截断、Markdown 标题不匹配、提取结果为空一律回退全文；
- 回退时记录 `chain-handoff-contract-miss`，SKILL 调试方可见；
- 禁止用语义猜测补字段，禁止在未声明时自动截断。

text SKILL 特例：模板显式引用 `{{previousOutput}} / {{prevResponse}} / {{previousSkillOutput}}` 时默认全文，因为模板已经声明自己消费完整变量；可用 meta 强制改为 excerpt。

## 结构化提取规则

只做确定性提取，不做语义猜测：

- 上一步输出是 JSON object：复用 `extractJsonCandidates/extractJsonObject` 解析后按 `requires` 提取同名顶层键；
- 上一步输出是 Markdown：按 `requires` 提取同名标题节；
- 命中字段不完整、提取值全为空、JSON 无法解析、Markdown 标题不匹配时，回退全文，并记录 `chain-handoff-contract-miss` warn 事件；
- `requires` 只接受字符串数组，长度 1-16，每项去空格、非空、单字段 ≤64 字符；非法声明按未声明处理；
- 保留原始字段值，不改写、不改名、不做语义补全；
- 一次提取必须全部命中才生效，部分命中不生效。

## 失败升级

下游 SKILL 输出校验失败时：

1. 保存失败断点；
2. 若本次交付不是全文，立即用全文重试一次；
3. trace 记录 `chain-handoff-escalation`；
4. 重试成功则继续链路，状态记 degraded；重试失败才终止。

这样第三方 SKILL 未声明全文也不会被 excerpt 卡死。

## 全文存档

每步 handoff 全文通过 `attachProcessingReport` 写入 runTrace，processor 为 `chain-handoff`，`output` 为全文。electron 现有 payload 机制会自动外置为 payloads 文件并记录 sha256，不新增文件写入协议。

类型与展示同步：

- `RunTraceProcessingReport.processor` 增加 `'chain-handoff'` 字面量；
- Electron `collectPayloads` 已通用处理 processing output，无需按 processor 特判；
- RunTracePanel 已按 `report.processor / report.stage` 泛化展示，不新增 UI 分支；
- RunTraceDiff 以 processor 对账，diff 面板天然可见，需在 E2E 中断言可见。

## 任务拆分

阶段 0（前置）：先执行 [PROPOSAL_2026-09-16_MAX_TOKENS_AND_REASONING_RETRY_V2.md](PROPOSAL_2026-09-16_MAX_TOKENS_AND_REASONING_RETRY_V2.md)。

- P0 移除 `resolveMaxTokens()` 的 16384 硬顶；
- P1 供应商 400 上限降级；
- P1 reasoning `finishReason=length` 直出重试改为 thinking 控制 / maxTokens 提升；
- P1 失败终态语义修正。

原因：handoff V2 的 E2E 质量对比依赖 S2/S3/S4 真实可完成。若 16384 硬顶未移除，reasoning 模型会在思考阶段耗尽输出预算，质量基线本身就是坏样本，structured 对比结论不可信。

1. `chainHandoff.ts`：新增 `resolveChainPreviousOutput()`，实现 full/excerpt/structured 决策与 contract-miss 诊断。
2. `chainExecution.ts`：`buildChainSkillPrompt()` 接收已解析的 previous payload，保留现有去重和回声检测。
3. `PipelinePanel.vue`：chain 循环接入 resolved payload；校验失败升级重试；trace 增加 delivery/escalation 字段。
4. `runTrace.ts`：扩展 processing report 类型，允许 `chain-handoff` processor 与全文 output。
5. 断点兼容：`lastOutput` 继续保存全文；恢复步按下游 meta 重新决策，不自动全文。
6. 文档：更新卷纲层状态文档与通用 chain handoff 交接文档。

### 明确不做（第一期）

- 不改 `workspaceSkillEngine.ts` 对话 chain：对话场景有会话历史与断点语义差异，与生成链路混改会扩大回归面；
- 不改 compose/parallel：它们没有 previousOutput 交付问题；
- 不改其他层级 prompt：Step 1/3/4 没有受控 `[大纲]` 块，上一轮已验证不受影响；
- 不新增运行时全文读回工具：全文已进 payload 存档，deep 导出可拿到，避免扩大工具面。

二期候选（本期不做、不承诺）：workspace 对话链路接入同一 `resolveChainPreviousOutput()`。

## 验证矩阵

- 前置验证：MAX_TOKENS_AND_REASONING_RETRY_V2 的单测、集成测试、trace 对账、非 reasoning 回归全部通过。
- 单测：full/excerpt/structured/contract-miss/text 模板变量/断点恢复决策。
- 单测：`requires` 非法值、空值、超长、非法类型按未声明处理；JSON 顶层是数组/字符串/数字时不启用 structured；Markdown 部分命中回退全文。
- 单测：`chain-handoff` processing report 类型与 payload 外置字段。
- E2E：三技能 chain，S1 长输出，S2 默认全文，S3 声明 structured 且命中字段；再测 S3 structured 字段缺失回退全文；excerpt 显式声明；校验失败自动升级；text 变量技能拿全文；断点恢复后决策正确。
- 质量对比：同一项目、同一 SKILL、同一模型，分别跑默认全文与声明 structured 的链路，比较最终卷纲字段完整性、JSON 结构、关键内容命中与输出长度；structured 不优于或等于全文基线则不切换默认。
- E2E：RunTracePanel/RunTraceDiff 中 `chain-handoff` 报告可见，deep 导出包含每步全文 payload、sha256、delivery、escalation。
- 回头看：`rg` 盘点 `buildChainSkillPrompt`、`makeChainHandoffArtifact`、`previousOutput` 全部调用点，确认只有 PipelinePanel 被改动；`resolveMaxTokens` 相关调用不受本方案误伤。
- 回归：34 条现有 chain/volume/breakpoint 测试、vue-tsc、build:vue。

## 风险与对策

| 风险 | 对策 |
| --- | --- |
| 第三方 SKILL 依赖全文但未声明 | 默认全文，不做任何截断 |
| structured 提取不到字段 | 回退全文 + contract-miss 事件 |
| excerpt 截断破坏 JSON 中间产物 | excerpt 不作为默认策略，仅显式声明时使用 |
| 断点恢复语义变化 | lastOutput 仍全文，恢复步按 meta 重新决策 |
| structured 降低输出质量 | E2E 质量对比不达标则保持全文默认 |
| handoff 全文增大导出体积 | payload 机制已外置并去重，run-trace.json 不内联全文 |
| processor 类型漏改造成类型或 UI 断档 | 类型、收集器、面板、Diff 四点同步列入验证 |
| 生成链路与对话链路混改 | 第一期只改 PipelinePanel，workspace 明确二期 |

## 方案成熟度

成熟。分四层评估：

- 执行器层：成熟。决策函数纯函数化，JSON 用已验证的平衡括号提取，Markdown 规则确定性，全部可单测。
- 应用方案层：成熟。默认全文零回归；structured 显式声明且全命中才生效；任何异常回退全文；失败升级兜底。
- 实现接线层：成熟。第一期只接 PipelinePanel chain 主链；类型、trace、断点、payload 外置均有代码锚点；workspace/compose/parallel 明确排除。
- 验证标准层：成熟。决策矩阵单测、非法契约单测、三技能 E2E、质量对比门、trace 可见性断言、全仓调用点回头看、既有回归齐备。

无未决技术疑点。唯一待用户放行的是执行顺序：先 MAX_TOKENS_AND_REASONING_RETRY_V2，再本方案。

## 已定默认策略

1. folder SKILL S2+ 默认交付：全文。
2. structured：显式声明且全部字段命中才启用，任一失败回退全文。
3. excerpt：仅显式声明时使用，不作为默认。
4. 校验失败自动升级全文重试：开启，每次最多一次。
