# DEV LOG — 2026-11-15 — W1/W2 遗留三项收口

## 交付

- **物理调用放大**：`consumePhysicalRetry` 接受并使用 SKILL `apiCallLimit`；executor 把当前包上限传给共享预算。物理重试仍记入同一 `used`，步级上限与总预算同时生效，无新计数器。锚点：`src/services/apiCallBudget.ts:26-107`、`src/services/realSkillExecutor.ts:118-129`、`src/services/realSkillExecutor.ts:1136-1141`。
- **checkpoint 信封闸**：纯断点恢复在 `startSi` 等于唯一生成步且产物非空时接受 legacy 骨架；生成步之后仍必须通过生成器信封检查。锚点：`src/components/pipeline/PipelinePanel.vue:4538-4554`。
- **`deai-model-profile` 归类**：复核为数据未达标，不改代码与 5 样本门限。旧台账条目同步指向本轮方案。

## 验证

- 聚焦：5 个 spec 文件 102 项通过，含预算 `skillLimit`、恢复闸正反形态、W1/W2 既有接线与断点服务。
- 全量：`npm run test:services` → 253 files / 2761 tests 通过。
- 静态：`npm run type-check` exit 0；`npm run build:vue` exit 0。
- 首次失败修正：预算 spec 期望漏计第一次调用；恢复闸 source 断言被 CRLF 影响已归一化；`realSkillTypes.ts` 合同首跑漏同步已在 type-check 阶段补齐。

## 边界与未验证

- 不改 folder SKILL；不放宽校准 5 样本门槛；不新增预算系统、调度器、UI、第二裁判。
- 未重跑真实 Electron 供应商链路。下一次正文层真实运行需要检查：物理调用数是否受 `apiCallLimit` 阻断、`body-resume-artifact-invalid` 是否只应出现在生成步之后。
