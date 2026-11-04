# 2026-11-05 工作台 SKILL blocking 终态补修

## 背景

`499f5e39` 已把正文链 folder postProcess blocking 耗尽从 degraded 放行改为 failed，并补真实 UI E2E。封装审计复查工作台时发现两条疑似通路，进入定向补修。

## 源码反转

原假设“folder chain 会把 failed/blocked 带非空输出记成 success 后静默验收”不成立：`skillRouter.ts:223-236` 对这两个状态直接抛错，错误携带 `folderResult`，PipelinePanel 已消费。不能为不存在的通路伪造测试。

真实缺口是：

1. `WorkspaceSkillRunMeta` 丢失 folder `degraded + blockingGateFailed`；
2. 工作台 body 契约验收未透传该字段；
3. 无 body 契约时 chain/compose 终态可能按 warning 显示。

## 改动

- `workspaceSkillEngine.ts`：meta 增加 `blockingGateFailed`，folder 结果透传；chain/compose 传给 `acceptWorkspaceArtifact`；终态归并消费 meta 的 blocking 证据，无契约也收敛为 `blocked/post-process-blocked`。
- `workspaceArtifactAcceptance.ts`：body 分支透传 `blockingGateFailed`。
- 新增跨层审计：`_audit/CROSS_LAYER_BLOCKING_GATE_AUDIT_2026-11-05.md`，登记反转结论与各执行面状态。

## 验证

- `npm run type-check`：exit 0。
- 定向回归：`workspaceArtifactAcceptance.spec.ts + workspaceSkillEngine.spec.ts + realSkillExecutor.spec.ts + stepArtifactAcceptance.spec.ts`，4 files / 146 tests passed。
- 新增用例锁定：body 契约通过但 blocking gate 失败必须 reject；工作台 folder chain blocking 耗尽必须 `blocked/post-process-blocked`。
- 全量服务回归：`npm run test:services`，247 files / 2661 tests passed。

## 封装

- 版本：3.114.1 → 3.114.2，`package.json` 与 `package-lock.json` 同步。
- `npm run build`：exit 0，NSIS 产物 `dist/神意助手-Setup-3.114.2.exe`。
- `npm run verify:packaging`：PASS；SHA256 `01c866202a1f520d0da1ef1a32fafded57d0ca44e07336ff1fb968eace9777ba`；renderer files 87；electronAPI methods 94；证据 `_audit/verification-packaging-3.114.2/packaging-evidence.json`。
- 旧包清理：3.114.0 / 3.114.1 及 blockmap 已删；`神意助手-Setup-3.110.6.exe` 因访问拒绝和改名失败残留，未发现可见占用进程。按 G1.12 登记为清理残留，不硬杀进程、不伪装清零。
- 回归面：本轮只改服务层产物验收与终态归并，无组件模板/交互改动；封装核验已启动打包应用并检查 electronAPI 与渲染壳，真实供应商工作台 folder blocking live E2E 仍列为边界。

## 诚实边界

- 工作台 folder blocking 未做真实 Electron live E2E，当前由服务层集成语义锁定。
- 复合链 `degraded + no_contract` 已拒绝，无可放行夹缝，未重复接线。
- 卷纲/章节/设定批次链无 folder blocking 通路，不做预建防线。
