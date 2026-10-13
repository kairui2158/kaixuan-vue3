# 2026-10-14 P1-E 卷契约语义扩充收口

## 目标

按 [_audit/PROPOSAL_2026-10-13_OH_STORY_ADOPTED_UPGRADE_PLAN.md](_audit/PROPOSAL_2026-10-13_OH_STORY_ADOPTED_UPGRADE_PLAN.md) 落地 P1-E：卷契约从“数量、字段、重复校验”扩展为“剧情承诺与禁区语义”，并让生成、闭包、正文执行、审查四侧消费同一契约对象。契约审查只报告不阻塞，不引入 ask_author、预览或任何等待确认状态。

## 交付内容

- [src/services/volumeGenerationContract.ts](../src/services/volumeGenerationContract.ts)：新增 `VolumeContractSemantics` 五字段（`readerExpectations` / `mainPlotLine` / `unlockMilestone` / `forbiddenFinalCards` / `contractRisk`），提供 `extractVolumeContractSemantics`、语义校验与 `[待补充]` 占位；非法风险枚举按契约错误处理，不静默归为安全。
- [src/services/volumeBatchOrchestrator.ts](../src/services/volumeBatchOrchestrator.ts)：三处卷生成 prompt 统一接入 `VOLUME_OUTPUT_PROTOCOL`，要求模型输出 9 字段并为 `contractRisk` 提供合法枚举。
- [src/services/outlineContextScope.ts](../src/services/outlineContextScope.ts)：闭包输入/输出新增 `contractForbiddenFinalCards`；`mergeForbiddenCards` 合并契约禁区与闭包内“禁止提前释放/不得提前揭示”声明行，统一供给正文执行。
- [src/services/chapterExecutionPackage.ts](../src/services/chapterExecutionPackage.ts)：执行包渲染 `[禁止提前释放]` 块，终局底牌不再散落提示词。
- [src/services/contractReview.ts](../src/services/contractReview.ts)：新增确定性三态审查 `safe / needs_reinforcement / broken`；显式揭示词（揭晓、揭示、公开、就是、真相是）命中禁区卡后 80 字窗口即判 `contract_broken`。
- [src/components/pipeline/PipelinePanel.vue](../src/components/pipeline/PipelinePanel.vue)：两处卷写入路径提取语义字段；`genBody` 闭包携带禁区；`runProseHardSignalNet` 后、持久化前写入 `contract_review` trace 事件，只报告不改写。
- 新增 [scripts/verify-contract-semantics-electron.mjs](../scripts/verify-contract-semantics-electron.mjs)：可见 Electron + 本地 OpenAI-compatible provider + 真实 UI 点击链路，覆盖正常推进与提前揭示两个 Case。

## 关键修复过程

- wiring 测试第一版用 `indexOf` 断言两处卷写入都调用 `extractVolumeContractSemantics`，但 `indexOf` 只能证明首个匹配存在，第二处缺失时仍会假绿。已改为全局正则计数 `match(/\.\.\.extractVolumeContractSemantics\(v\)/g)`，`src/services/contractSemanticsWiring.spec.ts:8`。
- 契约审查没有沿用模型自评：`contractRisk` 只作为生成侧输入与产物字段，正文落盘后的最终判定由本地确定性审查完成，避免“模型说安全就安全”。
- 审查事件放在持久化前但状态不阻塞：`contract_broken` 只提升 trace level 与报告结构化 findings，运行仍按原文与硬信号网终态收口，避免重新引入预览状态机。

## 验证

- 专项：`npm run test:services -- contractSemanticsWiring contractReview volumeGenerationContract outlineContextScope chapterExecutionPackage volumeBatchOrchestrator` → 6 files / 65 tests passed。
- 全量：`npm run test:services` → 159 files / 1882 tests all passed。
- `npm run type-check` → exit 0。
- `npm run build` → exit 0；NSIS 产物 `dist/神意助手-Setup-3.86.0.exe`，231,529,296 bytes。
- `node scripts/verify-packaging-3-86-0.mjs` → `===== PACKAGING 3.86.0 VERIFICATION PASSED =====`；asar `version=3.86.0`、`name=shenyi-assistant`、`main=electron/main.js`、renderer 74 files、`electronAPI` 77 methods、真实启动渲染通过；SHA256 `aa4427b9c78ebbebea0afc2ebc662565ac5140efdc3f4844470604ed4acf7519`。证据：[_audit/verification-packaging-3-86-0/packaging-evidence.json](_audit/verification-packaging-3-86-0/packaging-evidence.json)。
- Electron 级真实 UI 验证：`node scripts/verify-contract-semantics-electron.mjs` → `===== CONTRACT SEMANTICS ELECTRON PASSED =====`。
  - `normal_progression_does_not_flag_contract`：runId `run-1791932293832-1`，success，`contract_safe`，1 request，不误报。
  - `early_reveal_is_reported_without_blocking`：runId `run-1791932305364-1`，success，`contract_broken`，1 request，报告但不阻塞、不额外发请求。
  - 证据：[_audit/verification-contract-semantics-electron/report.json](_audit/verification-contract-semantics-electron/report.json)。

Electron 验证复用 P1-D 的可见窗口 + 本地 HTTP provider + 真实 UI 点击脚手架；provider 只替代外部供应商网络，seed 卷显式携带 `forbiddenFinalCards: ['灯芯就是旧灯塔的活体心脏']`，不用注入冒充用户操作。

## 诚实边界

- 揭示词表（揭晓 / 揭示 / 公开 / 就是 / 真相是）与 80 字窗口为首版采样；真实项目中的暗示式剧透仍可能漏报，需要持续采样新词与窗口，不允许为了绿灯直接放宽。
- 本轮 Electron 使用本地 provider，不是外部 live 供应商；契约审查本身是本地确定性逻辑，供应商差异主要影响生成侧字段质量，不影响审查判定。
- prompt 证据使用 `_audit/verification-contract-semantics-electron` 内的 prompt txt，未另存截图；P1-D 的截图证据链可追溯同一验证脚手架。
- 生成质量收益未做人工评分对账，标注“未验证”；已验证的是契约字段进入生成协议、禁区进入正文 prompt、提前揭示被报告、正常推进不误报。

## 清理

- 已删除 3.85.0 安装包与 blockmap；`_data/contract-semantics-profile` 一次性 Electron profile 已删除（`Test-Path` 为 False）。
- `dist` 仅保留 3.86.0 当前产物；验证脚本与证据目录保留供复跑和审计。

## 台账

- 七节台账：[_audit/TASK_LEDGERS/2026-10-14_p1e-contract-semantics.md](_audit/TASK_LEDGERS/2026-10-14_p1e-contract-semantics.md)

## 封装

- 版本：3.86.0；`package.json:3`、`package-lock.json:3`、`package-lock.json:9` 均为 3.86.0。
- 全量服务测试 159 files / 1882 tests、type-check、完整 NSIS build、打包验证器、真实启动核验全部通过。
- 安装包：`dist/神意助手-Setup-3.86.0.exe`，231,529,296 bytes，SHA256 `aa4427b9c78ebbebea0afc2ebc662565ac5140efdc3f4844470604ed4acf7519`。
