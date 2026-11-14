# TASK LEDGER · W1/W2 遗留三项收口

## 1. 目标与原话

用户原话：剩余三项进行处理。目标是将 W1/W2 台账登记的三项独立遗留收口到可对账状态：治理物理调用放大、修正 checkpoint 恢复信封闸、澄清 `deai-model-profile` 的失败语义。交付物为最小代码修复、聚焦与全量验证、方案/台账/DEV_LOG 和单独提交。

## 2. 门禁读证

已读 `_audit/神意开发经验总结_v9.md`（v10.4.2）。适用：G0.1/G0.2/G0.3/G0.4/G0.5/G0.6/G0.7/G0.9/G0.12/G0.13/G1.14/G1.17/G1.30/G2.9。关键证据：G0.6 要求四层成熟度；G0.13 禁止过度扩展；G2.9 已登记“API 调用预算必须以物理外呼计数，并对逻辑 attempt × 物理重试放大建模”；旧台账第 7 节保留三项。

## 3. 路由判定

加入 G0.6/G0.7/G0.9/G0.12/G0.13/G1.14/G1.17/G2.9，因为跨服务与流水线行为且直接对账遗留缺陷。排除 G0.10，因为无旧执行路径退役，只修改现役参数合同与分支；排除 G0.11，因为本项不是 UI 交互验收；排除 G2.10，因为已用 2026-11-14 Live 2 原始 trace 定位同一故障，本轮是合同修复而非历史回放。不设 token/时间预算。

## 4. 影响圈与作者反证

影响圈：`apiCallBudget.ts`、`realSkillTypes.ts`、`realSkillExecutor.ts`、`PipelinePanel.vue` checkpoint 恢复、相关 spec、台账与 DEV_LOG。反证：无 `apiCallLimit` 时行为不变；S3 恢复仍要求信封；`startSi === generatorIndex` 只接受非空骨架；空串/空白不进链；总预算仍共享；预算被物理重试耗尽时抛 `budgetBlocked` 并转 blocked；旧消费者不传 `skillLimit` 不受影响。

## 5. 停止条件

通过聚焦回归、`npm run test:services`、`npm run type-check`、`npm run build:vue`、`git diff --check`、台账/DEV_LOG 回填、单独提交和工作区复核。任一失败登记缺口，不宣称闭环。

## 6. 执行证据

1. **方案**：`_audit/PROPOSAL_2026-11-15_THREE_REMAINING_ITEMS_V1.md`，含证据裁决、影响圈、反推与四层成熟度结论。
2. **聚焦回归**：`npx vitest run src/services/apiCallBudget.spec.ts src/components/pipeline/__tests__/body-resume-artifact-gate.spec.ts src/components/pipeline/__tests__/body-generator-failure-wiring.spec.ts src/services/realSkillExecutor.spec.ts src/services/chainBreakpoint.spec.ts` → `Test Files 5 passed (5)`、`Tests 102 passed (102)`。首跑暴露测试期望与 CRLF marker 两处测试问题，修正后复跑通过。
3. **全量服务回归**：`npm run test:services` → `Test Files 253 passed (253)`、`Tests 2761 passed (2761)`。
4. **静态与构建**：`npm run type-check` 首跑发现 `realSkillTypes.ts` 物理重试合同未同步，补参后 exit 0；`npm run build:vue` exit 0。
5. **三态裁决**：
   - 物理调用放大：`consumePhysicalRetry` 传入 `pkg.meta.apiCallLimit`，共享账本按同一 `used` 与步级 `apiCallLimit` 阻断，不新增计数器。
   - resume/replay 信封闸：`startSi === resolveBodyGeneratorStepIndex(templates).index` 且非空时接受生成步骨架；`generator_envelope_missing` 只保留给生成步之后的无信封输入。
   - `deai-model-profile`：代码复核 `DEAI_MODEL_PROFILE_RELEASED=true`，`eligibleRuleCount=0` 表示同一 provider+model 无规则达 5 样本；不降门限，不改代码，归类为校准数据观测项并同步旧台账。
6. **遗留边界**：无新增预算系统、调度器、UI、第二裁判或校准门限放宽；`_data/` 与 `_audit/verification-*` 证据不入库。

## 7. 缺口清单与对账

| 检查面 | 结果 | 处置 |
|---|---|---|
| 预算共享账本 | `tryConsume` 与 `consumePhysicalRetry` 均用同一 `used`，后者新增 `effectiveLimit` | 已实现，spec 锁定 |
| 步级上限 | executor 传入 `pkg.meta.apiCallLimit`，types 同步 | 已实现，type-check 通过 |
| checkpoint 生命周期 | 生成步骨架放行，后置步信封必查 | 已实现，focused spec 锁定 |
| 校准门禁 | 保持 5 样本，不改 prompt 噪声路径 | 已归类，不改代码 |
| 残留 | `rg` 无其他 `consumePhysicalRetry(` 未同步签名；恢复闸 Live 2 事件模式保留用于真实回归 | 无源码残留 |
| 未验证 | 未重跑真实 Electron 供应商链路 | 诚实登记：本轮为合同级修复；下一次真实正文层运行须检查物理调用数与 resume 事件 |
