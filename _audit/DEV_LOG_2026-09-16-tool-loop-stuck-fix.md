# DEV LOG 2026-09-16 tool-loop 悬死修复

> 任务：执行 `PROPOSAL_2026-09-16_TOOL_LOOP_STUCK_FIX_MATURE.md`
> 基线版本：3.52.2
> 状态：已完成，待用户确认是否封装

## 目标语义

1. 大纲工作台 direct 对话出现工具循环、供应商 hold、无进展流式响应时，用户不再无限等待。
2. 工具调用过程必须先可见：API 气泡展示工具阶段，运行记录能还原每一次物理请求与工具结果。
3. 停滞、总上限、重复工具错误要有可解释的失败终态；用户取消必须保留 canceled。
4. supervisor 只负责 abort 与报告，run/turn/api-call 终态仍由业务 catch 与 `finishRun/finishTurn` 收口。

## 根因

1. 物理请求观测黑洞：请求发出后没有 running 物理请求记录，abort 竞态下也没有 canceled 收口，用户和 SKILL 调试方都看不到真实网络状态。
2. 看门狗无执行权：旧观测只改状态或提示，没有统一中止请求，供应商 hold 时 `await` 永远悬挂。
3. 悬死绕过 catch/finally：请求不返回、不报错、不取消，业务层没有入口触发终态收口。

## 做了什么

1. 新增 `src/services/toolRunSupervisor.ts`：idle 默认 150 秒、hard deadline 默认 300 秒、同工具重复错误阈值 3 次；触发后 abort controller 并回调 `onStuck`。
2. `OutlineWorkspace.vue` 接入 supervisor：写入 `state-stuck-aborted` trace 事件，同时通过 DiagLogger 写 `outline/tool-run-supervisor` warn 日志；catch 分支按 `stuck_timeout / hard_deadline / repeated_tool_error` 分类收终态。
3. `aiService.ts` 记录 `currentPhysicalAttempt`，abort 时以同一 `physicalCallId` 上报 `canceled`，闭合 running 物理请求。
4. `runTrace.ts` 的 `finishTurn()` 增加 reason 透传；`cancelRunningApiCalls()` 同步闭合同 call 下的 running physicalCalls。
5. 修复 E2E 测试钩子缺陷：`createToolRunSupervisor()` 内实时读取 `__SHENYI_TOOL_RUN_TEST_OVERRIDES__`，不再在模块加载期固化。
6. E2E 补齐诊断对账：运行中订阅 DiagLogger；同时用 `SHENYI_TEST_LOG_DIR` 隔离日志目录，断言 `outline/tool-run-supervisor` 双侧可见。

## 验证记录

1. `npx vitest run src/stores/runTrace.spec.ts src/services/aiService.spec.ts src/services/toolRunSupervisor.spec.ts`：3 个文件 / 119 个测试全部通过。
2. `npm run type-check`：通过。
3. `npm run build:vue`：通过。
4. `node scripts/verify-outline-silent-wait-fix-e2e.mjs`：五项 PASS，覆盖工具过程可见、tool_loop_limit 可读、hold 2 秒被 supervisor 接管并闭合 run/turn/apiCall/physicalCall、用户取消保留 canceled、导出 payload 对账。
5. 诊断对账：renderer 订阅捕获 warn 事件；主进程 `renderer-YYYY-MM-DD.jsonl` 同类别命中；测试 profile、导出目录与日志目录均清理。

## 经验回写

经验文件升级 v5.13，新增 §8 规则 121-123：测试钩子禁止加载期固化；取消收口必须覆盖 physicalCalls；supervisor 不抢业务终态。根因索引新增三条对应模式。

## 后续建议

1. 主页编辑器与生成流水线后续可复用同一 supervisor，但本轮按方案只接大纲 direct 对话，避免扩大爆炸半径。
2. 版本封装建议在用户确认后执行；当前 `package.json` 仍为 3.52.2。
