# 3.61.0 API 直写 100% 闭环封装

## 日期与范围

- 日期：2026-09-24
- 范围：API 直写 100% 闭环 Phase 7/8 收口后的版本升级、NSIS 封装、真实启动验证与旧产物清理

## 交付内容

1. 应用版本从 3.60.0 升级到 3.61.0，`package.json` 与 `package-lock.json` 同步。
2. 新增 `scripts/verify-packaging-3-61-0.mjs`，删除 3.60.0 旧验证器，避免新旧版本并存。
3. `scripts/cleanup-verification-artifacts.mjs` 清理目标更新为 3.60.0 旧产物与旧验证证据。
4. `_audit/SKILL_HANDOFF_API_DIRECT_WRITE_TOOLS.md` 适用版本同步到 3.61.x。
5. 交付 `dist/神意助手-Setup-3.61.0.exe`，保留 NSIS 路径可选安装。

## 验证

- `npm run build`：Vue 双构建与 electron-builder Windows NSIS 全部完成，产物为 `dist/神意助手-Setup-3.61.0.exe`。
- `node scripts/verify-packaging-3-61-0.mjs`：真实启动打包应用，asar 版本 3.61.0、renderer 74 个文件、electronAPI 77 个方法、7 个侧栏 tooltip 几何核验通过。
- 打包产物 Electron 直写 13 场景实测：设置 `SHENYI_DIRECT_WRITE_ELECTRON=dist\win-unpacked\神意助手.exe` 重跑 `scripts/verify-api-direct-write-electron.mjs`，全部通过；S/M/L 三档、1M 硬断言、trace 导出在打包构建内成立。
- `node scripts/cleanup-verification-artifacts.mjs`：3.60.0 旧安装包、blockmap、验证证据与 live 临时 profile 全部清理。

## 后续

- 验收状态：Phase 1-8 已按方案收口。登记项保持透明：Gold 语料 28/30（等待真实 confirmed 样本回流）；`anthropic / gemini / azure-openai` 为协议级 pass、live `untested`（缺对应供应商密钥）；真实 1M 模型 live 依赖外部模型，不使用 mock 伪装。
