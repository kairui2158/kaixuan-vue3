# PROPOSAL: 2026-10-08 API Direct Write Residual Gap Closure

## One Line Conclusion

本轮推演没有发现新的 P0 权限缺陷；发现 1 个真实执行缺陷、2 个高风险边界、2 个交付级残留、1 个产品语义统一项。用户已决策：手动插入/修订统一到直写语义、提供 live API key、完成后收尾封装。本方案以最小影响圈修复真实缺陷，统一手动与 API 写入语义，补齐 live 验证、观测和文档收口，全部门禁通过后封装。

## User Decisions Locked

1. **Option B**: 主页用户手动插入/修订统一到新直写语义，直接写入编辑器，不再弹 diff 预览。
2. **Live key**: Phase 5 使用用户提供的可用 API key 做真实供应商验证。
3. **Packaging**: Phase 5 验证与 Phase 6 回头看全部通过后，执行收尾封装。

## Current State Evidence

1. 权限单源已成立: `intent + writeAuthorization + active task` 在 `src/services/dialogueToolSurface.ts:321` 单源裁决，SKILL 无法覆盖。
2. SKILL 协议防线已成立: `src/services/skillPackageProtocol.json:4` 禁止 SKILL 包声明 `tools/writeAuthorization/executionPlan`。
3. 内置 Agent 防线已成立: `src/services/agentOrchestrator.ts:602` 在无 `executionPlan` 时降级只读。
4. 旧预览协议三层防线已成立:
   - `src/services/skillGuidanceSanitizer.ts:33` 净化 SKILL guidance。
   - `src/services/conversationContextService.ts:111` 中和历史旧标记。
   - `src/services/aiService.ts:463` 识别旧协议输出，`src/services/agentOrchestrator.ts:244` 消费终态后不再续发请求。
5. `local-transform` 已把 step5 类请求从 23 次物理请求、约 954 秒降到 0 次模型请求、毫秒级本地完成。
6. 上一轮测试基线: 76/76 通过，覆盖 `dialogueToolSurface`、`agentOrchestrator`、`documentTransformService`、`skillGuidanceSanitizer`、`toolContextCompactor`。

## Issues Found

### P1 - 真实执行缺陷: 本地重排校验逻辑过宽

**位置**: [documentTransformService.ts](../src/services/documentTransformService.ts:343)

**现状代码语义**:

```ts
allowsDeletion && (
  multisetEqual(canonicalSource, canonicalTarget)
  || canonicalTarget.length <= canonicalSource.length
)
```

**问题**: `|| canonicalTarget.length <= canonicalSource.length` 使任何条数减少的结果都能通过校验，无法区分“删除重复项”和“误删唯一正文”。当前本地重排函数本身保守，正常执行路径暂未观察到丢正文；但安全网不成立。

**修复目标**: 改为逐项多重集对账。每个正文片段允许减少的数量只能来自原本重复的片段；唯一片段必须 1 条不少。

### P1 - 高风险边界: 活动任务挂起期间可能复现“没权限”观感

**位置**:

- [dialogueToolSurface.ts](../src/services/dialogueToolSurface.ts:321)
- [dialogueToolSurface.ts](../src/services/dialogueToolSurface.ts:463)

**现状**: 活动任务 pending 时，`editor.write` 被移除，入口换成 `task.resume/task.cancel`。设计方向正确，不是权限缺陷。

**问题**: 模型若转述不好，用户仍可能听到“没有写入权限”。这是交互边界，不是授权错误。

**修复目标**: 任务挂起期间用户明示写入意图时，应用侧给出明确提示和恢复引导，或自动判断是否应进入任务恢复；不放宽写权限，不绕过三元组授权。

### P1 - 高风险边界: 工具上下文压缩的语义质量未 live 验证

**位置**: [toolContextCompactor.ts](../src/services/toolContextCompactor.ts:11)

**现状**: 保留最近 2 轮完整工具结果，更旧成功读取结果被压缩；失败、写入、小结果、协议形态保留。

**问题**: 长模型路径若依赖更早读取细节，语义质量可能下降。当前登记为 `untested`。

**修复目标**: 安排 live 语义分支验证，禁止 mock 冒充；无可用 key 时保持 `untested` 登记。

### P2 - 交付级残留: SKILL 手册未同步净化器语义

**文件**: `_audit/SKILL_HANDOFF_API_DIRECT_WRITE_TOOLS.md`

**问题**: 上一轮台账明确登记需按 L1 `skillGuidanceSanitizer` 语义复核更新，尚未完成。

**修复目标**: 同步说明 SKILL guidance 会被净化、哪些字段会被忽略、权限仍由应用单源管理。

### P2 - 交付级残留: 真实 live API 语义分支 `untested`

**问题**: 当前验证为本地 provider + 真实 Electron UI。用户此前提供过 live key，但本任务不得沿用旧结论冒充 live。

**修复目标**: 有可用 key 时补 live 语义分支；无 key 时如实登记 `untested`。

### P3 - 产品语义统一项: 主页内联改写/插入仍走 diff 预览

**位置**:

- [ChatPanel.vue](../src/components/chat/ChatPanel.vue:3415)
- [ChatPanel.vue](../src/components/chat/ChatPanel.vue:4350)

**现状**: 已确认它不是 API 直写链路，不会劫持 `editor.write`。它是用户手动“插入/修订”后的独立确认流，仍使用 `show-diff`。

**问题**: 和已删除的 API 预览语义在 UI 上容易混淆。

**修复目标**: 按用户已确认的 **Option B** 执行。用户手动插入/修订不再进入 `show-diff` 预览，统一走直写语义直接写入编辑器。该改动仍受 `intent + writeAuthorization + active task` 三元组授权约束，不新增隐藏写入口，不放宽权限。

## Goal And Non Goals

### Goals

1. 修复本地重排校验的真实缺陷，防止未来误删唯一正文通过校验。
2. 为活动任务挂起期间的用户交互补护栏，消除“没权限”误观感。
3. 统一主页手动插入/修订与 API 直写语义，删除旧 diff 预览路径。
4. 补齐 SKILL 手册和观测文档，消除交付级残留。
5. 通过真实 live API 和 Electron UI 验证工具上下文压缩、权限语义和手动直写语义。
6. 全部门禁通过后升版本并收尾封装。

### Non Goals

1. 不重构权限单源、内置 Agent、local-transform 等已验证成立的防线。
2. 不放宽写权限，不绕过 `intent + writeAuthorization + active task` 三元组授权。
3. 不把手动插入/修订改成新的独立权限体系，它必须复用同一套直写授权与工具语义。
4. 不用 mock、注入、README、历史结果冒充真实验证。
5. 不在 Phase 5 验证失败或 Phase 6 回头看未完成时提前封装。
6. 不把 live key 写入仓库、日志、trace、文档或测试快照。

## Impact Circle And Legacy Chain Matrix

| 文件/组件 | 变更类型 | 受影响功能 | 旧链路清理 |
|---|---|---|---|
| `src/services/documentTransformService.ts` | 修改校验逻辑 | 本地重排安全网 | 无旧链路需清理 |
| `src/services/dialogueToolSurface.ts` | 不修改授权，只补交互护栏 | 活动任务挂起期间用户提示 | 不引入新旧并存 |
| `src/components/chat/ChatPanel.vue` | 删除手动插入/修订 diff 预览路径，改为直写 | 主页手动插入/修订 | 清理 `show-diff` 旧入口，保留必要错误提示 |
| `_audit/SKILL_HANDOFF_API_DIRECT_WRITE_TOOLS.md` | 文档同步 | SKILL 层理解 | 清除旧语义残留 |
| 版本与打包配置 | Phase 6 统一更新 | 发布产物 | 只在全部验证通过后执行 |

## Phased Plan

### Phase 0 - Baseline Lock

**目标**: 记录当前测试、版本、trace、缺陷证据，不改生产代码。

**验收标准**:

1. 当前版本、分支、测试结果、已确认问题清单全部记录在台账。
2. 不产生任何生产代码变更。

### Phase 1 - Fix Local Reorder Validation Defect

**目标**: 修复 [documentTransformService.ts](../src/services/documentTransformService.ts:343) 的删除校验逻辑。

**改动**:

1. 将 `|| canonicalTarget.length <= canonicalSource.length` 改为逐项多重集对账。
2. 每个正文片段允许减少的数量只能来自原本重复的片段。
3. 唯一片段必须 1 条不少。

**测试**:

1. 误删唯一正文必须被拒绝。
2. 仅删除重复项必须通过。
3. 格式归一与删除组合必须正确判定。

### Phase 2 - Guardrail For Suspended Active Task

**目标**: 活动任务挂起期间，用户明示写入意图时给出明确提示和恢复引导。

**改动**:

1. 识别用户在任务挂起期间发出的写入意图。
2. 应用侧给出明确提示: 当前有挂起任务，需先恢复或取消。
3. 提供 `task.resume/task.cancel` 的引导，避免模型转述为“没有写入权限”。

**不改动**:

1. 不放宽 `editor.write` 权限。
2. 不绕过三元组授权。
3. 不在工具面之外添加隐藏写入入口。

### Phase 3 - Unify Inline Insert/Revise To Direct Write

**目标**: 按用户决策 Option B，把主页手动插入/修订从 diff 预览统一到直写语义。

**改动**:

1. 定位 `src/components/chat/ChatPanel.vue:3415` 与 `src/components/chat/ChatPanel.vue:4350` 附近的手动插入/修订 `show-diff` 路径。
2. 删除确认预览 UI 状态与旧跳转链路。
3. 手动插入/修订改为直接调用编辑器写入通道，并保持:
   - 同一 `intent + writeAuthorization + active task` 授权判断。
   - 同一编辑器写入与撤销历史。
   - 同一 trace 观测字段。
4. 活动任务挂起时，手动插入/修订同样走 Phase 2 的恢复引导，不得绕过任务状态。
5. 清理不再使用的预览组件、状态、事件和文案，避免新旧并存。

**测试**:

1. 用户手动插入在主页编辑器直接落文，不出现预览弹层。
2. 用户手动修订在主页编辑器直接替换目标内容，不出现预览弹层。
3. 授权不足或活动任务挂起时不写入，并给出正确提示。
4. Electron 真实 UI 验证插入、修订、撤销、trace 记录。
5. 全局扫描确认 `show-diff` 手动路径无残留；若 `show-diff` 还有非手动插入用途，必须逐一登记并保留理由。

### Phase 4 - SKILL Handbook And Observability Sync

**目标**: 同步 SKILL 手册和观测文档。

**改动**:

1. 更新 `_audit/SKILL_HANDOFF_API_DIRECT_WRITE_TOOLS.md`。
2. 说明 SKILL guidance 会被净化。
3. 列出哪些字段会被忽略。
4. 说明权限仍由应用单源管理。

### Phase 5 - Verification Matrix

**验证项**:

1. 单测: `dialogueToolSurface.spec.ts`, `agentOrchestrator.spec.ts`, `documentTransformService.spec.ts`, `skillGuidanceSanitizer.spec.ts`, `toolContextCompactor.spec.ts`
2. `type-check`
3. Electron 真实 UI: 加载 SKILL + AGENT，执行写入、修改、删除、全文重排
4. live 语义分支: 使用用户提供的可用 API key 执行真实供应商验证；key 只经安全本地配置或运行时输入提供，禁止入库、入日志、入 trace
5. trace 覆盖: 记录 `actualToolSurface`，确保区分“模型说没权限”和“工具面真的没接上”
6. 新旧并存扫描: 确认无旧预览协议、旧 token 限制、旧工具面逻辑、手动插入/修订 `show-diff` 旧路径残留

**Live 验证场景**:

1. 短文写入、修改、删除。
2. 长文局部修改与全文重排。
3. 工具上下文压缩后的语义保持。
4. 活动任务挂起与恢复。
5. 主页手动插入/修订直写。
6. 供应商真实错误路径与超时路径。

**禁止行为**:

1. 禁止用 mock、注入、README、历史结果冒充真实验证。
2. 禁止把 `untested` 标记为已验证。
3. 禁止跳过 Electron 真实 UI。

### Phase 6 - Lookback, Version Bump And Packaging

**目标**: 回头看全部改动，确认无新旧并存，升版本并执行收尾封装。

**验收标准**:

1. 所有改动通过 Phase 5 验证矩阵。
2. 影响圈内的旧链路全部清理或明确保留理由。
3. 台账记录全部测试证据和回看结论。
4. 无 live key、API 地址、内部路径等敏感信息泄漏到仓库或产物。
5. 版本号升级、构建、打包、真实启动验证全部通过。
6. 工作区清理为可提交状态，只保留本任务必要改动。

## Forward Reasoning

1. `documentTransformService` 的校验缺陷是安全网漏洞，即使当前本地重排函数保守，未来任何调用方传入误删唯一正文的结果都会通过校验。先修这里，收益确定。
2. 活动任务挂起期间“没权限”是用户反复遭遇的观感问题，不修会继续消耗客户信任。加护栏是低风险改动，只改用户提示，不动权限。
3. SKILL 手册不同步会导致 SKILL 层继续按旧语义写作，产生新的旧协议输出。文档收口必须做。
4. live 语义分支不验证就不能宣称成熟。必须明确登记 `untested`，不能默认通过。
5. 用户已明确选择 Option B，手动插入/修订统一直写能消除两套写入语义并存的历史根源，降低后续维护与测试成本。

## Reverse Reasoning

1. 如果不修本地重排校验，未来某次重排误删唯一正文，应用会静默接受，用户发现时已无法回滚。这是数据损失风险，不可接受。
2. 如果不修活动任务挂起观感，用户会继续遇到“模型说没权限”，即使应用侧权限单源正确，用户仍会失去信任。这是交互层缺陷，不是权限缺陷，但影响交付。
3. 如果不更新 SKILL 手册，SKILL 层会继续按旧协议发预览指令，应用层会继续产生 `legacy_preview_response`。虽然三层防线能拦截，但这是持续噪音源。
4. 如果不验证 live 语义分支，本地全绿不代表真实供应商行为。上一轮已经证明本地测试无法覆盖全部真实路径。
5. 如果只删除预览 UI、不清理状态与事件，会形成新旧并存并复现旧缺陷。必须做全链路清理和扫描。

## Risks And Mitigations

| 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|
| 修校验逻辑导致合法重排被误拒 | 中 | 功能退化 | 测试覆盖重复删除、格式归一、唯一片段保留 |
| 挂起护栏提示干扰正常任务恢复 | 低 | 用户被打断 | 仅在用户明示写入意图时提示，非全局 |
| live key 不可用 | 高 | 无法完成 live 验证 | 保持 `untested` 登记，不冒充已验证 |
| 手动直写误伤用户原文 | 中 | 数据风险 | 复用编辑器写入与撤销历史；Electron 真实 UI 验证插入、修订、撤销 |
| 删除预览后仍有隐藏 `show-diff` 引用 | 中 | 新旧并存 | 全局扫描，非手动用途逐一登记并保留理由 |
| live key 泄漏 | 中 | 安全风险 | key 只走安全本地配置或运行时输入，扫描仓库、日志、trace、产物 |
| live 供应商行为不稳定 | 中 | 验证波动 | 记录原始证据并区分应用缺陷、供应商缺陷、网络缺陷；不允许重跑通过就掩盖失败 |

## Maturity Statement

**整体成熟度**: `READY_FOR_REVIEW_WITH_DECISIONS_LOCKED`

- **已验证**: 76/76 测试通过，权限单源、旧预览三层防线、local-transform 效率提升均有代码和测试证据。
- **untested**: live API 语义分支、工具上下文压缩在真实供应商下的表现。
- **登记边界**: 本方案是按用户三项决策重生成后的审核稿，尚未执行，不能宣称已修复。

**为什么不宣称 100% 成熟**: live 语义分支和手动插入/修订直写尚未实施与验证，本地测试无法替代真实供应商行为。宣称成熟必须等 Phase 5 全部完成且有真实证据。

## User Decisions Resolved

1. **主页手动插入/修订预览**: Option B，统一到直写语义。
2. **live API 验证**: 用户提供可用 API key，Phase 5 执行真实供应商验证。
3. **版本封装**: Phase 6 完成后升版本并收尾封装。

## Evidence Links

- [documentTransformService.ts](../src/services/documentTransformService.ts:343)
- [dialogueToolSurface.ts](../src/services/dialogueToolSurface.ts:321)
- [dialogueToolSurface.ts](../src/services/dialogueToolSurface.ts:463)
- [toolContextCompactor.ts](../src/services/toolContextCompactor.ts:11)
- [ChatPanel.vue](../src/components/chat/ChatPanel.vue:3415)
- [ChatPanel.vue](../src/components/chat/ChatPanel.vue:4350)
- [skillPackageProtocol.json](../src/services/skillPackageProtocol.json:4)
- [skillGuidanceSanitizer.ts](../src/services/skillGuidanceSanitizer.ts:33)
- [conversationContextService.ts](../src/services/conversationContextService.ts:111)
- [aiService.ts](../src/services/aiService.ts:463)
- [agentOrchestrator.ts](../src/services/agentOrchestrator.ts:244)
- [agentOrchestrator.ts](../src/services/agentOrchestrator.ts:602)
