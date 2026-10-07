# 2026-10-07 长文档执行效率修复方案

> 状态：已实现；Phase 0-5 与 Phase 6 离线/性能/Electron 验证完成；真实 API 语义分支如实登记 `untested`。
> 基线：`codex/direct-write-negative-verification`，live v3 step5 现场。
> 触发问题：7,606 字大纲执行“整理整篇文章”，23 次物理请求、24 次工具调用后仍未返回，用户被迫停止等待。

## 0. 一句话结论

这不是模型慢，而是应用把“确定性整理”错误地路由成了“模型逐轮微操作”。修复目标不是放宽轮次，而是把执行形态改对：**纯格式化、编号统一、空行治理、结构重排、精确去重由应用本地一次性完成；模型只处理需要判断、创作、改写的部分**。同时把上下文从“滚动累积”改成“快照 + 增量”，让每一轮请求的成本不再随历史线性上涨。

## 1. 现场证据

Trace：`_data/api-direct-write-live-v3-profile/documents-data/run-trace/outline/run-trace-outline-20261007-185019/run-trace.json`，`apiCalls[4]`。

| 指标 | 实测值 |
| --- | --- |
| 文档规模 | 7,606 字符，20 节 |
| 物理请求 | 23 次，状态仍 `running` |
| 工具调用 | 24 次，其中 `editor.write` 7 次（6 成功、1 被拒） |
| 读取类调用 | 16 次 |
| 累计请求耗时 | 954,174 ms（约 15 分 54 秒） |
| 单次最长请求 | 422,951 ms（约 7 分钟） |
| 输入 token 漂移 | 11,014 → 52,146 |
| 最大输出 token | 28,372 |
| 供应商窗口 | 1,000,000 |
| 预算判定 | `fits` |

关键行为链：

1. 模型先提交 `replace_document`，被执行计划以 `document_too_large_for_whole_replacement` 拒绝。
2. 模型转入 `replace_match` / `move` 微操作，一次物理请求只产出少量命令。
3. 应用把全部历史工具结果继续追加回上下文，请求越来越重。
4. 模型在第 22 轮已经输出“整理完成”，但覆盖账本仍认为计划未完成，应用又发出第 23 轮请求。
5. 用户看到的是“一直等待 API 返回”，实际是应用在让模型做一台本地字符串处理器该做的事。

## 2. 根因

### R1 执行形态错配

[longDocumentExecutionPlanner.ts](../src/services/longDocumentExecutionPlanner.ts) 把 `restructure_and_cleanup`、`normalize`、`deduplicate` 全部送进 `edit-task` 模式，要求模型分阶段提交受限命令。可是这些操作里大部分是确定性变换：

- 标点归一；
- 空行治理；
- 标题编号统一；
- 顶层结构重排；
- 完全重复节点删除。

这些不需要模型一轮轮“思考”，更不需要 23 次请求。

### R2 上下文滚动放大

[aiService.ts](../src/services/aiService.ts) 的工具循环每轮执行：

1. 保存全部 `allToolResults`；
2. `buildToolResultChatMessages()` 把本轮结果追加进 `messages`；
3. 下一轮把完整历史再发给供应商。

结果是第 1 轮 11,014 输入 token，后面涨到 52,146。工具本身执行只要 0-31ms，慢的是模型反复阅读同一份文档和越来越长的历史。

### R3 覆盖判定与真实工作不匹配

[longDocumentWriteCoverage.ts](../src/services/longDocumentWriteCoverage.ts) 只按计划 segment 记账；[editorTools.ts](../src/services/editorTools.ts) 的批次覆盖也围绕 segment 展开。但模型实际做的是跨 segment 的 move、空行、编号微操作。于是：

- 模型已经把正文修好；
- 覆盖账本仍显示缺 segment；
- 应用继续催模型“完成剩余批次”；
- 模型继续重复读取和修整。

### R4 模型能力元数据不一致

Trace 里 `providerContextWindowTokens = 1,000,000`，但 `modelCapability.contextWindowTokens = 0`、`contextWindowSource = unknown`，预算文案还写着“未声明窗口，按保守值处理”。这次 7,606 字没被窗口卡住，但这个元数据错位会在更大的文档上制造错误分段和不必要的保守预算。

## 3. 修复设计

### D1 新增本地变换执行器

新增 `src/services/documentTransformService.ts`，专吃确定性操作：

- `normalize_punctuation`：中文语境半角转全角；
- `normalize_blank_lines`：节间空行统一；
- `normalize_numbering`：标题编号统一；
- `reorder_sections`：按结构 ID 原子重排；
- `remove_exact_duplicates`：仅删除完全重复节点；
- `word_layout_normalize`：Word 风格基础排版整理。

约束：

1. 输入是“执行计划 + 文档快照”，输出是“变换后文档 + diff + 校验报告”；
2. 全过程无模型请求；
3. 复用现有编辑语义与不变量校验，不另造第二套写回协议；
4. 任何无法确定的目标一律返回 `needs_model`，不猜。

### D2 路由拆分为三种执行形态

执行计划新增 `local-transform` 模式：

| 操作 | 新形态 |
| --- | --- |
| 纯格式整理、空行、标点、编号 | `local-transform` |
| 顶层结构重排、完全重复删除 | `local-transform` |
| 语义去重、合并重复内容 | `edit-task` |
| 局部修改、插入、删除、移动 | `direct` 或 `edit-task` |
| 全文重写、终稿生成 | `final-draft` |

判定顺序：

1. 意图路由；
2. 操作分类；
3. 确定性检查；
4. 只有不确定时才进入模型循环。

### D3 本地变换的用户体验

`local-transform` 不走 API 对话框等待：

1. 应用直接生成变换计划；
2. 本地执行；
3. 校验通过后一次性写回编辑器；
4. API 面板立即显示“已本地完成”和变更摘要；
5. 运行记录写入 `execution_mode: local_transform`、diff、校验结果、耗时。

预期效果：7,606 字文档从 15 分钟以上降到毫秒级本地完成；100 万字也不再依赖模型逐轮搬运。

### D4 模型路径的上下文瘦身

保留模型路径时，禁止无限滚动累积：

1. 每个任务持有不可变源文档快照；
2. 每轮只携带：快照引用、当前计划、上一轮增量、必要工具结果；
3. 读取结果按 range/关键词做指纹缓存，重复读取直接复用；
4. 工具历史默认只保留最近 2 轮， Older 结果压缩成摘要；
5. 供应商请求里不再重复注入同一份全文。

### D5 收敛判定改成“工作完成”而不是“轮次耗尽”

新增进展门：

1. 本地变换：diff 校验通过即完成；
2. 模型路径：每轮计算新增可信覆盖、实际 diff、重复命令率；
3. 连续 2 轮无新增覆盖或无内容变化，立即停止并交给用户；
4. 模型输出终局总结且实际文档满足操作目标时，允许完成，不再被 segment 账本强行续跑；
5. 同一命令哈希重复执行直接拦截。

### D6 模型能力元数据单源化

1. 供应商声明的窗口、输出上限、工具能力进入统一 capability store；
2. `providerContextWindowTokens`、`modelCapability.contextWindowTokens`、执行计划窗口必须同源；
3. 不允许出现“供应商 1M、模型 unknown、预算按保守值”的三态分裂；
4. Trace 记录 capability 来源和解析结果。

## 4. 实施顺序

1. **Phase 0 基线锁定**
   - 固化 step5 trace 为回归 fixture；
   - 写下当前 23 请求、24 工具调用、954 秒的 before 指标；
   - 不改生产代码。

2. **Phase 1 本地变换服务**
   - 实现 `documentTransformService`；
   - 覆盖 1k、7.6k、100k、1M 字合成文档；
   - 性能阈值：1M 字本地变换不超过 3 秒。

3. **Phase 2 路由接入**
   - `longDocumentExecutionPlanner` 增加 `local-transform`；
   - 大纲工作台与首页同底座接入；
   - 旧 `edit-task` 不处理纯格式化任务。

4. **Phase 3 上下文瘦身**
   - 快照 + 增量上下文；
   - 读取缓存；
   - 工具历史压缩；
   - 禁止重复全文注入。

5. **Phase 4 收敛门**
   - 实际 diff 与覆盖双重判定；
   - 无进展立即停止；
   - 终局总结不再被错误覆盖账本否决。

6. **Phase 5 UI 即时反馈**
   - 本地变换立即返回；
   - 模型路径显示阶段、轮次、增量、耗时；
   - 用户可随时停止，不锁输入框。

7. **Phase 6 验证矩阵**
   - 单测/回归：本地变换、路由、上下文、收敛、能力元数据；
   - Electron 真实 UI：复刻 step5 原话，验证不再进入 23 轮循环；
   - 真实 API：只对语义分支做 live 验证；
   - 性能：7.6k 字本地路径毫秒级，1M 字不超过 3 秒；
   - trace：能看到 `execution_mode`、物理请求数、diff、校验结果。

## 5. 风险与反推

1. **误路由风险**：把需要判断的任务误判成本地变换。缓解：确定性检查必须显式匹配操作语法和结构；不确定即走模型。
2. **本地变换质量风险**：格式规则过狠。缓解：只做可解释变换，diff 全量留档，允许撤销。
3. **语义去重风险**：近义重复不能本地删。缓解：本地只删完全重复，语义去重留给模型并要求证据。
4. **上下文压缩风险**：丢掉模型需要的细节。缓解：快照始终可取，压缩只作用于历史工具结果，不压缩当前源文档。
5. **新旧并存风险**：`edit-task` 不能继续偷偷接手纯格式化任务；Phase 6 必须扫描生产入口、测试、脚本、文档、trace 字段，旧路径清零。

## 6. 成熟度声明

本方案已有完整 before 证据、明确执行形态拆分、上下文与收敛修复、真实 UI 与性能验证矩阵。

当前状态：**方案已实现，核心验证通过；真实 API 语义分支未测，不得冒充已验证**。

## 7. 实施与验证结果

### 7.1 Phase 0-5 实施结果

- 新增 `src/services/documentTransformService.ts`：确定性本地变换、diff、结构/正文多重集/去重约束校验。
- `longDocumentExecutionPlanner.ts` 新增 `local-transform` 执行模式：严格词法映射、本地试跑必须 `completed`、不确定回落模型路径。
- `aiService.ts` 新增 `toolContextCompactor`：只压缩更旧的成功读取结果；写入、失败、小结果、协议形态保留；审计主线 `messages` 与 `toolRequestDeltas` 保留原文。
- 新增 `no_write_progress` 收敛门；重复读取指纹缓存；模型终局总结与实际 diff 满足时允许完成。
- 首页与大纲双入口接入 `local-transform`，本地完成后立即结束 run；不锁 API 输入框。

### 7.2 Phase 6 验证结果

- 单测/回归：
  - `npx vitest run src/services/activeExecutionTaskStore.spec.ts src/services/directWriteWiring.spec.ts src/services/longDocumentExecutionPlanner.spec.ts src/services/documentTransformService.spec.ts`：72/72 通过。
  - `npm run type-check`：通过。
  - `npm run build:vue`：通过并刷新 renderer。
- 性能基准：`_audit/verification-long-document-execution-efficiency/local-transform-performance.json`
  - step5 真实文档 7,602 字：3.319ms，205 行变化，校验 ok。
  - 合成文档 1,035,784 字：61.561ms，7,600 行变化，校验 ok。
- Electron 可见 UI 复刻：`_audit/verification-long-document-execution-efficiency/local-transform-electron.json`
  - PID 58328，可见窗口，CDP 9296，step5 原话请求。
  - 大纲入口：181ms，0 物理请求 / 0 API call / 0 工具调用，11 行变化。
  - 首页入口：165ms，0 物理请求 / 0 API call / 0 工具调用，11 行变化。
  - 六项断言全绿。

### 7.3 深挖产出

1. step5 原话不含“标点/符号”，验证断言改为“标点保持不变”；原断言是测试语义错误，不是实现缺陷。
2. chat run 终态保持 `running` 是设计内语义：会话保持开启等待下一轮，不是卡死。
3. 首页 `runHomeLocalTransform()` 曾把 `plan.progressLabel` 写入 `turn.userRequest`，trace 丢失用户原话；已改为 `input.requestText`。
4. 首页活动任务曾用写入前快照 `contentVersion` 收口，任务版本落后于编辑器；已新增 `completeHomeActiveTaskAfterLocalTransform()`，写入后重建快照再收口。

### 7.4 诚实边界

- 真实 API 语义分支：`untested`；当前无可用 live key，禁止 mock 冒充 live 结果。
- 本方案的验证重点是“确定性整理本地即时完成、不再进入模型循环”；语义分支只验证“不确定请求仍回落模型路径”，不验证本地变换速度。
- 版本封装未执行；是否升版本并封装由用户另行确认。
