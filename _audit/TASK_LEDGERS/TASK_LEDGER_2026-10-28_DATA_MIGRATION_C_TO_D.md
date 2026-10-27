# 2026-10-28 默认数据存储 C 盘迁移 D 盘任务台账

## 1. 目标与原话

用户原话：「在不影响功能的前提下把数据能迁移到D盘的都迁移到D盘，而且默认的数据类存储位置从C盘能改为存储为D盘就改到D盘。」

最终可感知行为：真实安装版启动后，主数据、Electron `userData`、legacy 数据全部默认落在 `D:\神意助手数据`；C 盘 Documents 两个数据目录、Roaming `shenyi-assistant`、Local Programs 旧安装目录不再重建；业务数据在删除源前完成 SHA256 全量对账。

本轮交付物：`defaultPaths` 单源、主进程 userData 早期设置与副作用修复、storage 迁移隔离、diag/installer/脚本路径迁移、迁移对账脚本、定向测试、3.110.2 封装、DEV_LOG 与经验回写。

## 2. 门禁读证

读证文件：`_audit/神意开发经验总结_v9.md`（当前版本 v9.6.4）。

- G0.1（第 20 行）：「每轮任务先复述原始目标与最终可感知行为」。
- G0.3（第 36 行）：「完成声明必须区分已验证、未验证、无法验证、历史证据保留」。
- G0.5（第 52 行）：「每次任务收尾前必须执行回头看：对账原始目标、逐行审 diff、盘点生产入口与旁路」。
- G0.8（第 76 行）：「任务完成声明前必须分层清理……删除前核对绝对路径，删除后复核不存在并写入 DEV_LOG」。
- G0.10（第 92 行）：「删除或替换链路时必须覆盖源码、测试、脚本、规格、日志、运行状态、构建产物七层」。
- G0.12（第 112 行）：「所有非平凡任务必须产出任务台账……台账必须包含七节」。
- G1.12（封装与工作区收尾）：「先核验新安装包……再删旧产物；删除后确认只剩当前版本一套」。
- G1.13（第 274 行）：「所有 Electron 验证使用独立 profile、`SHENYI_DATA_DIR` 与 `SHENYI_ALLOW_TEST_ISOLATION=1` 双开关隔离」。
- G2.14（第 500 行）：「默认数据根必须单源化……启动早期设置 `userData` 前禁止调用 `app.getPath('userData')`」。

## 3. 路由判定

加入门禁：G0.1、G0.3、G0.5、G0.8、G0.10、G0.12、G1.1、G1.12、G1.13、G2.14。

排除项及理由：

- G0.2 无预算铁律：用户已明确不设预算，本轮不设置任何 token/时间预算。
- G0.11 真实交互冒充禁令：本轮验证目标是安装、启动、路径与数据完整性，没有需要用户点击完成的 UI 行为；已用真实安装版进程启动替代。
- G2.8 存储域：本轮不改存储键值语义，只改默认根路径与迁移，G2.14 为更具体规则。
- G2.11 供应商域：不触碰供应商请求链路，live API 边界沿用 3.110.1 验证。
- G2.12 窗口/进程域：只验证启动进程存活与退出无残留，不修改窗口状态语义。

## 4. 影响圈与作者反证

打算改的：`electron/defaultPaths.js`、`electron/main.js`、`electron/ipc/storage.js`、`electron/ipc/storage.spec.js`、`electron/ipc/diag.js`、`build/installer.nsh`、6 个 verify/diagnose 脚本、`scripts/verify-data-migration-c-to-d.mjs`、`package.json`、经验文件、DEV_LOG、MASTER_INDEX。

可能碰到的：Electron 启动早期路径副作用、迁移 marker 逻辑、测试隔离、安装器卸载提示、历史验证脚本默认路径。

作者反证：

1. 假设「提前读取 `userData` 无副作用」。证伪：删除 C 盘后空目录复发，日志与路径推演定位到 `app.getPath('userData')` 读取副作用；修复后连续启动四个 C 盘位置均未重建。
2. 假设「迁移对账脚本可以在删除源后复跑」。证伪：源目录删除后脚本 ENOENT；已补 `sourceExists:false` 终态分支，复跑输出 `ok:true`。
3. 假设「硬编码路径已全部迁移」。证伪：`rg` 复查发现 `diag.js` 保留旧 Documents fallback、6 个脚本仍用 C 盘绝对路径；均改走 `defaultPaths` 或受控 fallback。
4. 假设「安装后无需再打包」。证伪：收尾阶段修改了对账脚本，虽不影响 app.asar，但按 G1.12 完整重打包并重新安装核验，避免安装包与工作区证据不同源。

## 5. 停止条件

1. `package.json` 版本为 3.110.2，`npm run build` exit 0。
2. `defaultPaths.spec.js` 与 `storage.spec.js` 全部通过。
3. 迁移前对账：三组业务数据 `differencesCount:0`。
4. 迁移后终态：脚本输出 `ok:true`，三个源目录 `sourceExists:false`，目标文件数分别大于 0。
5. C 盘四个旧位置 `Test-Path` 全 false，且安装版启动 15 秒后仍全 false。
6. 安装版日志出现且仅出现 D 盘 `storage-paths`；退出后无 `神意助手` 残留进程。
7. dist 仅保留 3.110.2 一套安装包；DEV_LOG、台账、MASTER_INDEX、经验文件齐备。
8. git 提交后 `git status --short` 为空。

## 6. 执行证据

- `node --check electron/main.js electron/defaultPaths.js electron/ipc/storage.js electron/ipc/diag.js scripts/verify-data-migration-c-to-d.mjs`（分次执行）→ 全部 exit 0。
- `npx vitest run electron/defaultPaths.spec.js electron/ipc/storage.spec.js` → `Test Files 2 passed (2)`、`Tests 8 passed (8)`。
- `node scripts/verify-data-migration-c-to-d.mjs` → `ok:true`；三个报告均为 `sourceExists:false`、`differences:[]`、`differencesCount:0`，目标文件数 1886 / 12 / 471。
- `npm run build` → exit 0；`dist/神意助手-Setup-3.110.2.exe` 231,612,595 bytes，SHA256 `687F85DB5BF9B17DE1C86C4697B49C56285B7E530189AC04F996566B76DAF3FC`。
- 安装器 `/S` 安装后：`D:\小说工坊\shenyi-assistant\神意助手.exe` FileVersion/ProductVersion `3.110.2 / 3.110.2.0`。
- 启动回归 15 秒：C 盘四个旧位置 `False`；进程 5580/43516/45044/45760 存活；日志 `[2026-10-28 06:45:46.762] storage-paths: dataDir=D:\神意助手数据 userData=D:\神意助手数据\_app-user-data legacyDir=D:\神意助手数据\_legacy`。
- 退出后：`remaining=` 为空，C 盘四个旧位置仍全 false。
- 源码复查：`rg "Documents.*神意助手数据|AppData.*shenyi-assistant|写作助手数据" electron src build` 只剩 `defaultPaths` fallback、`storage.js` 迁移候选与安装器文案；生产读写无 C 盘绝对路径。
- `dist` 当前仅 3.110.2 exe、blockmap、latest.yml、builder 配置与 3.110.2 unpacked 目录。

## 7. 缺口清单

- 本轮无阻塞性缺口。
- 非阻塞边界 1：live 供应商请求链路本轮未重跑；数据迁移不触碰 API 请求代码，3.110.1 live 边界证据继续有效。
- 非阻塞边界 2：证据目录内保存的 227,115 bytes blockmap 是第一次打包副本，与最终 227,080 bytes blockmap 不同；已登记，不作为封装验收主证据。
- 非阻塞边界 3：D 盘目标目录包含迁移后运行态新文件，终态文件数大于删除前源文件数；业务数据等价性由删除前哈希对账证明。
