# 方案：大纲工作台创作风格锁定与全流水线同步

> 日期：2026-10-15
> 状态：v1.2 待审核（决策点已全部裁决，待用户最终确认后执行）
> 修订：v1.2 二次自审修订（终稿 constraints 通道、仅锁定注入、autoDecompose 豁免、checkpoint 快照语义、经验文件版本校正）
> 依据：`_audit/神意开发经验总结_v7.md`（G0.1/G0.5/G0.6/G0.7/G0.9/G0.10/G0.11/G0.12/G1.3/G1.8/G2.8/G2.9/G2.13）

## 1. 目标

把"创作风格"升级为项目级、可锁定、可持久化的单一事实源：

1. 生成流水线设定层的创作风格卡片保持现有位置与外观，不迁移、不删除。
2. 在大纲工作台完整复现同一套风格卡片（含折叠展开、标签池、自定义标签、节奏五项控件）。
3. 风格设定后独立锁定；锁定后与大纲编辑器和 API 链路共生，大纲编辑、API 直写、流水线运行、下游失效清理都不得改动或清空它，直到用户显式解锁。
4. 大纲工作台与流水线设定层的风格卡片共享同一份数据，双向同步；大纲创作阶段 API 按锁定风格走，流水线生成阶段也按同一风格走。
5. 补完风格在生成流水线四层（设定/卷纲/章节/正文）的接线，消除"只有章节和正文吃风格"的半截链路。

## 2. 现状链路（已核实）

### 2.1 风格卡片现状

- UI：`PipelinePanel.vue:114-171`，标题"创作风格"，默认折叠，展开后包含叙事风格标签池、自定义标签、剧情节奏五项（速度/紧张度/密度/视角/基调）与"恢复AI建议"。
- 数据：`PipelinePanel.vue:1625-1626` 的本地 `ref`（`styleTags` / `pacingParams`），另有 `pacingParamsObj`、`customStyleTags`、`aiPacingSnapshot`、`styleCardExpanded` 全部为组件本地状态。
- 持久化：无。不在 project store，不写入 `settingsCollection`，不随项目保存。
- 生成来源：`analyzeOutline()`（`PipelinePanel.vue:2367`）在流水线第 0 步确认后调用 API 反推 `{styleTags, pacingParams}`。
- 失效行为：`invalidateDownstream(0)`（`PipelinePanel.vue:2616-2626`）会直接清空风格与节奏。
- 展开时机：设定层生成完成后强制展开（genSettings 末尾 `styleCardExpanded.value = true`）。

### 2.2 下游消费现状

| 层 | 是否消费风格 | 位置 | 形态 |
|---|---|---|---|
| SKILL 模板变量 | 是 | `buildTemplateContext`（PipelinePanel.vue:2294-2295） | `{{styleTags}}` / `{{pacingParams}}` |
| 设定层 | 否 | genSettings prompt（PipelinePanel.vue:3647） | 仅 `[已确认大纲]` |
| 卷纲层 | 否 | `buildVolumePrompt`（volumeGeneration.ts:15） | 接口无风格字段 |
| 章节层 | 是 | PipelinePanel.vue:4081 | `[风格与节奏]` 注入章节 prompt |
| 正文层 | 是（最完整） | PipelinePanel.vue:4322-4323 → chapterExecutionPackage.ts:135-136,149-150 | `styleContext` + `pacingContext` 进入执行包 |

### 2.3 大纲工作台现状

- 已有独立大纲锁定/解锁生命周期：`handleLockOutline`（OutlineWorkspace.vue:4017-4039）、`handleUnlockOutline`（6336-6341）、project store `lockOutline()/unlockOutline()`（project.ts:566-576）。
- API 请求组装点：`buildOutlineSystemPrompt`（OutlineWorkspace.vue:1941-1962）+ `conversationContextService.assembleMessages`（5375-5381）。
- 大纲工作台目前完全没有风格概念，系统提示词只有"你是小说大纲创作助手"。

## 3. 总体设计

### 3.1 单一事实源

在 project store 新增项目级 `styleProfile`，随项目持久化：

```ts
interface StyleProfile {
  styleTags: string
  pacingParams: string
  pacingParamsObj: {
    speed: string
    tension: number
    density: string
    perspective: string
    tone: string
  }
  customStyleTags: string[]
  aiPacingSnapshot: Record<string, any> | null
  locked: boolean
  lockedAt: number | null
  source: 'manual' | 'ai-analysis' | null
}
```

持久化接线四处必须同批完成，缺一处即"设置了但换项目/重开就丢"：

- `loadProject`：读取 `data.styleProfile`，旧项目缺省为空草稿 + 未锁定。
- `persistProject`：把 `styleProfile` 加入项目数据白名单。当前持久化是显式字段清单，不在清单中的字段不会写盘，这是最容易被漏的静默丢失点。
- `resetProjectState`：项目切换/新建时清空为默认值，禁止 A 项目风格串到 B 项目。
- `migrateProjectData`：旧 schema 升级时补默认值，并纳入旧项目加载回归。

store 提供动作（全部走写队列与 `saveProject()`）：

- `updateStyleProfileDraft(patch)`：未锁定时更新草稿字段；已锁定时返回 `style_locked` 错误，不改数据。
- `lockStyleProfile()` / `unlockStyleProfile()`：切换锁定态并落盘。
- `applyAiStyleAnalysis({styleTags, pacingParams})`：未锁定时写入草稿并保存 AI 快照；已锁定时拒绝（锁定优先于 AI 反推）。
- `styleProfileEffective` computed：输出给四层 prompt 与大纲 API 的只读视图。

### 3.2 两张卡片 = 一个数据源的 two views

不复制两套状态，也不做事件广播式"同步"。两张卡片直接绑定同一个 `styleProfile`：

- 大纲工作台卡片：新增，完整复刻 PipelinePanel 卡片结构、样式类名与交互（默认折叠、展开高级设置、标签池、自定义标签、五项节奏控件、恢复 AI 建议）。
- 流水线设定层卡片：位置、外观、控件不动；内部数据源从本地 `ref` 改为 store 的 `styleProfile`。这是"连接同步"的实现方式：同源即同步，不存在双写。
- 未锁定时：任一卡片编辑，另一张实时一致（Pinia 响应式天然保证）。
- 锁定后：两张卡片同时进入只读态，显示锁定标识；"恢复AI建议"、标签切换、节奏控件、自定义标签全部禁用。
- 组件实现注意：现有 `pl-style-*` 样式在 PipelinePanel 的 `<style scoped>` 内（5436 起），复用组件必须把这段样式随组件迁移，否则大纲工作台卡片会裸样式。`styleCardExpanded` 保持组件本地状态（两处折叠互不联动是合理交互），卡片数据全部来自 store。
- 现有 `watch(outlineAnalyzed)` 字符串反解逻辑属于旧本地链路，合并进 store 的 `applyAiStyleAnalysis()` 后必须删除，禁止新旧两套解析并存。

### 3.3 锁定语义（按用户第 3 点；v1.2 已裁决）

- 风格锁定独立于大纲锁定，是第二个独立锁。
- 大纲解锁、重新编辑、重新锁定：风格保持原样。
- API 直写修改大纲正文：不影响风格。
- `invalidateDownstream(0/1/2/3)`：不再清空风格；只有用户显式解锁后才可改。
- `analyzeOutline()` 自动反推：风格已锁定时跳过写入（保留原值），仅在未锁定且草稿为空时作为预填建议。
- 项目级重置例外：`clearCurrent` / `resetProjectState` 属于项目删除、切换、新建，必须清空风格；这不算"大纲活动干扰风格"。
- 风格锁定不改变执行协议：它只进入提示词/上下文，不改变工具面、权限语义、路由、写入授权（遵守 G2.13：相当于一个"应用级风格约束块"，任何执行形态下同源注入）。
- **注入判定唯一规则：只有 `locked === true` 才注入。** 未锁定草稿仅作为编辑态保存，不进入任何 prompt、模板变量或终稿约束；所有出口统一 trace `injected:false, reason:'style_unlocked'`。

### 3.4 大纲工作台 API 注入（v1.2 修订）

仅锁定时，`buildOutlineSystemPrompt` 追加风格块：

```text
[创作风格约束（应用级，优先级高于普通建议）]
风格标签：...
节奏参数：...
要求：所有大纲创作、扩写、修改建议必须符合上述风格；如与用户当轮明确要求冲突，以用户当轮要求为准并在回复中说明冲突。
```

注入点选择系统提示词而非用户消息，保证统一生效。但自审核实：大纲工作台有多条 API 出口，各自构建消息，只挂 `buildOutlineSystemPrompt` 会漏。必须做全出口覆盖清单，每条出口都有断言：

| 出口 | 位置 | 注入方式 |
|---|---|---|
| chain SKILL / Agent runtime | OutlineWorkspace.vue:4584 | 系统 prompt 追加风格块 |
| plain AI 对话（无 SKILL） | `askPlainAi`（OutlineWorkspace.vue:5007） | 同一系统 prompt 组装点，实施时核实到具体 requestMessages 行 |
| 终稿整篇重构 | `runOutlineFinalDraftTurn`（OutlineWorkspace.vue:1064） | 走 `FinalDraftRunInput.constraints`（finalDraftRunner.ts:79），由 finalDraftService 渲染为"硬约束"块；禁止改 runner 消息组装或塞进 skillGuidance（8000 字符截断风险） |
| 本地确定性变换 | `runOutlineLocalTransformIfReady`（OutlineWorkspace.vue:2458） | 不调模型，不改行为；runTrace 记录 `injected:false, reason:'local_transform'` |
| 大纲自动拆解 | `autoDecompose`（OutlineWorkspace.vue:4044） | **豁免注入**：设定拆解与伏笔提取是信息抽取任务，不是创作任务；trace 记 `injected:false, reason:'extraction_task'` |

风格未锁定、或锁定但内容为空时，所有出口不追加空块，trace 分别记录 `injected:false, reason:'style_unlocked' | 'style_empty'`。

同时：

- `buildWorkspaceSkillAdapter` 的模板上下文（OutlineWorkspace.vue:2903 附近）补 `styleTags` / `pacingParams` 变量，供 SKILL 模板引用。
- runTrace 新增 `style-profile` 事件：记录 `locked/styleTags/pacingParams/injected:true`，满足 G1.8 观测同步。

#### 终稿约束的任务快照语义（v1.2 新增）

`FinalDraftTask.constraints` 已在 checkpoint 中持久化并在恢复时回填（finalDraftCheckpoint.ts），本方案不新增 schema、不改 checkpoint 通道。规则：

1. 创建终稿任务时，若风格已锁定，把风格块编译为一条 constraint 传入 `runFinalDraft`；未锁定则不传。
2. 继续生成（continueOutlineFinalDraft:1173）、当前段重试（retryOutlineFinalDraftSegment:1278 附近）、检查点恢复（resumeOutlineFinalDraft:1417 附近）一律复用任务内 constraints 快照，不重新读当前 store。终稿是任务级产物，中途换风格会造成前后分段风格漂移；用户改变风格后应重新发起终稿。
3. trace 事件记录 `constraintsSource:'task_snapshot'`，续生成/重试/恢复的断言均检查任务快照而非实时 store。

### 3.5 流水线四层接线补完

| 层 | 改动 |
|---|---|
| 设定层 | genSettings prompt 在 `[已确认大纲]` 后追加 `[创作风格]` 块 |
| 卷纲层 | `buildVolumePrompt` 新增 `styleContext` 字段，渲染 `[风格与节奏]` |
| 章节层 | 数据源改为 store（当前已注入，逻辑不变，只换源） |
| 正文层 | 数据源改为 store（执行包字段不变，只换源） |
| SKILL 模板 | `buildTemplateContext` 的 `styleTags/pacingParams` 改读 store |

模板变量契约：`realSkillExecutor.spec.ts` 现有 `{{styleTags}}/{{pacingParams}}` 空值测试，改源后该测试必须同批更新为从 store fixture 取值，并新增"锁定后模板变量与 prompt 注入值一致"断言，防止变量层与 prompt 层出现两个来源。

## 4. 实施阶段

### Phase 0：台账与基线（G0.12）

建 `_audit/TASK_LEDGERS/` 任务台账七节骨架；记录当前 style 链路引用矩阵；跑一次相关单测基线。

### Phase 1：store 数据契约（M）

project.ts 新增 `styleProfile`、动作、持久化字段、旧项目默认值（空草稿、未锁定）；load/persist/reset/migrate 四处同批接线。含并发/写队列对齐（G2.8）。单测：锁定守卫、AI 写入守卫、持久化 round-trip、旧项目加载、项目切换隔离、clearCurrent 清空。

### Phase 2：共享风格卡片组件（M）

从 PipelinePanel 抽出/复刻卡片为共享组件 `StyleProfileCard.vue`（结构、类名、控件、折叠行为 1:1），接入 store；PipelinePanel 原位置替换为该组件，外观不变；OutlineWorkspace 顶栏挂载同组件，默认折叠不占空间。单测：双卡片同源渲染、锁定禁用态。

### Phase 3：生命周期与同步接线（M）

- `analyzeOutline()` 改走 `applyAiStyleAnalysis()`，锁定跳过。
- `invalidateDownstream` 移除风格清空逻辑（草稿也保留；用户没解锁就不动）。
- 设定层生成完成后的强制展开保留原行为。
- 大纲工作台卡片锁定/解锁按钮接入 store 动作。

### Phase 4：大纲 API 注入（M）

- 3.4 全出口覆盖清单逐条接线（chain/Agent、plain、终稿 constraints、本地变换 trace），不做"只修主入口"。autoDecompose 只补 `injected:false` trace，不注入。
- SKILL 模板变量接入。
- runTrace `style-profile` 事件。

### Phase 5：流水线四层补完（M）

设定层 prompt、卷纲 `buildVolumePrompt`、章节/正文数据源切换、模板上下文切换。卷纲层补契约测试。

### Phase 6：全维度验证（L）

1. 单测/组件测：store、卡片、四层 prompt、锁定守卫、旧项目兼容。
2. Electron 真实 UI：
   - 大纲工作台真实点击设定风格并锁定；
   - 验证流水线设定层卡片实时同步；
   - 解锁大纲重新编辑再锁定，风格不被清空；
   - API 对话一次，runTrace 中 `style-profile` 事件与实际请求 system prompt 都包含风格块；
   - 大纲工作台五条出口各至少一次断言：chain/plain/终稿注入；终稿须断言创建、继续生成、当前段重试、检查点恢复四条路径的 constraints 快照一致；本地变换与自动拆解断言 `injected:false` 且 reason 正确；
   - 未锁定但有非空草稿时，chain/plain/终稿均断言不注入（`reason:'style_unlocked'`），防止 v1.1 的"草稿非空即注入"口径复活；
   - 切换项目后风格不串项目，新建/清空项目后风格归零；
   - 触发 `invalidateDownstream`，风格保留；
   - 生成流水线设定/卷纲请求 prompt 中出现风格块（用 run trace 断言，不靠肉眼）；
   - 有 SKILL 与无 SKILL 双态：风格块均注入且权限/工具面断言一致（G2.13）。
3. 回头看：`rg` 双向扫描旧 `styleTags = ref` 本地链路清零；检查无新旧并存（G0.10）。

### Phase 7：文档与收尾

DEV_LOG、经验文件如需增补（本方案不新增门禁，只复用）、SKILL 层说明文档更新风格变量、台账补证据、工作区清理、版本号升级与封装。

## 5. 影响圈矩阵

| 面 | 文件 | 风险 |
|---|---|---|
| 数据 | `src/stores/project.ts` | 新字段 + 动作 + 持久化，中 |
| UI | `PipelinePanel.vue`、`OutlineWorkspace.vue`、新 `StyleProfileCard.vue` | 卡片替换但外观不变，中 |
| Prompt | 设定层/卷纲层/章节层/正文层/大纲系统提示词 | 注入文本可控，低-中 |
| 服务 | `volumeGeneration.ts` 接口扩展 | 向后兼容默认空值，低 |
| Trace | 大纲工作台 + 流水线 runTrace 事件 | 观测同步，低 |
| 测试 | store/prompt/组件/Electron 验证 | 覆盖面扩大，中 |

不触碰：API 直写权限、工具面、意图路由、EditTask、上下文压缩、SKILL 执行协议。

## 6. 难度评估

- 总体：中偏高（跨 store、两入口 UI、四层 prompt、验证矩阵），但无架构发明，全部复用现成生命周期与注入点。
- 最大风险点：不是技术，而是语义口径（见决策点）；以及"同步"若做成两套状态互推就会重演组件打架事故，本方案用单源 + 双视图从根上规避。
- 自审新增的实现雷点已并入：显式持久化白名单（否则字段静默丢失）、项目切换隔离、scoped 样式迁移、多出口消息组装、模板变量测试同批迁移。

## 7. 已裁决决策点（v1.2 定稿）

1. **流水线卡片"不动"的口径**：外观和位置不动，内部数据源从本地 ref 换成共享 store，实现同源同步。已确认。
2. **风格锁与大纲锁的关系**：风格锁完全独立。解锁大纲、重编大纲、下游失效都不清风格，只有风格卡片自己的解锁按钮能改。已确认。
3. **AI 自动分析的归属**：保留为锁定前预填建议（一键采用/恢复建议）；锁定后 AI 永不覆盖。已确认。
4. **未锁定草稿是否注入**：不注入。仅锁定注入，未锁定草稿不进入任何 prompt、模板变量或终稿 constraints。已确认。
5. **autoDecompose 是否豁免**：豁免。信息抽取任务不接收风格约束，trace 记录 `extraction_task`。已确认。

## 8. v1.2 修订记录

1. 终稿注入从"消息构建处追加"改为 `FinalDraftRunInput.constraints` 官方通道，覆盖创建/继续/重试/恢复四条路径，并明确任务快照语义。
2. 注入条件从"锁定或草稿非空"收紧为"仅锁定"，并加入反向测试。
3. autoDecompose 从注入清单移入豁免清单，理由：抽取任务不适用创作风格。
4. 经验文件引用由不存在的 v8 校正为 v7。
5. checkpoint 不改 schema：现有 `FinalDraftTask.constraints` 已持久化并恢复，方案只负责在任务创建时传入。

## 9. 成熟度结论

- 执行器/工具层：成熟（无新协议，纯 store + prompt/constraints 注入，checkpoint 复用现有字段）。
- 应用方案/交互闭环：成熟（5 个决策点已裁决并写入验证矩阵）。
- 实现接线：成熟（注入点已核实到行级，终稿走官方 constraints 通道）。
- 验证标准：成熟（含 Electron 真实 UI、trace 断言、四路径终稿快照、未锁定反向断言、双 SKILL 态、新旧并存清零扫描）。
