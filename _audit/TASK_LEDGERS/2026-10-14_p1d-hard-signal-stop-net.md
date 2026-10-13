# 任务台账：P1-D 写后硬信号 Stop 网

## 1. 目标与原话

- 用户指令：“确认执行下一个阶段”；方案阶段为 `PROPOSAL_2026-10-13_OH_STORY_ADOPTED_UPGRADE_PLAN.md` 的 P1-D。
- 目标行为：正文产物落盘回合结束后必扫四类硬信号（截断、拒绝语、工程词、紧邻复读）；命中的本地信号只允许一次定点修复加复扫；供应商截断不允许本地伪修复；两次仍不净时进入明确 `hard_signal_unresolved` 终态。
- 交付物：`proseHardSignalNet` 扫描器、`proseHardSignalRepair` 定点修复器、PipelinePanel 接线、runTrace `hard_signal_scan` 事件、专项单测、Electron 三 Case 验证器与证据、DEV_LOG、本台账、3.85.0 版本封装。

## 2. 门禁读证

- G0.1 目标对齐：实现覆盖方案 6.1/6.2 的四类信号、回合末必扫、只报告不改写、一次定点修复、两次不净终态、SKILL 无关兜底。
- G0.3 诚实闭环：保留验证过程中暴露的三个生产缺陷和验证器旧假设修正，不伪装成一次通过。
- G0.4 经验复读：沿用“验证器自身也是被测对象”“旧假设必须清干净”经验，把 unresolved 事件数断言从 `>=3` 修正为真实协议下的 `>=2`。
- G0.5 回头看：Electron 通过后回头检查扫描器、复扫事件、finish reason 三条链路，才抓出正则死循环、复扫事件缺结构化字段、`degraded` 调用被过滤三个缺陷。
- G0.6 成熟度：扫描、修复、终态、观测、Electron 实测为“成熟”；`persisted-bodies` 快照键位不匹配为登记观察项。
- G0.11 真实交互：可见 Electron 窗口、真实 UI 运行链路、本地 HTTP provider 三 Case；不用注入冒充用户。
- G0.12 七节台账：本文件。

## 3. 路由判定

- 加入：G0.1、G0.3、G0.4、G0.5、G0.6、G0.11、G0.12；实现阶段使用 G1.1-G1.7。
- 排除 G0.2：用户已明确无预算模式，未创建 goal，未设置 token 预算。
- 排除 G1.19：本阶段验收是硬信号拦截与终态正确性，性能收益由 runTrace 请求数与修复请求数间接证明，另立账本。

## 4. 影响圈与作者反证

- 已改面：正文扫描、定点修复请求、复扫事件、`latestBodyFinishReason`、run 终态标记、专项测试、Electron 验证器。
- 可能被误伤面：正常对话引用工程词、正文中有意重复句式、provider 截断、修复返回不完整窗口。反证方式分别是 `isInsideDialogue`、紧邻整行复读阈值、provider 信号短路本地修复、`passesHardSignalRepairIntegrity`。
- 最容易错的假设：“扫描器循环只影响性能”。反证证据是无 `g` 标志的 `exec` 在 `while` 中反复返回同一匹配，靠 findings 堆满 200 才停止，属于结果失真而不只是慢。

## 5. 停止条件

- 完成：专项 4 files / 33 tests、`build:vue`、Electron 三 Case、全量回归、type-check、NSIS build、版本 3.85.0、证据与台账收口、临时 profile 清理。
- 失败：任一命令 exit 非 0；本地拒绝句未被修复；provider 截断被本地修复掩盖；复扫事件缺结构化字段；unresolved 未进入明确终态。

## 6. 执行证据

- 扫描器与单次匹配：`src/services/proseHardSignalNet.ts:72`。
- 对话内引用豁免：`src/services/proseHardSignalNet.ts:102`。
- 紧邻复读检测：`src/services/proseHardSignalNet.ts:109`。
- finish reason 过滤修复：`src/components/pipeline/PipelinePanel.vue:1264`。
- 定点修复与复扫完整事件：`src/components/pipeline/PipelinePanel.vue:4573`、`src/components/pipeline/PipelinePanel.vue:4649`。
- 两次不净终态：`src/components/pipeline/PipelinePanel.vue:4692`、`src/components/pipeline/PipelinePanel.vue:4708`。
- 专项测试：`src/services/proseHardSignalNet.spec.ts:1`、`src/services/proseHardSignalRepair.spec.ts:1`、`src/services/proseHardSignalWiring.spec.ts:1`、`src/services/pipelineRunOutcome.spec.ts:1`。
- Electron 证据：`_audit/verification-hard-signal-stop-net-electron/report.json:1`；`clean_body_passes_without_repair` 为 success / 1 scan / 1 request；`polluted_body_repairs_once_and_rescans_clean` 为 success / 2 scans / 2 requests；`provider_truncation_never_locally_repaired` 为 degraded / 2 scans / 1 request。
- 关键命令：`node scripts/verify-hard-signal-stop-net-electron.mjs` → `===== HARD SIGNAL STOP NET ELECTRON PASSED =====`。

## 7. 缺口清单

- `_audit/verification-hard-signal-stop-net-electron/persisted-bodies.json` 的导出快照 body 为空字符串；`report.json` 的正文断言已通过，说明业务正文真实持久化，问题定位为验证器快照键位不匹配。不影响本阶段验收，登记为验证器后续修正项。
- 四类样本目前覆盖专项单测与 Electron 三 Case；真实长期项目的误报/漏报分布仍需持续采样，不允许直接放宽阈值。
- Stop 网只覆盖正文落盘产物；卷纲/设定产物是否接入同类硬信号网，留给 P1-E 后统一评估。

## 8. 封装证据

- 版本：`package.json:3`、`package-lock.json:3`、`package-lock.json:9` 均为 3.85.0。
- `npm run build`：exit 0；产物 `dist/神意助手-Setup-3.85.0.exe`，231,527,924 bytes，SHA256 `78F001CD8B8EC367C4DFE13C69F54FCF79B2263EBB867330D383AE7D2E689813`。
- asar：`version=3.85.0`，`name=shenyi-assistant`，`main=electron/main.js`，renderer 74 files，含 `dist-renderer/index.html`。
- 旧 3.84.0 安装包与 blockmap 已删除；`_data/hard-signal-stop-net-profile` 已删除。

## 9. 最终工作区口径

- 源码、测试、验证脚本、`_audit` 证据与文档全部属于 P1-D。
- 本次一次性 Electron profile 已清理；保留验证脚本与证据目录供复跑和审计。
