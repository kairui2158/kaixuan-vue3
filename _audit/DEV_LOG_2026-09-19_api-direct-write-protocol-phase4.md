# 2026-09-19 API Direct Write Protocol Maturity - Phase 4

## Scope

执行 `PROPOSAL_2026-09-19_API_DIRECT_WRITE_PROTOCOL_MATURITY_V1.md` Phase 4：意图路由成熟化。核心目标是让 analyze/generate 明确指令不再被 discuss 语境护栏吞掉，同时保持纯问句、参考请求、权限问句和写入负样本的判别。

## Changes

1. `_audit/phrase-corpus-saturated.json` 新增 5 个意图矩阵组：
   - `analyze-positive` 24 条
   - `analyze-negative-question` 12 条（期望 discuss）
   - `generate-positive` 24 条
   - `generate-negative-question` 12 条（期望 discuss）
   - `discuss-negative-write` 14 条（期望 edit）
2. 补齐漏词：`看看`、`找一找`、`挑一挑`、`列出来`、`结构性问题`、`写出`，全部走 JSON 源 -> sync -> 对账链路。
3. `chainIntentRouter.ts` 权限/语境解析优先级修正：
   - 显式写入优先于 reference/contextual 分支。
   - `给我参考` 无写入限定词时保持 reference-request，不再被裸 `替换` 误判 edit。
   - 意图关键词存在时，contextual 修饰词不再压过 analyze/generate 指令。
   - 偏好/约束句（如“硬约束是...”）与歧义问句保持 discuss。
   - 开头的 analyze 指令（看看/检查/评估等）不因句中问句标记被折叠成 discuss。
4. `scripts/evaluate-chain-intent-router.mjs` 新增 precision/recall/F1 校准报告，按 analyze/edit/generate/discuss 输出 expected/predicted/TP/FP/FN。
5. `chainIntentRouter.spec.ts` 新增：
   - 335 条 saturated 样本全量回归。
   - 事故句式优先级回归：分析问句、生成指令、参考请求、确认后写入。

## Verification

- `node scripts/sync-chain-intent-phrase-corpus.cjs` -> 22 groups / 1648 phrases / 335 samples
- `node scripts/verify-phrase-corpus-sync.cjs` -> JSON/TS 完全一致，problems: []
- `npm run evaluate:chain-intent` -> exit 0
  - classification 20/20
  - routing 20/20
  - saturated routing 335/335
  - analyze/edit/generate/discuss precision = recall = F1 = 1.0000

## Phase 4 Acceptance

- discuss 负样本（明确写入指令）全部命中 edit，无一条被确认词或参考词吞掉。
- analyze 正样本中的问句形式不再被 `是否/会不会/能不能` 语境词压成 discuss。
- generate 负样本（要不要写、能不能先给一版）保持 discuss。
- 本次未调整 `ROUTE_THRESHOLDS`，所有修复均为语义优先级与词库修正，符合“禁止手调阈值直接上线”的放行断点。
