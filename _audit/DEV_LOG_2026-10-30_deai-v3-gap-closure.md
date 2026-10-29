# DEV LOG：正文层内嵌降AI V3 剩余缺口收口（2026-10-30）

## 背景

方案对账轮登记了 V3 剩余缺口：终步关闭 + 用户 deep-fix 的 UI 双状态、conflictPolicy 真实 UI 链路、声纹端到端采样与同一投影断言。执行补齐时，Electron 场景 5 出现“账本缺失、三次验收相同旧产物”式失败。本轮没有先改产品绿灯，而是对账物理请求与请求队列，确认这是验证器 mock 队列错位。

## 根因

mock provider 同时维护两个状态：已记录请求 `requests` 与未消费响应 `queue`。旧 `reset()` 只清前者：

```js
reset: () => {
  requests.length = 0
  queue.length = 0
}
```

修复前缺少 `queue.length = 0`。场景 4 的追加响应未被完全消费，残留响应在场景 5 被错位供给 S1/S2，造成“S1 输出像 S2、S2 输出像 S3、终步账本缺失”的假产品失败。

## 交付

1. 验证器队列与场景响应收口：`reset()` 同时清空请求账本与响应队列；场景追加响应统一走 `prepareScenario({ extraResponses })`，删除场景函数内重复入队。
2. 请求诊断增强：每条物理请求记录 `responsePreview`、`responseLength`、`queueRemaining`，失败时可直接看出消费了哪条响应、队列还剩几条。
3. 断言语义对齐产品：冲突决策只由重叠步骤记录；skill-wins 与 app-wins 均断言 `conflicts.length === 1`，app-wins 额外断言 warn 事件 1 条。
4. 误判补丁回退：上一轮曾把场景 5 失败误判为 `dedupeChainIntermediateOutput` 剥离交接块，给 `PipelinePanel.vue` 两处调用加了 `!isGeneratorStep` 条件；根因确认后已回退，恢复所有非终步中间产物去重语义。
5. 六场景 Electron 报告：default、skill-disabled、invalid-fallback、final-step-off-deep-fix、conflict-skill-wins、conflict-app-wins 全部 success，报告含 UI 双状态、声纹采样、冲突与警告计数。

## 验证

- `node scripts/verify-deai-body-electron.mjs` → `===== DEAI BODY CONTRACT ELECTRON PASSED =====`。
- `npx vitest run src/services/chainExecution.spec.ts` → 24/24 passed。
- `npm run type-check` → exit 0。
- `npm run build:vue` → 成功。
- 报告：`_audit/verification-deai-body-electron/report.json` 六场景 success，`heartbeatFrames: 24`。

## 教训

症状出现在验收层，根因可能在验证器的响应供给层。请求账本与响应队列是两个独立状态，场景 reset 少清一个，就会让上一场景的响应伪装成下一场景的产品输出。今后遇到“输出像上一步/账本缺失/三次验收相同”的失败，必须先看物理请求消费的 `responsePreview` 与 `queueRemaining`，确认响应归属后再决定是否修改产品代码。根因推翻误判后，误判补丁必须回退并完整复跑，不能留在生产链路里。

## 边界

- 本轮 Electron 验证使用 mock provider，不声明 live 供应商结论。
- Phase 10 校准仍 NOT_READY，阈值与评分保持 `provisional`。
- 不提交 git，不重新封装，版本保持 `3.110.7`。
- 临时探针 `_audit/tmp-deai-voice-debug.mjs`、`_audit/tmp-deai-voice-debug.json` 已删除。
