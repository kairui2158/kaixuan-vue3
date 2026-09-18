# 开发日志：2026-09-13 旧框架废弃文件清理

## 背景

多轮任务中出现“旧框架文件不适用”的提示。为避免误删仍在运行的兼容逻辑，本次清理遵循 `神意开发经验总结_v4.md` §4 删除纪律，只删除三面引用闭包确认废弃的文件，不触碰用户数据、历史资料和仍在生效的 legacy 兼容代码。

## 清理内容

1. 已删除旧架构无引用死文件：
   - `src/services/pipeline-manager.js`
   - `src/services/context-settings.js`
   - `src/services/de-ai-validators.js`
   - `src/services/utils.js`
   - `src/services/persona-engine.js`
   - `src/services/skill-template-engine.js`
   - `src/services/agent-scheduler.ts`
   - `tests/scripts/audit_ui.js`
   - `scripts/run_memory_v2_acceptance.cjs`
   - `_audit/_write_plan.cjs`
   - `_audit/tmp/`
2. 删除无调用废弃 composable：
   - `src/composables/useFindReplace.ts`；查找替换功能已分别内聚在 `EditorPanel.vue` 与 `OutlineWorkspace.vue`。
3. 删除失效验证入口与归档脚本：
   - `tests/scripts/gate_check.js`：指向不存在的 `scripts/pre_commit_gate.js`，执行必报 `MODULE_NOT_FOUND`。
   - `tests/archive/`：33 个七月旧 UI 审计脚本与重复备份，无生产/测试引用。
4. 清理误导性标记：
   - `PipelinePanel.vue` 移除未使用的 `generateNames` 解构。
   - `useAiTools.ts` 删除无调用的 deprecated `generateNames()` 与导出，命名功能以 `namingService.ts` + `useAiNaming.ts` 为唯一实现。
   - `diag.js` 中误导性的 `pipeline-manager 等守卫式消费方` 注释改为 `旧式守卫消费方`。
   - `package.json` 删除失效 `acceptance:memory-v2` 命令。
   - `docs/链路与功能参考书.md` 的当前 Service 层描述改为当前 Vue3 分层，明确 `pipeline-manager` 仅存于历史文档。
5. 三份旧架构文档保留为历史资料并补历史声明：
   - `docs/ARCHITECTURE_V2.6.md`
   - `docs/ARCHITECTURE_V2.7.md`
   - `docs/API_OUTPUT_SPEC.md`

## 保留不删的 legacy

以下 `legacy` 是仍在生效的数据/协议兼容逻辑，不是死代码：

- `electron/ipc/storage.js` 的 `legacyDir`
- `src/stores/project.ts` 的旧项目格式清理
- `src/stores/runTrace.ts` 的 v3 兼容
- `src/services/conversationContextService.ts` 的 `legacyMessages`
- `src/components/common/MemoryPanel.vue` 的 legacy items
- `src/services/de-ai.js` 的 `legacy-auto`

## 验证

- 引用闭包复扫：`rg` 确认 `pipeline-manager / context-settings / de-ai-validators / persona-engine / skill-template-engine / agent-scheduler / audit_ui / run_memory_v2_acceptance / _write_plan / tests/archive / gate_check / useFindReplace` 在 `src electron scripts tests package.json vite.config.ts` 中零命中。
- `npm install --package-lock-only`：通过，锁文件无变化。
- `npx vue-tsc --noEmit`：exit 0，无类型错误。
- `npx vitest run`：60 个测试文件、481 条用例全部通过。
- `npm run build:vue`：主构建与 provider protocols 构建均成功。

## 结论

本次只做废弃文件清理，未改变业务行为，未升级版本，未封装安装包。当前版本保持 `3.39.1`。
