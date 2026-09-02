# AI 编辑器等级三补完 P0 基线审计

日期：2026-09-03  
Git 基线：`9809f09 fix: AI编辑器等级三批量编辑取消后可再入`

## 范围冻结

本阶段只覆盖两个 API 对话区域：

- 主页编辑器右侧对话：`src/components/chat/ChatPanel.vue`、`src/components/chat/ChatMessage.vue`
- 大纲工作台 AI 共创：`src/components/common/OutlineWorkspace.vue`

共享底座：

- 批次规划：`src/services/editorEditBatch.ts`
- 目标快照与校验：`src/services/editorTarget.ts`
- 编辑工具：`src/services/editorTools.ts`
- 诊断日志：`src/services/editorEditDiagnostics.ts`
- Diff 弹窗：`src/components/common/DiffModal.vue` + `src/App.vue` 事件桥
- 会话持久化：`src/stores/chat.ts`、`src/stores/project.ts`

禁改区域：

- 生成流水线业务逻辑
- SKILL 编辑器与执行引擎
- 供应商基础路由与协议层
- 去 AI 味
- 续生成状态机
- 外部 MCP

## 现状引用对账

### 主页编辑器

| 位置 | 现状 |
|---|---|
| `src/components/chat/ChatPanel.vue:335` | `sendMessage()` 生成请求入口 |
| `src/components/chat/ChatPanel.vue:693` | assistant 消息挂载 `editorBatch/editorBatchTarget` |
| `src/components/chat/ChatPanel.vue:717` | 批次生成后派发 `show-diff` |
| `src/components/chat/ChatPanel.vue:820` | `callApi()` 组装上下文并调用 aiService |
| `src/components/chat/ChatPanel.vue:1014` | `buildChatEditorTools()` 创建等级三工具 |
| `src/components/chat/ChatPanel.vue:1022` | `previewEditorBatch()` 支持取消后重新预览 |
| `src/components/chat/ChatPanel.vue:1096` | `diff-applied` 监听，校验目标后写入 |
| `src/components/chat/ChatMessage.vue:6` | 气泡内批量编辑入口 |
| `src/stores/chat.ts:16` | `ChatMessage.editorBatch` |
| `src/stores/chat.ts:126` | `updateMessageEditorBatch()` |

### 大纲工作台

| 位置 | 现状 |
|---|---|
| `src/components/common/OutlineWorkspace.vue:463` | `outlineBatchMessages` 计算属性 |
| `src/components/common/OutlineWorkspace.vue:766` | `commitOutlineChange()` 大纲原子写入 |
| `src/components/common/OutlineWorkspace.vue:910` | `previewOutlineBatch()` 批次预览 |
| `src/components/common/OutlineWorkspace.vue:1388` | assistant 消息挂载 `outlineBatch/outlineBatchTarget` |
| `src/components/common/OutlineWorkspace.vue:1451` | `diff-applied` 监听，校验目标后写入 |
| `src/components/common/OutlineWorkspace.vue:1606` | `askPlainAi()` 无 SKILL 路径 |
| `src/stores/project.ts:103` | `outlineChat` 持久化字段 |
| `src/stores/project.ts:258` | `updateOutlineChatAt()` |

### 共享底座

| 位置 | 现状 |
|---|---|
| `src/services/editorEditBatch.ts:18` | `EditorEditBatchPlan`，含临时 `batchId` |
| `src/services/editorEditBatch.ts:24` | `planEditorEditBatch()` |
| `src/services/editorEditBatch.ts:85` | `applyAcceptedItems()` |
| `src/services/editorTarget.ts:25` | FNV-1a32 内容 hash |
| `src/services/editorTools.ts:63` | `createEditorTools()`，已支持 `onPlanUpdate` |
| `src/services/editorEditDiagnostics.ts:19` | `logEditorEdit()`，已支持 `batchId` |
| `src/components/common/DiffModal.vue:21` | 批次项选择 UI |
| `src/components/common/DiffModal.vue:188` | 应用时回传 `acceptedIndexes` |

## 兼容策略

1. 旧 assistant 消息没有批次记录时，不迁移、不报错、不显示回滚入口。
2. 新增字段全部 optional，旧项目 JSON 可直接读取。
3. `editorBatch/outlineBatch` 继续作为命令事实来源；新增记录只承载状态、决策与回滚元数据。
4. `DiffModal` 的 `acceptedIndexes` 协议保持不变，避免破坏现有批次部分接受能力。

## P0 结论

- 影响圈清单完成。
- 禁改清单完成。
- 旧消息兼容策略确定。
- 后续 diff 只允许落入上述文件或新增等级三专用服务/组件。
