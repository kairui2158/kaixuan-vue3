# DEV LOG 2026-09-17 tool-loop 收敛缺口补漏

> 任务：tool-loop 悬死修复后的回头看与深度反推
> 基线版本：3.52.2
> 状态：已完成，待用户确认封装

## 根因

前几轮修复解决了“悬死可观测、可中止、可收口”，但方案中的 Phase 3“无进展收束”只落地了 warning，没有落地强制总结请求：

1. `callAiWithTools()` 到达 `maxToolIterations` 后，最后一轮仍携带 `tools` 原样发出。
2. 模型继续调用工具，应用返回空正文并标记 `tool_loop_limit`。
3. 上层将空正文判为失败，用户看到“未输出正文/连续尝试工具调用”，多次修复始终无法拿到结果。

这不是 supervisor 失效，而是“循环终止”没有升级为“收敛回答”。

## 修复

1. `aiService.ts`：到达工具上限且全程没有可用正文时，追加 system 指令“停止调用任何工具，基于已获得的工具结果直接输出最终回答”，并发起一次不带 tools 的 `tool_convergence` 物理请求。
2. 收敛请求保持非流式（除非调用方显式指定），避免沿用无工具 generate 的默认流式导致供应商返回形态不匹配。
3. `runTrace.ts`：物理请求 phase 增加 `tool_convergence`，SKILL 调试方可区分“工具轮”和“收敛轮”。
4. E2E 断言升级：工具循环必须输出“基于已有工具结果的收敛回答”，run 为 success，trace 记录 `tool_converged` 与 `tool_convergence`，请求体确认不带 tools 且携带停止工具指令。
5. 回头看补漏（同日第二轮）：收敛请求自身失败或返回空正文时，不再向调用方抛出第二个异常。服务层直接生成本地收敛摘要，输出全部已收集工具结果与下一步建议，终态为 `tool_converged_local`；用户取消仍原样上抛。该路径同时覆盖供应商 500、请求超时、模型仍拒绝输出三种形态。
6. 第三轮回头看（竞态补漏）：发现 E2E 曾用测试覆盖写把 supervisor 死线缩到 20 秒，掩盖了真实用户路径的竞态。真实 direct 对话把逻辑 `timeoutMs` 设为 300 秒，工具轮慢速叠加后，外层 supervisor 会在收敛请求执行中到达总死线并 abort，救场请求被应用自己杀掉。修复为：`tool_convergence` 请求不继承原逻辑 `signal` 与 `timeoutMs`，改用物理请求自身默认超时；单测构造“外层 deadline 已 abort”的调用，断言收敛请求 signal 未 aborted 且仍返回 `tool_converged`。

## 验证

1. `npx vitest run src/services/aiService.spec.ts`：80/80 通过。
2. `npx vitest run src/services/aiService.spec.ts src/stores/runTrace.spec.ts src/services/toolRunSupervisor.spec.ts`：119/119 通过。
3. `npm run type-check`：通过。
4. `npm run build:vue`：通过。
5. `node scripts/verify-outline-silent-wait-fix-e2e.mjs`：五项 PASS，包括收敛回答渲染、工具过程保留、hold 接管、取消语义、导出对账。
6. `npm run test:services`：71 文件 / 629 测试全部通过。
7. 回头看补漏验证：`npx vitest run src/services/aiService.spec.ts` 81/81 通过（新增收敛请求 500 时本地摘要测试）；`npm run type-check` 通过。
8. 第三轮竞态补漏验证：`npx vitest run src/services/aiService.spec.ts` 81/81 通过（新增外层 deadline 已 abort 时收敛请求仍存活的测试）。

## 经验回写

1. 警告不是收束：只显示“模型未输出正文”不能改变下一轮请求形态，必须在真实边界上改变请求内容（去掉 tools + 注入停止指令）。
2. 越界终止必须换形态：到达循环上限后的额外请求不能复用原工具请求参数，否则模型仍会工具调用。
3. 无工具请求会回到默认流式策略：工具轮是非流式 JSON，收敛请求若不显式 `stream: params.stream ?? false`，mock/供应商可能返回 JSON 而被 SSE 解析为空。
4. E2E 采样字段要按被测对象补齐：`latestRun()` 原先没有映射 `physicalCalls.phase`，第一次 E2E 失败暴露的是断言载体缺口，不是产品缺口。
5. 兜底也要有终态：不能把“最后一次救场请求失败”重新变成用户可见失败。此时应用已经拥有工具结果证据，必须把它交给用户/上游，而不是制造第二次空正文事故。
6. 测试覆盖写会制造假闭环：E2E 为方便测试把 supervisor 死线改成 20 秒，导致慢工具轮 + 收敛请求的真实竞态永远测不到。涉及“救场/收敛/重试”的路径时，测试环境必须保留或显式模拟真实外层时限，而不是只验证被覆盖后的路径。
