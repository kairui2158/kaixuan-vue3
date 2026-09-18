# 大纲工作台空等与运行记录失真修复（2026-09-14）

## 任务

执行 `_audit/PROPOSAL_2026-09-14_OUTLINE_SILENT_WAIT_FIX.md`，修复大纲工作台在模型连续工具调用时“气泡静默、进度条冻结、用户空等”的问题，同时修正运行记录中取消终态折叠、失败缺少 finishReason、空载荷物理请求、导出 payload 对账失真等调试数据缺陷。

## 根因与修复

1. 工具活动隐身：`askAi()` 与 `askPlainAi()` 的 onToolStart / onToolCall 过程改为写入组件级 `liveToolStream`，请求结束后把快照回写到最终消息。工具阶段在气泡内可见。
2. 连续零正文无提示：`aiService.callAiWithTools()` 增加连续纯 tool_calls 警示回调；达到工具循环上限时 UI 翻译为“AI 连续尝试工具调用但未能产出回答，已中止。请简化问题或更换模型。”
3. 取消终态折叠：大纲工作台取消路径传 `canceled`，不再折叠成 `failed`。
4. 失败缺 finishReason：`realSkillExecutor` 失败路径补 `finishReason`。
5. 空载荷物理请求：`runTrace.appendPhysicalCall()` 增加空载荷守卫，避免 2 字节空壳落盘。
6. 失败前置物理请求缺失：`finishApiCall()` 对 failed 且无物理请求的记录追加 `physicalMissing` 与原因标记。
7. 导出对账：导出包 payload 数组与 `payloads/` 目录文件数对账，避免数组为 1、目录 19 的假 ok。
8. 补充缺口：空响应错误补挂 `finishReason`；`askPlainAi()` 用局部结果变量把 finishReason 传入 catch；`workspaceSkillEngine` 的 `lastRunMeta` 在文本路径进入空响应判断前写入，避免失败时元信息丢失导致 UI 拿不到真实结束原因。

## 验证证据

- 单元/服务层：`npm run test:services` 198 tests passed。
- 类型与构建：`npm run type-check` exit 0；`npm run build:vue` exit 0。
- Vitest：33 tests passed（含新增 `src/stores/runTrace.integrity.spec.ts` 3 用例）。
- 真实 Electron E2E：`node scripts/verify-outline-silent-wait-fix-e2e.mjs` 4 场景 PASS。
  - 工具过程气泡可见。
  - 纯工具循环出现警示并最终输出可读上限错误。
  - 取消保留 `canceled` 终态。
  - 导出 `payloadCount` 与 `payloads/` 文件数一致。
- 相邻入口烟测：`node scripts/verify-release-gate-g4-three-entry-e2e.mjs` PASS，覆盖主页编辑器流式 / 取消 / 空正文重试、大纲工作台正常流式 / 取消、生成流水线 folder chain 生成 / 取消，导出对账全部通过。
- 清理复核：`_data/outline-silent-wait-fix-profile` 与 `_data/outline-silent-wait-fix-exports` 均不存在。

## 交付

- 修复版本升级到 3.41.0，并执行完整封装交付。
- 封装产物：`dist/神意助手-Setup-3.41.0.exe`（130,364,027 字节），2026-09-14 00:50 生成。
