# 遗留问题收敛总方案

> 日期：2026-10-06  
> 状态：待用户审核；未获确认不改生产代码。  
> 门禁依据：G0.4 / G0.6 / G0.7 / G1.14 / G1.15；方案输出前已复读 v8 经验文件、2026-10-05/06 DEV_LOG、子 Agent 审计方案与现行源码。

## 0. 总体判断

前面几十轮反复修复仍复发的根源，不是单点代码质量，而是三个系统性机制：

1. **收口判定多源分叉**：批次执行、覆盖判定、模型 finishReason 各自有账本。Phase 7 现场 12/12 批已 `batch_succeeded`，模型第 58 次请求已 `finishReason=stop`，应用仍派发第 59 次请求并形成孤儿 run；这是 R1 第一优先级。
2. **执行计划与写入能力不同源**：客户现场执行计划只允许 `delete`，模型提交的 `replace_match` 两次被 `operation_not_allowed_by_execution_plan` 拒绝，导致用户看到「没有全改」。
3. **保守假设与读取/轮次机制放大成本**：窗口兜底、输出保留区、读取上限、固定工具轮次、滚动上下文各自单看合理，组合后仍会把长文档任务改造成几十次小请求；它不是本次两个 trace 的主根因，但必须在 R1 一并治理，防止其他配置形态复发。
4. **预算多源分叉**：窗口、输出、注入模式、读取分页、工具轮次、批次计划各自计算，没有统一的“这次任务到底需要多少上下文、多少轮、多少请求”决策源。
5. **执行形态路由不完整**：精确修改走 direct 工具循环，整篇重构应走 final-draft / EditTask 计划执行；当前路由对“长文档 + 整篇意图”仍会落进 direct 循环，再靠分段补偿。

Phase 0 已复核两份真实 trace 并修正旧口径：客户现场为 18 次物理请求 / 34 次工具调用 / 18 次 `fits`；Phase 7 现场为 59 次物理请求 / 79 次工具调用 / 59 次 `fits`，12/12 批 applied 但覆盖判定报 `partially_applied`。旧方案中的「9 批 / 37 次请求 / 44 次工具调用 / 5/9 批」是事件序号误读，已废弃。证据：[verification-r1-phase0-baseline/README.md](verification-r1-phase0-baseline/README.md)。

本方案只收敛已登记遗留，不新增产品能力；所有改动必须用 G1.15 四层定位（症状、链路、组合、机制）锚定后才动手。

## 1. 遗留总表

| 编号 | 遗留项 | 当前证据 | 裁决 | 优先级 |
|---|---|---|---|---|
| R1 | 长文档收口、执行计划、窗口预算、注入、读取、滚动上下文单源重构 | [Phase 0 基线](verification-r1-phase0-baseline/README.md)：客户 18 请求 / 34 工具；Phase 7 59 请求 / 79 工具 / 孤儿 run | 系统性修复 | P0 |
| R2 | 子 Agent 三工具退役与死状态清理 | [PROPOSAL_2026-10-06_SUB_AGENT_ROLE_AUDIT_AND_RETIREMENT.md](PROPOSAL_2026-10-06_SUB_AGENT_ROLE_AUDIT_AND_RETIREMENT.md) | 按既有方案执行 | P0 |
| R3 | Anthropic / Gemini / Azure 真实 live 矩阵 | 多次 DEV_LOG 登记 `untested` | 等凭据后补测 | P2 |
| R4 | 意图语料 holdout / adversarial 差距 | holdout 偏小，train/dev/test 各不足 10 条 | 持续语料工程 | P2 |
| R5 | SKILL 工具手册版本口径 | 未提交改动已同步到 3.75.0，尚未固化 | 提交前核验 | P3 |
| R6 | 1M 窗口真实模型长文档实测 | 协议/mock 已过，真实 live 覆盖不足 | 并入 R1 验证矩阵 | P1 |
| R7 | Phase 7 长文档 live heartbeat 残留 | `heartbeat.jsonl` 最后样本仍为 `running`，1 API call / 0 assistant chars | 先收口再开 R1 | P0 |

### 已修复但仍在未提交状态的三项

以下改动已经存在于工作区，属于前序任务合法交付，本方案不重复修，只在执行时固化核验：

1. DeepSeek 非 reasoner 不再兜底 64K：`src/services/conversationContextService.ts:246` 现返回 `undefined`。
2. 未声明窗口的 planning 默认值从 64K 改为 1M：`src/services/contextBudget.ts:41`。
3. SKILL 工具手册适用版本已同步 3.75.0：`_audit/SKILL_HANDOFF_API_DIRECT_WRITE_TOOLS.md:4`。

## 2. R1：长文档执行系统单源重构

### 2.1 四层定位

**症状层**  
两个 74,841 字级现场：

- 客户 trace：18 次物理请求、34 次工具调用，18 次上下文决策全部 `fits`；执行计划只允许 `delete`，两次 `replace_match` 被拒绝，用户看到部分整理未落盘。
- Phase 7 复刻：59 次物理请求、79 次工具调用，59 次上下文决策全部 `fits`；12/12 批 applied / batch_succeeded，但覆盖判定两次报 `partially_applied`，第 58 次请求已 `stop` 后又派发第 59 次 `running`，最终形成孤儿 run。

**链路层**  
入口 → 意图路由 → 上下文预算 → 注入模式 → 工具面 → 读取分页 → 写入 → 覆盖判定 → 工具轮次 → 滚动上下文。各环节证据：

- [conversationContextService.ts](/D:/codex/novel-workshop-vue3/src/services/conversationContextService.ts):246：模型名兜底已收窄，但窗口声明链仍需单源化。
- [contextBudget.ts](/D:/codex/novel-workshop-vue3/src/services/contextBudget.ts):41-45：unknown 1M、0.9 安全系数、32,768 默认保留。
- [editorContextPipeline.ts](/D:/codex/novel-workshop-vue3/src/services/editorContextPipeline.ts):96-97：大纲仍强制 `packed`，不先尝试全文。
- [outlineTools.ts](/D:/codex/novel-workshop-vue3/src/services/outlineTools.ts):8：`MAX_READ_LIMIT = 12000` 固定上限。
- [editorDocumentMap.ts](/D:/codex/novel-workshop-vue3/src/services/editorDocumentMap.ts):235-280：写入后 map/section 关系失效，要求模型重新取 map。
- [toolLoopPolicy.ts](/D:/codex/novel-workshop-vue3/src/services/toolLoopPolicy.ts):15-38：固定 6/12/4/1 轮，与批次计划无关。
- [aiService.ts](/D:/codex/novel-workshop-vue3/src/services/aiService.ts):2623-2627：每轮携带全部历史与全部工具结果。
- [providerTools.ts](/D:/codex/novel-workshop-vue3/src/services/providerTools.ts):195-244：供应商适配层保留完整消息数组。

**组件组合层**  
单看每个组件都合法：批次成功、覆盖守卫、执行计划限制、读取分页、固定轮次。组合后出现三类互相打架：批次 12/12 成功而覆盖判 partial；模型已 `stop` 而循环继续外呼；计划只允许 `delete` 而用户目标需要 `replace_match/insert`。读取上限与 section id 失效又把每一次写入变成「读取、写入、map 失效、再读取」的放大循环。

**机制层**  
应用缺少“任务何时算完成”的单源决策。批次、覆盖、模型收口、执行计划分别代表四个合理目标，但没有任何一层拥有最终裁决权，导致每个守卫都可以否决其他层的成功事实。这是设计缺口，不是实现笔误；因此不能用补丁继续调参数，必须建立单源收口与单源预算。

### 2.2 修复设计

#### A. 窗口与预算单源

1. 新建统一的 `resolveTaskContextBudget()`：输入 provider 声明窗口、模型声明输出、任务类型、文档 token 估算，输出唯一 `windowTokens / availableInputTokens / outputReserveTokens / safetyRatio / decisionSource`。`contextBudget.ts` 与 `editorContextPipeline.ts` 全部消费该结果，删除各自复算。
2. 供应商声明窗口为唯一权威来源；模型名兜底映射删除。未声明时进入 `unknown-window` 路径：仅用于规划，trace 显式标记，并在设置页提示补填，不允许静默按小窗口切分。
3. 输出保留区改为 `clamp(window * 5%, 8192, 32768)`：64K 窗口从 32,768 降到约 8,192，1M 窗口仍 32,768（约 3%）；供应商显式输出上限优先。
4. 现有两套公式（`resolveAvailableContextTokens` 的 `0.9*window-outputReserve` 与 `resolveContextBudget` 的 `window-maxOutput`）必须合并为一个，禁止继续分叉。

#### B. 注入模式

5. 删除大纲强制 packed：主页与大纲统一“全文可容纳则 full，超出则 packed”，由 A 的单源预算判定；packed 降级必须写 trace 原因。

#### C. 读取与 map 稳定性

6. `outline.read_range` 的 12K 固定上限并入 `resolveEditorReadCapChars()` 单源，随窗口动态伸缩，最低不低于现有 12K；工具描述与实际执行同批更新。
7. 写入后 section id 稳定性专项：写入不得无谓改变未受影响 section 的 id；确实需要重建 map 时，工具结果必须携带新 map 或精准失效清单，禁止让模型用搜索重新猜目标。此项执行前先做小样验证，避免盲目改数据结构。

#### D. 执行形态与轮次预算

8. 整篇重排 / 整理 / 去重 / 格式化类任务自动路由 final-draft / EditTask 计划执行；direct 工具循环只保留精确修改类任务。路由规则与意图语料回归同批执行。
9. 工具轮次从固定策略改为“计划驱动”：批次计划、读取页数、写入次数共同推导本轮预算；`toolLoopPolicy.ts` 只保留场景默认值与硬上限，运行时由任务计划覆写。禁止计划说 12 批、轮次另算一套的两本账。
10. 新增收口裁决单源：模型 `finishReason=stop` 且批次 `pending=0 / failed=0 / 全部 succeeded` 时，任务必须收口，覆盖摘要只做结果说明，不得再触发下一轮物理请求；若覆盖判定仍不满足，必须给出显式用户续跑入口而不是继续外呼。
11. 执行计划与用户目标、写入操作同源：计划允许的 operation 集合必须覆盖完成该目标所需的最小操作集；整篇整理不得生成只允许 `delete` 的执行计划。

#### E. 滚动上下文治理

10. 工具循环上下文改为：基础任务上下文 + 最新 map + 当前段材料 + 最近 N 条工具结果 + 覆盖摘要；被后续读取取代的旧工具结果折叠为引用。参数进服务测试，禁止拍脑袋常量。
11. 供应商适配层（[providerTools.ts](../../src/services/providerTools.ts)）必须保留裁剪后的消息顺序与角色，不得重新展开全量历史。

### 2.3 验收硬指标

1. 复刻客户 74,841 字 trace：物理请求 ≤ 12、工具调用 ≤ 18、无 `section_not_found` 循环、任务终态非 `partially_applied`（或给出显式用户续跑入口）；模型 `stop` 后不得派发新的物理请求。
2. 20 万字 / 1M 窗口：整篇整理不触发 `needs_segmentation`；若供应商真实窗口不足，必须显式失败并给出原因，不允许静默小窗切分。
3. 5 万、10 万、30 万字三档：全文注入、packed、EditTask 三形态各自有 Electron 真实 UI 证据。
4. 性能对比：同文档同任务相对基线请求次数、工具调用次数、端到端耗时必须下降并在 DEV_LOG 给出数字。
5. trace 新增预算决策事件：窗口来源、保留区、安全系数、注入模式、轮次推导全部可追溯。

### 2.4 执行阶段

1. **Phase 0 基线锁定**：先收口 R7；锁定两份 trace 的 before 统计（客户 18/34、Phase 7 59/79，见 [verification-r1-phase0-baseline/README.md](verification-r1-phase0-baseline/README.md)）；再用当前 HEAD 做 74,841 字真实 Electron UI 复刻，记录当前 before 请求数 / 调用数 / 耗时 / 终态。
2. **Phase 1 收口与执行计划单源**：D10-D11；先修 `stop` 后继续外呼、批次成功但覆盖 partial、执行计划只允许 `delete` 三类硬缺陷。
3. **Phase 2 窗口与预算单源**：A1-A4；单测覆盖 64K / 200K / 1M / 未声明四类。
4. **Phase 3 注入与读取**：B5-C6；主页与大纲双入口回归。
5. **Phase 4 section id 稳定性专项**：先小样验证 C7，再决定实现形态。
6. **Phase 5 执行形态与轮次**：D8-D9；意图路由正负样本回归。
7. **Phase 6 滚动上下文**：E10-E11；工具循环服务测试覆盖多轮读取。
8. **Phase 7 全维度验证**：单测、type-check、服务套件、build、Electron 真实 UI、真实供应商 live（含 R6）。
9. **Phase 8 回头看**：按 G0.5 + G1.15 复查四层定位是否全部闭环；递归反查直到一轮无新问题。

## 3. R2：子 Agent 三工具退役

方案已成熟，见 [PROPOSAL_2026-10-06_SUB_AGENT_ROLE_AUDIT_AND_RETIREMENT.md](PROPOSAL_2026-10-06_SUB_AGENT_ROLE_AUDIT_AND_RETIREMENT.md)。本方案只补充两点：

1. 执行时机放在 R1 Phase 0 之后：先移除混杂工具面，再做长文档基线，避免子 Agent 工具面污染 R1 的请求形态对比。
2. `agent.plan` 保留并纳入 R1 的轮次推导：它从“计划合同”升级为轮次预算输入，不再是独立观测件。

## 4. R3：供应商 live 矩阵

1. 现状：openai-compatible、deepseek live 已有 pass 证据；anthropic / gemini / azure-openai 多轮登记 `untested`。
2. 处理：凭据由用户提供时逐家执行 `scripts/verify-api-direct-write-live-v3.mjs`；无凭据时保持 `untested`，不伪造。R1 的单源预算改动后，四家 live 需要重跑，因为请求形状会变化。
3. Gemini 流式工具调用仍为 `unverified`，live 时优先覆盖流式形态。

## 5. R4：意图语料

1. holdout / adversarial / train / dev / test 继续按既有 Phase 2 语义层路线迭代；R1 D8 新增“整篇任务 vs 精确修改”正负样本，防止整篇意图误入 direct 循环。
2. 阈值只在 dev 集选择；写入安全阈值不因误拒放宽。
3. 验收指标：新增样本集下 falseRejection 不高于当前水平，falseAccept 为 0。

## 6. R5：工具手册版本固化

未提交改动已把适用版本同步到 3.75.0。执行收尾时只做三项核验：版本号、13 读 + 1 写清单、final-draft / direct 分工描述是否与 R1 后实际行为一致；不一致则修正文档，不改执行代码迁就文档。

## 7. R7：Phase 7 heartbeat 残留收口

[heartbeat.jsonl](_audit/verification-long-document-operation-phase7/heartbeat.jsonl) 最后样本停在 2026-10-05 13:55:47，runStatus 仍为 `running`、1 API call、0 assistant chars。处理：

1. 核实 PID 76108 与 Electron 进程是否仍在；在则先取证再终止，不在则登记为孤儿 run。
2. 将该 run 显式落终态与原因，禁止保留 `running` 现场充当进行中证据。
3. 该现场作为 R1 Phase 0 的 before 证据之一，不删除。

## 8. 执行顺序与依赖

1. R7 收口。
2. R2 子 Agent 退役（先移除混杂工具面）。
3. R1 Phase 0 基线 → Phase 1-7。
4. R5 手册固化。
5. R3 供应商 live + R6 1M 实测（依赖 R1 请求形态稳定）。
6. R4 语料迭代与 R1 Phase 4 同批启动，最后统一验收。

## 9. 风险与反制

| 风险 | 反制 |
|---|---|
| 未声明窗口时全文注入被供应商 400 拒绝 | 捕获 context 超限错误，记录供应商真实窗口，提示用户补配置；禁止静默切分 |
| 降低输出保留导致输出截断 | 保留 0.9 安全区；显式输出上限优先；trace 记录保留区来源 |
| 滚动上下文裁剪丢失关键事实 | 保留最新 map、当前段全文、覆盖摘要与最近 N 条结果；收敛请求允许恢复摘要 |
| 整篇任务误路由到 EditTask | 路由规则加正负样本回归；精确修改场景不改变现行为 |
| section id 稳定性改动伤及撤销/版本链 | Phase 3 先小样验证，验收含撤销、版本冲突、重复写拦截 |
| 删除子 Agent 工具影响长任务 | 历史真实调用为 0；`agent.plan` 与 EditTask 保留计划能力 |

## 10. 正推与反推

**正推**  
修复后，短文与可容纳全文直接走 full；整篇任务由计划执行器分批，轮次与批次同源；读取分页随窗口伸缩；工具循环不再滚动携带全量历史。用户可感知结果：不再出现“模型很慢、批次数巨大、停在 partially_applied”的组合。

**反推质询**

1. 为什么不是调大固定轮次？调大只延长空转，不解决预算、读取、滚动上下文三处分叉。
2. 为什么删除模型名兜底？兜底把新模型误伤成 64K，是本次拆分放大的直接来源之一。
3. 为什么保留 0.9 安全区？防真实网络/供应商差异造成服务端截断；它不是本次根因，保留成本低。
4. 若供应商未声明窗口且真实窗口小怎么办？显式失败 + 提示配置，优于静默小窗切分；这是有意选择。
5. 为什么不保留 packed 默认？packed 对“整篇任务”强制制造多轮读取，是执行形态劣化的入口之一。

## 11. 成熟度结论（G0.6）

| 范围 | 结论 |
|---|---|
| R2-R7 | 成熟，可执行 |
| R1 修复方向与验收标准 | 成熟 |
| R1 section id 稳定性实现形态 | 半成熟：断点是写入对 id 生命周期的真实影响未做小样验证；放行条件为 Phase 3 小样通过 |
| R1 滚动上下文参数 | 半成熟：断点是 N 与折叠规则需服务测试校准；放行条件为多轮读取回归通过 |

**总结论**：方案整体成熟，可按第 8 节顺序执行；R1 内部设两个放行点，未过放行点不进入对应写码阶段。本文件是方案，不是完成声明；所有生产改动等待你确认后开始。
