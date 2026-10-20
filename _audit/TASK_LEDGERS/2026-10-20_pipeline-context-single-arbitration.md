# 2026-10-20 生成流水线上下文单源仲裁台账

## 1. 目标与原话

用户目标：确认执行四条未梳顺线路的修复方案：风格双通道、模板变量错层取 body 投影、记忆与设定冲突无检测、`trimmedReasons` 恒空与预算裁剪缺失。

已确认裁决点：

- 风格优先级：独立风格档案为准，设定卡风格作为主题基调补充。
- 冲突记忆：保留原文并加“已被锁定设定覆盖”前缀，不静默删除。
- 本轮不做生成层相关性过滤，先做预算裁剪。
- 预算：volume 1200 / chapter 1500 / body 1800 字符。

## 2. 门禁读证

- G0.6：四阶段均需独立成熟度结论。
- G0.7：每阶段做正反推与爆炸半径。
- G0.12：本台账逐阶段补证据，无台账不得声称完成。
- G1.5：验证必须断言决策结果与下游副作用。
- G1.15：症状、链路、组合、机制四层定位。
- G1.17：作者反证与组合盲区。
- G2.9：UI 配置入口不等于链路接入。
- G2.13：SKILL 中立，不改变执行语义。

## 3. 路由判定

- 加入：incremental-implementation（多文件分片）、verification-gate（每阶段硬证据）。
- 排除：G2.5 长文档重排，本任务不触碰直写重排。
- 排除：SKILL 文件修改，应用层单侧完成。

## 4. 影响圈与作者反证

打算改：

- `src/services/settingsLayerSemantics.ts`
- `src/services/settingsProjection.ts`
- `src/services/pipelineStyleArbiter.ts`（新增）
- `src/services/contextConflictDetector.ts`（新增）
- `src/components/pipeline/PipelinePanel.vue`
- `src/components/chat/ChatPanel.vue`
- `src/services/chapterExecutionPackage.ts`
- 相关 spec 与 Electron 验证脚本

最可能错的假设：

- “模板变量分层只需替换一个调用”。反证：ChatPanel 也有手写人物提取，必须一并收敛，否则首页继续绕过单源。
- “风格仲裁只处理重复行”。反证：冲突行不处理时模型仍会自由发挥，必须保留并声明优先级。
- “预算裁剪只按行删”。反证：必须保证 header/instructions 永不删除，否则消费方 prompt 语义崩塌。

## 5. 停止条件

- 阶段 A-D 逐阶段测试通过后才进入下一阶段。
- 任一阶段验证失败：先修本阶段，不带病推进。
- 连续 3 轮失败：触发防空转，换验证载体或实现方案。

## 6. 执行证据

### 阶段 B：风格语义仲裁

- 实现：`src/services/pipelineStyleArbiter.ts:68` 合并风格档案与设定卡风格行；`:123` 从设定投影剥离风格小节；`:146` 输出 `style-semantics-merged` trace。
- 接线：`src/components/pipeline/PipelinePanel.vue:2564` 三层统一走 `compileArbitratedStyleContext`；`:4161` 卷纲、`:4449` 章节、`:4736` 正文使用剥离风格后的设定文本。
- 验证：`npx vitest run src/services/pipelineStyleArbiter.spec.ts src/services/pipelineStyleArbiter.wiring.spec.ts` → 5 tests passed；`npm run type-check` → exit 0。

### 阶段 A：模板变量分层路由

- 实现：`src/services/settingsCharacterContext.ts:17` 按步骤路由 home/volume/chapter/body；`src/components/pipeline/PipelinePanel.vue:2493` 替换硬编码 body 投影；`src/components/chat/ChatPanel.vue` 人物拼装收敛到共享函数。
- 验证：`npx vitest run src/services/settingsCharacterContext.spec.ts` → 3 tests passed。
- 说明：ChatPanel 保持原 body 口径，不借重构偷偷改变首页人物注入语义；home 查询过滤能力已单测覆盖。

### 阶段 C：记忆-设定冲突检测

- 实现：`src/services/contextConflictDetector.ts` 按实体名/别名与世界观名归并冲突；`src/components/pipeline/PipelinePanel.vue:4722` 检测，`:4725` 标记覆盖，`:4727` trace，`:4736` 后 prompt 追加 `[上下文优先级]`。
- 修正：冲突检测必须先经 `normalizeSemanticCategory` 单源分类；实体冲突只允许 `character` 卡参与，世界冲突只允许 `world` 卡参与。物品/事件等卡片文本提到实体名不再被误报为实体冲突。
- 验证：`npx vitest run src/services/contextConflictDetector.spec.ts` → 5 tests passed；新增“物品卡提到人物不构成实体冲突”“世界冲突只由世界卡触发”断言。

### 阶段 D：三层预算裁剪

- 实现：`src/services/settingsLayerSemantics.ts:40` volume 1200 / chapter 1500 / body 1800；`:253` 写入 `layer_budget_trim:{section}:{line}`；header/instructions 不参与裁剪；home 不裁。
- 验证：`npx vitest run src/services/settingsLayerSemantics.spec.ts src/services/settingsProjection.spec.ts` → 8 tests passed。

### 全量回归

- `npm run test:services` → 185 files passed / 2081 tests passed。
- `npm run type-check` → exit 0。

### Electron 真实 UI 终验

- 首轮暴露：`context-conflict-detected` 误报 `conflictCount=61`；根因是检测器把 60 张仅提到“王芳”的物品卡也算成实体冲突，见 `src/services/contextConflictDetector.ts` 旧实现的全文关键词配对。
- 修复链：语义分类优先级修正（`src/services/settingsLayerSemantics.ts:150`，显式 category 权威，名称/文本只做未识别兜底）；章节风格档案补 `定位` 小节（`src/services/styleContextCompiler.ts:144`）；冲突检测改为语义单源前置（`src/services/contextConflictDetector.ts:34`）。
- 最终验证：`node scripts/verify-settings-lock-projection-electron.mjs` → `===== SETTINGS LOCK PROJECTION ELECTRON PASSED =====`；卷纲、章节、正文真实 UI 生成均 done。
- 最终证据：`_audit/verification-settings-lock-projection-electron/report.json`，`generatedAt=2026-10-20T14:07:11.549Z`；body trace `context-conflict-detected` 只剩 1 条真实冲突：`人物 - 王芳 - 幽默，风趣，话痨` vs 记忆 `冷静寡言`。
- 定向回归：`npx vitest run src/services/settingsLayerSemantics.spec.ts src/services/settingsProjection.spec.ts src/services/pipelineStyleArbiter.spec.ts src/services/pipelineStyleArbiter.wiring.spec.ts src/services/settingsCharacterContext.spec.ts src/services/contextConflictDetector.spec.ts src/services/styleContextCompiler.spec.ts` → 7 files / 29 tests passed。
- 静态与构建：`npm run type-check` → exit 0；`npm run build:vue` → exit 0。
- 最终全量：`npm run test:services` → 185 files / 2091 tests passed；`npm run type-check` → exit 0。

## 7. 缺口清单

- 已闭环：Electron 真实 UI 验证与最终冲突断言。
- 已闭环：`categoryDistribution` 已改为统计裁剪后 blocks，并以 `settingsLayerSemantics.spec.ts:43` 的“报告裁剪后分类分布”断言锁死，trace 与实际消费文本同口径。
- 已闭环：设定层生成风格路径已显式裁决为“仅风格档案，不吸收设定卡风格”，`PipelinePanel.vue` 使用 `getSettingsGenerationStyleContext()`，并由 `pipelineStyleArbiter.wiring.spec.ts:61` 的接线断言锁死，不构成第二个生成时风格源。
- 已裁决边界：阶段 C 冲突检测仅接正文层，因为只有正文层注入实体/世界记忆；卷纲/章节层未注入记忆，不接检测才不会制造空上下文仲裁。边界由 `contextConflictDetector.spec.ts:82` 的 layer scope 断言锁死。
- 本轮无登记缺口。
