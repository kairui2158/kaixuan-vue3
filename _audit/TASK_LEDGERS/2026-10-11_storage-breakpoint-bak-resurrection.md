# 2026-10-11 存储断点 .bak 复活修复任务台账

## 1. 目标与原话

- 用户原始目标：开始执行已确认的「流水线产物契约统一」修复与验证闭环。
- 最终可感知行为：卷纲层每一卷都完整执行 S1/S2/S3/S4；链成功后的断点清理真正生效，后续批次不再从旧 `.bak` 恢复 S4 断点。
- 本轮交付物：存储删除语义修复、红色回归测试、Electron live 验证器断言补强、真实 API live 通过证据、文档与经验回写、版本收口。

## 2. 门禁读证

- G0.3 诚实闭环：无真实链路证据不得宣称完成。
- G0.5 回头看：收尾前逐行 diff、入口/旁路、证据归属对账。
- G0.12 门禁执行台账：本文件承载七节证据。
- G1.4 验证真实性与分层：单测、回放、live 分层声明。
- G1.5 验证器自身质量：live 验证器必须断言每卷完整链而不是只看最终卷数。
- G2.8 存储与写队列：删除语义必须与原子写/备份恢复语义一致。
- G2.9 终稿与流水线：断点清理不得破坏真实失败续跑语义。

## 3. 路由判定

- 加入：G0.1/G0.3/G0.5/G0.7/G0.8/G0.9/G0.10/G0.12、G1.1/G1.4/G1.5、G2.8/G2.9。
- 排除：G2.1-G2.7，本轮不改 API 直写、长文档、编辑器、上下文预算。
- 排除：G2.10，本轮 live 验证是新链路验收；客户历史 trace 回放仍在原方案收尾项中执行。
- 排除：G2.13，SKILL 只由真实 UI 选择加载，本轮不改 SKILL 语义。

## 4. 影响圈与作者反证

- 打算改：`electron/ipc/storage.js` 的 `storage:remove`；`electron/ipc/storage.spec.js`；`scripts/verify-pipeline-artifact-contracts-electron.mjs`；文档/DEV_LOG/经验/版本号。
- 可能碰到：所有调用 `storage:remove` 的清理路径；真实崩溃恢复语义；Electron live 验证时长。
- 最可能错假设：删除 `.bak` 会破坏崩溃恢复。证伪方式：保留 `recoverBakIfPrimaryMissing`，仅把「显式 remove」定义为 key 生命周期终结；崩溃恢复只处理未显式删除的 key。
- 第二假设：只修存储即可让每卷走完整链。证伪方式：live 验证器逐卷断言 12 个 `chain-step`、无 `chain-handoff-resume`、API 顺序为三轮 S1-S4。

## 5. 停止条件

- 红色测试先失败后通过；存储语义测试全绿。
- Electron live 输出 `===== PIPELINE ARTIFACT CONTRACT ELECTRON LIVE PASSED =====`，且卷纲 run 满足每卷完整链断言。
- `npm run test:services`、`npm run type-check`、`npm run build:vue` 通过。
- 回放验证器完成三层历史 trace 对账。

## 6. 执行证据

- before trace：`_audit/verification-pipeline-artifact-contract-live/before-fix/run-trace-卷纲层-20261011-230048/run-trace.json`。
- 关键现象：4 个 `chain-step` 后出现 2 次 `chain-handoff-resume`，均恢复 S3 handoff，后续均为 `chain-step 4/4`；apiCalls 共 6 个，最后一个 running。
- 红色测试：`npx vitest run electron/ipc/storage.spec.js` → exit 1；失败为 `expected { status: 'step-3-completed' } to be null`，证明 remove 后 read 复活 `.bak`。
- 修复点：`electron/ipc/storage.js` `storage:remove` 增加 `filePath + '.bak'` 删除。
- 绿色测试：`node --check electron/ipc/storage.js` → exit 0；`npx vitest run electron/ipc/storage.spec.js` → exit 0，3/3 passed。
- 验证器补强：`assertVolumeRun` 断言 3 卷至少 12 个 `chain-step`、每个 S1/S2/S3/S4 至少出现 3 次、无 `chain-handoff-resume`、API 调用至少 12 次。
- type-check：`npm run type-check` → exit 0。
- 构建：`npm run build:vue` → exit 0（仅既有 Vite chunk/config warning）。
- 全量回归：`npm run test:services` → 147 files / 1757 tests 全部通过。
- live 复核：`summary.json` 生成于 2026-10-12 00:45:07，四层 `status: success`；`heartbeat.jsonl` 最后心跳 00:44:59 后正常收口；三层导出通过回放验证器全部 `RESULT: ACCEPTED`。
- 历史回放：卷纲 schema v9 / 设定 schema v15 / 正文 schema v15 三条为 `EXPECTED-FAIL`，按旧运行缺少新契约事件口径登记，不作为当前缺陷。
- 证据边界：`electron-run.log` 仅记录 Electron 子进程流，`PASSED` 由验证器主进程输出；`ELECTRON CLOSE code=1` 为主动关闭子进程的退出码，不是验证失败。

## 7. 缺口清单

- 代码修复、验证器补强、live 重跑、回放、全量回归、文档回写、版本收口均已完成。
- 本轮无登记缺口；经验文件、DEV_LOG、主索引与版本收口见对应文件。
