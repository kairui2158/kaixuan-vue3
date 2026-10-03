# SKILL/Agent 权限单源化社区验证报告

日期：2026-10-03  
对象版本：3.73.0  
结论：**方向与社区主流一致；当前权限模型无方向性错误。剩余差距集中在观测性与防御纵深，均登记为后续增强项，不在本轮修改生产代码。**

## 1. 调研方法

- 调研对象：OpenAI Agents Python、OpenAI Codex、Roo Code、Continue.dev、Aider、Cline、OpenHands、Google ADK，共 8 个真实开源项目。
- 证据标准：只接受真实源码文件与精确 commit；README 不作为证据。
- 抓取方式：GitHub Contents API 拉取原始源码，`git ls-remote` 核对 HEAD commit。
- 源码缓存：`_audit/community-evidence/skill-agent-authority-2026-10-03/`，共 19 个文件。缓存保留完整源码文件，报告中的行号可直接复核。
- 本地对账：对照 3.73.0 的 `dialogueToolSurface.ts`、`aiService.ts`、`workspaceSkillEngine.ts`、双入口组件与 Electron 验证产物。

## 2. 核心结论

8 个项目没有例外，全部满足以下四条中的至少三条：

1. 提示词与权限分离：能力注入只改变模型理解，不改变执行权。
2. 工具面由运行时单源决定：工具可用性在 turn / mode / tool policy 层计算。
3. 写入默认更严格：写入类工具默认需要许可或确认，读取类工具默认宽松。
4. 确认与拒绝语义独立于模型自述：审批失败按拒绝处理，模型说“可以”不构成授权。

我们的 3.73.0 设计与这四条完全同向。特别是 Codex 对 skills 的处理方式与我们相同：skills 被转换为 `ContextualUserFragment` 注入上下文，而工具可用性仍由 `apps_enabled()` 与 `AppToolPolicyEvaluator` 决定。这直接验证了我们的原则：**SKILL 提供领域能力，不提供执行权限。**

## 3. 社区证据

### 3.1 OpenAI Agents Python

- 仓库：`openai/openai-agents-python`
- commit：`81f0ccf20c6e24063b9da36fa37f2bdb6a43d8d3`
- 源码：`agents-tool-guardrails.py`
- 证据：
  - `agents-tool-guardrails.py:40-56`：`allow / reject_content / raise_exception` 三态。
  - `agents-tool-guardrails.py:69-77`：guardrail 默认 `allow`，但拒绝与中断是运行时行为。
  - `agents-tool-guardrails.py:79-117`：`allow()`、`reject_content()`、`raise_exception()` 工厂。
  - `agents-tool-guardrails.py:151-177`：输入 guardrail 在工具执行前运行。
  - `agents-tool-guardrails.py:180-205`：输出 guardrail 在工具执行后运行。
- 启发：工具输入和输出两侧都可以有 guardrail。我们目前主要在输入侧拦写，后续若引入写入审计，可增加输出侧结构化检查。

### 3.2 OpenAI Codex

- 仓库：`openai/codex`
- commit：`b741e480e203f037ca726bc2a76d99a8e8668e66`
- 源码：`codex-turn.rs`、`codex-agents-md.rs`
- 证据：
  - `codex-turn.rs:1054-1074`：工具可用性由 `apps_enabled()` 与 `AppToolPolicyEvaluator` 决定。
  - `codex-turn.rs:1114-1117`：skills 转换为 `ContextualUserFragment` 注入上下文。
  - `codex-turn.rs:1288-1296`：`approval_policy`、sandbox、collaboration mode 来自 turn context。
  - `codex-agents-md.rs:56-64`：AGENTS.md 只负责加载和组合指令。
- 启发：Codex 把“能力注入”和“工具策略”放在两个独立层面。我们的 SKILL guidance 与三元组授权正是同一分层。

### 3.3 Roo Code

- 仓库：`RooCodeInc/Roo-Code`
- commit：`b867ec9145750d0ae1ff7f02d35406e9bf2a0b16`
- 源码：`roo-type-mode.ts`、`roo-switch-mode-tool.ts`
- 证据：
  - `roo-type-mode.ts:96-105`：mode 由 `roleDefinition`、`customInstructions`、`groups` 组成；提示词与工具组分离。
  - `roo-type-mode.ts:170-179`：architect 模式只有 `read + md edit + mcp`。
  - `roo-type-mode.ts:221-228` 附近的 ask 模式：`groups: ["read", "mcp"]`，且要求不要在用户未明确请求时切换到实现。
  - `roo-switch-mode-tool.ts:51-59`：切换模式也要走 `askApproval`。
- 启发：Roo 的“模式决定工具组”与我们“意图 + 操作 + 计划模式决定写入权”同构。模式切换审批对我们当前不适用，因为我们没有用户显式切换执行模式的 UI 语义。

### 3.4 Continue.dev

- 仓库：`continuedev/continue`
- commit：`5522c6f44ca0ac3528b37244818fbfa39b5af470`
- 源码：`continue-editFile.ts`、`continue-readFile.ts`、`continue-fileAccess.ts`、`continue-createRuleBlock.ts`
- 证据：
  - `continue-editFile.ts:23,44`：写入工具 `readonly: false`，默认 `allowedWithPermission`。
  - `continue-readFile.ts:13,36`：读取工具 `readonly: true`，默认 `allowedWithoutPermission`。
  - `continue-fileAccess.ts:14-25`：disabled 保持 disabled，工作区外升级为需要许可。
  - `continue-createRuleBlock.ts:24,62`：能力注入类工具默认 disabled。
- 启发：这是对我们最有直接借鉴价值的项目。建议后续把工具定义层的 `read/write` 扩展为 `defaultToolPolicy`，形成更强的静态防御。

### 3.5 Aider

- 仓库：`Aider-AI/aider`
- commit：`5dc9490bb35f9729ef2c95d00a19ccd30c26339c`
- 源码：`aider-ask-coder.py`
- 证据：
  - `aider-ask-coder.py:5-9`：`AskCoder` 明确“只问答，不做修改”，`edit_format = "ask"`。
- 启发：ask 与 edit 是两个显式模式。我们的 `discuss/edit` 分离与之一致，且我们比 Aider 多了执行计划层，能把长文档重排路由到分批任务。

### 3.6 Cline

- 仓库：`cline/cline`
- commit：`39ff2359f7e08231281539696e48a166ce49270c`
- 源码：`cline-approvals.ts`、`cline-utils-approval.ts`
- 证据：
  - `cline-approvals.ts:39-51`：无审批器时默认拒绝。
  - `cline-utils-approval.ts:69-77`：非 TTY 环境直接拒绝。
  - `cline-utils-approval.ts:84-99`：只有显式 `y/yes` 才通过。
- 启发：fail-closed 是硬规则。我们的写入授权当前也是 fail-closed：缺意图、非 edit/generate、讨论操作都拒绝。这是正确方向。

### 3.7 OpenHands

- 仓库：`All-Hands-AI/OpenHands`
- commit：`8b0be7d5181db68be05261dbeafb580f7a5a4140`
- 源码：`openhands-settings.ts`、`openhands-common.ts`、`openhands-skill-enablement.ts`、`openhands-use-conversation-skills.ts`
- 证据：
  - `openhands-settings.ts:88-92`：SkillInfo 有 `allowed_tools` 与 `disable_model_invocation`。
  - `openhands-settings.ts:128-130`：全局 `confirmation_mode` 与 `security_analyzer` 独立存在。
  - `openhands-settings.ts:149-156`：用户/项目 skill 有 deny-list，目录 skill 有 allow-list。
  - `openhands-common.ts:59-75`：`SecurityRisk` 分为 UNKNOWN/LOW/MEDIUM/HIGH。
  - `openhands-skill-enablement.ts:22-49`：目录 allow-list 与用户/项目 deny-list 是两套持久化策略，deny-list 优先。
- 启发：如果未来允许 SKILL 声明工具，应采用 OpenHands 模式：skill 元数据只声明，不等于启用；默认关闭，显式开启才可用。

### 3.8 Google ADK

- 仓库：`google/adk-python`
- commit：`e94c2e726a269e0f04e2e4b202f5c131c80c20de`
- 源码：`adk-tool-confirmation.py`、`adk-confirmation-utils.py`、`adk-flow-confirmation.py`
- 证据：
  - `adk-tool-confirmation.py:28-45`：`ToolConfirmation` 携带 `confirmed` 与 payload。
  - `adk-confirmation-utils.py:25-54`：需要确认的工具先被挂起，未确认则返回错误。
  - `adk-confirmation-utils.py:56-71`：`confirmation.confirmed` 不为 true 时拒绝。
  - `adk-flow-confirmation.py:73-102`：确认必须映射回原始工具调用。
  - `adk-flow-confirmation.py:155-174`：原始调用必须存在于历史且工具已注册。
  - `adk-flow-confirmation.py:176-211`：必须重新判断该工具当前是否真的需要确认，并校验工具名与参数完全一致。
- 启发：ADK 的“历史调用 ID + 工具名 + 参数一致性校验”非常成熟。我们未来做跨轮任务确认时，应吸取这一点：确认对象必须绑定原始调用或批次，不允许只凭一句“确认”放行新的参数。

## 4. 与 3.73.0 的对照

| 社区原则 | 我们当前实现 | 结论 |
|---|---|---|
| 提示词与权限分离 | `workspaceSkillEngine.ts:469-476` 明确执行上下文由应用提供，SKILL 包不能提供 | 一致 |
| 工具面运行时单源 | `dialogueToolSurface.ts:68-74` 结构化授权；`150-163` 三元组校验 | 一致 |
| 服务层二次守卫 | `aiService.ts:560-585` 独立复核 intent，非 edit/generate 拒绝 | 一致 |
| 双入口同一语义 | `ChatPanel.vue:307-322` 与 `OutlineWorkspace.vue:2278-2288` 都按同一三元组生成授权 | 一致 |
| SKILL adapter 不造权 | `workspaceSkillEngine.ts:795-824` 只透传授权并调用单源授权函数 | 一致 |
| 写入工具显式标记 | `editorTools.ts:561-565` `editor.write` 标记 write | 一致 |
| 写入链路携带授权证据 | `editorTools.ts:828-835`、`922-929` 写入时透传授权 | 一致 |
| guidance 可观测 | `agentOrchestrator.ts:354-367` 记录 skillIds、promptSource、guidanceChars、skillGuidancePresent | 一致 |
| 测试契约 | `dialogueToolSurface.spec.ts:78-118` 负向样本；`aiService.spec.ts:3165-3205` 拒绝 workflow marker 覆盖 discuss | 一致 |
| 真实 UI 验证 | `_audit/verification-skill-agent-authority/summary.json`：4 case、8 只读轮、4 写入轮全通过 | 一致 |

## 5. 发现的差距与建议

这些不是当前缺陷，而是下一阶段的增强方向。本轮不改生产代码。

### R1. 授权观测性不足（建议优先）

现状：运行时已经有完整三元组，但部分 `toolPolicy` 只传 `writeAuthorization?.source` 字符串。

- `OutlineWorkspace.vue:4943-4947`
- `OutlineWorkspace.vue:4997-5002`
- `OutlineWorkspace.vue:5289-5293`
- `ChatPanel.vue:3042-3048`

建议：后续把这些调用点的 `toolPolicy.writeAuthorization` 升级为结构化 `permissionDecision = { source, intent, operation, mode, reason }`，trace 全链路保留完整三元组。这能进一步消除“模型说没权限”与“工具面未接线”的判断成本。

### R2. 工具默认策略元数据可扩展

现状：我们有 `policy: 'read' | 'write'`。Continue.dev 还有 `defaultToolPolicy: allowedWithoutPermission / allowedWithPermission / disabled`。

建议：在工具定义层增加默认策略字段，让写入类工具天然标注“需要许可”，读取类工具标注“无需许可”。这与现有三元组不冲突，是静态防御的第二层。

### R3. 未来 SKILL 工具必须默认 disabled

OpenHands 的 skill 元数据有 `allowed_tools` 与 `disable_model_invocation`，Continue 的能力注入类工具默认 disabled。

建议：如果未来允许 SKILL 携带工具，必须遵守：

1. SKILL 只能声明建议工具，不能直接注入执行权。
2. 未显式启用的 SKILL 工具默认 disabled。
3. 启用仍需通过三元组授权，SKILL 声明不能覆盖 intent。

### R4. 安全风险分级可登记为观测增强

OpenHands 有 `SecurityRisk: UNKNOWN/LOW/MEDIUM/HIGH`。我们目前是 read/write 二元。

建议：暂不引入新确认层，避免回到重确认流程；但可以在 trace 里为写入操作增加风险标签，便于诊断与统计。

### R5. ADK 的调用一致性校验值得预留

ADK 在确认工具调用时校验历史 ID、工具名、参数完全一致。我们当前是 API 直写模式，没有用户确认工具调用这一层，因此暂不适用。

建议：如果未来引入跨轮确认，应绑定原始调用或批次 ID，并校验参数一致，避免“确认了旧请求，却放行了新参数”。

## 6. 不采纳项

| 机制 | 来源 | 不采纳原因 |
|---|---|---|
| 模式切换用户审批 | Roo Code | 我们的执行计划 mode 是内部状态，不是用户显式切换模式；引入会破坏当前交互模型 |
| 每次写入前强制确认 | Cline / ADK | 我们已采用 API 直写路线，用户要求写入即执行；再加确认层会回到此前已废弃的重流程 |
| SKILL 直接携带工具 | OpenHands | 当前 SKILL 协议明确只提供领域能力；开放工具会重新引入权限混源风险 |

## 7. 对 3.73.0 的验证结论

1. 方向正确：8 个社区项目均支持“提示词与权限分离”这一核心设计。
2. 无系统性错误：没有发现与我们相反的成熟实践。
3. 当前权限模型可保留：三元组单源、服务层复核、fail-closed 拒绝都与社区一致。
4. 剩余工作是增强而非纠偏：观测性、默认策略元数据、未来 SKILL 工具的 disabled 策略。
5. 本轮不改生产代码、不重新封装，保留 3.73.0 交付状态。
