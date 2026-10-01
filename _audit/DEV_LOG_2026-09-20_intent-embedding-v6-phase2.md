# DEV_LOG 2026-09-20 - 意图 Embedding V6 Phase 2

## 目标

落地 V6 意图路由成熟化方案的 Phase 2：主进程本地 embedding 服务。目标是让后续路由层可以拿到 512 维语义向量，为混合意图、变体表达和词表外输入提供判别基础。本阶段只做服务层与主进程接线，不做路由判定接入。

## 实现内容

- 新增 `electron/ipc/intentEmbedding.js`：加载本地 `Xenova/bge-small-zh-v1.5` q8 ONNX 模型，输出 512 维向量，支持批量上限 16、单条输入上限 10000、失败结构化返回、状态查询和 warmup。
- `electron/main.js` 注册 `registerIntentEmbeddingHandlers()`。
- `electron/preload.js` 暴露 `intentEmbed` / `intentEmbeddingStatus` / `intentEmbeddingWarmup`。
- 模型资源放入 `resources/models/bge-small-zh-v1.5/`，并通过 `extraResources` 打包进安装版。
- `package.json` 新增 `verify:intent-embedding-node` 与 `verify:intent-embedding-electron` 验证脚本。

## 关键事故与根因

### 事故一：3.55.0 首次封装产物启动即 preload 崩溃

**现象：**

- 真实 Electron 验证脚本挂在 `intentEmbed` 等待，120 秒无响应。
- 应用主日志出现 `WebContents#preload-error: SyntaxError: missing ) after argument list`。
- 窗口能创建，但 `window.electronAPI` 从未生成。

**根因：**

- `electron/preload.js` 中新增 `intentEmbed` / `intentEmbeddingStatus` / `intentEmbeddingWarmup` 三个方法后，原文件最后一个方法结尾多了一层 `}`，导致文件末尾缺少 `contextBridge.exposeInMainWorld(...)` 的闭合括号。
- Node 语法检查未在封装前执行。

**修复：**

- 重建 `electron/preload.js`，修复语法。
- 保留原有全部 API surface，包括 agent、pipeline、deai、skill、runTrace、provider 等，不因本次改动丢失。

### 事故二：验证脚本无声挂起

**现象：**

- `_electron.launch()` 能启动窗口。
- `firstWindow()` 能返回。
- 后续 `window.waitForFunction()` 无响应，脚本无超时。

**根因：**

- 打包 exe 已内含 `app.asar`，脚本却又将 `app.asar` 作为参数传入，Electron 启动行为不干净。
- 脚本没有超时保护，也没有阶段日志，导致失败时无法判断卡点。

**修复：**

- 移除多余 `args`，直接以打包 exe 启动。
- 加入 `LAUNCH_TIMEOUT_MS=90s`、`STEP_TIMEOUT_MS=120s`。
- 每个阶段输出 `[stage]` 日志。
- `finally` 中强制关闭，失败时 kill。

## 验证证据

### Node 级

```text
node scripts/verify-intent-embedding-node.mjs
→ mainline: 2 vectors, 512 dims
→ variants: 2 vectors, 512 dims
→ empty: 0 vectors
→ reject: batch > 16, input > 10000
```

### Electron 真实 UI 级

```text
npm run verify:intent-embedding-electron
→ [stage] launching packaged app
→ [stage] waiting for first window
→ [stage] round 1/3: mainline
→ [stage] round 2/3: variants
→ [stage] round 3/3: stress-loading-window
→ PASSED
```

证据文件：

```text
_audit/verification-intent-embedding-electron/intent-embedding-electron-evidence.json
```

三轮全部通过：

1. mainline：2 条输入，512 维。
2. variants：3 条变体表达，512 维。
3. stress-loading-window：20 条混合意图输入，512 维。

### 全应用回归

```text
npm run type-check
npm run test:services
npm run build:vue
npm run verify:production-wiring
```

结果：

- type-check：通过。
- services：73 文件 / 703 测试全部通过。
- build:vue：通过。
- production-wiring：278 模块 0 违规。

### 3.55.0 产物核验

```text
文件：dist/神意助手-Setup-3.55.0.exe
大小：231,490,232 bytes
FileVersion：3.55.0
ProductVersion：3.55.0
SHA256：8CFDED6C315D066745B074CA73BAEE596FDC014BC8A237BA3EAEFDEA2992C428
```

## 清理

- 删除 `dist/神意助手-Setup-3.54.0.exe`。
- 删除 `dist/神意助手-Setup-3.54.0.exe.blockmap`。
- 复核 `dist` 下只保留 3.55.0 一套安装产物。
- 删除临时目录 `_tmp_refero_extract`、`_tmp_research`，复核不存在。

## 范围外

- Phase 3：embedding 接入路由判定。
- Phase 4：阈值校准。
- Phase 5：LLM 兜底。
- Phase 6：全链路收口。

这些不在本次 Phase 2 范围内，需按 V6 方案后续推进。
