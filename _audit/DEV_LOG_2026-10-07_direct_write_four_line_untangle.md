# 2026-10-07 API 直写四线拆解修复

## 范围

### L1 协议单源

- 新增 `src/services/skillGuidanceSanitizer.ts`：剥离 SKILL guidance 中的旧预览状态机、`await_user`、`status: pending`、权限与执行协议语义，保留文学领域能力。
- 接入：`agentOrchestrator.ts:398`、`finalDraftService.ts:194`、`realSkillExecutor.ts:263`。
- Trace 事件：`agent-skill-guidance-sanitized`。

### L2 内层停止门

- `aiService.ts:463-501`：识别 `legacy_preview_response` 与 `needs_user_handoff`。
- `agentTerminalMapping.ts:66`：终态映射。
- `agentOrchestrator.ts:250-251`：终止循环，不再续发物理请求。

### L3 预算单源

- `longDocumentWriteProtocol.ts:10-18`：`segmentCount * 2 + 6`，封顶 64；`local-transform` 为 0。
- 提示词去跑道化，不再向模型宣传可用轮次。
- 删除 `OutlineWorkspace.vue` 内联公式副本。

### L4 UI 生命周期

- `interactive_response` 事件驱动输入解锁。
- 接线：`OutlineWorkspace.vue:5280-5286`、`ChatPanel.vue:3636-3653`。

## 验证

- Electron（2026-10-07）：
  - `_audit/verification-direct-write-negative-paths/result.json`：预览拒绝、用户交接、部分写入终态三场景通过。
  - `_audit/verification-skill-agent-authority-v2/summary.json`：大纲/首页 × 有/无 SKILL 四态，权限与工具面一致。
  - `_audit/verification-api-direct-write-electron/dual-entry-equivalence.json`：双入口等价通过。
  - `_audit/verification-api-direct-write-electron/three-tier-matrix.json`：S/M/L 三档通过，100 万字 11 次请求完成局部编辑。
- 单测（2026-10-08 新鲜复跑）：
  - `npx vitest run src/services/skillGuidanceSanitizer.spec.ts src/services/agentOrchestrator.spec.ts src/services/agentTerminalMapping.spec.ts src/services/longDocumentWriteProtocol.spec.ts src/services/finalDraftService.spec.ts src/services/realSkillExecutor.spec.ts`：140/140 通过。
  - `npx vitest run src/services/aiService.spec.ts src/services/agentDialogueRuntime.spec.ts`：157/157 通过。

## 诚实边界

- 真实 live API 语义分支 `untested`：验证使用本地 provider + 真实 Electron UI。
- SKILL 手册待按 L1 净化器语义复核。
- 版本封装未执行，当前 3.76.0。

## 客户重点复验

- 加载 SKILL 后发送编辑请求，运行记录应出现 `agent-skill-guidance-sanitized`，首轮请求不应再含旧预览协议。
- 模型输出预览形态时应立即停止，不续发请求。
- 模型向用户提问时输入框应立即解锁，回答后任务可继续。
