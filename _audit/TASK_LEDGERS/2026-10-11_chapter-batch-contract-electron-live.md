# 2026-10-11 章节层批次契约 Electron live 验证任务台账

## 1. 目标与原话

用户原话：「这次因为供应商成本/时间不划算，就用单测 + 回放 + 那份 summary 作为证据，DEV_LOG 里如实登记“payload 原件因清理策略未留存”」。

最终可感知行为：章节层每批按显式契约验收，短产自动补生成缺失区间，补不齐即失败并保留断点；每批注入全量历史标题清单与上一章事实；runTrace 记录批次验收事件，schemaVersion 升至 16。

本轮交付物：

- `src/services/chapterGenerationContract.ts`：章节事实台账、批次契约校验、总账校验。
- `src/services/chapterBatchOrchestrator.ts`：短产补生成编排器，API 可注入、失败不落半批。
- `PipelinePanel.vue`：批次契约、历史上下文、失败断点与验收事件接线。
- `runTrace`：schema 15→16，新增 `chapter-batch-attempt` / `chapter-batch-validated` 事件。
- 事故回放验证器与 Electron live 验证脚本。

## 2. 门禁读证

读证文件：`_audit/神意开发经验总结_v8.md`（v8.4）。

- G0.1 目标对齐：方案、实现、验证、交付物均指向章节层批次契约。
- G0.3 诚实闭环：live 成功轮 payload 原件缺失，按用户批准口径登记为“未留存”，不冒充实物证据。
- G0.5 回头看：收尾前对账 diff、测试、回放、live 现场、清理与提交。
- G0.6 方案成熟度：方案经用户审核并批准执行。
- G0.8 收尾清理：清理 live profile、导出目录与临时分析脚本，保留中断轮现场证据。
- G0.9 影响圈声明：pipeline 组件、runTrace、两个新服务与对应测试。
- G0.10 新旧并存清零：旧“空结果才重试”循环已被契约编排器替换。
- G0.11 真实交互冒充禁令：live 脚本走真实 Electron UI，不注入业务状态；本轮不重跑 live。
- G0.12 门禁执行台账：本文档。
- G1.4 验证分层：单测、全量服务测试、type-check、事故回放、既有 live summary 分层登记。
- G1.8 日志与观测同步：新执行语义进入 runTrace。
- G1.9 状态机与终态收敛：complete / incomplete / batch-incomplete / failed-validation 显式收敛。
- G1.12 完整 commit：收尾后提交固化。

## 3. 路由判定

加入门禁：G0.1、G0.3、G0.5、G0.6、G0.8、G0.9、G0.10、G0.11、G0.12、G1.4、G1.8、G1.9、G1.12。

排除项及理由：

- G0.2 无预算铁律：用户已明确不设预算；本轮不设置 token/时间预算。
- SKILL 层整改门禁：本轮只修应用层执行语义，不改章节层 SKILL 模板与 postProcess。
- 重新封装门禁：版本保持 3.79.0，用户未要求新版本号。

## 4. 影响圈与作者反证

实际修改：

- `src/services/chapterGenerationContract.ts`
- `src/services/chapterBatchOrchestrator.ts`
- `src/components/pipeline/PipelinePanel.vue`
- `src/stores/runTrace.ts`
- 上述三组 spec 与两个验证脚本。

可能碰到但已反证未破坏：

- 旧断点恢复：恢复运行从当前数量继续建立新台账；旧断点不伪造旧区间事实。
- 供应商窗口：历史清单为标题与上一章概要，不注入全文；超窗交由现有上下文预算层显式处理。
- 旧 trace 导入：schemaVersion 只作为导出口径递增，旧 trace 导入兼容由既有 schema 测试覆盖。

最可能错的假设与证伪方式：

1. 假设模型会稳定输出完整批次。证伪：事故回放在 B5 短产处 REJECTED，证明契约确实拦截。
2. 假设补生成总能补齐。证伪：单测覆盖 3 次修复仍短产时 incomplete 且不落半批。
3. 假设历史注入会显著增加上下文。证伪：只注入标题与上一章概要，单测含 172 章规模样例。
4. 假设 trace 事件自然可导出。证伪：runTrace spec 断言生产、回填、导出均见 schemaVersion 16 与新事件。

## 5. 停止条件

完成条件（全部满足才可声明完成）：

1. 契约/编排器/Pipeline/runTrace 实现与测试落地。
2. 专项测试、全量服务测试、type-check、build:vue 本轮新鲜通过。
3. 事故回放在 B5 短产处 REJECTED，exit 1 属预期正确结果。
4. live 证据按用户批准口径登记：成功轮 summary + 中断轮现场，payload 原件如实写“未留存”。
5. proposal 更新为 EXECUTED / VERIFIED，DEV_LOG 与索引登记完成。
6. live profile、导出目录、临时分析脚本清理完成并复核不存在。
7. git diff 逐行自审后提交，工作区干净。

失败条件：

- 发现新旧并存、半批落盘、trace 事件不可导出任一情况时停止并修复。
- 发现文档把 summary 冒充 payload 原件时停止并纠正口径。

## 6. 执行证据

### 单测与构建

- `npx vitest run src/services/chapterGenerationContract.spec.ts src/services/chapterBatchOrchestrator.spec.ts src/stores/runTrace.spec.ts` → 3 files / 105 tests passed（2026-10-11 17:43）。
- `npm run test:services` → 140 files / 1697 tests passed（2026-10-11 17:44）。
- `npm run type-check` → exit 0（2026-10-11 17:45）。
- `npm run build:vue` → exit 0（2026-10-11 17:46，仅既有 Vite chunk/config warning）。
- 证据保留修复后复验：`node --check scripts/verify-chapter-batch-contract-electron.mjs` → exit 0。

### 事故回放

- `node scripts/verify-chapter-batch-contract-replay.mjs "C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-章节层-20261010-004549-deep/run-trace.json"` → B1-B4 PASS；B5 FAIL expected 21-24 (4), actual total 24；`RESULT: REJECTED (1 short batch at stop point)`；exit 1（2026-10-11 17:45）。exit 1 为预期正确结果。

### Electron live

- 成功轮：`run-1791703645571-1` 曾以 12 章、3 批、12 次 API success 通过，脚本输出 `===== CHAPTER BATCH CONTRACT ELECTRON LIVE PASSED =====`，summary 曾写入 `_audit/verification-chapter-batch-contract-live/summary.json`。该轮 payload 原件与 summary.json 已被后续验证轮清理覆盖，未留存。
- 中断轮现场：`_audit/verification-chapter-batch-contract-live/electron-run.log` 与 `heartbeat.jsonl`。runId `run-1791709689856-1`，17:08 启动，1 个批次验收通过，停在第 3/4 批，最后心跳 09:30:20Z 仍 running；该两份文件仅证明中断轮现场，不得冒充成功轮证据。
- 本轮未重跑 live：用户批准因供应商成本/时间不划算，以单测 + 回放 + 成功轮 summary 口径作为证据。
- 脚本当前超时默认：STEP 10 分钟、GLOBAL 2 小时、HEARTBEAT 10 秒、STALLED 3 分钟、DEAD 10 分钟；均可用 `SHENYI_CHAPTER_CONTRACT_*` 环境变量覆盖，`SHENYI_CHAPTER_CONTRACT_KEEP_PROFILE=1` 可保留 profile。
- 回头看修复：脚本原 `finally` 前会无条件 `removeDir(EVIDENCE_ROOT)`，导致证据目录被清理。已改为启动时先归档旧证据到时间戳目录，运行失败也不删除当前证据；profile 与导出目录仍按 KEEP_PROFILE 决定清理。

### 实现锚点

- 契约与台账：`src/services/chapterGenerationContract.ts:36`（历史事实）、`:51`（历史上下文渲染）、`:70`（批次校验）、`:107`（总账校验）。
- 批次编排：`src/services/chapterBatchOrchestrator.ts:81`（入口）、默认最多 3 次修复。
- Pipeline 接线：`src/components/pipeline/PipelinePanel.vue:3702`（历史上下文）、`:3714`（编排器）、`:3731`（batch-incomplete 断点）、`:3749`（验收事件）、`:3771`（总账校验）。
- runTrace：`src/stores/runTrace.ts:747` 附近 schemaVersion 16；`src/stores/runTrace.spec.ts:1636`、`:2123` 断言导出口径。

## 7. 缺口清单

登记边界 3 项：

1. S4 JSON 无章节序号，应用只能保证数量与区间原子性，中段缺章不可检测；要求加序号需改 SKILL 协议，超出本轮应用层边界。
2. 短产修复路径由单测与回放证明；真实供应商无法稳定强制短产，未做造假请求冒充。
3. live 成功轮 payload 原件因清理策略未留存，本轮按用户批准以 summary 口径登记；后续如需实物证据需重新跑 live。

观察项 1 项：中断轮从 1/4 推进到 3/4 后停滞，受当时超时策略与外部清理影响，未形成可复现根因结论；已放宽脚本超时与保留 profile 能力，供后续复测。
