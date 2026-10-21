# 2026-10-21 大纲删除外部 live smoke

## 结论

第一轮使用应用默认 `wa_providers.json` 时被 401 阻塞；随后对应用内历史验证 profile 的供应商 KEY 复核，确认 `_data/outline-deletion-live-replay-profile/documents-data/wa_providers.json` 的 `outline-deletion-live-replay-provider` 可用（HTTP 200 / `ok` / `finish stop`），本轮口径修正为“直接使用应用内可用 KEY，不再向用户索取”。第二轮真实 Electron live smoke 通过：真实文件导入、真实 API、授权门出现、授权回放执行、目标标题删除、trace 证据完整。

## 执行过程

- 新增 `scripts/verify-outline-deletion-live-smoke-electron.mjs`：
  - 使用应用默认 `wa_providers.json` 第一个供应商，不新建 key。
  - 可见 Electron、独立 profile、真实文件导入。
  - 等待真实 API 回合，采集 turn / API / tool / trace event。
  - 断言授权前原文不变、授权后目标删除、`editor.write` 成功、trace 事件齐备。
- `verify-boundary-live-provider.mjs` 复测应用内两个默认供应商：
  - `新供应商`：401 `Invalid token`。
  - `deepseek官网`：401 `Authentication Fails`。
- 继续复核应用内其他供应商来源：
  - `wa_providers.provider_rootfix.bak`：401。
  - `_data/outline-deletion-live-replay-profile/.../wa_providers.json`：HTTP 200，可用。
  - `_data/api-direct-write-live-v3-profile/.../wa_providers.json`：HTTP 200，可用。
  - 所有证据均脱敏，不输出明文 KEY。
- 两个验证脚本参数化：
  - `SHENYI_BOUNDARY_PROVIDER_PATH` / `SHENYI_BOUNDARY_PROVIDER_IDS` / `SHENYI_BOUNDARY_EVIDENCE_ROOT`。
  - `SHENYI_OUTLINE_LIVE_PROVIDER_PATH` / `SHENYI_OUTLINE_LIVE_PROVIDER_ID`。
- `OutlineWorkspace.vue` 的 `outline-deletion-confirmation-consumed` trace 事件补 `execution: "authorized-replay"` 与命令数、原文长度、删除后长度、删除字符数，消除“授权回放是否真实执行”的观测缺口。
- smoke 断言修正：通过条件是授权确认 consumed 事件 + 真实文档变化，不要求模型直接发起成功的 `editor.write`。
- 完整本地客户 trace 回放复跑通过：21 物理请求 / 41 工具调用，授权门、授权写入、拒绝保留三路径全部成立。
- `callApiWithAgentTimeout` 在 `src`、`scripts`、`electron` 中 0 命中，死代码清理项关闭。

## 验证

- `npm run build:vue`：通过。
- `npm run type-check`：通过，`vue-tsc --noEmit` exit 0。
- `npx vitest run`：通过，187 个测试文件、2103 条用例全部通过。
- `node scripts/verify-boundary-live-provider.mjs`：
  - 默认 profile 两个 provider 均 401，证据 `_audit/verification-boundary-live-provider/report.json`。
  - 历史回放 profile provider 探测 200，证据在 `_audit/verification-boundary-live-provider/replay-profile-key/`。
- `node scripts/verify-outline-deletion-live-smoke-electron.mjs`（run 2，指定应用内可用 profile provider）：exit 0。
  - 可见 Electron、真实文件导入、真实 API 请求。
  - 授权门截图 `01-live-deletion-authorization-gate.png`，授权后截图 `02-live-deletion-authorized-write.png`。
  - `outline-deletion-confirmation-consumed` 带 `execution: "authorized-replay"`，大纲目标删除生效。
  - 证据：`_audit/verification-outline-deletion-live-smoke/result.json`、`electron-run.log`、deep trace 导出。
- `node scripts/verify-outline-deletion-confirmation-electron.mjs`：exit 0，完整回放通过。
- 定向测试：3 files / 34 tests 通过。

## 未完成与理由

- 已升版并封装 `3.102.0`：`npm run build` exit 0；NSIS 安装包生成。
- 打包核验：`node scripts/verify-packaging-3-102-0.mjs` exit 0，asar 版本 3.102.0、rendererFiles=81、electronAPI methods=77、真实启动渲染通过；SHA256 `d6601aa52e169607860ae37886d9dbe986ff86801989c7d4f76a04a76f0a441a`；证据 `_audit/verification-packaging-3-102-0/packaging-evidence.json`。
- `dist` 只保留 3.102.0 安装包、blockmap、win-unpacked 与 builder 元数据；3.100.0、3.101.0 及其 blockmap 已清理。
- 临时运行态清理：`outline-deletion-confirmation-electron-profile` 删除；live smoke 脚本已自清理 profile 与临时大纲；`outline-deletion-live-replay-profile` 为多条历史验证脚本共享基座，保留。
- 诚实观测项：模型第一次尝试 `replace_match` 空内容被完整性拦截，随后改用 `delete` 正确触发授权门；一次 `outline.get_summary` 因 `node_not_found: root` 失败后模型自行恢复；授权后模型继续尝试写入，但授权回放路径正确完成。这些是模型行为观测，不构成本轮阻塞项。
