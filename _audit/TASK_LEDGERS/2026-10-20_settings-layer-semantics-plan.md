# 2026-10-20 设定层分层语义约束方案台账

## 1. 目标与原话

用户目标：根据问题一解决后的应用实际情况设立问题二的详细方案，严格遵循经验文件。

交付物：`_audit/PROPOSAL_2026-10-20_settings-layer-semantics.md`。

## 2. 门禁读证

- G0.6：方案成熟度必须分层评估。
- G0.7：正反推与爆炸半径必须锚定真实代码入口。
- G0.12：非平凡方案必须建台账。
- G1.15：症状、链路、组合、机制四层递进。
- G1.17：作者反证与验证证伪。
- G2.9：配置入口不等于链路接入。
- G2.13：SKILL 中立，禁止改变执行语义。

## 3. 路由判定

- 加入：方案设计、流水线、SKILL 中立、验证门。
- 排除：G2.5 长文档重排，本任务不触碰直写重排。
- 排除：G2.10 客户 trace 回放，本阶段为方案设计，不改执行链路。

## 4. 影响圈与作者反证

打算改：

- `settingsProjection.ts`
- 新增 `settingsLayerSemantics.ts`
- `PipelinePanel.vue`
- `ChatPanel.vue`
- `volumeGeneration.ts`
- `chapterExecutionPackage.ts`
- 相关测试与 Electron 验证脚本

可能碰到：

- 设定分类自由文本
- 首页触发词旁路
- 正文上下文闭包
- trace 字段兼容

最可能错的假设：

- “分层语义只需改投影函数”。反证：四个消费面 prompt 结构不同，必须分别接线。
- “触发词旁路可以保留”。反证：会造成双通道与新旧并存。

## 5. 停止条件

方案阶段停止条件：

- 四层语义契约明确。
- 实施步骤可执行。
- 验证门包含真实 Electron UI 与证伪路径。
- 风险边界明确。

## 6. 执行证据

- 语义单源：`src/services/settingsLayerSemantics.ts:3` 定义 `SETTINGS_PROJECTION_POLICY_VERSION=2`；`:56`/`:73`/`:90`/`:107` 分别定义卷纲、章节、正文、首页语义块；`:131` 分类规范化；`:161` 分层投影。
- 投影入口：`src/services/settingsProjection.ts:41` 单源状态判定；`:68` 统一 `getLockedSettingsForLayer()`；`:112` 生成 `settings-projection-composed` trace。
- 四层接线：
  - 卷纲：`src/components/pipeline/PipelinePanel.vue:4132` 消费 volume 投影并写 trace，`src/services/volumeGeneration.ts:67` 输出 `[设定规划约束]`。
  - 章节：`src/components/pipeline/PipelinePanel.vue:4420` 消费 chapter 投影，`PipelinePanel.vue:4456` 输出 `[章节规划约束]`。
  - 正文：`src/components/pipeline/PipelinePanel.vue:4609` 消费 body 投影，`:4702` 不再重建普通设定列表，`src/services/chapterExecutionPackage.ts:158` 输出 `[正文执行约束]`。
  - 首页：`src/components/chat/ChatPanel.vue:3244` 局部快照，`:3251` 按 query 调 home 投影，`:3254` 只注入 `[当前上下文设定]`。
- 兼容边界：`src/services/chainExecution.ts:50` 把三个新语义块加入大纲截断头，防止旧输出解析把语义块吞进大纲。
- 回放证据生命周期修复：`src/services/finalStepMetadataReplay.spec.ts:9` 用仓库相对路径消费 `_audit/verification-final-step-metadata-replay/`，不再硬依赖桌面 trace。
- 定向验证：
  - `npx vitest run src/services/settingsProjection.spec.ts src/services/settingsProjectionWiring.spec.ts src/services/finalStepMetadataReplay.spec.ts` 通过，覆盖四层语义、触发词旁路删除、快照守卫、回放 4 用例。
  - `npm run test:services` 通过：180 files / 2067 tests。
  - `npm run type-check` 通过。
  - `npm run build:vue` 通过，build fingerprint 进入 Electron report。
- 真实 Electron UI：`node scripts/verify-settings-lock-projection-electron.mjs` 最终轮通过；`_audit/verification-settings-lock-projection-electron/report.json` 记录 `generatedAt=2026-10-20T12:14:20.949Z`，schema 3→4 迁移、单锁/解锁/批量锁、卷纲 `[设定规划约束]`、章节 `[章节规划约束]`、正文 `[正文执行约束]`、首页 `[当前上下文设定]`、草稿排除、心跳 4 帧全部断言通过。
- 方案与事故记录：`_audit/PROPOSAL_2026-10-20_settings-layer-semantics.md`；`lessons/ERROR_LOG.md` 已按最终通过轮次收口本轮“待重跑”条目。

## 7. 缺口清单

- 外部 live 供应商矩阵未执行：本轮 Electron 使用本地 OpenAI-compatible provider，外部供应商成功响应形态仍登记 `untested`。
- 首页相关性排序当前只按名称与关键词命中，语义向量级相关性排序未实现；无命中时保守回退全量锁定设定并写 warning。
- 预算裁剪链路未触发：`trimmedReasons` 目前恒为空，上下文预算不足时的确定性裁剪策略仍为后续项。
- 未升版、未打包：版本保持 3.100.0，等待用户验收问题二后再决定封装节奏。
