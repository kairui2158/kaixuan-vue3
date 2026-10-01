# 3.61.0 真实大纲实测后干净重封装

## 日期与范围

- 日期：2026-09-24
- 范围：真实大纲 10 轮直写组合实测完成后的干净重封装；不升级版本号，交付当前 3.61.0 的可安装产物

## 版本决策

- 实测阶段只修改验证脚本与审计文档，未修改产品源码，因此保持 `package.json` / `package-lock.json` 为 3.61.0，不做虚升版本。
- 本次重封装目的：交付包含最新实测状态与证据链的安装包，避免客户拿到早上的旧时间戳产物。

## 封装过程

1. 封装预检：
   - `node --check electron/main.js` 通过。
   - `node --check electron/preload.js` 通过。
   - `package.json` 版本确认为 `3.61.0`。
2. `npm run build`：Vue 双构建与 electron-builder Windows NSIS 完成，新产物时间戳为 2026-09-24 10:00。
3. `node scripts/verify-packaging-3-61-0.mjs`：
   - 首次执行在 `verifySidebarTooltips()` 的 `waitForFunction` 等待 `::after` 宽度时 10 秒超时。
   - 判定：源码与早上通过的 3.61.0 一致，构建参数一致，前序 asar / renderer / electronAPI 阶段均通过，属 hover 时序偶发。
   - 复跑通过：`===== PACKAGING 3.61.0 VERIFICATION PASSED =====`，`rendererFiles=74`、`electronAPI methods=77`、`sidebarTooltips=7`，证据写入 `_audit/verification-packaging-3-61-0/packaging-evidence.json`。

## 产物与哈希

- 安装包：`dist/神意助手-Setup-3.61.0.exe`
- 大小：231,438,522 bytes
- SHA256：`182C383D0BF47484449AD91D1AE01F5A0BA1726F9A1AED058A0E293E22CC89C4`
- `dist` 文件级产物盘点：仅保留当前 3.61.0 的 EXE、blockmap、builder 元数据与 `latest.yml`，无旧版本安装包残留。

## 收尾

- 临时文件：本阶段无新增临时调试文件；上一阶段 `_audit/tmp-inspect-round2.js` 已删除。
- 产物分层：未提交源码、日志与方案为当前应用事实，按 M29/M42 门禁不作为旧留存清理。
- 后续登记项保持不变：Gold 语料 28/30、`anthropic / gemini / azure-openai` live `untested`、真实 1M live 依赖外部模型。
