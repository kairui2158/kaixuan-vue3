# API 与编辑器交互升级计划 - 等级4/5

> 版本: v1.0 | 日期: 2026-09-03
> 前置: 等级1-3 已完成
> 参考: 神意开发经验总结_v2 §1-§9
> 版本基线: 3.18.0

---

## 一、社区调研总结

### 调研项目

| 项目 | Stars | 核心能力 | 我们可借鉴点 |
|------|-------|---------|------------|
| Cline | 67.4k | 多轮 Agent 循环、工作区读写、diff 导航 | 多目标工作区、任务状态可视化 |
| OpenHands | 86k | 长任务自治、检查点恢复 | 长事务任务状态机、断点续跑 |
| Aider | 48.7k | 语义编辑、git 集成、多文件编辑 | 语义相似度定位、批量事务 |
| Continue | 35.7k | 上下文管理、工具调用 | 上下文窗口管理、工具流式展示 |
| Roo Code | 24.3k | 多模式 Agent、审批流程 | 分阶段任务审批、模式切换 |
| Open WebUI | 150.7k | 工具调用、流式展示 | 工具调用过程流式气泡 |

### 六个调研方向

1. 多目标工作区: Cline/OpenHands 允许 Agent 同时读取多个文件/工作区, 但写入仍按目标确认
2. 长事务任务: OpenHands 的任务状态机 (planning -> acting -> reviewing -> completed)
3. 语义编辑: Aider 的模糊定位 + 相似度匹配, 减少 target 不准导致的失败
4. 任务可见性: Cline 的过程流气泡, 展示 Agent 每一步在做什么
5. 检查点恢复: OpenHands 的会话级 checkpoint + 回滚
6. 工具调用协议: Open WebUI 的工具流式展示 + 用户逐工具审批

### 与我们现有能力的对比

| 维度 | 社区成熟工具 | 我们当前 | 差距 |
|------|------------|---------|------|
| 工具调用协议 | 成熟多轮循环 | 已有 6 轮上限 | 轮次限制过低 |
| 读能力 | 全工作区、全局搜索 | 单目标局部窗口 | 需要多目标读取 |
| 写能力 | 多文件、长事务 | 单目标批次 1-10 条 | 需要跨目标事务 |
| 用户审批 | 精细逐工具 | 写入必须预览确认 | 基本持平 |
| Diff 体验 | 变更窗口、导航 | 逐项接受/拒绝 | 需要定位导航 |
| 撤销/回滚 | 检查点恢复 | 普通 undo 栈 | 需要 AI 批次回滚 |
| 上下文 | 长期任务记忆 | 会话上下文 | 需要 AI 任务状态 UI |
| 覆盖范围 | 全工作区 | 主编辑器+大纲工作台 | 需要覆盖所有编辑区 |

---

## 二、当前能力审计

### 已落地能力 (等级1-3)

| 能力 | 文件 | 状态 |
|------|------|------|
| 工具协议归一化 | providerTools.ts | 已完成 |
| ToolGateway 网关 | editorTools.ts L1-L50 | 已完成 |
| 5 个编辑器工具 | editorTools.ts (get_state/search/locate/replace/insert) | 已完成 |
| AI 工具循环 | aiService.ts L813 (MAX_ROUNDS=6) | 已完成 |
| 编辑器批次记录 | editorBatchRecord.ts | 已完成 |
| batchId 持久化 | editorBatchRecord.ts | 已完成 |
| AI 计划状态 UI | ChatMessage.vue L22 | 已完成 |
| 批次回滚入口 | ChatMessage.vue L84 | 已完成 |
| Diff 模态框 | DiffModal.vue | 已完成 |
| 语义模糊定位 | editorTools.ts locate | 已完成 |
| 会话上下文记忆 | conversationContextService.ts | 已完成 |
| 续生成按钮 | ChatMessage.vue | 已完成 |

### 未落地能力 (等级4-5目标)

| 能力 | 当前状态 | 目标 |
|------|---------|------|
| 多目标工作区读取 | 只有单目标 | 大纲/设定/章节多目标读取 |
| 长事务任务状态机 | 无 | Plan->Act->Review->Complete |
| 任务断点续跑 | 章节级 breakpoint | SKILL 级断点 |
| 工具调用过程流式展示 | 一次性展示 | 逐步流式气泡 |
| Diff 定位导航 | 逐项列表 | 跳转/锚点导航 |
| 全编辑区覆盖 | 主编辑器+大纲工作台 | 卷纲/章节/设定全覆盖 |

---

## 三、等级4: 多目标工作区

### 3.1 设计目标

让 AI 能同时读取大纲、设定、章节等多个编辑目标, 但写入仍按目标逐个确认。

### 3.2 新增读取工具

| 工具名 | 用途 | 安全边界 |
|--------|------|---------|
| multi_get_state | 获取多个编辑目标的文本和元数据 | 只读 |
| global_search | 跨所有编辑目标搜索关键词 | 只读 |
| workspace_summary | 获取整个工作区结构概览 | 只读 |

### 3.3 AgentToolContext 扩展

```typescript
interface AgentToolContext {
  targetId: string;          // 当前编辑目标
  workspace: string;         // workspace 标识
  purpose: string;           // 用途
  readableTargets: string[];  // 可读取的目标列表
  writableTarget: string;     // 唯一可写目标
}
```

### 3.4 安全边界

- 读取: 允许跨目标 (大纲/设定/章节/卷纲)
- 写入: 仍保持单目标, 用户逐个确认
- 不允许 AI 自行切换写入目标
- 多目标读取结果在气泡中以折叠列表展示

---

## 四、等级5: 长事务任务

### 4.1 设计目标

让 AI 能执行“整理全卷伏笔”这类需要分步读、分批提、每批确认、失败续跑的长任务。

### 4.2 Plan/Act 分离

```typescript
type TaskState = 'planning' | 'acting' | 'reviewing' | 'completed' | 'failed' | 'paused';

interface TaskPlan {
  taskId: string;
  description: string;
  steps: TaskStep[];
  currentStep: number;
  state: TaskState;
  createdAt: number;
  updatedAt: number;
}

interface TaskStep {
  stepId: string;
  action: string;
  targetId: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  result?: string;
  error?: string;
}
```

### 4.3 任务状态 UI

在 API 气泡内展示:
- 当前任务名称
- 步骤进度 (3/7)
- 每步状态图标 (完成/进行中/待执行/失败)
- 暂停/恢复按钮
- 失败步骤的重试按钮

### 4.4 断点续跑扩展

扩展现有 chainBreakpoint.ts:
- 保存粒度从章节级细化到 SKILL 级
- 每步保存: 层级 + SKILL ID + 顺序 + Agent ID + 输入 + 输出 + 状态 + 错误 + 重试次数
- 恢复时从失败步骤继续, 不是从头跑

### 4.5 Plan 模式轮次

- Plan 模式最多 20 轮 (当前 Act 模式 6 轮)
- Plan 阶段只读不写
- Act 阶段每批写入仍需用户确认

---

## 五、语义编辑增强

### 5.1 模糊定位升级

- 精确匹配: 优先尝试
- 模糊匹配: Levenshtein 块匹配, 阈值 0.6
- 语义相似度: 使用嵌入向量 (可选, 后期)
- 定位建议: 匹配失败时返回候选位置列表

### 5.2 定位失败处理

```
locate 失败 -> 返回候选列表 -> AI 选择候选 -> 再次确认 -> 用户确认
```

---

## 六、任务可见性

### 6.1 工具调用过程流式展示

```typescript
interface ToolCallStreamEvent {
  type: 'tool_start' | 'tool_progress' | 'tool_result' | 'tool_error';
  toolName: string;
  stepDescription: string;
  targetId?: string;
  timestamp: number;
}
```

### 6.2 气泡内过程流

在 AI 气泡内以可折叠列表展示:
- 工具名 + 步骤描述
- 实时状态 (进行中旋转图标)
- 结果摘要 (点击展开)
- 失败原因 + 重试按钮

---

## 七、执行计划 (P0-P8)

### P0: 准备与影响圈扫描

- 读取经验文件 V2 全文, 确认 §1-§9 规则
- rg 扫描所有 ChatPanel/askAi/coCreation 引用点
- 列出所有编辑目标组件 (EditorPanel/OutlineWorkbench/卷纲/章节/设定)
- 确认版本基线 3.18.0
- 经验引用: §1 M1 (影响圈扫描), §3 规则 8 (前置快照)

### P1: 多目标读取工具

- 在 editorTools.ts 新增 multi_get_state, global_search, workspace_summary 三个只读工具
- 扩展 AgentToolContext 增加 readableTargets 字段
- 在 ToolGateway 注册新工具
- 工具定义中标注 write: false 安全标记
- 经验引用: §1 M5 (配置包封), §8 规则 1 (统一入口)

### P2: 多目标写入安全边界

- 确认写入仍走现有 replace/insert 工具
- writableTarget 在每次工具调用时校验
- AI 不能自行切换 writableTarget
- 切换写入目标需要用户在 UI 明确操作
- 经验引用: §8 规则 9 (失败不伪装成功), §3 规则 1 (真实 Electron)

### P3: 任务状态机

- 新建 src/renderer/stores/aiTaskStore.ts
- 定义 TaskPlan, TaskStep, TaskState 类型
- 实现 create/update/pause/resume/fail 方法
- 持久化到 wa_ai_task_<projectId> 存储键
- 经验引用: §7 规则 6 (项目 ID 前缀), §1 M5 (配置包封)

### P4: 任务状态 UI

- 在 ChatMessage.vue 新增任务状态展示区域
- 步骤进度条 + 状态图标
- 暂停/恢复/重试按钮
- 失败步骤红色标记
- 经验引用: §5 规则 3 (嵌入式 UI), §5 规则 8 (flex min-width)

### P5: 工具调用过程流式展示

- 在 aiService.ts 工具循环中新增 ToolCallStreamEvent 事件
- 流式事件通过 providerNet:stream 通道传递
- ChatMessage.vue 气泡内渲染过程流列表
- 每步可折叠展开
- 经验引用: §8 规则 18 (双通道), §2 规则 28 (Node WebSocket)

### P6: 断点续跑扩展

- 扩展 chainBreakpoint.ts 支持 SKILL 级粒度
- 每步保存完整上下文 (层级/SKILL ID/Agent/输入/输出/状态/错误/重试)
- 恢复时从失败步骤继续
- 在任务 UI 中展示可恢复断点
- 经验引用: §8 规则 29 (续生成与 breakpoint 分开), §3 规则 7 (阶段验证)

### P7: 语义编辑增强

- 升级 locate 工具支持候选列表返回
- 匹配失败时返回 Top-3 候选位置
- AI 选择候选后再次确认
- 候选列表在 DiffModal 中展示
- 经验引用: §8 规则 38 (规划拒绝时降级), §8 规则 39 (pendingEditorBatchPlan)

### P8: 全应用覆盖验证

- 确认以下所有 ChatPanel 均支持新能力:
  - 主编辑器 ChatPanel
  - 大纲工作台 ChatPanel
  - 卷纲层 ChatPanel
  - 章节层 ChatPanel
  - 设定层 ChatPanel
- 确认续生成按钮在所有气泡中可用
- 确认上下文记忆在所有面板中生效
- 确认工具调用过程流在所有面板中展示
- 经验引用: §3 规则 1-4 (真实 Electron + CDP 验证)

---

## 八、风险矩阵与验收标准

### 风险矩阵

| 风险 | 等级 | 缓解措施 | 经验引用 |
|------|------|---------|---------|
| 多目标读取导致上下文爆炸 | 高 | 限制 readableTargets 数量为 5 | §8 规则 15 |
| 任务状态机持久化失败 | 中 | 原子写流程 | §7 规则 1-3 |
| 工具循环轮次不足 | 高 | Plan 20轮, Act 6轮 | §8 规则 6 |
| saveConfig 死循环 | 高 | 不重新赋值 config.value | §1 规则 6 |
| CDP 验证超时 | 中 | 不用 CDP, 改用源 Electron + 用户实测 | §2 规则 37 |
| 脚本编码损坏 | 高 | 使用 .py/.cjs 文件 | §2 规则 28 |
| AI 批次回滚不完整 | 中 | batchId 持久化 + 回滚验证 | §7 规则 19 |
| 工具调用结果未展示 | 中 | 流式事件必须触发 UI | §5 规则 6 |
| 多供应商工具协议不一致 | 高 | 归一化 | §8 规则 35-36 |
| assistant 占位消息残留 | 中 | replaceMessagePair 清理 | §8 规则 41 |

### 验收标准 (精细化)

| 编号 | 验收项 | 验证方式 | 通过标准 |
|------|--------|---------|---------|
| A | 多目标读取工具注册 | npm run build:vue | type-check 通过 |
| B | 多目标读取返回正确数据 | 源 Electron + 用户实测 | 3 个目标可读 |
| C | 写入仍为单目标确认 | 用户实测切换目标 | AI 无法自行切换 |
| D | 任务状态机持久化 | 创建任务->重启->恢复 | 任务状态完整 |
| E | 任务状态 UI 展示 | 用户实测查看气泡 | 步骤进度可见 |
| F | 工具调用流式展示 | 用户实测观察气泡 | 过程逐步显示 |
| G | 断点续跑恢复 | 模拟失败->恢复 | 从失败步骤继续 |
| H | 语义定位候选列表 | 模糊匹配测试 | 返回 Top-3 候选 |
| I | 全应用覆盖 | 所有 ChatPanel 逐项检查 | 5 个面板全覆盖 |
| J | 续生成按钮 | 所有气泡检查 | 截断时可续 |
| K | 上下文记忆 | 对话连续性检查 | 跨轮次连贯 |
| L | saveConfig 无死循环 | 全应用无响应检查 | 无冻结 |

---

## 九、覆盖范围

### 需要覆盖的 API 对话面板

| 面板 | 当前状态 | 升级目标 |
|------|---------|---------|
| 主编辑器 ChatPanel | 等级3 已完成 | 等级4-5 |
| 大纲工作台 ChatPanel | 等级3 已完成 | 等级4-5 |
| 卷纲层 ChatPanel | 基础 | 等级4-5 |
| 章节层 ChatPanel | 基础 | 等级4-5 |
| 设定层 ChatPanel | 基础 | 等级4-5 |

### 需要覆盖的功能点

| 功能 | 覆盖范围 |
|------|---------|
| 续生成按钮 | 全部 5 个面板 |
| 上下文记忆 | 全部 5 个面板 |
| 工具调用 | 全部 5 个面板 |
| 任务状态展示 | 全部 5 个面板 |
| 过程流式展示 | 全部 5 个面板 |
| 批次回滚 | 全部 5 个面板 |
| 语义编辑 | 主编辑器 + 大纲工作台 |

---

## 十、非目标 (本次不做)

| 非目标 | 原因 |
|--------|------|
| MCP 协议接入 | 应用框架不支持 |
| AI 自动写入 (绕过确认) | 安全模型不允许 |
| Git 集成 | 应用不是代码编辑器 |
| 多 Agent 协同 | 复杂度过高 |
| 代码执行沙箱 | 安全风险过高 |
| 嵌入向量语义搜索 | 需要额外基础设施 |

