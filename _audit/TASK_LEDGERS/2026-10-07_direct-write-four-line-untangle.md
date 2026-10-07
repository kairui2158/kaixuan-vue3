# 任务台账：API 直写四线拆解修复

> 状态：Phase 0-6 已执行；文档收口于 2026-10-08 补齐；真实 live API 语义分支 `untested`。

## 1. 目标与原话

- 用户目标：四个系统缺陷如四条线缠绕，必须从最底层拆解捋直，让它们从底层开始不再有缺陷和叠加；先出修复方案审核。
- 方案：[PROPOSAL_2026-10-07_DIRECT_WRITE_FOUR_LINE_UNTANGLE.md](../PROPOSAL_2026-10-07_DIRECT_WRITE_FOUR_LINE_UNTANGLE.md)。
- 本轮交付物：L1-L4 修复、横向修复、单测、Electron 验证、方案与台账收口。

## 2. 门禁读证

- 已复读 `_audit/神意开发经验总结_v7.md`（内容 v8.4）：G0.5 回头看、G0.9 旧链路矩阵、G0.10 新旧并存清零、G0.11 真实交互冒充禁令、G0.12 台账、G1.9 终态收敛、G1.15 四层递进、G1.17 执行者自盲区、G2.5 长文档覆盖、G2.13 SKILL 执行中立。
- 已复读 `DEV_LOG_2026-10-06_r1-phase0-baseline.md`、`DEV_LOG_2026-10-06_direct-write-coverage-convergence.md`。

## 3. 路由判定

- 执行期已按方案加载 G0.3/G0.5/G0.9/G0.10/G0.11/G0.12、G1.4/G1.6/G1.13、G1.9/G1.14/G1.15/G1.17、G2.1/G2.2/G2.5/G2.11/G2.13；live 分支按 G1.4 登记 `untested`。

## 4. 影响圈与作者反证

- 打算改（待批准后）：`skillGuidanceSanitizer.ts`（新增）、`workspaceSkillEngine.ts`、`agentOrchestrator.ts`、`aiService.ts`、`longDocumentWriteProtocol.ts`、`OutlineWorkspace.vue`、`ChatPanel.vue`、`finalDraftService.ts`、相关 spec、SKILL 手册。
- 作者反证：已验证 004 请求中“新授权协议 + 旧预览协议”并存是事实；已验证内层无用户交接出口、外层识别滞后是事实；已验证预算公式 3 批=36 且写入提示词；已验证 UI 锁定覆盖整个外层 run。

## 5. 停止条件

- 方案审核通过前：不实现。
- 执行期完成条件见方案第 5/6 节；任一 Phase 失败、测试红、双态不一致、真实 UI 复刻未过，均不得声称完成。

## 6. 执行证据

- 2026-10-07 本轮：
  - `git status --short --branch`：`codex/direct-write-negative-verification`，工作区干净。
  - 解析 trace `payloads/004-request.json`：2 条 system；第一条为应用直写授权协议；第二条 89,707 字符 guidance 中含【修改预览】【批准写回】【写入未执行】、`status: pending`、`await_user: true`。
  - `005-response.json`：模型输出完整预览与两个确认问题。
  - `007-reasoning.json`：模型自述进入“修改预览”状态。
  - 代码扫描：`appendSkillGuidance`、`calculateLongDocumentPhysicalRequestBudget`、`isGenerating`、内层 `calls.length===0` 分支均已定位到 file:line。
- Phase 1-6 实现（2026-10-07）：
  - L1：新增 `src/services/skillGuidanceSanitizer.ts`，接入 `agentOrchestrator.ts:398`、`finalDraftService.ts:194`、`realSkillExecutor.ts:263`；trace 事件 `agent-skill-guidance-sanitized`。
  - L2：`aiService.ts:463-501` 新增用户交接/协议违例判定；`agentTerminalMapping.ts:66` 终态映射；`agentOrchestrator.ts:250-251` 终止循环。
  - L3：`longDocumentWriteProtocol.ts:10-18` 预算改为计划推导 `segmentCount * 2 + 6`，封顶 64，`local-transform` 为 0；提示词去跑道化；内联副本删除。
  - L4：`interactive_response` 事件解锁输入；`OutlineWorkspace.vue:5280-5286`、`ChatPanel.vue:3636-3653`。
- Electron 验证（2026-10-07，本地 provider + 真实 UI）：
  - `_audit/verification-direct-write-negative-paths/result.json`：`previewOnlyRejection` 1 次请求即停，`failed/write_not_executed`；`needsUserHandoff` 1 次请求，`blocked/agent_needs_user`，`inputUnlockedImmediately: true`，后续成功；`partialWriteTerminal` 终态 `partially_applied`，diff 留档。
  - `_audit/verification-skill-agent-authority-v2/summary.json`：四态权限与工具面一致，discuss 保持只读，edit 才可写。
  - `_audit/verification-api-direct-write-electron/dual-entry-equivalence.json`：双入口 16 请求最终内容一致、共享工具面一致、trace 收口。
  - `_audit/verification-api-direct-write-electron/three-tier-matrix.json`：S/M/L 三档通过，100 万字 11 次请求完成局部编辑，内容完整性通过。
- 新鲜回归（2026-10-08）：
  - `npx vitest run src/services/skillGuidanceSanitizer.spec.ts src/services/agentOrchestrator.spec.ts src/services/agentTerminalMapping.spec.ts src/services/longDocumentWriteProtocol.spec.ts src/services/finalDraftService.spec.ts src/services/realSkillExecutor.spec.ts`：140/140 通过。
  - `npx vitest run src/services/aiService.spec.ts src/services/agentDialogueRuntime.spec.ts`：157/157 通过。
- 文档收口（2026-10-08）：本节补齐。此前实现已完成但方案/台账未同步，违反 G0.12；本次修正。

## 7. 缺口清单

- 真实 live API 语义分支 `untested`：当前验证为本地 provider + 真实 Electron UI；待可用 live key 后补验。
- 版本封装未执行：当前 3.76.0，是否升版本封装需用户确认。
- SKILL 手册同步：`_audit/SKILL_HANDOFF_API_DIRECT_WRITE_TOOLS.md` 需按 L1 净化器语义复核更新，属后续项。

## 8. 追加：live step5 效率缺陷

- 现场：`_data/api-direct-write-live-v3-profile/documents-data/run-trace/outline/run-trace-outline-20261007-185019/run-trace.json`，`apiCalls[4]`。
- 实测：7,606 字文档，23 次物理请求、24 次工具调用、累计 954,174 ms 后仍 `running`。
- 根因：确定性整理被路由进模型微操作循环；上下文滚动放大；segment 覆盖账本与实际工作不匹配。
- 方案：[PROPOSAL_2026-10-07_LONG_DOCUMENT_EXECUTION_EFFICIENCY.md](../PROPOSAL_2026-10-07_LONG_DOCUMENT_EXECUTION_EFFICIENCY.md)。
- 状态：方案待审核，未改生产代码。
