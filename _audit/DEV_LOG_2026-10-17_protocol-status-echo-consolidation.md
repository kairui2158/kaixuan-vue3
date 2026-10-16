# DEV LOG: 协议建议、真降级与终步回显状态收口

## 目标

修复 2026-10-16 223509 正文层 trace 暴露的三层误报：协议建议被当真降级、生命周期把建议类终态压扁成 degraded、终步打磨师被回显检测误伤。

## 改动

- `src/services/realSkillExecutor.ts`：`ALLOWED_POST_FIELDS` 加 `warnings`；未知字段降为 info；`generation-direct-retry-recovered` 与 `hook-field-ignored` 不再降级，截断、模板缺失、hook 失败、结构 postProcess issue 仍降级。
- `src/services/workspaceSkillEngine.ts`：新增 `success_with_warnings / post-process-warning` 终态；链终步回显降为 info 观察，中间步仍 warning；`terminalStatus` 类型扩展。
- `src/services/stateTransitionGuard.ts`：新增 `completed_with_warnings` 终态，`success_with_warnings` 不再映射 degraded。
- `src/components/chat/ChatPanel.vue`：postProcess 展示区分“完成但保留警告 / 输出已降级 / 阻断输出”；两处局部状态类型同步扩展。
- `src/components/common/OutlineWorkspace.vue`：postProcess 展示同步消费 `success_with_warnings`，避免新状态落入 error 文案。
- `src/components/pipeline/PipelinePanel.vue`：升级重试路径终步不再发误导性 `chain-output-echo` warn，中间步保留。

## 测试

- `realSkillExecutor.spec.ts`：advisory warnings 不降级；直出重试恢复为 success 且保留 warning 诊断；未知字段为 info；结构 warning 仍降级。
- `workspaceSkillEngine.spec.ts`：postProcess 建议与 blocking 终态稳定断言。
- `stateTransitionGuard.mappings.spec.ts`：`success_with_warnings -> completed_with_warnings`，`degraded` 保持独立。
- `chainExecution.spec.ts`：既有 polish 终步豁免矩阵（generator 仍修复，polish 不修复）。
- `directWriteWiring.spec.ts`：两个工作台三档文案 wiring；PipelinePanel 终步回显豁免 wiring。

## 验证

- `npm run type-check`：通过。首跑发现 ChatPanel 两处 `homeSkillTerminalStatus` 局部类型未扩展导致 TS2322，已同步修复。
- `npx vitest run src/services/realSkillExecutor.spec.ts src/services/workspaceSkillEngine.spec.ts src/services/stateTransitionGuard.spec.ts src/services/stateTransitionGuard.mappings.spec.ts src/services/chainExecution.spec.ts src/services/directWriteWiring.spec.ts`：6 files / 153 tests passed。
- `npm run test:services`：170 files / 1966 tests passed。

## 真实 Electron UI 硬门禁

- 新增 `scripts/verify-postprocess-terminal-ui-electron.mjs` 与 npm 入口 `verify:postprocess-ui-electron`。入口先执行 `npm run build:vue`，再启动真实 Electron 生产窗口。
- 脚本启动前对账 `dist-renderer`：必须存在 `postProcess 完成但保留警告`，必须不存在 `changedOutput/issues => degraded` 旧映射（真降级展示文案允许保留），并核对两个工作台源码与 bundle 文案一致。
- 真实 UI 链路：大纲工作台点击进入并输入请求，主页编辑器输入请求；均由应用真实 HTTP 客户端请求本地 mock OpenAI-compatible 供应商，各 1 次物理请求。
- 断言结果：outline 与 home 均产生 `post-process-warning`、事件 level `warn`、label `postProcess 完成但保留警告`、turn 终态 `success_with_warnings`、`turn-finished` label `第 1 轮完成（带警告）`。
- 证据：`output/playwright/postprocess-terminal-ui/electron-run.log`、`output/playwright/postprocess-terminal-ui/outline-success-with-warnings.png`、`output/playwright/postprocess-terminal-ui/home-success-with-warnings.png`。
- 本轮首次失败暴露的根因不是业务代码回归：生产 Electron 加载旧 `dist-renderer`，旧 bundle 仍把 `changedOutput/issues` 映射为 `degraded`。已通过“构建前置 + bundle 语义对账”修复验证流程，并把该规则写入 `EXPERIENCE.md`。

## 历史 Trace 回放证据

- 卷纲 `run-trace-卷纲层-20261014-133644-deep/run-trace.json:7361`：`generation-direct-retry-recovered` 曾触发 api-degraded；修复后该 code 不再进入降级名单，结构 postProcess issue 仍走降级路径。
- 正文 `run-trace-正文层-20261016-223509-deep/run-trace.json:4383/4491/4753/4861`：4 处 `hook-field-ignored` 原为 warning；修复后为 info，不再影响 run status。
- 正文同 trace `:1096/2721`：两处终步 `chain-output-echo` warning 均发生在 S3 打磨师；修复后升级重试终步不发该 warn，workspace 终步回显降为 info 观察。
- 正文同 trace 保留 4 次 api-degraded：真实降级语义未被本次修复吞掉。

## 诚实边界

- 真实 UI 验证使用本地 mock OpenAI-compatible 供应商，覆盖应用真实 HTTP 调用、postProcess、终态展示与两个工作台 UI；仍未覆盖真实外部供应商形态。
- 历史 trace 回放为静态证据；历史 payload 原件仍在外部调试目录，未引入仓库。
- live 供应商矩阵覆盖仍沿用既有边界：其他供应商形态仍需后续真实请求验证。
