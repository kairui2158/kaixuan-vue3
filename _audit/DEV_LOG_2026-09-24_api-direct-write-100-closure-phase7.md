# API 直写 100% 闭环 Phase 7 实测收口

## 日期与范围

- 日期：2026-09-24
- 范围：长文档工作流写授权修复、Electron 13 场景高强度实测、验证器证据缺口修复、SKILL 协议文档版本同步

## 交付内容

1. **长文档工作流写授权**
   - `src/services/dialogueToolSurface.ts` 新增 `DialogueWriteAuthorization`，`authorizeDialogueTools` 在 `long-document-workflow` 授权存在时放行 `permission.writeEditor`。
   - `src/services/aiService.ts` 的 `CallAiParams.toolPolicy` 新增 `writeAuthorization`，`evaluateWritePermission` 允许长文档工作流在 `discuss` 意图下保留写入能力。
   - `src/components/common/OutlineWorkspace.vue` 在长文档 EditTask 规划成立时，将双入口调用意图升级为 `edit` 并携带工作流授权。
   - `src/components/chat/ChatPanel.vue` 对齐同一授权路径，主页长文档工作流同样不被单句意图降级。

2. **Electron 高强度实测**
   - 执行 `node scripts/verify-api-direct-write-electron.mjs`，13 个截图场景全部通过。
   - 覆盖写入失败终态、主页混合意图写改删循环、自然语言单点编辑、长文档 EditTask、1M 字符 EditTask、上下文预算、trace 导出。
   - 1M 场景验证：整篇 `replace_document` 被硬拦截；`write_only_mode` 对多余读取发出负向导流；随后 `editor.write` 真实写入并完成批次。

3. **验证器证据缺口修复**
   - `latestRun()` 事件序列补 `turnId`，trace 断言不再跨 turn 计数。
   - `edit-task-batch-succeeded` 断言按目标 turn 过滤，修复全局计数造成的假失败。
   - 1M mock 增加第 4 次多余读取，形成 `write_only_mode` 真实负向证据。

4. **文档与版本**
   - `_audit/SKILL_HANDOFF_API_DIRECT_WRITE_TOOLS.md` 适用版本同步到 3.61.x。
   - 应用版本升级到 3.61.0。

## 验证

- `npm run test:services`：89 个文件、909 条测试通过。
- `npm run type-check`：通过。
- `npm run verify:production-wiring`：316 个模块、0 违规。
- `node scripts/verify-api-direct-write-electron.mjs`：13 场景全部通过，末行 `===== API DIRECT WRITE ELECTRON STRESS E2E PASSED =====`。
- 打包产物补充实测：3.61.0 封装后设置 `SHENYI_DIRECT_WRITE_ELECTRON=dist\win-unpacked\神意助手.exe` 重跑同一验证器，13 场景再次全部通过。Phase 8 的“Electron 级验证绑定打包产物”与 S/M/L 三档（42 字 / 91,302 字 / 1,028,903 字）在安装构建内完成，整篇替换拦截、窗口内输入、地图分段读取、批次 checkpoint、内容完整性、trace 导出全部满足。

## 后续

- Phase 8 验收对账：声明支持的 `openai-compatible`、`deepseek`、`anthropic`、`gemini`、`azure-openai` 路径均有协议级验证；live 覆盖 `openai-compatible`、`deepseek`。`anthropic / gemini / azure-openai` 因缺对应供应商密钥保持 `untested`，按方案硬约束登记为“协议级已验证 / live 未实测”，不伪装完成。
- Gold 语料 28/30，剩余 2 条必须来自真实用户 confirmed 样本回流；按 Phase 5 结论不得用合成数据伪造达标。
