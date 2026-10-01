# 2026-09-19 API Direct Write Protocol Maturity - Phase 5

## Scope

执行 `PROPOSAL_2026-09-19_API_DIRECT_WRITE_PROTOCOL_MATURITY_V1.md` Phase 5：补齐兼容供应商直写缺陷，跑完整验证矩阵，执行 M17 回头看，并把协议成熟化结论写入开发日志、经验文件与主索引。

## Root Cause

兼容模式此前能通过 E2E，不是因为协议解析正确，而是因为当时工具执行前没有严格 schema 校验。Phase 1 引入 `validateAgentToolInput()` 后，真实缺陷被暴露：

1. `parseEditorWriteProtocol()` 复用旧 `normalizeCommand()`，给每条命令强加内部存储字段 `type: "editor_edit"` 和 `version: 1`。`editor.write` 的 `inputSchema` 声明 `additionalProperties: false`，这两个内部字段被严格校验拒绝。
2. 移除 `type/version` 后，第二次失败暴露出显式 `undefined` 字段问题：`skillValidation.ts` 的 `validateValue()` 用 `key in object` 判断字段存在，`target: undefined` 仍会触发类型校验并报 `target 类型应为 string`。

结论：这是“协议解析层输出形状”与“工具 inputSchema”不一致的接线缺陷，不是工具执行器或兼容供应商协议本身的问题。

## Changes

1. `src/services/editorEditProtocol.ts`
   - `EditorWriteProtocolRequest.commands` 类型改为纯工具入参形状，不再包含 `type` / `version`。
   - `parseEditorWriteProtocol()` 构造命令时只输出实际有值的字段，`undefined` 字段完全不写入对象，避免被 `key in object` 判定为存在。
2. `src/services/aiService.ts`
   - 兼容模式两个分支的返回文本统一走 `compatibilityEditorWriteText()`：成功显示“已通过兼容模式直写编辑器：N 条修改已执行”，失败显示可读错误，不再把协议 JSON 当聊天正文输出。
   - 兼容写入的 `onToolCall` 事件补 `toolCallId` 与 `protocolVersion`，与 native tool loop 的观测契约对齐。
3. `src/services/aiService.spec.ts` 与 `scripts/verify-api-direct-write-v2-e2e.mjs`
   - E2E 等待用户可读摘要而不是协议 banner。
   - 断言兼容降级每轮恰好两次 HTTP 请求：第一次带原生 tools，供应商拒绝后第二次降级为 JSON 协议。
   - 断言兼容通知终态可见、协议 JSON 不进入正文、两次兼容写入各记录一条且状态为 success。

## Verification

全部为本轮新鲜输出：

- `npm run type-check` → exit 0
- `npx vitest run src/services/aiService.spec.ts` → 94 passed
- `npm run build:vue` → exit 0；仅存在既有非阻断 warning（jieba fs externalized、chunk 大于 500kB、Vite native config loader）
- `node scripts/verify-api-direct-write-v2-e2e.mjs` → `API DIRECT WRITE V2 E2E PASSED`
  - 15 个场景全部通过
  - 覆盖两次兼容降级、run trace 导出、DiagLogger 双进程覆盖
- `npx vitest run` → 71 files / 680 tests passed
- `npm run verify:production-wiring` → 273 modules / 904 dependencies, no violations
- `npm run evaluate:chain-intent` → exit 0
  - classification 20/20
  - routing 20/20
  - saturated routing 335/335
  - analyze / edit / generate / discuss 的 precision = recall = F1 = 1.0000

## M17 Lookback

1. 目标对账：Phase 5 的目标是负向矩阵、跨轮矩阵、权限一致性、门禁固化与协议版本留痕。兼容直写缺陷修复后，15 场景 E2E、全量测试、生产接线门禁与意图评估全部通过。
2. 生产入口盘点：`rg "parseEditorWriteProtocol|compatibilityEditorWriteText"` 显示生产消费点仅 `aiService.ts` 一处，测试消费点为 `editorEditBatch.spec.ts`，无第三入口漏接。
3. 工具审计接线：主页 `ChatPanel.vue:941` 与大纲工作台 `OutlineWorkspace.vue` 的 `lastOutlineToolAudit` 均已通过 `workspaceSkillEngine` adapter 接入 `buildContextBundle`，双侧可携带跨轮工具审计。
4. 协议版本留痕：`EDITOR_EDIT_PROTOCOL_VERSION = 1` 已进入 `crossTurnToolAudit.ts`、`aiService.ts`、run trace、E2E 断言与 `aiService.spec.ts`。
5. 观测覆盖：run trace 记录兼容写入 tool call、`compatibilityMode`、`downgradeReason` 与 `protocolVersion`；DiagLogger 覆盖 `ai-service/tool-call`、`ai-service/editor-presentation`、`ai-service/tool-capability`，E2E 断言双进程覆盖。
6. 证据新鲜度：本日志 Verification 全部来自本轮输出，未引用旧会话结果。

## Acceptance

- 非法枚举、非法组合、未知字段、类型错误四类负向路径均被结构化拒绝，编辑器内容保持不变。
- 兼容供应商 JSON 协议路径恢复可用，且用户可见文本为摘要而非协议 JSON。
- 跨轮请求携带上一轮工具审计摘要，`protocolVersion=1` 可在 trace、请求与测试中断言。
- 生产接线门禁无违规，意图路由四类 F1 均为 1.0000。

本阶段不封装版本；如需客户安装包，需另行执行版本升级与 NSIS 封装流程。
