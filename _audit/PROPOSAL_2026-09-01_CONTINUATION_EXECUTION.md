# 长文本续生成执行基线

## P0 盘点结果（2026-09-01）

### 已核对事实

- 当前版本为 `3.11.0`，构建入口为 `npm run build`，类型检查为 `npm run type-check`。
- `src/services/aiService.ts:152-188` 已有统一 SSE 解析，但只返回 `text/reasoning`；`[DONE]` 仅被跳过，未归一化 `finish_reason`，所以无法判断供应商是否因长度截断。
- `src/services/aiService.ts:375-407` 已统一调用、超时、重试和日志，但 `CallAiResult` 未暴露完成原因或可续生成快照。
- `src/components/chat/ChatPanel.vue:51-56` 主页仅有取消和失败重试；`src/components/chat/ChatMessage.vue:1-47` 只有复制、重生成、插入、替换，没有通用续生成入口。
- `src/stores/chat.ts:5-18,27-39` 的消息模型没有 continuation 字段，生成状态也没有“可能截断/续生成中”。
- `src/components/pipeline/PipelinePanel.vue` 与 `src/services/pipeline-manager.js` 已有卷/章业务续生成；这属于 pipeline breakpoint，后续不复用其存储键或状态，避免混淆。
- `src/components/common/OutlineWorkspace.vue` 和 `src/components/chat/ChatPanel.vue` 已使用上下文服务；续生成必须复用上下文组装，不把完整数十万字无上限重新塞回请求。

### 影响圈

**计划修改：** `src/services/aiService.ts`、新增续生成服务/测试、`src/stores/chat.ts`、`src/components/chat/ChatMessage.vue`、`src/components/chat/ChatPanel.vue`，以及对应审计、经验与开发日志、版本号。

**可能受影响但本轮保持隔离：** `OutlineWorkspace.vue`（后续接入）、`PipelinePanel.vue`、`pipeline-manager.js`、`chainBreakpoint.ts`（只做兼容验证，不改现有业务断点语义）。

**明确不改：** 供应商适配器协议、SKILL 内容、图片/视频实现、已有 pipeline 续生成流程，除非后续测试证明通用协议造成直接回归。

### 基线证据

- `git status --short`：已有未提交改动集中在上下文记忆报告、`ChatPanel.vue` 与 `aiService.spec.ts`；本轮不覆盖、不回滚。
- `rg` 命中显示：主页气泡已有“重试”而无“续生成”；流水线已有独立“续生成章节/卷纲”；`finish_reason` 未形成 `CallAiResult` 传递链。

### P0 结论

盘点完成，后续按 P1→P8 单阶段推进。每阶段遵循经验 V2 的“改码→构建→杀进程→源应用启动→真实操作→递归验证”闭环；测试证据不足时不得标记完成。

## 当前执行边界（追加）
- 已完成：聊天单轮续生成、finish_reason 状态门、上下文窗口、快照存储、会话隔离、Electron 存储桥接兼容。
- 已核验：专项/服务层测试、类型检查、Vue 构建、源 Electron 重启。
- 未核销：真实供应商长度截断后的 UI 操作与关闭重启恢复；需要真实供应商响应和可操作的源 Electron 窗口证据。
- 未实现：把聊天 continuation 统一替换流水线现有 chain breakpoint，或为 split-merge/multi-step 建立对应可恢复阶段协议；本轮保持隔离以避免破坏既有流水线恢复语义。
