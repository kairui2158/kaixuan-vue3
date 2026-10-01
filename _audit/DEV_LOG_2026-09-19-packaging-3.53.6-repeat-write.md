# 开发日志：3.53.6 重复写入语义收口封装（2026-09-19）

## 交付目的

将主页 API 同轮多次直写修复与“连续相同写入拦截”语义统一封装为 `3.53.6`，交付客户验证：同一轮对话允许多次不同写入，连续 3 次完全相同写入返回 `duplicate_write_blocked`。

## 本轮内容

1. `src/components/chat/ChatPanel.vue`：主页直写快照改为现场读取当前页签内容，避免固定旧快照导致后续写入被 `version_changed` 误拒。
2. `scripts/verify-api-direct-write-v2-e2e.mjs`：场景 8 从旧“单次写入上限”改为“同轮多次不同写入成功 + 第 3 次完全相同写入拦截”。
3. `_audit/FOLDER_SKILL_SPEC_V1.md`：活动规范同步新语义，不再使用“写入上限”。
4. 删除源码版与安装版验证目录中的旧截图 `08-home-write-limit.png`，统一为 `08-home-repeat-write-guard.png`。

## 封装过程

1. 封装前分层审计：`git status --short` 中的修改均为本轮应用事实与验证证据，不作为旧留存清理。
2. `npm run type-check`：通过，0 error。
3. `npm run build`：Vite 主构建 1654 modules transformed，providerProtocols 2 modules transformed，electron-builder 生成 NSIS 安装包。
4. 构建中 `rcedit` 曾连续三次报 `Unable to commit changes`，随后重试链路完成打包。最终核验确认元数据完整，不作为交付缺陷；但保留该现象，后续若再次出现应先检查文件占用。
5. 签名状态：未配置代码签名证书，electron-builder 显示 signing skipped；客户首次运行可能看到系统未知发布者提示。

## 产物核验

| 项目 | 证据 |
| --- | --- |
| 安装包 | `dist/神意助手-Setup-3.53.6.exe`，130,386,127 bytes，2026-09-19 10:05:12 |
| Blockmap | `dist/神意助手-Setup-3.53.6.exe.blockmap`，135,668 bytes |
| 未安装版 | `dist/win-unpacked/神意助手.exe`，189,111,296 bytes |
| EXE 元数据 | FileVersion `3.53.6`，ProductVersion `3.53.6.0`，ProductName `神意助手` |
| asar 版本 | `@electron/asar` 读取 `app.asar/package.json`：`3.53.6` |
| NSIS 配置 | `oneClick: false`，`allowToChangeInstallationDirectory: true`，`include: build/installer.nsh` |
| SHA256 | `B4E0B3340D86E8353CEE4EDBF66C902072F58C6C5044AF17F6F3F1D53B272276` |
| 旧产物清理 | `dist` 仅保留 `神意助手-Setup-3.53.6.exe` 一套安装产物 |

## 已验证与未验证

- 已验证：类型检查、源码 Electron E2E、安装版 Electron E2E、生产构建、安装包版本元数据、asar 版本、NSIS 自定义安装目录配置、SHA256。
- 未验证：本轮封装包尚未由客户完成人工实操验收。

## 客户验证入口

1. 安装 `dist/神意助手-Setup-3.53.6.exe`，确认可选择安装路径。
2. 在主页 API 对话框发起一轮明确写入请求，要求连续追加两次不同内容；两次都应写入成功。
3. 让模型连续提交 3 次完全相同写入；第 3 次应提示“检测到连续 3 次完全相同的编辑器写入请求，本次重复写入已拦截”。
4. 导出运行记录，确认 `duplicate_write_blocked`、`home-repeat-write-guard` 与两次成功写入证据完整。
