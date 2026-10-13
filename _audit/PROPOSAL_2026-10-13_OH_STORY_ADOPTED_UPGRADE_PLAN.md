# oh-story-claudecode 采纳项升级优化方案（待审核）

> 日期：2026-10-13
> 基线：本仓库 `d7dac0b`（版本 3.82.0）；上游本地克隆 `zenstory-ai/oh-story-claudecode`，`main@2cf7be6`
> 证据来源：`_audit/RESEARCH_2026-10-13_OH_STORY_CLAUDECODE_ANALYSIS.md` 已复核的源码证据
> 方案边界：本文件是审核稿。用户确认前不改 `src/` 生产代码；确认后按本方案的阶段门禁执行。

## 1. 方案目标

把 oh-story-claudecode 的五组已采纳协议，转译成我们 Electron + TS + IndexedDB 应用内的同构能力：

1. **上下文从“能带多少带多少”改为“按当前单元闭包精确供给”**
2. **memory 从“最后写入者赢”改为“修订号事务”**
3. **正文产出从“依赖 DEAI 调用时机”改为“回合结束必扫硬信号”**
4. **生成契约从“数量/重复校验”扩展为“剧情承诺与禁区语义”**

这四项不是四个孤立补丁。它们共同解决同一个系统性痛点：**生成流水线缺少一个可被验证的中间权威状态，导致上下文、追踪状态、正文产出、审查口径各自猜各自的当前事实。**所以本方案把 P0-B（状态事务）作为地基，先统一权威状态，再让上下文闭包、硬信号网、契约语义都从这个权威状态派生或消费。

取消项：上游的“新增物三级申报”机制（直接写 / 写了要报 / 先问作者）整体不采纳。原因：阻塞式会重新引入类似预览确认的状态机；非阻塞清单仍会新增交互与数据分流，收益不足以抵消复杂度。正文新增设定继续沿用现有事后记忆提取路径，不在本方案内改动。

## 2. 阶段总览与顺序

| Phase | 内容 | 优先级 | 依赖 | 用户可见收益 |
|---|---|---|---|---|
| P0-B | Memory 状态事务系统（2026-10-14 已完成，见 DEV_LOG_2026-10-14_p0b-memory-transaction-closure.md） | P0 | 无 | 生成多批次、多请求时不再互相覆盖事实 |
| P0-A | 作用域上下文闭包（2026-10-14 已完成，见 DEV_LOG_2026-10-14_p0a-context-scope-closure.md） | P0 | P0-B | 长文生成不再反复带全书/全卷全文，读取效率和聚焦度提升 |
| P1-D | 写后硬信号 Stop 网（2026-10-14 已完成，见 DEV_LOG_2026-10-14_p1d-hard-signal-stop-net.md） | P1 | 无硬依赖 | 截断/拒绝语/工程词/复读不会静默进入产物 |
| P1-E | 契约语义扩充（2026-10-14 已完成，见 DEV_LOG_2026-10-14_p1e-contract-semantics.md） | P1 | P0-A | 主推线、终局底牌、禁区进入生成与审查双侧 |

顺序说明：P0-B 先行，因为上下文闭包与派生视图都消费权威状态。若先做 P0-A，闭包会依赖一个会被并发覆盖的 memory，收益会在多批次场景失真。P1-D 技术上可并行，但为避免同一轮 Electron 验证混杂多个变量，仍按阶段执行。

## 3. P0-B：Memory 状态事务系统

### 3.1 优化对象

| 对象 | 现状（Before） | 升级后（After） |
|---|---|---|
| 权威状态 | `projectStore.memories` 中的 `MemoryData` 直接被组件写入；`mergeMemory()` 克隆后返回整份 data，调用点再赋回 | 单一 `trackingState` 权威对象，含 `state_revision`、`last_committed_chapter`、派生视图哈希 |
| 并发保护 | 无修订号。两个批次同时 `mergeMemory()` 时，后赋值者整份覆盖前者的变化 | 事务必须携带 `expected_state_revision`；不匹配则拒绝提交并返回 `stale_state` |
| 提交形态 | 函数式合并，赋值时机分散 | `TrackingTransactionService.commit()`：读锁、校验、合并、递增 revision、派生视图重建、事件写入在同一事务队列内完成 |
| 尺寸治理 | memory 无目标值/硬上限，只有检索层 `maxChars` 截断 | delta/context/snapshot 分别引入目标值 + 硬上限；超限返回结构化错误，禁止静默截断 |
| 审计 | `memoryVersion.ts` 有 before/after 快照与回滚，但不阻止 stale 覆盖 | 每个事务记录 revision、chapterId、冲突类型、拒绝原因；runTrace 记录 `tracking_commit` 事件 |
| 调用点 | `PipelinePanel.vue:4728`、`:4767`，`useMemoryExtraction.ts:114`、`:146` 直接调用 `mergeMemory()` | 全部替换为事务服务；`mergeMemory` 保留为纯合并内核，但禁止组件直接把它当提交入口 |

### 3.2 具体升级项

1. **新增 `src/services/trackingStateService.ts`**：项目级单写入口。
   - `getState(projectId)`：返回权威状态 + revision。
   - `prepareTransaction({projectId, chapterId, expectedRevision})`：生成事务草稿。
   - `commitTransaction(draft)`：校验 revision、执行 `mergeMemory`、写审计、更新派生视图。
   - `rejectStale(draft, currentRevision)`：返回可重试的事务草稿，不直接覆盖。
   - 同一 projectId 内写操作串行排队；不同项目互不阻塞。

2. **`MemoryData.meta` 增加字段**：`stateRevision`、`lastCommittedChapter`、`lastCommittedAt`、`derivedViewHash`。旧数据迁移时 `stateRevision` 初始化为 1，不伪造历史。

3. **尺寸门禁**：新增常量 `DELTA_TARGET/DELTA_MAX`、`CONTEXT_TARGET/CONTEXT_MAX`、`SNAPSHOT_TARGET/SNAPSHOT_MAX`。数值先按我们应用实际语料采样确定，不直接照抄上游 3072/12288/8192 字节；方案审核时先给默认值，落地前用一卷真实项目采样校准一次。

4. **调用点迁移与防旧存留**：`PipelinePanel.vue` 与 `useMemoryExtraction.ts` 四处调用全部切到事务服务；新增依赖规则测试，断言组件源码不得包含 `mergeMemory(` 直调，防止旧路径复燃。

### 3.3 验收

| 验证项 | 命令/方式 | 通过标准 |
|---|---|---|
| 单元测试 | `npm run test:services -- trackingStateService` | 两个并发事务，revision 旧者被拒绝且返回 `stale_state`，不覆盖新状态 |
| 回归 | `npm run test:services` | 既有 memory 测试全绿 |
| 类型与依赖 | `npm run type-check && npm run verify:production-wiring` | 无类型错误；无组件直调 `mergeMemory` |
| Electron 实测 | 打包后导入多章节项目，连续生成两批并触发记忆提取 | runTrace 中两个 `tracking_commit` 均闭环；后到 stale 事务显示为拒绝/重建，不显示成功 |

### 3.4 失败时不许走的路

禁止在 stale 时“重新读最新 data 再 merge 后直接赋回”，那只是把竞态窗口缩小。必须走 `prepareTransaction` 重建 delta 后再次提交，直到 revision 匹配。

## 4. P0-A：作用域上下文闭包

### 4.1 优化对象

| 对象 | 现状（Before） | 升级后（After） |
|---|---|---|
| 章节执行包 | `chapterExecutionPackage.ts:80` 将 `outlineContent` 原样放入；`buildChapterExecutionPrompt:98` 以“全书大纲”整块拼入 prompt | `ChapterExecutionPackage` v2：`contextScope`（volume/unit/chapter）+ `volumeContractClosure` + `unitClosure`；全书大纲只在缺少闭包信息时降级使用 |
| 卷纲读取 | 无单元级取段概念；上游通过 `outline_view.py --unit` 只取当前单元闭包，`workflow-chapter.md:13` 明确不整读卷纲 | 新增 `outlineContextScope.ts`：解析卷纲的“卷级常任/单元级”段位声明，输出闭包 |
| 记忆上下文 | `memoryRetriever.ts:65` 用关键词/章号筛选，`maxChars` 默认 2000，但无“当前单元必须携带”的优先级 | 输出分三档：当前章证据、当前单元因果、全局常任；预算优先级固定，低优先级被裁时记录 `context_budget_overflow` |
| 校验 | 闭包缺失/单元不存在时无结构化错误，可能静默退化为全文或空上下文 | `validateOutlineContextScope()`：作用域未声明、单元 ID 不存在、闭包为空、闭包超预算均返回错误码 |
| 观测 | runTrace 只能看到请求 prompt | 记录 `context_scope` 事件：常任段数、单元段数、闭包字节数、被裁类别、降级原因 |

### 4.2 具体升级项

1. **卷纲模板增加段位契约**：每个段落可声明 `> 作用域：卷级常任` 或 `> 作用域：单元级 {unitId}`。未声明的段保守纳入并产生 warning，不静默丢弃。
2. **闭包构成**：全部卷级常任段 + 当前单元级段 + 当前单元章节表行 + 当前章细纲相关事实 + 上一章结尾状态。不再拼入其他单元正文细节。
3. **预算模型**：闭包整体引入 target/max 字节预算；超限时不把全文截成半截，而是逐级裁掉低优先级整段，并保留“被裁项清单”给 runTrace。
4. **降级规则**：旧项目无段位声明时允许降级为“卷概要 + 当前章细纲”，但必须在 trace 中显式记录 `legacy_outline_no_scope`，禁止无痕退回整读模式。
5. **调用点改造**：`PipelinePanel.vue:4158-4159` 构造执行包与 prompt 时消费闭包服务；`chapterExecutionPackage.spec.ts` 增加 v2 用例，保留 v1 兼容解析但 prompt 生成只用 v2。

### 4.3 优化前后效果对比（验收指标）

| 指标 | Before | After 目标 |
|---|---|---|
| 卷纲读取方式 | 每章 prompt 携带全书/全卷原文 | 每单元取一次闭包，同单元批次内复用 |
| 上下文相关性 | 大量无关单元内容稀释当前章 | 常任段 + 当前单元段为主，无关单元不进 prompt |
| 超长文行为 | 字数增长后 prompt 线性膨胀 | prompt 尺寸有 target/max，超出走结构化裁剪并留痕 |
| 故障可见性 | 上下文缺失不易发现 | scope 校验错误 + trace 事件，一眼可见 |

数值收益不在方案中承诺百分比。落地后用同一项目跑 before/after 双运行，以 runTrace 的 prompt 字节数、物理请求数、生成耗时生成实测对账表。

### 4.4 验收

1. 单测：闭包解析、未声明作用域 warning、单元不存在错误、预算裁剪、旧数据降级。
2. Electron 实测：一卷多单元项目连续生成章节，runTrace 显示闭包复用与裁剪记录。
3. 负向测试：删除当前单元声明，应用必须失败并给出结构化错误，不允许静默生成。

## 5. P1-D：写后硬信号 Stop 网

### 6.1 优化对象

| 对象 | 现状（Before） | 升级后（After） |
|---|---|---|
| 写后兜底 | 依赖 DEAI 管线调用时机；未调用时截断/拒绝语可能进入正文 | 正文落盘回合结束必扫，与 DEAI 独立 |
| 检测范围 | `de-ai.js:609-691` 有 blocking/advisory 分级，但偏 AI 味/词频，不覆盖模型拒绝语 | 新增四类硬信号：截断、生成拒绝语、工程词、紧邻整行复读 |
| 修正方式 | 检测与改写边界不清 | Stop 网只报告，不改写；命中后发起一次定点修正请求，复扫到净 |
| 失败策略 | 无统一收敛 | 连续 2 次修正仍有同类硬信号时停止并标记 `hard_signal_unresolved`，不无限润色 |

### 6.2 具体升级项

1. 新增 `proseHardSignalNet.ts`，输出结构化 findings：`truncated`、`refusal`、`meta_language`、`near_duplicate_line`。
2. 每个正文产物落盘后运行；发现写入 runTrace `hard_signal_scan` 事件。
3. 修正请求只带命中段落上下文，不重发全文，避免上一轮“小问题放大成 37 次物理请求”的问题。
4. Stop 网不依赖任何 SKILL：即使外部 SKILL 干扰模型输出，应用层仍可兜底。

### 6.3 验收

构造四类样本各 10 条，单测 + Electron 注入实测。标准：命中率可度量；误报样本不触发改写；两次修正仍失败时进入明确终态。

## 6. P1-E：契约语义扩充

### 7.1 优化对象

| 对象 | 现状（Before） | 升级后（After） |
|---|---|---|
| 卷契约 | `volumeGenerationContract.ts:63-88` 校验数量、字段、重复卷名 | 增加读者期待、主推线、解锁里程碑、禁碰终局底牌、契约风险 |
| 单元契约 | 无“本单元禁提前释放”语义 | 增加单元承诺、禁止提前释放、终局底牌边界 |
| 消费方向 | 主要作为生成前输入/生成后数量校验 | 生成、审查、正文执行三侧消费同一契约对象 |

### 7.2 具体升级项

1. 扩展 `VolumeGenerationContract` 与章节/单元契约类型；新增字段允许 `[待补充]`，但字段必须在场。
2. `outlineContextScope` 闭包必须带出契约禁区，正文 prompt 中以“禁止提前释放”呈现，而不是散落提示词。
3. 审查侧把“是否碰主推线/终局底牌”作为 S 级检查，输出契约安全/需补强/契约破坏。

### 7.3 验收

构造“提前揭示禁碰真相”的样本章节，审查必须报 `contract_broken`；正常推进样本不得误报。

### 7.4 落地结果与对账（2026-10-14 完成）

| 对象 | Before | After | 验证 |
|---|---|---|---|
| 卷契约字段 | 数量、字段、重复卷名校验 | 五类语义字段必在场，缺省 `[待补充]`，非法 `contractRisk` 报契约错误 | `volumeGenerationContract` 19/19 tests |
| 生成协议 | 卷 JSON 只要求基础字段 | 三处 prompt 统一 9 字段输出协议 + 风险枚举 | `volumeBatchOrchestrator` 19/19 tests |
| 上下文闭包 | 不携带契约禁区 | 契约禁区与闭包禁止行合并去重输出 | `outlineContextScope` 12/12 tests |
| 正文执行 | 禁区语义无固定载体 | `[禁止提前释放]` 块进入章节执行 prompt | `chapterExecutionPackage` 8/8 tests |
| 写后审查 | 无契约审查 | 本地确定性三态审查，`contract_review` 进 runTrace，只报告不阻塞 | `contractReview` 4/4 + wiring 3/3 tests；Electron normal=`contract_safe`、early reveal=`contract_broken` |
| 请求负担 | 无审查 | 审查不触发额外物理请求 | Electron 两 Case requestCount 均为 1 |
| 生成质量 | 无契约语义约束 | 语义进入生成与审查双侧 | 未做人工评分对账，标注“未验证” |

落地边界：揭示词表与 80 字窗口为首版采样，暗示式剧透需持续采样；Electron 验证使用本地 provider；完整验证与封装证据见 `DEV_LOG_2026-10-14_p1e-contract-semantics.md` 与 `_audit/TASK_LEDGERS/2026-10-14_p1e-contract-semantics.md`。

## 7. 全局门禁

1. **新旧并存禁令**：每个 Phase 的旧入口必须同步移除或降级为纯内核函数，并加依赖规则测试。允许保留兼容解析，禁止双写入路径。
2. **观测先行**：所有新失败路径必须进 runTrace，禁止“静默降级成功”。
3. **真实用户验证**：P0 两项必须做 Electron 打包级实测；P1 至少单测 + 一轮真实 UI 验证。
4. **无虚假完成**：每 Phase 产出 before/after 对账表，没有实测数据的收益一律标注“未验证”。
5. **工作区清理**：每个 Phase 完成后清理临时脚本与测试残留，只保留源码、测试与 `_audit` 记录。

## 8. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 尺寸上限取值不当 | 正常记忆被误拒 | 先采样校准，超限只拒绝提交并提示一次报全，不截断 |
| 旧项目无段位声明 | 无法直接使用闭包 | 显式降级 + trace 记录，不做无痕全文退回 |
| Stop 网误报 | 正常正文被反复改写 | 修正上限 2 次；到限进入终态并给用户可见报告 |
| 事务迁移范围大 | 影响生成流水线 | 只替换四个已定位调用点，`mergeMemory` 纯内核保留，改动边界可控 |

## 9. 审核决策点

1. 是否批准按 P0-B → P0-A → P1-D/E 顺序执行？
2. 尺寸上限是否接受“先采样校准，不照抄上游字节值”？
3. Stop 网修正上限是否接受 2 次（超过进入终态）？
