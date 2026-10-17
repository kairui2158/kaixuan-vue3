# 任务台账：正文层降级越权与产物契约收口

## 1. 目标与原话

用户确认执行正文层降级越权事故的完整修复方案，要求不留盲点、验证不偷懒，并把 20261017-043758 事故根源彻底抹杀。

最终可感知行为：S2 供应商降级但正文不合格时，任务在生成步失败并写入明确原因；S3 不再消费坏稿；S2 degraded 且正文合格时允许继续并保留 warning；attempt 台账可对账决策、提取面与物理请求。

## 2. 门禁读证

- G0.3 诚实闭环：完成声明区分已验证、未验证与边界。
- G0.5 回头看：收尾前对账方案 Phase、diff、证据与生产入口。
- G0.10 新旧并存清零：局部“degraded 且非空即继续”规则反查为零。
- G0.11 真实交互冒充禁令：Electron 验证使用真实下拉选择 SKILL。
- G0.12 门禁执行台账：本文件为执行凭证。
- G1.5 验证器自身质量：断言决策结果与下游副作用。
- G1.17 执行者自盲区：测量面、消费面、同源三问。
- G2.9 终稿与流水线：caller 状态与产物契约分权。

## 3. 路由判定

加入：G0.1、G0.3、G0.4、G0.5、G0.8、G0.9、G0.10、G0.11、G0.12、G1.1、G1.4、G1.5、G1.7、G1.8、G1.11、G1.17、G2.9。

排除：

- G1.18 本地确定性路径：本轮无 local-transform 修改。
- G1.19 耗时观测：本轮不做性能决策。
- G2.11 供应商软错误：供应商协议与重试策略未变更，`degraded` 治理发生在产物契约层。

## 4. 影响圈与作者反证

打算改：正文契约步骤验收、folder SKILL 降级带输出的放行规则、生成步契约注入、执行包字数契约、attempt 台账、trace 事件、验证脚本、跨层审计文档、经验文件、版本号。

可能碰到：非正文契约步骤的降级语义、复合 folder SKILL、章节执行包调用方、下游 S3 消费面、Electron 旧验证器。

作者反证：

- 假设一：只需要在终链验收拦截即可。证伪成立：S3 已消费坏稿，事后验收只能失败，不能阻断污染。
- 假设二：degraded 带非空输出即可继续。证伪成立：raw 非空不等于 extracted 面达标，1654 字短稿就是反例。
- 假设三：只改 PipelinePanel 就能闭环。证伪成立：`skillOrchestrator` 仍保留第二套放行规则，必须同批清除。

## 5. 停止条件

- 方案 Phase 1-7 全部完成并有三层证据。
- 定向测试、全量服务测试、type-check、build:vue 通过。
- 历史回放与真实 Electron UI 双验证通过，且断言下游副作用。
- 经验文件 v8.14、DEV_LOG、任务台账、索引、版本号、清理、提交全部完成。
- 工作区无临时脚本与无关产物。

## 6. 执行证据

- 单源验收门：`src/services/stepArtifactAcceptance.ts`。
- 生产接线：`src/components/pipeline/PipelinePanel.vue`、`src/services/skillOrchestrator.ts`。
- 契约单源：`src/services/chainExecution.ts`、`src/services/chapterExecutionPackage.ts`。
- 历史回放：`node scripts/verify-body-contract-degraded-replay.mjs` → PASSED。
- 真实 Electron UI：`node scripts/verify-body-contract-degraded-electron.mjs` → PASSED；场景 A S3 零调用且 run failed，场景 B S3 一次调用且 run success。
- 定向测试：4 个 spec 共 67 tests passed。
- 证据目录：`_audit/verification-body-contract-degraded-replay/`、`_audit/verification-body-contract-degraded-electron/`。
- 收尾发现并修复无 SKILL compose 回归：`bodyArtifactOrchestrator` 显式区分 `null` 与 `0`；compose 注入契约并记录 `body-step-acceptance`，契约失败时把修复决策权交回编排器。
- 全量验证：`npm run test:services` 172 files / 1998 tests、`npm run type-check`、`npm run build:vue` 全部通过。
- Electron 回归：`verify-body-repair-ledger-electron`、`verify-owner-breakpoint-closure-electron`、`verify-postprocess-terminal-ui-electron` 全部 PASSED；证据在对应 `_audit/verification-*` 与 `output/playwright/postprocess-terminal-ui/`。

## 7. 缺口清单

- Electron 为本地 OpenAI-compatible provider，未覆盖外部 live 供应商矩阵。
- 原始 043758 trace 未做逐 token 回放器；以同语义事故回放覆盖核心路径。
- SKILL 层模板与提示词内容不在本轮应用侧修改范围。
- 既有 build warning（chunk 超限、`vite.protocols.config.mts` 的 `__dirname`）保持登记不修。
- 经验文件升级 v8.15，补入“单调用 compose 同样是唯一生成步”门禁。
