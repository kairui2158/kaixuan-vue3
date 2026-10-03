# Phase 7 有 SKILL / 无 SKILL 统一执行修正案

> 版本：2.0（成熟执行审核稿）
> 前置方案：[PROPOSAL_2026-10-01_LONG_DOCUMENT_OPERATION_EXECUTION_ALIGNMENT.md](PROPOSAL_2026-10-01_LONG_DOCUMENT_OPERATION_EXECUTION_ALIGNMENT.md)
> 状态：待用户审核；未获确认前不改生产代码。
> 适用门禁：G0.3 诚实闭环、G0.5 回头看、G0.6 方案成熟度、G0.7 正反推研磨、G0.9 影响圈声明、G0.10 新旧并存清零、G0.11 真实交互冒充禁令。

## 0. 结论先行

10 月 1 日主方案的方向没有错：长文档操作必须由“操作语义 -> 执行模式 -> 校验策略 -> 会话延续 -> 真实 UI 证据”整链闭环。10 月 2 日 `outline-with-skill` 真实 Electron + 真实 API 复刻暴露的是 Phase 7 的隐藏假设：**有 SKILL 的请求会自然落到 direct / final-draft 统一执行底座上**。这个假设不成立。

本轮证据显示：

1. 大纲 SKILL compose 路径会自行构建 `resolveAuthorizedToolSurface()`，把 `editor.write` 放进工具面，但请求本体仍由 folder SKILL 文本循环执行；没有接入 `agentDialogueRuntime()` / `agentOrchestrator()`，也没有长文档计划事件。
2. Turn3 模型在工具面含 `editor.write` 的情况下输出 `status: pending` 的“修改预览”，请求用户批准。这不是工具不可用，而是 SKILL 模板状态机把执行权从应用手中接走了。
3. `final-draft-skill-guidance` 事件只在 final-draft runner 内发出，不能作为 compose 路径的 SKILL 生效证据。Phase 7 断言在此属于契约错位，不是产品绿灯不足。
4. trace 的工具、物理调用、API 完成、turn 完成等大量事件未绑定 `turnId`，验证器无法按轮归因。

v2.0 的结论：方案本身成熟，执行尚未开始。放行后必须按 Step 0 到 Step 8 顺序执行，任何一步不绿都不得继续。

## 1. v2.0 成熟化修正

### 1.1 turnId 根因更正

v1.0 中“`addOutlineTraceEvent()` 只在显式传入 turnId 时才绑定”的表述不准确。源码核实结果：

1. `runTrace.addEvent()` 在 `src/stores/runTrace.ts:1082` 已使用 `run.currentTurnId` 做默认绑定。
2. 真实断点在 `src/stores/runTrace.ts:1030`：`finishTurn()` 会立即清空 `currentTurnId`。
3. `prompt-built`、`physical-call`、`tool-call`、`api-success`、`state-transition`、`turn-finished` 等异步回调事件在 `finishTurn()` 之后落 trace，默认绑定此时拿到的是 `undefined`。

因此 Phase D 不新增第二套默认回填，不批量事后补写，不制造新旧并存。它只做两件事：

- 执行期回调显式携带本轮 turnId。
- `finishTurn()` 延迟到本轮 API call、trace 事件、编辑写入全部闭合后再清理。

### 1.2 验证契约路径感知

`final-draft-skill-guidance` 只能证明 final-draft runner 中的 SKILL guidance。compose 路径必须有自己的证据事件 `skill-guidance-injected`。验证器按执行路径选择证据事件，执行结果断言不放宽。

### 1.3 验收产物固定化

每个阶段的验收都必须留下目录化证据，不允许口头通过：

- 基线与阶段证据：`_audit/verification-phase7-maturity/phase-X/`
- 真实 UI / 真实 API 证据：`_audit/verification-long-document-operation-phase7/`

脚本只写这些固定位置，禁止散落临时文件。

## 2. 目标与不做

### 目标

1. **一个用户目标，一条执行底座**：有无 SKILL 都走同一个长文档计划源、同一个执行引擎（direct / EditTask / final-draft）、同一个权限面、同一个校验协议。
2. **SKILL 职责单源**：SKILL 只注入系统提示、领域能力、上下文组织、作品事实约束；不改变执行模式、写权限、批次协议、校验策略、失败重试语义。
3. **计划层是唯一模式决策者**：compose 路径不得在文本循环里“看似能写”或“默认先预览”；执行模式必须由 `LongDocumentExecutionPlan` 决定。
4. **验证契约路径无关**：同一用户目标在有 SKILL / 无 SKILL 下断言同一执行结果，差异只允许出现在提示词注入、guidance 事件与领域答复风格。
5. **观测与事实一致**：所有关键事件绑定 turnId；有 SKILL 路径的 guidance 证据使用 compose 路径自身事件。

### 不做

1. 不给 SKILL 包增加执行权，不改 folder 协议的执行语义。
2. 不恢复旧预览-确认工作流作为执行层。
3. 不用“验证器放宽”掩盖路径不一致。
4. 不引入新确认弹层或新按钮。
5. 不设 token 预算，不设输出上限。

## 3. 根因链

| 层 | 事实 | 证据 |
|---|---|---|
| direct 无 SKILL | `askPlainAi()` 构建计划、发 `long-document-policy`，并把 `document.executionPlan` 与 `editTaskWorkflow` 传给 `agentDialogueRuntime()` | `OutlineWorkspace.vue:4668-4679`、`OutlineWorkspace.vue:4788-4829` |
| direct 有 SKILL / final-draft | `askAi()` 中 final-draft 判定调 `runOutlineFinalDraftTurn()`；turn 内 `skillGuidance` 传入 runner，runner 发 `final-draft-skill-guidance` | `OutlineWorkspace.vue:4037-4065`、`finalDraftRunner.ts:193-206` |
| compose 分支 | `runWorkspaceSkills()` 做意图路由与工具面授权，然后 `callWorkspaceSkill()` 只消费 SKILL prompt 与 folder route，未接入 agent runtime | `workspaceSkillEngine.ts:1620-1773`、`workspaceSkillEngine.ts:747-1070` |
| compose 计划来源 | adapter 可提供 `executionPlan` / `writeAuthorization`，只用于工具面授权；执行循环仍是 SKILL 文本循环 | `workspaceSkillEngine.ts:712-738`、`OutlineWorkspace.vue:2494-2535` |
| 观测缺口 | compose 请求无 `long-document-policy` / `execution-mode-selected` / `edit-task-batch-planned` | `turns-partial.json`：三轮 `longDocumentEvents: []` |
| 模型行为 | Turn3 工具面含 `editor.write`，但模型输出三处删除方案的“修改预览”，`status: pending` | `turns-partial.json` Turn3 `assistantReply` |
| 契约错位 | Phase 7 把 `final-draft-skill-guidance` 当全路径 SKILL 生效证据，但该事件只存在于 final-draft runner | `finalDraftRunner.ts:195-206`、`failure.json` |
| trace 绑定 | 关键事件多为 `turnId: null`；API call 本身已绑定 turn | `failure.json` `runBindingSnapshot` |
| 既有承诺 | DEV_LOG 宣称“同底座、不改权限语义”，但真实复刻证明 compose 执行路径未接入统一底座 | `DEV_LOG_2026-10-01_skill-neutral-execution-unification.md` |

根因定性：**应用层接线断裂 + 验证契约错位**。SKILL 包不是权限来源；L1-B 模板的“先预览后批准”提示词语义在 compose 执行循环里成了事实执行协议。责任在应用层。SKILL 层需要同步修模板，但不承担主责。

## 4. 执行矩阵

| 用户目标 | 无 SKILL | 有 SKILL | 执行引擎 | 允许差异 |
|---|---|---|---|---|
| 局部修改 / 插入 / 删除 | direct 工具循环 | 同 direct + SKILL guidance | agent runtime | 答复风格、领域能力注入 |
| 去重 | EditTask 多批 delete | 同 EditTask + guidance | EditTask + editor.write | 说明话术、领域约束 |
| 标点 / 格式整理 | EditTask 多批 replace_match / rewrite | 同 EditTask 多批执行 | EditTask + editor.write | 说明话术、领域约束 |
| 结构重排 / 排序 | EditTask 单条 reorder_sections | 同 EditTask 单条命令 | EditTask + editor.write | 说明话术、领域约束 |
| 整篇重写 / 新完整稿 | final-draft runner | 同 runner + skillGuidance | final-draft | 领域答复风格 |

执行结果断言必须相同：模式、工具面、写入命令、批次、内容不变量、编辑器最终内容、未授权内容保留。

## 5. 已核实资产

| 资产 | 事实 |
|---|---|
| 测试文档 | `C:/Users/凯瑞/Desktop/测试/《绿潮》大纲总纲.md`，207,309 字节 |
| SKILL 包 | `D:/codex/玄武规划SKILL/L1-大纲层/L1-B-大纲共创主编/template.md`，16,054 字节 |
| live provider | `_data/long-document-restructure-phase6-profile/documents-data/wa_providers.json`，`deepseek-v4-pro` |
| Phase 7 验证脚本 | `scripts/verify-long-document-operation-phase7-electron.mjs` |
| 常规验证 | `npm run test:services`、`npm run type-check`、`npm run build:vue`、`npm run verify:production-wiring` |

安全约束：API key 只允许通过环境变量注入，禁止写入仓库、文档或任何证据文件。

## 6. 执行总原则

1. **每一步必须留证**：每阶段生成 `summary.json` 与原始命令输出，不留证不得进入下一步。
2. **每一步必须可回滚**：单文件改动优先，逐项落地；回滚使用 `git diff -- <file>` 反向补丁，禁止 `git reset --hard`。
3. **每一步必须可复现**：命令写明工作目录、环境变量、参数和输出位置。
4. **禁止跳步**：前一个 Phase 未绿不得进入后一个 Phase；Phase E 未全绿不得封装或升版本。
5. **禁止偷懒验证**：不使用旧会话结果，不用 mock 冒充真实 API，不用脚本注入冒充 UI 选择。
6. **禁止新旧并存**：每个 Phase 结束时执行 `rg` 清扫，确认旧路径、旧断言、旧规格无残留。
7. **禁止 API key 泄漏**：所有证据文件输出前做 secret 扫描。

## 7. 阶段停止条件

| 阶段 | 停止条件 | 不允许的操作 |
|---|---|---|
| Step 0 | 基线状态或基线测试未完成、未存证 | 开始生产代码修改 |
| Phase A | 统一入口未建立、runtime 未接入、active plan 未复用 | 进入 Phase B |
| Phase B | `skillExecutionContract` 未定义，或 pending 仍被计为成功 | 进入 Phase C |
| Phase C | guidance 事件不可按路径识别 | 进入 Phase D |
| Phase D | 任何关键事件 turnId 绑定率不足 100% | 进入 Phase E |
| Phase E | 任一真实 case 失败 | 升版本、封装、宣称闭环 |

## 8. 逐项执行步骤

### Step 0：基线封存

**目的**：防止既有 Phase 1-6 未提交改动被误归属或误回滚，并为回滚提供精确反基线。

**修改文件**：无生产代码。只新增证据目录。

**执行命令**：

```powershell
New-Item -ItemType Directory -Force -Path '_audit/verification-phase7-maturity/phase-0'
git status --short | Tee-Object -FilePath '_audit/verification-phase7-maturity/phase-0/git-status.txt'
git diff --stat | Tee-Object -FilePath '_audit/verification-phase7-maturity/phase-0/git-diff-stat.txt'
npm run test:services 2>&1 | Tee-Object -FilePath '_audit/verification-phase7-maturity/phase-0/test-services-before.log'
npm run type-check 2>&1 | Tee-Object -FilePath '_audit/verification-phase7-maturity/phase-0/type-check-before.log'
npm run build:vue 2>&1 | Tee-Object -FilePath '_audit/verification-phase7-maturity/phase-0/build-vue-before.log'
npm run verify:production-wiring 2>&1 | Tee-Object -FilePath '_audit/verification-phase7-maturity/phase-0/production-wiring-before.log'
```

**验收**：

- 六个基线证据文件存在且非空。
- 基线测试全部通过；若有失败，先记录为既有失败，不允许带入后续 Phase 冒充新改动造成的回归。

**回滚**：无生产改动。目录建错可删除 `_audit/verification-phase7-maturity/phase-0/`。

**停止条件**：status / diff 未完整落盘，或基线命令失败且未定位原因。

### Step 1（Phase A1）：建立 SKILL guidance 组装边界

**目的**：把 `runWorkspaceSkills()` 从“第二执行器”收窄为“guidance / prompt 组装器”，执行权统一交给 runtime。

**打算修改**：

| 文件 | 位置 | 修改内容 |
|---|---|---|
| `src/services/workspaceSkillEngine.ts` | `runWorkspaceSkills()` 约 `:1284`，compose 分支约 `:1620-1773` | 新增只读 `buildWorkspaceSkillGuidance()`：读取 templates、routing、adapter、executionPlan；输出 guidance、skillIds、promptSource；不改权限、不改模型、不启动 API call |
| `src/services/workspaceSkillEngine.ts` | `callWorkspaceSkill()` 约 `:747` | 职责收窄：只消费组装后的 guidance / prompt，不再携带执行状态机 |
| `src/services/workspaceSkillEngine.ts` | `resolveAuthorizedToolSurface()` 约 `:712` | 保持现有授权语义，作为投影使用，不再作为 compose 执行入口 |

**明确不改**：

- `editorTools.ts` 的原子校验、命令上限、内容不变量。
- `editTaskService.ts` 状态机。
- `longDocumentExecutionPlanner.ts` 模式决策逻辑。
- folder `meta.agent`，不把执行权写回 SKILL 包。

**执行步骤**：

1. 先新增类型与纯函数，不做行为切换，当前生产路径保持不变。
2. 新增 focused tests：无模板、空模板、多模板、模板超 8000 字符、有 / 无 executionPlan、有 / 无 routing。
3. 保存 diff 基线：`git diff -- src/services/workspaceSkillEngine.ts`。
4. 执行 focused tests，未绿即停，不进入行为切换。

**验收命令**：

```powershell
New-Item -ItemType Directory -Force -Path '_audit/verification-phase7-maturity/phase-a'
npx vitest run src/services/workspaceSkillEngine.spec.ts --reporter=verbose 2>&1 | Tee-Object -FilePath '_audit/verification-phase7-maturity/phase-a/guidance-assembly-tests.log'
```

**验收标准**：

- focused tests 全绿。
- `summary.json` 写入 `guidanceAssemblyReady: true`。
- diff 只包含增量，不包含行为切换。

**回滚**：`git diff -- src/services/workspaceSkillEngine.ts` 反向应用。

**停止条件**：聚焦测试红；8000 字符截断规则被破坏；authorization、tool surface、model 选择被意外改动。

### Step 2（Phase A2）：Agent runtime 接收 SKILL guidance

**目的**：让统一执行底座感知 SKILL guidance，但 SKILL 不改变执行语义。

**打算修改**：

| 文件 | 位置 | 修改内容 |
|---|---|---|
| `src/services/agentDialogueRuntime.ts` | 类型约 `:15-35`，factory 约 `:60-90` | `AgentDialogueRuntimeInput` 新增可选 `skillGuidance`、`skillIds`、`promptSource`；单源透传给 orchestrator |
| `src/services/agentOrchestrator.ts` | 类型约 `:120-145`，runtime 构造约 `:250-300` | 新增只读透传字段；不读取 folder `script.js` 状态机 |

**明确不改**：

- `document.executionPlan`、`editTaskWorkflow`、`runSubAgent`、`onEvent` 的现有语义。
- 工具权限面。
- final-draft runner 写回协议。

**执行步骤**：

1. 扩展两个类型为可选字段，不改变现有字段语义。
2. 补测试：guidance 存在 / 不存在、schema 校验、透传路径。
3. 执行 focused tests。

**验收命令**：

```powershell
New-Item -ItemType Directory -Force -Path '_audit/verification-phase7-maturity/phase-a'
npx vitest run src/services/agentDialogueRuntime.spec.ts src/services/agentOrchestrator.spec.ts --reporter=verbose 2>&1 | Tee-Object -FilePath '_audit/verification-phase7-maturity/phase-a/runtime-guidance-tests.log'
```

**验收标准**：

- focused tests 全绿。
- 现有 document / EditTask / final-draft tests 不回归。
- `summary.json` 写入 `runtimeGuidanceReady: true`。

**回滚**：`git diff -- src/services/agentDialogueRuntime.ts src/services/agentOrchestrator.ts` 反向应用。

**停止条件**：类型校验失败；runtime tests 红；新增可选字段造成既有测试回归。

### Step 3（Phase A3）：compose 路径接入统一执行底座

**目的**：消除有 SKILL 与无 SKILL 的双执行底座，让 compose 路径消费 active executionPlan 并进入统一 runtime。

**打算修改**：

| 文件 | 位置 | 修改内容 |
|---|---|---|
| `src/components/common/OutlineWorkspace.vue` | `askAi()` 约 `:4013`，`askPlainAi()` 约 `:4483` | compose 路径调用统一入口，传入 active plan、pending operation、editTaskWorkflow、guidance |
| `src/components/chat/ChatPanel.vue` | `runHomeCoCreationSkills()` 约 `:2028`，direct runtime 约 `:3270` | 首页 compose 同步接入同一契约 |
| `src/services/workspaceSkillEngine.ts` | compose 分支 | 只组装 guidance / prompt，不再独立执行 |

**执行步骤**：

1. 新增统一入口 `executeWorkspaceDialogueTurn()`：输入 requestText、adapter、routing、guidance。
2. `askAi()` compose 分支先调用 `buildWorkspaceSkillGuidance()`，再调用统一入口。
3. 统一入口读取或创建 `LongDocumentExecutionPlan`，向 runtime 传 `document.executionPlan`、`editTaskWorkflow`、工具面、`skillGuidance`。
4. compose 路径发同源事件：`long-document-policy`、`execution-mode-selected`、`edit-task-batch-planned`、`skill-guidance-injected`。
5. 事件回调与统一入口使用同一 turnId。
6. 首页同步实施，不形成第二套契约。

**验收**：

- compose 与 direct 的 trace 中出现同一 operation、mode、工具面、批次结构。
- 有 SKILL 的 Turn3 不再停在 pending 预览，真实进入 EditTask 批次写入。
- compose 路径不再出现“工具面有 editor.write 但执行循环无长文档事件”的矛盾。
- 首页与大纲事件契约一致。

**回滚**：单入口切换可独立 revert。顺序：先 `ChatPanel.vue`，再 `OutlineWorkspace.vue`，最后 `workspaceSkillEngine.ts`。guidance 组装纯函数可保留用于诊断。

**停止条件**：统一入口未接 runtime；任一入口 mode 事件缺失；首页与大纲事件契约不同；既有 direct / EditTask / final-draft tests 回归。

### Step 4（Phase B）：`skillExecutionContract` 执行契约

**目的**：授权后必须执行，防止 SKILL 提示词把应用状态机改成“先预览等确认”。

**打算修改**：

| 文件 | 修改内容 |
|---|---|
| `src/services/workspaceSkillEngine.ts` | 新增 `skillExecutionContract` 类型与构建函数 |
| `src/services/agentDialogueRuntime.ts` | 组装最终 prompt 时注入 contract |
| `src/services/agentOrchestrator.ts` | 输出违约诊断事件，不执行第二状态机 |

**契约内容**：

1. `authorized-execution` 状态必须调用工具执行。
2. 禁止输出 `status: pending` 代替执行。
3. pending 只允许出现在真实歧义、缺目标、多方案冲突，且必须给出 pending reason。

**执行步骤**：

1. 应用层在 prompt 组装时注入契约，优先级高于 SKILL template 通用规则。
2. runtime / orchestrator 检测授权状态下仍输出 pending 时：记录 `skill-execution-contract-violation`；不记为成功；按策略重试或转 EditTask。
3. 重试不得放宽写权限，不新增确认弹层。

**验收**：

- 授权状态下 pending 被识别为违约，不进入成功终态。
- 无 SKILL 路径不受影响。
- `summary.json` 写入 `skillExecutionContractReady: true`。

**回滚**：删除 contract 类型、构建函数和 runtime 注入点，恢复原 prompt 组装。

**诚实边界**：外部 SKILL 若不遵守应用契约，模型仍可能偏离；应用层只能通过违约事件、trace 判别与兜底执行，不能强制模型行为。这是行为约束，不是硬权限边界。

**停止条件**：契约注入导致无 SKILL 路径回归；pending 违约检测误伤合法等待确认；runtime / orchestrator tests 红。

### Step 5（Phase C）：路径感知 guidance 证据

**目的**：修正验证契约错位，不放宽执行结果断言。

**打算修改**：

| 文件 | 位置 | 修改内容 |
|---|---|---|
| `src/services/workspaceSkillEngine.ts` | compose 分支 | 发出 `skill-guidance-injected`：skillIds、guidanceChars、truncated、promptSource |
| `src/services/finalDraftRunner.ts` | 约 `:193-206` | 保留 `final-draft-skill-guidance`，强制绑定当前 turnId |
| `src/stores/runTrace.ts` | 导出 | 增加导出字段 `turnBindingCoverage` |
| `scripts/verify-long-document-operation-phase7-electron.mjs` | 约 `:914-922`、`:1054` | 改为路径感知断言 |

**执行步骤**：

1. compose 路径新增 `skill-guidance-injected` 事件。
2. final-draft runner 强制 turnId 绑定。
3. 验证脚本按 mode / path 选择证据事件：compose case 用 `skill-guidance-injected`；final-draft case 用 `final-draft-skill-guidance`。
4. 四 case 断言无 SKILL `guidancePresent: false`，有 SKILL `guidancePresent: true`。

**验收**：

- 四 case 的 SKILL 生效证据均来自正确路径。
- 执行结果断言完全一致，不因加载 SKILL 放宽。
- 所有 guidance 事件可按 turnId 归因。

**回滚**：删除新增事件字段与脚本路径感知分支，恢复原断言。

**停止条件**：验证器无法区分 compose 与 final-draft 证据路径；执行结果断言被放宽；turnId 归因失败。

### Step 6（Phase D）：turnId 绑定修复

**目的**：让每个关键事件都能归属到正确 turn，消除 `finishTurn()` 过早清空导致的 `turnId: null`。

**真实根因**：`runTrace.finishTurn()` 在 `runTrace.ts:1030` 立即清空 `currentTurnId`。异步回调事件在 turn 完成后落 trace，默认绑定失效。

**打算修改**：

| 文件 | 位置 | 修改内容 |
|---|---|---|
| `src/components/common/OutlineWorkspace.vue` | `askAi()`、`askPlainAi()`、trace 回调 | 回调创建时显式捕获并携带 `outlineRunTurnId` |
| `src/components/chat/ChatPanel.vue` | `runHomeCoCreationSkills()`、trace 回调 | 回调创建时显式捕获并携带 `homeRunTurnId` |
| `src/stores/runTrace.ts` | `finishTurn()`、导出 | 延迟清理 currentTurnId；新增 `turnBindingCoverage` |

**执行步骤**：

1. 发送入口在 `startTurn()` 后保存 turnId 到局部变量，闭包全程传递。
2. 所有异步回调显式绑定该 turnId：prompt-built、tool-call、physical-call、api-success、api-failed、state-transition、turn-finished、skill-guidance-injected、long-document-policy、execution-mode-selected、edit-task-batch-planned。
3. `finishTurn()` 标记 turn 结束，但不立即清空 `currentTurnId`，直到本轮 API call 与事件闭合。
4. 新增 `turnBindingCoverage`，统计每类事件 `bound / total`。
5. schema 11 升 12；旧 trace 只读兼容，不回写旧数据。
6. runTrace tests 补绑定率与生命周期断言。

**验收**：

- Phase 7 四 case 关键事件 turnId 绑定率 100%。
- failure.json 不再出现大范围 `turnId: null`。
- 每轮 trace 能解释路由、提示词、物理 call、工具、终态完整链路。

**回滚**：恢复 `finishTurn()` 原生命周期，删除 `turnBindingCoverage`。组件回调显式绑定保留，因为它不引入新机制，只消除默认绑定时序歧义。

**停止条件**：绑定率低于 100%；延迟清理导致事件误绑到下一轮；schema 升版破坏旧 trace 只读兼容。

### Step 7（Phase E）：真实验证矩阵

**目的**：在真实 Electron + 真实 API 下复刻用户路径，证明统一底座成立。

**四 case**：

| Case | 工作台 | SKILL |
|---|---|---|
| outline-no-skill | 大纲 | 无 |
| outline-with-skill | 大纲 | L1-B |
| home-no-skill | 首页 | 无 |
| home-with-skill | 首页 | L1-B |

**五模式**：

| 模式 | 内容 |
|---|---|
| targeted_edit | direct 工具循环 |
| deduplicate | EditTask 多批 delete |
| normalize | EditTask 多批 replace_match / rewrite |
| restructure | EditTask 单条 reorder_sections |
| rewrite_segments | final-draft |

**执行命令模板**：

```powershell
$key = ((Get-Content -LiteralPath '_data/long-document-restructure-phase6-profile/documents-data/wa_providers.json' -Raw | ConvertFrom-Json).providers | Where-Object { $_.id -eq 'long-document-phase6-provider' }).apiKey
$env:SHENYI_LIVE_API_KEY = $key
$env:SHENYI_PHASE7_CASES = 'outline-with-skill'
New-Item -ItemType Directory -Force -Path '.phase7-runtime'
node scripts/verify-long-document-operation-phase7-electron.mjs 2>&1 | Tee-Object -FilePath '.phase7-runtime/outline-with-skill-r1.log'
```

**每个 case 必须断言**：

- mode 正确、actualToolSurface 正确、guidance 证据正确。
- editor.write 或 final-draft 写回成功。
- 内容不变量通过。
- turnId 绑定率 100%。
- 无 stall / dead。

**失败产物**：断言信息、已完成 turn、事件链、绝对时间戳、PID、截图、最后 12 条事件、`turnBindingCoverage`、诊断日志。

**停止条件**：任一 case 失败即停，不得封装、不得升版本，必须先定位断点层：计划、授权、工具、批次、事件、绑定。

### Step 8：全链路验收与收尾

1. 有 SKILL 与无 SKILL 在四 case、五模式下的最终编辑器内容一致。
2. 每个 Phase 都有独立目录证据。
3. 执行 G0.5 回头看：原始目标对账、逐行 diff 审查、生产入口与旁路盘点、生产与验证器双向扫描、日志与测试证据核对。
4. 新旧并存清零：

```powershell
rg "runWorkspaceSkills\(" src
rg "final-draft-skill-guidance" src scripts
rg "skill-guidance-injected" src scripts
rg "turnBindingCoverage" src scripts
```

预期：

- `runWorkspaceSkills()` 只剩 guidance 组装调用，不再有独立执行循环。
- `final-draft-skill-guidance` 只出现在 final-draft runner、其测试与验证器 final-draft 分支。
- `skill-guidance-injected` 只出现在 compose 路径、runtime 透传、测试与验证器 compose 分支。
- `turnBindingCoverage` 覆盖导出、诊断与验证器。

5. 更新 DEV_LOG、经验文件、SKILL handoff 文档。
6. 只有 Step 7 全绿后才允许升版本、封装。

## 9. 影响圈

### 打算修改

- `src/services/workspaceSkillEngine.ts`
- `src/services/agentDialogueRuntime.ts`
- `src/services/agentOrchestrator.ts`
- `src/services/finalDraftRunner.ts`
- `src/components/common/OutlineWorkspace.vue`
- `src/components/chat/ChatPanel.vue`
- `src/stores/runTrace.ts`
- 对应 `.spec.ts` 文件
- `scripts/verify-long-document-operation-phase7-electron.mjs`
- DEV_LOG、经验文件、SKILL handoff 文档

### 可能碰到但不改语义

- `editorTools.ts`：继续消费现有 EditTask 命令与不变量。
- `editTaskService.ts`：不改状态机。
- `longDocumentExecutionPlanner.ts`：只消费计划，不改变模式矩阵。
- folder package 协议：不增加执行权。

### 不碰

- 用户桌面测试文档。
- provider JSON 中的 API key 内容。
- 与本目标无关的 Phase 1-6 改动。

## 10. 风险与对策

| 风险 | 对策 |
|---|---|
| compose 改统一入口范围偏大，首页与大纲分叉 | 双入口共用同一 runtime 入口与事件契约；先大纲后首页，逐入口验收 |
| SKILL 模板继续输出 pending | 应用契约优先 + `skill-execution-contract-violation` 检测 + pending 不记成功 |
| SKILL guidance 过长挤压执行 prompt | 保留 8000 字符截断，记录 `skill-guidance-truncated`；执行契约放在截断区外 |
| turnId 修复造成误绑 | 回调创建时显式捕获 turnId；`finishTurn()` 延迟清理；`turnBindingCoverage` 强制 100% |
| guidance 事件修正被误解为放宽验证 | 只改路径证据，不放松执行结果断言 |
| Phase 7 脚本再次失败 | 先判契约错位与产品缺陷，禁止先放宽脚本；脚本自身改动必须完整重跑 |
| 大量 Phase 1-6 未提交改动 | Step 0 先封存基线，不回滚、不误归属 |

## 11. 验证门

按顺序执行，前一项未过不得进入后一项：

1. `npm run test:services`
2. `npm run type-check`
3. `npm run build:vue`
4. `npm run verify:production-wiring`
5. Phase 7 四 case 真实 Electron + 真实 API 复刻
6. 每执行模式补一轮真实 UI 长文档请求
7. 回头看与新旧并存清零扫描
8. 全部通过后才允许升版本、封装、更新 DEV_LOG 与经验文件

## 12. 成熟度评估（G0.6）

| 层 | 结论 | 断点 |
|---|---|---|
| 事实基础 | 成熟 | compose 路径、runTrace 绑定机制、failure.json、测试文档、SKILL 包、live provider 均已核实 |
| 方案层 | 成熟 | 目标、范围、阶段、验收、回滚、停止条件完整 |
| 执行器 / 工具层 | 成熟待接线 | direct、EditTask、final-draft 均存在；缺 compose 消费 |
| 实现接线 | 未开始 | 等待用户放行 |
| 验证标准 | 成熟待执行 | 真实 Electron、真实 API、路径感知断言、绑定率 100% 已定义 |

整体结论：**方案成熟，执行未开始**。G0.6 断点不在设计，而在等待放行。放行后不允许跳步骤、跳 Phase、跳验证或提前封装。

## 13. 需要用户确认的点

1. **执行矩阵**：有 SKILL / 无 SKILL 的执行结果断言完全一致，SKILL 只改提示词与答复风格。
2. **SKILL 模板整改**：L1-B 的“修改先预览”模板改为“授权后必须执行”，由 SKILL 层同步整改；应用侧先加契约兜底。
3. **验证断言修正**：compose 路径的 SKILL 生效证据改为 `skill-guidance-injected`；执行结果断言不放宽。
4. **实施顺序**：Step 0 -> Phase A -> B -> C -> D -> E -> Step 8。

## 14. 修复后必须能回答的问题

1. 有 SKILL 时为什么 Turn3 一定会进入 EditTask，而不是停在预览。
2. SKILL guidance 注入了哪些内容，在哪一轮、哪个 prompt、哪个 turn 上生效。
3. 每个 tool call、物理请求、API call、状态转移分别属于哪一轮。
4. 无 SKILL 与有 SKILL 的最终编辑器内容差异为什么为零。
5. 如果失败，失败发生在计划、授权、工具、批次、事件、绑定哪一层。
