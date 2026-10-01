# 2026-09-23 3.60.0 API 直写 V3 收口封装

## 目标

将 API 直写长文档成熟化 V3（P0-A / P0-B / P2 / timeout / 完整性误杀修复）交付为 3.60.0 安装包，并执行 M17 / M29 / M42 / M43 / M50 / M60 门禁：全量测试、类型检查、生产接线、生产构建、NSIS 产物、真实打包启动核验、旧产物清理与日志登记。

## 版本与产物

- 版本：`package.json` 与 `package-lock.json` 均为 3.60.0。
- 安装包：`dist/神意助手-Setup-3.60.0.exe`。
- 大小：231430439 bytes。
- SHA256：`D83BF82949760F96D4B8453166069F1BB00D2EA3C21C82FA8D3D4E6F126C0B5F`。
- NSIS 有效配置：`oneClick: false`、`allowToChangeInstallationDirectory: true`、`include: build/installer.nsh`，客户可自选安装路径。

## 本轮交付内容

1. P0-A：direct 对话入口删除 `maxToolIterations: 6` 假上限，12 轮策略由 `toolLoopPolicy.ts` 单源控制。
2. P0-B：收敛轮伪工具调用判定、一次强纠正、本地兜底与“本轮未完成写入”提示；禁止把伪调用剥壳当正文成功。
3. P2：chat run 保持 running 时写入 `session-active`，导出快照保留真实会话语义。
4. `timeoutMs: null` 显式无超时，不再回退默认 600 秒。
5. Step5 整篇整理不再被容器 heading 的全文字符串包含比较误杀；真实删节内容仍被 critical 阻断。
6. 真实供应商 live 六步实测通过：7602 字、modify / append / delete / move / tidy / reorder 全部真实写入。

## 封装验证器换代

- 新增 `scripts/verify-packaging-3-60-0.mjs`，删除 `scripts/verify-packaging-3-59-0.mjs`。
- 验证器保留 3.59 的防假绿机制：退出码由 `verificationPassed` 控制、异常完整打印、asar 读取最终产物、真实启动打包应用。
- 本轮修复验证器竞态：tooltip 断言不再固定等待 100ms 后立即读取，改为把目标元素句柄传入 `waitForFunction`，轮询至 `getComputedStyle(element, '::after').width` 为有限正值后再断言。首轮失败（NaN）与二轮失败（activeElement 假设错误）均为验证器缺陷，产品 tooltip 本身无缺陷。

## 封装前全量门禁

```text
npm run test:services
  Test Files 86 passed (86)
  Tests 856 passed (856)

npm run type-check
  vue-tsc --noEmit 通过

npm run verify:production-wiring
  no dependency violations found (310 modules, 1024 dependencies cruised)

node --check electron/preload.js
node --check electron/main.js
node --check scripts/verify-packaging-3-60-0.mjs
node --check scripts/cleanup-verification-artifacts.mjs
  全部 exit 0

npm run build
  vite build + vite protocols build 通过
  electron-builder 25.1.8 NSIS x64 产物生成
```

## 打包产物核验

```text
node scripts/verify-packaging-3-60-0.mjs
===== PACKAGING 3.60.0 VERIFICATION PASSED =====
asar=dist\win-unpacked\resources\app.asar; rendererFiles=74; electronAPI methods=77; sidebarTooltips=7; evidence=_audit\verification-packaging-3-60-0\packaging-evidence.json
```

核验内容：

- asar `package.version = 3.60.0`，`main = electron/main.js`，main/preload 均非空。
- renderer 文件 74 个，包含 `index.html`，且新于全部源码与构建配置。
- 打包应用真实启动，`window.electronAPI` 77 个方法可用。
- 正文渲染长度 429，不包含“无法加载/白屏”。
- 本地意图 embedding 模型从打包 `resources/models/bge-small-zh-v1.5` 正常加载。
- 7 个侧栏 tooltip 逐个 hover 断言：默认态无内联钳制残留、真实 used geometry 有效、宽度未塌陷、四边均在视口内。

## 产物清理

`node scripts/cleanup-verification-artifacts.mjs` 输出：

```text
removed=_data/api-direct-write-live-v3-profile
removed=dist/神意助手-Setup-3.59.0.exe
removed=dist/神意助手-Setup-3.59.0.exe.blockmap
removed=_audit/verification-packaging-3-59-0
===== VERIFICATION ARTIFACT CLEANUP PASSED =====
```

清理后复核：

- `dist` 仅保留 3.60.0 安装包、blockmap、builder 配置与 `win-unpacked`。
- `_audit/verification-packaging-*` 仅保留 `verification-packaging-3-60-0`。
- 探针启动的打包应用进程已关闭，`Get-Process 神意助手` 无残留。

## 工作区边界

- 本仓库为长期未提交基线，`git status` 大量修改/未跟踪文件属于当前应用事实与历史任务证据，按 M29 分层原则未删除。
- 本轮仅清理可再生成验证产物与旧安装包；未提交源码、测试、方案、DEV_LOG、经验文件保留。
- 基线收口的唯一安全路径是完整 commit 固化当前版本；本次未执行 git 提交。

## 遗留

- 无本轮功能与封装遗留。
- Vite 仍有既有配置类 warning（`__dirname` 与 chunk 大小提示），属此前已登记事项，不阻塞交付。
