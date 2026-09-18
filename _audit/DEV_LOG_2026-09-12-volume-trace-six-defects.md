# 开发日志：卷纲层运行记录六缺陷修复

日期：2026-09-12  
方案：`_audit/PROPOSAL_2026-09-12_VOLUME_TRACE_SIX_DEFECTS_FIX.md`

## 修复内容

1. **执行中现场同步**：folder 执行的流式 chunk、物理请求、真实 request messages 在执行中即写入运行记录；S2 中途导出不再缺失 system prompt 和流式进度。
2. **终态强闭合**：`finishRun()` 关闭前强制清扫所有 `running` API，异常/取消/超时路径不再遗留永久 running 调用。
3. **payload 去重**：导出按 `kind + sha256(内容)` 内容寻址去重，逻辑调用与物理请求同文时共享同一 payload，重复项记录 `duplicateCount`。
4. **chain 中间产物控制**：S1 输出注入 S2 前剥除回显的 `[相关记忆]` 与上一步标题块；新增 `chain-dedupe`、`chain-output-echo` 事件；非末步可启用 `schema.json` warning 契约。
5. **folderDiagnostics 引用化**：导出时完整 output 移入 `folder-output` payload，主文件保留 `outputPreview/outputLength/outputPayloadRef`。
6. **SKILL 交接协议**：新增 `_audit/SKILL_HANDOFF_CHAIN_INTERMEDIATE_OUTPUT.md`，约束非末步结构化输出、末步定稿、禁止复述回显。

## 验证

- `npx vitest run src/services/realSkillExecutor.spec.ts src/services/skillRouter.spec.ts src/services/chainExecution.spec.ts electron/ipc/runTrace.spec.js`：36 passed。
- 总验收：`npm run type-check` 与指定 store/executor/router/orchestrator 测试见收尾记录。
