# DEV_LOG 2026-09-26：API 滚动状态与工具调用分层收口

## 背景

用户在 API 对话框看到流式状态条仍显示 `editor.get_state {...}` 完整工具结果。既定需求是：滚动状态只显示连接、流式字数、重试与终态；工具调用过程只进入 RunTrace 运行记录。

## 修复内容

1. 切断旧 tool-stream UI 展示链，删除重复写入拦截的 5 处 UI 展示入口。
2. `aiService.ts` 的 `tool_converged_local` 本地兜底摘要不再拼接工具名与工具结果，只给用户可读原因，并提示工具过程已进入运行记录。
3. 单测同步改为断言兜底正文不包含 `editor.search` 等工具身份信息。
4. 修正 e2e 的旧契约：
   - 取消场景输入从被意图路由拦下的“请先停住，我要取消”改为明确生成指令。
   - 会话式 trace 导出快照保持 `running` 属于设计行为，断言改为校验 `sessionSnapshot=true`，并把上一轮取消状态作为快照内 turn 状态对账。
   - 补充流式收敛请求分支：收敛请求不带 tools，mock 必须返回正文 SSE。
   - 失败场景补现场 dump，避免再次静默等待。
5. `verify-api-live-status-electron.mjs` 已验证：UI 无工具名、RunTrace 记录 `editor.get_state`、物理请求 >= 2、状态栏无工具词。

## 验证证据

- `node scripts/verify-outline-silent-wait-fix-e2e.mjs`：全场景 PASS，含取消与 trace 导出。
- `npx vitest run src/services/aiService.spec.ts src/stores/runTrace.spec.ts`：172/172 PASS。
- `npm run type-check`：exit 0。
- `rg tool-stream src/`：零命中；`rg onRepeatedWriteBlocked src/components`：组件层无 UI 展示命中。

## 门禁沉淀

新增 M72：UI 滚动区禁显任何工具调用信息。工具事件只进 RunTrace 与 `tool-activity` 编辑器联动；本地兜底摘要不得包含工具名或工具结果。Electron 验证前必须重建 `dist-renderer`，禁止用旧 bundle 判定 UI 泄漏是否清除。

## 09-26 追加：guard 运行时崩溃根因与修复

用户复核发现聊天气泡仍出现 `editor.get_state {...}`。根因不是需求未做，而是 `toolStreamGuard.push` 内存在未定义函数调用 `toolTokenTokenSlice(toolTokenIndex)`，运行时异常导致 guard 失效，工具 JSON 直通聊天流。

### 修复

1. `aiService.ts` toolStreamGuard：删除未定义函数调用，改为 `this.buffer.slice(toolTokenIndex)`。
2. `ChatPanel.vue` trace 正文位：`responseText: result.text || ''`，避免兜底摘要污染运行记录正文字段。

### 验证证据

- `npx vitest run src/services/aiService.spec.ts`：115/115 PASS。
- `npm run build:vue`：exit 0，生产 bundle 已重建。
- `node scripts/verify-api-live-status-electron.mjs`：PASS，tool-first 场景断言 `#ow-chat-messages` 不含 `editor.get_state`、无 `.ow-tool-stream` 节点、RunTrace 记录 toolNames、状态条无工具词。

### 教训

M72 门禁实现本身也必须过 Electron 实测才能宣称闭环；静态 grep 断言不能覆盖运行时 crash 导致 guard 失效的回归路径。

## 09-26 追加：guard 新旧并存路径清零

用户指出旧执行路径仍残留。复查确认原 inline guard 只保护了 `callAiWithTools` 一条路径，兼容 JSON、原生工具降级 JSON、工具收敛请求三条路径可绕过。修复后 guard 收口到所有工具相关路径的公共出口：

1. `createToolStreamGuard()` 单源定义；`callAiWithTools` 的旧 inline 实现与旧接线全部删除。
2. `callAiWithoutTools` 统一挂接：`requestedTools && wantStream` 时启用 guard；trace 保存原始流 delta，UI 只接收过滤后 delta。
3. 兼容 JSON 路径与原生工具降级路径强制 `stream: false`，先收集协议 JSON，再执行工具并输出后处理正文。
4. 工具收敛请求新增内部参数 `suppressToolProtocolStream: true`，即使流式也抑制伪工具协议 JSON 进入 UI；trace 仍保留完整原文。

### 验证证据

- `npx vitest run src/services/aiService.spec.ts`：115/115 PASS。
- `npm run build:vue`：exit 0，生产 bundle 已重建。
- `node scripts/verify-api-live-status-electron.mjs`：PASS；tool-first 场景断言 UI 无 `editor.get_state`、无 `.ow-tool-stream`，RunTrace 记录工具面，状态条无工具词。
- `rg toolTokenTokenSlice src/services/aiService.ts`：零命中。
