# 编辑器与 API 对话框同步升级总方案（等级4-5 最终版）

> 版本: v2.0 | 日期: 2026-09-04
> 前置: 等级1-3 已完成并验证
> 参考: 神意开发经验总结_v2 §1-§9
> 版本基线: 3.18.0
> 状态: 待审核，不执行

---

## 零、方案修正说明

### 0.1 前版缺陷

前版 PROPOSAL_2026-09-03_API_LEVEL_4_5_PLAN.md 存在一个结构性偏差：

- 社区调研只覆盖了 API 对话框方向（Cline 工具调用、OpenHands 任务状态机等）
- 编辑器侧的升级方案是凭自身判断补充的，没有经过社区调研
- 导致方案出现「左手重右手轻」局面

### 0.2 本版修正

本版对编辑器侧做了补充社区调研，调研对象包括：

| 项目 | Stars | 编辑器侧借鉴点 |
|------|-------|--------------|
| Cline (Roo-Code fork) | 67k+ | diff 面板内嵌编辑器、多文件 tab 管理、撤销栈与 AI 批次绑定 |
| OpenHands | 86k | 工作区快照 checkpoint、编辑器状态持久化与恢复 |
| LobeChat | 52k | 气泡内富文本编辑、消息内联操作按钮组、工具调用结果折叠展示 |
| CherryStudio | 20k+ | 桌面端 Electron 编辑器与 API 对话框的布局协调、Markdown 渲染与选区联动 |
| CoolCline | fork | 工具调用过程在编辑器侧实时高亮定位行 |

### 0.3 核心结论

社区成熟工具的共同特征是「编辑器和对话框是同一个工作单元的两面」，具体表现为：

1. 编辑器感知 API 状态：编辑器知道当前 AI 正在读哪段、改哪段
2. API 感知编辑器上下文：API 对话框知道当前编辑器打开了哪个目标、选区在哪里
3. 共享撤销/回滚：AI 的写入批次和用户的编辑操作在同一个撤销/回滚栈
4. 工具调用结果双向展示：API 气泡展示过程，编辑器侧高亮目标区域

我们当前等级3 已实现 1 和 2 的基础版本，但 3 和 4 还不完整。等级4-5 需要补齐。

---

## 一、当前架构审计

### 1.1 已落地能力清单

| 能力 | 文件 | 行号 | 状态 |
|------|------|------|------|
| 工具协议归一化 | providerTools.ts | L1-50 | 已完成 |
| ToolGateway 网关 | editorTools.ts | L280-340 | 已完成 |
| 5 个编辑器工具 | editorTools.ts | L82-280 | 已完成 |
| AI 工具循环 | aiService.ts | L813 (MAX_ROUNDS=6) | 已完成 |
| 编辑器批次记录 | editorBatchRecord.ts | L1-80 | 已完成 |
| batchId 持久化 | editorBatchRecord.ts | L30-50 | 已完成 |
| AI 计划状态 UI | ChatMessage.vue | L22-30 | 已完成 |
| 批次回滚入口 | ChatMessage.vue | L84-90 | 已完成 |
| 语义模糊定位 | editorTools.ts locate L160-180 | 已完成 |
| 会话上下文记忆 | conversationContextService.ts | 全文件 | 已完成 |
| 续生成按钮 | ChatMessage.vue | L52 | 已完成 |
| Diff 定位导航 | EditorPanel.vue handleDiffLocate | L460-475 | 已完成 |
| 选区上下文注入 | ChatPanel.vue currentContext watch | 已完成 |
| 批次预览取消重入 | ChatPanel.vue previewEditorBatch | 已完成 |
| replaceMessagePair 清理元数据 | ChatPanel.vue | 已完成 |

### 1.2 编辑器侧当前状态

| 组件 | 文件 | 当前能力 | 缺失 |
|------|------|---------|------|
| EditorPanel.vue | src/components/editor/EditorPanel.vue | textarea 原生编辑、undo/redo 栈(50步)、查找替换、导出、去AI味、AI命名、内联菜单(21项) | AI 写入无实时高亮、无 AI 批次与 undo 栈联动、无工作区快照 |
| editorTarget.ts | src/services/editorTarget.ts | 快照、hash 校验、锁定拒绝、版本校验 | 只有单目标快照、无多目标 |
| editorEditService.ts | src/services/editorEditService.ts | 纯函数规划层(append/insert/replace_selection/replace_match/delete/rewrite) | 无语义候选返回、无跨目标规划 |
| editorEditProtocol.ts | src/services/editorEditProtocol.ts | 6 种操作、批次校验、大小限制 | 无候选列表协议 |
| editorBatchRecord.ts | src/services/editorBatchRecord.ts | batchId、status、undoAvailable | 无 SKILL 级断点、无跨批次事务 |
| useUndoRedo.ts | src/composables/useUndoRedo.ts | 50 步 undo/redo | AI 批次与用户编辑不在同一栈 |

### 1.3 API 对话框侧当前状态

| 组件 | 文件 | 当前能力 | 缺失 |
|------|------|---------|------|
| ChatPanel.vue | src/components/chat/ChatPanel.vue | 消息发送、流式、取消、重试、工具循环接入、批次预览、续生成、上下文注入 | 无多目标读取、无任务状态机、无过程流式、无全面板覆盖 |
| ChatMessage.vue | src/components/chat/ChatMessage.vue | Markdown 渲染、复制/重生成/插入/替换/续生成/批次预览/批次回滚、计划展示 | 无任务步骤进度、无工具过程流式、无候选列表展示 |

### 1.4 覆盖范围审计

| 面板 | 工具调用 | 续生成 | 上下文记忆 | 批次回滚 | 过程流式 |
|------|---------|--------|-----------|---------|----------|
| 主编辑器 ChatPanel | 已完成 | 已完成 | 已完成 | 已完成 | 未完成 |
| 大纲工作台 ChatPanel | 已完成 | 已完成 | 已完成 | 已完成 | 未完成 |
| 卷纲层 ChatPanel | 基础 | 未验证 | 未验证 | 未验证 | 未完成 |
| 章节层 ChatPanel | 基础 | 未验证 | 未验证 | 未验证 | 未完成 |
| 设定层 ChatPanel | 基础 | 未验证 | 未验证 | 未验证 | 未完成 |

---

## 二、社区调研总结

### 2.1 调研项目详情

#### Cline / Roo-Code / CoolCline（VS Code 扩展，67k+ stars）

编辑器侧核心机制：

1. Diff 面板内嵌编辑器：Cline 的 diff 不是弹窗，而是直接在编辑器内以装饰层(decoration)高亮增删行，用户在编辑器本体上接受/拒绝
2. 多文件 tab 管理：每个 AI 写入目标是一个独立 tab，tab 标题显示 dirty 状态
3. 撤销栈绑定：AI 的每个写入批次创建一个 checkpoint，checkpoint 包含 undo 信息，用户可以用 Ctrl+Z 撤销整批
4. 实时行高亮：工具调用 read_file 时编辑器高亮被读行，apply_diff 时高亮被改行

API 对话框侧核心机制：

1. 工具调用过程在气泡内以折叠列表展示，每步带图标和耗时
2. 用户可以逐工具审批（autoApprove 策略）
3. 工具错误返回结构化数据而非 throw，AI 可以根据错误调整策略

我们可借鉴：

- 编辑器侧：AI 写入时在 textarea 上做选区高亮（已有 handleDiffLocate 基础）
- API 侧：工具调用过程折叠列表（已有 editorToolPlan 基础，需要细化为逐步流式）
- 撤销栈：AI 批次 checkpoint 与 undo 栈联动

#### OpenHands（86k stars）

编辑器侧核心机制：

1. 工作区快照：每次 AI 操作前创建整个工作区的文件系统快照，失败可整体回滚
2. 编辑器状态持久化：打开的文件列表、光标位置、滚动位置全部持久化，重启后恢复

API 对话框侧核心机制：

1. 任务状态机：planning -> acting -> reviewing -> completed / failed / paused
2. 每步保存：agent + action + input + output + state + error + retry_count
3. 从失败步骤续跑，不是从头

我们可借鉴：

- 编辑器侧：工作区快照（我们的工作区是 editorStore.tabs 数组，快照 = tabs 序列化）
- API 侧：任务状态机（已在等级4-5 方案中规划，需要确认与编辑器联动）

#### LobeChat（52k stars）

编辑器侧核心机制：

无独立编辑器，但消息内联操作值得借鉴：

1. 气泡底部操作按钮组，按消息类型动态显示不同按钮
2. 工具调用结果以卡片形式内联展示在气泡内
3. 富文本编辑区域支持 Markdown 实时预览

我们可借鉴：

- API 侧：工具调用结果卡片化展示（当前是纯文本，可以升级为结构化卡片）
- 气泡底部按钮组：按消息内容类型动态显示（已有基础，需要完善条件按钮逻辑）

#### CherryStudio（20k+ stars，Electron 桌面端）

编辑器侧核心机制：

1. 桌面端布局协调：编辑区与对话区的分栏可拖拽调整宽度
2. Markdown 渲染与选区联动：选中文本后对话区自动接收选区上下文
3. 消息渲染虚拟化：大量消息时使用 CSS content-visibility

我们可借鉴：

- 编辑器侧：分栏可拖拽（我们当前是固定分栏，社区经验表明可拖拽分栏对长文创作体验提升明显）
- 消息虚拟化：我们已有 content-visibility: auto（经验文件 §8 规则确认）

### 2.2 六个方向的社区验证

| 方向 | 社区验证结论 | 我们的可落地版本 |
|------|------------|---------------|
| 多目标工作区 | Cline/OpenHands 均支持 AI 同时读多文件 | 编辑器 tabs 作为多目标，AI 可读全部 tab 但只写当前 tab |
| 长事务任务 | OpenHands 的 Plan/Act/Review 状态机 | aiTaskStore + 任务步骤 UI |
| 语义编辑 | Aider 的模糊定位 + 相似度 | 已有精确匹配 + 候选列表返回 |
| 任务可见性 | Cline 的过程流气泡 | 工具调用流式事件 + 气泡内折叠列表 |
| 检查点恢复 | OpenHands 的工作区快照 | editorStore tabs 序列化 + AI 批次 checkpoint |
| 工具调用协议 | Open WebUI 的工具流式展示 + 用户逐工具审批 | 已有 ToolGateway + 6 轮循环，升级为流式事件 + 20 轮 Plan 模式 |

### 2.3 与我们现有能力的对比

| 维度 | 社区成熟工具 | 我们当前 | 差距 | 编辑器侧需升级 |
|------|------------|---------|------|--------------|
| 工具调用协议 | 成熟多轮循环 | 6 轮上限 | Plan 20 轮 | 无 |
| 读能力 | 全工作区、全局搜索 | 单目标局部窗口 | 多目标读取 | editorStore.tabs 作为目标源 |
| 写能力 | 多文件、长事务 | 单目标批次 1-10 条 | 跨目标事务(只读) | 无(写仍单目标) |
| 用户审批 | 精细逐工具 | 写入必须预览确认 | 基本持平 | 无 |
| Diff 体验 | 变更窗口、导航 | 逐项接受/拒绝 + 定位 | 已有定位 | 可选：选区高亮增强 |
| 撤销/回滚 | 检查点恢复 | undo 栈 + 批次回滚 | AI 批次与 undo 栈联动 | useUndoRedo 集成批次 checkpoint |
| 上下文 | 长期任务记忆 | 会话上下文 | AI 任务状态 UI | 无 |
| 覆盖范围 | 全工作区 | 主编辑器+大纲工作台 | 5 面板全覆盖 | 各面板 EditorPanel 统一 |
| 编辑器实时反馈 | Cline 行高亮 | handleDiffLocate 基础 | AI 操作时编辑器高亮 | 选区高亮 + 滚动定位增强 |
| 分栏布局 | CherryStudio 可拖拽 | 固定分栏 | 可拖拽分栏 | 可选(独立 P 步) |

---

## 三、等级4：多目标工作区（编辑器 + API 同步升级）

### 3.1 设计目标

让 AI 能同时读取大纲、设定、章节等多个编辑目标，但写入仍按当前目标逐个确认。

### 3.2 编辑器侧升级

#### 3.2.1 多目标快照源

当前 editorTools.ts 的 getSnapshot() 只返回当前 activeTab 的快照。升级为从 editorStore.tabs 获取全部目标快照。

#### 3.2.2 新增读取工具

| 工具名 | 用途 | 安全边界 | 编辑器侧变化 |
|--------|------|---------|------------|
| multi_get_state | 获取多个编辑目标的摘要 | 只读 | 无 UI 变化，数据从 tabs 读取 |
| global_search | 跨所有 tab 搜索关键词 | 只读 | 搜索结果带 tabId + 位置，API 侧展示 |
| workspace_summary | 获取整个工作区结构概览 | 只读 | 返回 tabs 列表 + 每个摘要 |

#### 3.2.3 AgentToolContext 扩展

```typescript
interface AgentToolContext {
  projectId: string
  workspace: "main" | "outline"
  targetId: string
  readableTargets: string[]
  writableTarget: string
  sessionId: string
  iteration: number
  abortSignal?: AbortSignal
}
```

#### 3.2.4 安全边界

- 读取：允许跨目标（大纲/设定/章节/卷纲）
- 写入：仍保持单目标，用户逐个确认
- AI 不能自行切换 writableTarget
- 多目标读取结果在气泡中以折叠列表展示

#### 3.2.5 编辑器高亮增强

当 AI 使用 multi_get_state 或 global_search 读取某个 tab 时，编辑器侧：

1. 该 tab 标题闪烁标记（类似 dirty 但用不同颜色）
2. 如果是当前 activeTab，高亮被读取的选区
3. 通过 ToolEventSink 事件驱动，不直接操作 DOM

经验引用：§1 M4（隐藏状态保护）——闪烁标记是临时状态，不改 tab.isDirty

### 3.3 API 对话框侧升级

#### 3.3.1 多目标读取结果展示

在 ChatMessage.vue 气泡内新增折叠列表区域展示读取了哪些目标。

#### 3.3.2 global_search 结果展示

搜索结果在气泡内以表格/列表展示，每条带 tab 名称和匹配数。

---

## 四、等级5：长事务任务（编辑器 + API 同步升级）

### 4.1 设计目标

让 AI 能执行「整理全卷伏笔」这类需要分步读、分批提、每批确认、失败续跑的长任务。

### 4.2 任务状态机

```typescript
type TaskState = "planning" | "acting" | "reviewing" | "completed" | "failed" | "paused"

interface TaskPlan {
  taskId: string
  description: string
  steps: TaskStep[]
  currentStep: number
  state: TaskState
  createdAt: number
  updatedAt: number
}

interface TaskStep {
  stepId: string
  action: string
  targetId: string
  status: "pending" | "running" | "done" | "failed" | "skipped"
  result?: string
  error?: string
}
```

### 4.3 编辑器侧升级

#### 4.3.1 AI 批次与 undo 栈联动

当前 useUndoRedo.ts 有独立的 50 步栈。升级为：

1. AI 批次应用前，向 undo 栈推入一个 checkpoint 标记
2. checkpoint 标记包含 batchId + 应用前内容快照
3. 用户按 Ctrl+Z 时，如果上一步是 AI checkpoint，恢复到 checkpoint 前的内容
4. 用户也可以在气泡内点「回滚此批次」实现同样效果

```typescript
interface UndoState {
  content: string
  isAiBatch?: boolean
  batchId?: string
}
```

经验引用：§1 规则 6（saveConfig 不得重新赋值）——undo 栈只推入数据，不反向修改 store

#### 4.3.2 工作区快照

新增 workspaceSnapshot.ts，AI 任务开始前创建 tabs 序列化快照，任务失败时可以恢复整个工作区。快照只在内存中，任务结束自动清理。

经验引用：§1 M1（影响圈声明）——快照只读 tabs，不碰 store 其他字段

#### 4.3.3 AI 操作时编辑器高亮

当 AI 执行某步骤时，如果该步骤的 targetId 对应某个 tab：

1. 自动切换到该 tab（如果用户没有手动切换）
2. 高亮被读取/写入的区域
3. 滚动到该区域

经验引用：§5 规则 8（flex min-width）——高亮层不改变编辑器布局

### 4.4 API 对话框侧升级

#### 4.4.1 任务状态 UI

在 ChatMessage.vue 气泡内新增任务状态展示区域：当前任务名称、步骤进度、每步状态图标、暂停/恢复/重试按钮。

#### 4.4.2 工具调用过程流式展示

```typescript
interface ToolCallStreamEvent {
  type: "tool_start" | "tool_progress" | "tool_result" | "tool_error"
  toolName: string
  stepDescription: string
  targetId?: string
  timestamp: number
}
```

在 AI 气泡内以可折叠列表展示工具调用过程。

#### 4.4.3 断点续跑扩展

扩展 chainBreakpoint.ts，保存粒度从章节级细化到 SKILL 级，恢复时从失败步骤继续。

经验引用：§8 规则 29（续生成与 breakpoint 分开）

### 4.5 Plan 模式轮次

- Plan 模式最多 20 轮（当前 Act 模式 6 轮）
- Plan 阶段只读不写
- Act 阶段每批写入仍需用户确认

---

## 五、语义编辑增强（编辑器 + API 同步）

### 5.1 编辑器侧

升级 locate 工具：精确匹配优先 -> 模糊匹配(Levenshtein 阈值 0.6) -> 返回 Top-3 候选位置列表。候选列表在编辑器侧高亮候选区域并滚动定位。

### 5.2 API 对话框侧

候选列表在气泡内展示，AI 可以选择候选后再次确认。

---

## 六、全应用覆盖（编辑器 + API 同步）

### 6.1 需要覆盖的面板

| 面板 | 编辑器组件 | API 组件 | 当前状态 | 升级目标 |
|------|-----------|---------|---------|---------|
| 主编辑器 | EditorPanel.vue | ChatPanel.vue | 等级3 | 等级4-5 |
| 大纲工作台 | OutlineWorkspace.vue | 内嵌 ChatPanel | 等级3 | 等级4-5 |
| 卷纲层 | PipelinePanel.vue 内 | 内嵌 ChatPanel | 基础 | 等级4-5 |
| 章节层 | PipelinePanel.vue 内 | 内嵌 ChatPanel | 基础 | 等级4-5 |
| 设定层 | PipelinePanel.vue 内 | 内嵌 ChatPanel | 基础 | 等级4-5 |

### 6.2 覆盖策略

1. 共用 ChatMessage.vue：所有面板的 AI 消息渲染统一使用同一个 ChatMessage 组件
2. 共用 editorTools.ts：所有面板的工具定义统一
3. 面板特定配置：各面板通过 AgentToolContext 的 workspace/targetId 区分
4. PipelinePanel 内嵌面板：卷纲/章节/设定层的 ChatPanel 需要确认是否已接入工具循环

经验引用：§3 规则 4（验证作用域不扩大）——每个面板必须独立验证

---

## 七、执行计划（P0-P10）

### P0: 准备与影响圈扫描

- [ ] 读取经验文件 V2 全文，确认 §1-§9 规则
- [ ] rg 扫描所有 ChatPanel/EditorPanel/editorTools/aiService/chainBreakpoint 引用点
- [ ] 列出所有编辑目标组件（EditorPanel/OutlineWorkspace/PipelinePanel 各层）
- [ ] 确认版本基线 3.18.0
- [ ] git status 确认工作区干净
- [ ] 经验引用：§1 M1（影响圈声明）、§3 规则 1（构建 != 功能）

### P1: 多目标读取工具（编辑器侧 + 工具层）

- [ ] 在 editorTools.ts 新增 multi_get_state, global_search, workspace_summary 三个只读工具
- [ ] 扩展 AgentToolContext 增加 readableTargets 字段
- [ ] 在 ToolGateway 注册新工具
- [ ] 工具定义中标注 write: false 安全标记
- [ ] multi_get_state 数据源：editorStore.tabs
- [ ] global_search 跨 tab 搜索，返回 tabId + 位置 + 上下文
- [ ] workspace_summary 返回 tabs 列表 + 每个摘要
- [ ] 经验引用：§1 M5（三面引用闭包）、§8 规则 1（统一入口）

### P2: 多目标写入安全边界（编辑器侧 + 工具层）

- [ ] 确认写入仍走现有 propose_edits 工具
- [ ] writableTarget 在每次工具调用时校验 = AgentToolContext.targetId
- [ ] AI 不能自行切换 writableTarget
- [ ] 切换写入目标需要用户在 UI 明确操作（切换 tab）
- [ ] 编辑器侧：tab 切换时更新 AgentToolContext.targetId
- [ ] 经验引用：§8 规则 9（失败不伪装成功）、§3 规则 1（真实 Electron）

### P3: AI 批次与 undo 栈联动（编辑器侧）

- [ ] 扩展 useUndoRedo.ts 支持 isAiBatch/batchId 标记
- [ ] AI 批次应用前推入 checkpoint（包含应用前内容）
- [ ] Ctrl+Z 时如果是 AI checkpoint，恢复到 checkpoint 前
- [ ] 与 ChatMessage.vue 的「回滚此批次」按钮联动（同一入口）
- [ ] 经验引用：§1 规则 6（不得重新赋值）、§8 规则 41（replaceMessagePair 清理元数据）

### P4: 工作区快照（编辑器侧）

- [ ] 新增 workspaceSnapshot.ts
- [ ] AI 任务开始前创建快照（tabs 序列化）
- [ ] 任务失败时可以恢复整个工作区
- [ ] 快照只在内存中，任务结束自动清理
- [ ] 经验引用：§1 M1（影响圈声明）、§7 规则 6（项目 ID 前缀）

### P5: 任务状态机（API 侧 + 编辑器联动）

- [ ] 新建 src/stores/aiTaskStore.ts
- [ ] 定义 TaskPlan, TaskStep, TaskState 类型
- [ ] 实现 create/update/pause/resume/fail 方法
- [ ] 持久化到 wa_ai_task_<projectId> 存储键
- [ ] 任务步骤的 targetId 与 editorStore tabs 联动
- [ ] 经验引用：§7 规则 6（项目 ID 前缀）、§1 M5（配置包封）

### P6: 任务状态 UI + 工具过程流式展示（API 侧）

- [ ] 在 ChatMessage.vue 新增任务状态展示区域
- [ ] 步骤进度条 + 状态图标
- [ ] 暂停/恢复/重试按钮
- [ ] 失败步骤红色标记
- [ ] 在 aiService.ts 工具循环中新增 ToolCallStreamEvent 事件
- [ ] 流式事件通过 providerNet:stream 通道传递
- [ ] ChatMessage.vue 气泡内渲染过程流列表
- [ ] 每步可折叠展开
- [ ] 经验引用：§5 规则 3（嵌入式 UI）、§5 规则 8（flex min-width）、§8 规则 18（双通道）

### P7: 编辑器实时反馈（编辑器侧）

- [ ] AI 读取某 tab 时，该 tab 标题临时闪烁标记
- [ ] AI 写入某 tab 时，自动切换到该 tab（如果用户没有手动切换）
- [ ] 高亮被读取/写入的区域
- [ ] 滚动到该区域
- [ ] 通过 ToolEventSink 事件驱动，不直接操作 DOM
- [ ] 经验引用：§1 M4（隐藏状态保护）、§5 规则 8（flex min-width）

### P8: 断点续跑扩展（编辑器侧 + 工具层）

- [ ] 扩展 chainBreakpoint.ts 支持 SKILL 级粒度
- [ ] 每步保存完整上下文（层级/SKILL ID/Agent/输入/输出/状态/错误/重试）
- [ ] 恢复时从失败步骤继续
- [ ] 在任务 UI 中展示可恢复断点
- [ ] 经验引用：§8 规则 29（续生成与 breakpoint 分开）、§3 规则 7（阶段验证）

### P9: 语义编辑增强（编辑器侧 + API 侧）

- [ ] 升级 locate 工具支持候选列表返回
- [ ] 匹配失败时返回 Top-3 候选位置
- [ ] AI 选择候选后再次确认
- [ ] 候选列表在 ChatMessage 气泡中展示
- [ ] 编辑器侧高亮候选区域 + 滚动定位
- [ ] 经验引用：§8 规则 38（规划拒绝时降级）、§8 规则 39（pendingEditorBatchPlan）

### P10: 全应用覆盖验证

- [ ] 确认以下所有 ChatPanel 均支持新能力：
  - 主编辑器 ChatPanel
  - 大纲工作台 ChatPanel
  - 卷纲层 ChatPanel
  - 章节层 ChatPanel
  - 设定层 ChatPanel
- [ ] 确认续生成按钮在所有气泡中可用
- [ ] 确认上下文记忆在所有面板中生效
- [ ] 确认工具调用过程流在所有面板中展示
- [ ] 确认 AI 批次回滚在所有面板中可用
- [ ] 确认多目标读取在所有面板中可用
- [ ] 确认任务状态 UI 在所有面板中展示
- [ ] 确认编辑器高亮在所有面板中生效
- [ ] 经验引用：§3 规则 1-4（真实 Electron + CDP 验证）、§3 规则 11（五个独立验证门）

---

## 八、风险矩阵与验收标准

### 风险矩阵

| 风险 | 等级 | 缓解措施 | 经验引用 |
|------|------|---------|----------|
| 多目标读取导致上下文爆炸 | 高 | 限制 readableTargets 数量为 5 | §8 规则 15 |
| 任务状态机持久化失败 | 中 | 原子写流程 | §7 规则 1-3 |
| 工具循环轮次不足 | 高 | Plan 20 轮, Act 6 轮 | §8 规则 6 |
| saveConfig 死循环 | 高 | 不重新赋值 config.value | §1 规则 6 |
| CDP 验证超时 | 中 | 不用 CDP, 改用源 Electron + 用户实测 | §2 规则 37 |
| 脚本编码损坏 | 高 | 使用 .cjs/.mjs 文件 | §2 规则 28 |
| AI 批次回滚不完整 | 中 | batchId 持久化 + 回滚验证 | §7 规则 19 |
| 工具调用结果未展示 | 中 | 流式事件必须触发 UI | §5 规则 6 |
| 多供应商工具协议不一致 | 高 | 归一化 | §8 规则 35-36 |
| assistant 占位消息残留 | 中 | replaceMessagePair 清理 | §8 规则 41 |
| undo 栈与 AI 批次冲突 | 中 | checkpoint 标记区分 | §1 规则 6 |
| 编辑器高亮干扰用户操作 | 低 | 临时状态，不改 isDirty | §1 M4 |
| 工作区快照内存泄漏 | 低 | 任务结束自动清理 | §1 M1 |
| 面板间配置串扰 | 高 | AgentToolContext 每面板独立 | §8 规则 35 |

### 验收标准（精细化）

| 编号 | 验收项 | 验证方式 | 通过标准 | 编辑器侧 |
|------|--------|---------|---------|---------|
| A | 多目标读取工具注册 | npm run build:vue | type-check 通过 | 无 |
| B | 多目标读取返回正确数据 | 源 Electron + 用户实测 | 3 个目标可读 | tabs 数据正确 |
| C | 写入仍为单目标确认 | 用户实测切换 tab | AI 无法自行切换 | tab 切换更新 context |
| D | AI 批次 undo 栈联动 | Ctrl+Z 撤销 AI 批次 | 恢复到批次前 | undoRedo checkpoint |
| E | 工作区快照恢复 | 模拟失败->恢复 | tabs 恢复 | 快照正确 |
| F | 任务状态机持久化 | 创建任务->重启->恢复 | 任务状态完整 | 无 |
| G | 任务状态 UI 展示 | 用户实测查看气泡 | 步骤进度可见 | 无 |
| H | 工具调用流式展示 | 用户实测观察气泡 | 过程逐步显示 | 无 |
| I | 编辑器实时高亮 | 用户实测观察编辑器 | AI 操作时高亮 | 闪烁 + 选区高亮 |
| J | 断点续跑恢复 | 模拟失败->恢复 | 从失败步骤继续 | 无 |
| K | 语义定位候选列表 | 模糊匹配测试 | 返回 Top-3 候选 | 候选高亮 |
| L | 全应用覆盖 | 所有 ChatPanel 逐项检查 | 5 个面板全覆盖 | 5 个面板 |
| M | 续生成按钮 | 所有气泡检查 | 截断时可续 | 无 |
| N | 上下文记忆 | 对话连续性检查 | 跨轮次连贯 | 无 |
| O | saveConfig 无死循环 | 全应用无响应检查 | 无冻结 | 无 |
| P | 改动不污染无关功能 | git diff 逐行自审 | 每行归入本次需求 | 无 |

---

## 九、非目标（本次不做）

| 非目标 | 原因 |
|--------|------|
| MCP 协议接入 | 应用框架不支持 |
| AI 自动写入（绕过确认） | 安全模型不允许 |
| Git 集成 | 应用不是代码编辑器 |
| 多 Agent 协同 | 复杂度过高 |
| 代码执行沙箱 | 安全风险过高 |
| 嵌入向量语义搜索 | 需要额外基础设施 |
| 可拖拽分栏 | 独立体验优化，不阻塞核心能力 |
| 气泡内富文本编辑 | 不是我们的产品方向 |

---

## 十、经验文件引用索引

| 阶段 | 引用规则 | 内容 |
|------|---------|------|
| P0 | §1 M1 | 影响圈声明 |
| P0 | §3 规则 1 | 构建 != 功能 |
| P1 | §1 M5 | 三面引用闭包 |
| P1 | §8 规则 1 | 统一入口 |
| P2 | §8 规则 9 | 失败不伪装成功 |
| P2 | §3 规则 1 | 真实 Electron |
| P3 | §1 规则 6 | 不得重新赋值 |
| P3 | §8 规则 41 | replaceMessagePair 清理元数据 |
| P4 | §1 M1 | 影响圈声明 |
| P4 | §7 规则 6 | 项目 ID 前缀 |
| P5 | §7 规则 6 | 项目 ID 前缀 |
| P5 | §1 M5 | 配置包封 |
| P6 | §5 规则 3 | 嵌入式 UI |
| P6 | §5 规则 8 | flex min-width |
| P6 | §8 规则 18 | 双通道 |
| P7 | §1 M4 | 隐藏状态保护 |
| P7 | §5 规则 8 | flex min-width |
| P8 | §8 规则 29 | 续生成与 breakpoint 分开 |
| P8 | §3 规则 7 | 阶段验证 |
| P9 | §8 规则 38 | 规划拒绝时降级 |
| P9 | §8 规则 39 | pendingEditorBatchPlan |
| P10 | §3 规则 1-4 | 真实 Electron + CDP 验证 |
| P10 | §3 规则 11 | 五个独立验证门 |
| 全程 | §2 规则 28 | 脚本用 .cjs/.mjs |
| 全程 | §2 规则 37 | CDP 假死降级 |
| 全程 | §1 规则 3 | 一次一个闭环 |
| 全程 | §1 M3 | diff 自审门槛 |

---

## 十一、版本与交付

- 版本基线：3.18.0
- 预期版本：3.19.0
- 交付物：源码 + 构建产物 + 经验文件更新 + 开发日志更新
- 验证方式：源 Electron 启动 + 用户实测（不使用 CDP，遵循 §2 规则 37）
