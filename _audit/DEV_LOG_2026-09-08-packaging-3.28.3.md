# 开发日志：3.28.3 封装交付（2026-09-08）

## 开发功能

将帮助指南大白话教学更新封装为 `3.28.3` 安装包，并同步 `package.json` 与 `package-lock.json` 版本号。

本次版本包含：

1. 帮助指南 12 个章节按大白话教学重讲。
2. 新增“技能与 Folder SKILL”章节，说明 Folder SKILL 的理解方式、电脑任意位置导入、重新选择文件夹等操作。
3. 新增“多窗口”章节，说明多项目同时创作的使用方式与限制。

## 交付目的

向客户提供可直接安装的 `3.28.3` 版本，让用户不依赖外部文档即可在应用内理解创作流程、配置关系和 Folder SKILL 导入规则。

## 验证证据

- `npm run type-check`：通过。
- `npm run build`：Vite 双构建成功，electron-builder 生成 NSIS 安装包。
- 产物：`dist/神意助手-Setup-3.28.3.exe`，大小 `129,773,684` 字节。
- 产物：`dist/神意助手-Setup-3.28.3.exe.blockmap`，大小 `135,463` 字节。
- SHA256：`045DD513914D2B201492581A32F7E73C0DDEF9691B37B4D794323F8569304C8F`。
- app.asar 版本验证：`node _audit/tmp/verify-asar-version-3-28-3.cjs` 输出 `version=3.28.3`，确认安装包内部版本号与文件名一致。
- 构建产物 `dist-renderer/assets/index-D1iSOfyL.js` 可检索到 `技能与 Folder SKILL`、`Folder SKILL 怎么理解`、`电脑任意位置`、`重新选择文件夹`、`多窗口` 等关键词，确认新版帮助文案已进入构建。
- 签名状态：未签名，electron-builder 日志显示 `no signing info identified, signing is skipped`，与 3.28.2 保持一致。

## 客户验证重点

1. 顶部帮助菜单可以打开，12 个章节可以切换。
2. “技能与 Folder SKILL”章节可以看到“电脑任意位置导入”“重新选择文件夹”等说明。
3. “多窗口”章节说明清晰，能指导用户使用不同项目窗口。
4. 安装后关于页或版本信息显示 `3.28.3`。

## 遗留说明

- 本包未做安装版 CDP 实操验证；帮助指南已在构建产物层面确认进入安装包，实际阅读体验交由客户实测。
