# API 直写 100% 闭环 Phase 4 开发日志（写入收口模式）

日期：2026-09-24  
版本：3.60.0（Phase 8 统一升版）  
关联方案：`_audit/PROPOSAL_2026-09-23_API_DIRECT_WRITE_100_CLOSURE_FINAL.md`

## 背景

Phase 4 的目标是补齐供应商覆盖与真实 live 证据。第一轮 live 六步实测暴露出一个高危产品缺陷，位于工具循环的读取收敛路径：step6（把第 8、9、10 三节倒序重排）出现 `writes=0`，但 turn 被标记为 success。

run trace 证实模型行为正常：它连续调用 `outline.get_structure` 与 3 次 `outline.read_range`，读完后准备写入。真正的问题在 `src/services/aiService.ts` 的读取收敛逻辑：

1. 模型连续 2 轮只读取未写入时，第一轮发送 steering，要求下一轮必须提交写入，这是正确方向。
2. 第二轮仍只读取时，旧实现直接调用 `requestToolConvergence()`，把 `tools: undefined` 发给模型。
3. 与此同时 convergence 的 system prompt 又要求模型“立即提交写入”。这在物理上不可能：写入工具已经被移除。
4. 模型只能输出一句“正在整理并提交完整全文”，应用把这个回答当作成功正文，形成假闭环。

这不是模型能力问题，也不是 SKILL 问题，而是应用把“读取收敛”错误地实现成“无工具收口”。该路径的收敛目标应该是强制写入，不是禁止工具。

## 修复内容

全部修改集中在 `src/services/aiService.ts` 的 `callAiWithTools()`：

1. 新增 `effectiveTools` 与 `writeOnlyMode` 状态。
2. 读取收敛第二轮不再走无工具 convergence，而是把 `effectiveTools` 收窄为写策略工具（通常仅 `editor.write`），进入写入收口模式。
3. 主循环每轮请求真实携带 `effectiveTools`，写入收口轮只暴露 `editor.write`。
4. steering 文案按模式区分：普通 steering 仍提示“下一轮必须写入”；write-only 模式明确告知“读取工具已关闭，请基于已读取内容立即提交写入”。
5. write-only 模式下若模型仍调用读取工具，应用返回结构化 `write_only_mode` 错误，不执行读取，提示模型立即写入或明确输出“本轮未写入”。
6. `actualToolSurface` 审计改为记录 `effectiveTools`，trace 能看到写入收口轮的真实工具面。
7. `requestToolConvergence()` 保留用于两个正确场景：伪工具调用修正、工具循环上限后的自然语言总结。只有“读取收敛第二轮”改为 write-only 收口。

## 回头看发现的次级缺陷与修复

第一轮 M17 回头看发现 `steerAfterToolResults` 置位后从未复位，导致 steering 之后的每一轮都会重复追加系统提示。旧实现里这只是重复提醒；接入 write-only 后，它会反复注入“读取工具已关闭”，可能干扰模型正常收尾。

修复为：

- steering 提示追加后立即复位。
- 若模型在 write-only 模式下仍违规读取，重新置位 steering，让下一轮再次收到定向收口提示。

这保证提示既不会丢失，也不会无限重复。

## 验证证据

### 单元与类型验证

- `npm run test:services -- src/services/providerTools.spec.ts src/services/aiService.spec.ts`：125/125 通过。
- `npm run type-check`：通过。
- `npm run build:vue`：通过；chunk 大小与 Vite config warning 为既有提示，非本轮引入。

### Live 六步实测

使用同一份 7602 字测试稿，经真实 Electron 与外部供应商执行：

- step1 modify：PASS，写入 1 次。
- step2 append：PASS，写入 1 次。
- step3 delete：PASS，写入 1 次。
- step4 move：PASS。
- step5 tidy：PASS。
- step6 reorder：PASS，最终重跑中 4 次物理请求、3 次结构读取、1 次写入完成倒序重排。

两轮 live 结果均通过；第二次为 steering 复位修复与 renderer 重建后的有效证据。结果与 trace 落盘在 `_audit/verification-api-direct-write-live-v3/`。

### 供应商矩阵

报告：`_audit/verification-api-direct-write-provider-matrix.json`

- 协议仿真：125/125 通过。
- openai-compatible live：pass。
- deepseek live：pass。
- anthropic / gemini / azure-openai：untested，原因均为 `provider-specific live probe not implemented in this phase`。

按 M38 要求，无密钥或未实现形态只登记 `untested`，不伪装为通过。

## 供应商矩阵脚手架与协议修复

同轮完成：

1. 重写 `scripts/verify-api-direct-write-provider-matrix.mjs`，支持协议仿真层与 live 层分层报告。
2. 修复 Gemini 流式工具调用的 URL 构建顺序，`:streamGenerateContent` 不再被 query 覆盖。
3. 主进程错误分类边界修正：408/401 终态，不再误入通用 HTTP 重试分支。
4. 工具循环终局的 usage 从 convergence 结果透传，避免最后一次请求 usage 缺失。
5. `providerTools.ts` 将 Gemini `streamingToolCalls` 从 `unverified` 改为 `implemented`。

## 遗留项

1. Anthropic、Gemini、Azure 的真实 live 需要对应供应商密钥与 provider-specific live probe，本阶段登记为后续项。
2. 版本号与封装按总方案在 Phase 8 统一执行。
