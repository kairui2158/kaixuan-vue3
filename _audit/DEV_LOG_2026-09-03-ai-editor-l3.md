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

## 追加收尾：P8 回归闭环（2026-09-03）

### 根因

1. 主编辑回滚探针按 `.chat-edit-command .msg-btn` 全局查找“回滚此批次”，命中了其他用例残留的 applied 批次按钮；实际回滚了错误批次，导致上下文事件断言拿不到本用例的 rolled_back 事件。
2. `chatStore.replaceMessagePair()` 在重生成前未清理 assistant 消息上的批次元数据，异步保存的旧对象存在把待确认批次回填到新消息的风险。
3. 跨用例 reload 后仅等待 Vue 根节点，异步 store 初始化可能覆盖探针注入的项目、供应商、会话与编辑器状态。

### 修复

1. `_audit/tmp/l3-main-rollback-context-v4.js`
   - 先从 `chat.activeMessages` 反向锁定 `targetId === 'l3-main-rollback-v1'` 且 `status === 'applied'` 的批次记录。
   - 应用/回滚上下文断言必须匹配该记录的 `batchId`。
   - DOM 回滚按钮按消息索引定位到本消息节点后再查找，避免跨用例按钮污染。
2. `_audit/tmp/run-l3-p8-regression.mjs`
   - reload 初始化门等待项目 ID、供应商 ID、provider 列表稳定，并额外等待 1500ms，防止异步 store 加载覆盖探针状态。
3. `src/stores/chat.ts`
   - `replaceMessagePair()` 在移除旧 assistant 消息前删除 `editorBatch`、`editorBatchTarget`、`editorBatchRecord`、`editorToolPlan`，防止重生成时旧批次元数据复活。

### P8 验证证据

- `_audit/tmp/l3-p8-regression-summary.json`：`allStepsOk: true`
  - 主编辑真实操作 4/4 通过：before 不变、批次预览打开、取消不写正文、部分接受。
  - 大纲工作台真实操作 4/4 通过：技能区恢复、部分接受、锁定拒绝、目标变化拒绝。
  - 主编辑批次上下文 4/4 通过：应用、应用上下文、回滚、回滚上下文。
  - 大纲批次上下文 4/4 通过：应用、应用上下文、回滚、回滚上下文。
- `npm run type-check`：通过。
- `npm run test:services`：78 项通过。
- `npx vitest run src/services/editorBatchRecord.spec.ts src/services/editorEditProtocol.spec.ts src/services/conversationContext.spec.ts`：通过。
- `npm run build:vue`：通过；构建后源码 Electron + CDP 复跑 P8 四用例，`allStepsOk: true`。

### 经验回写

已更新 `_audit/神意开发经验总结_v2.md` 的“原生工具调用协议经验（2026-09-03）”：

1. 批次探针必须锁定本用例 `targetId + batchId`。
2. `replaceMessagePair()` 必须清理编辑批次元数据。
3. reload 初始化门必须等待异步 store 稳定。

## 追加收尾：真实用户级增强验证（2026-09-03）

### 性能探针

- 数据规模：520,080 字符，10 条编辑命令，3 轮复跑。
- 结果文件：`_audit/tmp/l3-perf-ui-result-v1.json`
- `allStepsOk: true`，`findings: []`
- 中位数：预览首帧 15ms、命令切换 13ms、应用 195ms、撤销 124ms、最长长任务 167ms。
- 全部轮次均完成 9 条 replace + 1 条 append，撤销后恢复原稿。

### 并发探针

- 结果文件：`_audit/tmp/l3-concurrency-result-v1.json`
- 8/8 通过：预览打开后用户输入并应用、页签切换、工具循环取消、流式取消、两个批次后应用旧批次拒绝、自动保存与批次应用重叠、批次撤销与用户撤销隔离、主编辑与大纲并存批次。

### 恶意输入探针

- 结果文件：`_audit/tmp/l3-malicious-result-v1.json`
- 14/14 通过：伪造直接应用、伪造成功、系统注入、伪造工具结果、原型污染、空批次、超限批次、非法 operation、删除全稿、未知工具、非法工具参数、写次数超限、工具循环均未修改正文。

### 供应商矩阵探针

- 结果文件：`_audit/tmp/l3-provider-matrix-result-v1.json`
- 5/5 通过：OpenAI 兼容、Anthropic、Gemini、Azure 原生工具调用，以及不支持工具时的 JSON 兼容降级。

### 撤销栈根因与修复

#### 根因

`EditorPanel.vue` 监听 `editor-external-change` 时把 AI 批次写入调用 `undoRedo.pushState()`，导致批次写入进入用户编辑撤销栈。用户没有手动编辑时，下一次撤销会先回滚 AI 批次，破坏“批次回滚”和“用户撤销”两条历史线的隔离。

#### 修复

1. `src/composables/useUndoRedo.ts` 新增 `replaceCurrentSnapshot()`：只替换当前快照并清空 redo，不新增用户 undo 节点。
2. `src/components/editor/EditorPanel.vue` 的外部变更处理改用 `replaceCurrentSnapshot()`。
3. 新增 `src/composables/useUndoRedo.spec.ts` 锁定语义：AI 外部写入不创建用户撤销；已有用户编辑时用户撤销不受批次写入影响。

### 本轮验证证据

- `npm run type-check`：通过。
- `npm run test:services`：3 个文件 78 项通过。
- `npx vitest run providerTools / aiService / editorTools / editorEditBatch / editorEditService / editorBatchRecord / conversationContext / useUndoRedo`：8 个文件 108 项通过。
- `npx vitest run _audit/tmp/l3-performance-diff.spec.ts _audit/tmp/l3-performance-service.spec.ts`：2 个文件 2 项通过。
- `npm run build:vue`：通过。
- 源码 Electron（CDP 9227）+ mock 供应商：
  - `node _audit/tmp/run-l3-concurrency.mjs`：8/8 通过
  - `node _audit/tmp/run-l3-malicious.mjs`：14/14 通过
  - `node _audit/tmp/run-l3-provider-matrix.mjs`：5/5 通过

### 经验回写

已更新 `_audit/神意开发经验总结_v2.md`，新增真实用户级验证纪律：

1. CDP 探针一律使用 Node WebSocket 载体，禁止 PowerShell `ConvertTo-Json` 传输含中文 JS。
2. 批次项切换后必须恢复选中状态再应用，否则 acceptedIndexes 缺失会造成假失败。
3. mock 性能分支命令结构必须与断言一致，旧分支过滤逻辑已删除。
