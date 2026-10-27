# DEV LOG: 2026-10-28 默认数据存储 C 盘迁移 D 盘收口

## 1. 目标与背景

用户原话：「对的我们现在是应用装在C盘，AGent和核心机制保留在C盘外，在不影响功能的前提下把数据能迁移到D盘的都迁移到D盘，而且默认的数据类存储位置从C盘能改为存储为D盘就改到D盘。」

目标：默认数据类存储迁移到 `D:\神意助手数据`；应用安装目录保持 `D:\小说工坊\shenyi-assistant`；不迁移、不改动用户 C 盘外的 Agent 与核心机制；迁移前后数据零差异，删除 C 盘旧位置后真实安装版启动不回写 C 盘。

## 2. 交付内容

- `electron/defaultPaths.js`：默认数据根、Electron `userData`、legacy 目录单源化；默认根 `D:\神意助手数据`；D 盘不可写时回退 Documents；支持 `SHENYI_DEFAULT_DATA_ROOT` 与 `SHENYI_USER_DATA_DIR` 覆盖。
- `electron/main.js`：启动早期统一设置 `userData`；显式测试隔离时 userData 跟随隔离目录；生产 `dataDir` 与 `legacyDir` 改用 `defaultPaths`；输出 `storage-paths` 日志。
- `electron/ipc/storage.js`：修复 `fs.promises` 误用 `accessSync`；显式测试隔离下跳过真实数据迁移；迁移候选补齐旧 Documents 数据目录。
- `electron/ipc/diag.js`、`build/installer.nsh`、6 个 verify/diagnose 脚本：消费 D 盘默认路径，移除硬编码 C 盘用户路径。
- `scripts/verify-data-migration-c-to-d.mjs`：C 到 D 三组映射按相对路径与 SHA256 全量对账；源目录已删除的迁移终态可直接复跑，输出 `sourceExists:false` 与目标文件数。
- 新增 `electron/defaultPaths.spec.js`、`electron/ipc/storage.spec.js` 负向与回退测试。
- 版本：`3.110.1` -> `3.110.2`。

## 3. 关键根因

首次删除 C 盘旧目录后，`%APPDATA%\shenyi-assistant` 仍被重建为空目录。根因是 `electron/main.js` 在调用 `app.setPath('userData', ...)` 前调用了 `app.getPath('userData')`；Electron 读取默认路径时会产生副作用并创建默认目录。修复为 fallback 路径从 `process.env.APPDATA` 推导，设置完成前不读取 `userData`。

## 4. 验证矩阵

| 面 | 结果 | 证据 |
|---|---|---|
| 语法与定向测试 | PASS：`node --check` 5 个入口全过；`electron/defaultPaths.spec.js + electron/ipc/storage.spec.js` 2 files / 8 tests 全过 | 本轮命令输出 |
| 迁移前哈希对账 | PASS：主数据 1347/1347、legacy 12/12、userData 471/471 全部 SHA256 零差异；运行态差异在白名单 | `_audit/verification-data-migration-c-to-d/migration-report.json` |
| 迁移后终态对账 | PASS：`ok:true`，三个源 `sourceExists:false`，D 盘目标文件 1886 / 12 / 471，`differencesCount:0` | `node scripts/verify-data-migration-c-to-d.mjs` |
| C 盘清理复核 | PASS：Documents 两个数据目录、Roaming `shenyi-assistant`、Local Programs 安装目录均不存在 | 本轮 `Test-Path` 输出全 false |
| 安装器 | PASS：3.110.2 `/S` 安装后 `D:\小说工坊\shenyi-assistant\神意助手.exe` FileVersion/ProductVersion 均为 3.110.2 | 本轮安装回归 |
| 安装版启动回归 | PASS：进程存活 15 秒；`storage-paths: dataDir=D:\神意助手数据 userData=D:\神意助手数据\_app-user-data legacyDir=D:\神意助手数据\_legacy`；C 盘四个旧位置未重建；退出无残留进程 | `D:\神意助手数据\_app-user-data\logs\main.log` |
| 重新封装 | PASS：`npm run build` exit 0 | 本轮构建输出 |

## 5. 封装核验

- 版本：`package.json` = 3.110.2；`dist/win-unpacked/神意助手.exe` FileVersion/ProductVersion = 3.110.2。
- 安装包：`dist/神意助手-Setup-3.110.2.exe`，231,612,595 bytes，SHA256 `687F85DB5BF9B17DE1C86C4697B49C56285B7E530189AC04F996566B76DAF3FC`。
- blockmap：227,080 bytes，SHA256 `E553D870754C5E1A3A2CA10AB4E87F1C2B2806619CEABAADCE1462B79B4B56BA`。
- `dist/latest.yml`：version 3.110.2，size 231,612,595。
- 安装版 asar：241,601,721 bytes，SHA256 `F30F8F1E0104830754B7DE069A7541009003A1181ECD5B519543F56DE1645C2B`。

## 6. 清理记录

- C 盘旧位置已删除并复核不存在：`C:\Users\凯瑞\Documents\神意助手数据`、`C:\Users\凯瑞\Documents\写作助手数据`、`C:\Users\凯瑞\AppData\Roaming\shenyi-assistant`、`C:\Users\凯瑞\AppData\Local\Programs\shenyi-assistant`。
- dist 已清理：旧 `3.110.1.exe` 与 blockmap 已删除，dist 仅保留 3.110.2 一套。
- `_audit/tmp-data-migration-report.json` 已转正为 `_audit/verification-data-migration-c-to-d/migration-report.json`；临时 `tmp-final-migration-check.json` 未保留，终态证据可由脚本随时复跑。
- 证据目录中的 227,115 bytes blockmap 是 3.110.2 第一次打包副本，与最终 227,080 bytes blockmap 不一致，已在台账登记为非主证据，不用于封装验收。

## 7. 经验回写

经验文件升级 v9.6.3 -> v9.6.4，新增 G2.14「默认存储位置与跨盘迁移」，并在使用路由第 3 条补 `默认存储/跨盘迁移 G2.14`。

## 8. 诚实边界

- 本轮不涉及 API 请求链路改动，live 供应商生成未重跑；上一轮 3.110.1 live 边界验证继续有效。
- D 盘目录中存在迁移后新产生的运行态文件与日志，终态文件数大于删除前的源文件数；业务数据哈希对账为删除前证据。
- 应用安装目录仍为 `D:\小说工坊\shenyi-assistant`；用户要求保留在 C 盘外的 Agent 与核心机制本轮未触碰。
