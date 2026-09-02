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

## 追加收尾：主编辑器取消后可再入（2026-09-03）

### 根因

1. 主编辑器批量编辑生成后，批次只保存在 `pendingEditorBatchPlan` 内存态里。用户点击“取消”后计划被丢弃，assistant 气泡没有重新预览入口，只能重新发请求。
2. 纯工具调用的最终文本为空时，占位 assistant 消息仍是空 content，只挂元数据，用户可见反馈不足。
3. 复测脚本使用通用 `.msg-btn` 查找“预览修改”，被消息操作区的其他按钮干扰。
4. Mock 服务把主编辑器 target 返回给大纲场景，导致大纲批次规划 `target_not_found`。

### 修复

1. `src/stores/chat.ts`：`ChatMessage` 新增 `editorBatch` / `editorBatchTarget`，新增 `updateMessageEditorBatch()`。
2. `src/services/editorTarget.ts`：新增 `hashEditorContent()`，用于批次生成时的内容版本校验。
3. `src/components/chat/ChatMessage.vue`：assistant 消息携带 `editorBatch` 时显示“已识别批量编辑：N 条 + 预览修改”。
4. `src/components/chat/ChatPanel.vue`：批次生成后写入消息元数据；新增 `previewEditorBatch()`，目标页签关闭或内容 hash 变化时拒绝，通过后重新规划并打开确认弹窗；纯工具批次生成可见提示文案。
5. `_audit/tmp/l3-mock-server.cjs`：按 `L3_OUTLINE` 标记动态区分主编辑器和大纲命令 target。

### 追加验证

- `npm run type-check`：通过。
- `npm run test:services`：3 个文件 78 项通过。
- `npm run build:vue`：通过。
- 源码应用主编辑器复测：`_audit/tmp/l3-main-realops-result-v11.json`，`allStepsOk: true`，取消不修改正文、取消后可重新预览、部分接受只应用第二条、恢复成功。
- 源码应用大纲复测：`_audit/tmp/l3-outline-realops-result-v14.json`，`allStepsOk: true`，部分接受、锁定拒绝、目标变化拒绝、恢复成功。
- 构建后源码应用复测：`_audit/tmp/l3-main-realops-result-v12.json`、`_audit/tmp/l3-outline-realops-result-v15.json`，两者 `allStepsOk: true`，无 runtime errors。
