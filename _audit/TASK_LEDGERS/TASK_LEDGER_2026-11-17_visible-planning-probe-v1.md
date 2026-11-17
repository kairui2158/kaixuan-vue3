# TASK LEDGER — 可见规划检测与探测语义升级 V1

## 1. 目标

供应商把输出预算耗尽在推理后，可能把英文规划写入可见通道。应用必须识别为非正文并执行一次直出重试；探测禁思考时必须区分“真抑制”与“思考搬到可见通道”。

## 2. 门禁对账

- G0.13：复用直出重试与探测动作，不新增预算、调度或 UI。
- G1.17：分类器保留中文夹英文、正常英文 stop 两个负向回归；探测补 planning-hijack 正反例。
- G1.30：承诺语义为“预算耗尽证据 + 高占比规划才拒绝”，实现与测试同口径。
- G2.9：`visible_planning` 二次失败保持 failed，不进入成功态。
- G2.11：探测结果只持久化到 provider 声明，静态候选表不是真源。

## 3. 变更与影响圈

`visiblePlanningText.ts`（新增）、`generationValidity.ts`、`realSkillExecutor.ts`、`ChatPanel.vue`、`providerThinkingProbe.ts`、`aiService.ts`、`runTrace.ts`、`physicalCallTraceProjection.ts`、`runTraceExportService.ts`、`electron/ipc/runTrace.js` 及对应 spec。请求参数快照写入物理 trace 与 payload firstSeen，不影响 payload 去重。

## 4. 作者反证

1. “英文正文会被误判”不成立：无 length finish 且无 output-at-limit 时不触发，负向测试锁定。
2. “探测会误判 no_effect 为 effective”不成立：候选 reasoning 达标但可见规划仍高时输出 `planningHijackedVisibleChannel`。
3. “参数快照会改变去重”不成立：快照在 firstSeen 侧，物理载荷 SHA256 不含快照。

## 5. 停止条件

完成：P1-P4 全部接线、定向/全量测试、type-check、build、经验与日志登记。失败或回滚条件：可见规划误杀正常英文正文、终态变 success、探测假生效、trace 去重被破坏。

## 6. 验证

1. `npx vitest run src/services/generationValidity.spec.ts src/services/realSkillExecutor.spec.ts` → 2 files / 106 tests PASS。
2. `npx vitest run` → 254 files / 2820 tests PASS。
3. `npm run type-check` exit 0；`npm run build:vue` PASS。
4. P3 探测定向 25 tests PASS；P2 请求快照 4 files / 160 tests PASS。

## 7. 缺口

真实供应商 live 烟测未做；`de-ai-v2.spec.ts` 冷启动预算标定是既有独立观测项，未混入本任务。
