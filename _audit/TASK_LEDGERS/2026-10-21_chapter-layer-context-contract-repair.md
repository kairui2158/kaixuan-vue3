# 2026-10-21 章节层上下文与契约修复台账

## 1. 目标与原话

用户原话：`SKILL层的问题让SKILL层来处理，你按照v1的修复方案执行吧`

最终可感知行为：

- 章节链 S2-S4 不再每跳携带约 10 万字符的全书大纲，改为首跳全量、后续跳结构地图；当前卷卷纲与历史章节清单保留。
- 章节数量以单一契约口径仲裁，卷纲声明优先于应用字数推算，冲突时写入 trace。
- 章节 plot 内容级重复产生 warning，不再只在标题层静默。
- 导出 payload 明确 `artifactRole`，区分 final 与 intermediate，避免同名/同内容跨 kind 展示被误读为生成重复。
- Agent model 为空时显式记录回退来源，不再静默走供应商默认模型。

本轮交付物：应用源码、单测/契约测试、事故回放证据、Electron 真实 UI 验证证据、DEV_LOG 与经验文件裁决。

## 2. 门禁读证

- G0.1 目标对齐：本轮只修章节层应用侧；SKILL 元数据与提示词不由应用修改。
- G0.3 诚实闭环：live 未执行前不得声称完成，只登记 `untested`。
- G0.4 门禁复读：已复读 `_audit/神意开发经验总结_v7.md`（当前内容头标 v8.17）L0-L1 相关条目。
- G0.9 影响圈声明：本台账第 4 节列影响面，未列入口不触碰。
- G0.10 新旧并存清零：`[大纲]` 与 `[全书大纲]` 双头过渡期由协议单源管理；旧 `declared_full_context` 语义必须迁移，不允许同一含义双处漂移。
- G0.11 真实交互冒充禁令：Electron 验证必须真实下拉选择 SKILL，禁止注入业务选中态。
- G0.12 台账执行：本文件即执行凭证，七节不可空。
- G1.1 精准编辑：只用 apply_patch，逐行审 diff。
- G1.5 验证器质量：断言必须覆盖决策结果与下游副作用，不得只看事件存在。
- G1.8 日志与观测同步：新决策必须进入 trace，并在导出/验证器同步消费。
- G1.11 测试契约：旧断言按新语义迁移，保留旧形态不存在的负向断言。
- G1.15 系统层递进诊断：症状层（耗时高）、链路层（每跳全量上下文）、组件组合层（章节 prompt、chain slim、folder executor、trace 导出）、机制层（full 声明豁免边界与章节数多源）均需对账。
- G1.19 耗时观测先于性能决策：before 基线来自用户提供 trace，改动后需输出可对账的长度与耗时指标。

## 3. 路由判定

加入：G0.1、G0.3、G0.4、G0.5、G0.9、G0.10、G0.11、G0.12、G1.1、G1.4、G1.5、G1.8、G1.11、G1.13、G1.15、G1.19。

排除：

- G0.2 无预算铁律：本轮用户未触发“不设预算”语义；仍不设置人工 token 预算。
- G1.10 写入权限三元组：本轮不改编辑器直写授权，章节生成写入路径沿用既有契约。
- G1.12 封装收尾：用户尚未要求本轮封装；完成实现与验证后仅登记后续建议。
- G1.16-G1.18：本轮不是经验回写主任务、不是本地路径直写契约变更；但收尾仍需 DEV_LOG 与经验裁决。

## 4. 影响圈与作者反证

打算改：

- `src/services/promptBlockProtocol.ts`（新增协议单源）
- `src/services/chainExecution.ts`（双头识别、full 声明下仍压缩全书资产块）
- `src/services/realSkillExecutor.ts`（重复块 marker 消费协议单源）
- `src/services/chapterBatchOrchestrator.ts`（prompt 组装、内容级重复观测）
- `src/services/chapterGenerationContract.ts`（内容级重复 warning）
- `src/components/pipeline/PipelinePanel.vue`（章节层注入、章节数仲裁、trace 事件、Agent model 回退）
- `src/services/volumeGenerationContract.ts` 或相邻纯函数（卷纲声明章数提取）
- `electron/ipc/runTrace.js`（payload `artifactRole` 导出）
- 上述对应 `*.spec.ts`

可能碰到：

- folder SKILL 执行器的 `[declared upstream context]` 注入面。
- runTrace 事件 schema 与导出器白名单。
- 卷纲写入 `projectStore.volumes` 的语义回写。
- 既有 chainExecution “declared full 保留全文”测试语义。

最可能错假设与证伪：

- 假设 full 声明只保护上一步输出，不保护全书资产块。证伪：若 SKILL 模板在 S2-S4 明确消费 `[全书大纲]`，需通过 trace 和验收观察是否丢失关键章位。
- 假设结构地图足以支撑章节规划。证伪：批次验收或章位映射失败率上升。
- 假设导出重复是展示/导出层造成。证伪：payload `artifactRole` 与内容 hash 对账仍发现同 role 重复。

## 5. 停止条件

完成条件：

1. 定向测试覆盖新增协议、分层注入、章节数仲裁、内容重复、Agent model 回退、artifactRole。
2. `npm run test:services` 通过或失败项逐条归因且非本轮引入。
3. `npm run type-check` 清零。
4. 事故回放脚本证明用户 trace 的三类旧形态不再出现：非首跳 `declared_full_context` 且 `outlineOriginalLength: 0`、章节数三源冲突无仲裁事件、重复章节无内容级 warning。
5. Electron 真实 UI 验证使用真实下拉选择 SKILL 与应用内既有 key，产生本轮 trace 证据。

失败条件：

- 任一新增决策没有 trace 副作用断言。
- 分层后验收失败率或章节数错位恶化。
- UI 验证无法真实选择 SKILL 或无法取得 trace。

## 6. 执行证据

### 6.1 实现证据

- 协议单源：`src/services/promptBlockProtocol.ts:1-42`，`[全书大纲]` / `[大纲]` 双头由单源枚举管理；`chainExecution.ts:244` 定位大纲块，`:271` 产生 `declared_full_context_slimmed` / `slimmed` 新语义。
- 章节数仲裁：`src/services/chapterGenerationContract.ts:46-117`，来源优先级为 `volume_outline_declared > configured_chapter_count > word_estimate`，冲突写入 `conflict/message`；trace 事件 `PipelinePanel.vue:4485`，失败事件 `PipelinePanel.vue:4426`。
- 内容级重复观测：`src/services/chapterGenerationContract.ts:166-199`，标题重复仍是错误，plot 全文重复降为 warning；事件入口 `PipelinePanel.vue:4564`。
- Agent model 回退观测：`PipelinePanel.vue:2484-2493`，空 model 显式记录 `fallbackModel/fallbackSource`。
- 导出 artifactRole：`electron/ipc/runTrace.js:177-179`、`:259`、`:407`、`:421`；类型契约 `src/stores/runTrace.ts:566`；测试 `electron/ipc/runTrace.spec.js:30-39`。

### 6.2 Before / After

Before（用户提供的事故 trace）：

- S1-S4 prompt：89,059 / 97,351 / 96,876 / 104,322 字符。
- 总耗时 29.9 分钟，S2 约 20 分钟。
- S2-S4 `chain-context-slim` reason 为旧 `declared_full_context`，`outlineOriginalLength: 0`。
- 章节数三源并存：卷纲声明 90、应用注入 143、reasoning 记录 0，无仲裁事件。
- 章节内容重复只在标题层可见，plot 重复无 warning。
- Agent model 为空时静默回退供应商默认模型。

After（本轮 live，run `run-1792588859055-1`，deepseek-v4-pro）：

- 12 章、3 批（5/5/2）全部 `complete`，`repairAttempts` 全 0。
- 12 次 API 全部 `success`，无 running/failed 残留；总耗时 1,897 秒。
- request payload 字符数（第一批次）：S1 5,611，S2 9,235，S3 13,411，S4 17,076。事故基线的 7.5 万字大纲不在本轮 12 章种子项目内，不能直接做同项目同比；本轮可比项是“历史清单注入后 prompt 增长为线性且每跳不再携带全书大纲”。
- 12 个 `agent-model-fallback` 事件，全部 `fallbackSource: provider.selectedModel`，无静默回退。
- 1 个 `chapter-count-arbitration` 事件：`totalChapters=12`、`source=configured_chapter_count`、`conflict=false`、`declaredChapterCount=0`。
- 12 个 `chain-context-slim` 决策：3 个首跳 `primary_consumer`；9 个非首跳 `outlineOriginalLength=298`，不再出现 `outlineOriginalLength: 0` 的盲区。
- 96 个导出 payload 全部带 `artifactRole`：`056-request` / `057-response` / `058-stream` / `060-stream` 为 final，其余 intermediate。

### 6.3 验证命令与原始关键输出

- `node scripts/verify-chapter-batch-contract-electron.mjs`
  - `_audit/verification-chapter-batch-contract-live/summary.json`：`status: "success"`，`chapterCount: 12`，3 个 `validatedBatches` 全部 `complete`，12 个 `apiCalls` 全部 `success`、`toolCallCount: 0`。
  - 完整 trace：`_audit/verification-chapter-batch-contract-live/live-export/run-trace.json`（1,413,360 bytes）。
  - `summary.json.exportPath` 指向 `_data/chapter-batch-contract-live-exports/...` 临时导出路径；脚本成功后按设计清理 `_data` 导出目录，并把证据归档到 `_audit/verification-chapter-batch-contract-live/live-export/`，不是证据丢失。
- `node scripts/verify-chapter-context-contract-replay.mjs _audit/verification-chapter-batch-contract-live/live-export/run-trace.json`
  - `RESULT: ACCEPTED (6 checks)`
  - `non-primary-outline-slim: PASS 9 non-primary slim decisions -> 9 located the bounded outline block`
  - `legacy-declared-full-bypass: PASS legacy reason declared_full_context -> reasons=scaffold_not_smaller`
  - `chapter-count-single-source: PASS ... -> 1 arbitration event(s)`
  - `plot-duplicate-observability: PASS ... -> 0 plot-duplicate warning event(s)`
  - `agent-model-fallback-observability: PASS ... -> 12 fallback event(s)`
  - `PAYLOAD ARTIFACT ROLE: SKIPPED (payloads directory is not present in this export)`：deep 归档只保留 run trace 与 selected history，payload 原件由 live 脚本断言，role 证据记录在 run payload refs 中。
- `npm run type-check`
  - exit 0，`vue-tsc --noEmit` 无输出。
- `npx vitest run`
  - `Test Files 187 passed (187)`，`Tests 2114 passed (2114)`，0 失败。

### 6.4 诚实边界

- 本轮 live 是 12 章种子项目，未复刻用户 7.5 万字大纲的同规模长文；同规模 prompt 缩减幅度登记 `untested`，后续应在真实长文项目上复跑一次采样。
- `chain-context-slim` 在本轮短 prompt 中出现 `scaffold_not_smaller`：结构地图比原 prompt 更大时保持原文并记录 rejected candidate 长度，这是防误删的保守路径，不是绕过；长文场景才会触发实际替换。
- 单一供应商 `deepseek-v4-pro`，未覆盖其他供应商矩阵。
- SKILL 层问题（folder SKILL 元数据、提示词质量）不由应用修改，本轮只闭环应用侧。

## 7. 缺口清单

已闭环：

1. 非首跳全书大纲注入：协议单源 + `outlineOriginalLength` 观测 + 回放断言。
2. 旧 `declared_full_context` 绕过语义：回放负向断言 PASS。
3. 章节数三源冲突：仲裁契约 + trace 事件 + live 断言。
4. plot 内容重复不可见：warning 契约 + 事件入口 + 回放检查。
5. Agent model 静默回退：trace 事件 + live 12 事件断言。
6. 导出同内容被误读为重复：`artifactRole` final/intermediate 区分 + 测试。
7. 真实 Electron UI + 真实 API：12 章 3 批全部成功，无卡死、无降级。
8. 回归：type-check、187 files / 2114 tests 全部通过。

登记项（不阻塞本轮，不冒充完成）：

1. 7.5 万字级同规模长文的 prompt 缩减与耗时 before/after 未复跑，登记 `untested`。
2. 其他供应商矩阵未复跑。
3. `PAYLOAD ARTIFACT ROLE` 的独立回放脚本因 deep 归档不含 payload 原件而 SKIPPED，live 脚本已用 payload refs 断言补位。

收尾状态：

- 本台账第 6/7 节已补齐。
- 章节层 DEV_LOG 已写入 `_audit/DEV_LOG_2026-10-21_chapter-layer-context-contract.md` 并登记总索引。
- 本轮未升版、未封装；版本保持 3.102.0，等待用户另行裁决。
