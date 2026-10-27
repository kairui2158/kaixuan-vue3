# DEV LOG: 2026-10-27 客户可交付版本 3.109.0 收口

## 1. 目标

执行 `PROPOSAL_2026-10-26_CUSTOMER_READY_RELEASE_CLOSURE_V1.md`：完成 live 供应商真实并行验收、真实性能采样、13 个历史脚本对账、不适用项闭账、3.109.0 封装核验、台账/经验/索引/仓库收口。目标不是“测试全绿”，而是客户可安装、可验证、证据边界清楚的可交付版本。

## 2. 交付内容

- 版本：`3.108.1` -> `3.109.0`，`package.json` 与 `package-lock.json` 两处一致。
- live 并行验收：`scripts/verify-pipeline-parallelism-electron.mjs` 增加真实供应商配置读取、DPAPI key 桥、失败注入代理、性能账本与 key 泄漏检查；应用内置供应商 key 不出现在日志或证据。
- R5 负向门禁：`src/services/skillRouter.ts` 仅显式传参才挂工具面，`src/services/skillRouter.spec.ts` 断言流水线 folder 执行物理不存在 `tools/toolPolicy/toolSurface`。
- 修复链路：
  - `electron/ipc/api.js`：reasoning-only 流只在首个 reasoning delta 起 body 缺席计时；physical request 发起即绑定 watchdog，覆盖无响应连接停滞。
  - `src/stores/runTrace.ts`：`chain-step` 等审计事件纳入事件压缩保留清单，并记录 physical call 最近执行活动。
  - `src/services/pipelineRunOutcome.ts` + `src/services/runRegistry.ts` + `PipelinePanel.vue`：run 失败原因单源透传到 trace 终态。
  - `src/components/pipeline/PipelinePanel.vue`：供应商 `finish_reason=length` 触发一次受控续写；二次截断保留硬信号，不做本地修复。
  - `src/services/stepArtifactAcceptance.ts`：degraded 候选缺正文交接账本时直接 reject，不允许无权威元数据流转。
  - `src/services/streamContract.ts`：OpenAI 兼容流帧保留 finishReason。
  - `src/stores/pipeline.ts`：trace ownership 记录从“静默忽略”改为显式失败。

## 3. 验证矩阵

| 面 | 结果 | 证据 |
|---|---|---|
| live 并行 | PASS：9 run，5 success、2 canceled、2 预期 failed；17 application calls、15 physical requests、max concurrency 2；取消 103ms；coverage 六项 true | `_audit/verification-pipeline-parallelism-live-supplier/report.json` |
| live 性能 | PASS：freeze=0、slowClick=0、longTask=0、responsivenessState=normal；supplierWait=1,735,168ms、localOverhead=3,559ms | `_audit/verification-pipeline-parallelism-live-supplier/performance-accounting.json` |
| 设定锁定投影 | schema 3->4；64/64/63；archiveIssues=[] | `_audit/verification-settings-lock-projection-electron/report.json` |
| 流水线耗时账本 | success；12 application calls、13 physical calls、1 retry；本地/编排等待 557ms | `_audit/verification-pipeline-timing-ledger-live/summary.json` |
| 13 个历史脚本 | PASS 或预期负向/设计内 degraded | 任务台账第 5 节逐项对账 |
| R5 无工具直写链 | PASS：`tools/toolPolicy/toolSurface` 物理不存在 | `src/services/skillRouter.spec.ts:199-245` |
| 本轮类型检查 | PASS | `npm run type-check` exit 0 |
| 本轮服务回归 | PASS | `npm run test:services`：213 files / 2338 tests 全部通过 |
| 版本一致性 | PASS | `package.json=3.109.0`、lock 顶层与 packages[""].version 均 3.109.0 |
| key 泄漏 | 未发现真实 key | live keyLeakCheck=false；4 类真实 key 前缀对 `_audit`/`dist` 文本产物复扫 0 命中 |

## 4. 清理与封装

- 安装包：`dist/神意助手-Setup-3.109.0.exe`，231,611,286 bytes，SHA256 `3BEFB473CF9DE943DBCA07BAF6DF523CFFE2375BE3601BE22553FA0E3A38FD55`。
- `dist/latest.yml`：version 3.109.0，path `shenyi-assistant-setup-3.109.0.exe`。
- `dist/win-unpacked/resources/app.asar` SHA256：`813260AD93886F229A4248014C25616CF657980981602133431B056B0F5CDA93`。
- win-unpacked 主程序 FileVersion/ProductVersion：3.109.0。
- 本轮不重打包：完整打包与真实启动链已在生成后核验；本轮只复核文件、哈希与版本。

## 5. 经验回写

经验文件升级 v9.6.0 -> v9.6.1：

- G1.5 增加观测面冻结与活性单源：事件存在不等于运行活着，断言必须与生产活性字段同源对账。
- G1.17 增加调用形态负向门禁：无工具直写链必须断言 `tools/toolPolicy/toolSurface` 物理不存在，字段缺省不能冒充无工具链。

## 6. 诚实边界

- 已验证：live 并行、live 性能、13 脚本语义、R5、类型、服务回归、版本一致性、产物哈希。
- 未在本轮重复验证：NSIS 人工自定义安装路径、完整重新打包与安装过程。
- 无法由应用解决：外部供应商额度耗尽、503 分组无可用渠道、用户取消、验证环境 key/配置错误。
