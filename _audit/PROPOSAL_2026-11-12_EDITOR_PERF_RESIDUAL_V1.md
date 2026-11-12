# 方案：大纲与首页编辑器性能残留根治 V1

- 状态：已获用户确认；Phase A/D 已执行并收口。Phase B/C/E/F 按账本证据进入下一裁决批次，不与未证实优化混批。
- 前置审计：`_audit/EDITOR_AUDIT_2026-11-12_OUTLINE_AND_HOME_V1.md`。
- 任务台账：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-12_EDITOR_PERF_RESIDUAL_V1.md`。
- 方案性质：观测先行 → 按账本证据做最小链路收缩 → 收敛旧残渣 → 真实验证。不是新增功能方案。

## 1. 用户目标

用户原话："大纲编辑器和首页编辑器输入会导致应用短暂的卡顿现象，和过度的UI显示"。

可感知终态：两个编辑器输入无可感知卡顿；UI 状态显示只保留必要信息；历史补丁堆叠出的常驻开销、全量操作、重复 UI 状态被证据化收敛。

## 2. 门禁对账

| 门禁 | 关键要求（原文锚定） | 本方案执行方式 |
|---|---|---|
| G1.19 | "在真实运行数据排序出 Top 耗时来源前，任何'看起来慢'不得成为优化依据" | Phase A 只建账本不改行为；所有修复按账本排序进入 |
| G1.15 | "复杂症状禁止停在触发点修复……症状/链路/组合/机制四层" | 审计报告第三节完成四层静态定位；每阶段保留 file:line 证据 |
| G0.13 | "新机制前必须回答五问……禁止把更多配置当成质量提升" | 全程只做删除/节流/合并/降频，不新增全局配置、状态源或第二套降级系统 |
| G0.9 | "先列打算改的和可能碰到的" | 见第 4 节影响圈 |
| G0.10 | "新旧并存清零……旧语义执行层命中 0 才算闭环" | Phase F 清理 saveFeedback 散落实现与常驻轮询，负向扫描旧模式命中 0 |
| G1.17 | "至少三个最可能错误的假设与真实路径证伪方式" | 见第 5 节作者反证 |
| G0.12 | 非平凡任务必须有七节台账 | 已建骨架，逐阶段回填 |

## 3. 路由判定

加入：G0.5、G0.6、G0.7、G0.9、G0.10、G0.12、G0.13、G1.15、G1.17、G1.19、G1.21（验证脚本）。
排除：

| 门禁 | 排除理由 |
|---|---|
| G2.13 SKILL 执行中立 | 本轮不触碰 SKILL 层与生成流水线执行协议 |
| G1.18 local-transform | 本轮不改本地确定性编辑转换协议，只做性能观测与渲染链收敛 |

## 4. 影响圈

打算改（按 Phase 获账本证据后逐一执行）：

1. `src/components/common/OutlineWorkspace.vue`：击键 watch 守卫、findMatches 输入节流、消息虚拟计算收敛、saveFeedback 合并、轮询改状态驱动。
2. `src/services/editorViewport.ts` + `src/services/editorVirtualization.ts`：行索引缓存增量更新（如账本证实 OW1b 为 Top 源）。
3. `src/stores/editor.ts`：`updateContent` 脏判定与哈希策略降频/增量化。
4. `src/components/common/ApiChatInput.vue`：autosize 输入节流（rAF 或等价最小节流，不新增配置项）。
5. `src/stores/chat.ts`：sessions 持久化从全量深拷贝改增量/切片（保持 IPC 契约兼容）。
6. `src/stores/project.ts`：自动保存脏集收敛（只序列化实际脏面，不改 30 秒周期语义）。
7. `src/components/chat/ChatPanel.vue` + `ChatMessage.vue`：状态栏收缩、消息虚拟化、Markdown 渲染节流复用现有 `throttledMarkdown` 机制。

可能碰到：

1. `_audit/神意开发经验总结_v9.md`（如出现新教训才升版）。
2. `_audit/DEV_LOG_MASTER_INDEX.md`、DEV_LOG、版本号、封装脚本（仅收尾阶段）。

明确不碰：

1. `D:/codex/玄武规划SKILL/`（SKILL 层迭代不归应用管）。
2. 生成流水线编排、供应商路由、验收协议。
3. 任何产品功能语义（删除、回滚、权限、直写协议不变）。

## 5. 作者反证（G1.17）

| # | 最可能错误的假设 | 证伪方式 |
|---|---|---|
| 1 | 卡顿主因是大纲全文行索引重建 | Phase A 对输入事件、rAF、哈希、IPC、渲染分段计时；如账本显示事件处理 <5ms 且卡顿峰与自动保存撞车，主修对象改持久化层 |
| 2 | 首页消息无虚拟化是 UI 卡顿主因 | 账本统计真实消息量与 markdown 调用次数；如消息 <50 条且渲染耗时占比低，则优先修 HP1/HP2/HP3，虚拟化降级为观测项 |
| 3 | 持久化增量化不破坏数据恢复 | 保留 IPC 契约不变；用现有持久化测试 + 新增脏面单测 + 真实进程杀重启恢复验证三面把关 |

不可验证假设：无（三条均可在真实 Electron 环境验证；如某条被环境阻断，按 G1.17 标记并降级该阶段，不默认通过）。

## 6. 分阶段执行

### Phase A：只读性能账本（观测，不改生产行为）

动作：

1. 建临时账本采集脚本（`_audit/tmp-editor-perf-ledger`），用 Performance API + Electron 远程调试采集六条真实路径：
   1. 大纲编辑器 10 万/30 万字文档连续击键（输入事件耗时、rAF、行索引耗时、DOM 长任务）。
   2. 大纲查找面板打开 + 连续输入（正则耗时）。
   3. 首页编辑器连续击键（哈希、跨 store 拷贝、autosize reflow）。
   4. 首页流式生成（markdown 渲染次数与耗时）。
   5. 自动保存/会话持久化触发时序（是否与击键重叠）。
   6. 消息面板消息量 × DOM 节点数采样。
2. 每条路径记录 P50/P95/最大值，输出 `_audit/EDITOR_PERF_LEDGER_2026-11-12.json` + Markdown 摘要。

执行结果（2026-11-12）：

1. 七条真实路径全部产出 `_audit/EDITOR_PERF_LEDGER_2026-11-12/ledger.json`；脚本为 `scripts/measure-editor-perf-ledger.mjs`。
2. 已修复 PerformanceObserver 重复注册；接入 CDP CPU Profiler，长动作路径采集约 6.4k-6.5k samples。
3. Home 击键首个可归因热源是 `hashEditorContent`（`editorTarget` chunk，52 samples）和 `gs` bundle 函数（37 samples）；密集消息下同源继续出现 33/29 samples。
4. 最终复跑中基础 Outline/Home 输入、500 消息持久化、100k 项目保存、消息密度静态渲染均无 >50ms 长任务；查找面板上轮出现 71-74ms，最终复跑为 0，且热点被 DevTools evaluator 覆盖，暂不定案 OW3。

验收结果：红线通过。七条路径有数据，longtask 与 CPU profile 分层，不重叠；Top 结论已写入任务台账。允许进入 Phase D 的 `hashEditorContent` 证据收口；Phase B/C/E 仍按证据分路补测后执行。

### Phase B：大纲编辑器热链收敛（账本证实 OW1/OW2/OW3 后执行）

1. watch 守卫：`scheduleMultiCursorRepaint()` 只在 `multiCursorSelection` 非空时执行。
2. findMatches 增加 120-200ms 输入节流（复用现有 debounce 语义，不新增配置）。
3. 如账本证实行索引为 Top 源，把 `lineIndexCache` 从整篇重建改为基于上次内容的增量更新。
4. undo 入栈是否降频由 Phase A 数据裁决，不凭感觉改。

验收红线：功能行为不变（多光标、查找替换、断流恢复、回滚全部回归通过）；账本 after 输入 P95 下降且无新长任务。

### Phase C：ApiChatInput 节流（账本证实 HP1 后执行）

autosize 从每次 input 同步执行改为 rAF 合帧或 ≤100ms 节流；高度语义不变（60-120px）。验收：连续输入期间每帧最多一次 layout 读回；无高度跳动回归。

### Phase D：持久化与状态拷贝收敛（账本证实 HP2/HP3/HP8/BG1 后执行）

1. `editor.updateContent`：脏判定从"每次全文双哈希"改为"文本引用/长度快速短路 + 变更时才全量哈希"（或等价最小增量方案）。
2. `ChatPanel` 的 content watch：避免每次击键全文拷贝，改为会话发送时按需读取（保持 currentContext 语义不变）。
3. `chat.ts` sessions 持久化：防抖窗口保留，序列化从全量深拷贝改为只序列化脏会话（IPC 契约不变）。
4. `project.ts` 自动保存：脏面收敛，只写实际变化子集合（保持 30 秒周期与恢复语义不变）。

验收红线：写入/读取/清理/恢复生命周期对账通过；现有持久化测试全绿 + 新增脏面单测 + 真实进程杀重启恢复验证。

### Phase E：首页 UI 收敛（账本证实 HP4/HP5/HP6 后执行）

1. 消息列表虚拟化：复用大纲已验证的 `DynamicScroller` 模式，不新建第二套虚拟化。
2. 状态栏收缩：字数保留；token 条只在生成中/刚完成后短时显示；配置状态合并为单行状态点。
3. `ChatMessage` Markdown 渲染复用现有 `throttledMarkdown`（按 safe_mode 联动），不新增机制。
4. 消息操作面板按角色状态条件渲染，常驻 DOM 减少但不删除任何功能入口。

验收红线：现有首页会话/回滚/终稿/诊断功能 E2E 或真实 Electron 冒烟全通过；消息量 500 条时滚动与输入无长任务。

### Phase F：残渣清理（G0.10）

1. saveFeedback 清空合并为单一 `showSaveFeedback(text, duration)` 帮助函数，删除全部散落 setTimeout；全仓负向扫描旧模式命中 0。
2. 断流恢复轮询改为状态驱动（生成/恢复态启动，终态停止），删除常驻 setInterval。
3. ChatPanel store 依赖按实际使用收敛（本轮只删真实未用依赖，不为了数字砍依赖面）。
4. 所有删除走 G1.2 引用闭包三面搜索。

验收红线：负向断言通过；旧模式生产源码命中 0；UI 反馈行为不变。

## 7. 验证矩阵

| 路径 | before 账本 | after 账本 | 功能等价 |
|---|---|---|---|
| 大纲 10 万/30 万字击键 P95 | Phase A | Phase B | 多光标/查找/回滚回归 |
| 大纲查找面板击键 P95 | Phase A | Phase B | 查找替换回归 |
| 首页击键 P95 | Phase A | Phase C+D | 编辑/保存/恢复回归 |
| 首页消息 500 条滚动 | Phase A | Phase E | 会话/诊断/终稿回归 |
| 自动保存撞车窗口 | Phase A | Phase D | 杀进程恢复验证 |

环境要求：真实 Electron + 真实项目数据；替代证据（mock/静态扫描）只允许辅助，不替代 G0.11 真实交互验证。

## 8. 回滚策略

每 Phase 独立提交，可独立 revert。持久化/状态层（Phase D）改动附带兼容开关代码路径（同一提交内实现，不暴露给用户配置）；发现恢复异常立即 revert 整 Phase，不做部分保留。

## 9. 明确不做（防过度设计）

1. 不新增性能设置面板、自动降级调度器、全局观测面板。
2. 不把校准不足的观测数据产品化为规则。
3. 不重构整个编辑器架构或拆文件（那会引入更大爆炸半径，与本次目标不成比例）。
4. 不为"看起来更干净"而重写无关代码。

## 10. 成熟度结论（G0.6）

| 层 | 评估 |
|---|---|
| 执行器/工具层 | 成熟：账本采集用 Performance API + Electron 调试端口，现有验证基建支持 |
| 应用方案/交互闭环 | 成熟：所有改动只删/节流/合并，不新增用户可见概念 |
| 实现接线 | 半成熟：Phase B-F 具体改法需 Phase A 数据确认 Top 源后才定稿（这是设计好的断点，不是逃避） |
| 验证标准 | 成熟：每 Phase 有可判定红线 + 真实路径验证矩阵 |

整体判定：**可执行（半成熟放行条件明确：Phase A 账本完成即解锁后续阶段）**。
