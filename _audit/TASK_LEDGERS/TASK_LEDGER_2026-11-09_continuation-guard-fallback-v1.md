# TASK_LEDGER_2026-11-09_continuation-guard-fallback-v1

## 背景

上一轮已统一 SKILL 执行器内的续写自检判定，本轮按交接要求补齐流水线兜底链路、版本化、台账、全量验证与封装提交。

## 目标

1. 共享 `continuationSelfCheck` 判定，避免执行器与流水线兜底语义漂移。
2. 兜底分支命中自检注释时保持协议终点原候选，不合并续写尾巴。
3. 保留可审计事件与步骤日志，便于区分自检短路和真实续写合并。
4. 升至 3.120.0 并完成全量服务回归、type-check、构建与封装核验。

## 改动

1. 新增 `src/services/continuationSelfCheck.ts`，导出唯一判定函数，识别 `【续写检查：` 或 `已到达协议终点` + `无待续写内容`。
2. `src/services/realSkillExecutor.ts` 移除本地重复判定，改用共享模块。
3. `src/components/pipeline/PipelinePanel.vue` 在 `callApiWithAgentVariantOwned` 续写兜底分支接入同一判定：命中时不合并、保留原候选、`finishReason='stop'`，并写 `continuation-self-check-skipped` warning 与步骤日志。
4. 新增 `src/services/continuationSelfCheck.spec.ts`，覆盖标记命中、短语对命中与普通正文不误判。

## 验证

1. `npx vitest run continuationSelfCheck.spec.ts realSkillExecutor.spec.ts chapterBatchOrchestrator.spec.ts`：3 files / 92 tests passed。
2. `npm run type-check`：exit 0。
3. `npm run test:services`：250 files / 2696 tests passed。
4. `npm run build`：生成 `dist/神意助手-Setup-3.120.0.exe`。
5. `npm run verify:packaging`：`PACKAGING 3.120.0 VERIFICATION PASSED`，installer SHA256 `bc08f584a6a6b967d6ac7c962d51deacaf62920b36c9a13dd56a23475c53cd0e`，electronAPI methods 94，证据文件为 `_audit/verification-packaging-3.120.0/packaging-evidence.json`。

## 边界

1. 不修改 folder SKILL 与续写提示协议。
2. 不改变正常续写合并行为，只在显式协议终点/自检注释时短路。
3. 不改动用户既有验证产物与未关联脏文件。

## 遗留

真实 Electron GUI 手工烟测由用户实测执行；本台账不替测 UI。

## 结论

执行器主链与流水线兜底链路共用续写自检守卫，协议终点不再被兜底合并破坏。
