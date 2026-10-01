# 2026-09-20 API 直写 Electron 高强度实测

## 目标

按用户硬性要求，用真实 Electron UI 验证 API 直写能力：主动要求 API 写入、修改、删除，并覆盖跨轮权限、停滞重试与 trace 导出。

## 执行

- 新增 `scripts/verify-api-direct-write-electron.mjs`：启动真实 Electron，经 CDP 接入 Playwright，用本地 mock OpenAI-compatible 供应商驱动 6 个场景。
- 场景覆盖：
  1. 大纲格式排版：edit 意图、`editor.write` 直写、工具轮后正文收敛。
  2. 跨轮权限：discuss 轮无写入工具；下一轮 edit 后工具面与 system prompt 权限声明同步翻转并成功写入。
  3. 停滞重试：原请求停滞失败，隔离重试成功写入，trace 记录 `state-stuck-retry`。
  4. 大纲三连：写入 append、修改 replace_match、删除 delete，每轮一个工具调用并成功。
  5. 主页混合轮：读取、写入、修改、删除，权限声明和 trace 同步。
  6. deep trace 导出：导出的 run 与最新大纲 run 一致，无 running API call。

## 排查与修正

- 首轮失败来自测试脚本：mock 用“场景全局计数”代替“单轮内阶段计数”，导致工具成功后同一 `editor.write` 被重复回放。应用层的重复写入拦截和 tool convergence 行为正确。
- 修正为 `setScenario()` + 每轮 `scenarioTurn / scenarioCount` 重置；跨场景轮号也清零。
- 断言同步修正：停滞重试按 `turnId` 过滤；批次事件断言改为现行 `batch_event` 语义；主页混合轮按“每轮 tool 请求 + final 请求”校验，并校验读轮无写入面。

## 重要证据

- Electron 实测过程中出现过一个有价值的现象：discuss 轮请求未携带 `editor.write`，mock 仍强行返回写工具，服务层返回 `tool_not_found`，编辑器未写入。这是权限门真实生效的证据，不是应用缺陷。
- 截图与 trace 证据在 `_audit/verification-api-direct-write-electron/`。

## 验证

- `npm run build:vue`：通过。
- `node scripts/verify-api-direct-write-electron.mjs`：`===== API DIRECT WRITE ELECTRON STRESS E2E PASSED =====`。
- `npm run type-check`：通过。
- `npx vitest run src/services/chainIntentRouter.spec.ts`：1 个文件、14 个用例通过。
- `npm run test:services`：73 个文件、698 个用例通过。
- 回头看扫描：`appendDialogueToolSurfaceDeclaration / actualToolSurface / state-stuck-retry` 在大纲、主页、SKILL 引擎与验证脚本中均为现行语义，未发现旧路径绕过。
- 清理复核：`_data/api-direct-write-electron-*` 临时目录全部清除。

## 遗留

- Electron 启动时存在既有的 `electron-log/renderer` preload 噪音错误，不影响本轮直写链路与测试结果；已按事实登记，不并入本次范围。
