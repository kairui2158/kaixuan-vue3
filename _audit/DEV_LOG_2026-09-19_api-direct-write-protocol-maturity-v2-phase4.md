# DEV LOG: API 直写协议成熟化 V2 Phase 4

日期：2026-09-19

## 本阶段范围

- 建立工具循环策略单源，按场景区分 direct、direct-tool-intensive、folder-chain、compatibility-json。
- 为真实供应商不返回 usage 的请求增加 `usageUnavailable` 观测字段，避免 trace 伪装“usage 完整”。
- 用长文档压测验证工具轮、孤儿调用、审计摘要与场景上限。

## 实现细节

- 新增 `src/services/toolLoopPolicy.ts`
  - direct：6 轮；direct-tool-intensive：12 轮；folder-chain：4 轮；compatibility-json：1 轮。
  - `normalizeToolIterations()` 只允许调用方请求更低上限，不能突破场景上限。
- 新增 `src/services/toolLoopPolicy.spec.ts`：覆盖策略矩阵与 cap 行为。
- `src/services/aiService.ts`
  - `CallAiParams.toolPolicy` 增加 `scenario`。
  - 循环上限从 `normalizeToolIterations()` 解析；兼容模式自动归为 `compatibility-json`。
  - `PhysicalCallEvent`、`CallAiResult` 增加 `usageUnavailable`；工具上限终态与无 usage 请求均标记。
- 入口接线
  - `ChatPanel.vue`、`OutlineWorkspace.vue`：direct 对话声明 `direct-tool-intensive`。
  - `workspaceSkillEngine.ts`：授权工具面强制 `folder-chain`。
  - `realSkillTypes.ts`：toolPolicy 类型补 `scenario`。
- `src/stores/runTrace.ts` 与两个生产入口的 physical 记录函数透传 `usageUnavailable`。
- `.dependency-cruiser.cjs` 新增 `tool-loop-policy-single-source`：生产组件/服务必须消费策略单源，禁止入口私设上限。

## 验证记录

- `node scripts/verify-api-direct-write-long-document-loop.mjs`
  - 合成 213,785 字文档、12 个工具轮、24 个工具调用。
  - 断言通过：上限单源、孤儿调用可检测、审计摘要不超过 20 条、三类场景上限正确。
- `npm run verify:production-wiring`：275 modules，0 违规。
- `npm run test:services`：72 文件 / 692 测试全部通过。
- `npm run type-check`：通过。

## 遗留边界

- 真实供应商的 usage 返回形态仍按各供应商实测为准；本轮 live 只有 openai-compatible 完整验证。
- Gemini 流式工具调用保持 `unverified`，未在本阶段实现解析器。
