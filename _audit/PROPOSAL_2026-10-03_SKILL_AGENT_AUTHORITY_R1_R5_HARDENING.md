# SKILL/Agent 权限单源化 R1-R5 加固落地方案

> 状态：已确认并执行完成（2026-10-04）。R1-R4 已落地并验证；R5 按方案完成设计门禁登记，未实现确认 UI。
> 版本基线：3.73.0；目标版本：3.74.0。
> 成熟度：**成熟，可执行**（R1-R4 进入本轮实现；R5 是未来跨轮确认的设计门禁，本轮只登记，不写执行代码）。
> 硬目标：SKILL/Agent 只提供领域能力；执行权限永远由“意图 + 操作类型 + 执行计划模式”三元组单源决定；权限决策从入口到 trace 全链路可观测、可回放、可审计。
> 依据：`RESEARCH_2026-10-03_SKILL_AGENT_AUTHORITY_COMMUNITY_VALIDATION.md`（8 个真实开源项目源码证据）+ 经验文件 v7 G0.5/G0.6/G0.7/G0.9/G0.10/G1.8/G1.10/G1.11/G2.13。

## 1. 目标与不做项

本轮解决四个实际问题：

1. **R1 授权观测断链**：`DialogueWriteAuthorization` 已含三元组，但 4 个调用点只传 `writeAuthorization?.source` 字符串，trace 无法回答“这轮到底授了什么权、依据什么”。升级为结构化 `permissionDecision` 并全链路落 trace。
2. **R2 工具静态防御缺层**：工具只有 `read/write` 二元。补 `defaultToolPolicy` 元数据：读取默认免许可、写入默认需许可、外部/未声明工具默认 disabled。
3. **R3 SKILL 工具契约固化**：当前 SKILL 包的 `tools` / `writeAuthorization` 会被剥离，但缺少显式诊断与契约测试。本轮把它固化为硬契约：SKILL 只能声明，永不注入执行权；声明被忽略必须记录。
4. **R4 写入风险标签**：给工具定义与工具调用补 `riskLevel` 观测字段，只用于诊断统计，不新增确认层。

本轮不做：Roo 模式切换审批、Cline/ADK 强制确认层、OpenHands SKILL 直接携带工具（社区调研已判定不采纳）；R5 只登记设计门禁，不实现跨轮确认。

## 2. 现状对账（已核实源码证据）

| 事实 | 位置 |
|---|---|
| 结构化授权已存在，含 source/intent/operation/mode/reason | `src/services/dialogueToolSurface.ts:58-66` |
| 权限单源判定已存在且 fail-closed | `src/services/dialogueToolSurface.ts:107-122`、`150-163` |
| `toolPolicy.writeAuthorization` 仍是字符串标记 | `src/services/aiService.ts:127-136` |
| `editorTools` 写入链仍消费字符串标记 | `src/services/editorTools.ts:166`、`438`、`835`、`929` |
| 4 个 UI 调用点把结构化授权降级为 source 字符串 | `src/components/common/OutlineWorkspace.vue:4947`、`5002`、`5293`；`src/components/chat/ChatPanel.vue:3423` 附近调用链 |
| runTrace schema v11 尚无 permissionDecision | `src/stores/runTrace.ts:648`、`99-116` |
| 工具定义只有 read/write policy | `src/services/editorTools.ts:443-1165` |
| SKILL 包剥离 tools/writeAuthorization 但缺显式诊断契约 | 已由 `src/services/skillPackageManager.spec.ts` 固化契约测试（执行协议字段全部拒绝） |

结论：权限语义本体已单源化，缺口集中在“决策投影、静态元数据、契约固化、观测落盘”四层。这属于加固，不是重构。

## 3. 正推 / 反推（G0.7）

### 正推：完成后的用户可见链路

1. 用户在首页或大纲工作台发任意指令，无论是否加载 SKILL。
2. 入口计算三元组授权，产出结构化 `permissionDecision`。
3. 工具面、服务层、editor.write 全部消费同一 decision；字符串标记不再作为独立语义存在。
4. runTrace 的 turn / apiCall / toolCall 层都能看到 `permissionDecision` 与工具 `defaultToolPolicy` / `riskLevel`。
5. SKILL 若声明工具或授权，包加载时被忽略并记录诊断；trace 显示声明数与启用数（启用恒为 0）。
6. SKILL 制作方看运行记录即可回答：“这轮为什么只读/可写、依据哪个 intent 和 operation、调了哪个风险级别的工具”。

### 反推：跳过任一层会留下的洞

| 缺口 | 后果 |
|---|---|
| 只加 trace 字段，不改 4 个调用点 | 字段看似存在但仍是 source 字符串投影，三元组继续丢失 |
| 只改 UI，不改 aiService/editorTools 类型 | 服务层与写入链继续消费旧标记，形成新旧并存（违反 G0.10） |
| 只改 runtime，不改 schemaVersion 与导出 | 旧 trace 读取器和 diff 面板读不到新字段，观测层断裂（违反 G1.8） |
| 只加 defaultToolPolicy 元数据，不在授权层校验 | 变成纯注释性字段，外部工具仍可能凭 read 标记混入 |
| 不固化 R3 契约测试 | 未来 SKILL 生态一旦携带工具，权限混源会原样复发 |
| 不做 Electron 双态实测 | 无法证明“有 SKILL 与无 SKILL 权限完全一致”（违反 G2.13） |

## 4. 爆炸半径矩阵（G0.9）

| 面 | 打算改 | 风险控制 |
|---|---|---|
| 权限单源 | `dialogueToolSurface.ts` 输出 permissionDecision | 现有三元组判定函数不变，只扩展返回值 |
| 服务层 | `aiService.ts` toolPolicy 类型与守卫诊断 | 语义不变；服务层复核继续独立执行 |
| 写入执行 | `editorTools.ts` 消费结构化 decision | 字符串标记仅在 trace 兼容读取层保留 |
| 双入口 | `OutlineWorkspace.vue`、`ChatPanel.vue` 4 处调用点 | 只替换投影对象，不触碰授权生成条件 |
| SKILL 引擎 | `workspaceSkillEngine.ts` 透传 decision | 授权来源不变，SKILL 仍无法覆盖 |
| 观测层 | `runTrace.ts` schema v11→v12、导出、diff、验证器白名单 | 旧 trace 兼容读取，新字段可选 |
| 包协议 | `skillPackageProtocol.json`、`skillPackageManager` 诊断 | 只加忽略诊断，不改解析主体 |
| 测试 | 相关 spec 契约更新 | 旧字符串语义断言同批替换，不留双语义 |
| 不碰 | 路由阈值、语料、EditTask 状态机、final-draft、上下文压缩 | 与本轮目标无关 |

## 5. 任务分解

### Task 1：权限决策对象单源（R1 核心）

文件：`dialogueToolSurface.ts`、`aiService.ts`

1. 新增 `DialoguePermissionDecision`：
   `source: 'dialogue-intent' | 'long-document-workflow'`、`decision: 'read-only' | 'write-authorized'`、`intent`、`operation`、`mode`、`reason`。
2. `isWorkflowWriteAuthorized()` 升级为返回 decision + reason；`authorizeDialogueTools()` 返回 `permissionDecision`。
3. `CallAiParams['toolPolicy']` 新增 `permissionDecision?: DialoguePermissionDecision`；`onPermissionDenied` 事件携带 decision 与 reason。
4. `toolPolicy.writeAuthorization` 字符串标记从执行语义中退役：editorTools 的 workflow 标记由 `decision.source === 'long-document-workflow' && decision.decision === 'write-authorized'` 派生。
5. 验收：类型检查通过；`rg "writeAuthorization\?\.\s*source"` 在执行层命中 0。

### Task 2：双入口与服务层接线

文件：`OutlineWorkspace.vue`、`ChatPanel.vue`、`workspaceSkillEngine.ts`

1. 4 个调用点改为透传完整 `permissionDecision`，禁止再投影 source 字符串。
2. SKILL adapter 继续只透传 decision；SKILL 包无法提供、覆盖或增强。
3. 验收：双入口 discuss 只读、edit/generate 可写行为与 3.73.0 完全一致。

### Task 3：工具默认策略元数据（R2）

文件：`editorTools.ts`、`dialogueToolSurface.ts`

1. `AgentToolDefinition` 增加 `defaultToolPolicy: 'allowedWithoutPermission' | 'allowedWithPermission' | 'disabled'`。
2. 内置读取工具标注 `allowedWithoutPermission`；`editor.write` 标注 `allowedWithPermission`；外部注入且未显式声明策略的工具默认 `disabled`。
3. `authorizeDialogueTools()` 增加静态校验：`disabled` 不入面；write 工具必须是 `allowedWithPermission`；read 工具不得标 `allowedWithPermission`；违规工具被剔除并产生 `tool_policy_mismatch` 诊断。
4. 验收：外部工具注入测试证明默认 disabled，无法凭 read 标记混入。

### Task 4：SKILL 工具契约固化（R3）

文件：`skillPackageManager.ts`、`skillPackageProtocol.json`、`workspaceSkillEngine.ts`

1. SKILL 包内 `tools` / `writeAuthorization` 字段保持剥离，并在包加载诊断中显式记录“声明被忽略，数量 N，启用 0”。
2. trace 记录 `skillToolDeclarationsIgnored`，防止未来静默变化。
3. 契约测试：SKILL 声明工具 + 声明授权时，工具面不含该工具，写入权仍由三元组决定。
4. 验收：注入式 SKILL 工具在授权层命中 0。

### Task 5：风险标签（R4）

文件：`editorTools.ts`、`dialogueToolSurface.ts`

1. 工具定义增加 `riskLevel: 'low' | 'medium' | 'high'`：读取 low；`editor.write` 常规批 medium；结构级 reorder / 删除批 high。
2. 风险标签只进 trace 与 diff，不参与授权判断，不新增确认交互。
3. 验收：trace 中每次写入工具调用都有 riskLevel。

### Task 6：runTrace schema v12 与导出链

文件：`runTrace.ts`、`runTraceDiff.ts`、导出通道、验证器白名单

1. `RunTraceApiCall` / `RunTraceTurn` 增加 `permissionDecision`；工具定义与工具调用增加 `defaultToolPolicy` / `riskLevel`。
2. `RUN_TRACE_SCHEMA_VERSION` 11→12；旧 trace 读取保持兼容，新字段全部可选。
3. runTraceDiff 增加 permissionDecision 差异项；导出通道与验证脚本白名单同步。
4. 验收：新旧 trace 都能读取；diff 面板能显示两轮权限决策差异。

### Task 7：测试契约重建

1. 更新 `dialogueToolSurface.spec.ts`：断言 permissionDecision 完整三元组与 reason。
2. 更新 `aiService.spec.ts`：服务层拒绝事件携带 decision；旧字符串授权断言替换。
3. 新增 `editorTools` 契约：外部工具默认 disabled；defaultToolPolicy 与 policy 不一致被剔除。
4. 新增 SKILL 包契约：声明工具/授权被忽略且可观测。
5. 回归现有写入链路测试，确保 edit/generate 权限行为不变。

### Task 8：trace 回放回归

1. 用 `run-trace-outline-20261003-131806-deep` 回放旧链路：断言旧 trace 无 permissionDecision（历史事实）。
2. 同请求走新链路：断言 decision、intent、operation、mode、reason 全部落盘。
3. 用 `run-trace-outline-20260926-212218-deep` 抽样回放，确认新 schema 读取旧 trace 不报错。

### Task 9：Electron 级真实 UI 实测

脚本：扩展 `scripts/verify-skill-agent-authority-electron.mjs`，复用 3.73.0 的真实启动、CDP、真实文档、真实 SKILL 下拉选择模式；禁止注入式冒充（G0.11）。

1. 双入口（首页 + 大纲工作台）。
2. 双态（真实 UI 选择 SKILL / 不选 SKILL）各跑 discuss、edit 两类指令。
3. 断言：两态 permissionDecision 完全一致，唯一差异是 guidance；写入轮内容 hash 变化；只读轮无写入事件。
4. 断言 trace 中 `skillToolDeclarationsIgnored` 存在（当测试 SKILL 包声明工具时）。
5. 输出目录：`_audit/verification-skill-agent-authority-v2/`，每个 case 落 result.json、trace 摘要、截图。

### Task 10：R5 设计门禁登记

1. 在本方案与经验文件登记：未来任何跨轮确认必须绑定 `toolCallId` 或批次 ID、工具名、参数 canonical hash；三者任一不一致即拒绝。
2. 本轮不实现确认 UI，不加确认层。

> **R5 执行登记（2026-10-04）**：本设计门禁已登记为本轮经验文件的强制约束。未来若产品需要跨轮确认，确认请求必须携带 `toolCallId` 或批次 ID、工具名、参数 canonical hash 三元绑定；任一不一致必须拒绝执行，不得回退为“按语义确认”。本轮保持无确认层，权限仍由意图 + 操作类型 + 执行计划单源决定。

### Task 11：收尾与交付

1. 回头看：`rg` 扫描旧字符串授权语义、`writeAuthorization?.source`、`defaultToolPolicy` 缺失工具、新旧 schema 并存。
2. 更新 DEV_LOG、经验文件 v7 相关门禁、DEV_LOG_MASTER_INDEX。
3. 版本 3.73.0→3.74.0，封装前跑完整验证门。

## 6. 验证命令

```powershell
npx vitest run src/services/dialogueToolSurface.spec.ts src/services/aiService.spec.ts src/services/editorTools.spec.ts src/services/skillPackageManager.spec.ts src/services/runTraceDiff.spec.ts
npm run test:services
npm run type-check
npm run build:vue
node scripts/verify-skill-agent-authority-electron.mjs
```

## 7. 停止条件

任一命中立即停止并回报，不封装：

1. 合法 edit/generate 写入回归失败。
2. 双入口任一 discuss 轮出现写入工具或写入事件。
3. 有 SKILL 与无 SKILL 的 permissionDecision 不一致。
4. 旧字符串授权语义在执行层仍有独立命中。
5. runTrace v12 无法读取旧 trace。
6. Electron 实测未真实通过 SKILL 下拉选择（禁止注入冒充）。

## 8. 成熟度评估（G0.6）

| 层 | 结论 | 证据 |
|---|---|---|
| 执行器/工具层 | 成熟 | 修改点均有 file:line；工具面、服务层、editorTools 三层已对账 |
| 应用方案/交互闭环 | 成熟 | 权限语义不变；只增强观测与防御，不加确认流程 |
| 实现接线 | 成熟 | 4 个 UI 调用点、aiService、editorTools、runTrace、SKILL 包协议均已列文件 |
| 验证标准 | 成熟 | 单测 + trace 回放 + 新旧 schema 兼容 + Electron 双入口双态真实 UI + 回头看扫描 |

边界说明：R5 是未来跨轮确认的设计门禁，本轮不进入写码阶段，不因它降低整体成熟度评级。
