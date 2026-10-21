# 2026-10-22 降级语义清零任务台账

## 1. 目标与原话

- 用户原话确认：`确认`，对应上一轮方案“同批迁移 degraded/no-contract 旧语义，补负向测试与门禁清单，并完成验证”。
- 最终可感知行为：schema 失败不再被共享执行器伪装成 `success`；composite/workspace 的 `degraded + no_contract` 不再拥有第二套放行规则；旧放行形态在实现层命中 0，并保留负向测试。
- 交付物：生产实现、测试语义、G0.10 门禁、本台账、DEV_LOG。

## 2. 门禁读证

- G0.10（七层清零与负向断言）：本轮按源码、测试、运行语义执行清零；测试中的 `step-degraded-with-output` / `step-artifact-no-contract` 命中只保留为负向断言。
- G0.12（门禁执行台账）：本文件即执行凭证，七节齐全。
- G1.5（断言锚点同批迁移）：两条旧语义测试已改为断言新结果，并新增旧形态禁止项。
- G2.9（caller 状态与产物契约分权）：`degraded` 仅描述执行器状态，不授予产物越过契约门的权限；无契约 degraded 必须显式拒绝。

## 3. 路由判定

- 加入：G0.1、G0.3、G0.4、G0.5、G0.10、G0.12、G1.1、G1.5、G2.9。
- 排除：G0.11（本轮为服务层语义与单测验证，未声称任何 Electron UI 行为）；G2.10（无新增客户 trace 复刻，本轮目标是把共享语义迁移至门禁口径，真实 trace 留给后续层级验证）。

## 4. 影响圈与作者反证

- 打算改：`realSkillExecutor`、`skillOrchestrator`、`stepArtifactAcceptance`、`workspaceArtifactAcceptance` 及其测试。
- 可能碰到：所有消费 `degraded` 的流水线层。反证方式为全量 `npm run test:services` + `npm run type-check`。
- 最可能错的假设：以为只有两条旧测试守护旧语义。反证时通过 type-check 找到 `workspaceArtifactAcceptance` 包装层存在同类第二套规则，已同步清零。

## 5. 停止条件

- `rg` 证明旧放行语义只在负向断言与新 reason 类型中出现，生产执行路径无 `step-degraded-with-output`、`step-artifact-no-contract` 放行命中。
- 全量服务测试通过；`vue-tsc --noEmit` 通过。

## 6. 执行证据

- `npm run test:services` → 187 files / 2116 tests passed。
- `npm run type-check` → exit 0。
- `rg "step-degraded-with-output|step-artifact-no-contract"` → 生产源码 0 命中；仅测试保留负向断言。
- 关键实现：`src/services/realSkillExecutor.ts:148,1147-1155`；`src/services/skillOrchestrator.ts:312-355`；`src/services/stepArtifactAcceptance.ts:21,92,147-148,333-347`；`src/services/workspaceArtifactAcceptance.ts:165-194`。

## 7. 缺口清单

- 未做真实供应商/Electron 端到端生成验证；本轮完成的是共享语义与测试闭环。流水线层的 live 回归应在下一次层级任务中按 G2.10 执行。
