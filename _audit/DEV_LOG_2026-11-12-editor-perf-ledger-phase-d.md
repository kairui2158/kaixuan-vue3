# 2026-11-12 编辑器性能账本 Phase D 首源收敛

- 文件：[_audit/DEV_LOG_2026-11-12-editor-perf-ledger-phase-d.md](_audit/DEV_LOG_2026-11-12-editor-perf-ledger-phase-d.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-12_EDITOR_PERF_RESIDUAL_V1.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-12_EDITOR_PERF_RESIDUAL_V1.md)
- 方案：[_audit/PROPOSAL_2026-11-12_EDITOR_PERF_RESIDUAL_V1.md](_audit/PROPOSAL_2026-11-12_EDITOR_PERF_RESIDUAL_V1.md)
- 账本：[_audit/EDITOR_PERF_LEDGER_2026-11-12/ledger.json](_audit/EDITOR_PERF_LEDGER_2026-11-12/ledger.json)
- 交付：Phase A 建立 7 条真实 Electron CPU/长任务账本；Phase D 按账本首源收敛 Home `updateContent` 每键全文双哈希，并删除 `ChatPanel` 每键全文拷贝到 `currentContext.content` 的零读取死链。
- 行为边界：编辑内容变更、脏标记、书签哈希失效、撤销时间线、AI 批次回滚与会话上下文读取语义保持不变；无书签页签不再为脏判定全文哈希。
- 账本对照：Phase A Home 100k 首个可归因热源 `hashEditorContent` 为 52 samples；Phase D after 账本中 `hashEditorContent` 0 samples，所有路径 >50ms 长任务为 0。剩余 `_s` 45 samples、`gs` 11 samples 未达独立优化阈值，登记为观测项。
- 验证：Phase A 采集脚本与 after 账本通过；`npm run type-check`、`npm run test:services`、`npm run build:vue` 收口复跑结果见台账执行证据。
- 边界：不改大纲编辑器热链、首页 UI 结构、会话持久化与项目自动保存；Phase B/C/E/F 继续按账本补充证据后裁决，不凭剩余热点猜测加闸。
