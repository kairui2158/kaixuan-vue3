# 任务台账：长文档执行效率修复

> 状态：Phase 6-7 已收口；真实 API 语义分支如实登记 `untested`。
> 方案：[PROPOSAL_2026-10-07_LONG_DOCUMENT_EXECUTION_EFFICIENCY.md](../PROPOSAL_2026-10-07_LONG_DOCUMENT_EXECUTION_EFFICIENCY.md)

## 1. 目标与原话

- 用户目标：确认执行方案；执行过程中遇到问题必须按经验文件深挖到底，不能只看表面。
- 最终可感知行为：纯格式整理、编号、空行、结构重排、精确去重在应用本地即时完成；模型路径上下文不再滚动放大；无进展立即收敛；不再出现 7,606 字文档 23 次请求 954 秒仍 running。
- 本轮交付物：`documentTransformService`、`local-transform` 执行模式、上下文瘦身、收敛门、UI 反馈、trace 覆盖、验证矩阵、DEV_LOG 与经验回写。

## 2. 门禁读证

- 已读 `_audit/神意开发经验总结_v7.md`（实际内容 v8.4）：G0.5（52 行）、G0.9（84 行）、G0.10（92 行）、G0.11（102 行）、G0.12（110 行）、G1.4（154 行）、G1.8（174 行）、G1.9（206 行）、G1.15（256 行）、G1.17（278 行）、G2.1（292 行）、G2.5（324 行）、G2.10（368 行）、G2.13（394 行）。
- 已读 `_audit/TASK_LEDGERS/2026-10-07_direct-write-four-line-untangle.md`：step5 效率缺陷已登记为追加项。
- 执行期追加：G1.6 mock 契约、G1.11 测试契约、G1.13 Electron 标准、G2.2 工具协议、G2.4 直写 UI、G2.7 上下文预算、G2.11 供应商、G1.12 封装收尾。

## 3. 路由判定

- 加入：G0.1 目标对齐、G0.3 诚实闭环、G0.5 回头看、G0.9 影响圈、G0.10 新旧并存清零、G0.12 台账、G1.1 精准编辑、G1.4 验证分层、G1.8 trace 同步、G1.9 终态收敛、G1.15 四层递进、G1.17 作者反证、G2.1 工具循环、G2.5 长文档覆盖、G2.10 trace 回放、G2.13 SKILL 中立。
- 排除：G1.3 全局 UI 层归并（本轮不改全局层级语义，若改 `execution_mode` 展示则回补）；G1.10 权限门（本轮不改三元组授权，但验证不得削弱）；G1.16 对话因果复盘（本轮非经验回写阶段）；G2.8 存储写队列（本轮不改会话存储写入语义）；G2.12 窗口进程（本轮不改 Electron 生命周期）。

## 4. 影响圈与作者反证

- 打算改：`src/services/documentTransformService.ts`（新增）、`longDocumentExecutionPlanner.ts`、`aiService.ts`、`longDocumentWriteCoverage.ts`、`editorTools.ts`、`modelCapability.ts`、`contextBudget.ts`、`OutlineWorkspace.vue`、`ChatPanel.vue`、runTrace/DiagLogger 相关投影、相关 spec 与验证脚本。
- 可能碰到：`longDocumentWriteProtocol.ts`、`toolLoopPolicy.ts`、`editorDocumentMap.ts`、供应商配置读取、API 面板 UI 状态文案、既有 live 验证 fixture。
- 作者反证：
  1. “格式整理可以确定性本地执行”可能错在目标含有语义判断。证伪：用真实 trace 原话与真实文档构造混合请求，服务必须返回 `needs_model`，不得误改内容。
  2. “快照+增量不会降低模型质量”可能错在历史工具结果被压缩。证伪：保留最近 2 轮与源快照，构造需要早前读取细节的模型路径用例；无法验证则登记 `untested`。
  3. “本地执行 UI 不锁输入”可能错在双入口状态机仍被外层 generating 覆盖。证伪：Electron 真实 UI 双入口点击，断言输入框不被 `local-transform` 锁死。

## 5. 停止条件

- Phase 0：fixture 落地，能机器读取 before 指标：23 请求、24 工具调用、954,174 ms、输入 token 11,014→52,146。
- Phase 1：`documentTransformService` 单测通过；7.6k 文档本地路径无模型请求；1M 字性能不超过 3 秒。
- Phase 2：双入口纯格式请求生成 `execution_mode: local-transform`；旧 `edit-task` 不再接手纯格式化任务，生产入口/测试/脚本/规格/trace 扫描无旧语义残留。
- Phase 3：模型路径连续轮次输入不再线性膨胀；重复读取命中缓存；同一全文不重复注入。
- Phase 4：连续 2 轮无新增覆盖或无 diff 即停止；模型终局总结与实际 diff 满足时允许完成；重复命令哈希拦截。
- Phase 5：本地变换立即返回；模型路径显示阶段/轮次/增量/耗时；用户可停止。
- Phase 6：type-check、相关服务测试、性能基准、Electron 可见 UI 复刻、真实 API 语义分支验证全部通过或如实登记 `untested`。
- Phase 7：DEV_LOG、经验回写、回头看、台账七节证据补齐。

## 6. 执行证据

- 2026-10-07 执行前：
  - `git status --short --branch`：`codex/direct-write-negative-verification`；工作区含大量前序未提交改动，本台账只登记本轮增量，不回滚不清理他人改动。
  - 方案与 trace 根因已由 `_audit/TASK_LEDGERS/2026-10-07_direct-write-four-line-untangle.md` 第 8 节登记。
- Phase 1 本地变换服务：
  - 新增 `src/services/documentTransformService.ts`、`src/services/documentTransformService.spec.ts`。
  - `npx vitest run src/services/documentTransformService.spec.ts`：13/13 通过。
  - 1M 字合成文档性能实测 54ms，满足“不超过 3 秒”的停止条件。
- Phase 2 路由拆分：
  - `src/services/longDocumentExecutionPlanner.ts` 新增 `local-transform` 模式。
  - 三层门：严格词法映射 -> 本地试跑必须 `completed` -> 不确定回落模型路径。
  - `npx vitest run src/services/longDocumentExecutionPlanner.spec.ts`：45/45 通过。
  - 连带修复 3 个旧 fixture 的 `localTransformOperations: null` 字段缺省。
- Phase 3 上下文瘦身：
  - 新增 `src/services/toolContextCompactor.ts`、`src/services/toolContextCompactor.spec.ts`：只压缩更旧的成功读取结果；写入、失败、小结果、协议形态保留。
  - `src/services/aiService.ts` 工具循环在物理请求前压缩；审计主线 `messages` 与 `toolRequestDeltas` 保留原文；`contextCompactedMessageCount` 进入结果、物理请求事件与 runTrace。
  - `OutlineWorkspace.vue`、`ChatPanel.vue`、`src/stores/runTrace.ts` 已接线物理请求压缩计数。
  - 深挖记录：新增测试首次红灯不是实现缺陷，而是测试 fixture 复用了共享 `tool.execute()`，实际只返回 `{contentLength:10}`，没有制造 400 字符以上的历史读取；第二轮红灯则是把第 3 次请求误当压缩前基线（真正压缩发生在第 4 次物理请求）。已修 fixture 并断言“第 3 次原文、第 4 次压缩且更短、审计原文保留”。
  - `npx vitest run src/services/aiService.spec.ts src/services/toolContextCompactor.spec.ts src/services/longDocumentExecutionPlanner.spec.ts src/services/longDocumentWriteProtocol.spec.ts`：195/195 通过。
- Phase 4 收敛门：
  - `src/services/aiService.ts` 已实现 `no_write_progress` 收敛判定。
  - `npx vitest run src/services/aiService.spec.ts`：147/147 通过（台账历史证据）。
- Phase 5 双入口 UI 与交互解锁：
  - 首页与大纲的确定性 `local-transform` 均已在技能/Agent 路径前短路，本地完成后立即结束 run，不发起模型请求。
  - 2026-10-07 追加深挖：发现首页程序化入口把清空后的 `inputText.value` 传给本地变换，导致 requestText 记录为空；`no_change` 分支未调用 `activeExecutionTaskStore.complete()`，会留下未收口活动任务。
  - 修复：首页传 `requestText: text`；双入口 `no_change` 均按当前快照版本与 hash 收口活动任务。
  - 新增 `agentOrchestrator.ts` `interactive_response` 事件：只有非空正文且非伪工具调用时发出，payload 含 `textPreview`、`finishReason`、`hasSuccessfulWrite`、`callCount`。
  - 双入口接线：首页复用既有 `homeInputUnlockedByAgent` 控制器守卫；大纲新增 `outlineInputUnlockedByAgent`，只解锁 API 输入框与发送守卫，不动其他按钮、取消、重生成和写权限语义；后台批次继续执行。
  - 大纲所有新 run 启动点均重置 `outlineInputUnlockedByAgent`，终态仍由原 Agent 终态路径收口。
  - `npx vitest run src/services/agentOrchestrator.spec.ts src/services/directWriteWiring.spec.ts`：51/51 通过。
  - `npx vitest run src/services/agentDialogueRuntime.spec.ts src/services/agentTraceBridge.spec.ts src/services/activeExecutionTaskStore.spec.ts src/services/longDocumentExecutionPlanner.spec.ts src/services/documentTransformService.spec.ts src/services/toolContextCompactor.spec.ts src/services/aiService.spec.ts`：218/218 通过。
  - `npm run type-check`：通过。
- 待补：Phase 6 性能基准、Electron 可见 UI 复刻、真实 API 语义分支；Phase 7 DEV_LOG/经验回写/回头看/收尾。

- Phase 6 性能基准（2026-10-07，Node v24.16.0，production source via `vite:ssrLoadModule`）：
  - `node scripts/benchmark-long-document-local-transform.mjs`：PASS。
  - `_audit/verification-long-document-execution-efficiency/local-transform-performance.json`：step5 真实 7,602 字文档 3.319ms，205 行变化，结构覆盖/正文多重集/去重约束校验 ok；合成 1,035,784 字文档 61.561ms，7,600 行变化，校验 ok；均低于 1,000ms/3,000ms 阈值。
- Phase 6 Electron 可见 UI 复刻（2026-10-07）：
  - `node scripts/verify-long-document-local-transform-electron.mjs`：PASS。
  - `_audit/verification-long-document-execution-efficiency/local-transform-electron.json`：Electron PID 58328，可见窗口，CDP 9296；step5 原话请求。
  - 大纲入口：181ms 总耗时，0.4ms 变换耗时，11 行变化，操作集 `reorder_sections + normalize_blank_lines + normalize_numbering`，0 物理请求 / 0 API call / 0 工具调用，deep trace 导出成功。
  - 首页入口：165ms 总耗时，0.2ms 变换耗时，同操作集与 afterHash，0 物理请求 / 0 API call / 0 工具调用，deep trace 导出成功。
  - 六项断言全绿：零 provider request、零 API call、零工具调用、双入口都完成变换、双入口低于 1,000ms、双入口 trace 都成功导出。
  - 深挖记录：
    1. step5 原话实际不含“标点/符号”字样，验证断言从“标点被整理”改为“标点保持不变”；这不是实现缺陷，是测试把目标语义写错。
    2. chat run 终态保持 `running` 是设计内语义：本地变换完成后会话保持开启，等待下一轮，不是卡死。
    3. 首页 `runHomeLocalTransform()` 曾把 `plan.progressLabel` 写入 `turn.userRequest`，导致 trace 丢失用户原话；已改为 `input.requestText`。
    4. 首页活动任务曾用写入前快照 `contentVersion` 收口，任务版本落后于编辑器；已新增 `completeHomeActiveTaskAfterLocalTransform()`，写入后重建快照再收口。
- Phase 6 回归：
  - `npx vitest run src/services/activeExecutionTaskStore.spec.ts src/services/directWriteWiring.spec.ts src/services/longDocumentExecutionPlanner.spec.ts src/services/documentTransformService.spec.ts`：72/72 通过。
  - `npm run type-check`：通过。
  - `npm run build:vue`：通过并刷新 renderer。
- Phase 6 诚实边界：
  - 真实 API 语义分支为 `untested`：当前无可用 live key；禁止用 mock 冒充 live 结果。
  - live 语义分支的目标不是验证本地变换速度，而是确认含语义判断的请求仍按需回落模型路径。
- Phase 7 回头看：
  - `createInactiveMainEditorTargetSnapshot` 仍被 4373/4420/4473/4522/4526/4754/4787 等处消费，不是死代码，不删除。
  - `completeHomeActiveTaskAfterLocalTransform()` 单点服务于本地变换后的真实版本收口；`runHomeLocalTransform()` 内不再使用写入前版本完成活动任务，新旧语义未并存。

## 7. 缺口清单

- 真实 API 语义分支 `untested`：待可用 live key 后补验，禁止 mock 冒充。
- 版本封装未执行：当前 3.76.0；工作区存在大量前序未提交改动，是否升版本并封装需用户另行确认。
