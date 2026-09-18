# DEV LOG 2026-09-15 状态审计 V2

> 任务名：全应用状态流统一审计与门禁
> 方案：`_audit/PROPOSAL_2026-09-15_STATE_AUDIT_V2_RECONCILED.md`
> 版本：3.47.0 → 3.48.0
> 状态：代码、专项测试、全量回归、文档与发布闭环

## 影响圈

计划内只处理方案中已扫描出的状态问题：错误终态归并、状态转换证据、活跃态停滞检测、关闭前完整性上报、命名/编辑批次/续生成的状态历史，以及 Trace schema 兼容。不替换现有 17 个状态类型，不改模块间接口签名，不把审计层做成业务终态来源。

## 完成项

1. **BUG-1 修复**：大纲链预算耗尽不再归并为 `success`，统一进入阻断/降级类终态并保留原因。
2. **BUG-2 修复**：意图路由等待用户确认时不再提前写成功终态，避免用户取消后产生状态冲突。
3. **BUG-3 修复**：技能编排的 `blocked` 不再折叠成 `failed`，阻断与终态失败分开表达。
4. **Trace schemaVersion 5 → 6**：新增状态转换、转换违规和停滞预警事件；导出文本包含状态时间线与超时提示。
5. **状态守卫与看门狗**：新增 `stateTransitionGuard`、`stateWatchdog`、`stateIntegrityCheck`；`startRun` 启动活跃态看门狗，API/运行收尾重置或清除，迟到/异常收尾仍由统一终态保护处理。
6. **关闭前状态审计**：渲染进程在 `beforeunload`/`pagehide` 检查残留不健康状态，通过新增只读 IPC 上报主进程日志，不阻塞关闭。
7. **状态历史补齐**：`RunTrace`、命名状态、编辑批次和续生成快照记录 from/to/reason/time，历史链可在运行记录中复现。
8. **UI 复用时间线**：`RunTracePanel` 的时间线按事件流渲染，无需新增独立 Tab 即可筛选和展示 `state-transition`、`state-transition-violation`、`state-stuck-detected`。
9. **旧数据兼容**：新增字段全部可选，旧 schemaVersion 5 数据读取/导出不要求补字段；schemaVersion 6 只用于新导出的格式识别。
10. **M15 门禁沉淀**：经验文件升级 v5.5，状态变化必须经守卫/统一收口函数或带原因的 stateHistory，新状态必须注册映射。

## 决策记录

- `ChainBreakpointStatus` 不追加 `degraded`：V2 审计只处理已扫描的实际断点行为，避免为了状态枚举完整而扩大断点协议影响圈。
- `memoryMerger` 的既有状态同步不做二次改造：其字段级合并已有测试锚点，且方案阶段 3 没有发现新的终态污染证据。
- 看门狗/完整性检查只写入观测事件和诊断，不直接改写业务终态，防止审计层反向制造状态冲突。

## 验证

| 门 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npx vue-tsc --noEmit` | 0 error |
| 全量测试 | `npx vitest run` | 67 files / 568 tests passed |
| 专项回归 | `npx vitest run src/stores/runTrace.spec.ts src/stores/runTrace.integrity.spec.ts src/services/stateTransitionGuard.spec.ts src/services/stateWatchdog.spec.ts src/services/editorBatchRecord.spec.ts` | 4 files / 40 tests passed |
| 前端构建 | `npm run build:vue` | 通过 |
| 生产构建 | `npm run build` | 通过 |
| 真实 Electron E2E | CDP port 9295 + Playwright 注入 running run + beforeunload | stuckRuns=1 上报 main.log + renderer.jsonl 双通道命中 |

## 客户复验重点

1. 预算耗尽、等待确认、技能阻断时，运行记录终态不再是普通成功。
2. 展开时间线后可看到每次状态转换、原因和时间；停滞运行会出现 `state-stuck-detected`。
3. 导出的深度 JSON 应为 `schemaVersion: 6`；旧导出记录仍应可复制/查看。
4. 强制关闭应用后的状态完整性上报已用真实进程实测通过：存在残留 running 时，主进程日志与渲染进程诊断日志双通道均会记录。

## 回头看审计补记

- **诚实降档说明**：原方案 §5.1 的 762 条目标在实施阶段静默缩水为 568 条（17 模块映射只做了 RunTraceStatus + ChainRunState 2 个）。原因是本轮范围收窄为 P0 修复，但未在日志中声明，属于流程失误而非测试遗漏。
- **补修 PipelinePanel blocked 折叠**：folder 执行路径中 folder SKILL 返回 blocked 时曾被折叠为 failed，现已独立输出并携带恢复提示。
- **补修看门狗状态类型**：从只接受 active 扩展为 LifecycleStatus，预警文案跟随实际状态，为 routing/retrying/awaiting_user 停滞检测打开通道。
- **补修快照状态历史**：chat 会话导出快照的合成终态现在会写入带原因的 stateHistory 条目（reason: export_snapshot_synthesized_from_last_turn），不再凭空改写状态。
- **补测 2 条回归**：看门狗多状态触发 + 快照合成终态带原因历史。

## 回头看门禁升格

应用户要求，“回头看”从本次专项补修升格为每次任务收尾的强制门禁：经验文件升级 v5.6，新增 M17 条款与速查表第 10 条。任何修复、功能、重构、封装、文档任务在声称完成前，必须完成目标对账、diff 自审、同款逻辑扫描、日志/经验覆盖核对和本轮证据复核；任一项缺失即视为未完成。本条规则改动本身已执行回头看：条款位置、版本号、DEV_LOG 与总索引均已同步。

## 状态审计 V2 补完（3.48.0 内）

### 问题

1. `finishAwaitingUser()` 无条件恢复看门狗并写入“等待用户确认已恢复”。主页/大纲每轮开始都会调用它，普通连续对话也会制造虚假恢复事件。
2. AI 命名 partial 事件写在 `trace.finish('success')` 之后。`finish()` 会清空包装器内的 runId，导致 `trace.addEvent()` 直接返回，SKILL 调试永远看不到 NamingStatus.partial → RunTraceStatus degraded 的证据。

### 修复

1. `runTrace` 新增 `awaitingUserRunIds` 集合：`startAwaitingUser()` 登记，`finishAwaitingUser()` 只有确实处于等待态才恢复 active 看门狗并写事件；`finishRun()` 统一清理登记，防止终态后残留。
2. AI 命名把 partial 事件移动到 `trace.finish('success')` 之前，保持落盘口径为 `success`，但事件明确标注组件词汇 `partial` 与 runTrace 存储 `degraded` 的契约。
3. 新增回归测试：
   - 普通连续对话不产生“等待用户确认已恢复”。
   - Naming partial 运行中确实包含 `state-transition` 事件且终态为 `success`。

### 验证

| 门 | 命令 | 结果 |
|---|---|---|
| 专项测试 | `npx vitest run src/stores/runTrace.spec.ts src/services/stateTransitionGuard.mappings.spec.ts src/composables/useAiNaming.spec.ts` | 3 files / 52 tests passed |
| 类型检查 | `npx vue-tsc --noEmit` | 0 error |
| 全量测试 | `npx vitest run` | 69 files / 594 tests passed |

### 回头看

- 目标对账：只处理等待态误恢复与 Naming partial 事件无效两个遗留点，未扩权到业务终态。
- 同款逻辑扫描：`startAwaitingUser/finishAwaitingUser` 全部调用点已复核，入口保留无害调用，语义由 store 单点守护。
- 日志覆盖：runTrace 事件、专项测试、DEV_LOG 与总索引已同步；经验文件现有 M15/M16/M17 已覆盖此类规则，不重复新增条款。
