# DEV LOG 2026-09-16 M17 回看维度扩充与失败批次补修

> 任务：更新回头看门禁的回看维度，修复两项漏接，并重新封装
> 基线版本：3.52.0
> 状态：3.52.1 已封装

## 1. 目标与根因

1. 上一轮 3.52.0 宣称完成后，回头看发现 M17 原有维度偏文字化，缺少生产入口全量盘点、生产/验证双面扫描、交付产物独立核验等硬维度，导致漏接容易被“当前文件已修”掩盖。
2. 主页 API 对话框的 `createEditorTools` 没有接 `onFailedBatch/takeFailedBatch`，部分失败批次在主页 SKILL 路径无法只重提失败条。
3. 12 个验证/调试脚本仍用 `url().includes('index.html')` 选页面，在 `--dev` 模式下可能误选 DevTools。

## 2. 修复内容

### 2.1 M17/M24 门禁更新

`神意开发经验总结_v5.md` 升级 v5.11 -> v5.12：

- M17 扩充为 8 个回看维度：目标复述、diff 逐行归因、生产入口全量盘点、同款代码与验证器双向扫描、负向断言区分、观测与日志同步、本轮证据复核、交付产物独立核验。
- M24 修订：回头审计必须先全仓 `rg` 生产调用点，确认大纲、主页、流水线全部入口后才能判定无漏接。

### 2.2 主页失败批次接线

`src/components/chat/ChatPanel.vue`：

- 新增组件级 `homeFailedWriteBatch` carrier。
- `sendMessage()` 每轮开始清空 carrier，避免跨轮串批次。
- `buildChatEditorTools()` 内 `createEditorTools` 接入 `onFailedBatch/takeFailedBatch`。
- 主页 skill 路径与 plain 路径共用 `buildChatEditorTools`，一处接线双路径生效。

### 2.3 验证脚本页面选择器统一

12 处旧选择器 `item.url().includes('index.html')` 全部替换为 `!item.url().startsWith('devtools://')`：

- `scripts/debug-outline-state.mjs`
- `scripts/verify-dialogue-foundation.mjs`
- `scripts/verify-dialogue-foundation-stage2.mjs`（2 处）
- `scripts/verify-outline-cocreation-pipeline-smoke.mjs`（2 处）
- `scripts/verify-outline-cocreation-stage1.mjs`（2 处）
- `scripts/verify-outline-cocreation-stage4.mjs`
- `scripts/verify-outline-workspace.mjs`
- `scripts/verify-outline-workspace-error-path.mjs`
- `scripts/verify-outline-workspace-ui.mjs`

## 3. 验证记录

以下验证均在本轮执行：

1. `npm run type-check`：退出码 0。
2. `npm run test:services`：69 个文件 / 602 个测试全部通过。
3. `git diff --check`：无空白错误。
4. `rg "createEditorTools\(" src`：生产入口 3 处（OutlineWorkspace 两处 + ChatPanel 一处），全部接入 `onFailedBatch/takeFailedBatch`。
5. `rg "url\(\)\.includes\('index\.html'\)" scripts src`：命中 0。
6. 12 个修改脚本逐一 `node --check`：全部通过。

## 4. 封装交付

1. 版本升级：`3.52.0 -> 3.52.1`，并同步修复 `package-lock.json` 遗留的 3.51.0 版本分叉。
2. `npm run build:vue`：通过。
3. `npm run build`：NSIS 封装通过。
4. 产物：`dist/神意助手-Setup-3.52.1.exe`。
5. asar 独立核验：读取 `dist/win-unpacked/resources/app.asar` 内 `package.json`，版本为 `3.52.1`。
6. NSIS 配置复核：`oneClick=false`、`allowToChangeInstallationDirectory=true`。

## 5. 客户复验重点

1. 主页 API 对话框选择 SKILL 或普通对话，触发部分失败批次后，气泡应提供“只重提失败条”，成功条目不应被重复提交。
2. 3.52.0 客户已验证的大纲工作台直写、只读权限、tool-loop 显示不应回退。
3. 安装 3.52.1 时仍可自选安装路径。
