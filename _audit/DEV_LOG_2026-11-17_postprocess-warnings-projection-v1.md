# 2026-11-17 postProcess warnings 投影与 3.128.5 封装

## 转达判定

1. **word-gap 长度失败应走 candidate-anchored：不属实。** 结构/格式失败（含 JSON 信封解析失败，以及字数+格式混合失败）已在 `src/services/schemaRetryFeedback.ts:336-368` 前置为 candidate-anchored，并携带完整候选；只有纯字数失败进入 `:371-425` 的 word-gap。`SKILL_HANDOFF_BODY_LAYER_FULL_PIPELINE_SPEC_2026-11-14.md:91` 与经验 G2.9 明确：反馈不带候选全文，word-gap 只带有界骨架。本轮不改路由。
2. **S1 `hook-field-ignored: warnings`：属实，已修复。** SKILL postProcess 显式返回的 warnings 现在完整投影到 trace、folder diagnostic、文本导出与工作台/流水线消费面，且不改变 advisory 语义。

## 交付

1. `RealSkillPostProcessReport.warnings` 固化为 `string[]`；执行器对缺失、空串、非字符串项归一化，只保留合法 advisory 文本。
2. `RunTraceProcessingReport` 与 folder diagnostic 增加 warnings；`attachProcessingReport` 透传；文本导出增加“警告：”段。
3. ChatPanel、OutlineWorkspace 与 PipelinePanel 两处 folder diagnostic 写入点全部携带 warnings，避免执行器已返回但 trace 丢失。
4. 新增正反向回归：合法 warnings 不触发 `hook-field-ignored`、不降级 valid 输出；缺失/非法 warnings 归一化；text 导出可见 postProcess 与 processing warnings。
5. 版本升级至 3.128.5 并完成完整封装。

## 验证

1. 定向：4 files / 136 tests PASS。
2. 全量：`npm run test:services` 252 passed / 1 failed；唯一失败是 `de-ai-v2.spec.ts` 冷 JIT 性能预算 flake（321ms > 300ms），单独重跑 14/14 PASS（241ms），非本任务回归。
3. `npm run type-check` exit 0；`npm run build` PASS；electron-builder PASS。
4. `npm run verify:packaging` PASS：安装包 `dist/神意助手-Setup-3.128.5.exe`，SHA-256 `2103f4e3b59d923fdccfc718d2c95dea46a820e02037e25d20285466502660ba`，rendererFiles 87，electronAPI methods 94，证据见 `_audit/verification-packaging-3.128.5/packaging-evidence.json`。
5. 清理：3.128.4 安装包与 blockmap 已删除；两个 3.128.5 避锁目录 `dist/win-unpacked-old-3.128.5`、`dist/win-unpacked-postdir-3.128.5` 已按路径安全检查删除；清理临时脚本已移除。

## 边界

不修改 folder SKILL；不改 word-gap/candidate-anchored 策略合同；不新增裁判、预算系统、自动调度或 UI。S2 集成夹具的“无出声”与“段1-段22”过时字段已对齐现役脚本，属预存损坏修复。
