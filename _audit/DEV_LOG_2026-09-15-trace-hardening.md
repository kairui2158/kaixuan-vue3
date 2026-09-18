# DEV LOG 2026-09-15 Trace 加固 V2 收尾

> 任务名：调用路径审计 V2 后续盲区加固
> 方案：3.46.0 闭环复盘得出的四个盲区加固点
> 版本：3.47.0
> 状态：代码、真实 Electron E2E、文档与封装闭环

## 影响圈

计划内只处理 chain 断点去重持久化、Trace schema 版本、Trace 落盘失败降级、并发收尾冲突证据与 E2E 清理稳定性。计划外不改生成链路、folder 协议、直写权限、意图路由、UI 流程与硬规则。

## 完成项

1. **WeakMap 去重持久化**：`ChainBreakpoint` / `ChainResumePoint` 增加 `handoffHashes`，成功断点保存已处理 hash，恢复后继续过滤重复 handoff；避免应用重启或断点恢复后同一中间产物再次进入下一链步。
2. **Trace schemaVersion 升级**：`RUN_TRACE_SCHEMA_VERSION` 从 4 升到 5，`exportRunToJson` 与导出按钮版本同步，防止旧解析器把新引用结构误读为完整正文。
3. **Trace 落盘 fail-open**：`runTraceSave` IPC 抛错、磁盘满或目录锁定时记录 `autosave-failed`，不再把观测故障冒泡成生成失败。
4. **eval source 白名单补齐**：Electron trace 导出、删除、目录归档与旧导入路径统一加入 `eval`，技能评测记录不再被折叠成 pipeline。
5. **并发收尾冲突事件补齐**：`finishRun()` 遇到后到的非 running 收尾时，除保留终态外强制记录 `status-conflict-ignored`，补齐 M8 日志覆盖缺口。
6. **E2E Windows 清理加固**：profile/export 清理带短暂重试，避免 Electron 句柄尚未完全释放时把通过验证误报为 EPERM 失败。

## 反推发现与修复

E2E 首轮暴露真实缺口：状态保护本身生效，但第二次 `finishRun` 被挡掉时没有冲突事件。单测与生产 bundle 的差异也暴露了 E2E 先构建的重要性；冲突补丁后必须重新 `build:vue`，真实 Electron 才能验证新行为。

## 验证

| 门 | 命令 | 结果 |
|---|---|---|
| 专项测试 | `npx vitest run src/composables/useAiCallTrace.spec.ts src/stores/runTrace.spec.ts src/services/chainBreakpoint.spec.ts src/services/chainHandoff.spec.ts` | 4 files / 44 tests passed |
| 类型检查 | `npm run type-check` | 通过，0 error |
| 全量测试 | `npx vitest run` | 66 files / 562 tests passed |
| 真实 Electron E2E | `node scripts/verify-run-trace-depth-v2.mjs` | 全部 PASS，含并发冲突事件、三种导出模式 payload SHA256、隐私脱敏与 rolling cleanup |
| 前端构建 | `npm run build:vue` | 通过 |
| 生产构建 | `npm run build` | 通过，生成 NSIS 安装包 |

## 客户复验重点

1. 在 chain 中断后点恢复，运行记录不应再次出现相同 handoff 重复注入。
2. 用旧版 3.46.0 生成的 trace 仍应可读；新导出 JSON 的 `schemaVersion` 应为 5。
3. 生成过程中人为限制 trace 目录权限或填满磁盘，正文生成不应失败，运行记录里应出现 `autosave-failed`。
4. 取消生成后，若组件迟到的 success 回调抵达，运行终态必须保持 canceled，并且时间线出现 `status-conflict-ignored`。

## 封装

- 版本：3.46.0 → 3.47.0
- 产物：`dist/神意助手-Setup-3.47.0.exe`
- SHA256：`21A51378921BDCA35324DAF6F3DF448AC178678309D3894110B550741FF34065`
- 旧包清理：3.46.0 已删除，dist 仅保留 3.47.0。
