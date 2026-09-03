# 主页编辑器 SKILL/AGENT 共创能力实现方案

日期：2026-09-03  
状态：待用户审核，未执行任何应用源码改动  
UI 基准：`_audit/UI_DRAFT_HOME_CO_CREATION_CONFIG.md`（V3 定稿图）  
经验基准：`_audit/神意开发经验总结_v2.md`（v2.1）

---

## 1. 目标

把主页编辑器的 API 对话从“普通聊天 + 顺手读取流水线/全局技能”升级为独立的共创工作区：

1. 主页拥有自己的 SKILL、AGENT、串行/并行模式配置，和生成流水线配置彻底切断。
2. 复用大纲工作台已经验证过的 SKILL/AGENT 执行语义：串行传递、并行拼接、逐技能智能体、上下文记忆、断点续跑、输入输出校验。
3. 逻辑共享，不复制代码：抽出共享执行核心，主页和大纲工作台共同调用，后续修复一次生效两处。
4. 保留主页现有的编辑器交互能力：插入、替换、预览、批量编辑、回滚、续生成、取消、重试。

## 2. 当前源码结论

| 现状 | 位置 | 问题 |
|---|---|---|
| 主页聊天读取流水线层级技能 | `src/components/chat/ChatPanel.vue:487-552` | 根据 `activeTab.mode` 读取 `pipelineSkills` 第 2/3/4 项，主页和流水线没有切断 |
| 主页聊天复用全局 enabled 技能 | `src/components/chat/ChatPanel.vue:477-484` | 用户未在主页明确选择的技能也会注入 |
| 主页显示流水线同步信息 | `src/components/chat/ChatPanel.vue:219-259` | `refreshSyncedPipelineInfo()` 读取 `pipelineStore`，与“独立共创配置”冲突 |
| 大纲工作台已有完整执行闭环 | `src/components/common/OutlineWorkspace.vue:1459-1805` | 串行/并行、上下文、校验、断点、逐技能 Agent 已落地，但逻辑留在大组件里 |
| 逐技能 Agent 绑定已有稳定键 | `src/services/skillAgentBinding.ts:3-5` | 键格式是 `step-skillId`，可复用，但主页不能继续用 `pipelineStore` 保存 |
| 断点服务已有通用形状 | `src/services/chainBreakpoint.ts` | 断点结构可复用，但持久化 key 目前挂在流水线 store |
| 上下文服务已支持 scope | `src/services/conversationContextService.ts` | 主页已接入 `workspace: 'main'`，可按 skillId 延续 |

## 3. 总体架构

### 3.1 新增共享执行核心

新增 `src/services/workspaceSkillEngine.ts`（名称可在实现时微调，职责不变）：

```text
workspaceSkillEngine
├── 模板解析：Skill -> WorkspaceSkillTemplate
├── 变量解析：customVars + 工作区上下文
├── 模式执行：chain / compose
├── Agent 解析：逐技能 Agent > 工作区 Agent > 默认 Agent
├── 校验：inputSchema / outputSchema / validationRules / retryPolicy
├── 上下文：conversationContextService 组装与记录
└── 事件回调：onFirstChunk / onStepStart / onStepEnd / onValidationFailed
```

引擎不直接 import 任何组件，不直接读写 Pinia store。所有依赖通过参数适配器传入：

```ts
interface WorkspaceSkillEngineAdapter {
  getProjectId(): string
  getWorkspace(): 'main' | 'outline'
  getAgent(skillId: string): Agent | undefined
  getModel(skillId: string): string
  getTemplates(): WorkspaceSkillTemplate[]
  getSkillAgents(): SkillAgentBindings
  getBaseAgentId(): string
  getMode(): 'chain' | 'compose'
  loadBreakpoint(): Promise<ChainBreakpoint | null>
  saveFailureBreakpoint(bp: ChainBreakpoint): Promise<void>
  clearBreakpoint(): Promise<void>
  buildTemplateContext(): Record<string, unknown>
}
```

这样主页和大纲工作台可以共用执行语义，但保留各自的配置、断点和 UI 状态。

### 3.2 新增主页共创配置 store

新增 `src/stores/coCreation.ts`：

```ts
interface CoCreationConfig {
  agentId: string
  skillIds: string[]
  mode: 'chain' | 'compose'
  skillAgents: Record<string, string> // key: home-${skillId}
  model: string
}
```

存储 key 使用独立域，例如 `wa_co_creation_config`，不读写：

- `pipeline_step_config`
- `pipeline_breakpoint`
- `skillStore.pipelineSkills`
- `pipelineStore.getStepSkills/getStepAgents`

主页的逐技能 Agent 键使用 `home-${skillId}`，避免和大纲工作台的 `0-${skillId}` 混淆。实现时会给 `skillAgentBinding.ts` 增加通用前缀参数，保持现有函数兼容。

### 3.3 主页 UI 按 V3 定稿落地

API 对话框底部新增两行附属配置：

```text
SKILL选择[添加▾]  AGENT[卷纲推演师▾]  模式[串行▾]        [共创]
SKILL显示： (1)卷纲结构解析× (2)卷纲推演补全× ...  +添加
```

同步调整：

1. 移除 `refreshSyncedPipelineInfo()` 及其 UI 展示，主页不再显示“当前同步流水线智能体/技能”。
2. 原头部“智能体/模型”选择移到底部共创配置行，头部只保留标题和必要的会话操作，避免同一配置出现两处入口。
3. 第二行 chip 显示执行顺序；串行模式下每个 chip 内提供该技能的 Agent 选择；并行模式不显示逐技能 Agent，避免语义混乱。
4. chip 使用 `min-width: 0`、`text-overflow: ellipsis`、横向滚动或换行策略，禁止挤压输入框和消息区。
5. 所有颜色、字号、间距只使用 `src/styles/tokens.css`。

## 4. 分阶段执行计划

### P0 影响圈与基线锁定

**内容**

- 用 `rg` 列出 `ChatPanel.vue`、`OutlineWorkspace.vue`、`skillAgentBinding.ts`、`chainBreakpoint.ts` 的全部引用。
- 记录当前主页请求消息结构、上下文 scope、编辑工具注入、续生成快照字段。
- 记录大纲工作台当前串行/并行行为，作为共享引擎抽取后的行为等价基准。
- 生成“本次会改 / 可能被影响”两张清单，超出清单的代码不碰。

**验收**

- [ ] 引用清单和影响圈清单写入开发日志。
- [ ] 当前行为基线有 file:line 证据。
- [ ] 未修改任何源码。

**经验引用**

- §1 M1 影响圈声明。
- §1 M2/M3 禁止整文件重写，diff 逐行可解释。
- §9 “改 A 激活 B”模式防御。

### P1 配置域与类型底座

**内容**

- 新增 `CoCreationConfig` 类型与 `coCreation` store。
- 实现读取、保存、默认值、脏数据兼容。
- `skillAgentBinding.ts` 增加前缀化 key 支持，保持旧 `step-skillId` 行为不变。
- 增加配置服务单测：空配置、旧字段、重复 skillId、非法 mode、Agent 不存在时的行为。

**验收**

- [ ] 配置读写不触碰 `pipelineStore`。
- [ ] 旧绑定键不受影响。
- [ ] 单测覆盖配置归一化。
- [ ] `npm run type-check` 通过。

**经验引用**

- §7 存储纪律：旧配置兼容、项目/工作区隔离。
- §8 规则 15：上下文与绑定键必须稳定。

### P2 抽取共享执行引擎

**内容**

- 从 `OutlineWorkspace.vue` 抽取以下能力到 `workspaceSkillEngine.ts`：
  - 模板归一化与变量解析。
  - compose 拼接与 `mergePromptParts`。
  - chain 上一步输出传递。
  - 输入输出校验与重试次数。
  - Agent 解析优先级。
  - 上下文策略组装。
  - 成功/失败断点创建。
- 引擎只接收 adapter 和回调，不包含 UI 代码。
- 补充引擎单测：单技能、多技能串行、多技能并行、校验失败、断点恢复、Agent 优先级。

**验收**

- [ ] 引擎单测全部通过。
- [ ] 引擎无组件、无 DOM、无直接 store 依赖。
- [ ] 大纲工作台尚未切换，当前行为不变。

**经验引用**

- §1 规则 2：业务状态在 store，组件只做 UI。
- §8 规则 9：失败状态不得伪装成功。
- §8 规则 16：失败、取消、空输出不得伪造 assistant 轮次。

### P3 大纲工作台切换共享引擎

**内容**

- `OutlineWorkspace.vue` 改为调用共享引擎。
- 保留其现有配置来源 `pipelineStore.readStepConfig(0)` 和现有断点 key，第一阶段不迁移存储，只迁移执行逻辑。
- 删除组件内被引擎取代的重复函数，删除前做三面引用闭包。
- 用源 Electron + CDP 回归大纲工作台：并行生成、串行生成、串行失败断点、逐技能 Agent、上下文记录、编辑建议。

**验收**

- [ ] 大纲工作台行为与切换前一致。
- [ ] 串行失败后可从失败 SKILL 恢复。
- [ ] 逐技能 Agent 不因技能顺序调整错位。
- [ ] 诊断日志 source 仍可追踪到 OutlineWorkspace。

**经验引用**

- §4 删除纪律：引用闭包后再删。
- §3 规则 1/2：构建成功不等于功能完成，必须真实操作。
- §9 防无限回滚铁律：只做行为等价迁移，不重做已完成功能。

### P4 主页配置 UI 接入

**内容**

- 按 V3 定稿实现底部两行配置区。
- 接入 `coCreation` store：添加、移除、排序、模式切换、Agent 绑定、模型选择。
- 移除主页对 `pipelineStore` 同步信息的读取和展示。
- 保留现有输入框、发送、取消、重试、续生成按钮布局，不允许配置区遮挡消息区。

**验收**

- [ ] UI 与定稿图一致。
- [ ] 每个选择器和按钮都有真实事件与用户可见反馈。
- [ ] 主页不再读取 `pipelineStore` 的层级 Agent/SKILL。
- [ ] 小视口和长技能名无溢出、无重叠。

**经验引用**

- §5 UI 纪律：tokens、递归溢出扫描、稳定尺寸。
- §8 规则 42：按钮存在、点击、用户可见结果、数据变化四段闭环。

### P5 主页共创执行链路

**内容**

- `sendMessage()` 根据主页配置分流：
  - 未选择技能：走现有普通对话路径。
  - 选择技能：走共享引擎。
- 串行模式：SKILL1 输出作为 SKILL2 输入，中间结果不进入用户消息区，只在诊断日志和断点中保留。
- 并行模式：按注入模式拼接后一次请求。
- 上下文 scope 固定为：

```ts
{
  projectId,
  workspace: 'main',
  purpose: 'generate',
  skillId
}
```

- Agent 优先级：`coCreation.skillAgents[home-${skillId}]` > `coCreation.agentId` > 默认写作助手。
- 移除 `skillStore.skills.filter(enabled)` 的隐式注入，主页只使用用户在配置区明确选择的技能。

**验收**

- [ ] 未选技能时原有聊天行为不变。
- [ ] 选中技能后请求消息中只包含主页选择的技术与智能体。
- [ ] 串行中间输出完整传递，不被 JSON 化或覆盖。
- [ ] 每步上下文记录含 skillId 和 agentId。
- [ ] 诊断日志 source 使用 `HomeCoCreation.skill`。

**经验引用**

- §8 规则 14/15：上下文服务只组装消息，scope 必须含 projectId/workspace/purpose/skillId。
- §8 规则 1：所有 AI 调用走 `aiService.callAi`。
- §8 规则 23：编辑协议必须在请求前注入 systemParts。

### P6 编辑器交互与工具边界

**内容**

- 保留现有 `buildChatEditorTools()` 和编辑协议。
- 工具调用边界：
  - chain 中间步骤不开放写工具，只做文本推理，防止多步骤连续修改编辑器。
  - chain 最后一步或 compose 结果进入现有编辑建议链路。
  - 用户仍需通过预览/确认后才写入编辑器。
- 批次记录继续挂在 assistant 消息上，目标快照校验、回滚、重生成清理规则不变。

**验收**

- [ ] SKILL 输出仍能生成插入、替换、批量编辑建议。
- [ ] 中间步骤不会直接修改编辑器。
- [ ] 用户确认前编辑器内容不变。
- [ ] 重生成后旧编辑批次不复活。

**经验引用**

- §8 规则 39-41：批次元数据、目标校验、重生成清理。
- §7 规则 19：AI 批次不进入用户撤销栈。
- §7 规则 20：成功反馈必须在真实操作成功后出现。

### P7 续生成与取消闭环

**内容**

- 共创请求复用现有主页续生成底座，但快照增加共创元数据：

```ts
{
  skillIds,
  agentIds,
  mode,
  chainState?: {
    lastIndex,
    lastOutput
  }
}
```

- 截断续生成只续当前最终输出，不重启整条 chain。
- 用户取消但有部分正文时，按现有规则生成可恢复快照。
- 正常完成、重生成、配置变更后清理旧快照。

**验收**

- [ ] `length/timeout/network/canceled` 时按钮规则与现有主页一致。
- [ ] 续生成不重复发送数十万字全文。
- [ ] 重启后按钮状态可恢复。
- [ ] 正常完成后旧快照被清理。

**经验引用**

- §8 规则 28-34：finish_reason 归一化、独立快照、边界去重、清理桥接名。
- §2 规则 23：长事务 CDP 超时至少 360s。

### P8 真实验证门

**验证方式**

1. 单测与类型检查：
   - `npm run type-check`
   - 相关 vitest/spec 文件
2. 前端构建：
   - `npm run build:vue`
3. 源应用真实启动：
   - 使用仓库内 `node_modules\electron\dist\electron.exe . --remote-debugging-port=9227`
   - 禁止只用浏览器模式、开发者模式或安装版替代源应用验证
4. CDP 三段式探针：
   - 前置快照
   - 真实用户操作与逐操作断言
   - finally 恢复与清理

**必须覆盖的场景**

- [ ] 未选技能普通对话回归。
- [ ] 单技能并行生成。
- [ ] 多技能并行生成。
- [ ] 多技能串行生成。
- [ ] 串行第二步失败，重启后从失败步骤恢复。
- [ ] 逐技能 Agent 不同绑定生效。
- [ ] 主页配置修改不影响流水线配置。
- [ ] 流水线配置修改不影响主页配置。
- [ ] 大纲工作台行为回归。
- [ ] 编辑建议、预览、确认、回滚。
- [ ] 长文本截断续生成。
- [ ] 取消后状态与消息清理。
- [ ] 关闭重开后配置恢复。
- [ ] 小视口与长文本 UI 溢出扫描。

**通过标准**

- `allStepsOk === true`
- `runtimeErrors: []`
- DOM、store、磁盘 JSON 三层证据一致
- 截图无重叠、无溢出、无遮挡
- 大纲工作台和生成流水线无行为回退

### P9 文档、版本与交付

**内容**

- 更新 `_audit/神意开发经验总结_v2.md`，新经验按 §1-§9 归位，不追加尾部章节。
- 新增开发日志并登记到 `_audit/DEV_LOG_MASTER_INDEX.md`。
- 版本号按改动等级升级：本任务是新增主页共创能力，建议 minor 升级。
- 工作区只保留本次相关改动，历史未提交边界单独说明，不混入本次提交。

**验收**

- [ ] 开发日志含已验证、未验证、客户实操入口。
- [ ] 经验文件有本次新教训归位。
- [ ] 版本号、构建、封装、交付说明一致。

## 5. 风险与对策

| 风险 | 等级 | 对策 |
|---|---:|---|
| ChatPanel 已超 1500 行，改动污染 | 高 | P0 影响圈；只做精准 patch；新逻辑优先放 store/service；每阶段 diff 自审 |
| 共享引擎抽取破坏大纲工作台 | 高 | 先写引擎单测，再切换大纲工作台；源 Electron 真实回归后才进主页 |
| 主页与流水线配置互相覆盖 | 高 | 独立 storage key；禁止读写 `pipeline_step_config`；双向隔离探针 |
| chain 中间步骤调用编辑工具造成多次写入 | 高 | 中间步骤禁写工具，仅最终结果进入编辑建议链路 |
| 断点状态机混用 | 高 | 主页独立断点 key；快照带 chainState；续生成只续最终输出 |
| 上下文历史污染 | 中 | 每步 skillId 独立 scope；chain 上一步输出用独立上下文块，不用聊天历史拼接 |
| UI 挤压消息区 | 中 | 固定两行高度上限；chip 滚动/换行；递归溢出扫描 |
| 旧 enabled 技能隐式注入 | 中 | 删除该路径前做引用闭包；主页只消费 coCreation.skillIds |
| 诊断日志来源混淆 | 低 | source 固定 `HomeCoCreation.skill`；诊断面板可按 purpose/source 过滤 |

## 6. 明确不做

1. 不迁移或改写生成流水线五层配置。
2. 不把主页共创配置写入 `pipelineStore`。
3. 不删除大纲工作台现有能力。
4. 不在本次引入新的第三方依赖。
5. 不用浏览器模式或安装版替代源应用验证。
6. 不把 chain 中间输出直接写进编辑器。

## 7. 审核点

请用户重点确认以下边界：

1. 主页配置保存为全局配置，还是按项目保存？本方案默认全局保存，聊天上下文仍按项目隔离。
2. 串行模式中间步骤是否需要在前端显示“步骤进行中”标签？本方案默认显示步骤状态，但不显示中间全文。
3. chain 中间步骤禁用编辑写工具，仅最终结果可生成编辑建议，是否确认？
4. 头部原“智能体/模型”选择迁到底部配置行后，头部是否只保留标题与会话操作？本方案默认是。

