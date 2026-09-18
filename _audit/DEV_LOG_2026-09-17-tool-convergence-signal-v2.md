# 2026-09-17 · Tool convergence 双层取消信号修复（V2）

## 背景

上一轮 `tool_convergence` 已经解决“工具轮达上限后无法输出正文”的主故障，但暴露出取消语义混用：`params.signal` 同时承载用户取消、请求级 supervisor 的逻辑 deadline、外层调用方 deadline。收敛请求原先被硬编码为 `signal: undefined`，虽然避免了 supervisor 提前打断收敛，但也让用户无法取消，并让其他调用入口失去 fallback 取消能力。

## 改动

1. `CallAiParams` 新增 `cancelSignal?: AbortSignal`，明确作为用户取消通道，与逻辑 deadline 分层。
2. `toolPolicy` 新增 `onConvergenceStart?: () => void`，在收敛物理请求发起前调用一次，供调用方更新 UI、记录 trace、停用工具监督器。
3. 收敛请求改用 `signal: params.cancelSignal ?? params.signal`：优先专用用户取消信号；无专用信号时保留原用户取消语义。
4. 收敛 catch 判断改为 `(params.cancelSignal ?? params.signal)?.aborted`，用户取消继续抛出 `kind: canceled`；非取消失败保留本地工具证据摘要降级路径。
5. 工具执行阶段把 `params.signal` 与 `params.cancelSignal` 组合为单一 `toolAbortController`，任一信号触发都可中止正在执行的工具。
6. `OutlineWorkspace.vue` direct 对话增加独立 `cancelController`：与 `generationController` 同点创建、finally 同点清空；用户点击取消时同时 abort 两个 controller。收敛开始时记录 `tool-convergence-started` trace 事件，并调用 `toolRunSupervisor.dispose()`，避免 supervisor 的逻辑 deadline 误伤收敛请求。

## 验证

- `npx vitest run src/services/aiService.spec.ts src/services/toolRunSupervisor.spec.ts`：2 个文件、88 个测试全部通过。
- `npm run type-check`：通过。
- `npm run build:vue`：renderer 与 provider protocols 两阶段构建通过。
- `node scripts/verify-outline-silent-wait-fix-e2e.mjs`：五项 E2E 全部 PASS，覆盖工具过程可见、零文本工具轮收敛、hold 请求中止、取消状态保持、trace 导出对账。

## 回头看

- 全仓 `callAi(` 扫描：其他入口未接 `cancelSignal`，行为保持 fallback 语义，无破坏。
- `createToolRunSupervisor` 只有 `OutlineWorkspace.vue` 一个生产调用点，且绑定 `generationController`；收敛开始时显式 dispose，不再形成第二混合信号入口。
- `cancelController` 生命周期与 `generationController` 完全同步，finally 中双清空。
- runTrace 已具备 `tool_convergence` 物理请求、`user_cancel` 原因、`canceled` 状态记录；取消清扫不会把 canceled 回写成 success。

## 经验

取消语义必须分层：用户取消是产品承诺，逻辑 deadline 是质量保护，两者不能共用一个 signal。收敛救援请求应该继承用户取消，但不继承工具监督器的总 deadline；这层区分要写进类型和调用协议，而不是靠调用方传参约定记忆。
