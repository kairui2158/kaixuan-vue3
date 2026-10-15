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

- V6（清理失败）与 V7（degraded 无输出）目前为接线断言与源码行为路径，未做独立 Electron 故障注入。
- V10（章节共享断点）依赖历史回归与共享槽路径不变，本轮未新增双注入场景。
- 原始 015556 trace 未写逐 token 回放器；已用同一语义 Electron 复刻覆盖事故核心路径。
- 新验证器 heartbeat 只有初始帧，运行中停滞监控深度不足，已登记为后续验证器增强项。
