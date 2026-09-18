# API 对话系统底座统一执行方案

日期：2026-09-11  
方案性质：正式执行方案，待用户审核；本阶段只定稿，不修改业务代码。  
执行依据：`_audit/神意开发经验总结_v3.md`（§1 改码纪律、§3 验证纪律、§8 AI 服务纪律、09-11 大纲长文档共创规则组）  
前置任务：

- `_audit/PROPOSAL_2026-09-10_OUTLINE_COCREATION_FOUNDATION.md`（大纲工作台长文档共创底座）
- `_audit/DEV_LOG_2026-09-11-doc-reconciliation.md`（任务命名与文档对账）

---

## 1. 目标与问题定义

### 1.1 为什么要统一底座

大纲共创底座完成后，应用已经形成三套 API 对话入口：

1. **大纲工作台**：长文档结构化读取 + 提案式写入 + diff 审批。
2. **主页编辑器**：章节/页签上下文 + 编辑器提案 + 批次回滚。
3. **生成流水线**：一次性批处理生成，不开放交互工具。

目前三者的部分能力已经共享，但**没有一份正式规则声明哪些能力必须统一、哪些允许差异**。风险是后续功能继续叠加时出现三类问题：

- 修了 A 入口，B 入口仍走旧逻辑，形成隐性回归。
- SKILL 在一个入口可用，换入口后能力面突变。
- 运行记录、诊断、确认语义分叉，第三方 SKILL 作者被迫学习多套现场。

### 1.2 工程目标

把三个入口的“发动机和变速箱”统一，同时保留各自车身：

- **统一底座**：工具注册契约、读取契约、定位引擎、提案格式、确认状态机、意图授权、运行记录语义。
- **保留差异**：各入口注册的文档域工具不同，上下文组装策略不同，UI 形态不同。
- **流水线隔离**：生成流水线只消费统一上下文包与运行记录，不开放交互式读写工具。

### 1.3 成功标准

统一完成后，应满足四个可验证结果：

1. 新增一个对话入口时，只实现 adapter 和工具集，底座能力零重写。
2. 任一入口的写入提案，都走同一个定位引擎、同一个确认状态机、同一套回滚语义。
3. 任一入口的只读/写入权限，都由同一个意图授权策略决定。
4. 第三方 SKILL 作者只学习一套工具协议与运行记录格式。

---

## 2. 总体架构

### 2.1 统一层 / 差异层 / 禁改层

这是本方案的核心防错表，执行时不得临时改变。

| 层级 | 内容 | 规则 |
|---|---|---|
| 统一层 | 工具注册契约、可读目标声明、ContextPack 结构、定位引擎、提案协议、批次状态机、意图授权、运行记录事件语义 | 三入口必须走同一实现，禁止局部复制 |
| 差异层 | 大纲工具集、章节/编辑器工具集、上下文优先级、UI 形态、过程流文案 | 按入口裁剪，但接口签名和返回结构必须符合统一契约 |
| 禁改层 | 生成流水线的层级传递与一次性生成语义、Folder 协议六文件与评测闭环、意图路由判定算法、运行记录 start/finish 语义 | 本方案只消费或对齐，不重写 |

### 2.2 目标链路

统一后的对话底座链路：

```text
入口 adapter
  -> 文档域工具集注册（按入口裁剪）
  -> 统一读取契约（来源 + 版本 + 分页 + 结构地图）
  -> 统一意图授权（discuss 只读 / edit 才提案）
  -> 统一定位引擎（唯一命中 / 多匹配拒绝 / 结构锚点）
  -> 统一提案与批次状态机（pending/applied/expired/rolled_back）
  -> 统一运行记录（事件名、API 记录闭环、诊断字段）
```

### 2.3 核心决策

| 决策 | 内容 | 理由 |
|---|---|---|
| 不统一 UI | 三个入口界面保持现状 | 底座统一解决一致性与可维护性，不强迫场景同形 |
| 不给流水线开放交互工具 | 流水线仍走批处理 | 用户点击生成后期望一次性闭环，交互工具会增加失控点 |
| 不做模型直写 | 所有写入仍是提案 + 轻量确认 + hash 校验 + 回滚 | 安全底座不允许为统一性让步 |
| 不新建大框架 | 以现有 `editorTools`、`conversationContextService`、`workspaceSkillEngine`、`editorEdit*` 为基础收口 | 避免为了统一而重写，符合最小改动原则 |
| 契约先行 | 先定义类型与规则，再改接入点 | 防止“看起来统一，实际各写各的” |
| 全入口回归 | 每阶段必须跑主页、大纲、流水线三入口验证 | 统一任务的最大风险是改 A 坏 B |

---

## 3. 现状盘点（已核实）

### 3.1 已共享的能力

| 能力 | 现状 | 评估 |
|---|---|---|
| 定位引擎 | `editorEditLocator` 被 `editor.locate`、`propose_edits`、批次规划共用 | 已统一，保持唯一 |
| 批次状态机 | `editorBatchRecord`、`editorEditSession` 管理确认生命周期 | 已共享，可收口为正式契约 |
| SKILL 执行引擎 | `workspaceSkillEngine` 被主页和大纲共用 | 已共享，意图授权规则需显式化 |
| 上下文服务 | `conversationContextService` 被主页、大纲、流水线消费 | 服务共享，但 workspace 策略分散在调用点 |
| Diff 审批 | DiffModal 承担确认与回滚 UI | 结构已共享，事件语义需对齐 |

### 3.2 当前差异

| 入口 | 工具面 | 上下文形态 | 写入路径 |
|---|---|---|---|
| 大纲工作台 | `outline.*` + `editor.*` + `multi_get_state/global_search` | 焦点全文 + 大纲结构地图 + 按需读取 | 提案 + 结构锚点 + 完整性校验 |
| 主页编辑器 | `editor.*` 为主，无 `outline.*` | editorContent + referenceOutline + 页签上下文 | 提案 + 定位引擎 + 批次回滚 |
| 生成流水线 | 无交互工具 | 五层生成上下文包 | 不开放写入工具 |

### 3.3 已识别的统一缺口

1. **工具注册契约未显式化**：`createEditorTools` 的入参由调用点拼装，`readableTargets`、`writableTarget` 的声明规则没有统一校验。
2. **意图授权散在引擎内部**：`workspaceSkillEngine` 能执行按意图授权，但入口层没有统一的责任声明，容易出现“引擎管了一部分、入口又补一套”。
3. **ContextPack 只有大纲形态完整**：大纲有来源、版本、结构地图；主页与流水线的上下文块结构尚未完全对齐。
4. **确认事件语义未完全对齐**：diff 应用、批次过期、回滚在入口间的事件名和状态字段存在轻微差异。
5. **契约测试缺失**：目前靠各入口单测保证行为，缺少“三入口必须满足同一契约”的横向测试。

---

## 4. M1 影响圈声明

### 4.1 计划新增

| 文件 | 用途 |
|---|---|
| `src/services/dialogueFoundation.ts` | 统一底座契约：权限判定、工具集声明、上下文块校验、确认状态事件 |
| `src/services/dialogueFoundation.spec.ts` | 契约级单测 |
| `src/services/dialogueFoundationContract.spec.ts` | 三入口横向契约测试（mock adapter，不依赖真实 UI） |
| `scripts/verify-dialogue-foundation.mjs` | 源 Electron + CDP 三入口真实操作验证 |

### 4.2 计划修改

| 文件 | 修改点 |
|---|---|
| `src/services/editorTools.ts` | 工具注册入口对齐统一契约，`readableTargets/writableTarget` 声明规范化 |
| `src/services/conversationContextService.ts` | ContextPack 结构统一为“来源 + 版本 + 分块 + 完整性声明”，workspace 策略保留差异 |
| `src/services/workspaceSkillEngine.ts` | 意图授权改由 `dialogueFoundation` 统一判定，引擎只执行 |
| `src/components/common/OutlineWorkspace.vue` | adapter 接入统一契约，行为不变 |
| `src/components/chat/ChatPanel.vue` | adapter 接入统一契约，行为不变 |
| `src/components/pipeline/PipelinePanel.vue` | 仅对齐上下文包与运行记录事件，不开放交互工具 |
| `src/components/common/DiffModal.vue` | 确认状态事件字段对齐，不改 UI 布局 |

### 4.3 明确不碰

- `src/services/realSkillExecutor.ts`、`electron/ipc/skill-loader.js`（Folder 协议）
- `src/services/folderSkillEval.ts`（评测闭环）
- `src/services/chainIntentRouter.ts`（意图判定算法）
- `src/services/de-ai.js`（硬规则与正文处理）
- `src/stores/runTrace.ts` 的记录语义（只允许新增对齐事件）
- 生成流水线的层级传递、生成顺序、断点语义

---

## 5. 阶段 1：契约定稿与现状锁定（P0）

### Task 1.1 定义统一契约

- [x] 实现 `dialogueFoundation.ts` 契约层

**描述**：定义四类核心契约：

1. `DialogueToolSet`：工具集声明，包含 read 工具、propose 工具、目标 workspace、能力标签。
2. `DialogueContextPack`：上下文块结构，包含 source、version、content、coverage（完整/局部/地图）、分页信息。
3. `DialoguePermission`：按意图返回权限，`discuss` 只读，`edit/generate` 才允许提案，任何入口不得直写。
4. `DialogueBatchEvent`：批次确认事件，统一 `pending/applied/expired/rejected/rolled_back` 字段与时间戳。

**验收标准**：

- [x] 类型定义可被三个入口同时消费，无 workspace 特有字段泄漏到通用契约
- [x] 权限判定为纯函数，可单测
- [x] ContextPack 校验能识别“无来源、无版本、假完整”的结构
- [x] 现有行为保持不变，契约层只是显式化

**验证**：`npx vitest run src/services/dialogueFoundation.spec.ts`  
已完成：2026-09-11，`1 file passed / 16 tests passed`。契约包含 `DialogueToolSet`、`DialogueContextBlock`、`resolveDialoguePermission`、`DialogueBatchEvent` 与 `executeDialogueFoundation`。

**规模**：M

### Task 1.2 三入口现状快照

- [x] 生成三入口能力矩阵

**描述**：用代码级扫描生成“入口 x 工具 x 权限 x 上下文 x 事件”矩阵，写入本方案附录，作为统一前基线。

**验收标准**：

- [x] 每个入口列出注册工具、可读目标、可写目标、上下文块、批次事件
- [x] 差异项标注“允许差异”或“待统一”
- [x] 基线与源码一致，不凭记忆填写

**验证**：`rg` 扫描结果 + 人工抽查关键调用点
**已完成证据**：`rg` 扫描 `createEditorTools|buildTools|createOutlineTools|toolPolicy|readableTargets|writableTarget`，关键点为 [ChatPanel.vue](/D:/codex/novel-workshop-vue3/src/components/chat/ChatPanel.vue:681)、[OutlineWorkspace.vue](/D:/codex/novel-workshop-vue3/src/components/common/OutlineWorkspace.vue:979)、[workspaceSkillEngine.ts](/D:/codex/novel-workshop-vue3/src/services/workspaceSkillEngine.ts:454)、[aiService.ts](/D:/codex/novel-workshop-vue3/src/services/aiService.ts:922)。

**规模**：S

### Checkpoint 阶段 1

- [x] `npm run type-check` 通过（2026-09-11：`vue-tsc --noEmit`，exit 0）
- [x] `npm run test:services` 通过（2026-09-11：`20 files passed / 216 tests passed`）
- [x] 三入口行为与统一前一致（本阶段只新增契约层与测试，不改接入点）

---

## 6. 阶段 2：工具与权限统一（P0）

### Task 2.1 工具注册契约接入

- [x] `editorTools.ts` 接入 `DialogueToolSet`

**描述**：工具注册时必须声明目标 workspace、读/写能力、是否需要意图授权；未声明目标的工具拒绝注册。

**验收标准**：

- [x] 大纲工作台仍注册 `outline.*` + `editor.*` + `multi_get_state/global_search`
- [x] 主页编辑器仍注册 `editor.*`，不新增 `outline.*`
- [x] 流水线不注册交互工具
- [x] 缺少 `readableTargets` 的读取工具、缺少 `writableTarget` 的写入工具在注册时抛出明确错误

**验证**：`npx vitest run src/services/editorTools.spec.ts src/services/dialogueFoundation.spec.ts`

**规模**：M

### Task 2.2 意图授权统一

- [x] `workspaceSkillEngine.ts` 消费统一权限判定

**描述**：把“discuss 只读、edit/generate 才提案”的规则从引擎内部实现改为调用 `dialogueFoundation.resolvePermission()`；引擎只执行结果，不再自行解释权限。

**验收标准**：

- [x] 同一意图在主页和大纲工作台得到同一权限结果
- [x] 意图路由算法不变，只消费其输出
- [x] plain 与 SKILL chain 权限一致
- [x] 任何路径都无法绕过权限直接写编辑器

**验证**：`npx vitest run src/services/workspaceSkillEngine.spec.ts src/services/chainIntentRouter.spec.ts`

**规模**：M

### Checkpoint 阶段 2

- [x] 三入口工具面与统一前一致，差异只在声明方式（`npx vitest run`：4 files / 52 tests passed；能力矩阵见附录）
- [x] discuss 请求无写入工具，edit/generate 才出现提案工具（CDP 实测：主页与大纲 discuss 均无 `editor.propose_edits`，edit 均包含）
- [x] 源 Electron + CDP 验证主页与大纲真实请求（2026-09-11：`node scripts/verify-dialogue-foundation-stage2.mjs` exit 0，主页 9 项 PASS，大纲 9 项 PASS）

**阶段 2 实测记录**：
- 修复验证脚本缺陷：主页验证后过早 `server.close()`，导致大纲阶段 mock 供应商不可连接，UI 停留在生成中；改为脚本末尾统一关闭。
- 验证渲染层必须重新执行 `npm run build:vue` 后 CDP 才会运行新代码，不能把源码探针未出现当作运行时证据。
- 大纲直接对话第 1 次请求返回 `outline_proposal`，确认前编辑器内容不变；第 2 次讨论请求只带读工具。

---

## 7. 阶段 3：上下文与事件统一（P1）

### Task 3.1 ContextPack 契统一

- [x] `conversationContextService.ts` 对齐统一 ContextPack

**描述**：所有上下文块必须带 source、version、coverage；大纲保留“结构地图 + 按需读取”，主页保留“编辑器内容 + 参考大纲”，流水线保留五层生成包。统一的是结构，不是内容。

**验收标准**：

- [x] 三个入口的上下文块都可通过 `validateDialogueContextBlocks()` 校验（主页 editorContent=full，referenceOutline=reference；大纲 outline=structure_map；流水线五层生成包由链路冒烟覆盖）
- [x] 不允许出现“截断冒充全文”的无标记块（memory>6000、selection>4000 标 partial/truncated，full+truncated 被校验拒绝）
- [x] 大纲工作台行为不回归，主页 referenceOutline 逻辑不变（`conversationContextService.spec.ts`：4 files / 39 tests passed）
- [x] 流水线五层注入链路不回归（`verify-outline-cocreation-pipeline-smoke.mjs`：12 项 PASS）

**验证**：

- `npx vitest run src/services/conversationContextService.spec.ts`
- `node scripts/verify-outline-cocreation-pipeline-smoke.mjs`

**规模**：L

### Task 3.2 批次确认事件对齐

- [x] `DiffModal.vue`、`editorBatchRecord.ts`、`editorEditSession.ts` 事件字段统一

**描述**：批次应用、过期、拒绝、回滚使用统一的 `DialogueBatchEvent` 字段；UI 不变。

**验收标准**：

- [x] 三入口事件字段一致（main/outline 均迁移到 `DialogueBatchEvent`，`toDialogueBatchEvent` + `normalizeDialogueBatchEvent` 往返校验）
- [x] 过期批次不可应用、首答不可变（`editorEditSession.spec.ts` 既有状态机测试保持通过）
- [x] 回滚与部分接受行为不回归（`editorBatchRecord.spec.ts` / `editorEditSession.spec.ts`：4 files / 39 tests passed）
- [x] 运行记录能按统一事件名展示（runTrace 文本导出含 `AI 批次applied`，JSON 导出含 `batchEvent`）

**验证**：`npx vitest run src/services/editorBatchRecord.spec.ts src/services/editorEditSession.spec.ts`

**规模**：M

### Checkpoint 阶段 3

- [x] `npm run type-check`、`npm run test:services`、`npm run build:vue` 通过（type-check exit 0；services 20 files / 218 tests passed；build exit 0）
- [x] 主页、大纲、流水线三入口冒烟通过（主页/大纲：`verify-dialogue-foundation-stage2.mjs` 18 项 PASS；流水线：12 项 PASS）
- [x] 运行记录导出能看出统一事件语义（`runTrace.spec.ts` batch_event 文本/JSON 导出断言通过）

---

## 8. 阶段 4：横向契约测试与真实 UI 验证（P1）

### Task 4.1 横向契约测试

- [x] 实现 `dialogueFoundationContract.spec.ts`

**描述**：用 mock adapter 同时模拟三入口，断言它们满足同一契约：权限一致、事件一致、上下文结构合法、工具声明合法。

**验收标准**：

- [x] 同一意图下权限矩阵一致
- [x] 同一批次状态迁移事件一致
- [x] 非法工具声明被拒绝
- [x] 非法上下文块被识别

**验证**：`npx vitest run src/services/dialogueFoundationContract.spec.ts`

**规模**：M

### Task 4.2 源 Electron 真实操作验证

- [x] 实现 `scripts/verify-dialogue-foundation.mjs`

**描述**：启动源 Electron（禁止网页、开发者模式、安装版），覆盖三个场景：

1. 大纲工作台：discuss 只读，edit 提案，批次确认。
2. 主页编辑器：编辑器上下文为主，提案定位与回滚。
3. 生成流水线：五层生成冒烟，无交互工具注入。

**验收标准**：

- [x] 三入口真实 UI 操作全部可点击、可断言
- [x] 权限差异只来自意图，不来自入口
- [x] 运行记录事件字段一致
- [x] 无测试数据残留

**验证**：`node scripts/verify-dialogue-foundation.mjs`

**规模**：L

### Checkpoint 阶段 4

- [x] 全量 `npm run type-check`（exit 0）
- [x] 全量 `npm run test:services`（20 files / 218 tests passed）
- [x] 全量 `npm run build:vue`（exit 0）
- [x] 全量 `npx vitest run` 不引入假失败（55 files / 425 tests passed）
- [x] 源 Electron + CDP 三入口全绿（`verify-dialogue-foundation.mjs` 14 项 PASS）
- [x] 生成流水线冒烟全绿（设定层生成 settings=1/status=done，无交互工具注入，上游大纲注入保留）

---

## 9. 统一验收矩阵

| 能力 | 验收 |
|---|---|
| 工具声明 | 三入口工具全部通过统一契约注册，非法声明被拒绝 |
| 权限一致 | discuss 只读，edit/generate 才提案，入口间无差异 |
| 定位一致 | 所有写入定位走 `editorEditLocator`，多匹配拒绝 |
| 提案一致 | 所有写入都是提案 + 轻量确认 + hash 校验 + 回滚 |
| 状态一致 | pending/applied/expired/rejected/rolled_back 字段统一 |
| 上下文合法 | 三入口上下文块均带来源、版本、覆盖范围 |
| 差异保留 | 大纲有 outline 工具，主页有编辑器上下文，流水线无交互工具 |
| 日志一致 | 事件语义统一，API 记录闭环 |
| 回归零容忍 | 主页、大纲、流水线行为与统一前一致 |
| 真实操作 | 源 Electron + CDP 三入口真实点击验证 |

---

## 10. 风险与回退

| 风险 | 等级 | 缓解 |
|---|---|---|
| 契约层变成新抽象负担 | 高 | 只收口已有行为，不新增业务能力；每阶段对比统一前能力矩阵 |
| 统一权限误伤主页编辑器 | 高 | 主页 adapter 保留现有工具面；CDP 真实操作覆盖 |
| ContextPack 重构影响流水线 | 高 | 流水线只做结构校验，不改注入内容；每阶段跑五层冒烟 |
| 批次事件字段变更破坏旧记录 | 中 | 新增字段向前兼容，旧记录读取时补默认值 |
| 横向测试与真实 UI 不一致 | 中 | mock 契约测试 + 源 Electron CDP 双层验证 |

回退原则：

1. 每个任务独立闭环，出问题只回退该任务范围。
2. 阶段未全绿不进入下一阶段。
3. 若统一导致任一入口行为回归，优先回退接入点，保留契约层待修。
4. 任何写入能力异常时，立即关闭新增授权入口，恢复提案式安全底座。

---

## 11. 执行顺序

1. 用户审核通过本方案后，启动目标模式，**不设 token 预算**。
2. 按阶段 1 -> 2 -> 3 -> 4 顺序执行，阶段内按任务编号执行。
3. 每完成一个任务，勾选对应 checklist 并附当轮验证证据。
4. 每个阶段 Checkpoint 全绿才进入下一阶段。
5. 出现协议字段、UI 形态、依赖引入等需要用户决策的分歧时，暂停推进，列出选项等待确认，不得绕过。
6. 全部完成后更新 `神意开发经验总结_v3.md` 与开发日志索引，再讨论版本升级与封装。

---

## 12. 附：三入口能力矩阵（执行阶段 1 时填写）

| 入口 | 读取工具 | 提案工具 | 上下文块 | 批次事件 | 允许差异 |
|---|---|---|---|---|---|
| 大纲工作台 | `editor.get_state/search/locate/multi_get_state/global_search/workspace_summary` + `outline.get_structure/read_range/search/get_summary` | `editor.propose_edits`（进入 pending batch） | 焦点全文、大纲结构地图、按需读取、settings、memory | pending/applied/expired/rejected/version_changed/locked/rolled_back | outline 工具、结构锚点、完整性校验 |
| 主页编辑器 | `editor.get_state/search/locate/multi_get_state/global_search/workspace_summary` + `task.update_plan` | `editor.propose_edits`（进入 pending batch） | editorContent、referenceOutline、activeTab、settings、memory、selection | pending/applied/expired/rejected/version_changed/locked/rolled_back | editorContent、referenceOutline、页签上下文 |
| 生成流水线 | 无交互工具 | 无 | 五层生成包 | 单任务记录 | 批处理、层级传递、断点语义 |

### 12.1 阶段 1 补充发现

- 普通对话路径（无 SKILL）目前由 [ChatPanel.vue](/D:/codex/novel-workshop-vue3/src/components/chat/ChatPanel.vue:1295) 直接传入编辑器工具，未经过意图授权；阶段 2 必须接入 `resolveDialogueToolSurface`。
- `aiService` 内部构造工具执行上下文时 `readableTargets` 固定为空数组，见 [aiService.ts](/D:/codex/novel-workshop-vue3/src/services/aiService.ts:926)；阶段 2 需通过 `meta` 或工具集声明传入真实目标。
- 大纲工作台与主页的 `toolPolicy` 回调形态不同：大纲有 `onToolStart/onToolCall`，主页普通路径也有但共创路径只在普通路径内；统一时只对齐执行语义，不改 UI 文案。

本方案至此定稿，等待用户审核。
