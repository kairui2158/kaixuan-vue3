# 2026-10-15 卷纲层 reasoning-only 卡流收口

## 目标

生成流只输出 reasoning、长时间不产生正文时，不再让卷纲层任务悬挂到整轮超时。应用需把这类流归类为 `reasoning_only_stalled`，第一次发生时做协议感知的语义重试，第二次仍失败则终态失败，不允许无限重试或伪装成功。

## 交付内容

- `aiService`：新增 body-absent watchdog，默认 12 分钟；正文或工具进度到达时解除，reasoning 只更新进度证据。超时抛出 `reasoning_only_stalled`，携带 `bodyAbsentMs`、`firstContentAt`、`lastReasoningAt`。
- 语义重试：支持思考控制的协议发送 `reasoning_effort: none` / `reasoning.mode = off`，策略记录为 `thinking_disabled`；不支持思考控制的协议提高输出预算 1.5 倍，策略记录为 `max_tokens_raised`。同一 API call 内只允许一次 reasoning-only 语义重试。
- 协议识别：`getProviderReasoningControl` 对未知 providerType 明确返回不支持，避免未注册协议误走 `reasoning_effort`。
- 运行记录：physical call 补齐 `firstContentAt`、`lastContentAt`、`lastReasoningAt`、`bodyAbsentMs`；PipelinePanel 各调用面同步透传。
- 测试注入：`vite.config.mts` 定义 `__SHENYI_BODY_ABSENT_TIMEOUT_MS__`，renderer 运行时可读取构建期或测试 override；验证脚本通过 `addInitScript` 保证先于应用代码生效。
- 验证器：新增可见 Electron 真实 UI 脚本，并支持 deep run trace 的 payload 引用解引用，正文证据从 `payloads/*.json` 读取真实落盘内容。

## 关键修复过程

- 初版 Electron 断言失败不是因为产品链路：deep 导出按设计把正文外置到 `payloads/005-stream.json`，`run-trace.json` 中只保留 `{ __payload: { id } }`。验证脚本曾按内联字符串读取，导致 `.includes is not a function` 和“找不到正文”的假失败。修复为按 payload ref 解引用，并校验文件名为单段安全路径。
- renderer 中不存在 `process.env`，且 override 晚于模块加载注入会导致默认 12 分钟无法被测试缩短。修复为 `define` 注入 + `page.addInitScript` 提前注入。
- 成功侧曾缺少 `firstContentAt` / `lastContentAt` 证据，已补齐到 success physical call，不需要从 UI 状态反推。

## 验证

- 专项：`npm run test:services -- src/services/aiService.spec.ts` → 1 file / 171 tests passed。
- `npm run type-check` → exit 0。
- `$env:SHENYI_BODY_ABSENT_TIMEOUT_MS='15000'; npm run build:vue` → exit 0。
- 可见 Electron 真实 UI：`node scripts/verify-reasoning-only-stall-electron.mjs` → `===== REASONING ONLY STALL ELECTRON PASSED =====`。
  - 物理请求 2 次：第一次无 `reasoning_effort`，15 秒无正文后终止；第二次带 `reasoning_effort: none`。
  - run `success`；API call 1 个，physical calls 2 个；第一轮 `failed / reasoning_only_stalled`，第二轮 `success / thinking_disabled`。
  - 项目持久化 1 个卷：`第一卷 风暴起点`；正文证据来自 deep 导出 payload 文件。
  - 证据：[_audit/verification-reasoning-only-stall-electron/report.json](_audit/verification-reasoning-only-stall-electron/report.json)。

## 诚实边界

- Electron 验证使用本地 OpenAI-compatible provider，不是外部 live 供应商；本证据面覆盖卡流识别、重试语义、trace 与落盘，不覆盖 live 供应商差异。
- `max_tokens_raised` 分支由单测覆盖，未做独立 Electron 双协议实测。
- 12 分钟默认值来自当前产品节奏决策；后续如供应商 reasoning 普遍变快，可再校准。

## 清理

- 已删除 `_data/reasoning-only-stall-profile` 一次性 Electron profile。
- 最终干净复验后无 `electron.exe` 残留；现存 `node` 进程均属 Codex 桌面运行时，与本应用无关。

## 台账

- 七节台账：[_audit/TASK_LEDGERS/2026-10-15_reasoning-only-stall-retry.md](_audit/TASK_LEDGERS/2026-10-15_reasoning-only-stall-retry.md)

## 封装

- 版本：3.88.0；`package.json:3`、`package-lock.json:3`、`package-lock.json:9` 均为 3.88.0。
- 升版后复验：`npm run test:services -- src/services/aiService.spec.ts` → 171/171 passed；`npm run type-check` → exit 0。
- `npm run build` → exit 0。中间 `rcedit` 出现 3 次 `Unable to commit changes`，electron-builder 自动重试后通过，最终 NSIS 产物完整；如实记录。
- 打包核验：`node scripts/verify-packaging-3-88-0.mjs` → `===== PACKAGING 3.88.0 VERIFICATION PASSED =====`；asar version `3.88.0`、renderer 74 files、`electronAPI` 77 methods。证据：[_audit/verification-packaging-3-88-0/packaging-evidence.json](_audit/verification-packaging-3-88-0/packaging-evidence.json)。
- 安装包：`dist/神意助手-Setup-3.88.0.exe`，231,529,621 bytes，SHA256 `bb07565088ac8b9ce432fb6f1ae9ff7025ef594ef7952c1a76bb7f729f4ab47f`。
- 已清理 3.87.0 旧安装包与 blockmap，dist 只保留 3.88.0 当前产物。
