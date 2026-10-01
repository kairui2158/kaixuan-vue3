# 方案：SKILL / 无 SKILL 执行体系统一（v2）

> 日期：2026-10-01
> 状态：已实施并通过 mock Electron 矩阵验证（真实外部供应商未执行，见第 14 节）
> 目标版本：3.71.0
> 门禁依据：`_audit/神意开发经验总结_v6.md` G0.6 / G0.7 / G0.9 / G1.3 / G1.10 / G2.4 / G2.9

## 1. 目标

用户确认的核心原则：**有 SKILL 和无 SKILL 必须是同一套执行方案**。SKILL 改变的是提示词、领域能力与上下文组织，不改变执行协议、权限语义、长文档路由和写回方式。

本方案要消除的分裂：

1. 无 SKILL：整篇重排走终稿 runner（`runFinalDraft`），app 分段生成、续写、校验、写回编辑器。
2. 有 SKILL：同一个请求被 `selectedWorkspaceSkills.length > 0` 推回工具循环，工具面宣称可写但 `editorTools` 按计划模式拒绝写入，模型陷入“有权限/没权限”矛盾。

统一后的行为：**执行计划单源构建；模式判定与 SKILL 加载无关；final-draft 一律走终稿 runner；edit-task / direct 才进入工具循环；SKILL 在两种形态下都以同一协议注入领域能力。**

## 2. 现状问题矩阵

| 问题 | 位置 | 事实 |
|---|---|---|
| SKILL 改变执行器选择 | `OutlineWorkspace.vue:1480-1489`、`ChatPanel.vue:755-760` | `isOutlineFinalDraftRequest` / `isHomeFinalDraftRequest` 要求“未加载 SKILL”才进终稿 runner；加载 SKILL 后 final-draft 请求绕过 runner |
| 大纲 SKILL 分支计划弱化 | `OutlineWorkspace.vue:2334-2339` | `buildLongDocumentExecutionPlan` 传 `contextWindowTokens: null, maxOutputTokens: null`，与无 SKILL 主路径（`OutlineWorkspace.vue:4276-4287`）不一致 |
| 首页 SKILL 分支复用主计划 | `ChatPanel.vue:2407-2414`、`ChatPanel.vue:1667-1675` | 首页用 `activeHomeExecutionPlan`，大纲用闭包重建，两入口不同构 |
| 授权层与执行层规则源不同 | `dialogueToolSurface.ts:128-190`、`editorTools.ts:607-635` | 工具面按 intent + `writeAuthorization` 授权；执行层按 `executionPlan.mode` 拒绝 final-draft 写入 |
| 引擎二次授权丢上下文 | `workspaceSkillEngine.ts:692-716` | `resolveAuthorizedToolSurface` 只传 intent 和 editTaskContext，不传 `writeAuthorization` / `executionPlan` |
| SKILL 请求文本靠闭包 | `OutlineWorkspace.vue:2335`、`workspaceSkillEngine.ts:186-190` | `WorkspaceSkillToolRequest` 无 `requestText`，大纲 adapter 用 `currentOutlineUserRequest` 补 |
| final-draft 工具循环自相矛盾 | `aiService.ts:2141-2169` | 引擎内 steering 要求“停止工具直接输出终稿”，但该输出没有终稿 runner 的写回/续写/校验链 |
| 测试矩阵缺口 | `tests/` | `rg "selectedWorkspaceSkills|skill.*final"` 在测试下零命中；无“SKILL + final-draft”组合测试 |

## 3. 目标架构

### 3.1 单源执行计划

在两个入口的请求入口处（`askAi` / `askPlainAi` / `sendMessage`）只构建一次执行计划：

- 输入：`requestText`、目标内容、真实 provider 输入窗口、真实 `maxTokens`。
- 输出：`LongDocumentExecutionPlan`（含 `mode`、`operation`、`finalDraftPlan`、分段、进度标签）。
- 存储：大纲新增 `activeOutlineExecutionPlan`（对齐首页 `activeHomeExecutionPlan` 模式），SKILL adapter 与 plain 路径共用同一份，不再重建、不再传 null 窗口。
- 生命周期：每轮请求开始时重建，请求结束/终态清理，防止跨轮旧计划污染。

### 3.2 模式判定与 SKILL 无关

删除 `isOutlineFinalDraftRequest` / `isHomeFinalDraftRequest` 中的“未加载 SKILL”条件。判定只保留：

```text
plan.mode === 'final-draft'
且目标内容非空
且请求不是 @ 引用形态
```

SKILL 加载后同样成立。final-draft 请求无论是否加载 SKILL，都进入终稿 runner。

### 3.3 SKILL 在 final-draft 下的注入方式

终稿 runner 保持执行权（分段、续写、结构校验、写回、checkpoint、trace、吞吐监控），SKILL 以“领域能力附加”参与：

- `FinalDraftRunInput` 新增可选 `skillGuidance`：
  - 来源：当前选中 SKILL 模板的名称、执行指引、领域约束。
  - 注入点：`FINAL_DRAFT_SYSTEM_PROMPT` 之后追加，作为系统级附加能力说明；不进入用户指令，不改写终稿要求。
  - 上限：附加内容按字符上限截断（建议 8000 字符），防止 SKILL 指引挤占长文分段窗口；超限登记 trace `skill-guidance-truncated`。
- `buildFinalDraftMessages` / `buildFinalDraftSegmentMessages` / continuation 消息统一追加同一份 guidance，保证分段与续写语义一致。
- run trace 记录：SKILL 名称、guidance 长度、是否截断、执行器 `final-draft-runner`。API 对话框滚动区不显示工具名，与既有 G2.4 规则一致。

理由：终稿 runner 是已经过长文实测的执行器；把 SKILL 语义搬进工具循环等于重造一套终稿状态机，风险高且会再次制造新旧并存。

### 3.4 工具面规则统一

- `final-draft`：不进入工具循环，不暴露 `editor.write`（与无 SKILL 路径 `skillToolSurface = undefined` 一致）。
- `edit-task`：工具循环 + `writeAuthorization.source = 'long-document-workflow'`，服务层 `evaluateWritePermission` 授权，SKILL 与无 SKILL 同规则。
- `direct`：按 intent 授权；discuss/analyze/auto 只读，edit/generate 可写。
- `workspaceSkillEngine.resolveAuthorizedToolSurface` 补传 `writeAuthorization`，消除“入口已授权、引擎二次授权又剥离”的分叉。
- `aiService.resolveFinalDraftToolSurface` 保留为纵深防御：任何 final-draft 计划意外进入工具循环时过滤 write 工具。

### 3.5 引擎协议扩展

`WorkspaceSkillToolRequest` 增加字段：

```ts
export type WorkspaceSkillToolRequest = {
  intent: ChainIntent
  stage: number
  mode: WorkspaceSkillMode
  requestText: string
}
```

- 引擎在调用 `adapter.buildTools` 时传入本轮真实 `requestText`。
- 大纲 adapter 删除对 `currentOutlineUserRequest` 闭包的依赖；两入口 adapter 同构消费 `active*ExecutionPlan`。
- 闭包变量如无其他消费者则删除；如有历史用途，登记后收口到单一状态源。

## 4. 改动清单

### Phase 1：单源计划与入口统一

1. `OutlineWorkspace.vue`
   - 新增 `activeOutlineExecutionPlan` 状态；`askAi` 与 `askPlainAi` 共用同一构建函数（真实窗口、真实 maxTokens）。
   - `isOutlineFinalDraftRequest` 删除 SKILL 条件。
   - `askAi` 在进入 `runWorkspaceSkills` 前判定 final-draft；命中则走 `runOutlineFinalDraftTurn`，并传入 `skillGuidance`。
   - `createWorkspaceSkillAdapter().buildTools` 删除本地 null 窗口重建，改为消费 `activeOutlineExecutionPlan` 与 `request.requestText`。
2. `ChatPanel.vue`
   - `isHomeFinalDraftRequest` 删除 SKILL 条件。
   - SKILL 分支同样在 final-draft 时转入 `runHomeFinalDraft`，传入 `skillGuidance`。
   - 首页 adapter 继续消费 `activeHomeExecutionPlan`，但补齐与大纲一致的请求结束清理。

### Phase 2：终稿 runner SKILL 注入

1. `finalDraftRunner.ts`：`FinalDraftRunInput` 增加 `skillGuidance?: string`，透传到 service。
2. `finalDraftService.ts`：三个消息构建函数统一追加 guidance；超限截断并返回截断信息。
3. trace hooks：记录 `final-draft-skill-guidance` 事件（skillNames、chars、truncated）。

### Phase 3：引擎与授权对齐

1. `workspaceSkillEngine.ts`：`WorkspaceSkillToolRequest` 扩展 `requestText`；`resolveAuthorizedToolSurface` 透传 `writeAuthorization`。
2. `dialogueToolSurface.ts`：不改变现有授权函数签名，只确保引擎侧传入完整 taskContext。
3. `editorTools.ts`：不改 final-draft 拒绝逻辑（这是安全语义，不是缺陷）。

### Phase 4：测试矩阵

新增/扩展：

1. `longDocumentExecutionPlanner.spec.ts`：同一请求 + 同一窗口，计划输出与 SKILL 加载状态无关。
2. `finalDraftService.spec.ts` / `finalDraftRunner.spec.ts`：guidance 注入、截断、分段/续写一致性。
3. `workspaceSkillEngine.spec.ts`：
   - requestText 传入 adapter；
   - writeAuthorization 透传；
   - final-draft 请求不构建 write 工具面。
4. `aiService.spec.ts`：final-draft 计划意外进入工具循环时 write 工具被过滤。
5. 双入口组件级测试（如现有测试设施支持）：SKILL 加载 + final-draft 请求进入终稿 runner；SKILL 加载 + targeted edit 仍进工具循环。

### Phase 5：Electron 级真实 UI 验证

按 G1.13：独立 profile、`SHENYI_DATA_DIR`、可见窗口、登记 PID。

矩阵（大纲 + 首页各跑一遍）：

| 场景 | SKILL | 期望 |
|---|---|---|
| 整篇重排 / 格式整理 / 去重 | 加载 | 终稿 runner 分段生成、滚动字数可见、写回编辑器、可续写 |
| 同上 | 未加载 | 行为与上一行完全一致（同计划、同执行器、同 trace 字段） |
| 修改某一句 / 删除某一段 | 加载 | edit-task / direct 工具循环，写入成功，编辑器高亮定位 |
| 纯讨论 | 加载 | 只读工具面，不出现“无写入权限”类矛盾文案 |
| @ 引用形态 | 加载 | 不进入终稿 runner，保持现有引用语义 |

真实 API 验证使用用户提供的网关与 key（仅环境变量传入，禁止写仓库/日志，G2.11）。

### Phase 6：新旧并存清理

1. 删除 `is*FinalDraftRequest` 中的 SKILL 条件后，搜索两入口所有消费该判定的分支，确认无旧语义残留。
2. 删除大纲 adapter 的本地计划重建后，搜索 `buildLongDocumentExecutionPlan` 全部调用点，确认只剩单源入口。
3. 删除 `currentOutlineUserRequest` 闭包依赖后，搜索全部引用；有其他用途则登记，无则删除变量。
4. run trace schema 如新增字段，同步 `schemaVersion`、导出通道、验证器白名单（G1.8）。
5. 更新 `_audit/SKILL_HANDOFF_API_DIRECT_WRITE_TOOLS.md` 版本口径到 3.71.0，明确“SKILL 不改变执行协议”。

## 5. 验证命令

```powershell
npm run type-check
npm run test:services
npm run verify:production-wiring
```

Electron 实测脚本沿用现有 `scripts/` 验证器规范（G1.5：超时、阶段日志、finally 清理），并新增本轮场景矩阵。

## 6. 风险与回滚

| 风险 | 等级 | 缓解 |
|---|---|---|
| final-draft + chain SKILL 的多步语义被绕过 | 中 | chain SKILL 的生成型请求（目标内容为空）不受影响；有内容的重排/整理本来就是文档变换任务，统一交给终稿 runner 是目标语义。trace 记录 skill guidance，SKILL 制作方可感知 |
| skillGuidance 过长挤占分段窗口 | 中 | 8000 字符上限 + 截断事件 + 分段窗口按有效输入窗口计算 |
| 引擎协议扩展破坏旧 adapter | 低 | `requestText` 为新增必传字段，先改引擎再改两个 adapter，同批提交；type-check + engine spec 兜底 |
| 双入口行为分叉复发 | 中 | 单源计划 + 组件测试矩阵 + `rg` 清理清单；收尾执行 G0.10 七层扫描 |

回滚策略：本方案是入口路由统一，不删除终稿 runner 与工具循环任一执行器；如需回滚，恢复 `is*FinalDraftRequest` 的 SKILL 条件即可，无数据迁移。

## 7. 成熟度评估（G0.6）

| 层 | 结论 | 依据 |
|---|---|---|
| 执行器/工具层 | 成熟 | 终稿 runner、editorTools、工具循环均为现役已验证组件；本方案不新建执行器 |
| 应用方案/交互闭环 | 成熟 | 模式判定、执行器选择、工具面、trace、SKILL 注入形成单一语义链；无 SKILL 双态行为一致 |
| 实现接线 | 半成熟 | 方案已定位到 file:line 改动点，但未实施；放行条件 = 用户审核通过后按 Phase 1-6 执行 |
| 验证标准 | 成熟 | 单测矩阵 + 双入口 Electron 可见窗口实测 + 真实 API + 新旧并存清理清单齐备 |

**总体结论：半成熟（仅差实施与验证），方案本身可执行。** 未实施前不得声称闭环；实施后必须完成 Phase 4-6 才允许升版封装。

## 8. 正反推记录（G0.7）

**正推**：用户输入“重新整理排序” → 单源计划判定 `final-draft` → 无论 SKILL 与否进入终稿 runner → SKILL guidance 注入系统提示 → 分段生成/续写/结构校验 → 写回编辑器 → trace 记录执行器与 SKILL 参与度。

**反推**：若 SKILL 加载仍改变执行器 → 违反用户原则；若 final-draft 暴露 write 工具 → 与 `editorTools` 安全拒绝矛盾；若 SKILL guidance 改写用户指令 → 破坏终稿要求单一事实源；若计划在 adapter 内重建 → 双入口参数漂移复发。以上路径均已被本方案封死。

## 9. 待确认

1. `skillGuidance` 上限 8000 字符是否接受（过长会挤占长文分段窗口）。
2. 有内容的重排/整理/去重请求统一交给终稿 runner（chain SKILL 不接管该类请求）是否符合你的产品预期。
3. 实施后版本号升 3.71.0。

## 10. SKILL 职责边界章程（v2 新增）

### 10.1 绝对边界

SKILL 只允许影响三类内容：

1. **提示词与领域能力**：模板、正文、资源、示例、领域约束、输出风格。
2. **上下文组织**：声明需要哪些上游上下文（outline/settings/history/memory 等），由 app 的 context service 统一组装。
3. **输出质量契约**：input schema、output schema、验证规则、评测用例。

SKILL 绝对不允许影响：

1. 执行器选择（final-draft runner / edit-task / direct 工具循环）。
2. 长文档执行计划（mode、operation、分批、分段、续写策略）。
3. 工具面与权限语义（tools、toolPolicy、toolSurface、writeAuthorization）。
4. 写回协议（checkpoint、hash、批次、回滚、插入点定位）。
5. provider/model/temperature/maxTokens 等执行参数的静默覆盖。
6. trace/schema 的协议字段。

### 10.2 执行参数的边界裁决

当前 `realSkillExecutor.ts:241-264` 的 `mergeSkillAgentDefaults` 会让 folder SKILL 的 `meta.agent` 覆盖 model、temperature、maxTokens、systemPrompt。按上述章程，v2 裁决如下：

1. **用户显式绑定的 Agent**：允许生效。绑定动作来自应用 UI，是用户选择的应用级 Agent 配置，不算 SKILL 越权。
2. **SKILL 包内 `meta.agent`**：不允许静默改执行参数。实施时：
   - model、temperature、maxTokens 忽略，并写入诊断 `skill-agent-ignored`。
   - systemPrompt 不再作为请求主 system prompt，只能并入 `skillGuidance`，长度进入统一截断规则。
   - `meta.agent` 后续版本改名为 `capabilityProfile`，只保留领域能力字段。
3. **retry/apiCallLimit**：属于执行协议，SKILL 只能作为 hint，不允许直接决定。实施时由 app 执行配置统一 clamp：SKILL 声明值超出 app 允许范围即降级为 app 默认，并记录诊断。

### 10.3 安装/导入层校验

`electron/ipc/skill-loader.js` 与 `skill-package.js` 目前只做包结构与模板加载，没有协议边界校验。实施时新增 manifest validator：

1. 安装、导入、升级 SKILL 包时，拒绝 `tools`、`toolPolicy`、`toolSurface`、`writeAuthorization`、`executionPlan` 等禁止字段。
2. 对 `meta.agent` 的执行参数输出 warning，标记为 deprecated，导入成功但记录诊断。
3. validator 规则集中单源存放，Electron 导入与前端 SKILL 设置页共用，避免两套校验漂移。

## 11. 全应用审计矩阵（v2 新增）

| 消费面 | 现状 | 边界判定 | v2 处理 |
|---|---|---|---|
| 大纲 SKILL 主入口 `OutlineWorkspace.vue:3840-3899` | 加载 SKILL 后直接进入 `runWorkspaceSkills`，不构建执行计划 | 越界：SKILL 改变执行器选择 | 请求入口先构建单源 `activeOutlineExecutionPlan`；final-draft 转终稿 runner，其余进工具循环 |
| 大纲 SKILL adapter `OutlineWorkspace.vue:2334-2339` | 用闭包请求与 null 窗口重建计划 | 越界：同一请求出现第二份计划源 | 删除本地重建，消费 `activeOutlineExecutionPlan` 与 `request.requestText` |
| 大纲路由 trace `OutlineWorkspace.vue:644-664` | routing result 时调用 adapter `buildTools` 只为记录工具面 | 不越权，但会与真实执行面漂移 | 保留记录用途，但改为消费同一 adapter/requestText 协议，trace 标记 `surfaceSource: 'trace-projection'` |
| 首页 SKILL 入口 `ChatPanel.vue:755-760`、`:2407-2416` | 计划已单源构建，但 `selectedCoCreationSkills.length === 0` 仍阻止终稿 runner | 越界：SKILL 改变执行器选择 | 删除 SKILL 条件；final-draft 注入 `skillGuidance` 后走终稿 runner |
| 首页 adapter `ChatPanel.vue:1667-1675` | 消费 `activeHomeExecutionPlan`，请求文本仍靠外层状态 | 接近目标，协议不完整 | 引擎传入 `requestText` 后与大纲 adapter 同构 |
| workspace engine `workspaceSkillEngine.ts:186-190`、`:692-716` | 工具请求无 requestText；二次授权只传 intent/editTask | 越界风险：引擎重新构造授权上下文 | `WorkspaceSkillToolRequest` 增加 requestText；授权上下文透传 `executionPlan`、`writeAuthorization`；引擎只做过滤，不做第二次语义判定 |
| Agent orchestrator `agentOrchestrator.ts:251-303` | `document.executionPlan` 缺失时内部重建计划 | 应用内部双计划源，非 SKILL 越权 | 正常链路要求 app 必传 `executionPlan`；fallback 仅限独立 runtime 测试，并记录 `plan-origin: agent-fallback` |
| folder SKILL executor `realSkillExecutor.ts:241-264`、`:473` | `meta.agent` 可覆盖执行参数 | 越界：SKILL 包改变执行参数 | 按 10.2 裁决：忽略执行参数，systemPrompt 进 `skillGuidance`，输出诊断 |
| `skillRouter.ts:44-45`、`:138-139` | 只是透传 caller 提供的 tools/toolPolicy/toolSurface | 不越权，但缺少来源约束 | 类型上标注为 app-provided only；安装 validator 保证 SKILL 包不能携带这些字段 |
| `public/skill-engine.js` | 模板解析与 chain 编排，无工具/写回能力 | 不越权，但文档口径容易误导 | 文档改为“模板与提示词编排引擎”；执行器选择、写回、权限一律不描述给它 |
| `PipelinePanel.vue:1965-1977` | 流水线调用 `routeSkill`，不传工具面，写回由流水线自己执行 | 不越权 | 保持；补 trace 字段 `executor: pipeline-app`，防止误判为 SKILL 直写 |
| `useAiTools.ts:83-106` | SKILL template 只作为 system prompt，无工具面 | 不越权 | 保持 prompt-only，不纳入工具授权链 |
| `useDeAi.ts:141-147` | `routeSkill` 不传工具面，应用层处理结果 | 不越权 | 保持；结果写回仍走应用既有降 AI 流程 |
| `useSkillTest.ts` / `folderSkillTest` / `folderSkillEval` | 评测路径直接调 SKILL，无工作区写权限 | 不越权，但必须与生产协议区分 | trace 标记 `executionContext: skill-eval`；禁止用评测路径验证生产写入 |
| Electron skill loader/package | 只做包结构与 zip 导入导出，不校验协议字段 | 缺口：越界字段可随包进入应用 | 按 10.3 增加 manifest validator 与导入诊断 |
| `aiService.ts:358-366`、`:2141-2169` | final-draft 有 write 过滤与 steering | 纵深防御，不越权 | 保留；统一后它只作为兜底，不再是主路由 |
| 旧架构文档 `docs/链路与功能参考书.md:61` 等 | 将 chain 描述为 SkillExecutionEngine 的执行语义 | 文档口径冲突 | 实施完成后按 G0.10 更新，明确执行权在 app runner |

## 12. v2 改动清单增量

在原 Phase 1-6 基础上新增：

1. `realSkillExecutor.ts`：移除 `meta.agent` 执行参数合并；新增 `skill-agent-ignored` 诊断；systemPrompt 归并到 guidance。
2. `realSkillTypes.ts`：为 `meta.agent` 增加 deprecated 标注与类型注释；新增 `capabilityProfile` 目标形态。
3. `electron/ipc/skill-loader.js`、`skill-package.js`：接入 manifest validator，导入/导出两侧共用规则。
4. `agentOrchestrator.ts`：`document.executionPlan` 缺失时的 fallback 加 `plan-origin` 事件；生产调用必须由 app 传入计划。
5. `skillRouter.ts` / `workspaceSkillEngine.ts`：类型注释明确 tools/toolPolicy/toolSurface 只能由 app adapter 提供。
6. trace：新增 `surfaceSource`、`executionContext`、`plan-origin`、`skill-agent-ignored` 四类字段，全部进入 run trace 白名单。
7. 文档：更新 `SKILL_HANDOFF_API_DIRECT_WRITE_TOOLS.md` 与 `链路参考书`，写明“SKILL 无权改变执行协议/权限语义”。

## 13. v2 成熟度结论

| 维度 | v1 | v2 | 依据 |
|---|---|---|---|
| 全应用覆盖 | 半成熟 | 成熟 | 双入口、engine、agent runtime、folder executor、router、流水线、评测、Electron 导入、公共引擎、文档全部入矩阵 |
| 职责边界 | 半成熟 | 成熟 | 允许/禁止清单、执行参数裁决、安装校验三层都有落点 |
| 新旧并存治理 | 成熟 | 成熟 | 保留终稿 runner 与工具循环双执行器，但删除“SKILL 改变执行器”的旧语义；所有旧字段处理路径均有替换或诊断 |
| 验证方案 | 成熟 | 成熟 | 单测 + manifest validator + Electron 可见窗口双入口矩阵；评测路径与生产路径分开验证 |
| 实施状态 | 未实施 | 未实施 | 未动生产代码；放行条件仍是用户审核通过 |

**总体结论：方案层已成熟，实施层未开始。** 断点只有两个：用户确认 v2 边界裁决；确认后按 Phase 1-6 + v2 增量执行，未跑完验证前不得升版封装。

## 14. 实施与验证结果（2026-10-01）

### 14.1 已实施范围

1. 单源执行计划：大纲入口新增 `activeOutlineExecutionPlan`，`askAi` / `askPlainAi` 共用 `buildOutlineExecutionPlanForRequest()`；真实 provider 窗口与 `maxTokens` 进入计划。
2. SKILL 不再改变执行器：删除双入口 `is*FinalDraftRequest` 的“未加载 SKILL”条件；final-draft 无论是否加载 SKILL 都进入终稿 runner，targeted edit 继续进入工具循环。
3. SKILL guidance 注入：`FinalDraftRunInput.skillGuidance` 贯通 runner 与 service；分段、续写、结构重试使用同一 guidance；8000 字符截断并写入 `skill-guidance-truncated` 事件。
4. 工具面与授权单源：`WorkspaceSkillToolRequest` 增加 `requestText`；engine 透传 `writeAuthorization`；adapter 只提供应用持有的执行上下文。
5. 协议边界：新增 `src/services/skillPackageProtocol.json` 单源规则；安装/导入/导出/设置页共用；folder `meta.agent` 的执行参数被忽略并记录诊断，systemPrompt 归并到 guidance。
6. 观测：`final-draft-skill-guidance`、`skill-agent-ignored`、`plan-origin`、`surfaceSource: trace-projection` 等字段进入 run trace。

### 14.2 已验证

| 验证 | 命令 / 证据 | 结果 |
|---|---|---|
| 服务测试 | `npm run test:services` | 124 文件 / 1303 tests 全绿 |
| 类型 | `npm run type-check` | exit 0 |
| 语法 | `node --check electron/preload.js`、`electron/ipc/skill-package.js`、`scripts/verify-skill-neutral-execution-electron.mjs` | 全部通过 |
| 构建 | `npm run build:vue` | 通过；仅既有 chunk 体积与 Vite 配置 warning |
| Electron 可见 UI 矩阵 | `node scripts/verify-skill-neutral-execution-electron.mjs` | PASS；证据在 `_audit/verification-skill-neutral-execution-electron/` |

矩阵覆盖：首页/大纲 × 无SKILL/有SKILL × final-draft/targeted-edit。断言包括无 SKILL 请求 `guidance=false` 且 `tools=[]`、有 SKILL 请求 `guidance=true`、final-draft 不暴露 `editor.write`、targeted edit 暴露完整 editor/outline 工具面且真实写回编辑器、导出 trace `schemaVersion=11`。

### 14.3 未验证

真实外部供应商调用未执行。本方案的外部 API key 不得写入仓库、文档或证据文件；如需补做，只能通过环境变量传入，并按 G1.4 分层标注，不得用 mock 结果冒充 live 验证。
