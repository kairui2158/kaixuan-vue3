# DEV_LOG 2026-09-27 - 长文档重排架构 V2 Phase 5

## 范围

- 方案：`_audit/PROPOSAL_2026-09-27_LONG_DOCUMENT_RESTRUCTURE_ARCHITECTURE_V2.md`
- Phase 5：运行观测语义升级、无上限长请求与活性看门狗契约、trace schema v10。
- 本阶段不改用户可见交互文案；核心目标是让“长请求在跑”“终态归并中”“真的卡死”成为三种可区分的运行事实。

## 交付

### runTrace schema v10

- `src/stores/runTrace.ts`
  - `RUN_TRACE_SCHEMA_VERSION` 从 `9` 升级到 `10`。
  - 新增 `long-request-in-progress` 事件：
    - 每个 running 物理请求只上报一次。
    - 按 `physical.id` 去重，heartbeat / progress 更新只刷新活性，不刷事件流。
  - 新增 `awaiting-terminal-merge` 事件：
    - EditTask 到达 `awaiting_batch` 且已执行批次非空、无 pending / failed / active batch 时触发。
    - 按 `taskId` 去重，避免终态归并阶段被重复记录。
  - `startRun` 按 `runId` 清理去重状态，避免跨 run 泄漏。

### 无上限长请求与活性守卫

- `src/services/toolRunSupervisor.spec.ts`
  - 新增长文档模式契约：`hardDeadlineMs: null` 时不设总死线。
  - idle watchdog 独立生效：无活性证据仍会触发，不会因“无总上限”退化为永不报警。

### 测试契约

- `src/stores/runTrace.spec.ts`
  - schema 断言升级到 `10`。
  - 新增长物理请求事件、终态归并事件、重复上报去重、活性防误报 stuck 的契约测试。

## 验证

### 本轮复跑

1. `npx vitest run src/stores/runTrace.spec.ts src/services/toolRunSupervisor.spec.ts --reporter=verbose`
   - `2 files passed`
   - `66 tests passed`
   - 关键契约：
     - `records physical, stream, tool, and edit-task activity without firing false stuck warnings`
     - `records long physical requests and terminal merge as distinct run semantics without duplication`
     - `supports explicit long-document runs without the default hard deadline`
     - `keeps the long-document idle watchdog independent from the disabled hard deadline`

2. `npm run test:services`
   - `Test Files 116 passed (116)`
   - `Tests 1185 passed (1185)`

3. `npm run type-check`
   - `exit code 0`

### 新旧并存扫描

- 生产源码中 schema 期望值只剩 `10`。
- `long-request-in-progress` / `awaiting-terminal-merge` 只在 `runTrace` 实现与测试契约中出现。
- 历史文档中的 schema 9 属于历史记录，不是生产链路残留。

## M17 回头看

1. **目标对账**：Phase 5 目标为“观测与路由回归”，本轮完成 trace 事件语义、无上限长请求、活性看门狗契约与全量回归；路由差异样本已在前序 Phase 的意图语料工作中登记，本阶段没有再改生产路由器。
2. **影响圈对账**：本阶段触碰 `src/stores/runTrace.ts`、`src/stores/runTrace.spec.ts`、`src/services/toolRunSupervisor.spec.ts`。`toolRunSupervisor.ts` 的长文档能力在前序 Phase 已实现，本阶段只补契约，未改生产逻辑。
3. **新旧并存**：schema v9 生产引用清零，事件类型无旧副本；历史 trace 不做改写，通过 schemaVersion 前向兼容。
4. **测试契约**：新增测试先红后绿，覆盖去重、终态归并、无总上限但保留 idle watchdog，不是只测成功路径。
5. **登记缺口**：Phase 6 全部长文档真实 UI / 真实 API 验证尚未执行；在 Phase 6 通过前，本任务不得封装。

## 未完成

1. Phase 6：100k / 200k / 1M 字真实文档生成与可见 Electron + 真实 API 操作矩阵。
2. Phase 6：失败注入、中断恢复、拒绝授权回滚、15 秒心跳与 trace 进度证据落盘。
3. 收尾：经验文件更新、版本号升级、封装与封装产物核验。
