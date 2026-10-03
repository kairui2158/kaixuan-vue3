# SKILL/Agent 领域能力与执行权限单源化方案

> 状态：待用户审核；未获确认前不改生产代码。  
> 成熟度：**成熟，可执行**。代码证据、正反推、影响面、测试契约、真实验收均已闭合。  
> 硬目标：SKILL/Agent 只提供领域能力；执行权限永远由“意图 + 操作类型 + 执行计划”三元组单源决定；任何 workflow 授权不得覆盖 `discuss/analyze` 的只读语义。  
> 适用门禁：G0.5 回头看、G0.10 新旧并存清零、G1.10 权限门、G1.14 深层根因、G2.1 工具循环、G2.4 直写、G2.13 SKILL 执行中立。

## 0. 结论

这不是“SKILL 干扰 API”的表层问题，而是**写入授权的第二套语义并存**：意图路由已经判对 `discuss`，但长文档计划层把未知请求兜底成 `targeted_edit`，入口把 `edit-task` 模式翻译成 `long-document-workflow` 授权，服务层和工具面再把这份授权当成覆盖意图的布尔旁路。SKILL 加载只是放大了这条旧路径的暴露频率。

同一错误契约分布在 4 个授权点、2 个入口的意图伪造点、2 条旧测试契约和 1 个收敛注入点。只修大纲入口会留下首页旁路；只修工具面会留下服务层旁路；只改代码不改测试会让旧绿灯把错误语义拉回。

## 1. 已核实根因链

| 层 | 事实 | 证据 |
|---|---|---|
| 意图路由 | 10-03 trace 已正确判为 `discuss`，但后续不消费 | `run-trace-outline-20261003-131806-deep` |
| 计划兜底 | `classifyOperation()` 未知请求兜底 `targeted_edit` | `longDocumentExecutionPlanner.ts:104-112` |
| 分类分裂 | `longDocumentPolicy.classifyLongDocumentOperation()` 未知默认 `discussion`；planner 默认写入 | `longDocumentPolicy.ts:116-141` |
| 大纲授权 | `edit-task` 无条件生成 `workflowWriteAuthorization` | `OutlineWorkspace.vue:4584-4599` |
| 首页授权 | 同款授权，另有两处 `discuss && workflowWrite -> edit` 伪造意图 | `ChatPanel.vue:2530-2536`、`ChatPanel.vue:3374-3375`、`ChatPanel.vue:3409-3411` |
| 大纲伪造 | `toolPolicyIntent = workflowWriteAuthorization ? 'edit' : plainIntent` | `OutlineWorkspace.vue:4642` |
| SKILL adapter | `getExecutionContext()` 也按 `mode === 'edit-task'` 授予 workflow 授权 | `OutlineWorkspace.vue:2587-2591`、`ChatPanel.vue:1748-1752` |
| 工具面 | `long-document-workflow` 强制 `writeEditor: true` | `dialogueToolSurface.ts:161-164` |
| 服务层 | 非编辑意图遇到 workflow 授权直接放行 | `aiService.ts:556-579` |
| 传播面 | `writeAuthorization` 继续向 editorTools、EditTask 删除校验、trace 透传，修复必须整链一致，不能只改工具面 | `editorTools.ts:835`、`editorTools.ts:929`、`OutlineWorkspace.vue:2067-2076` |
| 收敛注入 | 非终稿长文档统一要求“下一轮必须 editor.write，禁止无计划读取” | `aiService.ts:2410-2432` |
| Agent 判据 | 无正文且无成功写入即无进展，未按任务语义分叉 | `agentOrchestrator.ts:192-212` |
| SKILL 误导事件 | 空 guidance 也发“SKILL 已接入” | `agentOrchestrator.ts:353-366` |
| 旧契约 | 两条测试明确保护“workflow 可覆盖 discuss 写入” | `dialogueToolSurface.spec.ts:78-88`、`aiService.spec.ts:3165-3205` |

推演补充：`agentOrchestrator` 本身已有 `document.operationType === 'discussion'` 的只读分叉，但入口从未把 `discussion` 传进去；这证明不是能力缺失，而是上游语义没有接上。

## 2. 正推 / 反推

### 正推：正常链路应该是

1. 意图路由输出 `discuss/analyze/auto/edit/generate`。
2. 计划层把只读意图映射为 `discussion` 操作，不生成写入批次。
3. 入口按三元组计算授权：意图可写、操作可写、计划允许写入，三者缺一不可。
4. 工具面与服务层都消费同一授权结果。
5. Agent 对只读任务把“产出正文回答”视为进展。
6. 收敛提示按任务语义分叉：discuss 停止工具并自然语言回答；写入任务才要求 `editor.write`。
7. SKILL 只注入 guidance；trace 单独记录“无 SKILL guidance”与“guidance 已注入”。

### 反推：若跳过任何一层

| 缺口 | 后果 |
|---|---|
| 不收口 planner | 首页和大纲继续各自分类，未知输入继续写入兜底 |
| 不删服务层旁路 | UI 看似只读，但 workflow 授权仍能越权写入 |
| 不删入口伪造 | 只改 UI 契约，深循环仍按 edit 驱动 |
| 不改旧测试 | 语义被测试契约固化，后续重构又被拉回 |
| 不改收敛注入 | 工具面已只读，模型仍被系统提示推向“必须写入” |
| 不改 Agent 判据 | discuss 轮天然“无进展”，被误判空转 |
| 不改 SKILL adapter | 有 SKILL 路径重复旧授权语义 |

## 3. 修改方案

### Task 1：计划层单源

`longDocumentExecutionPlanner.ts`

1. `LongDocumentExecutionPlannerInput` 增加 `intent?: PlainDialogueIntent | ChainIntent`。
2. `resolveOperation()` 在 `operationHint` 之后先消费 `intent`：`discuss/analyze`（以及语义映射为只读的 `auto`）直接返回 `discussion`。
3. `LongDocumentExecutionOperation` 增加 `discussion`；未知请求兜底从 `targeted_edit` 改为 `discussion`。
4. `resolveExecutionMode()` 对 `discussion` 返回 `direct`，段为空，不变量为空。
5. `toLongDocumentOperationType('discussion')` 返回 `discussion`。
6. 同步补全所有穷举消费者，已核实的有：`operationLabels: Record<LongDocumentExecutionOperation>` 必须新增 `discussion: '讨论'`；`longDocumentWriteProtocol.ts` 的 invariants 与 directive 两个 `switch (plan.operation)` 必须为 `discussion` 返回空写入约束。执行时再以 `type-check + rg` 复扫，防止存在本表未列出的分支。

### Task 2：授权三元组

`dialogueToolSurface.ts`

1. `DialogueWriteAuthorization` 从单纯 `source` 升级为结构化授权，至少包含 `source: 'long-document-workflow'`、`intent`、`operation`、`mode`、`reason`。
2. `authorizeDialogueTools()` 删除“workflow 授权强制 `writeEditor`”的旁路。
3. 新增单源函数：只有当 `intent ∈ {edit, generate}`、操作为写入型、计划 `mode` 允许写入时，才授权写入；`long-document-workflow` 只是证据来源，不是权限本身。
4. `discuss/analyze/auto` 永远只读，除非存在显式、非 SKILL 来源的写入确认会话状态（当前不存在，不新增确认层）。

### Task 3：服务层守卫

`aiService.ts`

1. `evaluateWritePermission()` 删除 `policy.writeAuthorization === 'long-document-workflow'` 的直接放行。
2. workflow 授权必须携带并匹配三元组；服务层独立复核 `intent + operation + plan mode`。
3. 不匹配时返回 `permission_denied`，错误信息明确“workflow 授权未通过三元组校验”。

`editorTools.ts`、EditTask 删除校验链同步消费同一个结构化授权对象；`long-document-workflow` 字符串继续作为诊断标识，但不再单独构成授权。

### Task 4：双入口接线

`OutlineWorkspace.vue`、`ChatPanel.vue`

1. 两处 `buildLongDocumentExecutionPlan()` 传入 `intent`。
2. `buildOutlineExecutionPlanForRequest()` 签名补 `intent`，兼容现有调用但只允许单一路径来源。
3. 删除三处 `discuss && workflowWrite -> edit` 伪造意图。
4. `workflowWriteAuthorization` 只在三元组为真时生成，且内部携带 intent / operation / mode。

### Task 5：Agent 与收敛语义

`agentOrchestrator.ts`、`aiService.ts`

1. Agent 进展判据按 runtime document operation 分叉：`discussion` 视“自然语言正文”为进展，不要求写入。
2. 收敛注入按任务类型分叉：discuss 提示“停止工具，直接自然语言回答”；写入任务保留现有写入收敛。
3. 空 guidance 时 trace 事件改为“SKILL 无可注入内容”，不再声称“SKILL 已接入”。
4. `buildLongDocumentWriteDirective()` 不再是收敛注入的唯一文案来源：写入任务保留现有 directive；`discussion` 分支必须单独返回“停止调用工具，直接基于已读内容回答”的收敛文案。

### Task 6：SKILL adapter

`OutlineWorkspace.vue:2587-2591`、`ChatPanel.vue:1748-1752`

1. `getExecutionContext()` 不再从 `mode === 'edit-task'` 推导授权。
2. 改为透传单源授权对象；SKILL 包无法提供、覆盖或增强这份授权。

### Task 7：测试契约重建

1. 改写 `dialogueToolSurface.spec.ts:78-88`：`discuss + long-document-workflow` 必须只读。
2. 改写 `aiService.spec.ts:3165-3205`：同组合必须 `permission_denied`。
3. 新增 planner 测试：`discuss` 意图在长文档上生成 `discussion` 计划；未知文本不再默认 `targeted_edit`。
4. 新增双入口回归：真实编辑目标 + `edit/generate` 意图写入链路保持不变。
5. 新增 Agent 测试：discussion 任务只读若干轮后输出正文即完成，不触发写入收敛。
6. 新增 editorTools/EditTask 契约：删除类批量写入只有在结构化授权携带匹配三元组时才允许 `planned-deletion-only` 校验放行。

## 4. 影响面与风险

| 面 | 影响 | 控制方式 |
|---|---|---|
| discuss/analyze | 只读语义恢复；空转与“没权限”回答消失 | 直接目标 |
| edit/generate | 权限路径更严，但合法写入不应受影响 | 双入口写入回归 |
| 长文档 EditTask | 只有写入型操作进入 EditTask | planner 分类测试 |
| final-draft | `rewrite_segments` 判定不变 | 现有测试回归 |
| 有 SKILL / 无 SKILL | 同一执行底座，SKILL 只影响提示词 | adapter 授权透传测试 |
| 旧测试 | 两条旧契约必改，否则与新语义冲突 | Task 7 |
| 未提交工作区 | 大量 3.72.0 改动，不可回滚 | 只做本方案范围内修改 |

## 5. 验证方案

### 单元 / 契约层

1. 精确测试命令：`npx vitest run src/services/longDocumentExecutionPlanner.spec.ts src/services/dialogueToolSurface.spec.ts src/services/aiService.spec.ts src/services/agentOrchestrator.spec.ts src/services/workspaceSkillEngine.spec.ts`
2. 全量回归：`npm run test:services`
3. 类型门：`npm run type-check`
2. 关键断言：workflow 授权不能单独放行；`discuss` 计划不生成写入段；伪造意图点清零。

### run-trace 回放

1. 以 `run-trace-outline-20261003-131806-deep` 为基线，断言旧链路必然出现 edit-task / workflow 写入。
2. 新链路同请求必须：intent `discuss`、operation `discussion`、无 write 工具面、无写入事件、有自然语言正文输出。

### Electron 级真实 UI（禁止注入式）

1. 大纲工作台与首页双入口。
2. 真实下拉选择 SKILL，截图或 trace 证明 `skillIds` 与 selection 状态。
3. 输入只读讨论语料 3 条，观察：不出现写入等待、不出现 tool-loop、直接返回正文。
4. 输入写入指令 3 条（局部修改、删除、插入），观察：editor.write 正常执行，编辑器内容变化、trace 有命令与 hash。
5. 输入“讨论中带修改词”的混语句 2 条，观察：仍按 discuss 只读，不因“修改/删除”词越权。
6. 全程记录 API 输出轮次、正文、工具调用、权限拒绝事件。

具体执行方式：新增 `scripts/verify-skill-agent-authority-electron.mjs`，复用 `verify-long-document-operation-phase7-electron.mjs` 的真实 Electron 启动、CDP、真实项目/文档、真实 SKILL 下拉选择模式；输出目录固定为 `_audit/verification-skill-agent-authority/`，每个 case 落 `result.json`、trace 摘要、截图证据。禁止在脚本里直接注入 guidance 冒充 SKILL。

### 真实 API smoke

Electron 断言只验证应用链路与权限语义，不能证明真实供应商行为，因此另跑一轮真实 API：

1. 大纲 discuss + SKILL：期望直接自然语言回答，无 `editor.write`，无写入事件。
2. 大纲 edit + SKILL：期望真实写入、内容 hash 变化、批次/命令进 trace。
3. 首页 discuss + SKILL：期望只读回答。
4. 首页 edit + SKILL：期望真实写入。
5. 证据写入同一验证目录；任何一轮出现 tool-loop、空等、“无权限”话术或未写入，均为 FAIL。

### 回头看

1. `rg` 全库扫描 `long-document-workflow`、`workflowWriteAuthorization`、`toolPolicyIntent`、`discuss' &&`，确认无第二语义残留。
2. 逐行审 diff，确认未动用户未提交的 3.72.0 改动。
3. 回头看必须覆盖：入口、服务层、SKILL adapter、测试契约、trace 事件五条线；有任何新发现则回到方案补项，不允许封装。
4. 更新 DEV_LOG、经验文件；封装前清理临时脚本与无关产物。

## 6. 停止条件

任何以下情况立即停止并回报，不得继续封装：

1. 合法 edit/generate 写入回归失败。
2. Electron 真实 UI 未能真实加载 SKILL。
3. trace 仍出现 workflow 覆盖 discuss 的写入事件。
4. 旧路径或旧测试语义并存。

## 7. 成熟度评估

**成熟**。理由：所有修改点均有源码证据；正反推覆盖跳步后果；影响面含双入口、SKILL adapter、服务层、测试契约；验证包含单测、trace 回放、Electron 真实 UI 与回头看扫描。剩余不确定性只来自执行期真实模型行为，已由 run-trace 回放与真实验收覆盖。
