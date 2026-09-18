# 开发日志：全应用统一性修复收尾（2026-09-13）

## 项目功能与用途

本轮任务按 `_audit/PROPOSAL_2026-09-12_FULL_UNIFICATION_REPAIR_PLAN.md` 执行全应用统一性修复：AI Trace 生命周期统一、Modal 队列统一、旧架构 6 服务删除、deai 进度结构统一，并完成三入口 E2E、全量回归、构建、临时目录清理与文档回填。

用户确认的四项执行决策：

1. 旧架构 6 服务彻底删除，删除过程不得破坏组合与链路，删除后重新扫描确认无损伤。
2. U6（deai 进度结构统一）纳入本轮。
3. Modal 迁移按高、中、低优先级全部执行。
4. 总顺序为先 Trace 后 Modal。

## 根因记录

1. **验证脚本与最新数据目录协议不同步**：`verify-run-trace-depth-v2.mjs` 仍从 `ROOT/_data/run-trace/home` 断言，而真实数据已随 `SHENYI_TEST_USER_DATA_DIR` 写入隔离 profile，导致脚本与产品语义脱节并遗留临时目录。
2. **续生成路径漏掉 turn 生命周期**：`continueMessage()` 成功路径只闭合 API call，没有调用 `finishHomeRun('success')`，导致运行记录永远停留 running、磁盘无 run-trace 落盘。
3. **E2E 脚本缺少 finally 清理**：早期脚本没有统一的 `try...finally` 清理，成功运行也会留下专用 profile 与导出产物。

## 修复点

1. `src/components/chat/ChatPanel.vue:2194`：续生成成功后调用 `finishHomeRun('success', undefined, result.text)`，turn 正常落盘。
2. `scripts/verify-run-trace-depth-v2.mjs:144`、`:516`、`:599`：磁盘断言路径统一改为 `DATA_DIR/run-trace/home`。
3. `scripts/verify-run-trace-depth-v2.mjs:101`：新增统一 `cleanup()`，通过顶层 `try...finally` 关闭 CDP、Electron、mock provider，并默认删除专用 profile 与导出产物；`SHENYI_E2E_KEEP_PROFILE=1` 保留现场。
4. `scripts/verify-run-trace-depth-v2.mjs`：引入 `SHENYI_TEST_USER_DATA_DIR` 隔离 profile，修复 provider 异步加载竞态。
5. `src/components/pipeline/PipelinePanel.vue`：补齐 `pl-binding-import-*` 缺失样式；Modal watch TDZ 崩溃修复（watch 移到声明之后）。
6. Modal 统一迁移：附录 A 高 / 中 / 低优先 overlay 迁移至 `useModalQueue`。
7. 旧架构服务删除：`skill-manager.js`、`provider-manager.js`、`project-manager.js`、`chapter-manager.js`、`agent-manager.js`、`zhuque-validator.js`，删除后三面引用复扫为零。
8. deai 进度统一：`processingStages` 阶段数组 + `deai-stage` 事件写入 runTrace。

## 验证矩阵

| 验证项 | 结果 |
|---|---|
| `npx vue-tsc --noEmit` | PASSED |
| `npx vitest run` | PASSED：60 files / 481 tests |
| `npm run build:vue` | PASSED |
| `node scripts/verify-run-trace-depth-v2.mjs` | PASSED：续生成 turn 落盘、三种导出、payload sha256、脱敏、滚动清理、上下文压缩事件、profile / exports 自动清理 |
| `node scripts/verify-release-gate-g2-g3-e2e.mjs` | PASSED：G2 长流响应 21670ms，maxUnresponsiveMs=29；G3 超时 / 取消 / 连续失败 / 空正文重试 |
| `node scripts/verify-release-gate-g4-three-entry-e2e.mjs` | PASSED：主页、大纲工作台、流水线正常流 + 取消 + 导出 |

## 临时目录清理

已删除并复核为不存在：

- `_data/run-trace-v2-e2e-profile/`
- `_data/run-trace-v2-exports/`
- `_data/run-trace-v2-remaining-profile/`
- `_data/product-validity-status-e2e-export/`

保留：`_data/electron-debug-profile/`（历史启动调试数据，不属于本轮 E2E 范围）。

自愈机制：`verify-run-trace-depth-v2.mjs` 现在自带 `try...finally` 清理，成功或失败都会关闭 CDP、Electron、mock provider，并默认删除专用 profile 与导出产物；脚本尾部会输出两条清理 PASS 断言。

## 经验沉淀

已写入 `神意开发经验总结_v4.md` §3 验证纪律第 33 条：验证脚本磁盘断言路径必须跟随 `SHENYI_TEST_USER_DATA_DIR`，清理必须 `try...finally`，并预留 `SHENYI_E2E_KEEP_PROFILE` 调试开关。
