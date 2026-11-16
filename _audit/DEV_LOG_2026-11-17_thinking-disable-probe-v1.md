# 2026-11-17 供应商禁思考能力自探测 V1

## 背景与目标

声明式禁思考参数把“知道参数名”的负担交给用户；声明错误时请求仍被供应商接受，禁思考静默失败。本轮在不动生成路径的前提下，把能力确认变成一次手动诊断动作。

## 交付

1. 新增 `providerThinkingProbe`：先测无覆盖基线，再对候选参数做二分式实测；候选按 `thinking={"type":"disabled"}` → `enable_thinking=false` → `reasoning_effort="none"` → `chat_template_kwargs={"enable_thinking":false}` 排列，首个生效短路。
2. 判定六态为 `effective / rejected / no_effect / not_applicable / undecidable / probe_error`；生效阈值是候选 reasoning 信号不超过基线 20% 且 text 非空。400 参数拒绝后继续候选，非 400 供应商错误终止。
3. reasoning 信号走双通道：响应 `reasoning` 字符串字段为主，`normalizeUsage().reasoningOutputTokens` 兜底；两者不可用时不得宣称生效。
4. Provider 已有 `thinkingDisableParam` 声明时只验证该声明，验证请求通过请求级覆盖进行，避免探测污染 provider 字段。
5. API 设置新增“探测禁思考”按钮，仅 OpenAI 兼容供应商显示；结果显示判定与请求数，`effective` 时自动填充声明并持久化，历史结果回显上次探测时间。

## G0.13 缺陷面枚举

1. 不自动挂到“测试连接”：探测是最多 5 次小请求的诊断动作，自动增加每次连接成本。
2. 不修改生成路径：请求层继续只消费 provider 声明；探测通过请求级覆盖采样，不改变现有无覆盖请求合同。
3. 不做运行中自动探测：避免把不可判定态放进生成状态机。
4. 不按供应商名硬编码：候选列表只是预设便利层，最终只持久化验证通过的声明。
5. 中转可能剥离 reasoning 文本与 usage reasoning token，此时只能判 `undecidable`，提示手动声明。

## 验证

1. 定向：`npx vitest run src/services/providerThinkingProbe.spec.ts src/components/settings/ApiSettings.spec.ts` → 2 files / 20 tests PASS。
2. 全量：`npx vitest run` → 254 files / 2809 tests PASS。
3. `npm run type-check` exit 0；`npm run build:vue` PASS。
4. UI 回归锁定探测结果持久化、声明自动填充与历史判定回显；服务回归覆盖基线无信号、400 跳过、非 400 终止、usage 兜底、阈值边界、手动声明优先与供应商错误。

## 边界

探测是手动诊断动作，不进生成路径；`not_applicable` 是基线无 reasoning 信号，不是失败；`undecidable` 需用户手动声明后再次验证。真实供应商 live 烟测未做，待用户提供的一次 UI 实测为准。
