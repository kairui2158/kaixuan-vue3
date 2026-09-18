# 运行记录会话聚合方案

> 日期：2026-09-10  
> 状态：待审核，未执行  
> 依据：`_audit/神意开发经验总结_v3.md`、运行记录现有实现全量排查  
> 目标：大纲工作台与主页编辑器的运行记录从“按请求切分”改为“按会话聚合”，一次导出覆盖完整调试过程；生成流水线保持现有单任务粒度不变。

## 1. 问题定义

### 1.1 用户反馈

在大纲工作台与 API 对话 3-4 次，运行记录面板出现 5 条独立记录。用户需要分别复制或导出 4-5 次才能拿到完整调试现场，工作量成倍增加。

### 1.2 根因（源码已确认）

| 文件 | 位置 | 现有行为 |
|------|------|---------|
| `src/components/common/OutlineWorkspace.vue` | `startOutlineRun()` line 360 | 每次用户发送调用 `runTraceStore.startRun()`，创建一条新记录 |
| `src/components/chat/ChatPanel.vue` | `startHomeRun()` line 207 | 同上，主页每次发送创建一条新记录 |
| `src/stores/runTrace.ts` | `startRun()` line 221 | 每次调用生成独立 `RunTrace` 对象并 unshift 到列表 |
| `src/stores/runTrace.ts` | `finishRun()` line 342 | API 结束即关闭该记录并落盘 |

**结论**：记录粒度是“一次用户请求 = 一条记录”。生成流水线适合这个粒度（一次卷纲生成是一个完整任务），但对话型入口（大纲工作台、主页编辑器）是长会话，按请求切会把调试证据碎片化。

### 1.3 为什么不采用纯时间窗口

固定时间长度（如 30 分钟）切分有三个问题：

1. 时间点可能正好落在流式输出中间，一次 API 回答被切成两段。
2. 用户中途切换技能/模型/模式时，不同配置混进同一个时间桶，排查时难定位。
3. 用户“暂停思考 40 分钟再继续”会被强制切一条新记录，破坏语义连续性。

**采用“会话聚合”而非“时间聚合”**：一条记录对应一个连续的对话会话，会话内部的每次请求作为“轮次”（turn）分组展示。

## 2. 设计目标

1. **一条运行记录 = 一个对话会话**。从会话开始到会话结束，所有 API 调用、流式输出、工具调用、续生成、意图路由、降AI检测事件都进同一条记录。
2. **轮次内分组**。每次用户请求在记录内显示为“第 N 轮”，左右列表不显示 5 条记录，显示 1 条含 5 轮的记录。
3. **导出一次到位**。点这一条记录，导出 JSON 或复制文本，就是完整调试过程。
4. **生成流水线零改动**。流水线仍按任务记录（一次卷纲生成 = 一条记录），不做聚合。
5. **旧数据兼容**。已落盘的旧格式 JSON 仍可读；列表内旧记录显示为“单轮会话”。
6. **不截断**。会话内 API 调用数和事件数不设上限，落盘保持完整现场（与经验 §8 规则 76 一致）。

## 3. 数据结构设计

### 3.1 新增 RunTraceTurn 接口

```typescript
interface RunTraceTurn {
  id: string
  seq: number
  startedAt: number
  endedAt?: number
  durationMs?: number
  status: RunTraceStatus
  userRequest: string
  skillNames?: string[]
  mode?: string
  intent?: string
  error?: string
}
```

### 3.2 RunTrace 扩展（增量字段，不重结构）

```typescript
interface RunTrace {
  // ...现有字段全部保留，不动...
  turns: RunTraceTurn[]           // 新增：轮次元数据
  currentTurnId?: string          // 新增：当前进行中的轮次（不导出）
  sessionKind?: 'task' | 'chat'   // 新增：pipeline 固定为 task，outline/home 固定为 chat
}
```

**设计决策：事件和 API 调用保持平铺，不搬进 turns 嵌套结构。**

理由（基于经验 §1 M 系列改动污染防御）：

1. 现有 `events: RunTraceEvent[]` 和 `apiCalls: RunTraceApiCall[]` 的消费方遍布导出、落盘、面板渲染。搬进嵌套结构意味着所有消费方都要改，改动面失控。
2. 改为在 `RunTraceEvent` 和 `RunTraceApiCall` 上各加一个可选字段 `turnId?: string`，UI 按 `turnId` 分组渲染，导出按 `turnId` 分段输出。
3. 旧记录（无 `turnId`）自动归入“未分组”或虚拟第 1 轮，零迁移成本。

### 3.3 落盘格式

磁盘 JSON 的 `schema` 从 `shenyi.run-trace` 不变，`version` 从 2 升到 3：

```json
{
  "schema": "shenyi.run-trace",
  "version": 3,
  "run": {
    "source": "outline",
    "sessionKind": "chat",
    "turns": [
      { "id": "turn-1", "seq": 1, "userRequest": "审核大纲", "status": "success" },
      { "id": "turn-2", "seq": 2, "userRequest": "修改第三卷", "status": "success" }
    ],
    "events": [
      { "id": "e1", "turnId": "turn-1", "type": "user-request", "label": "用户请求" },
      { "id": "e2", "turnId": "turn-1", "type": "api-success", "label": "第 1 次 API 调用完成" },
      { "id": "e3", "turnId": "turn-2", "type": "user-request", "label": "用户请求" }
    ],
    "apiCalls": [
      { "id": "api-1", "turnId": "turn-1", "seq": 1, "status": "success" },
      { "id": "api-2", "turnId": "turn-2", "seq": 2, "status": "success" }
    ]
  }
}
```

**version 2 旧文件兼容**：读取时检测 `version < 3` 且无 `turns` 字段，自动包装为单轮虚拟会话，不做磁盘迁移。

## 4. 会话生命周期

### 4.1 会话开始

大纲工作台或主页编辑器的第一次用户请求时，`startRun()` 创建 `sessionKind: 'chat'` 的记录，同时创建第 1 轮。

### 4.2 会话延续（核心变化）

后续用户请求不再调用 `startRun()`，改为调用新增的 `startTurn()`：

```typescript
function startTurn(runId: string, input: {
  userRequest: string
  skillNames?: string[]
  mode?: string
  intent?: string
}): string
```

`startTurn()` 做三件事：

1. 在 `run.turns` 里追加一个新轮次。
2. 将 `run.status` 从终态重置为 `running`。
3. 后续的 `addEvent()`、`startApiCall()` 自动携带当前 `turnId`。

### 4.3 轮次边界判定（执行前必须定死）

同一个用户请求引发的多次 API 调用，全部归属同一个 `turnId`，不得拆轮：

| 场景 | 归属 | 说明 |
|------|------|------|
| chain 模式一次请求触发 S1→S2→S3 多次调用 | 同一轮 | 一个用户请求 = 一轮，链上每次调用是轮内事件 |
| API 中断后的"续生成" | 同一轮 | 续生成是同一回答的延续，不是新一轮用户请求 |
| compose 模式拼接为一次调用 | 同一轮 | 单次调用，天然同轮 |
| 意图路由后的短路执行（如只跑诊断） | 同一轮 | 路由结果是轮内事件，不是独立轮 |
| 用户主动重新发送新请求 | 新一轮 | 唯一合法的 `startTurn()` 触发点 |
| 上轮失败后用户手动重试 | 新一轮 | 新的用户动作，独立留痕便于对比失败现场 |

实现约束：`startTurn()` 只允许出现在"用户发起新请求"的入口。续生成、chain 链上后续调用、意图路由全部复用当前 `currentTurnId`，只追加 `startApiCall()` 与事件。

### 4.4 会话结束（自动关闭条件）

以下任一条件触发时，当前 chat 会话被关闭（`finishRun()`），下一条请求开新会话：

| 触发条件 | 实现位置 | 说明 |
|---------|---------|------|
| 用户点击“清空记忆” | `ChatPanel.vue` / `OutlineWorkspace.vue` 现有清空函数 | 语义重置，记录也应封存 |
| 用户切换对话会话 | chatStore 会话切换 | 上下文断裂 |
| 用户切换项目 | projectStore 项目切换 | 项目隔离 |
| 应用退出 | Electron `before-quit` | 防止数据丢失 |
| 运行中发生不可恢复错误 | 现有 catch 分支 | 错误封存 |
| 超过列表滚动窗口 | `maxRuns = 20` | 已有机制，不变 |

### 4.5 手动封存（可选功能）

运行记录面板新增“完成本段记录”按钮。用户调试某一段想单独封存时，点击后当前会话立即关闭，下一条请求开新会话。

这个按钮放在导出 Tab 内，与“导出本次 JSON”、“复制完整文本”并排。不放在列表项上，避免误触。

## 5. 落盘策略

### 5.1 问题

当前 `finishRun()` 只在运行结束时调用一次 `saveRunToDisk()`。改为会话聚合后，一个会话可能持续数小时、包含数十轮对话，如果只在会话结束时落盘，中途崩溃会丢失全部调试现场。

### 5.2 方案：每轮结束增量落盘

每轮的 `finishApiCall()` 全部完成后（即一轮对话结束时），调用 `saveRunToDisk()`。同一个会话的磁盘文件被反复覆写，文件随会话增长。

文件命名从按 `startedAt` 时间戳改为：

```text
run-trace-{source}-{session-start-timestamp}.json
```

同一会话内覆写同一文件名，不会产生碎片文件。

### 5.3 写入安全

沿用主进程现有 `saveTraceFile()` 的写入方式，并追加一层保护：

```javascript
// 先写临时文件再原子替换，防止写入中途崩溃产生半截 JSON
await fs.promises.writeFile(filePath + '.tmp', jsonStr, 'utf8')
await fs.promises.rename(filePath + '.tmp', filePath)
```

这与经验 §7 存储纪律的原子写入要求一致。

## 6. UI 变更

### 6.1 左侧列表

当前显示 5 条重复记录。改为：

```text
大纲工作台  2026-09-09 05:12:03
大纲共创 · 5 轮
成功 · chain · 会话进行中
```

一条记录，`turns.length` 显示为轮次徽标。状态显示会话整体状态：任一轮失败则显示失败，全部成功则显示成功，进行中则显示进行中。

### 6.2 右侧详情 - 时间线 Tab

每轮之间插入轮次分隔条：

```text
────── 第 1 轮 · 审核大纲看看缺什么 ──────
[05:12:03] [info] 用户请求
[05:12:03] [info] 意图路由：analyze
[05:12:05] [info] 第 1 次 API 调用开始
[05:12:45] [info] 第 1 次 API 调用完成

────── 第 2 轮 · 修改第三卷结构 ──────
[05:13:22] [info] 用户请求
...
```

### 6.3 右侧详情 - API 调用 Tab

API 调用列表按轮次分组显示。每轮一个可折叠区块，轮次标题显示用户请求摘要：

```text
▼ 第 1 轮：审核大纲看看缺什么
  第 1 次调用 · S1-大纲诊断师 · 成功 · 42000ms
    [请求消息] [流式输出] [完整返回]

▼ 第 2 轮：修改第三卷结构
  第 2 次调用 · S2-大纲编辑指令师 · 成功 · 35000ms
```

### 6.4 导出 Tab

按钮和交互不变，但导出范围从单次请求变为整个会话：

- “导出本次 JSON”：导出完整会话，含所有轮次。
- “复制完整文本”：复制完整会话文本。
- 新增“完成本段记录”：手动封存当前会话。

导出默认文件名同步调整：对话类会话不再使用 `stepName`（对话没有稳定步骤名），改为 `run-trace-{source}-{session-start-timestamp}.json`，与自动落盘文件名保持一致，避免同名会话导出多个名字相近的文件。流水线导出文件名保持现状。

### 6.5 面板顶部说明文案

从“仅保留最近 20 次运行，每次运行完整记录全过程”改为“仅保留最近 20 次运行，对话类运行按会话聚合，一次导出覆盖完整调试过程”。

## 7. 代码改动清单

### 7.1 打算改的文件

| 文件 | 改动 | 规模 |
|------|------|------|
| `src/stores/runTrace.ts` | 新增 `RunTraceTurn`、`startTurn()`、`finishTurn()`、事件/调用自动携带 `turnId`、每轮落盘 | 中 |
| `src/components/common/OutlineWorkspace.vue` | `startOutlineRun()` 拆分：首次创建 run，后续 `startTurn()`；会话关闭条件接入 | 中 |
| `src/components/chat/ChatPanel.vue` | `startHomeRun()` 同上拆分 | 中 |
| `src/components/common/RunTracePanel.vue` | 列表轮次徽标、时间线轮次分隔条、API 按轮分组、手动封存按钮 | 中 |
| `src/stores/runTrace.spec.ts` | 新增会话聚合、轮次分组、落盘时机、旧格式兼容测试 | 小 |
| `electron/ipc/runTrace.js` | 落盘文件名稳定化、原子写入 | 小 |

### 7.2 必须不改的

1. `PipelinePanel.vue` 的 4 处 `startRun()` / `finishRun()` 调用。
2. `runTraceStore.startRun()` 的现有签名和行为。
3. `exportRunToJson()` 和 `exportRunToText()` 的双侧递归脱敏逻辑。
4. `maxRuns = 20` 滚动窗口机制。
5. `folderDiagnostics` 的追加逻辑。
6. 现有事件类型和 API 调用记录的字段结构。
7. 运行记录 IPC 通道名和权限边界。

## 8. 分阶段任务

### P0 数据结构与 Store

1. `RunTrace` 新增 `turns`、`currentTurnId`、`sessionKind` 字段。
2. `RunTraceEvent` 和 `RunTraceApiCall` 新增可选 `turnId` 字段。
3. 新增 `startTurn(runId, input)`。
4. 新增 `finishTurn(runId, turnId, status, error)`。
5. `addEvent()` 和 `startApiCall()` 自动写入当前 `turnId`。
6. `finishTurn()` 触发 `saveRunToDisk()`。

验收：

- 单元测试覆盖多轮会话、事件归属、旧记录降级。
- `startRun()` 对 pipeline 消费方行为完全不变。

### P1 大纲工作台接入

1. `startOutlineRun()` 重构：
   - 当前无活跃 chat run 或已结束时，`startRun()` 创建新会话。
   - 当前有活跃 chat run 时，`startTurn()` 延续会话。
2. `finishOutlineRun()` 重构：
   - 常规结束只结束当前轮次，不关闭会话。
   - 会话关闭条件触发时才 `finishRun()`。
3. 会话关闭条件接入：清空记忆、项目切换、不可恢复错误。

验收：

- 大纲工作台连续对话 3 次，列表只有 1 条，详情显示 3 轮。
- 每轮结束后磁盘文件覆写更新，不产生新文件。
- 清空记忆后会话封存，下次对话开新记录。

### P2 主页编辑器接入

与 P1 相同的拆分逻辑，作用于 `ChatPanel.vue`，并额外接入“切换对话会话即封存当前记录”。

验收：同 P1，验证入口为主页编辑器。

### P3 面板 UI

1. 列表项新增轮次徽标。
2. 时间线按轮次分组渲染分隔条。
3. API 调用按轮次分组渲染可折叠区块。
4. 导出 Tab 新增“完成本段记录”。
5. 顶部说明文案更新。

验收：

- 1 条含 5 轮的记录在列表中只显示 1 条。
- 时间线有 5 个轮次分隔条。
- “复制完整文本”包含全部 5 轮的请求、流式输出和返回内容。

### P4 落盘与兼容

1. `electron/ipc/runTrace.js` 文件名稳定化、临时文件 + 原子替换。
2. 导出 JSON `version` 升到 3；无 `turns` 字段的旧数据降级为平铺显示。

验收：

- 同一会话多轮对话后，`run-trace/outline/` 下只有 1 个 JSON 文件。
- 文件内容包含所有轮次完整数据。
- 写入中断不产生半截主文件。

### P5 测试与文档

1. `runTrace.spec.ts` 扩充会话聚合、事件归属、旧格式兼容、多轮脱敏测试。
2. 更新 `_audit/神意开发经验总结_v3.md`：
   - 对话型入口的运行记录必须按会话聚合，不按请求切分。
   - 长会话运行记录必须每轮落盘，不能只在会话结束时写盘。
3. 新增 `DEV_LOG_2026-09-10-run-trace-session-aggregation.md`。

## 9. 验证门

完成定义，以下全部通过才算完成：

1. `npm run type-check` 通过。
2. `npx vitest run src/stores/runTrace.spec.ts` 全部通过。
3. `npm run build:vue` 通过。
4. 源 Electron + CDP 真实操作验证：
   - 大纲工作台连续对话 3 次：列表 1 条，详情 3 轮，导出 1 次覆盖全部。
   - 主页编辑器连续对话 3 次：同上。
   - 生成流水线卷纲生成：仍为单任务粒度，行为与改动前一致。
   - 清空记忆：会话封存，新对话开新记录。
   - 磁盘文件数与会话数一致，无碎片文件。
5. `git diff` 逐行自审，每行可归因于本计划。

## 10. 风险与回退

| 风险 | 等级 | 缓解 |
|------|------|------|
| 会话过长导致单条记录巨大 | 中 | 会话内部不设上限，保持完整现场；列表滚动窗口 20 条限制总量 |
| 改动波及流水线 | 高 | 流水线调用点零改动；`startRun()` 行为不变；单元测试锁定 |
| 会话关闭条件漏判导致记录不结束 | 中 | 保留 `abandonRunningRun()` 兜底；应用退出强制落盘 |
| 旧格式 JSON 不兼容 | 低 | 无 `turns` 字段时 UI 降级为平铺显示 |
| 每轮落盘造成 IO 压力 | 低 | 每轮一次而非每个 chunk 一次；MB 级覆写开销可忽略 |

## 11. 依赖与边界

本方案纯 TypeScript / Vue / Electron 原生能力实现，不新增 npm 依赖。

## 12. 执行顺序

1. P0 数据结构与 Store。
2. P1 大纲工作台接入。
3. P2 主页编辑器接入。
4. P3 面板 UI。
5. P4 落盘与兼容。
6. P5 集成验证与文档更新。
7. 用户实测。
8. 版本升级与封装。

## 13. 铁律

1. 先读再改，apply_patch 编辑。
2. 精准修复，不改动不相关的代码和组件。
3. 流水线调用点绝对不动。
4. 测试必须源 Electron 启动，不允许网页/开发者模式/安装版。
5. 每轮落盘，防止长会话崩溃丢数据。
6. 脱敏逻辑双侧执行，不因聚合遗漏任何一轮的 API Key 遮盖。
