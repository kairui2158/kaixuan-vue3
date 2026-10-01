# 2026-09-23 3.59.0 侧栏 Tooltip 修复封装

## 目标

将侧栏 tooltip 溢出修复与 20 轮反查成果交付为 3.59.0 安装包，并执行 M28/M29/M42/M43/M44/M45/M53/M54/M60 门禁：全量测试、类型检查、生产接线、生产构建、NSIS 产物、真实打包启动核验、旧产物清理与日志登记。

## 版本与产物

- 版本：`package.json` 与 `package-lock.json` 均为 3.59.0。
- 安装包：`dist/神意助手-Setup-3.59.0.exe`。
- 大小：231428005 bytes。
- SHA256：`4E9424F8101D1D9E5264E0C858EF289889DF0A034C88DC31F4EF98E0A42E4F25`。
- NSIS 有效配置保持 `oneClick: false`、`allowToChangeInstallationDirectory: true`，客户可自选安装路径。

## 封装前修复

1. `npm run verify:production-wiring` 首轮发现 `editTaskExecutor → toolLoopPolicy` 被 `tool-loop-policy-single-source` 规则误报。源码实际通过 `normalizeToolIterations(options.scenario)` 消费单源，属于 EditTask 新入口后规则允许列表未同步。已把 `editTaskExecutor` 纳入显式允许列表，并在 `toolLoopPolicy.spec.ts` 新增契约测试锁定 import 与 dependency-cruiser 规则。
2. 新增 `scripts/verify-packaging-3-59-0.mjs`，删除 `scripts/verify-packaging-3-58-0.mjs`，保持封装验证入口新去旧、不并存。
3. 打包验证脚本发现并修复三个验证器缺陷：
   - 旧脚本 `finally` 无条件 `process.exit(0)`，真实异常被吞掉形成假绿；已改为 `verificationPassed` 控制退出码并输出真实异常。
   - Playwright `boundingBox()` 返回 `x/y/width/height`，脚本误用 `left/right` 导致 NaN 假失败；已修正几何换算。
   - 64px 绝对宽度下限与真实中文短标签（如“记忆”24px）冲突；已改为按 CJK/ASCII 估算文本宽度的相对下限，同时保留四边视口断言。
4. Electron 页面 `viewportSize()` 可能返回 null，打包核验改用页面 `window.innerWidth/innerHeight` 作为视口事实源。

## 封装核验

`node scripts/verify-packaging-3-59-0.mjs` 通过：

```text
===== PACKAGING 3.59.0 VERIFICATION PASSED =====
asar=dist\win-unpacked\resources\app.asar; rendererFiles=74; electronAPI methods=77; sidebarTooltips=7; evidence=_audit\verification-packaging-3-59-0\packaging-evidence.json
```

核验内容：

- asar `package.version = 3.59.0`，`main = electron/main.js`，main/preload 均非空。
- renderer 文件 74 个，包含 `index.html`，且新于全部 `src/electron/public/build/resources` 与构建配置。
- 打包应用真实启动，`window.electronAPI` 77 个方法可用。
- 正文渲染长度 429，不包含“无法加载/白屏”。
- 本地意图 embedding 模型从打包 `resources/models/bge-small-zh-v1.5` 正常加载。
- 7 个侧栏 tooltip 逐个 hover 断言：默认态无内联钳制残留、宽高有效、按文本宽度未塌陷、四边均在视口内；证据含每个 tooltip 的 rect 与 viewport。

## 全量验证

```text
npm run test:services
  Test Files 85 passed (85)
  Tests 815 passed (815)

npm run type-check
  vue-tsc --noEmit 通过

npm run verify:production-wiring
  no dependency violations found (308 modules, 1019 dependencies cruised)

node --check electron/preload.js
node --check scripts/verify-packaging-3-59-0.mjs
node --check scripts/cleanup-verification-artifacts.mjs
  全部 exit 0

npx vitest run src/services/toolLoopPolicy.spec.ts src/services/editTaskExecutor.spec.ts --no-cache
  Test Files 2 passed (2)
  Tests 8 passed (8)

npm run build
  vite build + vite protocols build 通过
  electron-builder 25.1.8 NSIS x64 产物生成
```

## 产物清理

`node scripts/cleanup-verification-artifacts.mjs` 输出：

```text
removed=_data/intent-routing-electron-exports
removed=dist/神意助手-Setup-3.58.0.exe
removed=dist/神意助手-Setup-3.58.0.exe.blockmap
removed=_audit/verification-packaging-3-58-0
===== VERIFICATION ARTIFACT CLEANUP PASSED =====
```

清理后复核：

- `dist` 仅保留 3.59.0 安装产物与 `win-unpacked`。
- `_audit/verification-packaging-*` 仅保留 `verification-packaging-3-59-0`。
- 当前源码、脚本、package/lock、索引与经验文件中无 3.58.0 现役验证入口或安装包引用；`cleanup-verification-artifacts.mjs` 中的 3.58.0 是本轮删除目标，属清理清单事实。
- 探针启动的打包应用进程已按 `dist/win-unpacked` 路径守卫清理，最终 `Get-Process 神意助手` 无残留。

## 交付边界

3.59.0 交付侧栏 tooltip 修复、响应式溢出 341 用例矩阵、396 条 tooltip 断言、视觉矩阵 19 图与 M60 门禁。真实用户语料的长期泛化仍按 Roadmap G1-G4 积累，不由本封装声明完成。
