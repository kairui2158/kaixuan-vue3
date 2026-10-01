# DEV_LOG 2026-09-27 - 长文档重排架构 V2 Phase 6（已完成）

## 当前状态

Phase 6 已通过。S100（100k）此前完成 6 个操作全 success；本轮补齐 S200 与 S1M 的真实 Electron + 真实 API 验证，全部操作均为 `success`。M17 回头看发现的 2 处测试标题语义残留已修复并回归。

## 本轮修复

### S200 normalize 物理断流

上一轮 S200 `normalize` 第 5 次物理调用失败，最终错误为 `undefined: 供应商返回 HTTP undefined`。

根因链路：

1. `electron/ipc/api.js` 的 `providerNet:stream` catch 返回 `{ ok:false, kind:'network', message }`。
2. `src/services/aiService.ts` 的 `mainNetStream()` 曾把 `network` 之外的 kind 降级成 `http`，且不携带 statusCode。
3. `callAiWithoutTools()` 的 HTTP 分支拿到 `status=undefined`，拼出 `HTTP undefined`。
4. direct 工具轮 `retry:false` 时，瞬态断流被当作终态失败，没有物理重连。

修复：

- `mainNetStream()` 完整保留 main-process 的 `auth / timeout / json / network / http` 分类。
- 新增 `NETWORK_RETRY_FLOOR = 1`：语义重试关闭时，瞬态网络断流仍保留一次物理重连。
- HTTP 分支遇到无效 status 时按 network 处理并走同一物理重连下限，不再生成 `HTTP undefined`。
- 修复本轮编辑事故：`PHYSICAL_HEARTBEAT_INTERVAL_MS` 曾被误删，已在模块常量区恢复。

### runTrace 终态污染

OutlineWorkspace 的收尾曾把真实失败的 running API call 覆盖成 `canceled`，导致 SKILL 层无法判断真实失败原因。

修复：

- `src/stores/runTrace.ts` 新增 `failRunningApiCalls(runId, reason)`，与 `cancelRunningApiCalls` 对称。
- OutlineWorkspace 失败终态走 `failed`，只有用户取消 / 等待确认走 `canceled`。

## 验证

### 离线验证

1. `npx vitest run src/services/aiService.spec.ts src/services/longDocumentExecutionPlanner.spec.ts`
   - `Test Files 2 passed (2)`
   - `Tests 139 passed (139)`
2. `npx vitest run src/stores/runTrace.spec.ts`
   - `60 tests passed`
3. 长文档重排定向套件
   - `4 files, 190 tests passed`
4. `npm run test:services`
   - `Test Files 116 passed (116)`
   - `Tests 1196 passed (1196)`
4. `npm run type-check`
   - `exit code 0`
5. `npm run build:vue`
   - `exit code 0`
   - `dist-renderer` 已重建

### S200 真实 Electron + 真实 API

模型：`deepseek-v4-pro`；实际规模：200,066 字符，464 个标题。

| 操作 | 终态 | 内容变化 | 物理调用 | EditTask | 字符数 |
|---|---|---|---|---|---|
| reorder | success | true | 5 | completed | 200,053 -> 200,053 |
| normalize | success | false | 11 | completed | 200,053 -> 200,053 |
| dedup-request | success | false | 3 | completed | 200,053 -> 200,053 |
| dedup-reject | success | false | 2 | completed | 200,053 -> 200,053 |
| targeted-edit | success | true | 3 | completed | 200,053 -> 200,057 |
| interrupt-resume | success | false | 3 | completed | 200,057 -> 200,057 |

`normalize` 含 2 次工具自纠错：`target_not_found` 后改用 search 再写入成功，属于工具纠错链路生效，不是协议缺陷。

### S1M 真实 Electron + 真实 API

模型：`deepseek-v4-pro`；实际规模：1,000,024 字符，2,274 个标题。

| 操作 | 终态 | 内容变化 | 物理调用 | EditTask | 字符数 |
|---|---|---|---|---|---|
| reorder | success | true | 6 | completed | 1,000,011 -> 1,000,011 |
| normalize | success | false | 3 | completed | 1,000,011 -> 1,000,011 |
| dedup-request | success | false | 5 | completed | 1,000,011 -> 1,000,011 |
| dedup-reject | success | false | 3 | completed | 1,000,011 -> 1,000,011 |
| targeted-edit | success | true | 3 | completed | 1,000,011 -> 1,000,015 |
| interrupt-resume | success | false | 3 | completed | 1,000,015 -> 1,000,015 |

全量结果与证据见 `_audit/verification-long-document-restructure-phase6/summary.json`。

## M17 回头看

发现并修复 2 处测试标题语义残留：

1. `src/services/aiService.spec.ts:1780`：`steers long-document restructure toward move commands` 改为 `steers long-document restructure toward atomic reorder_sections`。
2. `src/services/longDocumentExecutionPlanner.spec.ts:19`：`classifies whole-document restructure as a structure-level move operation` 改为 `classifies whole-document restructure as an atomic reorder operation`。

修复后定向回归：`Test Files 2 passed (2)`、`Tests 139 passed (139)`。

## 收尾状态

1. 经验文件新增 M79：长文档重排原子协议门禁。
2. 已删除临时脚本 `scripts/tmp-inspect-phase6-payloads.js`。
3. 已删除验证凭据残留 `_data/long-document-restructure-phase6-credentials/documents-data/wa_providers.json`，API key 未写入仓库。
4. 版本升级 3.69.0。
5. `npm run type-check`：通过。
6. 长文档重排定向回归：`7 passed (7)`、`268 tests passed`。
7. `npm run test:services`：`Test Files 116 passed (116)`、`Tests 1196 passed (1196)`。
8. `npm run build`：Vue 双构建与 NSIS x64 打包通过，生成 `dist/神意助手-Setup-3.69.0.exe`。
9. `node scripts/verify-packaging-3-69-0.mjs`：asar 版本与入口、renderer 新鲜度、真实启动、75 项 `electronAPI`、可见文本、安装路径可选、SHA256 全部通过。

## 封装证据

- 核验脚本：`scripts/verify-packaging-3-69-0.mjs`
- 证据目录：`_audit/verification-packaging-3-69-0/`
- 安装包：`dist/神意助手-Setup-3.69.0.exe`
- 大小：231,467,916 bytes
- SHA256：`044e6d03b6c0fcebd6c0714034b330c469cdcf26eccf6bfcb9570de65d75256b`
- 收尾复核：旧 3.68.0 安装产物已删除，`dist` 仅保留 3.69.0 一套安装产物；无 Electron 进程残留；无预算目标，未设置任何 token 预算。
