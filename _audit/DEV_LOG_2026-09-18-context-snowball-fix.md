# 2026-09-18 上下文滚雪球修复 Phase 2 开发日志

## 任务

落地 [PROPOSAL_2026-09-18_CONTEXT_SNOWBALL_FIX.md](PROPOSAL_2026-09-18_CONTEXT_SNOWBALL_FIX.md) 的 Phase 2：把非破坏性上下文治理接入生产入口，补齐观测链路，并修复 Phase 1 遗留的折叠错位缺陷。

## 根因与修复

1. `recordTurn()` 旧实现用 `compactedMessageCount` 从原始 `session.messages` 头部截取折叠项。第二次压缩时，过滤后的计数与未过滤数组错位，会把保护尾部的消息错误折叠。现在按 `ts + role + content` 身份集合匹配 `retainedMessages`，凡不在 retained 集合内的消息才折叠，原文仍保留在本地存储。
2. `setCompactionBudget()` 存在但生产无调用方，压缩永远不会触发。现在主页、大纲工作台的直接对话与共创技能路径在组装请求前统一调用 `setCompactionRouting()`。
3. 单例 `conversationContextService` 被多 workspace 共享，全局 budget 会互相覆盖。现在 routing 按 `main` / `outline` 分桶，互不覆盖。
4. Provider 只有输出 `maxTokens`，没有输入窗口元数据。新增 `resolveModelContextWindow()`，仅从模型名里的明确声明（如 `128k`、`1m`、Claude/GPT/DeepSeek 常见系列）解析输入窗口；未知模型返回 `undefined`，跳过压缩并写入 DiagLogger `context/compaction`，绝不把输出上限误当输入窗口，也不猜测窗口。
5. 观测缺口：压缩发生时同步写 runTrace `context-compacted` 事件、DiagLogger `context/compaction`、组件 trace 事件；模型窗口未知时 DiagLogger 记录“跳过压缩”。

## 本次范围

- 服务层：身份折叠、workspace routing、observer、模型窗口解析。
- 入口层：`ChatPanel.callApi()`、`ChatPanel.runHomeCoCreationSkills()`、`OutlineWorkspace.askAi()`、`OutlineWorkspace.askPlainAi()`。
- 测试：修正错误断言（最新用户目标应断言在 `retainedMessages`，不在 marker），新增二次压缩、marker 保留、workspace 隔离、模型窗口解析测试。

## 暂缓项（非本次缺陷）

- Pipeline 的 chain 中间产物治理属 Phase 3，后续单独执行。
- 工具消息目前不进入 context service 的 session 存储，工具配对闭包不适用本阶段；chain 工具上下文已在工具循环内维护。
- runTrace 面板的上下文构成对比展示延后。

## 验证

- `npm run test:services -- src/services/conversationContextService.spec.ts`：20 passed。
- `npm run test:services`：71 files / 657 tests passed。
- `npm run type-check`：exit 0。
- `npm run build:vue`：exit 0。

## 收尾门禁编号修正

回头看发现 09-18 新增门禁最初写入为 M27/M28，与既有 M27/M28 撞号，违反“新旧不能并存”要求。已顺延为 M30/M31，并同步更新最高优先级门禁速查。

## 多轮回头看补修

用户要求执行“回头看 + 修复”轮回，任一轮无新问题即停止。第 1 轮发现并修复两个缺陷：

1. `recent` 裁剪策略从 `bundle.session.recentMessages` 截取，可能把带 `meta.compaction` 的已折叠历史重新注入请求。现改为先过滤 folded 消息再按 recentTurns 截取，marker 仍保留。
2. `recordTurn()` / `recordEditorEvent()` 在写队列外读取整个 state，多个异步轮次并发时会用旧快照覆盖后落盘的会话，导致轮次丢失。现在读取、追加、压缩、落盘全部在同一个项目写队列临界区内执行，移除旧快照合并逻辑。

新增回归测试：recent 不回放折叠历史；12 个并发 `recordTurn()` 全部 24 条消息落盘。专项测试 22 passed，type-check exit 0。

## 多轮回头看第 2-4 轮：真实输出预算接线

第 2 轮发现压缩预算仍有一个分叉：`reservedOutputTokens` 只从 workspace 路由桶读取，而真实请求的输出上限实际有四种来源（folder Agent、主页 direct、大纲 direct、重试后提升值）。Agent 配置更大输出上限时会过度压缩，direct 场景则可能零预留。

修复为 per-turn budget 优先：

1. `ContextTurn` 新增 `reservedOutputTokens`；`compactContext()` 新增 request-level 参数，有效值覆盖 workspace 路由桶。
2. `realSkillExecutor` 记录 `finalMaxTokens`（优先最终 API 结果，含 max_tokens 提升重试后的有效值），三处 `apiMeta` 返回补齐。
3. `workspaceSkillEngine` 的 folder/text 路径、`ChatPanel` 的技能与 direct 路径、`OutlineWorkspace` 的 direct 路径全部改为传递本轮真实值。

第 3 轮回头抓到失败轮缺口：失败轮也会写入上下文历史，但没有带真实输出上限。现在主页与大纲的失败 recordTurn 都带上当轮 `maxTokens`。

第 4 轮只读审计未再发现代码缺陷；补齐“无本轮预算时回落 workspace 路由预算”的回归测试。

### 验证

- `npm run test:services -- src/services/conversationContextService.spec.ts`：24 passed。
- `npm run type-check`：exit 0。
- `npm run test:services`：71 files / 660 tests passed（新增回落测试前为 659，含并发与 recent 回归）。
- `npm run build:vue`：exit 0。

## 多轮回头看第 5-10 轮：trace 请求一致性与崩溃现场

第 5 轮修复：`OutlineWorkspace.askPlainAi()` 的 trace 请求记录为空数组，真实请求已组装 `requestMessages` 但没有传入 trace。现在 trace 与真实请求同源。

第 6 轮审计：核对 PipelinePanel 的 `onRequestBuilt`、`apiMeta.requestMessages` 与 physical calls 回填链路，未发现缺陷。

第 7 轮修复：大纲工作台续生成的真实请求使用 `buildContinuationMessages(snapshot)`，trace 却只记 `snapshot.originalMessages`。现在 trace 与真实续写请求一致。

第 8 轮修复：主页 ChatPanel 存在同类续生成缺陷，trace 缺少已生成长文的续写上下文与续生成指令。现在先构建 `continuationRequestMessages = buildContinuationMessages(snapshot)`，再传给主页 API 调用与 trace。

第 9 轮审计：核对技能路径 trace 回填（成功/失败分支均调用 `onApiCallFinish`）、工具轮请求轨迹（初始消息、每轮工具结果、收敛轮均入 `toolRequestDeltas`）、失败/取消轮闭合（`finishRun` 与 `cancelRunningApiCalls` 兜底闭合 running calls 与 physical calls），未发现新缺陷。

第 10 轮修复：运行记录此前只在 turn/run 结束时落盘，渲染进程在长流式生成中途崩溃或被强关时，崩溃前的流式现场会全部丢失。现在：

1. `appendStream()` 在运行中 run 上启用 5 秒 debounce 快照保存，低频写盘且不阻塞生成。
2. `finishApiCall()` 取消未触发的流式保存并立即落盘一次，保证 API 调用级现场完整。
3. `removeRun()` / `clearRuns()` 清理悬挂的流式保存定时器，避免删除后重建目录。
4. 保存失败仍只记录 `autosave-failed` 事件，不影响生成链路。

### 第 5-10 轮验证

- `npm run test:services -- src/stores/runTrace.spec.ts`：45 passed。
- `npm run type-check`：exit 0。
- `npm run test:services`：71 files / 664 tests passed。

### 第 10 轮后新增经验

- trace 的 `requestMessages` 必须与真实 API 请求来自同一构建函数；direct、continuation、skill、pipeline 四条路径都不得用空数组、子集或旧消息源冒充真实请求。
- 观测数据也要考虑崩溃现场：长流式 run 只在终态落盘时，进程强杀会丢全部过程现场；观测层需要 debounce 快照 + API call 完成即落盘，且保存失败永远不得阻塞生成。
