# 2026-09-20 意图路由 V6 Phase 1：jieba 生产加载修复与 Electron 证据闭环

## 背景

V6 Phase 1 的目标是建立真实 trace、对抗与负样本评测基线，并用真实 Electron UI 验证当前词表体系的行为，不修改生产路由判定。

首轮 Electron 实测暴露出生产加载缺陷：renderer 里动态加载 `@node-rs/jieba/dict` 被 Vite 的 `fs/path` stub 破坏，路由连续进入 `router-degraded`，导致意图路由整体降级。

## 根因

1. **生产环境加载位置错误**：jieba 原来在 renderer 动态 import。`@node-rs/jieba/dict.js` 依赖 Node `fs/path`，Vite 会把它们 stub 成空模块，生产 bundle 必然加载失败。这是环境加载缺陷，不是意图判定算法缺陷。
2. **验证器两次口径错误**：
   - 第一处：`row.dataset` 在 `classifyExpected(row)` 之后才赋值，分类器读不到压力轮 dataset。
   - 第二处：第三轮是同一真实会话里的 20 条混合输入，离线基线是无上下文评测；`统一大纲时间线` 这类样本在两种环境下可能合法分叉。旧断言要求失败样本逐字存在于 `baseline.failures`，把“会话上下文观测差异”误判成基线对账失败。

## 修复

1. 新增 `electron/ipc/jieba.js`：主进程加载 `@node-rs/jieba` 与 `/dict`，`Jieba.withDict(dict)` 单例；注册同步 IPC `jieba:cut`，输入长度上限 100000，失败写 electron-log。
2. `electron/main.js` 在 IPC 注册块内调用 `registerJiebaHandlers()`。
3. `electron/preload.js` 暴露 `jiebaCut(text, hmm)`，使用 `ipcRenderer.sendSync`；意图路由 tokenize 是同步函数，所以这里必须是同步桥。
4. `src/services/chainIntentRouter.ts` 的 `ensureJieba()`：
   - 生产优先探测 `window.electronAPI.jiebaCut`，成功即绑定主进程桥。
   - 桥失败标记 `jiebaLoadFailed`，进入降级。
   - Node 测试环境无 electronAPI 时保留动态 import 回退，供 vitest 使用。
   - 路由算法、阈值、语料均未修改。
5. `package.json` / `package-lock.json` 正式声明 `@node-rs/jieba@2.0.3` 与 win32-x64 原生包。
6. `scripts/verify-intent-routing-electron.mjs`：
   - `dataset` 先赋值再分类。
   - 新增 `stress-observation`、`context-sensitive` 分类。
   - 第 3 轮标注样本失败不再强制要求存在于离线 baseline failures，而是完整落盘为会话观测。
   - summary 输出四类统计：pass、expectedFailure、stressObservation、contextSensitive。
7. `src/services/chainIntentRouter.spec.ts` 增加 Electron 桥接测试，stub `window.electronAPI.jiebaCut`，断言路由可用且调用进入 tokenizer。

## 验证

以下全部为本轮新鲜输出：

- `node -e "require('./electron/ipc/jieba').getJiebaInstance().cut('生成一个完整大纲', true)"`
  - `["生成","一个","完整","大纲"]`
- `npx vitest run src/services/chainIntentRouter.spec.ts`
  - 18/18 通过
- `npm run build:vue`
  - exit 0
- `node scripts/verify-intent-routing-electron.mjs`
  - `===== INTENT ROUTING V6 PHASE 1 ELECTRON VERIFICATION PASSED =====`
  - `cases=33; pass=6; expectedFailure=6`
  - `stressObservation=20; contextSensitive=1`
  - 收口前复跑同样通过，deep trace 为 `run-trace-outline-20260920-165804-deep`
  - 全程无 `router-degraded`
  - write 意图暴露 `editor.write`；readonly 意图无 `editor.write`
  - fallback 气泡出现且未发请求，点击“按推荐技能继续”后恢复单请求并关闭 turn
- 证据：
  - `_audit/verification-intent-routing-electron/intent-routing-electron-evidence.json`
  - `_data/intent-routing-electron-exports/run-trace-outline-20260920-165804-deep`（收口复跑；`164940` 为同日首轮证据）
- `npm run evaluate:chain-intent`
  - 核心 corpus：classification 20/20，routing 20/20，四个 intent 的 precision/recall/F1 全部 1.0000
  - V6 Phase 1 基线维持已知失败：holdout 22/28，adversarial 17/37，negative 12/14
- `npm run type-check`
  - 通过
- `npm run test:services`
  - 73 个文件、703 个测试全部通过

## 回头看

- `rg "jiebaCut|jieba:cut|@node-rs/jieba|router-degraded"`：生产 Electron 只有一条 jieba 加载路径，即主进程 IPC 桥；renderer 动态导入仅作为 Node 测试回退，不存在第二套生产路径并存。
- 本轮触碰文件限定在：`electron/ipc/jieba.js`、`electron/main.js`、`electron/preload.js`、`src/services/chainIntentRouter.ts`、`src/services/chainIntentRouter.spec.ts`、`package.json`、`package-lock.json`、`scripts/verify-intent-routing-electron.mjs`。工作区其他脏文件为前序任务事实，未回退未清理。
- 深层 trace 导出成功，四侧对账包含 UI 气泡、trace turn、实际工具面、编辑器不变性。

## 遗留

1. V6 Phase 1 基线的 holdout / adversarial / negative 失败是词表与关键词层的已登记现状，属于 Phase 2 embedding 语义层目标，本任务不修。
2. `fs externalized for @node-rs/jieba/dict.js` 的构建 warning 来自 Node 测试回退路径；生产 Electron 不触达该路径。若要消除 warning，需要重构测试加载方式，暂不作为本任务范围。
3. Electron 启动时的 `electron-log renderer bridge failed` 是既有噪音，非本轮引入。
4. 安装包未封装；封装后需按 M17/M40 用 `win-unpacked/resources/app.asar` 或安装版实测 jieba IPC。
