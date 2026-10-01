# DEV_LOG 2026-10-01 SKILL / 无 SKILL 执行体系统一 v2

## 目标

落实用户确认的核心原则：有 SKILL 与无 SKILL 必须是同一套执行方案。SKILL 只改变提示词、领域能力与上下文组织，不改变执行器选择、权限语义、长文档路由、工具面、写回协议和 trace 字段。方案见 [PROPOSAL_2026-10-01_SKILL_NEUTRAL_EXECUTION_UNIFICATION.md](PROPOSAL_2026-10-01_SKILL_NEUTRAL_EXECUTION_UNIFICATION.md)。

## 交付内容

1. 大纲入口建立单源 `activeOutlineExecutionPlan`，`askAi` / `askPlainAi` 共用同一计划构建函数，真实 provider 窗口与 `maxTokens` 进入计划；请求终态、等待确认、预算耗尽、取消与异常路径都会清理计划。
2. 删除双入口 final-draft 判定中的“未加载 SKILL”条件。加载 SKILL 的整篇重排 / 格式整理 / 去重请求现在进入终稿 runner，与无 SKILL 路径一致。
3. `FinalDraftRunInput` / `FinalDraftTask` / 生成与续写链路贯通 `skillGuidance`。guidance 统一附加在终稿系统提示后，单份 8000 字符上限，截断写入 `skill-guidance-truncated`；分段、续写、结构重试使用同一份 guidance。
4. `WorkspaceSkillToolRequest` 增加 `requestText`；engine 侧 `resolveAuthorizedToolSurface` 透传应用提供的 `writeAuthorization`，不再二次构造弱化授权。双入口 adapter 提供 `getExecutionContext()`，工具面与 plain 路径消费同一执行计划。
5. SKILL 包协议边界单源化为 `src/services/skillPackageProtocol.json`。安装、导入、导出、设置页共用规则；folder `meta.agent` 的 model / temperature / maxTokens 被忽略并记录 `skill-agent-ignored`，systemPrompt 归并到 guidance。
6. RunTrace 补齐 `final-draft-skill-guidance`、`skill-agent-ignored`、`plan-origin`、`surfaceSource: trace-projection` 等事件与字段；final-draft 的 turn 记录工具面为空数组，防止 SKILL 调试方误判“工具没接上”。
7. 大纲路由 trace 的工具面记录改为消费同一 adapter/requestText 协议，并标记 `trace-projection`，避免观测投影被当成第二执行面。

## 验证

- 升版 3.71.0 后复验：
  - `npm run type-check`：exit 0。
  - `npm run test:services`：124 文件 / 1303 tests 全绿。
  - `npm run build:vue`：通过；仅既有 chunk 体积与 Vite 配置 warning。
- `npm run test:services`：124 文件 / 1303 tests 全绿。
- `npm run type-check`：exit 0。
- `node --check`：`electron/preload.js`、`electron/ipc/skill-package.js`、`scripts/verify-skill-neutral-execution-electron.mjs` 全部通过。
- `npm run build:vue`：通过；仅既有 chunk 体积与 Vite 配置 warning。
- `node scripts/verify-skill-neutral-execution-electron.mjs`：`===== SKILL NEUTRAL EXECUTION ELECTRON PASSED =====`。
- Electron 矩阵覆盖首页 / 大纲 × 无 SKILL / 有 SKILL × final-draft / targeted edit：
  - 无 SKILL：请求 `guidance=false`、`tools=[]`。
  - 有 SKILL：请求 `guidance=true`。
  - final-draft：不暴露 `editor.write`，仍由终稿 runner 写回编辑器。
  - targeted edit：暴露完整 editor/outline 工具面，`editor.write` 真实修改编辑器内容。
  - 导出 trace：`schemaVersion=11`。
- 证据目录：`_audit/verification-skill-neutral-execution-electron/`（含 `summary.json` 与 `final-state.png`）。

## 验证器修正过程

1. `latestRun` 事件映射补 `payload`，final-draft 断言改为 `payload.skillGuidancePresent === withSkill`。
2. 播种逻辑显式传 `skill`，并增加 skill store 与 co-creation config 生效断言。
3. home fixture 复用 `activeTab`，避免 `openTab` 复用旧 tab 造成内容断言失真。
4. 修正 with-skill final-draft 的验证口径：不能断言 mock 最终正文包含技能标记，应断言请求 guidance=true 且编辑器被终稿 runner 写回。

## 未验证项

- 真实外部供应商调用未执行。mock Electron 矩阵只证明应用接线、权限面和编辑器写回，不冒充 live 供应商验证。
- 外部 API key 不得写入仓库、文档或证据文件；如需补做 live，只能通过环境变量传入。

## 封装与收尾（3.71.0）

- `npm run build`：NSIS 安装包产出 `dist/神意助手-Setup-3.71.0.exe`。
- asar 核验：`npx asar list dist/win-unpacked/resources/app.asar` 包含 `src/services/skillPackageProtocol.json`。
- 真实启动核验：`dist/win-unpacked/神意助手.exe` 启动成功，主窗口进程响应正常；验证后进程已全部退出，无残留。
- 安装器配置核验：`oneClick=false`、`allowToChangeInstallationDirectory=true`，支持用户自选安装路径。
- SHA256：`7DA54831D9698BA7EFBA4480DEBAEC376AA436B1516C243E50C64F5A44DE9039`。
- 旧产物清理：已删除 `dist/神意助手-Setup-3.70.0.exe` 与 `.blockmap`，`latest.yml` 指向 3.71.0。
- 测试 profile 核验：`_data/skill-neutral-execution-profile` 不存在，验证器无本地残留。

## 文档同步

- `_audit/SKILL_HANDOFF_API_DIRECT_WRITE_TOOLS.md`：版本口径升至 3.71.0，新增“SKILL 中立执行总则”。
- `docs/链路与功能参考书.md`：SKILL 链路补充执行权说明，链式执行描述改为 workspaceSkillEngine 编排提示词与工具调用。
- 本日志登记入 `DEV_LOG_MASTER_INDEX.md`。
