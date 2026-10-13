# 2026-10-14 P1-D 写后硬信号 Stop 网收口

## 目标

按 [_audit/PROPOSAL_2026-10-13_OH_STORY_ADOPTED_UPGRADE_PLAN.md](_audit/PROPOSAL_2026-10-13_OH_STORY_ADOPTED_UPGRADE_PLAN.md) 落地 P1-D：正文产物不再依赖 DEAI 调用时机兜底，回合落盘后必扫截断、拒绝语、工程词、紧邻复读四类硬信号；本地信号一次定点修复并复扫到净，供应商截断绝不本地伪修复，两次不净进入明确终态。

## 交付内容

- 新增 [src/services/proseHardSignalNet.ts](../src/services/proseHardSignalNet.ts)：`truncated` / `refusal` / `meta_language` / `near_duplicate_line` 结构化 findings，含位置、excerpt、counts；对话内引用豁免；每个 pattern 单次匹配并做同类型重叠去重。
- 新增 [src/services/proseHardSignalRepair.ts](../src/services/proseHardSignalRepair.ts)：只携带命中段落窗口的定点修复 prompt；完整性门禁防止修复器丢段；应用窗口后复扫。
- [src/components/pipeline/PipelinePanel.vue](../src/components/pipeline/PipelinePanel.vue)：正文落盘后执行扫描并写 `hard_signal_scan` runTrace 事件；本地命中进入一次修复 + 复扫；provider `finish_reason` 信号短路本地修复；两次不净标记 `hard_signal_unresolved`，run 终态进入 `degraded`。
- [src/services/pipelineRunOutcome.ts](../src/services/pipelineRunOutcome.ts)：`hard_signal_unresolved` 参与降级终态，不伪装成功。
- 新增 [scripts/verify-hard-signal-stop-net-electron.mjs](../scripts/verify-hard-signal-stop-net-electron.mjs)：可见 Electron + 本地 OpenAI-compatible provider，覆盖 clean / repair / provider truncation 三 Case。

## 关键修复过程

- 首轮审计发现 `pushRegexFinding` 的正则无 `g` 标志时 `exec` 每次从头部返回同一匹配，原 `while` 结构靠 findings 堆满 200 条才停止。修复为每个 pattern 只取首个匹配并按同类型区间重叠去重，`src/services/proseHardSignalNet.ts:72`。
- 复扫事件原先只写 `before/after/repairedType`，runTrace 无法回答“复扫到底检测到什么、状态是什么”。已补 `detected/status/counts/findings`，`src/components/pipeline/PipelinePanel.vue:4649`。
- `latestBodyFinishReason` 原来只读 `status === 'success'` 的正文调用，但 provider 截断被分类为 `degraded`，导致截断证据被丢弃。已改为 success + degraded 双状态读取，`src/components/pipeline/PipelinePanel.vue:1264`。
- 验证器旧假设同步清理：provider 截断 Case 的 scan event 断言从 `>=3` 修正为真实协议下的 `>=2`，`src/services/proseHardSignalWiring.spec.ts` 与 Electron 脚本同步更新。

## 验证

- 专项：`npm run test:services -- proseHardSignalNet proseHardSignalRepair proseHardSignalWiring pipelineRunOutcome` → 4 files / 33 tests passed。
- `npm run build:vue`：exit 0。
- `node scripts/verify-hard-signal-stop-net-electron.mjs`：`===== HARD SIGNAL STOP NET ELECTRON PASSED =====`，证据见 [_audit/verification-hard-signal-stop-net-electron/report.json](_audit/verification-hard-signal-stop-net-electron/report.json)。
  - `clean_body_passes_without_repair`：success，1 scan event，1 request，净正文不触发修复。
  - `polluted_body_repairs_once_and_rescans_clean`：success，2 scan events，2 requests，定点修复拒绝句后复扫到净。
  - `provider_truncation_never_locally_repaired`：degraded，2 scan events，1 request，provider 截断正确降级，不做本地伪修复。

Electron 验证使用可见窗口与真实应用运行链路；本地 provider 只替代外部供应商网络，不注入 DOM 冒充用户操作。

## 诚实边界

- `_audit/verification-hard-signal-stop-net-electron/persisted-bodies.json` 的导出 body 为空字符串；`report.json` 的正文断言通过，业务正文真实持久化，问题在验证器快照键位不匹配。已登记为验证器修正项，不阻塞本阶段验收。
- 四类信号的阈值基于当前样本与专项测试；真实长期项目分布需持续采样，不允许为通过测试直接放宽。
- Stop 网目前覆盖正文产物；卷纲与设定产物是否复用同一网，待 P1-E 后统一评估。

## 清理

- 已删除 `_data/hard-signal-stop-net-profile` 一次性 Electron profile。
- 保留验证脚本、`report.json`、截图、provider 请求与 heartbeat 作为可复跑与不可再生证据。

## 台账

- 七节台账：[_audit/TASK_LEDGERS/2026-10-14_p1d-hard-signal-stop-net.md](_audit/TASK_LEDGERS/2026-10-14_p1d-hard-signal-stop-net.md)

## 封装

- 版本：3.85.0。
- `npm run test:services`：157 files / 1865 tests all passed。
- `npm run type-check`：exit 0。
- `npm run build`：exit 0；NSIS 产物 `dist/神意助手-Setup-3.85.0.exe`，231,527,924 bytes，SHA256 `78F001CD8B8EC367C4DFE13C69F54FCF79B2263EBB867330D383AE7D2E689813`。
- asar 校验：`version=3.85.0`、`name=shenyi-assistant`、`main=electron/main.js`、renderer 74 个文件且包含 `dist-renderer/index.html`。
- 已清理 3.84.0 旧安装包与 blockmap；`_data/hard-signal-stop-net-profile` 一次性验证 profile 已删除；`dist` 仅保留 3.85.0 当前产物。
