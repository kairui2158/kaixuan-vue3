# DEV LOG 2026-09-15 全应用调用路径审计 V2 收尾

> 任务名：调用路径审计 V2
> 方案：`_audit/PROPOSAL_2026-09-15_CALL_PATH_AUDIT_V2_REFINED.md`
> 版本：3.46.0
> 状态：代码、回归与封装闭环

## 完成项

1. **Chain Handoff warn-only 证据链**：新增 `src/services/chainHandoff.ts`，引擎与流水线 chain 分支共同产出 `chain_handoff` 事件；同一运行内 handoff hash 去重，断点保存 `lastHandoff` 并兼容旧 `lastOutput`。该阶段只记录对账证据，不改变原注入行为。
2. **基础设施 Trace**：`RunTraceSource` 与 Electron 持久化目录/导出/删除路径统一支持 `infra`；`ApiSettings.vue` 的模型拉取和连接测试全部进入轻量 run。
3. **后台工具 Trace**：`useAiTools.callAi()` 进入 `background` run，AI 工具失败可导出现场。
4. **Outline 收尾一致性**：三处 finally 改为 `finishOutlineRunIfRunning()`；运行已是 failed/canceled 时不再尝试 success 改写，只补 `status-conflict-ignored` 事件。
5. **产物结果归一**：新增 `classifyRunOutcome()`，统一空产物、截断、取消和失败语义；Outline 工作台、续生成和 Pipeline 包装器接入，`degraded` 不被折叠成 success。
6. **Trace wrapper 状态冲突**：`useAiCallTrace.finish()` 遇到非 running 终态时记录 `status-conflict-ignored`，并保留已终态不被覆盖。

## 构建门禁修复

`@node-rs/jieba` 在 Electron renderer 中通过 Vite browser field 被解析成 WASM 包，但该 WASM 依赖没有安装，导致生产构建中断。实际运行环境是 Electron 主进程，`@node-rs/jieba` 与 `@node-rs/jieba/dict` 已加入 Vite external，构建不再读取缺失的 browser WASM 包。

## 验证

| 门 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npm run type-check` | 通过，0 error |
| 专项测试 | `npx vitest run ...`（handoff/breakpoint/engine/runTrace/AI trace） | 6 files / 73 tests passed |
| 全量测试 | `npx vitest run` | 66 files / 558 tests passed |
| 生产构建 | `npm run build` | 通过，生成 NSIS 安装包 |

## 影响圈

按 V2 方案只触碰：`chainHandoff` / `chainBreakpoint` / `workspaceSkillEngine` / `PipelinePanel` chain 分支 / `runTrace` 双侧 / `ApiSettings` / `useAiTools` / `OutlineWorkspace` trace 收尾 / `generationValidity` / `vite.config.ts`。未动 folder 包协议、直写核心、意图路由、硬规则与 UI 流程。

## 封装

- 版本：3.45.0 → 3.46.0
- 产物：dist/神意助手-Setup-3.46.0.exe  
- SHA256：55899461E00BA7A1B06AF9256D4492D9D90338F5A783511B66004C53B2F60FA1  
- 旧包清理：3.44.0 / 3.45.0 已删除，dist 仅保留 3.46.0
- 客户复验重点：chain 运行记录里的 handoff 对账、供应商连接测试记录、AI 工具失败现场、大纲失败/取消后的终态不被 success 覆盖。


