# PROPOSAL 2026-11-15 正文层 LHC 反馈链路修复 V1

## 1. 目标与结论

- 用户目标：诊断 run-trace-正文层-20261115-034957-deep 六根因中属于应用侧的问题，并修复应用侧反馈链路。
- 裁决：R2 逐场校验、R3 字数标点口径、R4 上限/下限冲突归 SKILL；R6 full_chain 是 G2.9 既有语义；R1 是 run 起点早于磁盘 mtime 的时序事实，登记经验教训。
- 应用侧修复项：F1 合同句 legacy 口径、F2 信封候选骨架解析、F3 上游情报接线、F4 结构失败路由。
- 12403/12000 争议按 G1.31 核实为不动作项：12403 是 system+user 总长，反馈本体 824 字，12000 是另一条终步账本限。

## 2. 修复项

### F1 合同句退役 legacy 口径

- `src/services/chainExecution.ts` 的 `bodyGeneratorContractSentence()` 尾句改为现役 LHC 平台合同：正文装进信封 body，账本装进 `metadata.extractedMeta[0]`；S1 自然骨架例外。
- 消费点 `src/services/protectedSkillContract.ts:55` 统一生效，不在 prompt 中二次拼装。
- 同批迁移以下旧句守护测试，并增加负向断言：
  - `src/services/chainExecution.spec.ts:403-411`
  - `src/services/proseWordContract.spec.ts:11-25`
  - `src/services/realS2ProtectedContract.integration.spec.ts:59-60`
  - `src/services/realSkillExecutor.spec.ts:1604-1605`

### F2 骨架解析器认 LHC 信封

- `src/services/schemaRetryFeedback.ts` 的 `buildWordGapScaffold()` 先用 `parseGenerationResult()` 拆信封，再从 body 与 extractedMeta 提取账本；legacy 输出仍走原路径。
- `missingHandoff` 改为基于解析后提取面判断，避免信封字符串包含 `【正文交接】` 就误判已有可解析账本。

### F3 上游情报接线

- `src/components/pipeline/PipelinePanel.vue` 三处调用点把 `upstreamPrompt.prompt`（章节基础 prompt）换成 S1 骨架产物。
- 是否消费由 S2/S3 meta 的 `requiresFullUpstreamContext` 声明闸控制；应用不越权翻转 meta。
- 当前 S2/S3 meta 为 false，本轮只修数据源语义，不强行注入；SKILL 后续声明 true 时应用链路即通。

### F4 结构类失败优先路由

- `schemaRetryFeedback.ts` 的 `STRUCTURE_OR_FORMAT_FAILURE_PATTERNS` 增加信封/JSON 解析类 pattern。
- 结构判定与 candidate-anchored 路由提前到 word-gap 分支之前；混合失败“信封错 + 正文过短”必须携带完整候选和全部失败项。
- 传统“正文过短/过长”单独出现仍走 word-gap。

### F5 经验补条

- v9 经验文件补条：run 起点与磁盘 mtime 对账，禁止倒推缓存问题。
- DEV_LOG 记录本次复核结果。

## 3. SKILL 补充合入

- SKILL 已确认四条应用侧残留全部属实。
- 优先级调整为 F1 -> F2 -> F3 -> F4，与 SKILL 建议一致。
- 不因补充新增第五条应用修复项。

## 4. 影响圈七面

1. 生产入口：正文链上游参数与重试反馈构建。
2. 服务层：schemaRetryFeedback、chainExecution、protectedSkillContract。
3. UI/trace：反馈策略、scaffoldSource、candidate 字段观测变化。
4. 测试：上述四个旧句守护测试同批迁移，新增信封正反断言。
5. 脚本：无新增。
6. 规格/文档：v9 经验补条、任务台账、DEV_LOG。
7. 构建：无新依赖。

## 5. 门禁与成熟度

- G0.6：执行器/工具层成熟；应用闭环成熟；实现接线成熟；验证成熟。
- G0.7：正推是重试候选能获得可修基底；反推是旧句仍误导信封输出、信封账本解析不到、上游 fallback 落空、结构失败被摘要抑制。
- G0.10：旧 legacy 句在源码、测试、执行路径命中 0 才收口。
- G0.12：执行时建立七节台账，含 G1.14 缺陷面枚举。
- G0.13：不新增裁判、预算系统、自动调度或 UI；应用只提供平台合同与情报，不评价叙事质量。
- G1.31：转达争议按完整 request 字段口径复核。
- G2.9：结构/格式/字数类失败必须携带完整候选；质量/风格类失败仍禁止候选全文。

## 6. 执行顺序

1. F1 合同句与四个测试迁移。
2. F2 信封骨架解析。
3. F3 上游数据源接线。
4. F4 结构路由优先级。
5. F5 经验补条、台账、DEV_LOG。
6. 定向测试、全量 vitest、type-check、build。
7. 提交封装。

## 7. 停止条件

- 通过：所有定向测试通过；legacy 句源码与执行路径命中 0；信封 candidate-anchored 与 word-gap 正反断言通过；全量验证 exit 0；台账七节齐全且 `[DEFECT-SWEEP]` 引用缺陷枚举。
- 失败：任何测试暴露新语义冲突、真实 prompt 仍出现旧句、或全量验证失败；先修复或回登记，不宣称完成。
