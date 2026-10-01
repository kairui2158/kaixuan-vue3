# 2026-09-22 递归审计、零新增问题收敛与 3.56.0 封装

## 目标

按用户要求执行“回头看 + 应用反查 + 递深反查 + 盲区寻找”，持续审计直到出现一轮无新增问题，然后升级版本号并封装。

## 递归审计结论

本轮共执行多轮只读审计与修复验证：

1. **第一轮**：确认并修复两个断点残留。
   - 根目录 `preload.js` 为旧副本且语法损坏（`node --check preload.js` 报 `missing ) after argument list`）。生产入口 `electron/main.js:336` 只消费 `electron/preload.js`；三面搜索确认根目录副本仅被 `scripts/verify-packaging-3-55-0.mjs` 的新鲜度扫描消费，无运行时消费者。已删除该坏副本，并把封装校验配置改为 `electron/preload.js`。
   - `electron/ipc/intentEmbedding.js:3` 使用 `require('electron-log')`，与主进程统一入口 `electron-log/main` 分叉。已统一为 `electron-log/main`，全仓不再有根入口写法。
2. **第二轮**：全量类型、脚本语法、依赖与 TODO 盲区扫描。
   - 发现 `src/services/intentLlmFallback.spec.ts:106` 在 Vitest v4 严格类型下索引空元组导致 `vue-tsc` 失败。根因是测试类型表达，不是产品语义。已为 mock 显式标注请求参数类型，并保留“请求不得携带 `signal`”的原断言。
   - TODO/FIXME 扫描无可执行遗留；历史文档命中均为叙述性记录。
3. **第三轮**：全量服务测试（75 文件 / 730 测试）、短语语料同步（1766 phrases / 385 samples，problems=[]）、依赖巡航（286 modules / 960 dependencies，0 violations）。
4. **第四轮**：Electron 级验证。
   - 首跑发现 renderer 构建陈旧（20 个 stale bundles），按 M28 先执行 `npm run build:vue`，再复验。
   - `verify-api-direct-write-electron.mjs` 通过：写入、修改、删除、跨轮权限翻转、停滞重试、trace 导出全部通过。
   - `verify-intent-routing-electron.mjs` 通过：64 cases，`pass=39; expectedFailure=2; liveDivergence=1`，LLM 兜底 no_match/ambiguous 两组失败形态均按设计断言。
   - `verify-api-live-status-electron.mjs` 通过：正文流实时状态、工具阶段状态条隔离、主页流式状态均通过。
5. **收敛轮**：审计无新增问题。意图语料的 holdout/adversarial 失败与 `liveDivergence` 均为既有登记项，由后续语义层迭代承载；本轮未发现新的生产缺陷。

## 清理

- 新增 `scripts/cleanup-verification-artifacts.mjs`，将验证产物清理固化为路径守卫脚本：仅允许删除 `_data` 与 `dist` 内的显式目标。
- 清理本轮 Electron 验证产物：`_data/api-live-status-screenshots`、`_data/api-live-status-profile`、`_data/intent-routing-electron-exports`。
- 封装后清理旧 `3.55.0` 安装包与 blockmap；`dist` 只保留 `3.56.0` 一套产物。

## 版本与封装

- `package.json` / `package-lock.json` 版本升级为 `3.56.0`。
- 封装脚本重命名为 `scripts/verify-packaging-3-56-0.mjs`，版本、schemaVersion、输出目录与输出横幅同步为 3.56.0；删除旧 3.55.0 脚本，避免新旧并存。

## 验证

- `node --check electron/preload.js`：通过。
- `node --check electron/ipc/intentEmbedding.js`：通过。
- `Get-ChildItem electron -Recurse -Filter *.js | node --check`：全部通过。
- `node --check scripts/verify-packaging-3-56-0.mjs`、`node --check scripts/cleanup-verification-artifacts.mjs`：通过。
- `npm run type-check`：通过。
- `npm run test:services`：75 个测试文件、730 个测试全部通过。
- `npm run verify:production-wiring`：286 modules / 960 dependencies，0 violations。
- `node scripts/verify-phrase-corpus-sync.cjs`：JSON/TS 完全同步，problems=[]。
- `node scripts/verify-api-direct-write-electron.mjs`：`===== API DIRECT WRITE ELECTRON STRESS E2E PASSED =====`。
- `node scripts/verify-intent-routing-electron.mjs`：`===== INTENT ROUTING V6 PHASE 1/5 ELECTRON VERIFICATION PASSED =====`。
- `node scripts/verify-api-live-status-electron.mjs`：`===== API LIVE STATUS ELECTRON E2E PASSED =====`。
- `npm run build`：3.56.0 NSIS x64 构建完成。
- `node scripts/verify-packaging-3-56-0.mjs`：asar 版本 3.56.0、renderer 74 条目、`window.electronAPI` 74 方法、可见渲染文本均通过。
- 安装包：`dist/神意助手-Setup-3.56.0.exe`（231,420,880 bytes）。

## 回头看

- 本轮实际改动：删除坏旧副本 `preload.js`；统一 `electron-log/main`；修复测试类型；新增清理脚本；版本与封装脚本升级重命名；删除旧 3.55.0 安装产物。
- 未回退、未删除任何前序未提交源码、方案、日志或经验证据。
- 意图语料的既有 holdout/adversarial 差距仍按 Phase 2 语义层路线登记，不属于本轮新增缺陷。
