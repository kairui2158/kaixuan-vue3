# DEV_LOG 2026-10-04 预览状态机移除与直写协议收口

## 目标

删除【修改预览 / 批准写回 / 写入未执行】旧状态机，让大纲工作台与首页 API 对话只保留单源 `editor.write` 直写协议；SKILL / Agent 只提供领域能力，执行权限仍由“意图 + 操作类型 + 执行计划模式”三元组单源决定。

## 改动

1. 删除 `src/services/outlineProposal.ts` 与对应测试，移除大纲修改预览服务。
2. 删除会话级 `pendingLongDocumentOperation` / `operationHint` / `session-operation` 传递链路：
   - `chainIntentRouter.ts` 移除旧确认路由与上下文字段；
   - `longDocumentExecutionPlanner.ts` 只保留意图与词法单源判定；
   - `workspaceSkillEngine.ts` 不再透传会话级操作提示；
   - `ChatPanel.vue` 与 `OutlineWorkspace.vue` 移除 pending 状态维护。
3. 更新帮助文案：需要修改时 AI 通过写入工具直接更新大纲并汇报结果。
4. 删除两个只验证旧预览链路的脚本：`verify-ai-editor-interaction.mjs`、`verify-outline-cocreation-stage4.mjs`。
5. 修正 `verify-skill-neutral-execution-electron.mjs` 验证口径：
   - restructure 用例改为纯“整理排序”请求；
   - mock 改为合法 `move` 命令；
   - 新增真实顺序断言，防止“目标文本本来就存在”假通过；
   - 补意图分类器响应分支，防止 maxTokens 截断导致路由失败。
6. 升级版本 3.75.0；新增 `verify-packaging-3-75-0.mjs`；更新 SKILL 交付文档适用版本。

## 验证

1. `npm run type-check`：通过。
2. `npm run test:services`：125 个测试文件、1380 条测试全部通过。
3. `node --check scripts/verify-skill-neutral-execution-electron.mjs`：通过。
4. `node scripts/verify-skill-neutral-execution-electron.mjs`：输出 `===== SKILL NEUTRAL EXECUTION ELECTRON PASSED =====`，Electron PID 79764，证据 `_audit/verification-skill-neutral-execution-electron/summary.json` 与 `final-state.png`。
5. 旧状态名扫描：生产执行层命中 0；唯一 `修改预览` 命中在 `chainIntentRouter.spec.ts`，是防旧确认路由复活的负向样本；`_audit/call-graph.*` 与历史 patch 为证据文件，不参与执行。
6. 运行结束日志出现 `run-trace-state-integrity stuckRuns healthy:false`，原因是验证器 finally 强制结束 Electron 进程后的收尾告警；本轮 run 本身通过，已在收尾时如实登记。
7. 真实 API live 复刻未执行：当前环境缺少 `SHENYI_LIVE_API_KEY`，状态为 `untested`，未用 mock 冒充。

## 经验回写

`神意开发经验总结_v7.md` G1.5 与 G1.6 已补充：

- 产品执行语义迁移时，验证器请求文案、外呼分支、断言值必须同批迁移，mock 必须覆盖意图分类器等全部真实外呼。
- mock 必须提交当前协议合法命令；结构重排必须断言前后真实顺序变化。

## 2026-10-04 复合任务成熟度补收口

### 修复内容

1. `aiService.ts` 新增终态写失败识别：`editor.write` 返回 `permission_denied`、`document_too_large_for_whole_replacement`、`invariant_violation`、`write_target_mismatch`、`final_draft_mode_active` 等不可修正错误时，立即停止工具循环并进入无工具收敛请求，禁止继续物理请求。
2. `CallAiResult.convergenceReason` 记录收敛触发原因；`agentOrchestrator.ts` 只有在 `terminal write failure:` 收敛时才转入 `stalled/write_not_executed`，普通讨论收敛与伪工具收敛不再被误判为写任务失败。
3. 1M 验证器旧断言“地图读取轮仍可写”与 2026-10-03 权限单源契约冲突；本轮改为断言地图读取轮不暴露 `editor.write`，后续明确编辑轮仍恢复写入。历史 Phase 7 的“讨论意图下长文档可写”授权已被 2026-10-03 方案明确废弃，本轮不复活旧语义。

### 验证

- `node --check scripts/verify-api-direct-write-electron.mjs`：通过。
- `npx vitest run src/services/agentOrchestrator.spec.ts src/services/agentTerminalMapping.spec.ts src/services/aiService.spec.ts src/services/editorTools.spec.ts`：4 个文件、208 条测试通过。
- `npm run build:vue`：通过。
- `node scripts/verify-api-direct-write-electron.mjs`：完整通过，末行 `===== API DIRECT WRITE ELECTRON STRESS E2E PASSED =====`；1M 场景覆盖整篇替换拒绝、只读地图轮无写工具、后续两批真实写入。
- `npm run test:services`：128 个文件、1427 条测试通过。
- `npm run type-check`：通过。

## 2026-10-05 直写复合任务实测收口

### 根因补充

1. 2026-10-04 16:23:04 运行记录并非“API 无回复”：deep 导出把正文外置到 `payload + apiResponseIndex`，不是数据丢失。旧验证器只统计内联 `responseText`，把 indexed response 误判为空回复，进而误判“卡住/未输出”。
2. `runTrace.ts` 存在两类响应证据回填缺陷：空 `responseText` patch 会覆盖已收到的正文；工具循环 finish 后顶层聚合为空时没有从 `streamText` / 物理请求回填。
3. API call 与 turn 的隐式绑定依赖 `currentTurnId`，跨异步边界启动 API call 时可能挂错 turn，导致导出的 `apiResponseIndex` 无法按 turn 对账。

### 修复

1. `StartApiCallInput` 支持显式 `turnId`；空 `responseText` patch 不再覆盖已有正文；finish 后顶层为空时回填 `streamText` / 物理请求响应；物理请求终态可把新正文回填到顶层。
2. `RUN_TRACE_SCHEMA_VERSION` 升到 14，导出断言要求每个 API call 都有 indexed response，且每个 exported turn 都能通过 `apiResponseIndex` 找到响应。
3. live 复刻验证器改为统计 `responseTextPreview`、`streamText`、`physicalCalls` 三类响应证据；修复 Node `createRequire`/Electron `safeStorage` 误入浏览器上下文的问题；补齐 `successfulWriteTurns` 等断言变量。

### 验证

1. `npx vitest run src/stores/runTrace.spec.ts`：75 条测试通过。
2. `node --check scripts/verify-outline-20261004-live-replay-electron.mjs`：通过。
3. `npm run type-check`：通过。
4. `npm run build:vue`：通过。
5. 真实 Electron + 真实 API 复刻：3/3 通过。前两轮为 `edit / restructure_and_cleanup`，完成 Word 格式重排、去重、格式与标点处理，共 12 次 `editor.write` 成功；第三轮为 `discuss`，只读且工具面不含 `editor.write`。导出 `apiResponseIndex` 覆盖 3 条响应、2717 字符，哈希与长度校验通过。证据：`_audit/verification-outline-20261004-162304-live-replay/result.json`。
6. `node scripts/verify-skill-agent-authority-electron.mjs`：4/4 用例通过；8 个 discuss 轮次全部只读，4 个 edit 轮次均由执行计划授权并成功执行 `editor.write`。证据：`_audit/verification-skill-agent-authority-v2/summary.json`。

### 教训

1. 验证器不允许只用单一内联字段判定“无回复”；deep 导出必须对 `apiResponseIndex` 与 payload 做完整性校验。
2. Node 专属 API（`createRequire`、Electron 主进程模块）不得进入 `page.evaluate` 浏览器上下文；验证器必须先 `node --check`，再跑完整 Electron 链路。
3. 第一次完整复刻虽然业务链路成功，但验证器末尾脚本缺陷导致整体失败；最终结论必须以修复后完整重跑的最后一次运行为准。

## G0.5 回头看

1. 逐行审阅本轮 diff，所有改动均归入“删除旧预览状态机并统一直写协议”目标。
2. 双向扫描生产与验证器：无旧执行链路残留；负向断言与历史证据按门禁保留。
3. 类型检查、全量服务测试、Electron 验证均为本轮证据；live 复刻明确登记为 `untested`。
4. 封装与旧产物清理结果：
   - `npm run build`：3.75.0 renderer 与 NSIS 安装包构建成功。
   - `node scripts/verify-packaging-3-75-0.mjs`：通过；安装包 `dist\神意助手-Setup-3.75.0.exe`，231,492,578 字节，SHA256 `fb9bd6bd988425501aac06327f164a055d8a99c8ac28a2ec3ba6e64be3a2bd42`，renderer 文件 74 个，electronAPI 方法 75 个，NSIS 支持自选安装目录。
   - 旧产物清理：删除 `dist\神意助手-Setup-3.74.1.exe` 与 `.blockmap`，复核不存在；`dist` 仅保留 3.75.0 一套安装产物。
   - 验证 profile `_data/skill-neutral-execution-profile` 由验证器清理，复核不存在。
   - 保留 `_audit` 历史证据与打包验证脚本，不作为旧执行链路残留。
