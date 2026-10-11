# 2026-10-11 3.79.0 Single-Pass 全上下文重构封装

## 范围

将 3.78.0 之后的 single-pass 全上下文重构、主页终稿流 OOM 修复、崩溃检测硬化、工具运行预算、读取台账与双入口真实链路验证成果交付为 3.79.0 安装包。

## 版本与产物

- 版本：`package.json` 与 `package-lock.json` 均为 3.79.0。
- 安装包：`dist/神意助手-Setup-3.79.0.exe`。
- 验证器：`scripts/verify-packaging-3-79-0.mjs`，真实启动打包应用核验。
- 证据：`_audit/verification-packaging-3-79-0/packaging-evidence.json`。

## 执行步骤

1. 同步版本号至 3.79.0。
2. 沿用 3.78.0 的真实启动核验标准，新增 3.79.0 封装验证器。
3. 执行完整 NSIS 重打包。
4. 重构建后执行 `node scripts/verify-packaging-3-79-0.mjs`。

## 验证

### 2026-10-11 11:20-11:25 新鲜验证输出

- `node --check scripts/verify-packaging-3-79-0.mjs`：exit 0。
- `npm run type-check`：exit 0。
- 关键回归：`npx vitest run src/stores/chat.spec.ts src/services/finalDraftCheckpoint.spec.ts src/services/finalDraftService.spec.ts src/services/finalDraftRunner.spec.ts src/stores/runTrace.spec.ts src/services/agentTraceBridge.spec.ts src/services/agentTerminalMapping.spec.ts src/services/crashMonitor.spec.ts` → 8 files / 206 tests passed。
- `npm run build`：exit 0；renderer 构建通过，NSIS 产物为 `dist/神意助手-Setup-3.79.0.exe`。
- `node scripts/verify-packaging-3-79-0.mjs`：`PACKAGING 3.79.0 VERIFICATION PASSED`。

### 打包核验结果

- asar：`version=3.79.0`，`main=electron/main.js`，renderer 74 个文件。
- 安装包：231,512,640 bytes。
- SHA256：`56cc8755eadd37a9cc0a3fb0c00e5190c8b8462bdd1fe0ffd1eca55c0ff471a2`。
- 真实启动：打包应用窗口打开，`electronAPI` 75 个方法，可见正文 2,272 字符，无加载失败/白屏。
- 新鲜度：asar 晚于全部源码与构建配置；renderer 输出无 stale 文件。
- 证据：`_audit/verification-packaging-3-79-0/packaging-evidence.json`（generatedAt `2026-10-11T03:24:58.639Z`）。

## 清理

- 已删除 3.78.0 旧验证器 `scripts/verify-packaging-3-78-0.mjs`、旧封装日志与旧证据目录。
- 当前封装验证器仅保留 `verify-packaging-3-79-0.mjs`。
- 主索引已同步移除 3.78.0 历史封装小节，避免已删除日志形成死链与新旧版本口径并存。

## 诚实边界

- 本轮为版本升级与封装收口，不重复声明 Phase 功能验证；3.79.0 前置验证见 3.78.0 之后的 single-pass、OOM 修复、崩溃检测、工具运行预算与双入口真实链路日志。
- dist 中保留本轮 3.79.0 一套安装产物、blockmap、builder 元数据与 `latest.yml`。
