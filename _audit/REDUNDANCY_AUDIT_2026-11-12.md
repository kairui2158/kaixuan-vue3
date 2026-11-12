# REDUNDANCY AUDIT - 2026-11-12

> 结论先行：本轮发现 6 个可删除/裁剪候选、2 个疑似冗余但应保留、1 个需要独立处置的脚本孤儿面。未发现新的跨 store 纠缠或双预算实例。本轮只审计，不删除。

## 1. 组件冗余

### F1. `src/stores/chapter.ts` - P2 删除

1. 定义：`src/stores/chapter.ts:18`。
2. 全仓生产引用：0。
3. 三面扫描：源码无 import；测试无 import；`_audit` 与历史会话记录只是资料引用。
4. 风险：它暴露旧的 `Chapter` 类型与章节 CRUD 语义，留着会被误认为章节层的权威 store。
5. 处置：整体删除。

### F2. `src/components/common/DiffModal.vue.d.ts` - P3 删除

1. 定义：`src/components/common/DiffModal.vue.d.ts:1-3`。
2. 消费：无 import，无模板引用，无工具链配置消费。
3. 风险：若真实 `DiffModal.vue` 恢复，这份手写 declaration 会遮挡自动类型面。
4. 处置：直接删除。

### F3. `src/services/editTaskExecutor.ts` - P1 退役

1. 定义：`src/services/editTaskExecutor.ts:53,75`。
2. 生产引用：0。
3. 生产编辑入口是 `useEditTaskSession.startOrContinueBatch`；状态机由 `editTaskService` 收口。
4. 唯一拉住它的不是生产接线，而是：
   - `src/services/editTaskExecutor.spec.ts:3,21,25,61,86,125,146`
   - `src/services/toolLoopPolicy.spec.ts:27-31` 的源码字符串契约
   - `.dependency-cruiser.cjs:62` 的 orphan 豁免
5. `createTaskFromSnapshot` 定义于 `editTaskExecutor.ts:53`，只被同文件 `executeEditTask` 消费，没有独立生产入口。
6. 处置：同批删除实现和自 spec，迁移源码契约测试，移除 depcruise 豁免，再用 wiring/type/test 三证收口。

### F4. `PipelineProgressPhase` 四个死枝 - P2 裁剪

1. 类型定义：`src/services/runRegistry.ts:13-20`，包含 7 个枝。
2. 生产发射点：`src/stores/pipeline.ts:262` 只会发 `queued/requesting/terminal`。
3. `streaming/validating/repairing/saving` 只在 `runProgressChannel.spec.ts:33-55` 出现。
4. 判定：这是历史 UI 粒度残留，不是现行协议。它让消费者以为流水线有四个真实阶段，实际没有。
5. 处置二选一：
   - 裁剪为三枝；
   - 若要保留未来语义，必须注释为 frozen semantic surface，并在 spec 中标记这是协议预留，不是生产行为。
6. 推荐：裁剪为三枝。

### F5. `verify:postprocess-ui-electron` - P3 删除

1. 定义：`package.json:29`。
2. 当前生产/测试/文档消费：0。
3. `_audit/DEV_LOG_2026-10-17_protocol-status-echo-consolidation.md:32` 只是历史登记。
4. 对比保留：`verify:deai-stage-guidance-live` 有 spec `readFileSync` 消费倾向，本轮不删。
5. 处置：删除 npm 入口；底层脚本是否继续保留另议。

## 2. 语义冗余

### S1. Pipeline run 视图双入口

1. `PipelineRunCenter.vue`：`PipelinePanel.vue:77` 挂载，是跨 layer 全景。
2. Panel 内 `displayRunForLayer`：每层最新 run。
3. 判定：两者不是重复，而是“全局运行中心”和“层内当前 run”的不同语义。
4. 处置：保留。

### S2. pipelineStore 双导出

1. `runs` 与 `activeRuns` 都有真实消费。
2. 属于轻度冗余，但没有具体事故和迁移收益，删除会增加无谓改动。
3. 处置：保留。

### S3. 降AI画像冻结开关

1. `DEAI_MODEL_PROFILE_RELEASED=false` 是有意冻结，不是死语义。
2. 处置：保留，等校准数据成熟后另行裁决。

### S4. `__shenyiStepArtifact` 兼容层

1. `PipelinePanel.vue:883,4433-4455` 仍消费。
2. 属于旧协议兼容面，不是纯死代码。
3. 处置：保留，待 folder SKILL 侧确认无实际存量依赖后再退役。

## 3. 状态机冗余

### M1. 编辑任务状态机

1. 生产入口：`useEditTaskSession.startOrContinueBatch`。
2. 状态转换：`editTaskService` 单一转换表。
3. 无旁路 patch，无双预算实例命中。
4. 处置：保留。

### M2. editTaskExecutor 旧执行器

1. 它复刻了一套批次执行循环。
2. 虽然自身声明不可变任务模型，但已不在生产执行路径。
3. 状态机语义由生产入口接管，它只剩测试与工具链豁免维持生命。
4. 处置：退役。

### M3. Pipeline progressPhase

1. 生产状态机实际只有 queued/requesting/terminal 三段。
2. 类型面却有 streaming/validating/repairing/saving 四段幻影状态。
3. 这是语义与状态机不一致，不是兼容层。
4. 处置：裁剪。

### M4. 多 run 状态

1. registry + progressChannel 是显式事件流。
2. 没有发现第二个活跃状态源。
3. 处置：保留。

## 4. 不适用负担

### B1. scripts 孤儿面

1. `scripts/` 187 个中约 120+ 无 npm script 或代码引用。
2. 多数是 DEV_LOG 索引的一次性验证产物，总量约 3.4MB。
3. 按 G1.21，不能按“没引用”一刀切删除。
4. 处置：本轮不删，后续单独出 lifecycle 方案。

### B2. 类型导出面

1. 1000+ 类型导出未被外部消费，但 TS 结构类型允许下游与测试扩展。
2. 按“导出名未被引用”判死会误伤。
3. 处置：不列删除。

### B3. declaration files

1. 保留 6 个真实服务 `.d.ts` 与 4 个同名声明。
2. 只删除孤儿 `DiffModal.vue.d.ts`。
3. 处置：按个体闭包处置，不批量删除。

### B4. 上轮继承保留面

1. `chainIntentCorpus.ts`
2. `crashMonitor.ts`
3. `repairFeedbackWait.js`
4. intent 工厂三件
5. `shadowIntentCorpus.ts`
6. Agent 覆盖导入全字段刷新链路
7. 处置：保留。

## 5. 过度设计反问

1. 用户目标是否必须依赖候选？F3 不依赖；F1/F2/F5 不依赖；F4 依赖的是三枝而非七枝。
2. 现有机制为什么不够？生产入口已有 `useEditTaskSession` + `editTaskService`。
3. 是否增加延迟、状态纠缠或语义冲突？F4 已经造成“以为有四阶段”的语义错觉。
4. 删除会不会损失真实用户价值？不会，生产接线不变。
5. 是否有更小实现？删除是更小实现。

## 6. 交付判定

1. 方案待用户审核。
2. 实施删除必须按 proposal 分 Phase 执行。
3. 实施后必须产出 wiring/type/test 三证与删除闭包账本。
