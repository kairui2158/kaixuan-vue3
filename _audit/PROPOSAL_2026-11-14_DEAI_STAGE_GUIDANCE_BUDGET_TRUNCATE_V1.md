# PROPOSAL：deai-stage-guidance 超预算截断修复 V1

日期：2026-11-14
状态：待用户审核
适用层：应用侧降AI阶段指导构造
本轮边界：只修「构造预算超时后全弃 findings」的应用缺陷；不改验收、终态、retry、SKILL 或供应商行为。

## 1. 目标与原话

用户原话：

> 那就针对第二项根据经验文件门禁和执行纪律来出具修复方案。

上游事实：2026-11-14 实测 trace 明确暴露，5 条降AI阶段诊断 findings 被全弃。

原始 trace 证据（本地路径）：

`C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-正文层-20261114-024409-deep-2/run-trace.json:301-308`

```text
type=deai-stage-guidance
level=warn
label=S2 后降AI位置诊断已执行：0条 / 未注入
findingCount=0
droppedFindingCount=5
guidanceChars=0
durationMs=81.79999999981374
budgetExceeded=true
```

最终可感知行为：

1. 构造预算超时时，仍保留已产出且合法的 findings，并按既有 6 条上限截断。
2. S3 在下一次阶段指导点收到的不再是空指导，而是最多 6 条有界位置化情报。
3. 终稿校准在同一函数下不再因超预算丢失样本，画像积累不被本缺陷拖慢。
4. 超预算继续作为观测信号保留在 trace，不隐藏、不自动放大预算、不升级成终态失败。

## 2. 根因与门禁定性

### 2.1 源码级根因

`src/services/deaiStageDiagnosis.ts:90-120`：

1. `started` 记录函数入口时间。
2. `budgetExceeded` 在检测器返回后计算：`performance.now() - started > maxConstructionMs`。
3. findings 映射与位置定位完成后，进入 `.slice()`。
4. 第 113 行写成：

```ts
.slice(0, budgetExceeded ? 0 : Math.max(0, maxFindings))
```

这里的 `0` 不是「最多保留 0 条」的预算手段，而是把预算观测字段当成了产物裁剪开关。它把合法 findings 全部置空，等价于超预算惩罚，违反本函数「有界指导」的本意。

`maxFindings` 与 `formatDeaiStageGuidance` 的 `maxChars` 才是产物边界。`budgetExceeded` 只是观测边界，应记录事实，不应第二次当裁判。

### 2.2 事实修正

SKILL 转达中「建议改截断而非全弃」方向属实，但若字面改为「超预算后截断到 0」，与本实现既有的 findings 数量边界冲突。现役正确边界应是：

1. findings 数量上限：默认 6。
2. 单条样本上限：默认 120 字符。
3. 输出总字符上限：默认 1200。
4. 构造耗时：默认 50ms，只观测。

因此本方案的「截断」不是新预算，也不是新阈值，而是让超时分支回到既有 `maxFindings` 截断。

### 2.3 影响定性

1. 生成前指导被静默清空：S3 拿不到任何 S2 后位置化情报。
2. 终稿校准被同源削弱：`PipelinePanel.vue:6827-6835` 用同一 `buildDeaiStageDiagnosis(finalBody)` 结果喂 `recordDeaiCalibrationFindings`，超预算时也丢样本，拖慢 `deai-model-profile` 画像积累。
3. 观测层虽然诚实记录了 `budgetExceeded=true` 与 `droppedFindingCount=5`，但产物层错误降级没有报警，用户和 SKILL 都只能看到「0 注入」。
4. 本缺陷不触碰 SKILL 叙事裁判权，也不触发验收/retry；是应用侧「指导者」职能的构造缺陷。

### 2.4 历史来源

`_audit/DEV_LOG_2026-11-02_body-deai-v6-1-phase-a.md:24-28` 记录该函数首版设计：6 条 / 1200 字符 / 50ms 本地预算；trace 只存摘要与结构化字段。

本次缺陷不是需求变更，而是首版实现把耗时观测误用为产物清空条件。历史 Electron/live 证据均为 `budgetExceeded=false`，因此旧测试与验证器没有拦住这条分支。

## 3. 方案成熟度：G0.6

| 层 | 评估 | 结论 |
|---|---|---|
| 执行器/工具层 | `buildDeaiStageDiagnosis` 是本地纯函数，无 API、无 SKILL 契约耦合 | 成熟 |
| 应用方案/交互闭环 | S2 后指导与终稿校准复用同一函数；产物恢复到既有有界指导语义，不新增状态 | 成熟 |
| 实现接线 | `PipelinePanel.vue:5170-5183` 与 `:6827-6835` 均已消费 findings；只需改函数内一处裁剪条件 | 成熟 |
| 验证标准 | 可用确定性单测证明新契约与旧语义清零；真实 Electron 路径已存在既有验证脚本，可跑确定性 E2E | 成熟 |

成熟度结论：**成熟，可执行。**

## 4. 最小修复设计

### 4.1 生产改动

只改：

`src/services/deaiStageDiagnosis.ts:113`

从：

```ts
.slice(0, budgetExceeded ? 0 : Math.max(0, maxFindings))
```

改为：

```ts
.slice(0, Math.max(0, maxFindings))
```

不新增配置、预算系统、调度器、UI、状态或第二裁判。

### 4.2 预期产物矩阵

| 场景 | budgetExceeded | findings | droppedFindingCount | guidance |
|---|---|---|---|---|
| 正常 0 条 | false | [] | 0 | 空 |
| 正常超上限 | false | 最多 6 条 | 剩余条数 | 最多 1200 字符 |
| 超预算 | true | 最多 6 条 | 剩余条数 | 最多 1200 字符 |
| detector 抛错 | false | [] | 0 | 空；`degraded=true` |

`formatDeaiStageGuidance` 与 `buildDeaiStageGuidanceTraceEvent` 不改。超预算下事件仍应为 `warn`；如果有产物，`label` 会自然显示「已注入 S3」；`detail.injected=true`。

## 5. 影响圈七面：G0.9

| 面 | 现状锚点 | 本轮动作 |
|---|---|---|
| 生产入口 | `PipelinePanel.vue:5170-5183` S2 后构造并注入下一步 prompt | 不改入口 |
| 服务层 | `deaiStageDiagnosis.ts:98-120` 计算/裁剪 findings | 只改第 113 行裁剪条件 |
| UI | `deaiGuidanceDisplay.ts:301-344` 从 trace 事件读 findingCount/injected | 不改 UI；行为从 0 条变为最多 6 条 |
| 测试 | `deaiStageDiagnosis.spec.ts:169-185` 钉死旧错误契约 | 同批迁移 |
| 脚本 | `scripts/verify-deai-stage-guidance-live.mjs:709-711`、`scripts/verify-deai-stage-guidance-electron.mjs:726` 只覆盖正常路径 | 不改脚本；E2E 复跑确认未误伤 |
| 规格/说明 | `SKILL_HANDOFF_BODY_LAYER_FULL_PIPELINE_SPEC_2026-11-14.md:81,170` 描述「S2 后诊断 → 注入 S3」，未声明超预算全弃 | 无冲突，不改 |
| trace 字段 | `deaiStageDiagnosis.ts:163-185`；`runTrace.ts:1045` 白名单 | 不改 schema 字段 |

排除说明：

1. 不改 `deai-model-profile`：其 `calibration-not-ready` 是独立的校准样本门槛，不因本修复放宽。
2. 不改 S3 reasoning-only：该现象属平台恢复/观测面，不属本缺陷。
3. 不碰 `PipelinePanel.vue`：调用面天然消费新语义，避免顺手重构。

## 6. 正反推研磨：G0.7

### 6.1 目标倒推

1. 用户目标：降AI方法论应能在生成前指导 SKILL，而不是只在事后报告里存在。
2. 用户可感知目标：本次 trace 的 `findingCount=0 / guidanceChars=0` 应变为最多 6 条有界注入。
3. 平台边界：指导仍不改稿、不参与验收、不影响终态。

### 6.2 正推生效证据

1. `formatDeaiStageGuidance` 只消费 `findings`，所以恢复 findings 后指导自然出现。
2. `PipelinePanel.vue:5171` 立即调用 `formatDeaiStageGuidance(stageDiagnosis)`，产物写入 `pendingStageDiagnosisGuidance`。
3. 终稿点 `PipelinePanel.vue:6834` 把 `finalDiagnosis.findings` 传给校准，恢复 findings 后样本自然回流。
4. trace 结构不变，但 `findingCount`、`injected`、`guidanceChars` 会反映真实产物。

### 6.3 反推质询

1. 超预算会不会隐藏性能问题？不会。`budgetExceeded=true` 保留，trace level 仍为 `warn`。
2. 会不会增加总耗时？不会。原逻辑已在超预算后完成 map/filter，只是把结果丢弃；新逻辑减少一次空产物后续消费的重复诊断倾向。
3. 会不会让长文生成变慢？不会。无新增外呼、无新增状态、无新增计算；从「映射完成后清空」改为「映射完成后截断」。
4. 会不会突破既有 1200 字符合同？不会。`formatDeaiStageGuidance` 第 138-149 行维持截断。
5. 会不会触碰叙事质量判断？不会。指导文本只列位置和类型，无改写建议；入口在验收块外。
6. 会不会让终稿校准突然涌入大量样本？有限。函数仍按 `maxFindings` 截断；画像注入另有 `deai-model-profile` 规则与上限，不因本修复放宽。

### 6.4 作者反证：G1.17

| 最可能错的假设 | 证伪方式 |
|---|---|
| 单测绿不等于真实 S3 prompt 消费 | 跑确定性 Electron 验证器，断言真实请求/trace 中 guidance 注入 |
| `performance.now()` 在测试中不可控，可能造成假阳/假阴 | 用 `maxConstructionMs=0` 与 `performance.now()` spy 构造双保险，断言可复现 |
| 只改 slice 不够，可能还有其他超预算旁路 | 全仓扫 `budgetExceeded` 与 `buildDeaiStageDiagnosis` 调用面，登记 sibling 对账 |
| E2E 既有断言可能反向要求 budgetExceeded=false | 先跑 `verify:deai-stage-guidance-electron`，若失败先判验证器口径而非改产品 |

## 7. 测试契约迁移

### 7.1 必改旧测试

`src/services/deaiStageDiagnosis.spec.ts:169-185`

旧契约：

```ts
it('drops findings that would exceed the construction budget', ...)
expect(result.budgetExceeded).toBe(true)
expect(result.findings).toHaveLength(0)
expect(result.droppedFindingCount).toBe(1)
```

按 G0.10/G1.11 同批迁移为：

1. 名称：`retains bounded findings when the construction budget is exceeded`。
2. `budgetExceeded=true`。
3. `findings.length=1`。
4. `droppedFindingCount=0`。
5. `calls=1`。
6. 追加负向断言：结果对象不再出现旧全弃形态，即 `findings` 不为空。

### 7.2 必增新测试

同一 spec 新增一条 trace 级回归：

1. 输入 8 条 findings。
2. `maxConstructionMs=0`。
3. 断言 `findings.length=6`。
4. 断言 `droppedFindingCount=2`。
5. 断言 `budgetExceeded=true`。
6. 构造 guidance 与 event 后，断言 `findingCount=6`、`injected=true`、`guidanceChars>0`、`level='warn'`。

该测试同时覆盖数量截断、超预算观测和 trace 行为，不需要新增预算测试体系。

### 7.3 假阳控制

`maxConstructionMs=0` 的用例依赖 `performance.now()` 两读差值大于 0。为避免计时精度或 mock 环境造成假阳，执行时补一条 `performance.now()` spy：第一次返回 `1000`，第二次返回 `1051`，第三次返回 `1051`。这样不依赖真实时钟，也可稳定构造 `budgetExceeded=true`。

新增 spy 用例放在原 `maxConstructionMs=0` 用例之后；如果 spy 用例已稳定覆盖新契约，可把原时间真实用例保留为环境观测用例，不重复断言。

## 8. 验证计划

### 8.1 定向服务回归

```powershell
npx vitest run src/services/deaiStageDiagnosis.spec.ts src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts
```

预期：2 files，全部通过。

### 8.2 类型检查

```powershell
npm run type-check
```

预期：exit 0。

### 8.3 确定性 Electron 端到端

```powershell
node scripts/verify-deai-stage-guidance-electron.mjs
```

预期：exit 0，且其 summary/run-trace 中 `deai-stage-guidance` 保持 `budgetExceeded=false`、`findingCount>0`、`injected=true`。该脚本使用 Electron 隔离 profile 与 mock provider，不是真实供应商。

### 8.4 全量服务测试

```powershell
npm run test:services
```

预期：全部通过。若失败，按 G1.4/G1.5 判实现缺陷或验证器契约缺口，不得为绿灯放宽产品断言。

### 8.5 真实供应商 live

`verify:deai-stage-guidance-live` 本轮不执行。

原因：

1. 该脚本消费固定本地 provider 文件与真实 Electron 用户数据，属于 observational live 通道。
2. 本缺陷已由确定性单测和确定性 Electron E2E覆盖；用户下一次真实 run-trace 也能复验。
3. 不以 live 供应商压力换取修复确认，避免过度验证链路。

## 9. G0.13 最小必要性五问

1. 用户目标是否必须依赖它？必须。修复后指导与校准样本才不被错误清空。
2. 现有机制为什么不够？现有机制已提供所有上限，只是超预算分支错误清空结果。
3. 是否会增加延迟、状态纠缠或语义冲突？不会。无新增配置、状态、外呼或第二裁判。
4. 删除它会不会损失真实用户价值？本方案是删除错误惩罚分支，不是删除能力。
5. 是否有更小实现？没有。单行条件 + 同批测试迁移已是当前最小闭环。

## 10. G1.14 缺陷面枚举计划

1. 改动分支：超预算清空、正常截断、detector 抛错、0 条 finding。
2. sibling 调用点：`PipelinePanel.vue:5170`、`:6827` 全仓对账。
3. 写入/读取对账：`deaiStageDiagnosis` 写 findings → `formatDeaiStageGuidance` 读 findings → S3 prompt / 校准账本 / 报告读结果。
4. 旧语义残留：全仓扫 `budgetExceeded ? 0`、旧测试名与 `findings` 为空断言。
5. trace 消费面：`deaiGuidanceDisplay`、`deaiSkillReport`、live/electron 验证器。
6. 不可达/环境边界：真实供应商 live 通道本轮不执行，登记 `untested`。

## 11. 裁决点与建议

| 裁决点 | 建议 |
|---|---|
| A. 超预算后 findings 处理 | 保留并按既有 maxFindings 截断 |
| B. budgetExceeded 语义 | 仅观测与 trace warn，不改终态 |
| C. 真实供应商 live | 本轮不执行，等下一次真实 trace 对账 |
| D. 文档 | 现有规格无冲突，不新写手册 |
| E. 版本 | 完成后按既有交付流程升版封装 |

## 12. 执行顺序

1. 建任务台账七节骨架。
2. `apply_patch` 修改第 113 行。
3. 同批迁移/新增测试。
4. 跑定向服务回归。
5. 跑 `npm run type-check`。
6. 跑确定性 Electron E2E。
7. 跑全量服务测试。
8. 做缺陷面枚举与写入/读取对账。
9. 回填台账与 DEV_LOG。
10. `git diff` 逐行自审。
11. 提交、升版、封装（用户确认后）。
12. GATE 声明，引用真实命令输出与 `[DEFECT-SWEEP]`。
