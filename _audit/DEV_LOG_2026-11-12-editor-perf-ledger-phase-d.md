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

# 2026-11-12 编辑器交互残留 V1 Phase E/F 与 3.127.0 交付

- 文件：[_audit/DEV_LOG_2026-11-12-editor-perf-ledger-phase-d.md](_audit/DEV_LOG_2026-11-12-editor-perf-ledger-phase-d.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-12_EDITOR_PERF_RESIDUAL_V1.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-12_EDITOR_PERF_RESIDUAL_V1.md)
- 方案：[_audit/PROPOSAL_2026-11-12_EDITOR_PERF_RESIDUAL_V1.md](_audit/PROPOSAL_2026-11-12_EDITOR_PERF_RESIDUAL_V1.md)
- 交付：首页消息列表在 300 条以上启用虚拟滚动并保留非密集回退；非流式 Markdown 渲染立即落定、流式结束后 flush；统一大纲保存反馈定时器；删除大纲流恢复 5 秒轮询，改为真实传输错误事件触发；补密集列表挂载与虚拟化切换后的回底。
- 行为边界：只删轮询与重复定时器、合并常驻反馈管理、按阈值做渲染路径分流；不新增调度器、预算系统、常驻 worker 或第二套 UI；不改生成流水线与 folder SKILL。
- 账本对照：`home-message-panel-density` 500 条会话仅渲染 13 个 `.chat-message` 节点且 longTasks=0；密集会话输入路径复跑 0 个 >50ms 长任务；大纲输入与查找面板各保留 1 个 54/58ms GC/runtime 抖动样本，热点不在本轮改动，继续按 G1.19 观测。
- 验证：真实 Electron 账本 7 路径全部产出；真实 Electron 冒烟确认密集列表虚拟化、底部锚定与消息落账；`npm run type-check` exit 0；`npm run test:services` 251 files / 2739 tests passed；`npm run build:vue` exit 0。
- 交付封装：3.127.0 NSIS 构建通过；`dist/神意助手-Setup-3.127.0.exe` 231,668,979 bytes，SHA256 `d3a1f939fc4d104140ff35569ebc5e98f97eecfb5f78cc0e0132305b01972aea`；`verify:packaging` PASSED，rendererFiles=87、electronAPI methods=94。
- 冒烟边界：测试 profile 未配置供应商时，“生成中…”提示在 preparing→idle 一帧内结束，因此测试探针不把该瞬态作为硬断言；消息唯一落账、虚拟化数量与底部锚定仍为硬断言。
