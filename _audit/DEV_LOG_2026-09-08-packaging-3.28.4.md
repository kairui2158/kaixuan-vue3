# 开发日志：3.28.4 封装交付（2026-09-08）

## 开发功能

将 Folder SKILL 导入入口修复封装为 `3.28.4` 安装包，并完成 `package.json` 误覆盖事故的恢复与验证。

本次版本包含：

1. 设置页“导入文件夹技能”和“重新选择文件夹”使用目录选择器，用户可在文件夹层级直接导入。
2. “批量导入文件夹技能”误选技能文件夹本身时，不再逐级深入或显示空结果，而是提示返回上一级选择包含它的根目录。
3. 批量导入空扫描分支新增回归测试，防止入口修复失效。

## 交付目的

向客户提供可直接安装的 `3.28.4` 版本，验证 Folder SKILL 单个导入、重新选择、批量导入的真实操作体验，确保帮助指南中的“电脑任意位置导入”说明与实际按钮行为一致。

## 验证证据

- `npm run type-check`：退出码 0，输出 `shenyi-assistant@3.28.4 type-check`。
- `npm run test:services`：13 个测试文件通过，142 个测试通过，输出 `Test Files 13 passed (13)`、`Tests 142 passed (142)`。
- `npm run build`：Vite 主构建 1607 modules transformed，providerProtocols 构建 8.18 kB，electron-builder NSIS 打包完成。
- 产物：`dist/神意助手-Setup-3.28.4.exe`，大小 `129,774,373` 字节。
- 产物：`dist/神意助手-Setup-3.28.4.exe.blockmap`，大小 `135,343` 字节。
- SHA256：`49DB16F803BC91AF73843CE2A1B9DE5778F60F896DC9D9B2A44164280AB62435`。
- app.asar 版本验证：通过 `@electron/asar` API 读取 `package.json`，输出 `shenyi-assistant 3.28.4`。
- 构建产物 `dist-renderer/assets/SkillSettings-DX-uy_Bc.js` 可检索到 `返回上一级，选择包含它的根目录`，确认导入纠错文案已进入构建。
- 签名状态：未签名，electron-builder 日志显示 `no signing info identified, signing is skipped`，与 3.28.2、3.28.3 保持一致。
- Electron 进程检查：构建前 `Get-Process -Name electron` 无输出，无残留进程。

## package.json 恢复记录

验证 asar 版本时曾在仓库根目录执行 `asar extract-file`，导致安装包内精简版 `package.json` 覆盖工程根目录清单；随后用 `git show HEAD:package.json` 恢复时，又引入旧版 `3.20.2` 单行内容。

恢复过程：

1. `package-lock.json` 根记录保持 `3.28.4`，依赖清单完整，作为依赖版本依据。
2. 从 git unreachable blob 中找到完整 3.28.2 清单 `bb00695850d2cace8fbdc207185b4aff5d47a077`，其包含 `.mts` 双构建脚本、13 个服务测试入口和全部近期依赖。
3. 使用 `apply_patch` 恢复该完整清单，并将版本改为 `3.28.4`。
4. 恢复后重新执行类型检查、服务测试和完整构建，三道验证门全部通过。

## 客户验证重点

1. 设置页技能栏点击“导入文件夹技能”，选择器应停留在文件夹层级，不再要求逐级下钻。
2. 批量导入时选择某个技能文件夹本身，应出现“返回上一级，选择包含它的根目录”的明确提示。
3. 批量选择包含多个技能文件夹的根目录，应能列出候选并按新增/跳过/覆盖策略导入。
4. 安装后关于页或版本信息显示 `3.28.4`。

## 遗留说明

- 本包未做安装版 CDP 实操验证；Folder SKILL 导入入口已通过服务测试与构建产物关键词验证，实际安装版体验交由客户实测。
