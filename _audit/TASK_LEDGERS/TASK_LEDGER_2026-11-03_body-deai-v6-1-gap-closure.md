# TASK_LEDGER_2026-11-03_body-deai-v6-1-gap-closure.md

## 1. 目标与原话

- 用户原话：`执行`
- 目标：闭环 V6.1 对账发现的四个缺口：误伤候选无入口、校准账本无保留策略、模型画像步骤硬编码、多 run 并发守护缺失。
- 最终可感知行为：误伤候选可登记并导出；校准账本有 500 条上限且 trace 记录裁剪；模型画像由 body 层语义入口触发；诊断与报告按 run 隔离并有测试锚定。

## 2. 门禁读证

- G0.3 诚实闭环：完成声明必须区分已验证与未验证，live/Electron 未重跑要登记。
- G0.5 回头看：收尾前对账 diff、入口、测试和文档。
- G0.9 影响圈声明：只改降AI V6.1 相关服务、PipelinePanel、集成测试、审计文档。
- G1.1 精准编辑：全部使用 apply_patch，未整文件重写。
- G1.4 验证分层：源码断言只作接线守护，不冒充运行时集成；UI 新入口未实测要写明。
- G2.9 终稿与流水线：诊断只做情报注入，不改变终态、retry 或验收。
- G2.13 SKILL 执行中立：应用只送情报，不替 SKILL 承担写作质量责任。

## 3. 路由判定

- 加入：G0.3、G0.5、G0.9、G1.1、G1.4。
- 排除：G0.2（用户本轮未触发不设预算语义）；G2.10（不做旧 trace 回放验收）；G2.14（不做存储根迁移）。

## 4. 影响圈与作者反证

- 打算改：`deaiCalibrationLedger` 及测试、`PipelinePanel.vue`、`deai-stage-guidance.integration.spec.ts`、新增 DEV_LOG、TASK_LEDGER、SKILL 适配说明。
- 可能碰到：报告导出、模型画像注入、S2 诊断暂存、per-run 状态结构。
- 作者反证：如果 `falsePositives: []` 回归、`step !== 4` 回归、诊断跨 run 串台、账本无界增长，本闭环失败。

## 5. 停止条件

- 完成：四个缺口各有代码入口、负向断言、测试通过、type-check 通过、全量服务测试通过、文档与台账落盘。
- 失败：任一测试红、类型错误、旧语义回归、或缺口无真实入口。

## 6. 执行证据

- 账本：`src/services/deaiCalibrationLedger.ts` 提供 `DEAI_CALIBRATION_LEDGER_MAX_ENTRIES`、`pruneDeaiCalibrationLedger`、`DeaiCalibrationRecordResult`。
- 接线：`src/components/pipeline/PipelinePanel.vue` 中生成前调用点为 `const isBodyLayer = pipelineLayerForStep(step) === 'body'`，并以 `resolveDeaiModelProfileGuidanceForRun(..., isBodyLayer, ...)` 进入；校准 trace 消费 `calibrationRecord?.pruneResult`；报告 `falsePositives: falsePositiveFeedback`。
- UI：`id="pl-deai-false-positive-input"`、`id="btn-pl-deai-false-positive"`。
- 测试：定向 2 files / 22 tests passed；扩展定向 6 files / 52 tests passed；`npm run type-check` exit 0；`npm run test:services` 245 files / 2629 tests passed（当时测试总数；后续新增测试后最新结果为 2638）。

## 7. 缺口清单

- 真实 Electron E2E 已在追加收敛后重跑通过；真实供应商 observational live 已有五个证据目录，含失败与 running 状态。
- 未观测：真实长期用户数据下的账本裁剪分布。
- 交付边界：2026-11-03 用户已授权 3.112.0 交付；升版、封装、显式提交 git 由发布台账接续。

## 8. 收尾补口

- 2026-11-03 追加：画像调用点硬编码补口完成，RED→GREEN 证据为本轮 `deai-stage-guidance.integration.spec.ts` 先 1 failed 后 14 passed。
- DEV_LOG 已同步调用点改动；方案状态更新为 V6.1 缺口闭环完成。

## 9. 2026-11-03 追加闭环对账

### 新增缺口与修复

1. `releaseGate=null`：无 eligible 规则时旧实现不输出 `calibration-not-ready`；已修复为冻结期一律输出。
2. 单条 sample 超长：已修复为每条 finding sample 独立 120 字符截断。
3. 0 finding 无观测：已修复为输出 `S2 后降AI位置诊断已执行：0条 / 未注入`，只做观测，不注入 prompt、不影响终态。
4. 停滞检测时间戳污染：live/Electron `currentRunSnapshot` 移除 `at`，签名只看业务状态。
5. live 断言不足：补 stage guidance、预算、UI 诊断线、模型画像 release gate 硬断言。

### 最新 live 事实

- `run-20261103-020722`：第 1 章 success，第 2 章 failed，第 3 章未执行。
- 第 2 章失败主因：S2 三次候选净字数约 1434/1447/1447，均低于 1600 下限；不是候选选择回退、word-gap 骨架缺失或全链重建。
- 第 2 章 retry 均携带 S1 场景骨架、FACT_LOCK、目标/当前/还差净字数，且未携带候选全文；未进入 S3，因此无 stage guidance 是正确行为。
- 该次 trace 的 `releaseGate=null` 为旧实现缺口，当前已修复并有测试守护。

### 追加验证

- 定向：`npx vitest run src/services/deaiStageDiagnosis.spec.ts src/services/deaiModelProfile.spec.ts src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts` → 3 files / 34 tests passed。
- 类型：`npm run type-check` → exit 0。
- 构建：`npm run build:vue` → exit 0。
- 脚本语法：`node --check scripts/verify-deai-stage-guidance-live.mjs; node --check scripts/verify-deai-stage-guidance-electron.mjs` → exit 0。
- Electron：`node scripts/verify-deai-stage-guidance-electron.mjs` → `===== DEAI STAGE GUIDANCE ELECTRON PASSED =====`。

### 2026-11-03 过度设计追加收敛

1. 删除 `resolveDeaiModelProfileGuidanceForRun` 的冗余 `isBodyLayer` 参数；调用点保留 `pipelineLayerForStep(step) === 'body'` 作为唯一入口。
2. S2→S3 诊断入口从 `step === 4` 改为 `isBodyLayer && si < templates.length - 1 && ...`，防止未来步骤重排后诊断静默失效。
3. 集成测试同步迁移锚点，并新增负向断言禁止 `step === 4 && si < templates.length - 1` 回归。
4. 过度设计四问结论：不替 SKILL 承担质量责任；不为证明应用有用而注入；不新增配置、等待状态或跨层共享状态；删除冗余后接线与负向守护仍可验证。

### 追加收敛验证

- 定向：`npx vitest run src/services/deaiStageDiagnosis.spec.ts src/services/deaiModelProfile.spec.ts src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts` → 3 files / 34 tests passed。
- 类型：`npm run type-check` → exit 0。
- 构建：`npm run build:vue` → exit 0。
- Electron：`node scripts/verify-deai-stage-guidance-electron.mjs` → 3 个逻辑 call、3 次物理 call，`===== DEAI STAGE GUIDANCE ELECTRON PASSED =====`。
- 全量：`npm run test:services` → 245 files / 2638 tests passed。

### 仍未闭环

- 真实供应商 live 已有五个 observational 证据目录：一次第 1 章失败，一次第 1/2 章成功但第 3 章 running，三次第 1 章成功后第 2 章失败；不作为质量提升证明或发布门禁。
- 第 2 章 S2 施工净字数不足交 folder SKILL 作者迭代，应用不替 SKILL 改写作规则。
