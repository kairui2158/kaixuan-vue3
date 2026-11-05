# TASK_LEDGER 2026-11-06 正文层断点状态机 V2

## 1. 目标与原话

- 用户原话：「确认，严格验证经验文件基准来执行」。
- 原始目标：修复正文层断点恢复时 `bodyGeneratorStepIndex` 清空后无回填导致的 `generator_not_identified` 死锁；S3 直跑恢复增加产物前置守卫；状态机泄漏清理；wiring 测试升级语义测试。
- 最终可感知行为：S2 失败后的断点重试能从 S3 直跑并正常裁决，不再出现中间全成功但 run 判 `generator_not_identified` 失败且产物丢弃。
- 本轮交付物：PipelinePanel/chainExecution 修复、语义测试、经验文件门禁升级、DEV_LOG、版本封装。

## 2. 门禁读证

- G0.1 目标对齐（经验文件:20-26）：本轮全部改动对准断点恢复死锁这一可感知行为。
- G0.3 诚实闭环（经验文件:36-42）：完成声明区分已验证/未验证，测试原始输出为准。
- G0.5 回头看（经验文件:52-58）：收尾前逐项对账台账。
- G0.6 方案成熟度（经验文件:60-66）：P0/P1 成熟，P2 前置条件后转成熟，已在方案中声明。
- G0.9 影响圈声明（经验文件:84-90）：PipelinePanel.vue、chainExecution.ts、chainExecution 测试、ownerBreakpointClosureWiring.spec.ts、pipelinePerRunUiState.ts（只读确认）、经验文件、DEV_LOG。
- G0.10 新旧并存清零（经验文件:92-104）：wiring 测试 `toContain('const generatorStep = resolveBodyGeneratorStepIndex()')`（spec:47）同批替换为语义断言 + 负向断言旧清空形态。
- G0.12 门禁执行台账（经验文件:114-130）：本文件即台账，七节齐全后才能进入完成声明。
- G0.13 最小必要性（经验文件:132-140）：无新增状态源、无信封类、无 SKILL 越界。
- G1.3 全局层统一（经验文件:174）：6424 清空点改用与 4448/6386 相同的 `resolveBodyGeneratorStepIndex()` 单源。
- G1.5 验证器自身质量（经验文件:190-212）：新测试先红灯验证再接绿灯。
- G1.9 状态机与终态收敛（经验文件:252-260）：hardSignalUnresolvedRuns 终态 delete，活动状态清空。
- G1.11 测试契约（经验文件:272-278）：旧断言同批迁移，禁止只测成功路径。
- G1.27 链步暂存状态与导入闭包（经验文件:460-472）：清理前列出写入者/读取者；删除死代码后跑 type-check。
- G2.9 终稿与流水线（经验文件:542-562）：唯一生成步识别显式区分 null/0；断点按 owner 隔离。
- G1.8 日志与观测同步（经验文件:232-250）：新增恢复事件同步 runTrace 白名单。

## 3. 路由判定

- 加入：G0.1/G0.3/G0.5/G0.6/G0.9/G0.10/G0.12/G0.13/G1.3/G1.5/G1.8/G1.9/G1.11/G1.27/G2.9。
- 排除：G0.2（用户未触发无预算铁律，本轮按目标完成度执行）；G1.10（无权限/写入工具改动）；G1.13（已因 Electron 回归执行并激活）；G2.11/G2.12/G2.14（无供应商、窗口进程、存储迁移改动面）。
- G1.6/G1.7：如涉及 mock/构建产物验证时激活，测试层先确认夹具与真实 store 形状对账。

## 4. 影响圈与作者反证

- 打算改：PipelinePanel.vue（6424 回填、resume 守卫、终态 delete、死代码删除）、chainExecution.ts（函数搬迁）、chainExecution 单测、ownerBreakpointClosureWiring.spec.ts（语义替换）、runTrace 白名单、经验文件、DEV_LOG。
- 可能碰到：compose 单技能路径（5416 置 0 逻辑不得破坏）、2 步链显式报错路径（6457 保持）、deaiSkillReport UI 读取面（1542/1547/1555/6690）。
- 作者最可能错的假设及证伪方式：
  - 假设 compose 路径不经过 callBodyApi 的 6424 清空。证伪：读 generateBodyArtifact 编排器确认 compose 分支调用链。
  - 假设断点 stepOutputs 中 S2 metadata 非空。证伪：读 5345-5360 保存点与 normalizeStepOutputs。
  - 假设 hardSignalUnresolvedRuns 终态 delete 不影响 UI 展示语义。证伪：读 2037/6604 消费上下文。

## 5. 停止条件

- 机器可判定完成：新语义测试先红后绿；定向 + 全量 vitest 退出码 0；type-check 退出码 0；负向断言确认旧清空形态在源码命中 0。
- 机器可判定失败：任一测试红灯无法归因；type-check 报错；负向断言发现旧语义残留。

## 6. 执行证据

### 6.1 源码单源与清点

- `src/components/pipeline/PipelinePanel.vue:6407-6413`：before 旧清空点删除 `acceptanceState.bodyGeneratorStepIndex = null`；after 在 attempt 开始调用 `resolveAttemptStartGeneratorIndex(...)`，并发射 `body-generator-step-resume-restored`。
- `src/services/chainExecution.ts:445-490`：新增导出 `resolveBodyGeneratorStepIndex` 与 `resolveAttemptStartGeneratorIndex`，三入口（4444 账本恢复、6367 执行包、6409 attempt 起点）统一单源。
- `src/components/pipeline/PipelinePanel.vue:6750`：run 终态 finally 删除 `hardSignalUnresolvedRuns.delete(trace.runId!)`；before 无终态清理。
- `src/stores/runTrace.ts:1025`：`body-generator-step-resume-restored` 已进入 trace 白名单。
- 旧形态负向清点：`rg -n "acceptanceState\.bodyGeneratorStepIndex = null" src` 命中 0；`resetPerRunUi` 现役命中 0。

### 6.2 定向与全量回归

- 定向：`npx vitest run src/services/chainExecution.spec.ts src/services/ownerBreakpointClosureWiring.spec.ts src/services/finalStepMetadataWiring.spec.ts src/services/runTraceExportService.spec.ts` → exit 0，173/173 passed。
- 全量：`npx vitest run --reporter=dot` → exit 0，`Test Files 247 passed (247)`，`Tests 2665 passed (2665)`。
- 类型检查：`npx vue-tsc --noEmit` → exit 0。
- 构建：`npm run build:vue` → exit 0，renderer 与 protocols 双构建完成。

### 6.3 Electron 回归

- 命令：`node scripts/verify-owner-breakpoint-closure-electron.mjs` → exit 0。
- 终局输出：`===== OWNER BREAKPOINT CLOSURE ELECTRON PASSED =====`。
- 报告：`_audit/verification-owner-breakpoint-closure-electron/report.json` 记录 runId `run-1793917241497-1`、status `success`、requestCount 5、targetedRequestCount 2、`completedCheckpointRejected=true`、`targetedGeneratorStep=true`、`persistedS1ArtifactReused=true`。
- attempt 账本：attempt 0 `too_short/4/requestCount 3`；attempt 1 `complete/2600/targeted/requestCount 2`。
- trace 事件：`body-generator-step-resume-restored` detail 为 `{"index":1,"source":"fallback","chainTotalSteps":3}`；`chain-completed-checkpoint-rejected` detail 记录 ownerKey 与 reason `completed_chain_checkpoint`。
- 心跳：`heartbeat.jsonl` 三帧连续，报告 heartbeatDurationMs 2631。
- 导出证据 SHA256：provider `C4E5D3927732FE1693E548C6012B9737214E9E74B20B7322A9834B9D5BDFD2D8`；report `6D56228ADC588CA6FF2D678295056EC72342275AD7DDC47FD9A9065F60D765C1`；trace `AE5AD297F144C60933EAF2BA40041CB25A166BB9A1F7166EE8DD2041DADEA395`。

### 6.4 封装

- 版本：`package.json:4` 为 `3.114.3`。
- 构建：`npm run build` → exit 0；NSIS 产物生成。
- 封装验证：`npm run verify:packaging` → exit 0，输出 `===== PACKAGING 3.114.3 VERIFICATION PASSED =====`。
- 安装包：`dist\神意助手-Setup-3.114.3.exe`，大小 `231666652` 字节，SHA256 `2923a6a185f14025ae39be40d55a753019f6ff21a158101e9a217091624aea96`。
- 封装证据：`_audit/verification-packaging-3.114.3/packaging-evidence.json` 记录 `verdict: pass`、`rendererFileCount: 87`、`electronApiKeyCount: 94`、`deaiContractValidationPackaged: true`。
- 产物清理：`dist/神意助手-Setup-3.114.2.exe`、`.blockmap`、`builder-debug.yml`、`latest.yml` 已移入 `_audit/retired-installers/`；dist 仅保留 `3.114.3` 一套产物。
- 清理边界：`dist/神意助手-Setup-3.110.6.exe` 文件系统层拒绝读/写/删/复制（icacls/open/copy 均报 `Access is denied`），历史会话 2026-10-28 构建当日即存在同样现象，非本轮引入。待用户手动删除或重启后清理。

## 7. 缺口清单

### 当前登记

- 真实外部供应商正文链路本轮未重复调用；Electron 回归使用内置 mock 供应商，验证断点状态机与产物守卫，不声明真实供应商内容质量。
- 导出 trace 在 PowerShell 控制台查看存在 GBK 显示失真；UTF-8 字节内容、JSON 结构、Electron 回归断言与哈希均正常。此为控制台编码观测边界，不登记为应用缺陷。

### 结论

- 本轮无登记缺口。
