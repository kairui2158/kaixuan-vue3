# TASK LEDGER：正文层内嵌降AI V3 剩余缺口收口（2026-10-30）

## 1. 目标与原话

用户原话核心：“把剩余缺口补完。”

上一轮方案对账登记的缺口为：`finalStepDetection: off + deep-fix` UI 双状态、`conflictPolicy` 真实 UI 链路、`deai-voice-profile` 端到端采样、S1/S2/S3 同一投影断言。本轮目标是在既有 V3 实现基础上补齐 Electron 验证器场景与断言，完成最终复跑、审计文档、经验回写与临时文件清理。

## 2. 门禁读证

读证文件：`_audit/神意开发经验总结_v9.md`（本轮执行前 v9.8.2）。

- G0.1：目标是补完 V3 剩余缺口，不为绿灯改变产品语义。
- G0.3：mock Electron 只声明 mock 证明范围，不冒充 live；失败先判验证器口径。
- G0.4：开工前复读最新 DEV_LOG 与 G1.4-G1.6、G1.15、G1.21-G1.23。
- G0.5：收尾逐行对账 diff、生产入口、验证器、报告与临时文件。
- G0.7：失败场景先做物理请求与 trace 双向对账，再决定是否改产品。
- G0.8：临时探针删除前确认路径，删除后复核不存在。
- G0.12：本台账七节齐全。
- G1.4：验证器修改后完整重跑，不得用单测或历史产物冒充。
- G1.5：验证器假设、mock 序列、断言语义属于被查对象。
- G1.6：mock 场景切换必须重置全部状态；本轮事故证明响应队列与请求账本是两个状态。
- G1.15：复盘“为什么当时没看见”，不以还原对话替代根因定位。

## 3. 路由判定

加入：验证器 mock 修复、断言语义修正、产品误判补丁回退、Electron 六场景复跑、审计文档与经验回写。

排除：解除 Phase 10 provisional；校准样本结构仍不满足门禁。

排除：git 提交、重新封装、版本号调整；用户本轮未要求，版本保持 `3.110.7`。

排除：修改 `dedupeChainIntermediateOutput` 语义；根因确认后，中间产物去重保持对所有非终步生效。

## 4. 影响圈与作者反证

改动面：

- `scripts/verify-deai-body-electron.mjs`：新增/修正六场景真实 UI 验证、mock 队列重置、请求诊断字段、声纹投影断言、报告字段。
- `src/components/pipeline/PipelinePanel.vue`：回退上一轮基于误判加入的两处 `!isGeneratorStep` 条件，恢复中间产物去重原语义。
- `_audit/verification-deai-body-electron/`：当前报告与证据。
- `_audit/DEV_LOG_2026-10-30_deai-v3-gap-closure.md`、主索引、经验文件。
- 删除临时探针 `_audit/tmp-deai-voice-debug.mjs`、`_audit/tmp-deai-voice-debug.json`。

作者反证：

1. 假设“场景 5 账本缺失是产品剥离交接块”。证伪：失败现场 `queueRemaining: 5` 表明进入场景 5 时响应队列已残留；场景 5 的 S1 请求消费的是场景 4 残留的 S2 响应，账本缺失是队列错位下游症状。产品回退已执行并复跑通过。
2. 假设“冲突事件应每步记录”。证伪：产品语义是只有与 SKILL 模板重叠的步骤记录冲突决策；S2/S3 无重叠就不应有事件。断言已改为 `conflicts.length === 1`，skill-wins/app-wins 双场景一致。
3. 假设“只修验证器即可”。证伪：上一轮基于误判已改产品两处；根因确认后若不回退，会把错误条件留在生产链路中。

## 5. 停止条件

1. Electron 验证器六场景完整通过并输出 `===== DEAI BODY CONTRACT ELECTRON PASSED =====`。
2. 报告覆盖 default、skill-disabled、invalid-fallback、final-step-off-deep-fix、conflict-skill-wins、conflict-app-wins，并含 UI 双状态、声纹采样、conflictEvents、warningEvents。
3. 产品误判补丁回退后，`chainExecution` 定向测试、type-check、renderer build 与 Electron 全量复跑全部通过。
4. 台账、DEV_LOG、主索引、经验文件落盘；临时探针清理并复核。

## 6. 执行证据

### 根因

`provider.reset()` 原来只清 `requests`，不清 `queue`。场景 4 基础 3 条响应加 deep-fix 1 条，共入队 7 条（旧实现里场景函数手动再入 4 条），消费 4 条后残留 3 条；场景 5 的 S1 拿到旧 S2 响应、S2 拿到旧 S3 响应，最终表现为账本缺失与验收失败。

修复点：

- `scripts/verify-deai-body-electron.mjs:392-395` → `reset()` 同时清空 `requests` 与 `queue`。
- `scripts/verify-deai-body-electron.mjs:766-780` → 场景响应统一由 `prepareScenario` 的 `extraResponses` 入队，删除场景函数内重复入队。
- `scripts/verify-deai-body-electron.mjs:363-365` → 请求记录增加 `responsePreview`、`responseLength`、`queueRemaining` 诊断字段。

### 断言语义

- `scripts/verify-deai-body-electron.mjs:882-886` → skill-wins 场景只记录 1 条冲突决策，重叠词为 `['短句','碎片','对白']`。
- `scripts/verify-deai-body-electron.mjs:919-925` → app-wins 场景只记录 1 条冲突决策，且为 warn 事件。
- `_audit/verification-deai-body-electron/report.json` → 六场景 `success`；`final-step-off-deep-fix.settingsUiDualState: true`；`conflict-skill-wins.conflictEvents: 1`；`conflict-app-wins.warningEvents: 1`。

### 产品误判回退

- `src/components/pipeline/PipelinePanel.vue:4260-4264` → 主链中间产物对所有非终步执行 `dedupeChainIntermediateOutput`。
- `src/components/pipeline/PipelinePanel.vue:4579-4584` → 升级重试中间产物同样对所有非终步执行去重。
- 依据：`src/services/chainExecution.ts:79` 的去重只剥记忆块与“上一步输出”回显，不剥 `【正文交接】`。

### 验证命令

- `node scripts/verify-deai-body-electron.mjs` → 六场景输出 `===== DEAI BODY CONTRACT ELECTRON PASSED =====`。
- `npx vitest run src/services/chainExecution.spec.ts` → 24/24 passed。
- `npm run type-check` → exit 0。
- `npm run build:vue` → 成功，Electron 复跑使用回退后构建。

## 7. 缺口清单

- Phase 10 校准仍为 NOT_READY：正样本每组不足 30 条、人写 suspicious+ 误伤、最差作者误伤、召回、CI 半宽未达门禁；阈值与评分保持 `provisional`。
- 本轮 Electron 验证是 mock provider，不声明 live 供应商结论。
- `suffix-only` 与 `on` 等价、冲突检测固定中文词表是契约 v1 声明边界，不是本轮缺陷。
- 不提交 git、不重新封装，安装包保持 `3.110.7`。
