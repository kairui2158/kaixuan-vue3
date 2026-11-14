# PROPOSAL · W1/W2 台账遗留三项处置 V1

## 1. 目标与原话

用户原话（2026-11-14）：剩余三项进行处理。

三项来源：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-14_body-generator-failure-wiring-v1.md` 第 7 节。用户已批准后续执行，本方案按最小必要性收口，不新增预算系统、调度器、UI 或第二裁判。

## 2. 证据与裁决

| 遗留项 | 现场证据 | 裁决 |
|---|---|---|
| 物理调用放大 | Live 2 记录 `apiCallCount=6 / physicalCallCount=14`；总预算为 16；`apiCallBudget.ts` 共享同一个 `used`；`consumePhysicalRetry` 不接收 `apiCallLimit` | 修合同缺口：物理重试进入同一共享账本且受 SKILL `apiCallLimit` 约束；不另建步级计数器 |
| resume/replay 信封闸 | Live 2 seq 362/661 两次 `generator_envelope_missing`；`PipelinePanel.vue` 纯 checkpoint 路径对任意 `startSi > 0` 都要求生成器信封 | 修生命周期误判：从生成步恢复允许 S1 legacy 骨架；从 S3 恢复仍要求 S2 生成器信封 |
| `deai-model-profile` | `DEAI_MODEL_PROFILE_RELEASED=true`；Live 2 中 `eligibleRuleCount=0`；门限为 5 | 不改门限：这是数据未达标，不是代码缺陷；重新归类为校准数据观测项 |

## 3. 影响圈

1. `src/services/apiCallBudget.ts`：`consumePhysicalRetry` 增加 `skillLimit`。
2. `src/services/realSkillExecutor.ts`：把当前步的 `pkg.meta.apiCallLimit` 传给物理重试。
3. `src/components/pipeline/PipelinePanel.vue`：纯 checkpoint 恢复闸区分生成步与后置步。
4. 聚焦测试：预算合同、断点恢复合同、executor 物理重试传参。
5. 台账、经验、开发日志索引与提交。

## 3.1 反推研磨

1. 若继续只锁总预算 16：单步可把预算吃穿，后续步失去公平机会；当前合同已有 `apiCallLimit`，物理外呼必须受同一限制。
2. 若无差别放宽 checkpoint 信封闸：S3 恢复会拿 S1 骨架当正文输入；必须只在 `startSi === generatorIndex` 放行非空骨架。
3. 若降低校准 5 样本门槛：会把统计噪声当画像注入 prompt；保持门限，改归类为数据观测。
4. 若新增独立步级计数器/UI：违反最小必要性；共享账本加参数即可。

## 3.2 成熟度

执行器/工具层：成熟。预算接口只增加可选参数，现有未传参行为不变。
应用方案/交互闭环：成熟。断点恢复仍阻断无效 S3 输入，只修正生成步生命周期。
实现接线：成熟。三项落点已锚定真实调用点与 Live 2 事件。
验证标准：成熟。聚焦合同、全量服务、静态检查、构建、台账与提交构成闭环。

## 4. 停止条件

完成须通过聚焦测试、`npm run test:services`、`npm run type-check`、`npm run build:vue`；完成台账回填与单独提交。任一失败登记缺口，不宣称闭环。
