# 2026-09-09 降AI硬规则架构V2封装（3.32.0）

## 开发功能

将「降AI硬规则架构V2」与同批次链路修复封装为 `3.32.0` 安装包。本包包含：

1. 硬规则三模式：`detect-report`（默认检测报告，不改写正文）、`deep-fix`（模型最小编辑 + 门禁回滚）、`legacy-auto`（兼容安全替换）。
2. `detectBody()` 检测器：AI高频词、禁用词、禁用句式、破碎标点、句长趋同、连接词密度、保护片段回对。
3. 深度修复门禁：保护片段回对 + `passesBodyIntegrityCheck()`，失败自动保留原文。
4. 运行记录接入：流水线正文层写入 `deai-detect` / `deai-minimal-edit` 事件。
5. 同批次已验证内容：chain 意图路由 V2、流水线五层信息注入链路修复、正文层硬规则安全化。

## 交付目的

正文默认不再被静默改写。用户和第三方 SKILL 制作方先拿到可解释的分级检测报告，需要修复时走受控最小编辑，失败保留原文；同时让降AI处理现场可复现、可导出、可调试。

## 验证证据

- 封装前验证：`npm run type-check`、`npm run build:vue` 通过。
- 单元测试：`node scripts/tests/deai-v2.test.mjs` → `9 tests passed`。
- 源 Electron + CDP 探针：16/16 步通过，`runtimeErrors: []`，`restored: true`，`residual: []`。
- 重封装说明：首次 `15:34:12` 产物经 asar 抽查确认仍为旧渲染代码，本轮已作废并重新构建打包。
- 构建产物：`dist/神意助手-Setup-3.32.0.exe`，大小 `134,906,869` 字节，时间 `2026-09-09 21:39:41`。
- SHA256：`55A2EF20F5739110213BA9039582A218ADCA6A9A27D1F02229798C8FBAF7FC33`。
- `dist/latest.yml` 版本为 `3.32.0`，size `134906869`，sha512 与产物一致：`nn2d2zRHuakEandoa7es8y1VwPzH1df9LrN/kBQtpfEu3D1I/j6Jpf518Zz7Qch84Pno4VWltbkQDMmCZRlqiw==`。
- app.asar 版本验证：`@electron/asar` 读取 `package.json` 输出 `version=3.32.0`。
- 渲染产物验证：`DeAiSettings-C3otFAMD.js` 与 `deai-CUcDaNCD.js` 均包含 `detect-report` / `deep-fix` / `legacy-auto`；`DeAiSettings-DAwl3iUs.css` 包含 `detect-report` / `deai-detect` 样式标识。确认本次安装包不再是旧渲染代码。
- 签名状态：未签名，与历史版本一致。

## 客户验证重点

1. 安装后关于页 / 安装包属性显示 `3.32.0`。
2. 设置页「去AI味」可见三模式：检测报告（推荐）、深度修复、兼容自动替换。
3. 默认检测报告模式下生成正文：正文保持 API 原始输出，日志显示“需处理 / 建议”数量，运行记录出现「降AI检测报告」事件。
4. 深度修复模式：正文生成后触发最小编辑请求；API失败或门禁不过时，最终仍保留原始正文。
5. 兼容模式：仅做安全替换，不再出现吞标点、段落打碎问题。
6. 主页编辑器“查看报告”入口可打开分级报告；设置页可看到最近检测摘要。

## 边界说明

- 本包基于本轮已完成的源 Electron CDP 验证交付；安装版实操由客户确认。
- `dist` 内保留历史版本安装包，本轮未获清理授权。
