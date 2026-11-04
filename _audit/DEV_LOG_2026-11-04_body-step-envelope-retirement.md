# DEV_LOG: 正文链旧信封退役 A 路线

日期：2026-11-04
台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-04_body-step-envelope-retirement.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-04_body-step-envelope-retirement.md)

## 1. 用户决策与目标

用户裁决四个争议点按建议执行：不改 `skillOrchestrator/workspaceArtifactAcceptance`；保留 candidate 正则审计；旧断点只做内存净化，不改写历史落盘；本轮不重写候选保留策略。A 路线目标是不保留任何兼容解析层，彻底退役 `__shenyiStepArtifact`：caller 状态与错误只在内存结构化直传，正文契约继续按净汉字与提取面验收，旧 JSON 不再获得状态授权、不再跨边界回传、不再被计成正文字数。

## 2. 交付

- `stepArtifactAcceptance.ts` 新增 `StructuredSkillStepOutput`、结构化 normalize 与统一流程；删除信封类型、构造器与解析器。
- `callValidatedSkill` 返回结构化对象；主链、echo retry、escalation、compose 四个生产调用点改为消费 `.output`，主链与 compose 把完整对象交给统一验收。
- `bodyArtifactOrchestrator.ts` 消费结构化 degraded/errors，并把诊断注入 attempt 与 caller errors。
- 断点恢复新增 `sanitizeLegacyEnvelopeArtifact`：可解析旧信封迁移成真实正文，不可解析清空并从头执行；只净化本轮内存态，不改历史落盘，trace 显式记录。
- `generationResult.ts` 保持不识别旧信封；信封字符串按普通文本处理并被合同拒绝。
- 三个失败测试按真实可达路径迁移：旧信封不再携带 degraded 状态；flow 矩阵只测 caller 返回的 success/degraded，failed/blocked 由验收层单独覆盖；正文编排断言旧信封整体按 too_short 拒绝。
- `finalStepMetadataWiring.spec.ts` 的 compose 守卫从旧字符串形态迁移到 `composeStepResult` 结构化形态。

## 3. 验证与证据

- 定向首轮收敛后：`npx vitest run ...stepArtifactFlow... acceptance ... bodyArtifactOrchestrator ... generationResult` → `4 files / 64 tests passed`。
- 守卫迁移后：同批五文件 → `5 files / 72 tests passed`。
- 全量：`npm run test:services` → `247 files / 2655 tests passed`。
- 类型与 diff：`npm run type-check` exit 0；`git diff --check` 无 whitespace error。
- 旧语义：`rg -n "__shenyiStepArtifact|makeStepArtifactEnvelope|parseStepArtifactEnvelope" src electron` 只剩四个 spec 负向断言与 PipelinePanel 断点净化常量；现役信封构造/解析执行面 0 命中。

## 4. 边界与缺口

- 真实 folder SKILL、真实供应商、真实 Electron 正文链完整生成：`untested`。本轮只有服务运行时、mock 旁路和源码接线守护，不冒充真实链路。
- echo retry 与 escalation 当前只消费输出文本，不走生成步统一验收；本轮判定为 handoff 修复旁路而非旧信封通道，但其在真实正文路径是否必须直入统一验收保持 `untested`，登记给后续真实链验证。
- 断点净化中“migrated”会恢复旧产物正文；这是四个裁决点明确允许的内存净化语义，不是新兼容执行协议。

## 4.1 真实 Electron 盲区补验

- 修复 `PipelinePanel.vue` 的 `closePerRunFeedback`：终态时立即删除 per-run UI 会先删掉 `feedbackHidden`，导致关闭按钮看似无效；现在只重置警告计数，终态 run 由既有 watcher 统一回收。
- Electron 验证器夹具改为真实矩阵：带【正文交接】的 S2 输出才 degraded，纯正文成功；场景 C 改为“S2 success + 2800 字 + 无账本”，在终步命中 `body-generator-ledger-missing`。
- 三场景 PASS：A degraded/1640 字 S3 前拒绝（4 请求）；B degraded/2800 字提取后进入 S3，成功正文 3393 字（5 请求）；C S3 不运行（2 请求），失败不覆盖旧正文。
- echo retry 与 escalation 直入统一验收仍保持 `untested`；本轮不升版本、不封装。

## 5. 收尾

本轮不升版本、不封装安装包；只做提交固化。经验文件 v10 现行 G0.3/G0.10/G0.13/G1.11/G2.9 已覆盖事故语义，无需修订规则。
