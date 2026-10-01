# 2026-09-19 API Direct Write Protocol Maturity - Phase 3

## Scope

执行 `PROPOSAL_2026-09-19_API_DIRECT_WRITE_PROTOCOL_MATURITY_V1.md` Phase 3：跨轮写入审计与权限透明化。目标是让下一轮请求能看见上一轮工具终态，但不在聊天历史里伪造消息，也不把 run trace 全量塞回上下文。

## Changes

1. 新增 `src/services/crossTurnToolAudit.ts`：
   - `buildCrossTurnToolAudit()` 为唯一审计构建入口
   - 每个工具对保留 `toolCallId + toolName + policy + inputSummary(240字) + resultSummary + errorCode + protocolVersion`
   - 同 ID 只保留最新终态，避免重试批次滚雪球
   - 最多保留 20 条；截断时声明完整现场在 run trace
   - 检测孤儿 `tool_call`，禁止静默丢弃
2. `aiService.ts`：
   - `CallAiResult.toolAudit` 带出 compact audit
   - 无工具调用返回、每轮迭代结束、convergence、local fallback 四个出口统一构建
   - 孤儿 tool call 写 DiagLogger 错误事件
3. `conversationContextService.ts`：
   - `ContextBuildInput.toolAudit` 注入执行状态
   - `assembleMessages()` 在 workspace context 后追加 `[上一轮工具审计]` system 消息
   - 审计不进入聊天历史，不改变用户可见消息流
4. folder / text / workspace skill 链路透传 `toolAudit`：
   - `realSkillTypes.ts`
   - `realSkillExecutor.ts`
   - `workspaceSkillEngine.ts`
   - `lastRunMeta` 保留审计供 UI 消费
5. `runTrace.ts`：
   - `RunTraceApiCall.toolAudit`
   - `finishApiCall` 支持 `toolAudit`
   - 新增 `setApiCallToolAudit()`，供共创路径补写
6. `ChatPanel.vue` 与 `OutlineWorkspace.vue`：
   - 模块级保存上一轮 `toolAudit`
   - 下一轮 `buildContextBundle` 注入上一轮审计
   - direct 路径结果与共创路径 `onApiCallFinish` 都写入 run trace
   - 重置对话时同步清空审计状态

## Verification

- `npm run type-check` → exit 0
- `npx vitest run src/services/crossTurnToolAudit.spec.ts src/services/conversationContextService.spec.ts src/services/aiService.spec.ts` → 3 files / 121 tests passed
- `npx vitest run` → 71 files / 675 tests passed
- `npm run verify:production-wiring` → 273 modules / 903 dependencies, no violations
- `npm run build:vue` → success
- `node scripts/verify-api-direct-write-v2-e2e.mjs` → `API DIRECT WRITE V2 E2E PASSED`
  - 14 个真实 Electron UI 场景通过
  - 导出 trace 包含 write / reveal / presentation / diagnostics 证据

## Phase 3 Acceptance

- 成功、参数错误、权限拒绝三类工具对都进入 compact audit；测试覆盖三类摘要。
- 同 ID 重试只保留最新终态；孤儿 `tool_call` 会出现在 audit 与 DiagLogger。
- 审计注入为 system context，聊天历史不包含 `[上一轮工具审计]`。
- compact history 有 20 条上限与 240 字摘要上限，长文档多轮不线性膨胀。
- 主页 direct、主页共创、大纲 direct、大纲共创四条路径都把 `toolAudit` 写入 run trace。

## Lessons

1. 跨轮状态不能靠聊天历史补：聊天文本会被用户看到，也会被会话压缩折叠；执行事实必须走 context service 的独立 system 层。
2. 工具结果字段是 `data`，不是 `output`。为兼容模型返回写的摘要器如果猜字段名，会在第一轮真实调用时丢结果摘要。
3. run trace 保存完整现场，上下文只放 compact 摘要；这两个层面的数据形状不同，不能复用同一个对象直接注入。
