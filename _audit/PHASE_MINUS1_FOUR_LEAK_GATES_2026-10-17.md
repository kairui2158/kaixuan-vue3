# Phase -1 四漏门禁表（2026-10-17 正文层事故）

来源事故：`C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-正文层-20261017-021335-deep/run-trace.json`（standard/deep 同 ID；416 events、62 payloads）。本文件是本轮修复的唯一入口台账：任何修复项和验证项不在这里登记，视为未开始。

## 表 1：事故报告八项完整性清单（防漏报）

事故报告必须同时覆盖以下八项；缺任何一项，报告不得交付。

| # | 必填项 | 本轮事故结论 | 证据 |
|---|---|---|---|
| 1 | 任务终态 | 首次主链成功，后续 `targeted` 修复重复跑 S1→S3；最终以恢复产物完成 | deep trace `:4800`（attempt-2 `targeted/complete`，`requestFingerprint.physicalRequests=3`）；`body-artifact-recovered` `:4842` |
| 2 | 事件流语义 | S3 两次输出回显警告来自主链普通路径，不是升级重试路径 | `:2348`、`:4781`；源码 [PipelinePanel.vue](../src/components/pipeline/PipelinePanel.vue:3172) |
| 3 | 物理请求拓扑 | 主链 3 次；attempt-2 `targeted` 又 3 次，其中 S1 属于无收益重跑 | `:4800`；[PipelinePanel.vue](../src/components/pipeline/PipelinePanel.vue:4299) |
| 4 | 每步耗时 | 首次整链约 272 秒；attempt-2 约 542 秒，targeted 反而更慢 | 运行时间戳与 `:4800` request fingerprint 对账 |
| 5 | 每步产物状态 | S1/S2/S3 均有输出；attempt-2 的 S1 输出没有复用价值但仍被消费 | [bodyArtifactOrchestrator.ts](../src/services/bodyArtifactOrchestrator.ts:197) |
| 6 | 降级警告 | 第 5 次 API 调用 degraded；原因是 `hook-field-ignored: 未知字段已忽略：warnings` | `:4388`、`:5614`、`:7059`、`:7632`、`:7076` |
| 7 | 用户可见 UI 语义 | 运行包为 01:53 构建；修复提交 02:10，用户 02:13 仍看到旧语义 | [EXPERIENCE.md](../EXPERIENCE.md:452) 生产 bundle 教训；本轮时间线 |
| 8 | 归属分层 | P0/P1 应用层 3 项；SKILL 层 1 项：S1 提示词与 3500 字契约冲突，需转达 SKILL 层 | S1 reasoning 与章节剧情点内容；应用侧修复见表 2 |

## 表 2：缺陷登记表（防漏项）

| 编号 | 等级 | 缺陷 | 根因 | 修复项 | 验证项 |
|---|---|---|---|---|---|
| D1 | P0 | 主链 S3 终步回显误报 | 上一轮只豁免升级重试路径，主链 `repairedEchoDiagnostic` 仍无条件 warn；经验已记录但未执行 | 已完成：`getChainEchoWarningLevel()` 单源化主链、升级重试、工作台三路终步语义 | 已完成：单测矩阵 + Electron `success.png`/trace 无 echo warn |
| D2 | P0 | 运行包滞后造成“源码已修、窗口旧行为” | 无 build manifest / runtime fingerprint 对账机制 | 已完成：Vite 注入 `__SHENYI_BUILD_MANIFEST__`，run trace 写 `runtimeFingerprint` | 已完成：单测 + Electron 断言 disk manifest 与 trace 一致 |
| D3 | P0 | `targeted` 修复整链重跑 | `repairScope` 只改提示词，执行入口固定 `runStepSkills(4)` | 已完成：`planBodyArtifactExecution()` 按 generator 步定点执行；追加修复断点清理后 S1 产物只存于断点，改为 attempt 生命周期内回传复用 | 已完成：planner 单测 + wiring 源级断言 + Electron 5 请求账本（首链 3、targeted 2） |
| D4 | P1 | `hook-field-ignored` 仍造成 degraded | 运行包滞后；源码已修但当前没有机制阻止旧包继续被验证 | 已完成：同 D2 的 build manifest 与 bundle 新鲜度对账 | 已完成：验证器拒绝 stale bundle；runtime fingerprint 断言 |
| D5 | P1 | S1 prompt 与字数契约冲突 | SKILL 层模板把 3500 字契约传给 S1；应用层必须只传给 S2 | 已完成：应用侧只把字数契约注入执行步 prompt；SKILL 内容转达 SKILL 层 | 已完成：`chapterExecutionPackage.spec.ts` 全 prompt 仅 1 处 `约3000字` |
| D6 | P1 | 四漏问题重复发生 | 经验教训是 prose，缺少缺陷→修复→验证的强制对账结构 | 已完成：本表 + D1-D5 三层证据 + DEV_LOG/经验回写 | 已完成：本文档、DEV_LOG、经验 v8.13、任务台账四件套 |

### D3 追加发现：断点清理与 attempt 产物生命周期错位

首版实现把每步产物写入断点，但链成功后必须清理 owner 断点。下一轮 targeted 修复启动时，持久化断点已被清空，attempt 找不到 S1 产物，只能静默降级整链重跑。这不是断点恢复语义错误，而是两个生命周期的交接缺口：

- 写入列：`createChainSuccessBreakpoint({ stepOutputs })` 持久化每步产物。
- 清理列：链成功后 `clearBreakpoint(owner)`，产物随断点消失。
- 读取列：targeted attempt 在清理之后才请求复用上游产物。

修复为链成功清理断点前调用 `onStepOutputs(completedStepOutputs)`，把产物回传给正文 attempt 闭包；targeted 修复优先读取 attempt 生命周期产物，持久化断点只作为恢复补充。产物缺失时显式降级整链并写 `body-targeted-repair-artifact-missing`，不再静默。经验文件 v8.13 已将该契约并入 G2.9。

## 表 3：全局反向搜索矩阵（防漏面）

搜索执行时间：2026-10-17。每个命中必须归类；未归类不得进入修复。

| 搜索目标 | 命中 | 归类 |
|---|---|---|
| `detectChainOutputEcho` 消费点 | [PipelinePanel.vue](../src/components/pipeline/PipelinePanel.vue:3129) 主链；[PipelinePanel.vue](../src/components/pipeline/PipelinePanel.vue:3355) 升级；[chainExecution.ts](../src/services/chainExecution.ts:164) 纯函数；[workspaceSkillEngine.ts](../src/services/workspaceSkillEngine.ts:1642) 工作台 | 受影响：四处必须统一终步豁免语义；工作台路径需确认是 info 还是仍 warn |
| `shouldRepairChainEcho` | [chainExecution.ts](../src/services/chainExecution.ts:194)；主链 [PipelinePanel.vue](../src/components/pipeline/PipelinePanel.vue:3135) | 受影响：终步 polish 职责豁免已存在，但 warn 豁缺漏 |
| `hook-field-ignored` | [realSkillExecutor.ts](../src/services/realSkillExecutor.ts:210) info；[realSkillExecutor.spec.ts](../src/services/realSkillExecutor.spec.ts:1128) 反测 | 源码已修；事故来自旧运行包，F2 防复发 |
| degraded 判定 | [pipelineRunOutcome.ts](../src/services/pipelineRunOutcome.ts:54)；[PipelinePanel.vue](../src/components/pipeline/PipelinePanel.vue:2259) | 受影响：需要用 mock warnings 场景证明 run 不因未知协议字段降级 |
| `runStepSkills` 调用 | `:3590` 设定、`:3732` 卷纲、`:3892` 章节、`:4299` 正文 | 受影响：先做正文层拓扑；其余三层登记为同类面，需评估是否共享 planner |
| 断点恢复 | [PipelinePanel.vue](../src/components/pipeline/PipelinePanel.vue:2893)、[workspaceSkillEngine.ts](../src/services/workspaceSkillEngine.ts:1500) | 受影响：attempt 执行需显式禁用 completed/fresh 断点回放 |
| manifest / fingerprint | `rg` 全局无命中 | 缺失，F2 新建 |
| Electron 验证惯例 | [verify-body-repair-ledger-electron.mjs](../scripts/verify-body-repair-ledger-electron.mjs:401) | 可复用：fresh renderer build + mock provider 物理请求 + trace/report 双证据 |

## 表 4：缺陷×验证矩阵（防漏验证）

每个缺陷三层证据；任何一层缺失，该缺陷不得标记修复完成。

| 缺陷 | 自动化测试 | 现象回放 | 真实 Electron UI |
|---|---|---|---|
| D1 终步回显误报 | 纯函数矩阵：终步 polish/普通 S3/中间步 | 事故 trace fixture 回放：S3 87%/85% 不再 warn | 真实 UI 跑正文链，断言终步无 `chain-output-echo` warn |
| D2 运行包滞后 | manifest 生成/对账单测 | 旧 bundle 新代码组合必须失败 | trace runtime fingerprint 与 manifest 一致 |
| D3 targeted 整链重跑 | planner 单测：`too_short/too_long` 定点 S2，S1 契约失败才重跑 S1 | attempt-2 fixture：无 S1 物理请求 | mock provider 请求计数：targeted 修复只发生 S2/S3 |
| D4 hook-field-ignored | executor 单测已存在，补 run outcome 集成断言 | 事故 trace 回放：warnings 字段 info 化 | mock provider 返回 warnings，run status 非 degraded |
| D5 S1 契约冲突 | 字数契约注入点测试 | 事故 trace S1 prompt 对照 | UI 生成时 S1 prompt 不含 S2 字数契约 |
| D6 四漏复发 | 上述全部 | 上述全部 | 上述全部 |

## 门禁执行规则

1. 修复前先写红测试或现象回放 fixture；先红后绿。
2. 每个缺陷的验证矩阵三层证据齐全后才能在表 2 标记完成。
3. 真实 Electron UI 验证必须走生产 `dist-renderer`，并保留截图、trace、请求计数三重证据。
4. Phase 4 收尾时把本文件状态同步进 DEV_LOG 与 [EXPERIENCE.md](../EXPERIENCE.md:440)。

## 收口验证记录

- 全量服务测试：`npm run test:services` → 170 files / 1978 tests 全部通过。
- 类型检查：`npm run type-check` → 通过（本轮在类型契约修改后重跑）。
- Renderer 构建：`npm run build:vue` → 通过；既有 chunk 超限与 `vite.protocols.config.mts` 的 `__dirname` warning 仍为登记项，不顺手修改。
- 真实 Electron UI：`node scripts/verify-owner-breakpoint-closure-electron.mjs` → PASSED。
- Electron 证据目录：`_audit/verification-owner-breakpoint-closure-electron/`，包含 `trace-run.json`、`provider-requests.json`、`final-body.txt`、`success.png`、`report.json`。
- attempt 账本：attempt 1 `none / too_short / wordCount 4 / requestCount 3`；attempt 2 `targeted / complete / wordCount 2000 / requestCount 2`。
- 关键断言：首链 S1 只执行 1 次；targeted 复用持久化 S1；无 `body-targeted-repair-artifact-missing`；终步 polish 无 echo warn；runtime fingerprint 与 disk manifest 一致；run 终态 `success`。
