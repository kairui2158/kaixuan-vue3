# PROPOSAL: SKILL blocking 硬闸被应用验收架空 — 根修方案 V2（精简审查版）

日期：2026-11-05
触发实测：`run-trace-正文层-20261105-022639-deep`
状态：待审核（本文档只登记方案，不执行改动）

## 0. 为什么之前多轮修复未发现（盲区归因，先于方案登记）

1. **测试边界只测了自己定义的闸**。10-17 degraded gate 的用例全部落在"degraded + 平台契约失败"（1654 字 < 2800）或"degraded + 平台契约通过且无 SKILL blocking"（2200/3393 字），从未构造 `degraded + SKILL blocking fail + 应用契约通过`（3150 在 2800-3325 之间）的用例。裁判权交接线本身没有测试覆盖。
2. **"双层验收责任表"停在概念层**。2026-10-31 讨论确立了"叙事归 SKILL、合同归应用、每个维度一个裁判"，但没有把"应用如何机器可读地消费 SKILL blocking verdict"翻译成代码通路，概念正确，接线缺失。
3. **经验文件旧条目的隐含假设有漏洞**。G2.9 旧文写"`degraded + 契约通过` 才允许继续"，隐含假设 SKILL 裁决已体现在契约失败里；当 SKILL fail 不恰好等于应用契约 fail 时，该条把 SKILL 裁决漏掉了。本轮已把教训回写为真值组合矩阵要求（见 G2.9 新增条目）。
4. **修复流程没有"SKILL verdict 消费者"角色**。每次修的都是应用自己的校验器或执行器，没有专门检查"SKILL 输出的 blocking 语义最终被谁消费"。

教训已回写 `_audit/神意开发经验总结_v9.md` G2.9（测试边界必须覆盖双层裁决全部真值组合）。

## 1. 问题定性

SKILL 层指控核心属实：S2/S3 postProcess 三次全部返回 `valid:false` + blocking issues，
但应用执行器把重试耗尽后的候选归类为 `degraded`（非 `failed`），
验收层 `acceptStepArtifact` 只检查平台契约（2800 字下限 + 账本完整性），
完全忽略 `degradedErrors` 中的 SKILL blocking 裁决，最终以 `contract_valid` 接受 3150 字候选
并写入 3088 字终稿，run status 标记为 `success`。

这不是模型不稳，也不是 SKILL 误报。是应用侧把"SKILL blocking 硬闸失败"错误归类为"可降级继续"。

## 2. 实测证据链

| 环节 | 事实 | 证据 |
|---|---|---|
| S2 三次 postProcess 全 fail | 3224/3150/3169 字，均低于 95% 底线 3325；叠加场景级指标超标 | trace seq 395 `folder-skill-degraded-with-error`；`kaixuan-s2/script.js:816-918` |
| 执行器归类 | blocking 触发了 3 次重试，但耗尽后返回 `status:'degraded'` 而非 `'failed'` | `realSkillExecutor.ts:1602` |
| 应用验收裁决 | `decision: accept, reason: contract_valid`，因为 3150 > 2800 | trace seq 398 `body-step-acceptance`；`stepArtifactAcceptance.ts:396-503` |
| S3 消费坏稿 | S3 三次也全 fail，最终 3088 字被接受 | trace seq 538/545 |
| run 终态 | `success`，掩盖双层 degraded | trace run status |

### 本轮未展开但已确认的次要问题（不纳入本方案改动面）

| 事实 | 定性 | 处理归属 |
|---|---|---|
| S2 第 2 次 attempt 物理调用只返回 reasoning 无正文（trace seq 232 "流式响应长时间未产生正文，已按 reasoning-only 断流处理"） | 供应商/模型稳定性，非本次 blocking 语义缺陷 | 观测，不改供应商协议 |
| S3 第 2 次 attempt 丢失全部 8 个交接字段 | SKILL 输出格式化失败，SKILL 层问题 | SKILL 对话框 |
| 身体词密度 6 次 attempt 中 4 次超标 | SKILL 阈值适配问题，非应用裁判缺位 | SKILL 对话框校准阈值 |

这些次要问题不是本次"应用架空 SKILL 门禁"的根因，本方案不处理，防止改动面蔓延。

## 3. 全层暴露面分析

### 已正确闭环的路径（无需改动）

- **复合链 `skillOrchestrator.ts:318`**：`degraded + contract:null` 已经走 `acceptStepArtifact` → reject → BLOCKED。说明"degraded 不等于放行"的语义骨架已存在。
- **卷纲/章节/设定层**：这些层的编排器（`volumeBatchOrchestrator`、`chapterBatchOrchestrator`）用 `extractJsonArray` + 自有校验器，不走 folder postProcess blocking 通路，本次缺口不直接命中。但若未来这些层接入 folder SKILL 的 postProcess blocking 闸，会复现同类问题。
- **10-17 degraded gate**（`_audit/TASK_LEDGERS/2026-10-17_body-contract-degraded-gate.md`）已闭环"degraded + 契约失败 → 阻断"，本次暴露的是它未覆盖的分支："degraded + SKILL blocking fail + 契约通过 → 仍放行"。

### 缺口核心（本次必须修）

| 层 | 缺口 | 严重度 |
|---|---|---|
| 执行器归类 | `realSkillExecutor.ts:1602` 重试耗尽后无条件返回 `degraded`，即使最终候选仍有 blocking postProcess issue | P0 |
| 验收层 | `acceptStepArtifact` 不消费 `degradedErrors` 中的 blocking 裁决（无二级防线） | P0 |
| 观测层 | run 终态折叠为 `success`，用户看不到真实质量终态 | P1 |

## 4. 修复方案（V2 精简版：按 G0.13 最小必要性五问裁剪）

V1 的 Phase A/B/C/D/E 已按五问逐条过筛："删除它会不会损失真实用户价值？"保留的是直接阻断坏稿落库的最小通路；删除的是字符串匹配防线、跨层预建防线和五层架子话。

### Phase A：执行器归类修正（P0，单点根修）

**文件**：`src/services/realSkillExecutor.ts`（约 1602 行）

**改动**：重试耗尽后的最终状态判定——
```ts
// 当前（错误）：
return { status: 'degraded', ... }

// 改为：
const finalCandidateHasBlockingIssue = retainedCandidate && !retainedCandidate.validation.valid
return { status: finalCandidateHasBlockingIssue ? 'failed' : 'degraded', ... }
```

**语义**：如果 SKILL postProcess 判 blocking 且重试耗尽仍未通过 → 整步 `failed`。
执行器不再替 SKILL 降级裁决；SKILL 说不行就是不行。

**回归保护**：`realSkillExecutor.spec.ts` 现有 "degraded 输出保留第 1 次候选" 用例需要审读——
如果该用例测的是 schema 降级（非 blocking postProcess），行为不变；
如果测的是 blocking postProcess 耗尽，预期行为改为 failed，需同步更新断言并登记语义变更。

### Phase B：验收层二级防线（P0，防御纵深）

**文件**：`src/services/stepArtifactAcceptance.ts`（`acceptStepArtifact`）

**改动**：让执行器在返回对象上新增 `blockingGateFailed: boolean` 结构化字段，验收层直接读该字段（V1 的中文字符串匹配已裁剪——SKILL 改措辞会导致匹配失效，脆弱且违反单一事实源）：
```ts
// realSkillExecutor 返回体新增：
blockingGateFailed: boolean  // true = postProcess blocking 耗尽

// stepArtifactAcceptance 输入新增：
blockingGateFailed?: boolean
// 判断改为：input.callerStatus === 'degraded' && input.blockingGateFailed === true → reject
```

### Phase C：跨层只读审计 + 定向修（P1，不预建防线）

**范围**：只读审计以下入口是否也把 blocking postProcess 耗尽归类为可继续：

1. `PipelinePanel.vue` 四层产物链（设定/卷纲/章节/正文）
2. `workspaceArtifactAcceptance.ts`（大纲工作台）
3. `skillOrchestrator.ts` 复合链（已闭环，只加回归断言确认不回退）

**动作**：
- 复合链 `skillOrchestrator.ts:318` 已正确阻断（degraded + no_contract → reject → BLOCKED），本轮只加一条回归测试确认不回退，不改生产代码。
- 工作台 `workspaceArtifactAcceptance.ts` 只读审计：如果存在 folder postProcess blocking → degraded → 放行通路，则复用 Phase B 的 `blockingGateFailed` 字段修复；如果不存在该通路，登记审计结论后跳过，不预建防线。
- 四层产物链审计同理：卷纲/章节/设定层不消费 folder postProcess blocking 通路，只登记结论。

### Phase D：观测修复（P1）

1. run 终态归并逻辑（`PipelinePanel.vue` / `runTrace.ts`）：当存在 `blocking gate failed` 的步骤时，run 终态不得为 `success`，最低 `failed`。
2. 用户可见文案：错误列表明确写出"SKILL 施工门禁未通过，候选未达 95% 底线 3325 字"，不再折叠成 `degraded` 一行日志。
3. trace 保留 `degradedSteps`（观测用），但 `decision` 字段必须如实反映 reject。

### Phase E：全层防漏回归（P0，G1.3）

| 层 | 验证方式 |
|---|---|
| 正文执行器 | 单测：postProcess blocking × 3 次耗尽 → `status:'failed'`，非 `degraded` |
| 正文验收 | 单测：`degraded + blockingGateFailed + 契约通过` → reject |
| 正文 E2E | 复用 `scripts/verify-body-contract-degraded-electron.mjs`，新增场景 D：blocking 耗尽 → run failed，S3 零调用 |
| 复合链 | 单测：确认 `skillOrchestrator` 现有阻断不回退 |
| 工作台 | 单测：`workspaceArtifactAcceptance` 同样拦截 blockingGateFailed |
| 跨层审计 | 新增 `_audit/CROSS_LAYER_BLOCKING_GATE_AUDIT_2026-11-05.md`，登记各层是否有 blocking 通路及防线状态 |

## 5. 经验文件对账

| 门禁 | 本次覆盖 |
|---|---|
| G0.10 新旧并存清零 | 旧语义"degraded 即可继续"在正文执行路径被 Phase A 修正；Phase E 用负向断言清零 |
| G1.3 全局层与同款逻辑统一 | Phase C 显式排查工作台、复合链、四层产物链 |
| G1.4 验证真实性与分层 | Phase E 五层验证，不做 mock 冒充 |
| 神意经验 §547 caller 状态与产物契约分权 | 本次补上该条未覆盖的分支："degraded + SKILL blocking fail + 契约通过" 必须阻断 |
| G0.13 最小必要性 | V2 按 8.3 节五问逐 Phase 裁剪：删字符串匹配、删预建防线、删架子话 |
| G2.9 测试边界真值组合矩阵 | 新增条目已回写经验文件（:549）；E2E 场景 D 候选字数 2900 落入夹缝区间 |

## 6. 不做的事（G0.13 裁剪结果）

1. 不改 SKILL 文件。SKILL 层的 95% 底线和场景指标阈值由 SKILL 对话框迭代，应用只尊重其 blocking 裁决。
2. 不引入新的状态枚举（如 `blocked_by_skill`）。复用现有 `failed` 终态 + `degradedSteps` 观测字段。
3. 不做中文字符串匹配防线（V1 的 `err.includes('施工合同失败')` 已裁剪：SKILL 改措辞即失效，脆弱）。
4. 不做跨层预建防线（复合链已闭环、工作台若无通路则跳过）。
5. 不改供应商协议或 retry 策略。本次问题在产物归类层，不在 API 层。

## 7. 预期交付后行为变化

| 场景 | 修复前 | 修复后 |
|---|---|---|
| S2 blocking 耗尽 + 字数达 2800 | degraded → accept → 进 S3 → 可能 success | 执行器 failed → S3 零调用 → run failed |
| S2 blocking 耗尽 + 字数 < 2800 | degraded → contract_failed reject（已正确） | 不变 |
| S2 postProcess 无 blocking issue | success → 正常流转 | 不变 |
| S3 blocking 耗尽 | degraded → 终稿可能被接受 | 执行器 failed → run failed，不出文 |

## 8. V2 深层审查：V1 遗留盲区自检

### 8.1 已发现并修正的 V1 缺陷

| 缺陷 | V1 状态 | V2 修正 |
|---|---|---|
| 中文字符串匹配防线 | 作为双保险保留 | 裁剪：脆弱（SKILL 改措辞即失效）、违反单一事实源 |
| 跨层预建防线 | 工作台/四层链全部加防线 | 裁剪：只读审计，有通路才修，无通路登记后跳过 |
| 盲区归因缺失 | 未记录为什么多轮修复才发现 | 新增第 0 节，4 条盲区成因登记 |
| 经验文件未更新 | 未写教训 | G2.9 新增真值组合矩阵要求 + 来源登记 |

### 8.2 V2 新发现的盲区（V1 没覆盖）

| 盲区 | 风险 | V2 处理 |
|---|---|---|
| `retainedCandidate.validation.valid` 在 V1 Phase A 里的语义混淆 | 执行器已有的 best-candidate 逻辑可能保留一个 `validation.valid === false` 的候选，但 V1 只检查这个字段，没有区分"schema 降级"和"SKILL blocking 降级"两种 `valid:false` | Phase A 精确条件：`retainedCandidate.validation.valid === false && retainedCandidate.audit?.errors?.some(isBlockingError)` 其中 `isBlockingError` 只检查 postProcess blocking issue code，不检查 schema 错误 |
| `blockingGateFailed` 字段的传播链路 | 执行器新增字段后，`PipelinePanel.vue` 调用 `runStepSkills` → `makeStepArtifactEnvelope` → `resolveStepArtifactFlow` 的中间层是否透传该字段？如果中间层吞掉，验收层永远读不到 | 实施时沿调用链逐层透传，验收单测覆盖完整链路 |
| `finalStepRetry` polish 路径是否也走 blocking 耗尽 | S3 打磨层走 `options.finalStepRetry?.role === 'polish'`，它的 blocking 耗尽是否也产生 `blockingGateFailed`？ | 实施时确认 S3 postProcess blocking issue code 与 S2 一致，`blockingGateFailed` 覆盖两条路径 |
| E2E 新场景 D 的最小构造成本 | V1 提了"新增场景 D"但没写构造方式 | 复用现有 `_data/body-contract-degraded-skills` 夹具：postProcess 直接返回 blocking issue 且候选字数设为 2900（> 2800 但 < 3325），确保落入夹缝区间 |
| 经验文件旧条目与新条目的矛盾 | G2.9 旧条目"`degraded + 契约通过` 才允许继续"与新条目"blocking fail 必须阻断"存在字面冲突 | G2.9 已追加限定："测试边界必须覆盖双层裁决全部真值组合"，旧条目语义被新条目收窄为"无 blocking fail 时才允许继续" |

### 8.3 最小必要性五问（G0.13）逐 Phase 过筛

| Phase | 五问结论 | 保留/裁剪 |
|---|---|---|
| A 执行器归类 | 用户目标必须依赖（不修则坏稿落库）；现有机制不够（degraded 语义已混淆）；不增加延迟；删除则损失真实价值；更小实现不存在 | 保留 |
| B 验收层结构化字段 | 防御纵深，执行器单点失效时兜底；改动量小；字符串匹配已裁剪 | 保留（精简版） |
| C 跨层审计 | 只读审计必要（防未来同类缺口）；预建防线不必要 | 精简为只读 + 定向修 |
| D 观测修复 | 用户看不到真相等于没修；改动量一行条件 | 保留 |
| E 五层测试 | 实际只需 3 条断言 + 1 条 E2E 场景 D；"五层"是架子话 | 精简为 3+1 |

## 9. 审核决策点

1. Phase A 是否批准"重试耗尽 + blocking → failed"语义变更？
2. Phase B 是否批准结构化字段 `blockingGateFailed`（V2 推荐，字符串匹配已裁剪）？
3. Phase C 是否批准只读审计 + 定向修（V2 裁剪后，不预建防线）？
4. Phase D run 终态是否本轮同步修正？
5. 8.2 表中的 5 个 V2 新盲区是否接受作为实施前置检查项？
