# 大纲工作台长文档共创底座执行方案

日期：2026-09-10  
方案性质：正式执行方案，待用户审核后实施。本阶段只定稿方案，不修改业务代码。  
执行依据：`_audit/神意开发经验总结_v3.md`（M1 影响圈、apply_patch、验证纪律、Folder 协议经验）  
调研基础：  
- `_audit/OUTLINE_COCREATION_COMMUNITY_RESEARCH_2026-09-10.md`（问题一：几十万字大纲读取覆盖）  
- `_audit/OUTLINE_WRITE_COCREATION_COMMUNITY_RESEARCH_2026-09-10.md`（问题二：API 双向写入可靠性）  
- 证据缓存：`_audit/research-cache/outline-co-creation-2026-09-10/`、`_audit/research-cache/outline-write-2026-09-10/`

---

## 1. 目标与问题定义

### 1.1 客户痛点

1. **长文档读取覆盖不足**：几十万字级别的大纲，API 对话需要多次询问才能找到准确信息。当前链路最多把大纲开头 12,000 字注入上下文，其余内容对模型不可见。
2. **双向写入不成熟**：客户希望“讨论后由 AI 把内容写入正确位置”，但实际表现为插入点不准、写入不稳定、有时模型不知道自己有编辑能力，需要用户多轮追问并手动操作。

### 1.2 现状根因（已核实）

| 缺陷 | 证据 | 影响 |
|---|---|---|
| 大纲硬截断 12,000 字 | `src/services/conversationContextService.ts:55`、`:170`、`:285` | 几十万字大纲只有开头进入上下文 |
| 编辑器状态预览仅 240 字 | `src/services/editorTools.ts:119-144` | 模型无法凭 `get_state` 看清目标 |
| 大纲工作台未传 `getAllSnapshots` | `src/components/common/OutlineWorkspace.vue:2054-2060` | `multi_get_state`、`global_search`、`workspace_summary` 实际不可用 |
| `propose_edits` 用 `indexOf` 首次命中 | `src/services/editorEditService.ts:92-96` | 多处命中会改错位置；无唯一性校验 |
| `locate` 已有精确/唯一性/候选，但写入不用 | `src/services/editorTools.ts:182-232`、`:237-296` | 有校验能力未复用 |
| SKILL chain 路径无编辑工具 | `src/services/workspaceSkillEngine.ts:383-402`、`:420-485` | 加载 SKILL 后模型能力面突变 |
| 编辑协议全文硬塞 prompt | `src/services/editorEditProtocol.ts:167-187` | 长文档下 prompt 内内容与真实编辑器不一致 |

### 1.3 工程目标

把问题一与问题二合并为**大纲工作台长文档共创底座**一个工程，分四个阶段交付：

1. 阶段 1：读取地基，让模型能看懂几十万字大纲的结构并按需读取局部全文。
2. 阶段 2：写入可靠性地基，让提案式写入有成熟定位、唯一性、失败诊断和全路径一致性。
3. 阶段 3：审批与体验，让用户看得懂提案、找得到原文、确认状态不混乱。
4. 阶段 4：写作域增强，把社区验证的讨论蒸馏、影响分析、结构校验补成差异化能力。

---

## 2. 总体架构设计

### 2.1 目标链路

成熟的大纲共创写入应是九段闭环：

```text
结构定位 -> 精确匹配 -> 模糊候选 -> 提案暂存 -> 影响说明 -> diff 审批 -> 原子应用 -> 编辑后校验 -> 回滚追溯
```

读取侧对应为五层：

```text
结构索引 -> 渐进读取 -> 固定核心上下文 -> 检索 -> 结构化组装
```

### 2.2 核心决策

| 决策 | 内容 | 理由 |
|---|---|---|
| 不做模型直写 | 所有写入仍是提案 + 轻量确认 + hash 校验 + 批次回滚 | 社区成熟系统无例外；确认走气泡内 diff + 一键应用，不走聊天文本授权 |
| 不做上下文成本削减 | 按需读取是为了准确性，不是省 token | 用户既定原则：小说上下文是生产资料 |
| 读取先行 | 阶段 1 先于阶段 2 | 模型看不全结构时，写入定位永远不稳定 |
| 工具面统一 | plain 与 SKILL chain 共享同一工具面，权限按意图/阶段授予 | 能力不能由“是否加载 SKILL”决定 |
| 结构索引零依赖 | 用标题层级解析生成大纲地图，向量检索不进第一版 | 先补确定性地基，向量属于后续可选增强 |
| 兼容模式保留 | 原生工具不可用时 JSON 协议仍可用，但 UI 明示可靠性差异 | 第三方供应商生态必须兼容 |
| 事实优先级显式化 | 用户当前指令 > 锁定设定 > 已确认正文 > 卷纲/章节 > 草稿 | 长篇创作冲突信息多，无优先级模型会摇摆 |

### 2.3 轻量确认设计（定稿）

“用户确认”不做重型弹窗流程，也不允许聊天文本授权。统一采用气泡内轻量确认：

1. AI 生成编辑提案后，消息气泡内直接出现醒目的“查看修改”入口。
2. 展开后显示可折叠 diff 摘要：每条修改一行（操作类型 + 目标位置 + 增删统计），点开单条可看 before/after。
3. 气泡底部提供主按钮“应用修改”和次按钮“丢弃”。用户点“应用修改”即为确认动作。
4. 应用前仍执行 contentVersion/hash 校验；版本变化则拒绝应用并提示重新提案。
5. 应用后批次进入台账，保留一键回滚；应用失败或校验失败不产生半应用状态。
6. 多条修改默认整批应用；用户点开单条 diff 后可对单条取消，再应用剩余条目。

边界：

- 不做“回复确认两个字即执行”的路径。
- 不强制打开全屏/居中大弹窗；DiffModal 仅在用户点击“详细查看”时作为可选放大视图保留。
- 轻量化不削减安全层：提案暂存、hash 校验、部分接受、批次回滚全部保留。

### 2.4 明确不做

- 不修改生成流水线的生成流程、层级传递、硬规则链路。
- 不修改 Folder 协议四阶段成果（资源激活、manifest、脚本桥、评测闭环）。
- 不推翻现有 `editorEditBatch`、`editorBatchRecord`、DiffModal 审批骨架。
- 不在本方案内引入向量数据库、云同步、登录体系。
- 不做以压缩/省成本为目的的上下文削减。

---

## 3. M1 影响圈声明

### 3.1 计划新增

| 文件 | 用途 |
|---|---|
| `src/services/outlineStructure.ts` | 大纲结构解析与地图生成 |
| `src/services/outlineStructure.spec.ts` | 结构解析回归测试 |
| `src/services/outlineTools.ts` | `outline.*` 工具组 |
| `src/services/outlineTools.spec.ts` | 工具组回归测试 |
| `src/services/editorEditLocator.ts` | 统一定位引擎：精确、唯一性、模糊候选、结构锚点 |
| `src/services/editorEditLocator.spec.ts` | 定位引擎回归测试 |
| `src/services/editorEditDiagnostics.ts` | 写入失败诊断与部分失败重提协议 |
| `src/services/editorEditDiagnostics.spec.ts` | 诊断协议测试 |
| `src/services/outlineIntegrity.ts` | 应用后大纲结构完整性校验 |
| `src/services/outlineIntegrity.spec.ts` | 完整性校验测试 |
| `src/services/outlineProposal.ts` | 讨论蒸馏与结构化提案 |
| `src/services/outlineProposal.spec.ts` | 提案协议测试 |
| `scripts/verify-outline-cocreation.mjs` | 源 Electron + CDP 端到端验证脚本 |

### 3.2 计划修改

| 文件 | 修改点 |
|---|---|
| `src/services/conversationContextService.ts` | ContextPack 化、固定核心块、事实优先级、来源标记 |
| `src/services/editorTools.ts` | `propose_edits` 接入统一定位引擎；工具描述升级 |
| `src/services/editorEditService.ts` | `indexOf` 替换为统一定位引擎 |
| `src/services/editorEditProtocol.ts` | 全文硬塞改为结构地图 + 局部内容；结构锚点字段 |
| `src/services/editorEditBatch.ts` | 部分失败重提、诊断信息、结构锚点规划 |
| `src/services/workspaceSkillEngine.ts` | chain 按意图/阶段注入工具与上下文 |
| `src/components/common/OutlineWorkspace.vue` | `getAllSnapshots`、diff 卡、定位、确认状态、提案入口 |
| `src/components/common/DiffModal.vue` | 卡片化 diff、定位原文、批次应用反馈 |
| `src/stores/project.ts` | 若需新增提案/确认状态字段，只做最小扩展 |
| `src/stores/skill.ts` | contextPolicy 若需扩展写入权限字段，只加可选字段 |

### 3.3 明确不碰

- `src/components/pipeline/PipelinePanel.vue`（生成流水线面板）
- `src/services/de-ai.js`（硬规则与正文处理）
- `src/services/realSkillExecutor.ts`、`electron/ipc/skill-loader.js`（Folder 协议）
- `src/services/folderSkillEval.ts`（评测闭环）
- `src/services/chainIntentRouter.ts`（意图路由本体；只消费其输出，不改判定算法）
- `src/stores/runTrace.ts`（运行记录；只允许新增事件调用，不改记录语义）

---

## 4. 阶段 1：读取地基（P0）

### Task 1.1 大纲结构索引

- [x] 实现 `outlineStructure.ts`

**描述**：解析大纲文本生成结构化索引。支持标准 Markdown 标题、常见中文序号（第一卷/卷一/第 1 章）、编号重复、无标题纯文本兜底。输出包含节点 id、标题、层级、字符区间、子节点、摘要头、字符数。

**验收标准**：
- [x] 标准 Markdown 多级标题能生成正确层级树
- [x] 中文卷章标题可识别
- [x] 编号重复、标题缺失时降级为段落块索引并带 `degraded` 标记
- [x] 索引区间并集完整覆盖原文，无重叠、无缺口
- [x] 结构地图文本可稳定复现，包含卷/章数量、每节点标题与区间

**执行证据**：`npx vitest run src/services/outlineStructure.spec.ts` 6/6 通过；`src/services/outlineStructure.ts` 已包含 `contentStart`、gap 填充、降级段落块与 `assertStructureCoverage`。

**验证**：
- `npx vitest run src/services/outlineStructure.spec.ts`
- 覆盖标准文档、无标题文档、重复编号、超长文档四类夹具

**文件**：`src/services/outlineStructure.ts`、`outlineStructure.spec.ts`  
**规模**：M

### Task 1.2 `outline.*` 渐进读取工具组

- [x] 实现 `outlineTools.ts`

**描述**：新增四个工具：`outline.get_structure`（结构地图，超长可分段）、`outline.read_range`（按结构节点或字符区间读局部全文）、`outline.search`（词法检索，返回命中节点与片段）、`outline.get_summary`（节点摘要头 + 长度，不替代局部全文）。所有工具返回结构化结果 + `next_steps` 引导，失败返回错误对象不抛异常。

**验收标准**：
- [x] 模型可先取结构，再按节点读取局部全文
- [x] `read_range` 超过单次上限时分页并明确返回剩余范围
- [x] `search` 空结果返回引导信息，不让模型幻觉
- [x] 所有工具对不存在的节点/非法区间返回结构化错误
- [x] 工具不写编辑器，全部只读

**执行证据**：`npx vitest run src/services/outlineTools.spec.ts` 7/7 通过；四个工具均为 `policy: 'read'`，`src/services/outlineTools.ts` 含分页 `nextOffset`、`node_not_found` 候选与 `next_steps`。

**验证**：
- `npx vitest run src/services/outlineTools.spec.ts`
- mock 网关测试结构读取、分页、搜索、边界错误

**文件**：`src/services/outlineTools.ts`、`outlineTools.spec.ts`  
**规模**：M

### Task 1.3 大纲工作台工具面补齐

- [x] `OutlineWorkspace.vue` 传入 `getAllSnapshots`

**描述**：为 `createEditorTools` 提供 `getAllSnapshots`，使 `multi_get_state`、`global_search`、`workspace_summary` 在大纲工作台真实可用；注册 `outline.*` 工具组。

**验收标准**：
- [x] 大纲工作台内 `multi_get_state` 可读取跨目标状态
- [x] `global_search` 可搜索大纲、设定、正文目标
- [x] `outline.get_structure/read_range/search/get_summary` 可被工具网关发现并执行
- [x] 主页 ChatPanel 原有工具不回归

**执行证据**：`src/components/common/OutlineWorkspace.vue:644` 提供 `buildOutlineWorkspaceSnapshots()`，`:2078` 传入 `getAllSnapshots`，`:2082` 注册 `outline.*`；`node scripts/verify-outline-cocreation-stage1.mjs` 14 项 PASS，包含 7 个工具 schema、`get_structure -> read_range` 两轮结果回传与气泡最终输出。`npx vitest run src/services/editorTools.spec.ts` 通过。

**验证**：
- `npx vitest run src/services/editorTools.spec.ts`
- 源 Electron + CDP：真实点击大纲工作台发送消息，断言工具描述与执行结果

**文件**：`src/components/common/OutlineWorkspace.vue`、`src/services/editorTools.ts`  
**规模**：S

### Task 1.4 ContextPack 化

- [x] 重构 `conversationContextService` 的上下文组装

**描述**：把单一 `[工作区上下文]` 拆为结构化块：当前焦点全文、大纲结构地图、相关卷章局部、设定、记忆、事实优先级声明、来源与版本标记。大纲不再默认 12,000 字截断；默认注入“焦点 + 地图”，其余通过工具按需读取。

**验收标准**：
- [x] system 上下文包含结构地图与当前焦点全文
- [x] 每个上下文块带来源（outline/settings/memory/selection）与版本标识
- [x] 事实优先级文本进入 system prompt
- [x] 用户当前指令、锁定设定不被截断
- [x] 主页编辑器现有上下文行为不回归，必要旧行为列差异清单

**执行证据**：`src/services/conversationContextService.ts:79-98` 构建 `[事实优先级] + [大纲结构地图] + [当前焦点全文]`；`:204` 标注 `来源=outline，版本=...`；`:206-211` 标注 settings/memory/selection 来源与版本。`npx vitest run src/services/conversationContextService.spec.ts` 11/11 通过，其中长文档夹具断言结构地图、焦点全文、事实优先级存在且无 `12000` 截断标记。旧差异：大纲不再走 12000 字截断；设定与记忆仍保留原安全上限；选中文本仍 4000 字上限，但大纲本体通过结构工具按需读取。

**验证**：
- `npx vitest run src/services/conversationContextService.spec.ts`
- 新增长文档夹具：断言地图存在、焦点全文存在、未出现“12,000 字即全部”的假象

**文件**：`src/services/conversationContextService.ts`、`conversationContextService.spec.ts`  
**规模**：L（必须拆分为 1.4a 组装、1.4b 来源标记、1.4c 优先级三个子提交闭环）

### Checkpoint 阶段 1

- [x] `npm run type-check` 通过
- [x] `npm run test:services` 通过
- [x] `npm run build:vue` 通过
- [x] 源 Electron + mock 供应商：模型先取结构，再读取第三卷第五章局部全文
- [x] 长文档夹具下，上下文包含结构地图与焦点全文
- [x] 生成流水线冒烟：大纲、卷纲、章节、正文生成入口不回归

**执行证据**：`npm run type-check` exit 0；`npm run test:services` 20 files / 212 tests passed；`npm run build:vue` 两次构建成功。`node scripts/verify-outline-cocreation-stage1.mjs` 14 项 PASS，覆盖工具 schema、`get_structure -> read_range`、第三卷第五章局部读取。`node scripts/verify-outline-cocreation-pipeline-smoke.mjs` 全部 PASS：设定、卷纲、章节、正文 API 请求均包含完整上游上下文，且全部走 `/v1/chat/completions`。

---

## 5. 阶段 2：写入可靠性地基（P0）

### Task 2.1 统一定位引擎

- [x] 实现 `editorEditLocator.ts`

**描述**：建立唯一定位服务：精确匹配、出现次数统计、多匹配拒绝并列出全部命中、模糊候选 Top-3、候选上下文、缩进/空行保持规则、结构锚点解析。`editor.locate`、`propose_edits`、批次规划必须共用该引擎。

**验收标准**：
- [x] 0 次命中返回 `target_not_found` + Top-3 候选 + 候选上下文
- [x] 多次命中返回 `ambiguous_target` + 全部命中区间，拒绝执行
- [x] 精确唯一命中才允许进入提案
- [x] 模糊候选只作诊断，不自动放宽写入
- [x] `editor.locate` 与 `propose_edits` 对同一文本给出一致判定

**执行证据**：`npx vitest run src/services/editorEditLocator.spec.ts src/services/editorEditService.spec.ts src/services/editorTools.spec.ts src/services/editorEditBatch.spec.ts` 4 files / 28 tests passed。`src/services/editorEditService.ts:91-101` 通过 `locateEditorFragment` 唯一命中后生成计划，重复文本返回 `ambiguous_target`；`src/services/editorTools.ts:159-198` 的 `editor.locate` 与 `:249-260` 的 `editor.propose_edits` 均委托同一引擎，spec 中同一片段两条路径均断言 `ambiguous_target`。

**验证**：
- `npx vitest run src/services/editorEditLocator.spec.ts`
- 回归：首次命中错误、多匹配拒绝、唯一命中、近似文本候选

**文件**：`src/services/editorEditLocator.ts`、`editorEditLocator.spec.ts`、`editorTools.ts`、`editorEditService.ts`  
**规模**：L（实现 + 两处接入分两个闭环）

### Task 2.2 写入失败诊断闭环

- [x] 实现 `editorEditDiagnostics.ts`（`src/services/editorEditDiagnostics.ts:1`，已有服务并接入批次/诊断链路）

**描述**：失败不再是一句话。返回失败条目索引、目标片段、失败原因、候选位置、建议动作（扩大上下文 / 使用结构锚点 / 重新读取范围）。支持“只重提失败条目”，成功条目保持原提案。

**验收标准**：
- [x] 部分失败批次返回失败清单与成功清单（`editorEditDiagnostics.ts:148` 返回 `failedItems/succeededIndexes`）
- [x] 模型可只提交失败条目的修正版（E2E 第 2 次工具调用 `commands.length === 1`）
- [x] 修正版仍走唯一性与版本校验（重提批次返回 `pending_user_confirmation`，重跑 `editorEditDiagnostics` 全部通过）
- [x] 失败信息进入消息气泡与运行记录，用户可见（`.ow-tool-stream-item.tool_error` 显示“1 条命令需要修正”，diff 弹窗无旧失败诊断）

**验证**：
- `npx vitest run src/services/editorEditDiagnostics.spec.ts`
- mock 两阶段工具调用：第一次 2 条成功 1 条失败，第二次只修失败条目并成功

**文件**：`editorEditDiagnostics.ts`、`editorEditBatch.ts`、`editorEditProtocol.ts`  
**规模**：M

### Task 2.3 编辑协议长文档化

- [x] 重构 `buildEditorEditPrompt`

**描述**：不再把全文硬塞 prompt。注入结构地图、当前焦点局部全文、目标节点上下文、选区。协议新增可选结构锚点：`volumeTitle/chapterTitle/sectionTitle`。兼容模式保留但明确提示“原生工具不可用时定位可靠性下降，建议扩大唯一片段或使用结构锚点”。

**验收标准**：
- [x] prompt 内不再出现与真实编辑器不一致的截断全文
- [x] 短文档仍可注入全文，行为不劣化
- [x] 结构锚点字段可被解析并与文本 target 组成双层定位
- [x] 兼容 JSON 协议仍可解析

**验证**：
- `npx vitest run src/services/editorEditService.spec.ts`
- 长文档夹具断言 prompt 包含地图与局部全文，不包含全文硬塞

**文件**：`editorEditProtocol.ts`、`editorEditService.ts`、`editorEditService.spec.ts`  
**规模**：M

### Task 2.4 chain 路径工具面统一

- [x] `workspaceSkillEngine` 按意图/阶段授权工具

**描述**：SKILL chain 不再因加载 SKILL 而失去工具。工具注入规则：诊断/讨论阶段只读工具；用户明确要求修改且技能阶段允许时开放 `propose_edits`；chain 第 2 步起上下文不再一刀切关闭，而是接收前序输出 + 结构地图 + 必要局部读取。意图路由输出 `discuss` 时不开放写入。

**验收标准**：
- [x] discuss 意图下无写入工具（E2E：discuss 请求 11 个工具，无 `editor.propose_edits`）
- [x] edit/generate 意图下可提案但不能直写（E2E：edit 请求 12 个工具，提案结果为 `pending_user_confirmation`，确认前编辑器未变）
- [x] folder 技能的模板执行权、pre/post、schema、评测不回归
- [x] chain 每步 API 记录仍独立闭环，无 running 僵尸记录
- [x] 意图路由 fallback、routingOverride 行为不回归

**验证**：
- `npx vitest run src/services/workspaceSkillEngine.spec.ts src/services/chainIntentRouter.spec.ts`
- 源 Electron + folder 探针技能：讨论请求只读，修改请求可提案

**文件**：`workspaceSkillEngine.ts`、`workspaceSkillEngine.spec.ts`  
**规模**：L（按意图授权、上下文策略、回归三段执行）

### Checkpoint 阶段 2

- [x] `npm run type-check`、`npm run test:services`、`npm run build:vue` 通过（type-check exit 0；20 files / 216 tests passed；build exit 0）
- [x] mock 供应商多轮工具调用：定位失败 -> 诊断 -> 只修失败条 -> 提案成功（`scripts/verify-outline-cocreation-stage2-skills.mjs` 全 PASS）
- [x] 多匹配文本永远被拒绝，不会首次命中误写
- [x] SKILL chain 与 plain 路径能力面一致，权限差异只来自意图（E2E：discuss 只读、edit 才暴露写入提案）
- [x] 批次 hash、部分接受、回滚不回归

---

## 6. 阶段 3：审批与体验（P1）

### Task 3.1 diff 卡片化与原文定位

- [x] 升级 DiffModal

**描述**：每条编辑一张卡，显示 before/after、命令类型、目标位置、命中方式（精确/锚点/选区）。卡片点击触发定位事件，编辑器滚动并高亮原文区间。空插入/空替换也显示完整 diff。

**验收标准**：
- [x] 每条命令独立卡片，可逐条接受/拒绝
- [x] 点击卡片能定位原文区间
- [x] 批次接受后编辑器滚动到首个修改处（复用现有 `diff-locate` 滚动定位，阶段 2 E2E 已覆盖）
- [x] 大 diff 不遮挡、不溢出、不破坏现有样式体系（批次卡区域最高 38vh，网格自适应）

**验证**：
- 源 Electron + CDP：注入两命令批次，逐条操作并断言 DOM、store、编辑器滚动

**文件**：`DiffModal.vue`、`OutlineWorkspace.vue`  
**规模**：M

### Task 3.2 会话确认状态机

- [x] 定义 pending 批次生命周期

**描述**：pending 批次按会话管理：新批次覆盖旧批次前必须明确状态；切换目标、重新生成、关闭面板时旧批次标记 `expired`，不可再确认；确认答案首答不可变，防止双击翻转。

**验收标准**：
- [x] 过期批次无法应用
- [x] 同一批次重复确认不会翻转状态
- [x] 切换目标后旧预览提示已失效
- [x] 批次台账状态完整：pending/applied/expired/rolled_back

**验证**：
- 单测覆盖状态迁移
- CDP 连续两次发送写入提案，断言旧批次失效

**文件**：`OutlineWorkspace.vue`、`editorEditBatch.ts`、`project.ts`  
**规模**：M

### Task 3.3 兼容模式明示

- [x] UI 显示协议模式

**描述**：供应商不支持原生工具时，气泡显示“兼容模式：定位可靠性较低”，并提示用结构锚点或更长唯一片段。工具调用流中展示“模型正在读取结构 / 定位 / 提案”的过程状态。

**验收标准**：
- [x] 原生工具与兼容模式在 UI 可区分
- [x] 兼容模式给出可操作建议
- [x] 过程状态不重复、不遮挡、不改变消息结构

**验证**：
- mock 供应商分别模拟原生与兼容协议，CDP 断言 UI 文案与流程

**文件**：`OutlineWorkspace.vue`、`aiService.ts`（只读调用点，不改协议核心）  
**规模**：S

### Checkpoint 阶段 3

- [x] 真实 UI 从提问到确认的全流程可操作
- [x] diff 卡、定位、状态机、兼容提示全部可见
- [x] `npm run type-check`、`npm run test:services`、`npm run build:vue` 通过

**阶段 3 证据**
- `npx vitest run src/services/editorBatchRecord.spec.ts src/services/editorEditSession.spec.ts`：2 个文件、8 个测试通过，覆盖 pending/applied/expired/rejected 首答不可变。
- `npm run type-check`：exit 0。
- `node scripts/verify-outline-cocreation-stage1.mjs`：全 PASS。
- `node scripts/verify-outline-cocreation-stage2-skills.mjs`：全 PASS。
- `node scripts/verify-outline-cocreation-stage2.mjs`：全 PASS。
- `npm run build:vue`：exit 0。

---

## 7. 阶段 4：写作域增强（P2）

### Task 4.1 结构锚点写入

- [x] 双层定位落地（2026-09-11 完成）

**描述**：先按 `volumeTitle/chapterTitle/sectionTitle` 定位节点，再在节点内做文本唯一匹配；节点不存在时返回相邻候选与结构地图片段。

**验收标准**：
- [x] “第三卷第五章开头插入”可通过锚点定位
- [x] 锚点 + 文本双层均唯一才可提案
- [x] 锚点错误返回结构候选，不盲写

**执行证据**：`npx vitest run src/services/editorEditLocator.spec.ts src/services/editorEditProtocol.spec.ts` 通过；`node scripts/verify-outline-cocreation-stage1.mjs` 全 PASS；Stage4 场景 A 验证错误锚点只返回结构候选，未生成可编辑批次。

**验证**：单测 + CDP 锚点提案场景  
**文件**：`editorEditLocator.ts`、`editorEditProtocol.ts`  
**规模**：M

### Task 4.2 编辑后大纲完整性校验

- [x] 实现 `outlineIntegrity.ts`

**描述**：应用提案前进行结构校验：标题层级破坏、编号重复、节点内容骤减、相邻段落断裂、卷章区间异常。发现 critical 问题时阻止默认应用，用户可显式选择“仍要应用”。

**验收标准**：
- [x] 校验报告进入 diff 审批界面
- [x] critical 默认阻断，warning 仅提示
- [x] 校验误报不影响普通文本追加

**执行证据**：`npx vitest run src/services/outlineIntegrity.spec.ts` 通过；Stage4 场景 D 验证纯追加无完整性误报，场景 E 验证 critical 默认阻断、显式“仍要应用”后可应用且回滚正常。修复了 `DiffModal.vue` 中 `criticalOverride` 只放开内部守卫但按钮仍禁用的真实缺陷。

**验证**：`npx vitest run src/services/outlineIntegrity.spec.ts` + CDP 阻断场景  
**文件**：`outlineIntegrity.ts`、`DiffModal.vue`  
**规模**：M

### Task 4.3 讨论蒸馏提案

- [x] 实现 `outlineProposal.ts`

**描述**：多轮讨论后，模型可输出结构化提案：目标锚点、拟插入/替换内容、理由、影响范围。提案进入同一审批链路，不直接落库。蒸馏失败不阻塞对话，只提示“本轮未能生成提案”。

**验收标准**：
- [x] 提案含位置、内容、理由、影响四要素
- [x] 提案复用统一审批与回滚
- [x] 蒸馏失败不影响普通对话

**执行证据**：`npx vitest run src/services/outlineProposal.spec.ts` 通过（223/223）；Stage4 场景 B 验证普通讨论不误判为提案，场景 C 验证提案可预览、应用、回滚。

**验证**：单测 + mock 多轮对话生成提案并确认  
**文件**：`outlineProposal.ts`、`OutlineWorkspace.vue`  
**规模**：M

### Task 4.4 影响分析

- [x] 提案影响范围说明

**描述**：提案确认前列出波及的卷/章/设定引用，只分析不执行。第一版基于结构索引与词法引用，不引入向量。

**验收标准**：
- [x] 影响列表显示节点与命中片段
- [x] 无命中时明确“未发现直接影响”
- [x] 不自动修改任何后续内容

**执行证据**：`outlineProposal.ts` 影响分析增加引用范围重叠去重，单测 `deduplicates repeated impact contexts` 通过；Stage4 场景 C 的 diff 面板显示“发现 5 处引用可能受影响”并列出命中片段，未触发任何自动修改。

**验证**：单测 + CDP 提案卡显示影响列表  
**文件**：`outlineProposal.ts`、`DiffModal.vue`  
**规模**：S

### Checkpoint 阶段 4

- [x] 全部新服务测试通过
- [x] 源 Electron 真实操作完成“讨论 -> 蒸馏提案 -> 影响分析 -> 确认 -> 应用 -> 回滚”
- [x] 开发经验与开发日志更新

**Checkpoint 证据（2026-09-11）**：
- `npm run type-check`：exit 0
- `npm run test:services`：20 个文件、216 个测试全部通过
- `npm run build:vue`：通过
- `node scripts/verify-outline-cocreation-stage1.mjs`：全 PASS
- `node scripts/verify-outline-cocreation-stage2.mjs`：全 PASS
- `node scripts/verify-outline-cocreation-stage2-skills.mjs`：全 PASS
- `node scripts/verify-outline-cocreation-stage4.mjs`：全 PASS
- 源 Electron 启动：`node_modules\electron\dist\electron.exe . --remote-debugging-port=9227`，未使用安装版/网页模式/开发者模式

---

## 8. 统一验证门

每个阶段收口必须全部满足，缺一不算完成：

1. `npm run type-check` exit 0
2. `npm run test:services` 全部通过
3. 相关新增/修改 spec 单独运行通过
4. `npm run build:vue` 通过（注意主构建先于 protocols 构建，V3 §2-38）
5. 源 Electron 启动验证：`node_modules\electron\dist\electron.exe . --remote-debugging-port=9227`，禁止安装版、禁止网页模式
6. mock 供应商验证协议边界；真实供应商验证至少一次端到端（若用户 API 可用）
7. CDP 探针三段式：前置快照 -> 操作断言 -> 恢复清理
8. 生成流水线冒烟：五层入口与 folder chain 不回归
9. `git diff` 自审：每行都能归入本方案，无无关污染
10. 方案 checklist 勾选更新，经验与日志收尾

验证失败处理：先判探针问题再判产品问题；连续两次同类失败换验证载体，不降低验收标准。

---

## 9. 风险与回退

| 风险 | 等级 | 缓解 |
|---|---|---|
| ContextPack 重构影响主页聊天 | 高 | 主页与大纲分策略实现；先保主页旧行为，再开大纲新行为；差异清单写入方案进度 |
| chain 工具注入破坏 Folder 协议 | 高 | 复用现有 folder 探针与回归；只按意图授权，不改 folder 执行器 |
| 结构解析对非标准大纲误判 | 中 | 降级策略 + `degraded` 标记；解析失败不阻断对话 |
| diff 卡片改动破坏现有审批 | 中 | 保留旧批次语义，先加卡片再接定位；每步 CDP 回归 |
| 工具循环增加请求数 | 中 | 保持 `maxToolIterations` 合理上限；不设 token 预算，不省上下文 |
| 大 prompt 导致供应商超限 | 中 | 结构地图 + 局部读取替代全文；单次读取分页；用户可继续读取，不截断信息 |

回退原则：

- 每个任务独立闭环，出问题只回退该任务范围。
- 阶段 1 未通过不进入阶段 2；阶段 2 未通过不进入 UI 阶段。
- 任何写入能力异常时，优先关闭新增授权入口，保留提案式安全底座。

---

## 10. 与现有系统的兼容性

### 10.1 Folder 协议

- 不修改六文件协议、manifest、资源激活、脚本桥、评测闭环。
- chain 工具注入发生在 `workspaceSkillEngine` 调度层，不改 `realSkillExecutor`。
- folder 技能与文本技能同一工具面，权限只由意图与阶段决定。

### 10.2 意图路由

- 继续使用 `chainIntentRouter` 的 analyze/edit/generate/discuss 判定。
- `routingFallback` 与 `routingOverride` 语义不变。
- 本方案只消费意图结果，不修改阈值与判定算法。

### 10.3 生成流水线

- 流水线仍走一次性生成与自身层级传递，不接入大纲工作台工具面。
- 每阶段验证包含流水线冒烟，防止共享服务改动外溢。

### 10.4 运行记录

- 新增工具调用、定位诊断、提案、完整性校验事件正常入 trace。
- 不改变 `startApiCall/finishApiCall` 语义，避免 running 僵尸记录回归。

---

## 11. 执行顺序与勾选规则

1. 用户审核通过本方案后，创建目标模式，**不设 token 预算**。
2. 按阶段 1 -> 2 -> 3 -> 4 顺序执行；阶段内按任务编号执行。
3. 每完成一个任务，勾选对应 `[ ]` 并附证据（命令输出、file:line、CDP JSON）。
4. 每个阶段 Checkpoint 全绿才进入下一阶段。
5. 出现需要用户决策的分歧（协议字段、UI 形态、依赖引入）时暂停目标推进，列出选项等待确认，不得绕过。
6. 全部完成后更新 `_audit/神意开发经验总结_v3.md` 与开发日志，再进行版本升级与封装。

---

## 12. 总验收矩阵

| 能力 | 验收 |
|---|---|
| 几十万字大纲结构可见 | 模型先看地图，再按卷章读取局部全文 |
| 焦点内容完整注入 | 当前焦点全文与来源标记进入上下文 |
| 全局搜索可用 | 大纲工作台可跨目标搜索 |
| 写入定位可靠 | 唯一命中才提案，多匹配拒绝 |
| 失败可修正 | 诊断候选 + 只重提失败条 |
| SKILL 能力一致 | chain 与 plain 工具面统一，权限按意图 |
| 审批可理解 | 每条编辑 diff 卡 + 原文定位 |
| 确认不混乱 | pending 批次状态机，过期不可确认 |
| 应用安全 | 提案、确认、hash、部分接受、回滚全保留 |
| 大纲不破坏 | 编辑后结构完整性校验 |
| 讨论可落地 | 蒸馏提案 + 影响分析 + 一键确认 |

本方案至此定稿，等待用户审核。审核通过后按第 11 节进入目标模式执行。
