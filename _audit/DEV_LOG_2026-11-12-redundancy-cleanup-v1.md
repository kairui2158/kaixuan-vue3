# DEV LOG - 2026-11-12 - 冗余清理方案 V1 执行收口

## 交付

按用户批准的 `PROPOSAL_2026-11-12_REDUNDANCY_CLEANUP_V1.md`（V1.1）执行，裁决 D1-D5 全部按建议锁定。本轮只删不加，不新增框架、预算系统、调度器或 UI；不修改 folder SKILL。

| Phase | Commit | 内容 | 实际净变化 |
| --- | --- | --- | --- |
| P1 | `5c1ad8d1` | 退役幽灵 `editTaskExecutor`：删除实现与自 spec，收窄 depcruise 豁免，迁移 `toolLoopPolicy.spec.ts` 源码契约并保留 `normalizeToolIterations` 行为契约 | `-385` |
| P2 | `900409ba` | 删除孤儿 `chapter.ts` store；`PipelineProgressPhase` 从七枝裁剪为 `queued/requesting/terminal`；迁移 `runProgressChannel.spec.ts` 五处夹具，并把 `pipelineParallelismPhase0.spec.ts:109` 第二参数改为 detail 文本 `'修复中'` | `-65` |
| P3 | `292617f1` | 删除孤儿 `DiffModal.vue.d.ts` 和死入口 `verify:postprocess-ui-electron`；底层 `scripts/verify-postprocess-terminal-ui-electron.mjs` 按 D5 保留另议 | `-4` |

三个 commit 合计 `+9/-463`，净减 `454` 行。交付不涉及版本升级或安装包封装。

## 用途

1. 编辑任务执行语义继续由 `useEditTaskSession` 与 `editTaskService` 单源承担，移除只靠测试和工具链豁免维持生命的幽灵执行器。
2. Pipeline 进度 API 面收口为生产真实发射的三态，消除 `streaming/validating/repairing/saving` 幻影语义。
3. 删除零消费孤儿 store、孤儿 declaration 与死 npm 入口，降低后续误接线风险。
4. depcruise orphan 规则恢复真实侦测能力，不再为已删除执行器维持豁免。

## 验证

### Phase P1

1. 负向断言：`editTaskExecutor` 在 `src`、`.dependency-cruiser.cjs`、`scripts`、`package.json` 零命中；`executeEditTask|createTaskFromSnapshot|EditTaskExecute` 在 `src/electron` 零命中。
2. `npm run verify:production-wiring`：592 modules，无违规。
3. `npx vitest run src/services/toolLoopPolicy.spec.ts --run`：2 tests passed。
4. `npm run type-check`、`npm run build:vue`：通过。

### Phase P2

1. Pipeline 域负向断言：`'streaming'|'validating'|'repairing'|'saving'` 在 `runRegistry.ts`、`runProgressChannel.spec.ts`、`pipelineParallelismPhase0.spec.ts`、`stores/pipeline.ts` 零命中；非 Pipeline 的 chat/live status/Electron 流状态按豁免清单保留。
2. `npm run verify:production-wiring`：591 modules，无违规。
3. `npx vitest run src/services/pipelineParallelismPhase0.spec.ts src/services/runProgressChannel.spec.ts --run`：38 tests passed。
4. `npm run test:services`：250 files / 2734 tests passed。
5. `npm run type-check`、`npm run build:vue`：通过。

### Phase P3 与终态

1. 负向断言：`DiffModal.vue.d.ts` 在 `src/package.json/scripts` 零命中；`verify:postprocess-ui-electron` 在 `package.json/src/scripts` 零命中。
2. 终态 `npm run verify:production-wiring`：590 modules / 1975 dependencies，0 violations。
3. 终态 `npm run type-check`：通过。
4. 终态 `npm run test:services`：250 files / 2734 tests passed。
5. 终态 `npm run build:vue`：通过；`git diff --check` 无空白符错误。

## 台账

- 审计：`_audit/REDUNDANCY_AUDIT_2026-11-12.md`
- 台账：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-12_redundancy-audit-v1.md`
- 方案：`_audit/PROPOSAL_2026-11-12_REDUNDANCY_CLEANUP_V1.md`

## 边界

1. 不处理 `scripts/` 约 120+ 个孤儿资产，继续按 G1.21 生命周期独立方案。
2. 保留非 Pipeline 状态机的同名词汇，避免把 `ChatGenerationStatus`、`LiveApiStatusKind`、Electron 流状态误判为 progressPhase 残留。
3. 保留上轮继承面：`__shenyiStepArtifact` 兼容层、降AI画像冻结开关、`PipelineRunCenter.vue`、pipeline store 双导出、Agent 覆盖导入链路。
4. 不触碰用户侧未跟踪验证材料、历史台账和 docs 中文文档。
