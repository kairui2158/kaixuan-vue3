# 开发日志：AI-编辑器等级三交互收尾（2026-09-03）

## 范围

执行 `_audit/PROPOSAL_2026-09-02_AI_EDITOR_L3_INTERACTION.md` 的实现与验证收尾，版本从 3.15.0 升级到 3.16.0。

## 本次收尾修复

1. `src/services/providerTools.ts`、`src/services/providerProtocols.ts`
   - OpenAI 兼容路径：assistant 续轮保留原生 `tool_calls`，工具结果消息携带匹配 `tool_call_id`。
   - Anthropic 路径：保留 `tool_use` content blocks，所有 `tool_result` 合并进同一个 user 消息。
   - Gemini 路径：assistant 使用 `functionCall` parts，工具响应合并进同一个 user 消息。
2. `_audit/tmp/l3-outline-realops-v3.js`
   - 移除测试脚本自行构造 `outlineBatchTarget` 的兜底逻辑，缺失真实目标时直接失败，避免假失败误导判断。
3. `_audit/tmp/l3-main-realops-v2.js`、`_audit/tmp/l3-mock-server.cjs`
   - 等待条件改为“非空 assistant 内容 + 可见 2 项批次预览”。
   - mock 工具命令的 `replace_match.target` 与主编辑器底稿对齐。

## 验证证据

- 类型检查：`npm run type-check`，通过。
- 服务测试：`npm run test:services`，78 项通过。
- 定向测试：`providerTools / aiService / editorTools / editorEditBatch`，共 85 项通过。
- 源码构建：`npm run build:vue`，通过。
- 大纲工作台真实验测：`_audit/tmp/l3-outline-realops-result-v11.json`
  - `allStepsOk: true`
  - 无 runtime errors
  - 部分接受、锁定拒绝、目标变化拒绝均通过
  - 恢复状态成功
- 原生工具协议证据：`_audit/tmp/l3-mock-requests.log`
  - assistant `tool_calls[0].id = call_l3_N`
  - tool 消息 `tool_call_id = call_l3_N`
  - 两值匹配，证明协议续轮正确
- 主编辑器真实验测：`_audit/tmp/l3-main-realops-result-v8.json`
  - `before-unchanged: true`
  - `batch-preview-opened: true`（2 项）
  - `cancel-keeps-content: true`
  - `restored: true`

## 经验回写

已更新 `_audit/神意开发经验总结_v2.md`，新增“原生工具调用协议经验（2026-09-03）”，覆盖：

1. OpenAI 原生 `tool_calls` 与 `tool_call_id` 约束
2. Anthropic / Gemini 工具结果合并规则
3. 测试脚本禁止伪造元数据兜底
4. assistant 占位消息导致的轮询误判
5. `target_not_found` 时先对账测试底稿与工具命令
