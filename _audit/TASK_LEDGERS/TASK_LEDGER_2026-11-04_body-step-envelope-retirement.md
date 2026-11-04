# TASK_LEDGER: body-step-envelope-retirement-A-route

## 1. 目标
- 退役 `__shenyiStepArtifact` 信封，正文链调用改为结构化状态直传。
- 防止信封 JSON 被计入正文字数、污染终步 FACT_LOCK 对账和断点/链路交接。
- 同批迁移 V1 三文件偏差和守护旧信封的测试。

## 2. 影响圈
- 打算改：PipelinePanel.vue、stepArtifactAcceptance.ts、bodyArtifactOrchestrator.ts、generationResult.ts 及对应 spec。
- 可能碰到：finalStepMetadataWiring.spec.ts、ownerBreakpointClosureWiring.spec.ts、chain 断点恢复、运行 trace。
- 不改：skillOrchestrator.ts、workspaceArtifactAcceptance.ts、候选保留策略、历史 trace。

## 3. 执行项与验收
- A1 `callValidatedSkill` 结构化返回。
- A2 `resolveStepArtifactFlow` 直读 callerStatus/errors。
- A3 正文编排层识别结构化 degraded/errors。
- A4 旧断点信封只做内存净化：可恢复则迁移并 trace，不可恢复则从头执行并阻断 trace。
- A5 V1 信封兼容逻辑回退，测试改为新语义 + 旧标记负向断言。
- 验收：定向/全量测试、type-check、现役执行面 rg 清零、wiring 断言、真实链冒烟或诚实标 untested。

## 4. 门禁记录
- [x] G0.3 诚实闭环（`_audit/神意开发经验总结_v9.md:36`）：已验证类型、服务运行时、mock 旁路；真实 folder SKILL / 真实供应商正文链标 `untested`。
- [x] G0.6 方案成熟度（`:52`）：A 路线已裁决；执行器/工具层、应用接线、验证标准均收敛，无半成熟断点放行。
- [x] G0.7 正反推研磨（`:62`）：主链、echo retry、escalation、compose、断点恢复、persist 断点五路反推；negative envelope 不拆包。
- [x] G0.9 七面影响圈（`:84`）：生产入口、服务层、UI 接线、测试、trace 事件、断点状态、规格文档已对账。
- [x] G0.10 旧语义清零（`:92`）：现役解析/构造执行面 0 命中；仅测试负向断言与断点净化常量保留。
- [x] G0.13 最小必要性（`:132`）：不加兼容协议、新配置或新状态；只保留已裁决的断点内存净化。
- [x] G1.1 精准编辑与 diff 自审（`:144`）：逐行补丁；`git diff --check` 无 whitespace error。
- [x] G1.3 全局层与同款逻辑统一（`:160`）：`callValidatedSkill` 四个生产调用点统一消费结构化返回。
- [x] G1.4 验证真实性与分层（`:168`）：源码守卫与运行时测试分层；mock 不冒充真实链路。
- [x] G1.11 测试契约（`:266`）：守护旧形态的用例同批迁移；全量服务测试而非单文件绿灯。
- [x] G2.9 终稿与流水线（`:533`）：caller 状态与产物契约分权，degraded + 契约失败阻断，compose 决策权交回编排器。

## 3.1 路由判定

- 排除 G0.11：本验证目标不是真实 DOM 交互行为。
- 排除 G1.12 发布矩阵：本轮明确不封装；若后续发布，正文链生成、断点恢复、运行 trace 均必须进入回归矩阵。
- 排除 G1.5 完整 Electron 验证：本轮无真实供应商执行前置，`untested` 显式登记，不冒充。

## 5. 证据
- Before：`__shenyiStepArtifact` 经文本序列化跨 caller / 契约 / 终步边界，JSON 壳被 `parseGenerationResult` 当正文，假通过并污染 FACT_LOCK。
- After：`callValidatedSkill` 返回 `StructuredSkillStepOutput`；状态与错误内存直传；`resolveStepArtifactFlow` 只验收下游真实消费的提取面；`parseGenerationResult` 不授权旧信封；断点恢复先净化旧信封内存态，后续落盘为纯正文。
- 生产接线：`src/components/pipeline/PipelinePanel.vue:878`、`:4270-4360`、`:4714`、`:4787`、`:5103`、`:5323`。
- 结构化验收：`src/services/stepArtifactAcceptance.ts:33-82`、`:128-221`；负向解析：`src/services/generationResult.spec.ts:27-38`。
- 正文编排：`src/services/bodyArtifactOrchestrator.ts` 的结构化候选分支；旧信封负向测试 `src/services/bodyArtifactOrchestrator.spec.ts:200-218`。
- 定向验证：`npx vitest run src/services/stepArtifactFlow.spec.ts src/services/stepArtifactAcceptance.spec.ts src/services/bodyArtifactOrchestrator.spec.ts src/services/generationResult.spec.ts` → `4 files / 64 tests passed`。
- 守卫修正：`finalStepMetadataWiring.spec.ts` 追加结构化 compose 契约后定向 `5 files / 72 tests passed`。
- 全量验证：`npm run test:services` → `247 files / 2655 tests passed`；`npm run type-check` → exit 0；`git diff --check` → 无 whitespace error。
- 旧语义扫描：`rg -n "__shenyiStepArtifact|makeStepArtifactEnvelope|parseStepArtifactEnvelope" src electron` → 仅 PipelinePanel 净化常量（`:878/:4279`）与四个 spec 负向断言；生产解析/构造执行面 0 命中。
- 旁路判定：echo retry 与 escalation 只消费 `.output`，且当前不在 `isGeneratorStep && bodyChainContract` 统一验收入口；这是 handoff 修复旁路，不是旧信封字符串通道。它们在真实正文生成路径是否需要直接纳入统一验收保持 `untested`。
- 2026-11-04 真实 Electron 盲区补验：`node scripts/verify-body-contract-degraded-electron.mjs` → `===== BODY CONTRACT DEGRADED GATE ELECTRON PASSED =====`。场景 A degraded/1640 字在 S3 前拒绝，4 次物理请求；场景 B degraded/2800 字提取后进入 S3，成功正文 3393 字，5 次物理请求；场景 C S2 success/2800 字但无【正文交接】账本，在终步命中 `body-generator-ledger-missing`，2 次物理请求，S3 未调用，旧正文 3393 字不被覆盖。
- 补验修复：`PipelinePanel.vue` 的 `closePerRunFeedback` 终态时不再立即 `resetPerRunUi`，只重置警告计数，由终态 watcher 统一回收；否则 `feedbackHidden` 被删除导致关闭按钮失效。
- 验证器口径修正：夹具 S2 改为带账本输出才 degraded、纯正文成功；场景 C 不再预设 S2 schema retry；断言按新成功路径核对 2 次物理请求与 `['normal','normal']` 阶段。没有放宽任何产品断言。
- 盲区状态：主链三场景已从 `untested` 转为真实 Electron PASS。echo retry 与 escalation 直入统一验收仍未被本 Electron 脚本覆盖，保持 `untested`。

## 6. 偏差与作者反证
- 最大风险：只改链内调用但漏掉旧断点/升级重试/compose 路径。证伪方式：四个调用点逐一追踪和 rg。
- 第二风险：把解析器防御误当迁移。证伪方式：执行面必须无信封标记，负向断言区分“不执行”。

## 7. 收尾
- [x] DEV_LOG 与总索引登记
- [x] 经验文件检查：v10 现行门禁已覆盖；本轮不改门禁。
- [x] 提交与工作区干净（A 路线首提交 `70035742`；本轮补验修复与证据随后显式 staging 提交）
