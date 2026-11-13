# TASK LEDGER · deai-stage-guidance budget truncate V1

## 1. 目标与原话

用户原话（2026-11-14）：

> 那就针对第二项根据经验文件门禁和执行纪律来出具修复方案。

第二轮确认：

> 裁决点采取你的建议，确认同意执行方案，方案执行后回头对账不允许有漏项

上游 trace 证据为 `run-trace-正文层-20261114-024409-deep-2/run-trace.json:301-308`：5 条 findings 被 `droppedFindingCount=5` 全弃，`guidanceChars=0`，`budgetExceeded=true`。

最终可感知行为：预算超时后仍保留已产出的合法 findings，并回到既有 `maxFindings=6`、单条 120 字符、总输出 1200 字符边界；`budgetExceeded` 继续作为 trace warn 观测，不改终态、retry 或 SKILL 行为。

## 2. 门禁读证

- G0.1：只修「构造预算超时后全弃 findings」这一项；不扩大到 profile 校准、reasoning-only 断流、验收或供应商。
- G0.2：未设置 token/时间/轮次预算。
- G0.4：已复读正文层 LHC、body final contract、deai profile 与阶段指导相关 DEV_LOG；生产改法复用既有产物边界，不新增规则。
- G0.6：方案经用户审核，5 个裁决点均按建议执行。
- G0.7：正推确认 S3 prompt 与终稿校准两个消费面都会随 findings 恢复；反推确认 `budgetExceeded` 不隐藏性能事实，1200 字符合同不扩。
- G0.9：影响圈覆盖入口、服务层、UI、测试、验证脚本、规格说明与 trace 字段。
- G0.10：旧语义「超预算等于 0 条」在测试契约中同批退役，生产旧条件全仓清零。
- G0.12：本台账记录门禁读证、路由、影响圈、停止条件、证据与缺陷面。
- G0.13：单行条件修复，无新增预算系统、配置项、调度器、UI 或第二裁判。
- G1.4：分层验证覆盖定向服务回归、type-check、确定性 Electron E2E 与全量服务测试；真实供应商 live 登记为 `untested`。
- G1.11：新契约先迁移旧断言，再增加超预算 trace 级负向回归。
- G1.14：执行后做改动分支、sibling、写入/读取、旧语义残留、trace 消费面与环境边界枚举。
- G1.17：用 Electron 真实请求链证明 S3 收到 guidance，不用单测绿灯替代端到端事实。

## 3. 路由判定

纳入：G0.1/G0.4/G0.6/G0.7/G0.9/G0.10/G0.12/G0.13/G1.4/G1.11/G1.14/G1.17。

排除：

1. `deai-model-profile` 校准门槛：属独立 release gate，不因本缺陷放宽。
2. S3 reasoning-only 断流：属平台恢复/观测面，本轮不改。
3. 真实供应商 live：由下一次真实 trace 对账，本轮不消耗供应商压力。

## 4. 影响圈与作者反证

打算改的：

- `src/services/deaiStageDiagnosis.ts:113`
- `src/services/deaiStageDiagnosis.spec.ts:169+`
- 台账、DEV_LOG、主索引、版本与安装包证据

不改但必须对账的：

- `PipelinePanel.vue:5170-5183`（S2 后注入）
- `PipelinePanel.vue:6827-6835`（终稿校准）
- `formatDeaiStageGuidance` / `buildDeaiStageGuidanceTraceEvent`（既有上限与 trace 合同）
- `deaiGuidanceDisplay.ts`、`deaiSkillReport`、live/electron 验证器（trace 消费面）
- `SKILL_HANDOFF_BODY_LAYER_FULL_PIPELINE_SPEC_2026-11-14.md`（描述「S2 后诊断 → 注入 S3」，与保留 findings 无冲突）

作者反证：

1. 单测绿可能只证明函数层。处置：跑确定性 Electron E2E，检查真实请求链与 trace 注入。
2. `performance.now()` 可能让 `maxConstructionMs=0` 变假阳。处置：新增 spy 用例，第一次 1000，第二次 1051。
3. 可能存在其他超预算旁路。处置：全仓扫 `budgetExceeded ? 0` 与 `buildDeaiStageDiagnosis` sibling。
4. Electron 断言可能反向要求无 warn。处置：先跑验证器；实际通过，不改产品迁就验证器。

## 5. 停止条件

完成条件：

1. `budgetExceeded=true` 时 findings 不为空，且遵守 `maxFindings=6`。
2. trace event 仍为 `warn`，`budgetExceeded=true`、`injected=true`、`guidanceChars>0`。
3. 旧 `budgetExceeded ? 0` 全仓 0 命中。
4. 定向回归、type-check、build:vue、确定性 Electron E2E、全量服务测试全部通过。
5. 升版 3.127.6、完整构建、packaging 核验与安装包 hash 归档。

失败条件：任一命令非零；或 `budgetExceeded` 开始影响终态/retry；或新产物突破既有 1200 字符边界。

## 6. 执行证据

### 生产修复

- `src/services/deaiStageDiagnosis.ts:113` 从 `.slice(0, budgetExceeded ? 0 : Math.max(0, maxFindings))` 改为 `.slice(0, Math.max(0, maxFindings))`。
- 不改 `budgetExceeded` 计算与 trace detail 字段。

### 测试契约迁移

- `src/services/deaiStageDiagnosis.spec.ts:171-203` 将「超预算=0条」改为「保留有界 findings」。
- 原用例断言 `budgetExceeded=true`、`findings=1`、`droppedFindingCount=0`、`calls=1`。
- 新增 spy 用例：8 条 findings，`performance.now()` 返回 1000/1051，断言 6 条、2 条 dropped、`durationMs=51`、guidance ≤1200、`level=warn`，trace detail 为 `findingCount=6 / injected=true / droppedFindingCount=2 / budgetExceeded=true`。

### 验证结果

| 验证 | 命令 | 结果 |
|---|---|---|
| 定向回归 | `npx vitest run src/services/deaiStageDiagnosis.spec.ts src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts` | 2 files / 28 tests passed |
| 类型检查 | `npm run type-check` | exit 0 |
| 前端构建 | `npm run build:vue` | exit 0 |
| Electron E2E | `node scripts/verify-deai-stage-guidance-electron.mjs` | exit 0 / PASSED |
| 全量服务 | `npm run test:services` | 251 files / 2749 tests passed |

Electron 关键证据：

- `summary.json`：`runStatus=success`，`requestCount=3`，schema `shenyi.deai-stage-guidance.electron` v1。
- `run-trace.json` 中 `deai-stage-guidance`：`findingCount=3 / injected=true / budgetExceeded=false / guidanceChars=194`。
- 证据目录：`_audit/verification-deai-stage-guidance-electron/`。

### 缺陷面枚举（G1.14）

| 面 | 对账结果 |
|---|---|
| 超预算清空分支 | 已删除；`rg "budgetExceeded ? 0"` 全仓 0 命中 |
| 正常截断分支 | 既有 `maxFindings` 与 1200 字符截断保留 |
| detector 抛错 | 仍走既有 degraded 空产物路径，未改动 |
| 0 条 finding | 仍空注入，未伪装成有指导 |
| S2 后消费面 | `PipelinePanel.vue:5170` 原样消费 findings，无入口改动 |
| 终稿校准面 | `PipelinePanel.vue:6827` 原样消费 findings，样本不再因预算超时被同源清空 |
| trace 消费面 | `deaiGuidanceDisplay`、`deaiSkillReport`、Electron/live 验证器兼容既有 schema |
| 旧测试残留 | 全仓扫旧测试名与 `findings` 空断言为 0 命中 |
| 真实供应商 live | `untested`；等下一次真实 trace 回填 |

### Release

- 版本：3.127.5 → 3.127.6。
- 构建：完整 `npm run build` exit 0。
- Packaging：`npm run verify:packaging` exit 0 / `PACKAGING 3.127.6 VERIFICATION PASSED`，`rendererFiles=87`，`electronAPI methods=94`。
- 安装包：`dist/神意助手-Setup-3.127.6.exe`。
- SHA-256：待包装完成后回填。

## 7. 缺口清单与边界

### 已知缺口

1. 真实供应商 live trace 未在本轮生成，`deai-stage-guidance` 的真实正文层超预算恢复行为登记为 `untested`。
2. 本轮不校准 `deai-model-profile`；规则画像释放仍按既有快照与门槛执行。

### 明确不做的

1. 不新增预算系统、配置项、自动调度或 UI。
2. 不让 `budgetExceeded` 影响终态、retry、验收或失败路由。
3. 不改 SKILL 模板或正文层叙事裁判权。
4. 不为观测 warn 做二次抑制或降噪。
