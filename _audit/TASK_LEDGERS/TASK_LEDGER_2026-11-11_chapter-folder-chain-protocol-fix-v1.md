# TASK LEDGER · 章节层 folder-chain 输出协议修复 V1

## 1. 目标与原话

用户确认执行 V1：修复 `chapterBatchOrchestrator.ts` 在 folder-chain 模式下向章节 SKILL S1-S3 注入与输出协议冲突的 JSON 指令；要求完成后回写经验、台账与 DEV_LOG，并升版封装提交。

## 2. 门禁读证

- G0.1：目标锚定“应用不得教 folder SKILL 用 JSON 输出”，不是重写章节生成器。
- G0.2：未设置 token/时间/轮次预算。
- G0.3：区分已验证 Electron 真实供应商路径、离线导出断言与未验证边界。
- G0.4：已复读经验 L0/L1/L2 相关条目与最新 DEV_LOG；本次按 G2.9 新增规则回写。
- G0.5：回头看已执行 diff、入口、验证器与证据归属对账。
- G0.6：方案经用户审核并确认；四层成熟度结论为“成熟”。
- G0.7：目标倒推、爆炸半径、正反推已记录；direct-json 语义保留为反推防线。
- G0.8：只清理本轮生成且可再生的临时物，未删除历史未跟踪 audit 产物。
- G0.12：本台账七节齐全；第七节含缺陷面枚举。
- G0.13：只新增一个输出协议枚举字段和边界文案，无第二协议、无预算系统、无自动调度、无 UI。
- G1.13：Electron 烟测使用独立 profile 与数据目录，真实供应商返回成功。
- G1.14：对 chapter/volume sibling、repair/normal 双路径、调用点、旧协议残留做枚举。
- G2.9/G2.11：流水线协议单源与供应商烟测相关条目已读。

## 3. 路由判定

纳入：G2.9 输出协议单源、G1.14 缺陷面枚举、G1.13 Electron 烟测、G0.13 最小必要性。排除：SKILL 模板协议优先级声明、heartbeat 重试间隔、供应商 503 治理；前两项归 SKILL/用户边界，第三项本轮未触发且不属本章协议根因。

## 4. 影响圈与作者反证

影响圈：`PipelinePanel.vue` 章节批量调用点、`chapterBatchOrchestrator.ts` prompt 构造与 orchestrator 输入、定向测试、Electron 导出验证器。可能错点一：误把所有章节调用当 folder-chain。处置：按步骤模板 `format === 'folder' && folderPath` 判定，direct-json 显式保留。可能错点二：修复/补充路径漏改。处置：normal 与 repair 两分支同一字段透传，测试分别覆盖。可能错点三：卷纲同款语义漂移。处置：卷纲已存在任务边界机制，不改动；只做 sibling 对账。

## 5. 停止条件

当 folder-chain 请求仍含“输出JSON数组”、边界声明缺失、测试或真实烟测失败时停止并按缺陷面登记。全部通过后停止加码，不再做导出格式优化、供应商重试治理或 UI 提示。

## 6. 执行证据

- 静态与测试：`npx vitest run src/services/chapterBatchOrchestrator.spec.ts` 16/16 passed；`npm run type-check` exit 0；`npm run test:services` 2726 tests passed；`npm run build:vue` exit 0。
- 真实 Electron 供应商烟测：baseUrl `https://api.kjdfhl.school/v1`，model `glm-5.3-flashx`；12 章分 5/5/2 三批，`status=success`，`repairAttempts=0`。
- 离线导出复验：`node scripts/verify-chapter-live-export.mjs` exit 0；输出 `schemaVersion:23, status:success, step:3, validatedBatches:3, apiCalls:12, forbiddenCount:0, boundaryCount:12`。
- 证据目录：`_audit/verification-chapter-batch-contract-live/summary.json` 与 `live-export/`；trace 含 12 份请求 payload，runId `run-1794369711108-1`。
- API key 未写入源码、测试、经验或封装证据；只在烟测 shell 环境临时传递。

## 7. 缺口清单与缺陷面枚举

缺口清单：本轮无登记缺口。SKILL 侧 l4-s2/l4-s3 协议优先级区块已转达，不归应用实现；heartbeat 指数膨胀为独立问题，本轮未修。

| 枚举面 | 写入/读取点 | 处置 |
|---|---|---|
| 章节正常批量 JSON 指令 | `chapterBatchOrchestrator.ts` normal branch → `PipelinePanel.vue` genChapters | 已按 `outputProtocol` 条件替换边界声明 |
| 章节补充/修复 JSON 指令 | `chapterBatchOrchestrator.ts` repair branch | 已透传 `outputProtocol`，测试覆盖 |
| folder 判定入口 | `PipelinePanel.vue` getStepSkillTemplates(3) | 显式 `format==='folder' && folderPath`；无 folder SKILL 走 direct-json |
| 卷纲 sibling | `volumeBatchOrchestrator.ts` 既有边界机制 | 对账无同款漏点；不重复改动 |
| 旧协议字符串残留 | 12 份 live request payload + 全仓 grep | live `forbiddenCount=0`；无新增旧语义 |
| 验证器 schema 锚点 | `verify-chapter-batch-contract-electron.mjs` | v19 已迁移 v23，离线脚本复验通过 |
| 运行产物归属 | `summary.json` 与 live-export trace | 同一 runId/时间线；未用旧失败 trace 冒充 |
| 独立遗留面 | heartbeat 重试间隔、SKILL 模板协议声明 | 显式豁免，不并入本章闭环 |
