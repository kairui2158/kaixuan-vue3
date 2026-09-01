# 上下文记忆方案 P1 阶段报告（2026-09-01）

## 阶段状态

- [x] 新增上下文协议类型：`src/types/context.ts`
- [x] 新增 `ConversationContextService`：`src/services/conversationContextService.ts`
- [x] 新增服务层针对性单测：`src/services/conversationContextService.spec.ts`
- [x] 旧 `wa_chat_<projectId>` 只读兼容；新数据写入 `wa_ctx_<projectId>`
- [x] 项目、工作区、用途和 SKILL 作用域隔离
- [x] 最近 10 轮、摘要、全量、关闭四种历史策略具备测试
- [x] chain 上一步完整输出为独立上下文块，不由服务截断
- [x] 失败调用不会由上下文服务伪造 assistant 轮次

## 证据

### 单元测试

命令：`npx vitest run src/services/conversationContextService.spec.ts --reporter=verbose`

结果：`Test Files  1 passed (1)`，`Tests  6 passed (6)`。

### 类型检查

命令：`npx vue-tsc --noEmit`

结果：进程退出码 0，无类型错误输出。

### Vue 构建

命令：`npm run build:vue`

结果：`✓ 287 modules transformed.`，构建耗时 `4.84s`。

### 差异空白检查

命令：`git diff --check`

结果：无输出。

## 影响边界

P1 只增加协议、上下文服务和服务层单测；尚未改变大纲工作台、主页对话、公共 SKILL 引擎或流水线的调用行为。因此 P1 的“服务具备能力”不能写成“全应用已经接入”。P2 负责实际接入并重新核销。

## 遗留转入 P2

1. `src/components/common/OutlineWorkspace.vue` 的 SKILL 调用尚未读取和写回上下文。
2. `public/skill-engine.js` 尚未接受统一上下文消息，chain 失败状态仍需明确化。
3. 主页 ChatPanel 的 SKILL 预加工尚未使用 ContextService。
