# 2026-11-17 reasoning 终态短路与供应商可选禁思考参数

## 背景与目标

客户实测出现 `reasoning > 90% + 正文为空 + finishReason=length` 的长思考耗尽模式：直出重试后仍无正文，body 修复编排继续 targeted/full_chain，造成分钟级空转。同时首个仅针对 GLM 的禁思考方案被否决，改为通用供应商能力声明。

## 交付

1. `realSkillExecutor` 直出重试失败时识别 `generationValidityKind=reasoning_exhausted`，返回 `status=failed + terminalApiError=true`。
2. `PipelinePanel` 三处 folder 结构化失败出口透传 `terminalApiError`；chain 步骤失败遇到该标记时写 `body-generator-terminal-api-error` 并立即抛终态错误。
3. `bodyArtifactOrchestrator` 把 `terminalApiError` 加入结构化失败，attempt 台账落盘后短路为 `terminal_provider_error`，不进入修复循环。
4. Provider 增加 `thinkingDisableParam/thinkingDisableValue` 声明字段；OpenAI 兼容协议优先消费声明，否则保留 `reasoning_effort=none` 默认。Anthropic 原有协议不动。
5. API 设置高级区补齐 OpenAI 兼容禁思考参数输入；声明字段随编辑/导入 spread 全字段保留；清空参数名时同步清空参数值。

## G0.13 缺陷面枚举

1. 未做自动探测各供应商禁思考参数：当前没有统一探测协议，且错误参数会改变请求合同，G0.13 不支持。
2. 未做运行中自动调度：现有供应商矩阵已有手动声明入口，自动切换会引入新状态机与失败面，本轮不做。
3. 未做 reasoning 校准账本：单次 `reasoning_exhausted` 是明确供应商级终态，不再需要样本积累才能短路。
4. 未扩展 Anthropic 协议：该协议已内置 `thinking={type:"disabled"}`，改动会产生无效重复字段。
5. 未新增 UI 汇总页：只在现有“高级接口设置”内补齐声明入口，避免设置面板膨胀。

## 验证

1. 定向：`npx vitest run src/components/settings/ApiSettings.spec.ts src/services/providerTools.spec.ts src/services/realSkillExecutor.spec.ts src/services/bodyArtifactOrchestrator.spec.ts` → 4 files / 147 tests PASS。
2. 全量：`npx vitest run` → 253 files / 2794 tests PASS。
3. `npm run type-check` exit 0；`npm run build:vue` PASS。
4. 设置页新增保存回归锁定 `thinkingDisableParam/thinkingDisableValue`；请求层回归锁定声明优先与无声明默认。

## 边界

不修改 folder SKILL；不新增预算系统、自动调度或汇总 UI；不硬编码供应商；API key 不写入代码、日志或证据。
