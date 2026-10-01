# 开发日志：3.55.0 设计融合与意图路由成熟化封装（2026-09-20）

## 交付目的

将设计融合 Graphite Ink V1/V2、意图路由 V6 Phase 1/2、API 直写协议 Electron 压测与当前应用事实封装为 `3.55.0`，交付 NSIS x64 安装包。

## 封装前门禁

1. `node --check electron/preload.js`：exit 0，未复现 09-20 首包 preload 闭合括号事故。
2. 工作区分层审计：git 长期脏状态中的源码、测试、方案、日志、经验文件均属于当前应用事实，未删除任何未提交改动。
3. 旧产物判定：旧 `3.55.0` 安装包生成于 `2026-09-20 18:37`，而 `src/styles/base-components.css` 最新修改为 `2026-09-21 00:19:36`；旧包落后最新源码约 5 小时 44 分钟，按 M28 判定不可交付。
4. 清理执行：删除旧 `win-unpacked`、旧 `3.55.0` 安装包与 blockmap、旧 builder 配置文件；清理脚本先校验目标绝对路径位于 `D:\codex\novel-workshop-vue3\dist` 再删除，删除后 `REMAINING_COUNT=0`。

## 构建过程

- 命令：`npm run build`
- 输出：`vite build` 主构建 1669 modules；`vite build --config vite.protocols.config.mts` 生成 `providerProtocols.cjs`；electron-builder 25.1.8 打包 NSIS x64。
- 构建 `index-LC9rjI-0.css` 234.87 kB，`index-DiDIJZED.js` 746.27 kB。
- 签名：未配置代码签名证书，electron-builder 明确输出 signing skipped。

## 产物核验

| 项目 | 证据 |
| --- | --- |
| 安装包 | `dist/神意助手-Setup-3.55.0.exe`，231,416,905 bytes，2026-09-21 00:31:07 |
| Blockmap | `dist/神意助手-Setup-3.55.0.exe.blockmap`，227,932 bytes |
| SHA256 | `DC06A151F84A9C84FFA93BC1C089AFEA19BD5898B48F19E02A22F7F8E7F4DD7D` |
| EXE 元数据 | FileVersion `3.55.0`，ProductVersion `3.55.0.0`，ProductName `神意助手` |
| asar 版本 | `@electron/asar` 读取 `app.asar/package.json`：`3.55.0` |
| 主进程入口 | `electron/main.js`；preload `electron/preload.js` 均在 asar 内且非空 |
| renderer 完整性 | asar 内 `dist-renderer` 74 个条目，含 `index.html` 与资产 |
| M28 新鲜度 | `app.asar` 2026-09-20T16:29:38Z 晚于最新源码 `src/styles/base-components.css` 2026-09-20T16:19:36Z，且 `dist-renderer/assets` 每个文件均新于全部源码 |
| 打包应用启动 | `win-unpacked/神意助手.exe` 启动成功，渲染正文 871 字符，无“无法加载/白屏” |
| preload 桥接 | 真实打包窗口中 `window.electronAPI` 存在，暴露 74 个 IPC 方法 |
| NSIS 配置 | `oneClick: false`、`allowToChangeInstallationDirectory: true`、`include: build/installer.nsh` |
| 旧产物复核 | `dist` 仅 1 个安装包、1 个 blockmap；无旧版本产物 |
| 根目录污染 | `runTrace.js` 不存在；仓库根 `package.json` 未被 asar 解包覆盖 |

核验脚本：`scripts/verify-packaging-3-55-0.mjs`，证据：`_audit/verification-packaging-3-55-0/packaging-evidence.json`。

## 验证脚本事故与修复

1. 首版 asar renderer 校验使用 `/` 路径匹配，而 Windows `listPackage()` 返回 `\` 分隔路径，误报 `index.html` 缺失。修正为按 basename 校验，未放宽任何断言。
2. 首版脚本验证通过但挂在 Node 收尾事件循环，命中 M44 精神但未完全满足其强杀要求。已补齐 `finally` 中 `electronApp.close()` 超时后 `taskkill /PID /T /F`，并显式 `process.exit(0)`，最终干净退出。
3. 该脚本保留在 `scripts/`，作为后续 3.55.x 封装可复用核验入口。

## 已验证与未验证

- 已验证：preload 语法、完整生产构建、NSIS 配置、安装包哈希与元数据、asar 独立版本/入口/renderer 核验、M28 新鲜度、真实打包产物启动、`window.electronAPI` 存在、旧产物清理与复核。
- 未验证：NSIS 安装器尚未执行完整客户安装流程；本包未签名；设计融合与意图路由的功能深度验收仍以上一轮 20 轮反查与全量测试证据为准。

## 客户验证入口

1. 运行 `dist/神意助手-Setup-3.55.0.exe`，确认可选择安装路径。
2. 启动后确认界面为 Graphite Ink 融合后的整体观感，重点看 ≤760、761-799、800+ 三档格局与章节树隐藏行为。
3. 在设置/API、技能、智能体等页面确认 token、组件、图标与确认层级无新旧样式并存。
4. 发起大纲、编辑、生成请求，导出运行记录确认意图路由与工具面仍为 V6 Phase 2 行为。
