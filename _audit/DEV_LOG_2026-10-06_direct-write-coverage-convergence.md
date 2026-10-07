# 2026-10-06 API 直写覆盖收敛修复

## 目标

统一修复前面暴露出的直写覆盖收敛问题：单段 direct 写入明明已经成功，却持续被判为 `partially_applied`，导致工具循环反复外呼，最终触发 `stalled/physical_request_limit`。

## 根因

`editor.write` 的生产返回形状是 `result.data.coverage`，但 `collectLongDocumentWriteCoverage()` 只读取 `result.data` 本身。于是覆盖记录永远解析失败，真实成功写入被应用层误判为“未覆盖”，orchestrator 认为任务未完成并继续外呼。问题不在模型、不在权限声明、也不在工具面接线，而在应用层消费了错误的结果形状。

## 修复

1. [longDocumentWriteCoverage.ts](/D:/codex/novel-workshop-vue3/src/services/longDocumentWriteCoverage.ts): `collectLongDocumentWriteCoverage()` 优先读取 `data.coverage`；保留旧 whole-object 兼容路径，避免历史工具结果失效。
2. [longDocumentWriteCoverage.spec.ts](/D:/codex/novel-workshop-vue3/src/services/longDocumentWriteCoverage.spec.ts): 新增生产形状红绿测试，锁住 `data.coverage` 解析，防止该形状错位再次回归。
3. 保留 2026-10-04/05 已建立的覆盖语义：多段计划仍要求显式 segment 或真实跨越全部计划段；未声明的局部写入仍不得计满；单段计划继续支持短 range 回填。

## 验证

以下均为 2026-10-06 本轮新鲜执行，不引用历史结果冒充本轮证据。

1. `npm run type-check`：通过。
2. `npm run test:services`：129 个测试文件、1466 条测试全部通过。
3. `npm run build:vue`：通过；仅保留既有 Vite chunk 体积与 `__dirname` 配置 warning。
4. `node scripts/verify-model-interference-electron.mjs`：PASS。真实 Electron 可见窗口、真实 mock 供应商请求、真实 UI 重置会话。证据：[_audit/verification-model-interference-electron/evidence.json](/D:/codex/novel-workshop-vue3/_audit/verification-model-interference-electron/evidence.json)。
5. 关键行为变化：`edit-intent` 从 25+ 次物理请求降为 2 次；第 1 次真实 `editor.write` 工具调用，第 2 次正文收口，turn `success`。`discuss-intent` 仍为 1 次请求且工具面不含 `editor.write`，保持只读。

## 诚实边界

1. 本轮 Electron 验证使用本地 mock 供应商，覆盖真实 UI、真实工具调用、真实流式收口与覆盖收敛，不冒充真实供应商 live。
2. 版本仍为 3.75.0，本轮未封装；等待用户明确封装指令。
3. 工作区保留了上一任务 55 个脏文件，本轮只新增本日志与索引登记，未回退、未清理上一任务交付。

## 收尾清理

按照 G0.8 执行定向清理。删除前解析绝对路径并确认均位于 `D:/codex/novel-workshop-vue3/` 内，未使用全局 `git clean`，未触碰上一任务交付物：

1. `.tmp-live-key`：已删除，复核 `exists=false`。
2. `_audit/tmp/cl-profile/`：已删除，复核 `exists=false`。
3. `_audit/tmp/slim-profile/`：已删除，复核 `exists=false`。
4. `_audit/tmp/cdp-page-crash-bisect.mjs`、`component-lifecycle-repro-slim.mjs`、`core.mjs`、`debug-component-launch.mjs`、`inspect-pages.mjs`、`repro-exact.mjs`、`repro.mjs`：全部删除，逐项复核 `exists=false`。
5. 复核 `_audit/tmp`：已无任何文件；该空目录不再包含临时探针、profile 或调试残留。
