# 2026-10-22 降级语义清零收口

## 事故根因

用户追问“旧语义为何还存在、为何会被测试拦回来”。核查结论：G2.9 在 2026-10-17 升级后，只迁移了事故触发链路，`realSkillExecutor`、`skillOrchestrator` 与 workspace 验收包装层仍保留旧的“degraded 且非空即继续 / schema 失败强改 valid”语义，且 9-08、9-19 引入的测试仍在守护该行为。门禁文本存在，但门禁升级没有反查存量守护面，属 G0.12 执行缺口。

## 本轮改动

- `realSkillExecutor`：`schema-contract-warning` 纳入降级 warning 集合；schema 失败保留候选输出，但执行器结果状态为 `degraded`，不再伪装 `success`。
- `skillOrchestrator`：删除 `step-degraded-with-output` / `step-artifact-no-contract` 第二套放行规则；`degraded + no_contract` 走统一验收并拒绝，输出不进入后续步骤。
- `stepArtifactAcceptance`：新增 `no_contract_degraded` reject reason；`success + no_contract` 仍按原语义接受，`degraded + no_contract` 拒绝。
- `workspaceArtifactAcceptance`：同步删除包装层 `degraded + no_contract` 第二套放行规则，新增 `artifact_no_contract_degraded` 终态。
- 测试：两条旧语义测试迁移为断言拒绝/降级，并新增负向断言；新增两个验收单测覆盖无契约 degraded 拒绝。
- 经验文件：升级至 v8.18，G0.10 补入“门禁语义升级必须反查全仓存量测试与共享实现”的执行要求。

## 验证

- `npm run test:services`：187 files / 2116 tests 通过。
- `npm run type-check`：通过。
- `rg "step-degraded-with-output|step-artifact-no-contract"`：生产源码 0 命中；仅测试负向断言保留。
- 任务台账：`_audit/TASK_LEDGERS/2026-10-22_degraded-semantic-closure.md`。

## 诚实边界

- 本轮未做真实供应商 / Electron 端到端生成验证；登记为下一层级任务按 G2.10 补跑。
- 版本未升级、未封装；等待用户审核后再决定是否发布。
