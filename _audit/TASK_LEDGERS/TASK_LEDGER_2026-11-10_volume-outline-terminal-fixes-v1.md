# TASK_LEDGER_2026-11-10_volume-outline-terminal-fixes-v1

## 背景

卷纲层 SKILL 转达了 4 项应用侧待办：输出有效性将 reasoning 计入正文预算导致误判 truncated；协议终点确认文本被续写合并；续写提示缺少协议标记禁令；物理重试实际消耗超过逻辑 attempt 计数，默认预算 8 会被放大消耗提前阻断。用户要求终态修复而非止血。

## 目标

1. 输出有效性区分 reasoning/output tokens，并结合 `finishReason` 消除完整输出误判。
2. 协议终点确认文本保持候选独立，不合并进正文。
3. continuation 提示明确禁止输出续写协议标记。
4. 物理重试、心跳重试、直接重试和续写按真实物理调用共享预算单源计费。
5. 保留可审计 blocked 状态、回归测试、升版、封装与定向提交。

## 改动

1. `src/services/generationValidity.ts`
   - 新增 reasoning/output token 读取与正文 token 扣减。
   - `stop`、`end_turn`、`tool_calls`、`tool_use`、`content_filter` 等明确非长度终点不再因 token 预算推断 truncated。
2. `src/services/apiCallBudget.ts`
   - 新增 `consumePhysicalRetry()`，与 attempt 预算共享同一账本。
   - 零预算测试分支同步实现该方法。
3. `src/services/realSkillExecutor.ts`
   - `callAiOnce` 接入 `onPhysicalCall` 计费钩子。
   - 按 `physicalCallId` 去重，避免 running 与 success/failed 双回调重复计费。
   - 对 retry、heartbeat_retry、direct_retry、continuation 计费；normal 与 schema_retry 保持 attempt 级计费。
   - 预算阻断通过 `budgetBlocked` 识别并返回 blocked，不再伪装成 generation failure。
   - 协议终点续写成功合并后清除旧 `generation-truncated` 诊断，避免成功结果被错误降级。
4. `src/services/realSkillTypes.ts`
   - budget 类型补充可选 `consumePhysicalRetry`。
5. `src/components/pipeline/PipelinePanel.vue`
   - 流水线默认预算由 8 调整为 24，适配实际物理调用模型。
6. 回归测试
   - `generationValidity.spec.ts` 补 stop 豁免、reasoning 扣减和无 finishReason 回归。
   - `apiCallBudget.spec.ts` 补共享账本计费与阻断。
   - `realSkillExecutor.spec.ts` 补协议禁令、物理回调去重计费、blocked 返回和续写诊断清除。

## 验证

1. 定向测试：4 个相关 spec 共 124 tests passed。
2. `npm run type-check`：exit 0。
3. `npm run test:services`：250 files / 2703 tests passed。
4. 版本升级：`npm version minor --no-git-tag-version` 输出 v3.121.0。
5. `npm run build`：生成 `dist/神意助手-Setup-3.121.0.exe`。
6. `npm run verify:packaging`：`PACKAGING 3.121.0 VERIFICATION PASSED`；installer SHA-256 `8f61af6f4409721acb801dfe54de8415fe1a30b9b4ddb393565bc167dd314174`；rendererFiles 87；electronAPI methods 94。

## 边界

1. 不修改 folder SKILL 和卷纲层模板。
2. 不新增自动调度、预算系统或 UI；只做真实物理调用计数。
3. 不触碰用户既有验证产物、无关台账、docs 和归档脏文件。

## 遗留

1. Electron GUI 真实供应商手工烟测由用户实测执行；packaged app 首窗、electronAPI 与 rendered shell 已自动核验。
2. `deai-model-profile` 仍受校准发布门禁控制，本轮不解除。
3. `postProcess usage` 注入不属于本次卷纲终态问题，不混入本次交付。

## 结论

卷纲层 4 项应用侧问题已完成终态语义修复、预算单源接线、回归守护、升版与交付封装准备。
