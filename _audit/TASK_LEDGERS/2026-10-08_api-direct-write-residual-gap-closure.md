# 2026-10-08 API Direct Write Residual Gap Closure

## 1. 目标与原话

- 用户目标：按已审核方案修复 API 直写残留缺口；手动插入/修订统一直写语义；live 验证、打包、清理和提交全部收口。
- 用户三项决策原话：
  - “B. 统一到新直写语义，用户手动插入/修订也直接写入，不再弹预览。”
  - “Phase 5 的 live 验证用提供可用 API key。”
  - “完成后收尾封装。”
- 2026-10-08 追加决策：live key 复用应用内已配置的默认 key，不新建输入通道。
- 关联方案：`_audit/PROPOSAL_2026-10-08_API_DIRECT_WRITE_RESIDUAL_GAP_CLOSURE.md`

## 2. 门禁读证

- G0.3 诚实闭环：本地全绿不得冒充 live；`untested` 不得改名为通过。
- G0.5 回头看：收尾前回看所有改动、证据和影响圈。
- G0.9 影响圈声明：Phase 1-6 涉及的文件见第 4 节。
- G0.10 新旧并存清零：删除手动 diff 预览路径、旧负路径证据由脚本自清理规则接管。
- G0.11 真实交互冒充禁令：live v3 使用真实供应商、真实 Electron UI、真实模型请求。
- G0.12 门禁执行台账：本台账即本轮七节记录。
- G1.4 验证真实性：live、单测、build、type-check、Electron、打包分层记录。
- G1.8 日志与观测同步：`actualToolSurface`、`manual-inline-preview-removed`、`local-transform-executed` 均入 trace。
- G1.15 系统层递进诊断：step6 命中失败按症状、链路、组合、机制四层定位。
- G1.17 执行者自盲区：对 step6 修复做作者反证，补 heading move 语义测试。
- G1.18 本地确定性路径契约：step5 保留用户原话、本地执行、版本收口与校验。

## 3. 路由判定

- 生产修复：G0.3/G0.5/G0.9/G0.10/G0.11/G0.12，G1.4/G1.8/G1.15/G1.17/G1.18。
- 测试与封装：G1.4-G1.7、G1.11-G1.13。
- 未动项：权限三元组、SKILL 协议边界、内置 Agent 只读降级、local-transform 主链路。

## 4. 影响圈与作者反证

- 影响文件：
  - `src/services/documentTransformService.ts` + `.spec.ts`
  - `src/services/dialogueToolSurface.ts` + `.spec.ts`
  - `src/components/chat/ChatPanel.vue`
  - `src/services/editorEditService.ts` + `.spec.ts`
  - `src/services/toolContextCompactor.ts` + `.spec.ts`
  - `src/services/aiService.ts` + `.spec.ts`
  - `_audit/SKILL_HANDOFF_API_DIRECT_WRITE_TOOLS.md`
  - live/Electron 验证脚本与证据
- 作者反证：
  - step6 live 首次 `move` 失败：验证不是工具面缺失，而是“目的地 heading 被当作行内片段插入其前”导致结构破坏；修复后同一请求成功。
  - step5 0 次模型请求：验证不是静默失败，trace 有用户原话、`local-transform-executed`、前后 hash 和校验结果。
  - 手动插入/修订：验证不再走 `show-diff` 预览，且活动任务挂起时被 `rejectManualWriteWhenTaskActive` 阻止，不新增隐藏写入口。

## 5. 停止条件与执行结果

1. 用户审核通过后执行；已完成。
2. 每 Phase 回头验证；Phase 1-6 完成。
3. live 必须真实；live v3 六步通过，不使用 mock。
4. 失败立即停下诊断；step6 失败后停机定位根因并修复，未带病推进。
5. key 不入库；key 扫描通过。
6. 全部验证通过后封装；build 与 3.77.0 打包验证执行中/已完成见第 6 节。

## 6. 执行证据

- Phase 1：
  - `src/services/documentTransformService.ts:315` 使用 `duplicateRemovalOnly()` 多重集对账。
  - `src/services/documentTransformService.spec.ts:131` 证明误删唯一正文会被拒绝。
- Phase 2：
  - `src/components/chat/ChatPanel.vue:4393` `rejectManualWriteWhenTaskActive`。
  - `src/services/dialogueToolSurface.ts` 活动任务工具面切换保持单源授权。
- Phase 3：
  - `src/components/chat/ChatPanel.vue:3414` 记录 `manual-inline-preview-removed`。
  - 手动插入/修订直接写入；`src/components/common/DiffModal.vue` 删除。
- Phase 4：
  - `_audit/SKILL_HANDOFF_API_DIRECT_WRITE_TOOLS.md:7-9` 记录净化器语义与单源边界。
- Phase 5 live v3（真实 key + 真实 Electron UI + deepseek-v4-pro）：
  - `_audit/verification-api-direct-write-live-v3/verification-result.json`：`passed: true`，6/6 步通过。
  - step1/2/3：修改、追加、删除均 `editor.write success`。
  - step4：move 首次失败暴露 heading 目的地语义缺陷，修复后重跑成功。
  - step5：`local-transform` 0 次模型请求，0.6ms，本地校验通过。
  - step6：倒序重排 4 次物理请求成功。
  - 工具上下文压缩 live 证据：`run-trace-outline-20261008-025057/payloads/028-request.json`、`053-request.json`、`073-request.json` 含 `_compacted` 标记；仅旧成功读取结果被压缩，最近 2 轮、失败结果与写入结果保留。
- 其他验证：
  - `npm run test:services`：132 files / 1545 tests 全部通过。
  - `npm run type-check`：通过。
  - `npm run build:vue`：通过。
  - 负路径 Electron、直写压测、provider wire matrix：通过。
  - API key 扫描：无真实 key 入库。
  - 版本：`package.json` 与 lockfile 已升 3.77.0；SKILL 手册适用版本 3.77.0。
  - 3.77.0 打包与安装器验证：见 `_audit/verification-packaging-3-77-0/packaging-evidence.json`。

## 7. 缺口清单与收尾状态

- 状态：`COMPLETED`。
- 无阻塞缺口。
- `_audit/verification-direct-write-negative-paths/` 文件删除是验证脚本自清理行为，仅当 `SHENYI_KEEP_NEGATIVE_PATH_EVIDENCE=1` 时保留；不是证据丢失。
- 工作区仅保留本任务必要改动，提交后清理为干净状态。

## Objective

基于上一轮 API 直写全链路推演结果，整理并交付一份覆盖真实执行缺陷、高风险边界、交付级残留和产品语义决策项的修复方案，供用户审核。

## User Decisions

1. 主页手动插入/修订预览: **Option B**，统一到新直写语义，用户手动插入/修订也直接写入，不再弹预览。
2. Phase 5 live 验证: 用户将提供可用 API key。
3. Phase 6 完成后: 执行收尾封装。

## Confirmed Facts

1. 上一轮诊断已确认 API 直写主线无重新发现的 P0 权限缺陷。
2. 本轮问题分为四类：1 个真实执行缺陷、2 个高风险边界、2 个交付级残留、1 个产品语义决策项。
3. `local-transform` 已把 step5 类请求从 23 次物理请求、约 954 秒降到 0 次模型请求、毫秒级本地完成。
4. 权限单源已成立：`intent + writeAuthorization + active task` 单源裁决，SKILL 无权覆盖。
5. 旧预览协议已有三层防线：SKILL guidance 净化、历史旧标记、`legacy_preview_response` 识别。

## Issues Under Review

1. **P1 - 本地重排校验逻辑过宽**
   - 位置: `src/services/documentTransformService.ts:343`
   - 问题: `allowsDeletion` 时 `|| canonicalTarget.length <= canonicalSource.length` 使任何条数减少的结果都能通过校验，无法区分“删除重复项”和“误删唯一正文”。
   - 方案处理: Phase 1 修复为逐项多重集对账，唯一片段必须 1 条不少。

2. **P1 - 活动任务挂起期间可能复现“没权限”观感**
   - 位置: `src/services/dialogueToolSurface.ts:321`, `src/services/dialogueToolSurface.ts:463`
   - 问题: 活动任务 pending 时 `editor.write` 被移除，工具面只剩 `task.resume/task.cancel`。设计方向正确，但模型若转述不好，用户仍可能听到“没有写入权限”。
   - 方案处理: Phase 2 增加应用侧交互护栏，任务挂起期间用户明示写入意图时给出明确提示和恢复引导，不放宽权限、不绕过三元组授权。

3. **P1 - 工具上下文压缩的语义质量未 live 验证**
   - 位置: `src/services/toolContextCompactor.ts:11`
   - 问题: 当前策略保留最近 2 轮完整工具结果，更旧的成功读取结果被压缩。若长模型路径依赖更早读取细节，语义质量可能下降。当前登记为 `untested`。
   - 方案处理: Phase 5 安排 live 语义分支验证，禁止 mock 冒充；无可用 key 时保持 `untested` 登记。

4. **P2 - SKILL 手册未同步净化器语义**
   - 位置: `_audit/SKILL_HANDOFF_API_DIRECT_WRITE_TOOLS.md`
   - 问题: 上一轮台账明确登记需按 L1 `skillGuidanceSanitizer` 语义复核更新，尚未完成。
   - 方案处理: Phase 4 更新手册，说明 SKILL guidance 会被净化、哪些字段会被忽略、权限仍由应用单源管理。

5. **P2 - 真实 live API 语义分支 `untested`**
   - 问题: 当前验证为本地 provider + 真实 Electron UI，live 供应商语义分支尚未验证。
   - 方案处理: Phase 5 有可用 key 时补 live 验证；无 key 时如实登记 `untested`，禁止用本地结果冒充。

6. **P3 - 主页内联改写/插入仍走 diff 预览**
   - 位置: `src/components/chat/ChatPanel.vue:3415`, `src/components/chat/ChatPanel.vue:4350`
   - 问题: 已确认不是 API 直写链路，不会劫持 `editor.write`，而是用户手动插入/修订后的独立确认流。但它与已删除的 API 预览语义在 UI 上容易混淆。
   - 方案处理: Phase 3 按用户决策 Option B 执行，统一到新直写语义，用户手动插入/修订也直接写入，不再弹预览。

## Verification Baseline

- `npx vitest run src/services/dialogueToolSurface.spec.ts src/services/agentOrchestrator.spec.ts src/services/documentTransformService.spec.ts src/services/skillGuidanceSanitizer.spec.ts src/services/toolContextCompactor.spec.ts`
- 结果: 76/76 通过
- 限制: 只证明当前关键防线未回退，不证明 live 语义分支，也不掩盖 `documentTransformService` 校验缺陷。

## Stop Conditions

1. 用户审核通过并明确授权后，才进入实现。
2. 实现过程中每完成一个 Phase 都必须回头验证影响圈，不得留新旧并存。
3. live 验证必须用真实 API key 和真实 Electron UI，禁止 mock、注入、README、历史结果冒充。
4. 若某阶段验证失败，立即停止推进，回到诊断阶段，不得带病封装。
5. live key 只能通过安全本地配置或运行时输入提供，禁止写入仓库、日志、trace、方案文档或测试快照。
6. 封装只能在 Phase 5 全部验证通过、Phase 6 回头看无新旧并存后执行。

## Next Actions

1. 用户审核重生成后的方案。
2. 审核通过后，按方案 Phase 0 到 Phase 6 顺序执行。
3. 每阶段更新本台账，记录测试证据和回看结论。
