# DEV_LOG 2026-09-27 - 长文档重排架构 V2 Phase 3 + Phase 4

## 范围

- 方案：`_audit/PROPOSAL_2026-09-27_LONG_DOCUMENT_RESTRUCTURE_ARCHITECTURE_V2.md`
- Phase 3：长文档写协议单源、操作 allowlist、主页与大纲工作台双入口接线。
- Phase 4：删除授权合同升级、命令指纹重放、授权范围化 content loss。

## Phase 3 交付

- 新增 `src/services/longDocumentWriteProtocol.ts` 作为写协议单源。
- `src/services/editorTools.ts` 按 `executionPlan.operation` 计算 operation allowlist，工具面不再依赖入口各自复制的规则。
- `dialogueToolSurface.ts`、`editorEditProtocol.ts`、`aiService.ts`、`ChatPanel.vue`、`OutlineWorkspace.vue` 全部消费同一协议；长文档 steering 与工具面不再分叉。
- direct 快路径保持可用；`restructure / normalize / deduplicate / rewrite_segments` 必须先经 EditTask 计划。

## Phase 4 交付

- `outlineDeletionContract.ts`：
  - `request()` / `consume()` 改为携带 `commands + original + next`。
  - 新增 `commandHash`、`originalHash`、`expectedNextHash`、`expectedDeletedLength`。
  - 授权消费需五重一致：目标签名、命令 hash、原文 hash、预期结果 hash、精确删除长度；只允许消费一次。
- `outlineIntegrity.ts`：
  - `allowAuthorizedDeletion` 不再 blanket 放行任意损失。
  - 豁免条件是“删除长度与用户授权的预期长度完全一致”。
  - 在该精确条件下，`heading_count_reduced` 与 `content_loss` 可同时豁免，因为整节删除天然同时减少标题和正文；其他 critical 类型仍阻断。
- `OutlineWorkspace.vue`：
  - 授权匹配加入 `commandHash` 比对。
  - 完整性校验传入 `authorizedDeletedLength`。
  - trace 记录命令 hash、原文 hash、预期结果 hash、预期删除长度。

## 验证

- `npx vitest run src/services/outlineDeletionContract.spec.ts src/services/outlineIntegrity.spec.ts --reporter=verbose`：
  - 2 files passed，26 tests passed。
  - 覆盖：授权整节删除、越界删除阻断、二次消费阻断、真实客户 turn-6 夹具回放、非删除完整性失败阻断。
- `npm run test:services`、`npm run type-check`：结果见本文件“回归收口”更新；未记录完整输出前不得视为通过。

## 设计说明

整节删除必然同时触发 `heading_count_reduced` 与 `content_loss`。仅豁免标题数量会把真实授权删除误杀成失败，导致用户确认后仍无法执行。豁免不能按“类型”放宽，必须按“结果指纹”放宽：只有删除长度与授权时的预期长度完全相等，才证明模型没有扩大删除范围或二次改写内容。

## M17 回头看

1. 目标对账：Phase 4 的 hash 合同、范围化授权、单次消费、工作台接线均已落地。
2. 影响圈对账：`outlineDeletionContract`、`outlineIntegrity`、`OutlineWorkspace` 三处同批更新；生产调用点在本文件登记为 `rg` 复核项。
3. 新旧并存扫描：授权判断不再只依赖 target signature；旧签名匹配仍保留为兼容层，但已叠加 command hash，不再单独放行。
4. 测试契约：新增负向断言证明“精确匹配放行”不等于“放宽守卫”。
5. 登记缺口：Phase 3 的 Electron 真实 UI 复测与 Phase 5 trace 字段补齐尚未执行，必须在对应 Phase 内完成，不得提前封装。
