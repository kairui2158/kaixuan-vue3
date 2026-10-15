# 任务台账：owner 断点事故经验回写与方案

## 原始目标

用户裁决三点：

1. 验证盲区、方案盲区、查账盲区必须写入经验文件并设门禁。
2. 经验文件必须总结执行者自身问题，不能只写应用过程经验。
3. 针对本次事故做详细修复方案，并吸取上一轮教训，不允许再留盲区。

## 门禁读证

- G0.12（经验文件第 110-122 行）：本台账为执行凭证。
- G1.16（第 278-284 行）：复盘不得机械复读，先还原因果与执行者盲区。
- G1.17（第 286-303 行）：本次已补入状态生命周期对账、二次进入矩阵、查账三列法。
- G2.9（第 390-401 行）：本次已补入断点清理对称、已完成链拒绝恢复、attempt 请求指纹契约。

## 路由判定

- 加入：G0.3、G0.4、G0.5、G0.9、G0.11、G0.12、G1.4、G1.5、G1.16、G1.17、G2.9、G2.10。
- 排除：G1.18（本轮不改本地确定性路径）；G1.19（本轮不是性能优化）；G2.11（供应商额度软错误已在事故分析中定界，本轮无供应商代码改动）。

## 反证

- 反证一：是否只修应用而不更新门禁？否：经验文件已升级 v8.11 并补三处规则。
- 反证二：复盘是否冒充用户提出方向？否：明确登记“盲区必须写进经验文件”由用户提出，我负责核实与展开。
- 反证三：方案是否只修 `clearBreakpoint` 单点？否：方案同时覆盖恢复语义、attempt 指纹、验证矩阵与事故 trace 回放。

## 执行记录

- 升级 `_audit/神意开发经验总结_v7.md` 到 v8.11。
- 新增 `_audit/RETROSPECTIVE_2026-10-16_OWNER_BREAKPOINT_LIFECYCLE.md`。
- 新增方案 `_audit/PROPOSAL_2026-10-16_OWNER_BREAKPOINT_LIFECYCLE_CLOSURE.md`，等待用户审核。

## 验证

- 文档差异：`git diff --check` 与内容抽查。
- 门禁行号：使用 `rg` / `Get-Content` 对 v8.11、G1.17、G2.9 逐行复核。

## 缺口清单

## 实施追记

- 方案经用户确认后执行：F1-F6 全部落地。
- Electron 首跑暴露 F5 误套 S1 分析步，追加 `isBodyContractStep()` 与 `chainHandoff.role`，已修复并新增测试。
- 验证：定向 3 files / 33 tests；全量 165 files / 1937 tests；type-check；build:vue；两个 Electron 验证器均 PASSED。
- 证据：`_audit/verification-owner-breakpoint-closure-electron/`、`_audit/verification-body-repair-ledger-electron/`。

## 收口缺口

- V6/V7/V10 已由 `scripts/verify-owner-breakpoint-failure-injection-electron.mjs` 完成真实 Electron 故障注入；证据 `_audit/verification-owner-breakpoint-failure-injection-electron/`。
- heartbeat 已升级为运行中连续采样并记录 `durationMs`；closure 与 body-repair 验证器重跑通过。
- 根因修复：`isBodyContractStep()` 改为 `declaredRole` 优先，补回归测试；全量 165 files / 1939 tests 全绿。
- 原始 015556 trace 未做逐 token 回放器，已用同语义 Electron 复刻覆盖核心事故路径。
- 本轮剩余边界：本地 mock 供应商 Electron 验证，未覆盖外部 live 供应商。
