# DEV LOG - 2026-11-13 - scripts lifecycle P0 inventory

## 交付

按已批准的 `PROPOSAL_2026-11-13_SCRIPTS_LIFECYCLE_AUDIT_V1.md` 执行 P0：生成 195 个 `scripts/` 文件的生命周期清单与自证仪器。本轮只审计，不删除、不归档、不改产品代码。

## 仪器修复

1. `build-inventory.ps1` 移除自测夹具内部清理，改由 `negative-case.mjs` 统一清理，修正“仪器先删证据、测试后验 CSV”的时序缺陷。
2. `build-inventory.ps1` 为每份脚本初始化空父依赖数组，消除 `ContainsKey($null)` 导致真实仓库清单失败。
3. `negative-case.mjs` 从 builder 输出的 `runDate` 推导 CSV 名，消除 Node UTC 与 PowerShell 本地日期跨天造成的假失败。

## 验证

1. `node _audit/scripts-lifecycle/negative-case.mjs`：`NEGATIVE-PATH-HARNESS: PASS`，exit 0。
2. `pwsh.exe -NoProfile -ExecutionPolicy Bypass -File _audit/scripts-lifecycle/build-inventory.ps1`：exit 0。
3. 清单：`_audit/scripts-lifecycle/INVENTORY_2026-11-13.csv`，195 rows，195 script files，193 git tracked，SHA256 `09C59A654522CB03C30C9CC7C70AADDC81AF9BEEF367069849C92CF1F8A4053A`。
4. 分类合计：npm=11、src-electron=1、doc-spec=6、internal-chain=25、none=152。
5. 质量初筛：catch-silent 116 files、destructive 124 files（含 `scripts/tmp/verify-chapter-batch-ui-electron.mjs`）、subprocess 121、provider 99、live 19、no-timeout 69、secret-suspicion 61；重复哈希组 0。
6. Tier B 六个 doc-spec 文件与 25 个 internal-chain 成员均已在 CSV 逐个列名；61 个 secret-suspicion 文件按契约进入 `quarantine-only` 或 keep+review。
7. `git diff --check`：通过。

## 基线漂移

1. 方案登记的静默吞错基线为 455 处 / 115 files；当前临时口径 `rg` 为 449 lines / 112 files，builder 按其多规则口径报 116 files。以 CSV 与证据文件为准，P1 不继承旧数。
2. 方案登记的破坏性基线为 123 files；该口径排除 tmp。builder 按全部 scripts 报 124 files，差异仅为 `scripts/tmp/verify-chapter-batch-ui-electron.mjs`。
3. `secret-suspicion` 为初筛规则命中，包含固定测试假键、脱敏断言和 safeStorage 字段名；P1 必须逐文件复核，不当作真实泄密定罪。

## P1/P2/P3 执行收口（2026-11-13）

1. P1：`build-batch-plan.ps1` 修复语法缺陷后 exit 0，输出 `keep=36 quarantine=58 retire=95 archive=6; batches=51`；BATCH_PLAN 与 95 候选仓库级复扫完成。
2. P2：B01-B51 全部完成；`scripts/` 从 195 个文件收敛到 94 个；B01-B49 每批独立退役并打 tag，B50/B51 归档链与 tmp 产物。每批 ledger 含 SHA-256 与负向断言，B01-B51 tag 与 101 条哈希行闭环。
3. P3：保留/隔离面仍含 catch-silent 与破坏性命中，已登记为后续冻结/修复分账；本轮未把历史-only 资产升格修复，未新增守卫代码。
4. 仪器：`execute-p2.ps1` 完成批次恢复、计划解析对已删文件放行、工作区边界校验、SHA-256 对账、负向引用断言与路径白名单；已随本轮证据提交。

## 边界

1. 未触碰 `scripts/`、产品代码、folder SKILL、`package.json`。
2. 未执行 P1 批次划分、P2 归档/删除或 P3 质量修复。
3. 未升级版本或封装安装包；P1/P2/P3 仍需用户另行批准。

## P3 质量修复收口（2026-11-13）

1. 按“最小必要性”修复 3 个 active 保留脚本的真静默吞错：outline workspace 的 4 处 UI 状态探测、packaging 关闭异常、deai 失败章节快照落盘；均改为显式 `console.warn`，不改成功路径语义。
2. CDP 轮询、进程/目录清理、JSON 默认值、崩溃取证类 best-effort 兜底保留，理由已在任务台账 §13 登记。
3. `node --check` 三脚本全部通过；`git diff --check` 无空白错误；修复与 P2 删除/归档分账独立提交。
4. 终局复核发现 `execute-p2.ps1` 表头单引号导致 51 份批次台账写入字面量 `path`taction`；已修正生成器为双引号，并将 51 份 TSV 表头就地归一为真实制表符，哈希数据与 101 行对账不受影响。

## 3.127.2 交付复核与封装（2026-11-13）

### 对账结果

1. 复用台账已有证据：`scripts/` 终态 94 文件；51 份批次台账、101 条哈希行、0 个字面量表头复测通过。
2. 剩余分账面如实保留：INVENTORY 中 `keep=18`、`quarantine-only=57`、`decision-required=120`，不并入本轮交付。
3. 3.127.1 基线 `npm run test:services` 复测为 250 files / 2734 tests passed；台账 2740 为 2026-11-12 旧快照，不继承。
4. 封装前置 `npm run type-check` exit 0；`npm run build:vue` / `electron-builder --win` 完整构建 exit 0。

### 交付物

1. 版本：3.127.1 → 3.127.2。
2. 安装包：`dist/神意助手-Setup-3.127.2.exe`，231,667,073 bytes，SHA-256 `04cdfcec1f23ed99bd12e90595c46057f51bfaa1b242af115aee043f062590fc`。
3. 封装核验：`npm run verify:packaging` exit 0，`verdict=pass`，rendererFiles=87，electronAPI methods=94；`electronApp.close` 15s 超时由 P3 显式 warn + 进程兜底处理，不改判封装失败。
4. 经验回写：G1.21 增补“新增脚本必须先进入生命周期清单与批次计划、临时脚本只允许 `scripts/tmp/`、禁止版本化副本”的长期维护规则。

### 分支处置

1. 本地 `master` 与当前 HEAD 同源：HEAD 领先本地 master 218 commits，本地 master 理论可 fast-forward 到 HEAD。
2. `origin/master` 与 HEAD 分叉：merge-base 是 `29e321be...`，远端另持 56 commits，HEAD 领先远端 merge-base 274 commits；本轮不做强推覆盖，远端 56 commits 需单独审计后另行裁决。
3. `git rev-parse 'refs/heads/master^{commit}'` 正常返回 `ac278a74...`；前轮 base64 乱码为 Windows 引号解析假象，ref 文件与 packed-refs 均健康。
