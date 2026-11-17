# 2026-11-17 可见规划检测与探测语义升级 V1

## 背景与目标

供应商把输出预算全部投入推理后，可能把英文规划文本写入可见输出通道；旧判走会把这类非正文产物当有效文本。同时禁思考探测只比较 reasoning 信号，若参数只是把思考搬到可见通道，会被误判为生效。

## 交付

1. 新增 `visiblePlanningText`：去除空白后按英文规划字符占比、规划短语和阈值 `0.6` 计算可见规划强度。
2. `generationValidity` 新增 `visible_planning`：只在 `length/max_tokens/max_output_tokens` 或正文输出达到 `maxTokens` 时拒绝高占比规划文本；中文夹英文术语与正常 stop 的英文正文保持可用。
3. `realSkillExecutor` 与 `ChatPanel` 把 `visible_planning` 接入既有直出重试：供应商推理控制可用时关闭思考，否则提高上限；二次失败终态保持 failed 并记录 `generation-invalid:visible_planning`。
4. 供应商禁思考探测器补 `visiblePlanningChars` 与 `baselineVisiblePlanningChars`：候选 reasoning 信号达标但可见规划仍高时判 `planningHijackedVisibleChannel`，防止假生效。
5. 物理请求 trace 新增 `temperature/thinkingDisableParam/thinkingDisableValue` 快照与逻辑请求来源标记，写入 store、投影、payload firstSeen 与导出文本，不参与 payload SHA256 去重。

## G0.13 缺陷面枚举

1. 不新增修复循环或第三方裁判：复用既有一次直出重试。
2. 不在正常 stop 分支做英文风格判断：只在预算耗尽证据出现时启用，降低误杀正文风险。
3. 不把探测候选表变成真源：探测只验证声明，请求层继续消费 provider 声明。
4. 不改 payload 去重语义：请求参数快照放 firstSeen 侧，保持同请求多物理调用去重。
5. 不做全仓类型泛化：只修本轮触及的 body/orchestrator 消费面。

## 验证

1. P3 定向：`npx vitest run src/services/providerThinkingProbe.spec.ts` → 25 tests PASS。
2. P1/P2 定向：`npx vitest run src/services/generationValidity.spec.ts src/services/realSkillExecutor.spec.ts` → 2 files / 106 tests PASS；请求快照 4 文件 160 tests PASS。
3. 全量：`npx vitest run` → 254 files / 2820 tests PASS。
4. `npm run type-check` exit 0；`npm run build:vue` PASS。

## 边界

`_audit/k92-agent-store-probe.mjs` 为本地未跟踪探针，不入库；真实供应商 live 烟测未做，以既有探测和测试基线交付。
