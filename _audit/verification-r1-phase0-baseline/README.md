# R1 Phase 0 基线证据：74,841 字大纲任务

> 日期：2026-10-06  
> 状态：Phase 0 基线锁定；本目录只记录 before 事实，不包含修复结果。  
> 口径：物理请求以 `apiCalls[].physicalCalls` 为唯一来源；工具调用以 `turns[].toolCalls` 为唯一来源；批次与覆盖事件以 `events[]` 为来源，且只取单一事件类型，避免把双写标签重复计数。

## 结论

旧总方案中的「9 批 / 37 次物理请求 / 44 次工具调用 / 5/9 批完成」口径已被证伪。真实情况必须分成两个现场：

| 现场 | 物理请求 | 工具调用 | 主问题 |
|---|---:|---:|---|
| 客户 trace `run-1791102184033-1` | 18（全部 success） | 34（30 成功 / 4 失败） | 执行计划只允许 `delete`，两次 `replace_match` 被拒绝；上下文全部 `fits`，慢来自滚动工具迭代 |
| Phase 7 复刻 `run-1791204961492-1` | 59（58 success + 1 running） | 79（70 成功 / 9 失败） | 12/12 批已 `applied / batch_succeeded`，但覆盖判定两次报 `partially_applied`；第 58 次请求已 `stop`，之后又派发第 59 次 `running` |

两个现场都不是「窗口不足导致强制切分」：

- 客户 trace：18 次 `contextBudgetDecision= fits`，窗口 1,000,000，可用 967,232。
- Phase 7：59 次 `contextBudgetDecision= fits`。

Phase 7 旧复刻中曾出现的 `needs_segmentation / 64K` 是另一个中间现场，不能作为这两个 run 的根因结论。

## 客户现场

来源：`C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-outline-20261004-162304-deep/run-trace.json`

### Turn 级

| Turn | intent | status | 物理请求 | 工具调用 | 耗时 |
|---|---|---|---:|---:|---:|
| turn-1791102184034-3 | edit | success | 1 | 0 | 108,628 ms |
| turn-1791102362329-1205 | edit | success | 14 | 32 | 1,176,807 ms |
| turn-1791103587461-2208 | discuss | success | 3 | 2 | 31,758 ms |

### 物理请求

- 合计 18 次，全部 `success`。
- 输入 token 合计 1,124,080；输出 token 合计 80,834。
| seq | input tokens | output tokens | 耗时 ms | finishReason |
|---:|---:|---:|---:|---|
| 1 | 60,957 | 6,389 | 108,450 | stop |
| 2 | 62,132 | 7,553 | 122,731 | tool_calls |
| 3 | 63,198 | 1,258 | 23,142 | tool_calls |
| 4 | 65,381 | 2,801 | 47,219 | tool_calls |
| 5 | 66,753 | 9,135 | 141,787 | tool_calls |
| 6 | 66,627 | 892 | 17,787 | tool_calls |
| 7 | 70,131 | 5,012 | 84,088 | tool_calls |
| 8 | 71,502 | 4,897 | 85,483 | tool_calls |
| 9 | 72,729 | 6,206 | 106,641 | tool_calls |
| 10 | 73,785 | 1,491 | 29,442 | tool_calls |
| 11 | 73,817 | 20,854 | 299,360 | tool_calls |
| 12 | 74,886 | 537 | 15,047 | tool_calls |
| 13 | 80,485 | 1,677 | 31,573 | tool_calls |
| 14 | 81,051 | 6,873 | 104,059 | tool_calls |
| 15 | 81,163 | 3,981 | 63,396 | stop |
| 16 | 18,597 | 283 | 7,600 | tool_calls |
| 17 | 19,956 | 312 | 8,115 | tool_calls |
| 18 | 20,930 | 683 | 15,742 | stop |

说明：上表 seq 按 trace 内连续物理请求序号 1-18 记录；Turn 2 内部是 seq 1-14，Turn 3 是后续 3 次。

### 工具调用

| 工具 | 次数 |
|---|---:|
| editor.locate | 16 |
| outline.search | 6 |
| outline.read_range | 5 |
| editor.write | 4 |
| editor.get_state | 1 |
| editor.search | 1 |
| editor.document_map | 1 |

失败 4 次：

1. `editor.write` x2：`operation_not_allowed_by_execution_plan`。执行计划只允许 `delete`，模型提交的 `replace_match` 被拒绝。
2. `editor.locate` x2：`target_not_found`。

Turn 2 的结束响应明说：部分整理项因执行计划只允许 `delete`，`replace_match` / `insert` 未落盘。这是客户看到「没有全改」的直接证据。

### run 终态矛盾

顶层 run status 仍是 `running`，但 3 个 turn、3 个外层 apiCall 全部 `success`。当前证据不足以判定这是缺陷还是 run 未归并终态；R1 Phase 0 的当前代码复刻需要观察同一现象，Phase 1 再决定是否纳入状态机修复。

## Phase 7 现场

来源：`_audit/verification-long-document-operation-phase7/outline-no-skill/run-trace/run-trace-outline-20261005-205601/run-trace.json`

R7 已将该 run 显式收口为 `failed / orphaned_electron_process`，因此它只能作为 before 现场，不能当完成态证据。

### 总量

- 物理请求 59 次：58 次 `success`，第 59 次 `running`。
- 输入 token 合计 6,277,254；输出 token 合计 191,626。
- 最大单次输入 159,448 token。
- 工具调用 79 次：70 成功 / 9 失败。

### 工具分布

| 工具 | 次数 |
|---|---:|
| editor.read_range | 22 |
| editor.search | 20 |
| editor.document_map | 16 |
| editor.write | 13 |
| editor.locate | 4 |
| editor.get_state | 2 |
| agent.plan | 2 |

### 9 次失败

| 工具 | 错误 | 原因 |
|---|---|---|
| editor.read_range | invalid_input | 只传 `cursor: "0"`，缺 sectionId 或有效 cursor |
| editor.write | invalid_input | `replace_match` 缺 `content`，被守卫拒绝 |
| editor.read_range x4 | section_not_found | 写入后 section id 失效：`heading-18165`、`heading-17576`、`heading-16768`、`heading-10190` |
| editor.read_range x2 | invalid_input | 传了不支持的 `offset/limit` 分页字段 |
| editor.locate | target_not_found | 探测句片段在写入后已不存在 |

### 批次与覆盖不同源

事件层有 12 个 `edit-task-batch-planned`，且 12 个批次全部出现 `AI 批次applied` 与 `edit-task-batch-succeeded`：

| 批次 | segment | 范围 | 策略 | commands |
|---|---|---|---|---:|
| ai-edit-muv9dpkl-1 | structure-plan | 0-75024 | delete | 4 |
| ai-edit-muv9imax-2 | structure-plan | 0-75024 | delete | 1 |
| ai-edit-muv9qlry-3 | structure-plan | 0-75024 | delete | 3 |
| ai-edit-muv9waxa-4 | normalize-segment-1 | 0-46748 | replace_match | 1 |
| ai-edit-muv9ziay-5 | normalize-segment-1 | 0-46748 | replace_match | 1 |
| ai-edit-muva3ujl-6 | normalize-segment-1 | 0-46748 | replace_match | 2 |
| ai-edit-muva6we9-7 | normalize-segment-1 | 0-46748 | replace_match | 1 |
| ai-edit-muva97w5-8 | normalize-segment-1 | 0-46748 | replace_match | 3 |
| ai-edit-muvab6r7-9 | normalize-segment-1 | 0-46748 | replace_match | 3 |
| ai-edit-muvae6co-a | normalize-segment-1 | 0-46748 | replace_match | 1 |
| ai-edit-muvao5nu-b | normalize-segment-1 | 0-46748 | replace_match | 6 |
| ai-edit-muvavlfu-c | normalize-segment-1 | 0-46748 | replace_match | 9 |

但同一现场出现两次 `写入覆盖不足：partially_applied`（事件 `event-1791207074383-1532`、`event-1791207074385-1534`）。也就是说：

- 批次执行层：12/12 `applied`，最后批次 `batch_succeeded`，`pendingBatches=[]`、`failedBatches=[]`。
- 覆盖判定层：仍给出 `partially_applied`。
- 工具循环层：继续外呼，直到第 58 次请求 `finishReason=stop` 后又派发第 59 次 `running` 请求，最终 Electron 进程消失形成孤儿 run。

这是 R1 最重要的 before 事实之一：收口判定不是由批次计划单源决定，批次、覆盖、模型收口三层各自有账本。

## 当前 HEAD 复刻现场（2026-10-06）

来源：`_audit/verification-r1-phase0-baseline/electron-before/turns.json`  
运行方式：真实可见 Electron 窗口、真实 DOM 操作、真实供应商 `https://openapi.cloud-ai.cn/v1`、模型 `deepseek-v4-pro`。  
代码状态：R7 / R2 已收口后的当前 HEAD（子 Agent 三工具已退役），未做 R1 Phase 1 修复。  
run：`run-1791262269671-1`

### Turn 级

| Turn | 原话 | intent | status | 物理请求 | 工具调用 | 耗时 | 回复 |
|---|---|---|---|---:|---:|---:|---:|
| 1 | 按照Word文档的形式重构大纲，不要缩减内容。 | edit | failed | 29（27 success / 2 failed） | 38（34 success / 4 failed） | 2,181,031 ms | 43 字 |
| 2 | 符合我的要求，分叉一允许去重。不用出预览，直接写入 | edit | partially_applied | 21（全部 success） | 29（27 success / 2 failed） | 1,405,277 ms | 89 字 |
| 3 | ** 为什么会有这个符号 | discuss | success | 2（全部 success） | 1（success） | 22,205 ms | 232 字 |

合计：52 次物理请求（50 success / 2 failed），68 次工具调用（62 success / 6 failed）。

### 长文档决策

- Turn 1 / Turn 2：`edit-task`，`decision=fits`，`reason=execution-plan-edit-task`，segments=3，estimatedPhysicalRequests=3；窗口 `contextWindowTokens=1,000,000`，`effectiveInputTokens=900,000`，文档估算 token 分别为 38,909 / 38,697。
- Turn 3：`direct`，`decision=fits`，estimatedPhysicalRequests=1，文档估算 token 38,148。
- 本现场没有出现 64K 强制切分；慢和失败来自工具循环、写入失败与收口分叉，不是窗口预算。

### 工具失败

| Turn | 工具 | 错误 |
|---|---|---|
| 1 | editor.read_range | section_not_found |
| 1 | editor.read_range | invalid_input |
| 1 | editor.write | invalid_input |
| 1 | editor.write | target_not_found |
| 2 | editor.read_range | section_not_found |
| 2 | editor.write | invalid_input |

### 物理请求失败

Turn 1 的 seq 19 / seq 29 两次物理请求失败。运行过程中页面侧观察到供应商 502 与一次 `tool_iteration` 阶段的 `Cannot read properties of undefined (reading 'slice')`；`turns.json` 只保留了 status/duration，没有保留错误文本，因此错误归因需在 Phase 1 修复 trace 覆盖后再复核。该缺口本身登记为观测性缺陷。

### 与旧现场的对照

1. 客户现场 18 请求 / 34 工具；Phase 7 现场 59 请求 / 79 工具；当前 HEAD 52 请求 / 68 工具。R7 / R2 收口后仍未消除长文档任务的多轮滚动循环。
2. `partially_applied` 在当前 HEAD 复现：批次计划估算 3 个物理请求，实际执行 21 次，最终仍以覆盖不足收口，证明 D10/D11 不是历史遗留，而是当前代码仍存在的缺陷。
3. `section_not_found` 仍在写入后复现，证明 section id 失效问题仍存在。
4. 上下文窗口已按 1,000,000 识别且 `fits`，Phase 2 的窗口单源仍需治理其他供应商/配置形态，但不是本现场的慢根因。

### 验证脚本证据缺口

`summary.json` 的 `copiedRunTraces=[]`：脚本在 Electron 关闭后清理了 `_data/r1-phase0-baseline-profile`，而持久化 run trace 导出目录没有产出可复制文件。页面内快照 `turns.json` 已保留 turn / apiCall / physicalCall / toolCall / longDocumentEvent / assistantReply，足够支撑本次 before 统计，但物理请求错误文本与原始 payload 缺失。Phase 1 需要同步修复验证器的 run trace 复制与错误文本落盘，禁止再用“无 copiedRunTraces 但口头描述错误”的口径。

## 对总方案的修正

1. R1 的第一优先级从「窗口预算单源」调整为「执行收口单源」：`stop` 后不得因另一层判定未满足而继续派发请求；批次 `pending=0/failed=0/succeeded=12` 必须能推导任务收口。
2. 窗口预算单源仍保留，但定位从「强制切分根因」改为「避免其他供应商/配置形态复发的前置治理」。客户与 Phase 7 现场 `fits` 的证据证明它不是这两个现场的主根因。
3. 执行计划与模型写入能力必须同源：计划只允许 `delete` 却要求模型完成 `replace_match/insert`，会制造必然失败的写入和额外轮次。
4. 旧指标「物理请求 ≤12、工具调用 ≤18」仍可作为修复后验收线，但 before 基线必须引用本文件的真实统计。

## Phase 1 当前裁决

1. **D10（stop 后继续外呼）**：当前 HEAD 的 orchestrator 契约测试通过，收到 `incomplete_write_coverage_checkpoint` 后不再派发新物理请求；Phase 7 的 59 次请求现场判为旧代码现场。
2. **D11（计划白名单断层）**：当前 HEAD 已由 activeTask 延续机制修复，live 复刻未再出现 `operation_not_allowed_by_execution_plan`；新增横向契约锁住「允许操作集必须覆盖全部 segment writeStrategy」。
3. **移交 Phase 4**：`section_not_found / target_not_found / invalid_input / partially_applied` 是 section id 失效与批次覆盖问题，不是 D11 白名单问题。
4. **观测性**：验证器与产品侧代码已接线（`observability.jsonl`、console/request failure、run trace 导出、`physical.error` 投影），但本目录的 before 证据仍是修复前现场；after 阶段必须真实重跑，不能用代码存在冒充运行证据。
