# 2026-09-26 直写测试项目污染清理与数据隔离修复

## 问题

用户在章节树顶栏看到 `API Direct Write Electron Stress`。根因是源码级 Electron 直写验证脚本在真实数据目录中注入测试项目、供应商与 `wa_lastProjectId`；应用启动后自动加载并持续回写该测试项目。`wa_providers.json` 也被 mock 供应商覆盖。

## 修复

1. `electron/main.js` 新增 `SHENYI_DATA_DIR` 隔离开关，仅开发态生效且优先于默认数据目录。
2. 递归反查全部 Electron spawn 验证脚本后，统一注入 `SHENYI_DATA_DIR=<profile>/documents-data`，不再触碰 `Documents/神意助手数据`。
3. 新增 `scripts/cleanup-api-direct-write-user-data.ps1`，带路径守卫清理 `wa_*api-direct-write*` 残留、恢复真实供应商备份并移除污染的 lastProjectId。
4. 关闭运行中的神意助手后清理真实数据目录：删除两个测试项目及其关联文件、`wa_lastProjectId` 与 mock 供应商；从 `wa_providers.provider_rootfix.bak` 恢复 deepseek 等真实供应商配置。

## 验证

- `node --check electron/main.js`、`node --check scripts/verify-api-direct-write-electron.mjs`、`node --check scripts/verify-api-direct-write-v2-e2e.mjs` 均通过。
- 清理脚本输出 `API_DIRECT_WRITE_USER_DATA_CLEANED`。
- 复核：`wa_lastProjectId.json` 不存在；`wa_*api-direct-write*` 文件数为 0；`generateProvider` 恢复为 `prov-1788240547075`，供应商列表为“新供应商 / deepseek官网 / 新供应商”。

## 后续要求

任何 Electron 验证脚本不得直接写默认用户数据目录；必须使用独立 profile 和 `SHENYI_DATA_DIR` 隔离，收尾复核 profile 与真实数据目录双侧。

## 递归反查补录（2026-09-26）

### 缺口

首轮只修复 2 个 API 直写脚本；全库反查 `SHENYI_TEST_USER_DATA_DIR` 后确认共有 21 个 Electron spawn 验证脚本，其中 19 个曾缺少文档数据层隔离。补漏清单包括 provider wire、live v3、real outline 10r、user visible v3、API live status、intent routing/corpus、outline silent wait、app confirm layering、installer 3.42.2 / 3.44.0 smoke、outline compose folder repair、product validity、release gate G2/G3/G4、run trace depth/diff/volume trace 相关脚本。这些脚本会写 `wa_providers.json`、`wa_lastProjectId.json`、`wa_project_*`、技能或语料，具备同型污染面。

### 补丁

1. `electron/main.js` 将 `SHENYI_DATA_DIR` 升级为 `SHENYI_DATA_DIR` + `SHENYI_ALLOW_TEST_ISOLATION=1` 双开关；显式隔离子不再被 `isDev` 拦截，打包安装态 smoke 也能隔离。
2. 21 个 Electron spawn 脚本全部补齐独立 profile、`SHENYI_DATA_DIR=<profile>/documents-data` 与 `SHENYI_ALLOW_TEST_ISOLATION=1`。
3. 经验库新增 M71 Electron 验证数据目录隔离门禁；`--user-data-dir` 不等于文档数据隔离。

### 验证

1. `node --check`：21 个脚本 + `electron/main.js` 全部通过。
2. 隔离完整性扫描：所有含 `SHENYI_TEST_USER_DATA_DIR` 的脚本 `TOTAL=21 / MISS=0`。
3. 交叉对账：所有含 `SHENYI_DATA_DIR` 且涉及数据写入面的脚本均已包含 `SHENYI_ALLOW_TEST_ISOLATION`，`MISMATCH_COUNT=0`。
