# DEV LOG — 正文层裸 NOT-READY 与账本保真修复

日期：2026-11-07  
版本：3.116.0 -> 3.117.0  
基线：`5439e76c`  
方案：`_audit/PROPOSAL_2026-11-07_BODY_LAYER_BARE_NOT_READY_LEDGER_DIAGNOSTICS_V1.md`

## 结论

V1.1 四项修复已全部落地：A1 裸 `[NOT-READY]` / `[BLOCK]` 接收、A2 structuredFailure 记录与 targeted 路由、A3 SKILL 阻断原文原样回传、A4 终步账本换行保真。SKILL 目录本轮保持只读。

## 修复点

1. `src/services/chapterEventDensity.ts:31`、`:100-110`：新增 handoff 阻断模式识别。裸 `[NOT-READY]` / `[BLOCK]` 返回 `chapter-narrative-not-ready`，并标记 `retryableInBodyLayer=true`；字段式 `not_ready` 保持原行为。
2. `src/services/bodyArtifactOrchestrator.ts:80-97`：新增 `resolveBodyStructuredFailure`，把 blocked 且正文为空解释为 `handoffNotReady`。
3. `src/services/bodyArtifactOrchestrator.ts:326-337`：上一轮失败存在 `handoffNotReady` 且候选正文为空时，强制下一轮进入 targeted 修复，不把 45 字阻断提示当正文短文。
4. `src/components/pipeline/PipelinePanel.vue:6470-6514`：`callBodyApi` 返回 output、structuredFailure 与 request fingerprint，正文编排器可同时消费产物和阻断元数据。
5. `src/services/bodyArtifactOrchestrator.ts:371-390`：修复 call result 分支顺序。原先先判 structuredFailure 会导致正常 structured output 被丢弃；现在先消费 output，再单独处理仅失败无产物的情况。
6. `src/services/chainExecution.ts:153-207`：终步账本文本保留换行与行级结构，`extractedMeta` 改为固定两段头形态，不再压成单行。
7. `src/services/realS2ProtectedContract.integration.spec.ts`：fixture 补齐当前 SKILL 要求的 `场景分段`、`场景字数`、`场景施工卡`；候选正文补足指标样本，消除因测试数据落后于 SKILL 契约造成的假失败。

## 验证

1. 最终全量服务测试：`npx vitest run src/services` -> 210 files / 2293 tests passed，48.94s。
2. 最终类型检查：`npm run type-check` -> exit 0。
3. 生产构建：`npm run build` -> exit 0；产物 `dist/神意助手-Setup-3.117.0.exe`（231667561 bytes）。
4. `git diff --check` -> exit 0。

## 诚实边界

本轮用单测验证了 targeted 路由：S3 返回空正文加 `handoffNotReady` 时，下一轮进入 targeted 并携带阻断原文。没有在 Electron GUI 中重新执行真实供应商烟测，因此该手工烟测保留为发布前待办。
