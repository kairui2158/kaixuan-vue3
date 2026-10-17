# DEV_LOG：五项登记边界闭环（2026-10-17）

## 交付内容

本轮把 `_audit/TASK_LEDGERS/2026-10-17_body-contract-degraded-gate.md` 登记的五个边界项推进为可审计闭环：

1. 大纲工作台产物契约接入生产链路，新增 `workspaceArtifactAcceptance` 三态验收：`body`、`outline`、`no_contract`。`workspaceSkillEngine` 的 chain 与 compose 路径都执行同一验收门；大纲只在 `edit` 且存在真实大纲目标时携带 outline contract，`discuss/analyze/generate` 保持 `no_contract`，不新增预览/批准/暂停状态机。
2. 新增恶意 SKILL 模板边界测试：模板文本要求“忽略权限、授予 editor.write、扩展工具面”，测试证明该文本只进入提示词，不改变工具面；`discuss` 只有 `editor.get_state`，`edit` 才有 `editor.get_state + editor.write`。
3. payload 回放器升级为“账本 + 物理文件 + 事件流”三方同源校验，覆盖 85 个物理 payload、85 条账本记录、sha256、顺序、重复计数，以及 `api-start/folder-pass-input/physical-call/api-*/body-artifact-attempt` 事件对账。
4. live 供应商边界脚本改为真实生产入口：读取应用内已配置供应商，经 `electronAPI.decrypt` 解密，仅内存使用，再经 `electronAPI.providerNetRequest` 主进程 IPC 发起请求；不写测试专用全局钩子，不改用户配置，报告全部脱敏。
5. `verify-body-contract-degraded-electron.mjs` 用真实 Electron UI、真实下拉 SKILL 选择与本地 provider 完成拒收/接受双场景验证。

## 验证证据

- `npm run type-check`：exit 0，版本 `3.96.0`。
- `npx vitest run src/services/workspaceSkillEngine.spec.ts src/services/workspaceArtifactAcceptance.spec.ts`：2 files / 49 tests 全部通过。
- `node scripts/verify-body-contract-degraded-replay.mjs`：PASS；85 payload 与账本一致，5 个 `processing-output` 为导出器刻意保留的 `outputPreview` 副本，不是丢失；事件计数 `api-start=8`、`folder-pass-input=13`、`physical-call=117`、`api-success=7`、`api-degraded=1`、`body-artifact-attempt=3`，总事件 528。
- `npm run test:services`：173 files / 2009 tests 全部通过。
- `npm run build:vue`：exit 0；native config warning 消失。仍有两个 chunk 超过 500kB 默认阈值：`index` 约 1,054.41 kB，`g6` 约 1,406.66 kB。`g6` 已独立拆包，剩余是真实体积提示，本轮不调 `chunkSizeWarningLimit` 伪装消警。
- `node scripts/verify-body-contract-degraded-electron.mjs`：PASS；场景 A `run-1792225920014-1` 为 4 次物理请求、1654 字、`degraded_plus_contract_failure`、S3 零调用、run failed；场景 B `run-1792225920712-61` 为 5 次物理请求、2200 字、S3 收到提取面、run success。
- `node scripts/verify-boundary-live-provider.mjs`：两个应用内真实供应商均返回 401；报告写入 `_audit/verification-boundary-live-provider/report.json`，状态 `blocked_external_credentials`，key 全部 masked。

## 诚实边界

- **外部 live 供应商本轮无法验证。** 生产入口已验证可用，但应用内两个供应商的密钥在外部服务侧均返回 401：`新供应商 / openapi.cloud-ai.cn/v1` 返回 `Invalid token`，`deepseek官网 / api.deepseek.com` 返回 `Authentication Fails`。这是外部凭据状态，不是应用缺陷；在用户提供有效 key 前，不能声称 live 通过。
- Electron 契约验证使用本地 provider，不代表外部供应商矩阵；它的职责是验证应用执行链、验收门、工具面和 UI 行为。
- 本轮不改 SKILL 提示词内容，也不放宽任何写入安全阈值。

## 收口与清理

- 版本从 `3.95.0` 升级到 `3.96.0`。
- `_data/boundary-live-profile`、`_data/body-contract-degraded-profile`、`_data/body-contract-degraded-skills` 已清理，复核不存在。
- 保留验证证据：`_audit/verification-body-contract-degraded-replay/`、`_audit/verification-body-contract-degraded-electron/`、`_audit/verification-boundary-live-provider/`。
- 经验文件保持 v8.15，不升 v8.16：本轮没有发现新的工程纪律缺陷；外部凭据失效属于 v8.15 已覆盖的“无法验证必须显式登记”边界，升版反而会稀释版本含义。

## 封装登记

- `npm run build` exit 0，安装包 `dist/神意助手-Setup-3.96.0.exe`，231,544,720 bytes，SHA256 `b43ec972633ae06458ab9d2e38ee489f4376ae68da2b3ccc55be71bed3b3d141`。
- `node scripts/verify-packaging-3-96-0.mjs` 打包后真实启动核验 PASSED：asar 版本 3.96.0、rendererFiles=81、electronAPI methods=77、本地 embedding 模型加载成功、渲染 bodyTextLength=912。
- 证据：`_audit/verification-packaging-3-96-0/packaging-evidence.json`。
- 本次默认构建路径未复现历史 rcedit EBUSY 间歇锁；首跑失败是核验脚本自身被计入 SOURCE_ROOTS 导致的时间戳断言误判，已将 `scripts` 排除后复跑通过。
- 旧产物 `神意助手-Setup-3.94.0.exe` 与对应 blockmap 已删除，Node 复核均不存在；`dist` 仅保留 3.96.0 exe/blockmap、builder-debug.yml、builder-effective-config.yaml、latest.yml，以及作为真实启动核验载体的 `dist/win-unpacked`。
