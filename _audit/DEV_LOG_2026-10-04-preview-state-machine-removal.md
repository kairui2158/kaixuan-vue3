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
