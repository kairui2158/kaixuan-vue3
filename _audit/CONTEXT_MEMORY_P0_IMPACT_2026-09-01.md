# 上下文记忆 P0 影响圈台账（2026-09-01）

## 阶段边界

P0 只冻结上下文协议并记录影响圈，不改变现有对话、SKILL、流水线、供应商或持久化行为。协议类型位于 `src/types/context.ts`，当前没有运行时副作用。

## 已确认的事实来源

| 范围 | 文件与行号 | 当前事实 | P0 处理 |
|---|---|---|---|
| 普通对话消息 | `src/stores/chat.ts:5-13` | `ChatMessage` 保存 `role/content/id/ts` 及模型、Agent、标签字段 | 新协议使用兼容的 `ContextMessage`，不改旧类型 |
| 普通对话存储 | `src/stores/chat.ts:34-50` | 通过 `storageKey('chat_' + projectId)` 读写 | P0 不读写，P1 再统一服务 |
| 项目与大纲事实来源 | `src/stores/project.ts:78-96` | 大纲、设定、记忆、工作台聊天在 project store | P0 不改 store，P1 只读接入 |
| 项目加载/保存 | `src/stores/project.ts:130-193` | 项目数据由 `loadProject/saveProject` 管理 | P0 不添加上下文字段，避免导入和加载行为漂移 |
| 大纲工作台 SKILL | `src/components/common/OutlineWorkspace.vue:405-427` | SKILL 请求当前只有基础消息与执行参数 | P2 接入 ContextService |
| 大纲工作台普通对话 | `src/components/common/OutlineWorkspace.vue:1152-1200` | 普通对话已有历史/大纲拼装路径 | P2 保持行为等价并统一协议 |
| 公共 SKILL 引擎 | `public/skill-engine.js:203-221` | `_callStep` 组装 system/user 后调用 `aiRequest` | P2 增加可选上下文参数，默认保持旧行为 |
| 流水线记忆检索 | `src/components/pipeline/PipelinePanel.vue:2584-2601` | 章节调用已有 `retrieveContext` | P3 归一化形状，不重做记忆检索 |
| 统一 AI 入口 | `src/services/aiService.ts:373-587` | AI 请求通过 `callAi`，统一处理超时、重试、解析和日志 | 任何阶段不新增 HTTP 入口 |

## 本阶段改动

- 新增 `src/types/context.ts`：定义 `ContextRef`、`ContextPolicy`、`ContextBundle`、`StoredContextState` 等协议类型。
- 未修改既有 store、组件、引擎、供应商、AI 服务和项目存储逻辑。
- 未新增运行时依赖、网络请求、存储键或 UI。

## P0 验证边界

- 类型检查和 Vue 构建只证明协议类型可被工程编译，不证明上下文功能已经接通。
- SKILL 两轮连续对话、重启恢复、错误路径和真实 Electron 操作留到后续阶段，不得在 P0 报告中提前标记通过。
