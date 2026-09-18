# PROPOSAL 2026-09-15: 全应用调用路径审计 V2 研磨方案

> 状态：已执行，3.46.0 封装闭环。  
> 上游方案：`_audit/PROPOSAL_2026-09-15_FULL_APP_CALL_PATH_AUDIT.md`  
> 研磨门禁：经验文件 v5.3 / M12 正推、反推、目标倒推、爆炸半径、优先级证据化。  
> 结论：V1 的方向对，但只列出了一条 P0 链路，漏掉了生成流水线的同名分叉和普通文本技能的 context-block 滚雪球。

## 1. 研磨后确认的真实缺陷

### P0-1：folder chain 的 previousOutput 全文注入有两条独立路径

**V1 修正**：这不是单个 `workspaceSkillEngine` 缺陷，而是同款分叉。

1. 引擎路径：`src/services/workspaceSkillEngine.ts:559-566`。folder 模式把 `previousOutput` 完整拼进 `folderInput`，随后交给 `routeSkill()`。
2. 流水线路径：`src/components/pipeline/PipelinePanel.vue:2701-2733` 与 `2759-2765`。folder SKILL 的 delivery 被设成 `inline_block`，`buildChainSkillPrompt()` 会把上一步全文拼进 `nextPrompt`，再由 `callValidatedSkill()` 传给 folder 执行器。

**反推结论**：只修引擎，流水线继续滚雪球；只修流水线，大纲工作台继续滚雪球。必须抽共享 Handoff 层，不能只修一个入口。

### P0-2：text chain 也有 context-block 全文注入

V1 只把 folder chain 列为 P0，漏了 text chain。

1. `workspaceSkillEngine.ts:1116-1185` 在非首步把 `current` 作为 `previousSkillOutput` 传入。
2. `conversationContextService.ts:381-383` 会组装成 `[上一步 SKILL 完整输出]` 消息。
3. `buildChainSkillPrompt()` 虽然避免了 user prompt 二次拼接，但没有阻止上一步全文进入 ContextBundle。

因此“滚雪球”不是 folder 专属，而是 chain 交接协议缺失。

### P0-3：Outline 三处 finally 的问题要降级为一致性风险

`OutlineWorkspace.vue:2602/3160/3240` 的 finally 固定 success 看似危险，但 `runTrace.ts:993` 的 `finishRun()` 已有 `status !== 'running'` 保护，所以不会真的把 failed/canceled 改成 success。

这是冗余和语义误导，不是本次用户感知事故的直接根因。仍然要修，原因有三：

1. 未来任何人新增旁路绕过 store 保护，就会真覆盖终态。
2. 三处同款分叉违反 M12 共享收口要求。
3. `sealOutlineTrace()` 现在在 chat session 且仍 running 时也可能固定 success，语义不够严谨。

### P1-1：供应商基础调用缺少 RunTrace

已确认无 RunTrace 的 AI/基础设施调用：

1. `src/stores/provider.ts:155-171` 的 `fetchModels()` 和 `testConnection()`。
2. `src/services/aiService.ts:1997-2009` 的 service 层同名方法。
3. `aiService.testConnection()` 在模型接口 404/405 时还会发起一个最小 chat 外呼，这个兜底调用也不在 Trace 里。
4. `src/composables/useAiTools.ts:39-86` 的 `callAi()` 及其下游写作规则、时间线、批量审阅、章节修订、翻译、风格转换等 AI 工具。

这些失败会让用户看到“工具失败/连接失败”，但看不到请求现场。

### P1-2：background / subtask 调用仍有断链风险

1. `useSkillTest.ts` 已经把 folder eval 的 baseline 映射进 Trace，这是已有正确实现，保留。
2. 但 `folderSkillEval.ts:378-387` 本身允许任意调用方注入无 trace 的 `aiService`；服务层没有强制 trace 上下文。
3. `memoryExtractor.ts:37-87` 只有传入 trace 才记录，无 trace 时仍可外呼。
4. `useAiTools.callAi()` 没有 run 级生命周期。

### P2-1：`useAiCallTrace.finish()` 的状态冲突保护

`useAiCallTrace.ts:120-126` 会关闭 running API call，`runTrace.finishRun()` 也会兜底，但 wrapper 自身没有冲突事件。成功态、failed/canceled 态、degraded 态之间的关系分散在调用方和 store 两层。

这不是直接事故根因，但属于 V1 判定正确的加固项。

### P2-2：运行结果分类分散

成功/失败判断散落在：

1. `traceStatusFromAiResult()`。
2. `traceStatusFromRun()`。
3. Outline 的 catch/finally。
4. `generationValidity`。
5. 各 composable 自己判断 canceled / failed。

应抽 `classifyRunOutcome()`，但要放在第三阶段，避免一次重构扩大爆炸半径。

## 2. 正推验证

| 改动 | 生效机制 | 新风险 | 防线 |
|---|---|---|---|
| 建 `chainHandoff.ts` | 把 previousOutput 变成定稿产物 + 精选片段 + hash + 注入对账 | 三方 folder skill 可能依赖“必须给我全文” | meta 声明 `requiresFullPreviousOutput: true` 时允许全文，但必须记录事件 |
| 引擎与流水线都接 Handoff | 两条分叉共用一套输入构造 | 改错会同时砸两条主链 | 接口兼容旧 `previousOutput`，默认行为先不硬断，先落诊断，审核后开 strict |
| 断点保存 handoff | 恢复时不再重拼全文 | 旧断点没有 handoff 字段 | 兼容旧 `lastOutput`，首次恢复时生成新 artifact |
| 所有 AI 外呼有 Trace | 失败/超时/降级可见 | infra 记录混入业务 run | 新增 `invocationKind: primary/subtask/background/infra` |
| 共享 Outline 生命周期收尾 | 三处 finally 不再误判 | 大工作台函数多，容易误碰 | 只抽 `outlineTraceLifecycle`，不动 UI 状态机 |
| Trace wrapper 状态机 | 防止 success 语义覆盖冲突 | 现有测试期望重复 finish 静默 | 保留静默不覆盖，只补 conflict 事件 |

## 3. 反推验证

**问：只给 folder 输入做截断能解决吗？**  
不能。folder 有两条路径，text chain 还有 context block。截断也不等于 Handoff，会把有效信息切掉，可能导致后步缺事实。

**问：能否让 SKILL 自己压缩 previousOutput？**  
不可靠。SKILL 无法控制上下文注入长度，而且第三方 SKILL 不一定处理回显。应用层协议必须兜底。

**问：模板声明 `{{prevResponse}}` 是否等于允许全文？**  
不等于。该占位符表示“模板需要上一步输出”，但注入内容应由 Handoff 决定：默认定稿产物 + 必要片段；只有显式 `requiresFullPreviousOutput` 才给全文。

**问：全文注入真的需要禁止吗？**  
不能一刀切。正文打磨等场景可能需要上一稿全文。所以协议是“显式声明全文权限 + 重复 hash 告警”，不是无脑压缩。

**问：当前 3.45.0 的去重为什么不够？**  
`dedupeChainIntermediateOutput()` 只去掉明确回显的记忆块和上一输出标题；`detectChainOutputEcho()` 只是警告。它们不能控制下一步请求里的输入。

**问：P0-A 的 folder 滚雪球现在是否已经在别的任务修了？**  
没有。3.45.0 修的是 ContextPack 去重和续生成快照瘦身。folder/text chain 的 previousOutput 全文注入仍在。

**问：会不会破坏 13 个保护文件？**  
不会。只改应用层协议、Trace 生命周期和两条 chain 入口，不动 folder 包规范、postProcess 硬规则和直写编辑器核心。

## 4. 最优方案：Chain Handoff Protocol V1

### 4.1 数据结构

新增 `src/services/chainHandoff.ts`：

```ts
type ChainHandoffDelivery =
  | 'full_text'
  | 'canonical_excerpt'
  | 'structured_summary'

type ChainHandoffArtifact = {
  artifactId: string
  sourceStep: number
  sourceSkillId: string
  outputHash: string
  fullTextLength: number
  delivery: ChainHandoffDelivery
  canonicalExcerpt?: string
  declaredFields?: Record<string, string>
  fullTextPath?: string
  structuredSummary?: {
    purpose: string
    facts: string[]
    constraints: string[]
    artifacts: string[]
    openQuestions: string[]
  }
  requiresFullPreviousOutput: boolean
  repeatedHashCount: number
}
```

生成规则：

1. 中间过程步骤默认 `structured_summary + canonical_excerpt`。
2. 最终定稿步骤可按调用方声明 `full_text`。
3. folder/text SKILL 可通过 `meta.chainHandoff.requiresFullPreviousOutput = true` 申请全文。
4. 同一运行里同一 `outputHash` 重复注入必须进 `chain-handoff-repeat` 事件。
5. 每步全文按 artifactId 存档到运行目录，handoff 记录 `fullTextPath`。
6. 下游 SKILL 通过 `meta.chainHandoff.requires` 声明消费字段；上游输出按字段名确定性传递到 `declaredFields`，不做语义猜测。
7. 下游步骤同时获得只读工具（复用 read_range 模式）按范围读取存档全文，摘要只是索引，不是唯一信息源。

**片段准确性原则**：应用层不做语义挑选。准确性来源依次为：SKILL 消费契约声明（字段名匹配）、结构化输出的确定性提取（JSON key / 已声明分节标记）、全文存档 + 按需读取兜底。warn-only 阶段通过对比"注入内容 vs 下游输出引用"验证是否有信息缺口；发现缺口不开 strict，先补协议。

### 4.2 两条链路统一接入

1. `workspaceSkillEngine.runWorkspaceSkills()`：每步完成后生成 artifact，下一步不再直接把全文塞给 folderInput 或 context block。
2. `PipelinePanel` chain 分支：调用同一 `makeChainHandoffArtifact()`，再构造 `nextPrompt` / `inputContext`。
3. `chainExecution.ts` 增加 `buildPreviousOutputPayload(handoff)`，替代散落的字符串拼接。
4. `chainBreakpoint.ts` 新增可选 `lastHandoff`；旧 `lastOutput` 保留兼容。
5. RunTrace 增加 `chain-handoff` 事件：source length、delivery、canonical length、fullTextLength、repeat count。

### 4.3 上线策略

第一阶段先 `warn-only`：

- 继续允许旧全文注入。
- 生成 handoff 对账事件。
- 输出重复 hash / 注入超长警告。

第二阶段开启 strict：

- 未声明全文权限的中间步骤改为 handoff 注入。
- 断点恢复走 handoff。
- 旧断点自动兼容。
- 未声明 `chainHandoff` 的旧 SKILL / 第三方 SKILL 默认 Handoff + 全文存档可读（用户已确认采纳建议）。
- strict 切换标准：真实 chain 运行样本充足、无 `chain-handoff-missing` 信息缺口事件、下游输出对比无退化，三项全部满足后汇报数据由用户最终拍板切换（用户已确认）。
- 全文存档随运行记录生命周期清理，不单独设保留期（用户已确认）。

这样可以先拿到真实对账数据，再切换行为，避免"修一处坏另一处"。

## 5. Trace 归一方案

### 5.1 基础设施调用

1. 给 provider `fetchModels` / `testConnection` 加 source `infra` 的轻量 RunTrace。
2. 请求记录脱敏 URL 模式，不记录完整 URL；状态、耗时、错误摘要必录。
3. 最小 chat 连接测试同样记录。
4. UI 状态不依赖 Trace 成败，避免因为日志层异常影响设置页。

### 5.2 隐藏 AI 工具

1. `useAiTools.callAi()` 改成可接收 parent trace。
2. 无 parent 时新建 `background` run。
3. `generateWritingRules`、`extractTimeline`、`batchReviewChapters`、`reviseChapter`、`translateText`、`convertStyle`、`regenerateContent`、`modifyContent` 全部经由它记录。
4. 批量审阅每章一条 API call，run 里能对账总数。

### 5.3 background 子调用契约

1. RunTrace API call 增加 `invocationKind` 和 `parentRunId` / `parentApiCallId`。
2. `memoryExtractor`、`folderSkillEval` 的服务层允许无 trace，但新增无主调用事件到 DiagLogger；组合层必须传入 trace。
3. 不让日志层异常阻断业务调用。

## 6. Outline 生命周期统一

新增 `outlineTraceLifecycle`：

```ts
sealOutlineRun({
  status,
  error,
  resultPreview,
  reason: 'normal' | 'catch' | 'finally'
})
```

规则：

1. catch 负责 failed/canceled 终态。
2. finally 只调用 `sealOutlineRun('success', reason:'finally')`。
3. run 已 failed/canceled 时，seal 不改判，只补 `status-conflict-ignored` 事件。
4. chat session 不因 seal 强制关闭；真正的会话关闭保留在明确结束点。
5. 修改 `OutlineWorkspace.vue:2602/3160/3240` 三处 finally 为共享调用。

## 7. 执行顺序

1. 新增 chainHandoff 类型、hash、构造器、单测；先只读不改输入。
2. 接入 workspaceSkillEngine 和 PipelinePanel 两条链路的 warn-only Trace。
3. 审查真实 chain trace 中的重复 hash 和长度，然后开 strict。
4. 改 chainBreakpoint 保存 lastHandoff，兼容旧断点。
5. 给 provider infra 和 useAiTools 补 Trace。
6. 抽 OutlineTraceLifecycle，替换三处 finally。
7. `useAiCallTrace` 补 conflict 事件。
8. `classifyRunOutcome()` 最后做，先替换 Outline，不一次铺全。
9. 全量回归 + 真实 Electron 链路验证。

## 8. 验收矩阵

| 编号 | 场景 | 证据 |
|---|---|---|
| C1 | folder chain 第 2 步未申请全文 | 请求消息不含重复全文；Trace 有 handoff 事件 |
| C2 | folder chain 申请全文 | 请求有全文一次，Trace 有 `requiresFullPreviousOutput=true` |
| C3 | text chain 第 2 步 | context block 不再放全文；handoff 摘要/片段可追溯 |
| C4 | 流水线 folder chain | 与引擎路径行为一致，Trace delivery 一致 |
| C5 | 断点恢复 | 旧 lastOutput 可用；新断点保存 handoff |
| C6 | 供应商测试失败 | infra RunTrace 存在 |
| C7 | 写作工具失败 | background RunTrace 存在 |
| C8 | Outline finally after failed | 终态仍 failed，只有 conflict 事件 |
| C9 | degraded run | 不被折叠成 failed 或 success |
| C10 | 全量回归 | type-check、test:services、build 通过 |

## 9. 爆炸半径

| 会动 | 不动 |
|---|---|
| `workspaceSkillEngine.ts`、`PipelinePanel.vue` | folder SKILL 包结构 |
| `chainExecution.ts`、`chainBreakpoint.ts` | postProcess 硬规则 |
| 新增 `chainHandoff.ts` | 编辑器直写核心 |
| `runTrace.ts`、`useAiCallTrace.ts` | 意图路由 V3 行为 |
| `OutlineWorkspace.vue` Trace 函数 | 四层 UI 流程 |
| `provider.ts`、`aiService.ts` infra Trace | API Key 与协议 |
| `useAiTools.ts` | 设置页供应商 UI |

## 10. 需要用户确认

> 2026-09-15 用户已全部确认采纳建议，以下是定稿结论：

1. **Handoff 协议形态**：中间过程步骤默认只给 Handoff 结构（目的/事实/硬约束/产出物/待决问题/必要片段），全文只有两种情况给——最终定稿类步骤，或 SKILL 在 meta.json 显式声明 `requiresFullPreviousOutput: true`。必要性来源为三层：SKILL 消费契约声明 → 结构化输出确定性提取 → 全文存档 + 只读工具兜底。应用层不做语义猜测。✔ 已确认
2. **上线节奏**：先 warn-only 拿真实对账数据（注入 vs 引用对比、信息缺口检测），达标后汇报数据由用户拍板切 strict。✔ 已确认
3. **隐藏调用覆盖**：供应商测试、AI 工具、记忆抽取、folder 评测等全部进 RunTrace，加 invocationKind 标记。✔ 已确认
4. **Outline finally 统一收口**：抽共享 sealOutlineRun，catch 定终态，finally 只补封口不改判。✔ 已确认
5. **classifyRunOutcome() 时机**：放最后阶段，先接 Outline 验证再铺全。✔ 已确认
6. **未声明 chainHandoff 的默认行为**：默认 Handoff + 全文存档可读，兼容开关留给下一版。✔ 已确认
7. **全文存档保留策略**：随运行记录生命周期清理，不单独设保留期。✔ 已确认
