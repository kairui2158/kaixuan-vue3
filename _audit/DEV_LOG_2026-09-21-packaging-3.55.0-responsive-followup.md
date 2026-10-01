# 开发日志：3.55.0 响应式反查后重封装与仓库清理（2026-09-21）

## 交付目的

将 20 轮设计融合响应式溢出反查后的最新源码重新封装为 `3.55.0` NSIS x64 安装包，并清理仓库中不再需要的旧打包产物与设计审计中间文件。

## 清理范围

1. 删除旧 `dist/win-unpacked`、旧 `神意助手-Setup-3.55.0.exe`、旧 blockmap、旧 `latest.yml`、`builder-debug.yml`、`builder-effective-config.yaml`。旧包生成于 `2026-09-21 00:31`，晚于它的 `src/components/settings/SkillSettings.vue` 修改于 `2026-09-21 12:09`，按 M28 新鲜度门禁不可交付。
2. 删除设计融合审计临时文件：`_audit/design-font-size-raw.txt`、`_audit/design-token-audit.txt`、`_audit/design-token-audit-current.txt`、`_audit/design-token-audit-after-fix.txt`。
3. 保留全部开发日志、方案、经验文件、验证 JSON/PNG 证据、源码、测试与 `_audit/verification-packaging-3-55-0/`。
4. 清理脚本只在执行期间存在，完成后已删除；脚本内置仓库根目录校验与 `dist` 绝对路径校验。

## 产物

| 项目 | 证据 |
| --- | --- |
| 安装包 | `dist/神意助手-Setup-3.55.0.exe`，231,421,669 bytes，2026-09-21 17:05:30 |
| Blockmap | `dist/神意助手-Setup-3.55.0.exe.blockmap`，227,558 bytes |
| SHA256 | `3E2352E8000617860252FC380B77B35FEAF57DDFD9E39A112641523DF8552DC3` |
| EXE 元数据 | FileVersion `3.55.0`，ProductName `神意助手`；`win-unpacked/神意助手.exe` FileVersion `3.55.0` |
| asar 版本 | `app.asar/package.json` version `3.55.0` |
| Renderer | asar 内 `dist-renderer` 74 个条目，含 `index.html` 与资产 |
| 新鲜度 | asar mtime `2026-09-21T09:04:14.643Z` 晚于最新源码 `SkillSettings.vue` `2026-09-21T04:09:14.486Z` |
| 打包启动 | `win-unpacked/神意助手.exe` 启动成功，渲染正文 871 字符，无“无法加载/白屏” |
| preload 桥接 | `window.electronAPI` 暴露 74 个 IPC 方法 |
| 证据文件 | `_audit/verification-packaging-3-55-0/packaging-evidence.json` |

## 验证

1. `npm run build`：exit 0，Vite 主构建 1669 modules，electron-builder 25.1.8 完成 NSIS x64。
2. `node scripts/verify-packaging-3-55-0.mjs`：输出 `===== PACKAGING 3.55.0 VERIFICATION PASSED =====`。
3. `Get-FileHash -Algorithm SHA256`：见上方哈希。
4. 仓库清理复核：`dist` 清理后重建成当前产物；4 个设计审计临时 txt 均不存在；`dist/` 与 `dist-renderer/` 均为 git ignored；根目录无一次性清理脚本残留。
5. 本包未配置代码签名，electron-builder 输出 signing skipped。

## 未验证

NSIS 安装器尚未执行完整客户安装流程；设计融合与意图路由的功能深度验收以上一轮 20 轮反查、723 个服务测试与响应式矩阵为准。
