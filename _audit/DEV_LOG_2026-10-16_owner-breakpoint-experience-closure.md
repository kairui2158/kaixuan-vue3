# 2026-10-16 owner 断点事故经验回写与方案

## 目标

把 2026-10-16 015556 正文层事故中的执行者盲区写入经验门禁，并产出吸取教训后的闭环修复方案。

## 交付

- 经验文件升级 v8.11：
  - G1.17 补入状态生命周期四行对账、`{执行模式} × {四种进入状态}` 验证矩阵、写入/读取/清理三列查账法。
  - G2.9 补入 chain 断点清理对称、已完成链拒绝恢复、attempt 请求指纹契约。
  - L3 归档映射登记本轮事故来源。
- 新增 `RETROSPECTIVE_2026-10-16_OWNER_BREAKPOINT_LIFECYCLE.md`：还原方案盲区、验证盲区、查账盲区，并回答“我当时为什么看不见”。
- 新增 `PROPOSAL_2026-10-16_OWNER_BREAKPOINT_LIFECYCLE_CLOSURE.md`：F1-F6 修复项、V1-V10 验证矩阵、停止条件与作者反证，等待用户审核。
- 新增任务台账 `_audit/TASK_LEDGERS/2026-10-16_owner-breakpoint-experience-closure.md`。

## 关键结论

事故由上一轮 `67b3ff3` 修复引入：owner 写入与无参清理错位导致成功断点残留，已完成链被当作恢复点消费，三次修复 attempt 零物理请求复放旧产物。上一轮 Electron 验证器实际运行 compose 模式，未进入 chain 分支，不能证明 chain 修复有效。

## 验证

- 本轮为文档与方案任务，不改生产代码。
- `git diff --check` 待本轮收尾执行；经验文件版本、G1.17、G2.9、L3 映射已逐行复核。

## 经验裁决

经验文件本轮升级 v8.11，DEV_LOG 已登记原因与变更位置。

## 缺口

## 实施与验证追记（2026-10-16）

用户确认待确认点按建议执行后，本方案已完成实施：

- F1：chain 成功终态改为 `clearBreakpoint(checkpointOwnerKey)`；清理失败写 `chain-breakpoint-clear-failed` 并使任务失败。
- F2：`getChainResumePoint` 新增 `completedChain`；completed 断点拒绝恢复并写 `chain-completed-checkpoint-rejected`。
- F3：attempt 记录请求指纹；零物理请求 attempt 判 `execution_invalid`。
- F4：folder degraded 无有效输出不再包装为正文，写 `folder-skill-degraded-with-error`。
- F5：正文长度契约前移到生成步，写 `body-chain-contract-failed`。
- F6：终步 echo 按步骤职责判定；polish 高重合不再触发重试，完全同 hash 仍触发诊断。

Electron 首跑发现契约最初误套 S1 分析步，已通过 `isBodyContractStep()` 和 `chainHandoff.role` 修正为“仅生成步契约，模板可显式声明职责”。

## 验证

- 定向：3 files / 33 tests 全绿（chainExecution、ownerBreakpointClosureWiring、bodyArtifactOrchestrator）。
- 全量：`npm run test:services`，165 files / 1937 tests 全绿。
- `npm run type-check` 通过；`npm run build:vue` 通过（仅既有警告）。
- Electron：`node scripts/verify-owner-breakpoint-closure-electron.mjs` PASSED；证据 `_audit/verification-owner-breakpoint-closure-electron/`。真实链路拒绝 completed owner 断点、S1/S2 各 1 次物理请求、S2 4 字触发契约失败、旧断点文本未入库。
- Electron 回归：`node scripts/verify-body-repair-ledger-electron.mjs` PASSED；targeted 修复仍有独立请求指纹且成功。

## 诚实边界

- V6（清理失败）与 V7（degraded 无输出）原为接线断言与源码行为路径，已在下方“故障注入补强收口”补齐 Electron 注入证据。
- V10（章节共享断点）原依赖历史回归与共享槽路径不变，已在下方补强中完成 owner/共享槽双注入验证。
- 原始 015556 trace 未写逐 token 回放器；已用同一语义 Electron 复刻覆盖事故核心路径。
- heartbeat 原只有初始帧，已升级为运行中连续采样并记录 `durationMs`。

## 故障注入补强收口

- 新增 `scripts/verify-owner-breakpoint-failure-injection-electron.mjs`，PASSED；证据 `_audit/verification-owner-breakpoint-failure-injection-electron/`，含 v6/v7/v10 三个子目录的 trace-run.json、provider-requests.json、snapshot.json、body.txt。
- V6：storage 清理失败仅注入存储层，无假 SKILL 注入；4 次物理请求；`chain-breakpoint-clear-failed`；run failed。
- V7：真实 folder degraded；4 次物理请求；`folder-skill-degraded-with-error` + `body-chain-contract-failed`；6 字短输出被 1800 字下限拒绝。
- V10：owner 断点与章节批次共享槽共存；run success；4 次物理请求；清理互不干扰。
- 根因修复：`chainExecution.ts` 的 `isBodyContractStep()` 改为 `declaredRole` 优先；两步链中 S1 `role: analysis` 不再被误判为生成步；未声明 role 时才回退位置推断，并补 `chainExecution.spec.ts` 回归。
- 验证器修复：closure 与 body-repair 脚本 heartbeat 采集器补 `durationMs()`，修复“断言升级但采集器未升级”的假失败后完整重跑通过。
- 经验文件升级 v8.12：G1.5 新增验证器断言、采集器、证据载体必须同批升级的门禁。
- 复核：`npm run test:services` 165 files / 1939 tests 全绿；`npm run type-check`、`build:vue`、`build` 通过。
- 封装：3.91.1 安装包 231,532,815 bytes，SHA256 `451167c3cc43b242dd1410d8565276925829242ef1fd161bdd790a4354a0412e`，证据 `_audit/verification-packaging-3-91-1/packaging-evidence.json`；旧 3.91.0 安装包与 blockmap 已清理。
- 边界：全部为本地 mock 供应商 Electron 验证，未覆盖外部 live 供应商。
