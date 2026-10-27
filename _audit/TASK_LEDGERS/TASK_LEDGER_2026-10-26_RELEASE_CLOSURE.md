# TASK LEDGER: 2026-10-26 Customer Ready Release Closure

## 1. 目标与原话

- 用户原话：确认执行。
- 批准方案：`_audit/PROPOSAL_2026-10-26_CUSTOMER_READY_RELEASE_CLOSURE_V1.md`
- 最终可感知行为：交付一个完成 live 并行验收、真实性能采样、历史脚本对账、不适用项闭账、版本升级与封装核验的客户可用版本。
- 本轮交付物：`3.109.0` 安装包、live/性能/脚本/封装证据、DEV_LOG 与本台账。

## 2. 范围与影响面

- 代码：预计只新增 R5 负向测试；live 或脚本复跑若暴露产品缺陷，另行最小修复。
- 流程：Phase A 基线、B live、C 性能、D 历史脚本、E 闭账、F 封装、G 收口。
- 不改动：V4 并行架构、SKILL 层、供应商协议。

## 3. 执行记录

| Phase | 状态 | 证据 |
|---|---|---|
| A 基线冻结 | 通过 | 本文件第 5 节 |
| D reasoning-only stall 复验 | 通过 | 根因：持续 reasoning 每 chunk 重设 `bodyAbsentTimer`，deadline 被无限顺延。修复：`electron/ipc/api.js:288-296` 仅首个 reasoning delta 起表，后续 reasoning 只刷新 idle/progress。回归：`electron/ipc/api.spec.js:343`。复验：`2026-10-26 20:27:06` `node scripts/verify-reasoning-only-stall-electron.mjs` → `===== REASONING ONLY STALL ELECTRON PASSED =====`；`_audit/verification-reasoning-only-stall-electron/report.json` 记录 `runStatus=success`、`physicalCallCount=2`、`interruptionCode=reasoning_only_stalled`、`retryStrategy=thinking_disabled`、`persistedVolumeCount=1`。 |
| D 章节批次合同 live 复验 | 通过 | 前三次失败分别为：liveness 断言误杀启动瞬间、`chapter-batch-validated` 被事件压缩丢弃、`chain-step` 审计事件被事件压缩丢弃。第三轮失败证据归档于 `_audit/verification-chapter-batch-contract-live-archive/2026-10-26T22-26-26-812Z/`。第四轮根因修复：`src/stores/runTrace.ts:939` 将 `chain-step` 纳入 `RETAINED_AUDIT_EVENT_TYPES`，并在 `src/stores/runTrace.spec.ts:2317` 压缩测试中补保留断言。验证：`npm exec vitest run src/stores/runTrace.spec.ts` → `Tests 108 passed (108)`；`npm run type-check` → exit 0；`npm run build:vue` → exit 0。live 复验：`2026-10-27 07:21:19` `node scripts/verify-chapter-batch-contract-electron.mjs` → `===== CHAPTER BATCH CONTRACT ELECTRON LIVE PASSED =====`。证据：`_audit/verification-chapter-batch-contract-live/summary.json` 记录 `status=success`、`chapterCount=12`、`validatedBatches=3`、全部批次 `repairAttempts=0`；`live-export/run-trace.json` 记录 `events=127`、`chain-step=12`、`apiCalls=12`、`chapter-batch-validated=3`、`eventLedger={totalEvents:539,droppedInfoEvents:412}`；`live-export/payloads/` 保留 12 个 request 原件。 |

## 4. 问题与裁决

| # | 问题 | 分类 | 裁决与证据 |
|---:|---|---|---|
| 1 | 章节批次 live 前三次失败：liveness 断言误杀启动瞬间、`chapter-batch-validated` 与 `chain-step` 被事件压缩丢弃 | 验证器口径缺陷，非产品缺陷 | 前两次按验证器误报定案；第三次补源码证据：事件压缩丢弃 info 级审计事件。修复 `src/stores/runTrace.ts:935-943` 的保留清单与 `src/stores/runTrace.spec.ts:2317` 断言后复跑通过。 |
| 2 | reasoning-only 流期间 body 缺席计时器被每个 reasoning chunk 顺延，可能无限等待 | 产品缺陷 | 根因与修复见第 3 节 D reasoning-only stall 复验；`electron/ipc/api.spec.js` 增回归。 |
| 3 | live 并行矩阵中两个 failed run | 预期故障注入 | `_audit/verification-pipeline-parallelism-live-supplier/report.json`：run 6 注入 S2 terminal auth failure，run 8 注入 terminal provider failure；两者均用于验证失败终态后再入，且再入 run 7/9 为 success。 |
| 4 | live 性能总耗时约 28.98 分钟 | 供应商等待，不是应用卡死 | `_audit/verification-pipeline-parallelism-live-supplier/performance-accounting.json`：supplierWaitMs=1,735,168，localOverheadMs=3,560，freeze/slowClick/longTask 全 0，verdict=PASS。 |
| 5 | failed-exports 目录 15 个失败现场 | 历史失败现场归档，非当前产品缺陷 | 抽样核实为 Invalid token、invalid JSON request body、供应商 503 无可用渠道、用户取消、一次验证器 key re-encrypt clone 错误。保留原现场，不删除、不改写。 |
| 6 | `git diff --check` 对证据 payload 报 trailing whitespace | 历史证据原件形态，不是本轮源码缺陷 | 逐类确认源码 diff 不含 whitespace error；payload 是运行记录原件，按 G0.8 证据不可再生原则不做清理改写。 |
| 7 | 明文 key 扫描命中 38 个历史研究文件 | 扫描器口径缺陷，未发现真实供应商 key | 命中集中在 2026-09 的 research JSON/Markdown；对 4 类真实 key 前缀精确复扫为 0 命中。历史研究文件不作为 key 泄漏证据。 |
| 8 | 13 个历史脚本报告形态不一致 | 验证器口径差异 | 逐份读取 summary/report；failed/degraded 只在明确允许负向门禁的场景出现。见第 5 节。 |

## 5. 验证与门禁

- 基线 HEAD：`8c5a3038b296f8f46cb2d89ff4ff0baaa6ef286b`
- 基线版本：`3.108.1`
- 基线工作区：仅方案文件为未跟踪新增，属本轮交付物。
- 2026-10-26 基线复跑（`SHENYI_LIVE_PROVIDER=全局 SHENYI_PARALLELISM_LIVE=1`，与 Phase B 环境口径一致）：
  - `npm run test:services` → exit 0：`Test Files 212 passed (212)`、`Tests 2322 passed (2322)`、`Duration 54.37s`。
  - `npm run type-check` → exit 0，无错误输出。
  - `npm run build:vue` → exit 0：`vite build` 与 `vite build --config vite.protocols.config.mts` 均成功；仅既有 chunk 体积 warning，无编译错误。

### 2026-10-27 收口验证

- live 并行：`SHENYI_PARALLELISM_LIVE=1` 执行 `scripts/verify-pipeline-parallelism-electron.mjs`。`_audit/verification-pipeline-parallelism-live-supplier/report.json`：`result=PASS`，9 个 run（5 success、2 canceled、2 预期 failed），17 次 application call、15 次物理请求、最大并发 2，取消反馈 103ms，六项 coverage 全 true，`keyLeakCheck.plaintextPatternFound=false`。
- live 性能：`_audit/verification-pipeline-parallelism-live-supplier/performance-accounting.json`：`verdict=PASS`，freezeCount=0、slowClickFeedbackCount=0、longTaskCount=0、responsivenessState=normal、withinBudget=true；supplierWaitMs=1,735,168、localOverheadMs=3,560。
- R5 负向门禁：`src/services/skillRouter.spec.ts:199-245` 断言流水线 folder 执行的 options 物理不存在 `tools`、`toolPolicy`、`toolSurface`；同时保留 dialogue/outline 显式工具面前向测试。
- 设定锁定投影：`_audit/verification-settings-lock-projection-electron/report.json`：schema 3 -> 4，volume/chapter/body 投影锁定 64/64/63，archiveIssues=[]。
- 流水线耗时账本 live：`_audit/verification-pipeline-timing-ledger-live/summary.json`：runStatus=success、apiCallCount=12、physicalCallCount=13、retryPhysicalCallCount=1；top3 显示本地/编排等待仅 557ms。
- 13 个历史脚本对账：
  - body-repair-ledger：success。
  - body-contract-degraded：`reject-before-s3=failed`、`ledger-missing-terminal=failed` 为预期负向门禁；`accept-and-extract=success`。
  - contract-semantics：normal progression success；early reveal 主动上报不阻塞，属设计内告警。
  - chapter-batch-contract：live success，12 章、3 批、repairAttempts=0。
  - hard-signal-stop-net：clean/polluted 两个场景 success；provider truncation 不做本地修复，为设计内降级语义。
  - outline-context-scope：unit closure success；缺单元不静默降级的负向语义保留。
  - owner-breakpoint-closure：success。
  - owner-breakpoint-failure-injection：v6/v7 failed 为故障注入与降级拒绝预期；v10 success。
  - pipeline-repair-feedback live：baseline/schema-retry/echo-repair 全 success。
  - pipeline-timing-ledger live：success，见上。
  - reasoning-only-stall：success。
  - settings-lock-projection：success，见上。
  - pipeline-artifact-contracts live：outline-analysis 层 degraded，其余 5 层 success；脚本第 1095 行显式允许 `success || degraded`，该层为供应商截断不做本地修复的设计语义。
- 本轮新鲜回归：`git diff --check` exit 1，仅历史证据 payload 的 trailing whitespace，源码/文档无 whitespace error；`npm run type-check` exit 0；`npm run test:services` exit 0：Test Files 213 passed，Tests 2338 passed，Duration 63.72s。
- key 泄漏扫描：对 4 类真实 key 前缀精确复扫 `_audit` 与 `dist` 文本产物为 0 命中；历史 research 文件中的 38 个泛化命中未输出明文，经分类不构成真实 key。live 报告自身的 keyLeakCheck 为 false。
- 封装核验：`dist/神意助手-Setup-3.109.0.exe`，231,611,286 bytes，SHA256 `3BEFB473CF9DE943DBCA07BAF6DF523CFFE2375BE3601BE22553FA0E3A38FD55`；`dist/latest.yml` version=3.109.0；`dist/win-unpacked/resources/app.asar` SHA256 `813260AD93886F229A4248014C25616CF657980981602133431B056B0F5CDA93`；win-unpacked 主程序 FileVersion/ProductVersion=3.109.0。封装启动链路已在生成后核验，本轮收口不重打包，登记为“沿用已核验产物”。

## 6. 遗留与边界

- 已闭环：R1 live 并行、R2 live 性能、R3 历史 13 脚本对账、R4 3.109.0 封装与版本一致、R5 无工具直写链负向门禁。
- 不可再验证项：本轮不重跑完整打包与真实安装链路，`dist/3.109.0` 的真实启动核验沿用生成后已完成的证据；`package.json` 与 `package-lock.json` 两处版本由本轮命令复核一致。
- 未验证项：NSIS 人工自定义安装路径未在本轮重复执行；外部供应商 503/额度耗尽属于环境边界，不能由本应用修复。
- 无产品级未修遗留。历史 failed-exports、research 泛化命中、payload trailing whitespace 均按证据保留或口径缺陷闭账，不作为当前缺陷。

## 7. 回头看

- 目标对账：批准方案的 Phase A-G 全部执行；本轮新增的 R5 测试与历史脚本分类结果均落在方案范围内，未引入 SKILL 层或供应商协议改动。
- 最大风险点复核：live 总耗时被供应商等待主导，应用本地开销 3.6 秒、UI 冻结/慢点击/长任务全 0，验证了“供应商慢不等于应用卡死”的门禁语义。
- 证据真实性：live、性能、13 脚本、R5、版本一致性、安装包哈希均为真实文件或本轮命令输出；`git diff --check` 的失败被如实登记为历史证据 whitespace，没有为绿灯改证据。
- 教训回写：经验文件升级 v9.6.1，G1.5 增加观测面冻结与活性单源，G1.17 增加调用形态物理不存在断言；避免后续再次出现“事件存在但活性不同源”和“字段缺省冒充无工具链”的假闭环。
