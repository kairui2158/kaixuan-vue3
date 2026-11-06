# TASK LEDGER 2026-11-06: 正文层主链 100% 终态收口

状态：执行完成。用户原话：「可以先执行到正文层主链100% 降AI的校准门禁我们可以延后再做，至于你说的真实供应商闭环，开发版应用里已经有真实供应商API KEY，你可以使用」。

## 1. 目标与原话

- 原始目标：正文层主链推进至 100% 终态稳定；降AI校准门禁延后，`calibration-not-ready` 继续冻结，不注入。
- 最终可感知行为：架构零残留、验证防假绿、交付封装可安装可审计，真实供应商链路完成或如实登记边界。
- 本轮交付物：任务台账、最新验证证据、3.115.0 安装包、live 供应商证据、DEV_LOG 与索引。

## 2. 门禁读证

- G0.1/G0.3/G0.5/G0.12/G0.13：目标对齐、诚实闭环、回头看、台账与最小必要性；`_audit/神意开发经验总结_v9.md:1-268`。
- G1.4/G1.5/G1.7/G1.12/G1.17/G1.21/G1.22：验证分层、验证器质量、产物新鲜度、封装收尾、自盲区、脚本与校准；同文件 `:268-483`。
- G1.16/G2.9/G2.11：复盘与流水线/供应商；同文件 `:325-483,484-633`。

## 3. 路由判定

- 加入：流水线收口、供应商 live、封装、候选账本与 retry 验证、SKILL 钉死回归。
- 排除：G2.5 长文档重排（本轮不触碰长文档重排）；G2.8 存储写队列（无存储协议改动）；G2.14 跨盘迁移（不做迁移）。
- 排除理由：影响圈只含正文链、供应商通道验证、交付封装与审计文档；不越界改无关系统。

## 4. 影响圈与作者反证

- 打算改的：`package.json`/`package-lock.json` 版本，构建产物，审计台账与日志。
- 可能碰到的：`dist/`、`dist-renderer/`、`_audit/verification-*`、git 索引与提交。
- 最可能错误的假设：既有测试通过即代表主链终态稳定；真实供应商 live 只在 mock 层通过即可。证伪方式：全量测试、真实 Electron 打包验证、live 三层物理请求三面对账。

## 5. 停止条件

- 完成：全量测试/type-check 通过；Electron 打包核验通过；live 三层供应商证据通过或如实登记 `untested`；安装包 SHA-256 与清理盘点完成；DEV_LOG/台账收尾。
- 失败：任一红灯未修复且未明确登记边界；证据缺失；降AI校准被提前解冻。

## 6. 执行证据

### 本轮最新验证

| 项 | 结果 | 命令与关键输出 |
|---|---|---|
| 全量服务测试 | PASS | `npm run test:services` → `Test Files 248 passed (248)`、`Tests 2671 passed (2671)`、102.74s |
| 类型检查 | PASS | `npm run type-check` → exit 0 |
| diff 自检 | PASS | `git diff --check` → exit 0，无空白错误；改动统计 19 files / 493(+)/132(-) |
| Phase 0 提交 | DONE | `git commit` → `8743ef9b fix(pipeline): converge referee semantics and pin skill runs`，26 files changed |
| live 供应商闭环 | PASS | `npm run verify:provider-channel-electron`（live）→ `[PASS] ... mode=live-single-supplier; requests=5`；`report.json:4` `result=PASS`，`:211` `requestCount=5`，`:212` `mode=live-single-supplier`；`:7` volumes、`:130` chapters、`:189` body 全部 `status=succeeded`；`:53/:112/:171` 三层 `providerId=provider-volumes/chapters/body`；`:218` `model=glm-5.3` |
| 封装核验 | PASS | `npm run verify:packaging` → `_audit/verification-packaging-3.115.0/packaging-evidence.json:7` `installerBytes=231667438`；`:121` `verdict=pass`；`Get-FileHash` → SHA-256 `433d1c29c42c69d4bec635bf9bfc0c9d0300d58a87d60c94162d6a0b6abdc36b` |
| 临时脚本清理 | PASS | `Test-Path _audit/probe-live.js` → False；`Test-Path _audit/tmp-wa-providers-live.json` → False |
| live 辅助记忆边界 | DECLARED | `report.json:212-215` `mode=live-single-supplier`；`auxiliaryMemory.enabled=false`；验证器 `scripts/verify-pipeline-provider-channel-electron.mjs:496-497` 显式传参 `chapterWords=800`、`autoExtractMemory=!LIVE_MODE`；mock 3500 字与完整辅助记忆断言保留 |
| 供应商凭证安全 | FIXED | 未提交 mock 证据 `provider-requests.json` 含 2 条 `Bearer enc:`，`redact-provider-requests.ps1` 将 6/6 条 `apiKey` 替换为 `[redacted]`；结构化复核 `Bearer*` 0 条；`Select-String` 泄漏值 0 命中；`git log --all -S` 0 命中，确认未入历史 |
| 读竞态观测 | OBSERVED | 第三次 live 导入 upsert 后 20s 内一次 `persistedCount=null`，200ms 后磁盘 4 providers，重跑通过；未复现、未改产品代码，登记为观测项 |

### 架构残留检索

| 面 | 命中 | 判定 |
|---|---|---|
| `__shenyiStepArtifact` | `PipelinePanel.vue:878,4368` | `sanitizeLegacyEnvelopeArtifact` 只迁移 success/degraded 旧断点产物，malformed/reset；非验收解析豁免 |
| 旧叙事词表 | 生产路径 0 命中 | spec 负向守护不在本表 |
| `DeAiProcessor` | `useDeAi.ts`、`deaiStageDiagnosis.ts`、`scripts/*` | 手动降AI与校准/评估链路活消费豁免；流水线 executor 无消费 |
| `calibration-not-ready` | `deaiModelProfile.ts:12,91`、live 断言 | 冻结门保留，不注入 |
| `bodyGeneratorStepIndex` | 写 `PipelinePanel.vue:6420-6426`、读 `:6472,:6524`，resolver `chainExecution.ts:470` | attempt 开始恢复链完整 |

## 7. 缺口清单与缺陷面枚举

### 缺口

- 初始缺口：上一轮工作区未提交；live 供应商闭环待执行；交付封装待执行；降AI校准按用户指令延后。

### G1.14 缺陷面枚举

| 维度 | 枚举结果 | 处置 |
|---|---|---|
| PipelinePanel 旧信封残留 | `LEGACY_STEP_ARTIFACT_MARKER` 仅导入常量与 `sanitizeLegacyEnvelopeArtifact` 函数；返回 `recovery: migrated/reset`，不解析为验收产物 | 登记为断点旧数据净化豁免 |
| sibling 消费点 | 全仓检索 `__shenyiStepArtifact`；spec 为负向断言，PipelinePanel 为净化豁免 | 后续表格登记 |
| 状态生命周期 | bodyGeneratorStepIndex 恢复链已由上一轮 `resolveAttemptStartGeneratorIndex` 收口，全量 2671 passed | 完成回归 |
| 协议/观测残留 | 旧词表生产路径 0 命中，spec 负向守护保留；`DeAiProcessor` 手动/校准链路豁免 | 待残留检索证据 |
| 模板占位符 | 围栏/行内反引号内视为文档字面量；代码 span 外业务占位符缺变量仍 hard fail | `src/services/realSkillExecutor.ts:601-658`；spec 用例 `realSkillExecutor.spec.ts:1831` |
| live 验证器口径 | provider id 精确选择；`GET /v1/models` fixture；POST 模型断言分流；live 章节与辅助记忆边界显式传参 | `scripts/verify-pipeline-provider-channel-electron.mjs:265,198,1017,496-497` |
| 供应商解密 | 同名供应商通过 `--id` 消除歧义 | `scripts/decrypt-provider-key.cjs:11,25-40` |
| 证据凭证面 | 供应商请求证据不再记录可解密 API key | `provider-requests.json` 全部 `apiKey=[redacted]` |
| 封装新鲜度 | 3.115.0 安装包、asar、源码 mtime 与 packaging evidence 对账；旧 3.114.3 清理项更新 | `scripts/cleanup-release-artifacts.ps1:2-9` |

## 8. 收尾判定

- 架构、协议、测试、真实 Electron、真实供应商、封装、文档七面已对账。
- 降AI校准按用户指令延后，`calibration-not-ready` 冻结，不注入。
- live 章节 800 字与辅助记忆关闭是显式验证通道边界，不冒充完整质量与功能闭环。
- 供应商 key 未入 Git 历史；本次泄漏只存在于未提交证据，已脱敏并复核 0 命中。
- 第三次 live 读竞态未复现，作为观测项保留；若复发必须按存储并发缺陷重新立案。
