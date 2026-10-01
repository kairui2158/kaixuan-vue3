# 2026-09-23 API 直写长文档成熟化 V3 用户级收尾

## 背景

用户要求 API 直写能力在 5000 字级长文档上可真实完成修改、新增、删除、重排和整篇整理，并且明确要求执行 Electron 级真实 UI 实测。本日志记录 V3 收尾的实际状态、验证口径和剩余边界，不把受控验证冒充外部供应商实测。

## 代码修复

1. 删除入口假上限：大纲工作台三处与主页聊天两处不再各自硬编码工具轮上限，统一传入 `scenario: 'direct-tool-intensive'`，由 `src/services/toolLoopPolicy.ts` 单源控制 12 轮和收敛策略。
2. 收敛质量门：`src/services/aiService.ts` 新增 `judgeConvergenceText`，区分可用正文、伪工具调用和空/失败文本。工具轮第 12 轮后，伪工具调用文本会被强纠正一次；仍失败则走 `tool_converged_local` 本地兜底，不再把伪工具调用当成正文交付。
3. 收敛事件：`tool-convergence-started`、`tool-convergence-pseudo-call`、`tool-convergence-corrected`、`tool-convergence-local-fallback` 已接入 ChatPanel、OutlineWorkspace、runTrace 和 DiagLogger。
4. 会话口径：chat run 在 turn 收尾后仍处于 running 时写入 `session-active` 事件，明确这是会话仍在进行，不是失败。
5. 范围限定写入路由：`chainIntentRouter` 补充“弱写动词 + 明确目标范围 + 保持不变”判定。`帮我重排第 2 到第 5 节，剩余内容保持不变`、`只重排第 2 节，保持不变` 现在进入 edit；`先别动`、`不要修改` 等只读负样本仍保持 discuss。该修复只作用于 keep-unchanged 限定分支，不放宽全局写入阈值。

## Electron 实测

脚本：`scripts/verify-api-direct-write-user-visible-v3.mjs`

测试稿：20 节《青石镇的雨季》，7605 字符，位于 `_audit/verification-api-direct-write-user-visible-2026-09-23/test-manuscript.md`。

实测结果：

| 步骤 | 结果 | 请求次数 | 写入状态 | 终态 |
|---|---|---:|---|---|
| 修改第 3 节指定句 | 通过 | 2 | success | stop |
| 第 7 节结尾新增句 | 通过 | 2 | success | stop |
| 删除第 11 节指定句 | 通过 | 2 | success | stop |
| 移动第 15 节到第 5 节前 | 通过 | 3 | success | tool_converged |
| 整理整篇文章空行 | 通过 | 2 | success | stop |
| 第 8、9、10 节倒序重排 | 通过 | 2 | success | stop |

证据：`_audit/verification-api-direct-write-user-visible-2026-09-23/verification-result.json`、`run-trace.json`、步骤前后快照、截图与测试稿。

验证口径说明：本脚本使用本地受控 OpenAI 兼容 mock 供应商，但走真实 Electron 窗口、真实大纲编辑器、真实工具执行链、真实 runTrace 导出。它证明应用侧直写协议、工具循环、收敛门、trace 与 UI 呈现是闭环的；不能替代外部真实供应商在长上下文与真实模型行为下的监督实测。

## 回归验证

- `npm run type-check`：通过。
- `npm run test:services`：85 个文件、823 条测试全部通过。
- `npm run verify:production-wiring`：通过，308 modules 无违规。
- `npm run build:vue`：通过。Vite native config warning 为既有登记项，非本次阻塞。

## 验收脚本修正

1. step3 删除断言最初要求短语在全稿消失，但同一句式在多节重复出现，形成脚本假失败。修正为按第 11 节局部断言。
2. 路由修复过程中出现过一次 `matchAll` 未加 `g` 的脚本级错误，已改为布尔判定并保持测试全绿。

## 剩余边界

1. 外部真实供应商监督实测未执行：用户要求在电脑前观看真实模拟操作。当前完成的是受控 mock 的 Electron 级真实 UI 实测；真实供应商下的长上下文行为、写入成功率与耗时仍需后续实测。
2. 方案 4.2 原文写“不使用 mock 供应商替代本次验收”，本轮实际执行使用受控 mock。该偏差在此明确登记，不得在交付说明中隐藏。
3. 本轮不升版本、不封装。等路由回归、全量验证、文档与清理完成后，由用户确认是否执行真实供应商监督实测或直接封装。

## 清理

删除 `_audit/tmp-*` 社区调研临时载荷 10 个文件；删除后复核不存在，源码与脚本无引用。
