# 2026-09-12 降级终态与运行记录状态修复

## 项目功能

针对 3.38.3 实测导出的卷纲运行记录，修复“降级被折叠成失败、协议提示被误判为降级、chain 记忆双注入、卷纲字数回退”四类状态一致性问题。核心能力：

1. 运行记录终态链正确表达 `degraded`：run、turn、API 调用都显示“完成（降级）”，事件为 `finished` / `turn-finished` / `api-degraded`，级别为 `warn`。
2. folder 执行器区分“产物降级”与“协议提示”：只有影响交付输出的 warning 才触发降级，协议兼容提示保留在诊断但不改变成功状态。
3. chain 非首步请求不重复追加 `[相关记忆]`，记忆块保持单一所有权。
4. 卷纲写入时优先读取 `allocatedWords`，缺失时回退 `suggestedWords`，卷纲预算不被默认值吞掉。

## 用途

- SKILL 调试方导出 trace 后能区分“真的失败”与“降级完成”，不再把可用产物误判为不可用。
- 第三方 folder SKILL 缺少模板变量、非末步 schema 契约不匹配时，不再把整个链路伪装成降级。
- 长链路上下文中记忆块只出现一次，避免模型把重复记忆当成强化事实。
- 客户在卷纲层配置的每卷字数在生成、解析、写入三个环节保持一致。

## 根因

1. `runTrace.ts` 的 `finishRun()` / `finishTurn()` 只把 `success` 识别为完成态，`degraded` 落入默认失败分支，事件被写成 `failed`。
2. `realSkillExecutor.ts` 曾把所有 warning 均计入降级，导致 `folder-template-variables-missing`、`schema-contract-warning` 这类协议提示把有效产物标成 degraded。
3. `buildChainSkillPrompt()` 只在首步透传时避免记忆重复，非首步传入 `memoryPrompt` 时仍会二次拼接。
4. 卷纲解析写入处只读单一字段，`allocatedWords` 缺失或模型返回 `suggestedWords` 时被 0 值回退。

## 修复点

1. [runTrace.ts](../src/stores/runTrace.ts:578)：`finishTurn()`、`finishRun()`、`finishApiCall()` 显式处理 degraded，终态事件与标签不再折叠为失败。
2. [realSkillExecutor.ts](../src/services/realSkillExecutor.ts:46)：新增 `OUTPUT_DEGRADING_WARNING_CODES` 白名单；`folder-template-variables-missing` 降为 info，`schema-contract-warning` 不触发降级。
3. [chainExecution.ts](../src/services/chainExecution.ts:71)：追加 `memoryPrompt` 前检查 `[相关记忆]` 是否已存在，扩展单一所有权到非首步。
4. [PipelinePanel.vue](../src/components/pipeline/PipelinePanel.vue:3075)：卷纲解析两处补 `allocatedWords || suggestedWords` 回退；降级日志只显示 warning 级诊断。

## 验证矩阵

| 验证项 | 命令 / 场景 | 结果 |
|---|---|---|
| 定向回归 | `npx vitest run src/services/realSkillExecutor.spec.ts src/stores/runTrace.spec.ts src/services/chainExecution.spec.ts` | 61 passed |
| 类型检查 | `npm run type-check` | 通过 |
| 横向回归 | `npx vitest run src/services/workspaceSkillEngine.spec.ts src/services/skillRouter.spec.ts src/services/folderSkillEval.spec.ts electron/ipc/runTrace.spec.js` | 30 passed |
| 构建 | `npm run build:vue` | 通过 |
| 六缺陷 E2E | `node scripts/verify-volume-trace-six-defects-e2e.mjs` | PASS |
| 产物状态 E2E | `node scripts/verify-product-validity-status-e2e.mjs` | A/B/C/D 全部 PASS |

## 验证脚本同步修复

以下两处是脚本与最新协议不同步，不是产品缺陷：

1. `verify-volume-trace-six-defects-e2e.mjs`：Node 24 下 `cmd /c timeout /t 1 /nobreak` 返回非零导致脚本崩溃，改为 `Atomics.wait(..., 1000)`。
2. `verify-product-validity-status-e2e.mjs`：`appendReasoning/appendCumulativeStream` 已是累计语义，脚本按旧 delta 语义调用导致假失败；已改为累计调用，并补充导出时 `reasoningText` payload 还原断言。

## 收尾

- 已封装 3.38.4，安装包与验证记录见 [DEV_LOG_2026-09-12-packaging-3.38.4.md](DEV_LOG_2026-09-12-packaging-3.38.4.md)。
- 本轮产品改动范围：`runTrace.ts`、`realSkillExecutor.ts`、`chainExecution.ts`、`PipelinePanel.vue` 与对应测试/验证脚本。
