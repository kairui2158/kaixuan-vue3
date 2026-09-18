# 2026-09-19 意图路由底座成熟化方案 V4

**方案成熟度：不成熟，禁止直接写码。**

本结论按经验文件 M18 给出：执行器/工具层虽然成熟，但应用方案、实现接线、验证标准三层未闭环。执行本方案前必须先完成「执行前门禁清单」，否则会复现「修一处坏一处」的事故。

## 1. 目标与不做范围

### 目标

1. 讨论请求不再被弱写入词劫持为 edit。
2. `no_match` 不再把 SKILL 拦死，默认进入只读讨论路由。
3. 澄清轮后的长句回复能承接上下文，不再重新路由。
4. 真实用户原话进入单源语料集，测试不再过拟合。
5. Trace 不把降级折叠为 success，postProcess 完整输出可导出。

### 不做范围

1. 不改 pipeline 生成链路的意图路由（pipeline 无交互式写入）。
2. 不引入 embedding/LLM 分类器依赖；本轮仍是本地规则 + 语料集驱动。
3. 不改 folder skill 执行器本体。
4. 不动 API 对话框输入组件与布局。

## 2. 修复项

### P0-1 意图判定重排

**问题**：`hasExplicitWrite` 在 `contextualHits` 之前计算，弱写入 + 目标词 + 祈使标记可越过讨论标记。

**改法**：

1. `resolvePermissionIntent()` 先计算 `discussionSignal`（讨论/商量/探讨/聊聊/解释/说明/你觉得）。
2. 再计算强写入信号：仅 `strongWriteActions` + 非问句；弱写入词必须有强写入上下文（写入/编辑器/同步）才参与。
3. 弱写入 + 讨论标记同时存在时，默认 discuss，并在 trace 记录 `weak-write-vs-discussion`。
4. `hasExplicitWrite` 不再依赖 `/把|将/` 单独放大；只有强写入动词存在时祈使标记才生效。

**验收**：

- 「和我讨论一下第一卷的补充钩子」→ discuss。
- 「把讨论结果填进第二段」→ edit。
- 「你出#3的替换给我参考」→ discuss。
- 「那你试着把修改一下大纲编辑器里的内容来验证权限」→ edit。
- 单测覆盖以上 4 类边界，且包含负样本「不要写入，只讨论」。

### P0-2 `no_match` 只读兜底

**问题**：非 `matched` 一律 `awaiting_confirmation`，SKILL 不执行。

**改法**：

1. `routeChainIntent()` 返回值增加 `fallbackMode: 'readonly-discuss' | 'await-user'`。
2. `no-keyword-overlap` → `readonly-discuss`，intent=discuss，工具面只读。
3. `low-confidence` → `await-user`，仅当存在写入信号时保留确认。
4. `ambiguous` 分两种：包含 edit/generate 候选时 await-user；纯只读候选时 readonly-discuss。
5. `workspaceSkillEngine.runWorkspaceSkills()` 不再把非 matched 直接折叠为 awaiting；按 fallbackMode 执行。

**验收**：

- 「大纲里的第一卷钩子需要重新设定」在无写入确认时进入只读讨论，SKILL 执行，`editor.write` 不出现在 actualToolSurface。
- 纯低置信写入意图仍显示确认气泡。
- trace 记录 `routing-fallback-readonly` 与实际工具面。

### P0-3 入口单源收口

**问题**：Outline 入口用 `routingDecision.forcedIntent || 'auto'` 构建工具面，与引擎内部路由存在双源。

**改法**：

1. 新增 `resolveWorkspaceRouting()` 单源函数：输入原始 requestText + context，输出 routing result、authorized intent、authorized tool surface。
2. Outline 入口、`runWorkspaceSkills`、runTrace 全部消费该函数输出。
3. 保留 `user-confirmed-recommendation`，但 forcedIntent 只允许来自用户点击确认，不允许来自自动推断。

**验收**：

- trace 的 `intent`、`actualToolSurface` 与真实 API 请求 tools 逐项一致。
- 删除入口层独立推断后，`rg` 检查不再有第二处 forcedIntent 自动来源。

### P0-4 语料集扩充与评估

**问题**：语料集仅 20 条，测试过拟合。

**改法**：

1. 每意图补至 30 条以上（含负样本），来源标注 trace 文件名。
2. 必须包含：讨论设计意图、解释既有内容、回答 A/B/C、质疑、短批准、位置咨询、权限问句。
3. 新增 `npm run evaluate:chain-intent` 输出报告：accuracy、failures、below-threshold。
4. 语料评估不设达标阈值放行；任何 failure 都必须解释为「设计允许」或「修复项」。

**验收**：

- 4 意图样本数 ≥ 30。
- trace 原话样本全部有 source 标注。
- 评估报告输出并归档 `_audit/phrase-corpus-saturated.json` 或新文件。

### P1-1 Trace 降级终态

**问题**：finally 兜底固定 success，schema 校验失败后 run 仍 success。

**改法**：

1. run 状态收口函数维护 `degradedReasons[]`。
2. schema 校验失败、产物无效、postProcess blocking issue、folder degraded meta 都写入 reasons。
3. finally 兜底按 reasons 决定 `success/degraded/failed/canceled`。
4. trace schemaVersion 如字段变化则升级并补兼容测试。

**验收**：

- 复现 3 次 schema 校验失败的夹具，run 终态为 degraded，reason 保留。
- 成功路径 run 仍为 success。

### P1-2 postProcess 完整输出

**问题**：`attachProcessingReport` 只传 200 字 preview，导出器优先用 `report.output` 导致截断。

**改法**：

1. trace processing report 增加完整 `output` 字段，preview 仅用于 UI。
2. 导出器优先 `output`，无则回退 `outputPreview`。
3. 增加大文本上限保护与截断标记，避免导出无限膨胀。

**验收**：

- 导出的 payload 包含完整 postProcess 输出，末尾有截断标记（如发生）。
- UI 列表仍显示短预览，不造成渲染卡顿。

### P1-3 会话状态机承接

**问题**：20 字限制 + 标记依赖导致长句解释被重新路由。

**改法**：

1. assistant 消息带 `await_user` 时建立 `awaitingTurn` 状态。
2. 下一轮用户输入若为回答/解释/选择/反驳/批准，默认承接 discuss。
3. 出现强写入动词时解除承接并进入 edit。
4. 承接结果写入 trace reason（`contextual-successor`）。

**验收**：

- Turn 3 长句解释样本进入 discuss。
- 「好的，按你的方案来出修改文案」保持 discuss（先讨论方案）。
- 「直接写入编辑器」解除承接并 edit。

### P1-4 真实用户路径 E2E

**问题**：现有单测不能证明入口 → API → 工具面 → UI 可感知。

**改法**：

1. 新增大纲工作台真实 E2E：加载技能 → 输入讨论句 → 断言只读工具面 → 断言 assistant 有正文 → 断言 runTrace routing reason。
2. 写入路径：确认 forcedIntent → 断言 `editor.write` 在 actualToolSurface → 执行器写入成功 → trace 状态正确。
3. 不允许 mock 强制返回工具调用作为通过条件。
4. 构建产物必须通过 M28 新鲜度校验。

**验收**：

- E2E 覆盖 discuss、edit、no_match readonly、await-user、contextual-successor 五类路径。
- runTrace 与 UI 双侧对账一致。

## 3. 门禁矩阵

| 门禁 | 要求 |
|---|---|
| M1 | 列出改动文件与影响面：`chainIntentRouter.ts`、`workspaceSkillEngine.ts`、`OutlineWorkspace.vue`、`chainIntentCorpus.ts`、trace store/exporter、相关 spec/E2E |
| M6 | 执行前复读本方案、V4 调研报告、v5.17 经验文件 |
| M8 | routing fallback、readonly-discuss、degraded reasons、postProcess output 全部进 runTrace/DiagLogger |
| M9 | discuss 只读工具面必须服务层断言，入口不得兜底写 |
| M11 | `classifyChainIntent` 与 `routeChainIntent` 语义单源 |
| M12/M18 | 执行前完成正推/反推与四层成熟度评估，无真实路径证据不放行 |
| M17 | 收尾回头看：rg 全仓 forcedIntent/fallback 推断点、trace 状态收口、新旧语义清零 |
| M19 | actualToolSurface 单源，真实请求与 trace 一致 |
| M21 | 语料集单源，正负样本齐备，评估报告归档 |
| M26 | 删除 `no_match→awaiting` 旧语义时，七面矩阵（生产入口、服务层、UI、测试、脚本、规格、日志字段）同步清零 |

## 4. 回头看计划

执行后必须连续多轮回头看，直到一轮无新发现：

1. `rg "awaiting_confirmation|routing-fallback"` 确认旧语义只在设计允许处存在。
2. `rg "forcedIntent"` 全仓盘点入口来源。
3. `rg "inferOutlineFallbackIntent|inferFallbackIntent"` 确认同款逻辑收口。
4. 对账 runTrace routing、tool surface、run status、postProcess output 四类字段。
5. 全量服务测试 + type-check + 构建后 E2E。

## 5. 风险与反推

1. **风险：readonly-discuss 放宽后，用户明确想写但词面弱。** 反推防线：强写入动词清单 + await-user 确认 + trace 记录未执行原因，用户可一键跳过路由。
2. **风险：讨论优先导致写入句被拦。** 防线：只有强写入动词可越过讨论标记；语料负样本覆盖「讨论+写入」混合句。
3. **风险：trace 完整 output 导出过大。** 防线：上限保护 + 截断标记 + 导出器兼容旧字段。
4. **风险：forcedIntent 收口破坏用户确认链路。** 防线：确认按钮仍传 forcedIntent，但 reason 固定为 user-confirmed-recommendation；E2E 覆盖。
5. **风险：语料扩充后测试漂移。** 防线：先修分类器，再跑评估，failure 逐条归类，不为绿灯改断言。

## 6. 执行顺序与验证

1. 语料集扩充（含 trace 原话与负样本）
2. 路由判定重排 + 单测
3. fallbackMode 与引擎执行策略
4. Outline 入口单源收口
5. Trace 降级与完整输出
6. 真实用户路径 E2E
7. 全量回归：`npm run test:services`、`npm run type-check`、`npm run build:vue`、E2E 脚本
8. 回头看循环至一轮无新发现

每步完成后更新执行状态，并附命令输出与 file:line 证据。未完成验证前不得声称闭环。
