# 2026-10-11 章节层批次契约与历史标题台账

## 功能说明

章节层批次生成从“只数 collected.length、空结果才重试”升级为应用层显式契约：

1. 每批声明期望区间与章数，输出数量必须等于声明数量，短产自动发起补生成缺失区间。
2. 补生成仍无法补齐时返回 incomplete，保存 `batch-incomplete` 断点并失败收口，不落半批数据。
3. 每批注入全量 `[已生成章节标题清单]` 与 `[上一章事实]`，由应用单源提供，消除 S2 虚构历史空间。
4. 全量完成后执行章节总账校验：区间从 1 连续、无重叠、覆盖到总章数。
5. runTrace schemaVersion 升至 16，新增 `chapter-batch-attempt` 与 `chapter-batch-validated` 事件。

SKILL 职责不变：仍只提供领域能力；批次完成语义由应用契约判定，不由 postProcess warning/blocking 决定。

## 验证矩阵

- 专项单测：3 files / 105 tests passed（契约、编排器、runTrace）。
- 全量服务测试：140 files / 1697 tests passed。
- 类型检查：`npm run type-check` 通过。
- 构建：`npm run build:vue` 通过（仅既有 Vite chunk/config warning）。
- 事故回放：27MB 真实运行记录，B5 短产处 `REJECTED (1 short batch at stop point)`，证明新契约能拦住本次事故。
- Electron live：成功轮 `run-1791703645571-1` 曾通过 12 章、3 批、12 次 API success，脚本输出 `===== CHAPTER BATCH CONTRACT ELECTRON LIVE PASSED =====`；第 2、3 批 payload 曾验证包含真实历史标题清单。按用户批准，本轮不因成本/时间重跑 live。

## live 证据口径

- 成功轮 payload 原件因清理策略未留存；summary.json 亦被后续验证轮清理覆盖，未留存。DEV_LOG 与任务台账均按“单测 + 回放 + 成功轮 summary 口径”登记，不冒充实物证据。
- 中断轮现场保留：`_audit/verification-chapter-batch-contract-live/electron-run.log`、`heartbeat.jsonl`。runId `run-1791709689856-1`，1 个批次验收通过，停在第 3/4 批，最后心跳 09:30:20Z 仍 running。该现场只证明中断轮状态，不代表成功轮结果。
- 脚本超时与现场保留能力：STEP/GLOBAL/HEARTBEAT/STALLED/DEAD 均可用 `SHENYI_CHAPTER_CONTRACT_*` 环境变量覆盖；`SHENYI_CHAPTER_CONTRACT_KEEP_PROFILE=1` 保留 profile，避免清理策略再次吞掉证据。
- 收尾补修：脚本不再无条件删除证据目录。每次启动先把旧证据归档到 `verification-chapter-batch-contract-live-archive/<timestamp>`，当前运行无论成败都保留现场；仅 profile 与导出目录按 KEEP_PROFILE 清理。`node --check` 复验通过。

## 遗留项

1. S4 JSON 不含章节序号，应用只能保证数量与区间原子性；中段缺章不可检测，需 SKILL 协议增加序号后才可闭环。
2. 真实供应商无法稳定强制短产；短产修复路径由单测与回放验证，不用造假请求冒充。
3. 如后续需要 payload 实物证据，需重新执行 Electron live 并启用 KEEP_PROFILE 与证据归档。

## 经验文件回写

`_audit/神意开发经验总结_v7.md`（规则文件，当前版本）升级至 v8.6：G1.5 新增验证器证据生命周期契约，要求证据目录与临时运行态分离，启动前归档旧现场，运行成败均保留当前现场；清理策略不得触碰不可再生证据。旧编号去向：无编号变化，本条并入 G1.5，不新增特殊优先级条目。来源为本轮 payload 原件丢失事故与 2026-10-11 收尾补修。
