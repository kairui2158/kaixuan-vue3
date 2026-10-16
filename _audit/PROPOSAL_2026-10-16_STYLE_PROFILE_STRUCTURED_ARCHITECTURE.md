# 方案：创作风格档案结构化升级（Style Profile V2）

> 状态：实施版 v2，三个原待确认点已并入方案；待用户批准后执行
> 依据：`神意开发经验总结_v7.md`（当前有效版 v8.12）L0-L2 门禁逐条路由
> 台账：`_audit/TASK_LEDGERS/2026-10-16_style-profile-structured-plan.md`

## 1. 目标与用户可感知行为

原始目标：以用户提供的拆书样品 `D:/codex/拆文库/踏星/.novel/benchmarks/踏星/文风.md` 为基准，研究大纲工作台风格卡片的提升空间，并覆盖客户使用体验与 UI 设计。

最终可感知行为：

1. 客户可以导入一份《文风.md》标准拆书档案，先看到解析预览，再应用为未锁定草稿。
2. 草稿中可以逐条启停句式模式、场景模板、日更规则与警戒线，然后锁定。
3. 锁定后，大纲 / 设定 / 卷纲 / 章节 / 正文 / 终稿按各自职责消费有预算上限的结构化风格块；未锁定仍零注入；本地变换与抽取任务仍豁免。
4. 旧项目、旧锁定档案不发生静默生成效果变化；升级后不出现两套风格注入语义并存。

## 2. 现状与差距

| 面 | 现状 | 证据 | 差距 |
|---|---|---|---|
| 数据模型 | 仅 `styleTags` + `pacingParams` + 五项节奏对象 | `src/stores/project.ts:118-170` | 样品 8 类维度无处存放 |
| UI | 标签池 + 五项节奏 + 锁定 | `src/components/common/StyleProfileCard.vue:12-110` | 无导入、无预览、无逐条启停、无负向约束 |
| AI 分析 | 大纲文本反推两字段 | `src/components/pipeline/PipelinePanel.vue:2387-2478` | 分析对象错位；拆书档案无入口 |
| 注入 | 各层手拼两行字符串 | `OutlineWorkspace.vue:1960-1969`、`volumeGeneration.ts:64`、`chapterExecutionPackage.ts:149-150`、`PipelinePanel.vue:3571-3573` | 无单源编译器、无分层预算、无 trace 注入量 |
| 终稿 | 任务快照 constraints | `OutlineWorkspace.vue:1102-1106` | 新结构未定义快照 schema 与版本 |
| 模板变量 | `{{styleTags}}/{{pacingParams}}` 空值契约 | `realSkillExecutor.spec.ts:1003-1026` | 新变量需兼容扩展且不破契约 |
| trace | `style-profile` 事件 | `OutlineWorkspace.vue:1968` | 新字段、导入事件、导出白名单未定义 |

## 3. 数据模型 V2

`StyleProfile` 增加可选结构化字段，保留全部 V1 字段，不迁移删除：

```ts
profileVersion: 2
positioning: { coreTemperament: string[]; genreTags: string[]; oneLinePositioning: string }
quantitative: {
  sampleSource: string
  dialogueDensityPerKChars: number | null
  sentenceMix: { short: number; medium: number; long: number } | null
  punctuation: { comma: number; period: number; exclamation: number; question: number; ellipsis: number; dash: number } | null
}
voice: { protagonistSpeech: string; dialogueTags: string; subtextDensity: string }
descriptionFocus: { senses: string; sketch: string; psychology: string }
sceneTemplates: StyleRule[]   // {id, text, enabled}
sentencePatterns: StyleRule[] // {id, text, enabled}
positiveRules: StyleRule[]
prohibitions: StyleRule[]
dailyRules: StyleRule[]
```

边界：

- 每个数组上限 12 条，单条 text 上限 240 字符，总档案注入编译后按目标层设字符预算。
- `normalizeStyleProfile` 对所有新字段做类型、长度、非法控制字符清洗；超限条目截断并在导入报告中登记，不静默丢弃。
- `StyleRule.id` 由导入器稳定生成（内容 hash 前缀），锁定、启停、快照、trace 都引用同一 id，满足 G1.17 生命周期对账。

## 4. 导入服务与安全边界（已裁决：严格标准结构）

新增 `src/services/styleBenchmarkImport.ts`：

1. 第一版只解析《文风.md》标准结构（二级标题：定位 / 量化特征 / 声口特征 / 描写侧重 / 场景写法 / 标志性句式模式 / 借鉴边界 / 日更参考）。这是最终实现口径，不做宽松猜字段解析。
2. 产出 `StyleProfileDraftPatch` + `StyleImportReport`：识别的段落、条数、被忽略的行、截断项、错误项。禁止整段原文进入 prompt。
3. 解析失败按段落给具体错误（如“量化特征缺少对话密度”），不猜字段、不宽松兜底。未知二级标题不进入档案，但在导入报告中列出；必须包含 `定位` 与 `声口特征` 两个核心段，缺失任一即解析失败。
4. 导入只允许写入未锁定草稿；锁定档案收到导入请求时返回 `style_locked`，UI 显示原因，trace 记录拒绝事件。
5. 导入预览必须展示“将应用的字段值 + 将启用的规则条数 + 与当前草稿的差异”，用户确认后才应用。

## 5. 注入编译器与预算（已裁决：先建账、后定值）

新增单源编译器 `src/services/styleContextCompiler.ts`，全部出口只允许消费它：

| 目标 | 注入内容 | 实测预算决策 |
|---|---|---|
| outline | 定位 + 标签 + 节奏 + 警戒线摘要 | 600（实测 232） |
| settings | 定位 + 标签 + 场景模板标题 | 500（实测 304） |
| volume | 定位 + 标签 + 节奏 + 正向规则 | 600（实测 219） |
| chapter | 声口 + 句式模式 + 日更规则 | 800（实测 379） |
| body | 声口 + 句式模式 + 场景模板 + 日更规则 + 警戒线 | 1200（实测 767） |
| final-draft | 编译后的 constraints 快照 | 1200（实测 767） |

预算不是拍脑袋值，也不是实施后补案：P0 先对大纲、设定、卷纲、章节、正文、终稿各采样至少 3 条真实代表性 prompt，建立 before/after 长度账，记录每层现有 prompt 分布与窗口路由判定；最终预算在 P0 结束时写入本表并登记 DEV_LOG。表中的 600/500/800/1200 只是初始上限，P0 后以实测账本替换。超预算按优先级裁剪（警戒线 > 日更规则 > 声口 > 句式 > 场景 > 量化），并在 trace 记录 `truncated: true` 与裁剪原因。量化特征只作为参考目标注入，不做机械验收门槛。

## 5A. AI 分析入口同批升级（已裁决：纳入本版）

`analyzeOutlineStyle` 不再停留在 V1 两字段输出，同批升级为结构化分析：

1. 返回 JSON 对齐 V2 schema：`positioning`、`styleTags`、`pacingParams`、可选 `positiveRules`。
2. 证据边界固定：大纲是情节产物，不是正文样品；`voice`、`sentencePatterns`、`sceneTemplates`、`dailyRules`、`prohibitions` 无法可靠从大纲反推，AI 分析不得伪造填充这些字段。分析报告必须列出“证据不足，未填充”的字段。
3. 返回值经与导入服务相同的清洗、长度与条数守卫；非法结构不落库，显示具体解析错误。
4. 保留“从拆书档案导入”作为获得声口、句式、场景、警戒线的主路径；AI 分析与导入是两个入口，同一 schema、同一条清洗管线，不允许两套写入口。
5. 锁定档案同样拒绝 AI 覆盖；未锁定时 AI 结果先进入预览草稿，不直接覆盖当前草稿。

上下文治理遵守 G2.7：风格块计入各层 prompt 构建与上下文预算，不允许在预算管道外裸追加导致窗口误判复发。

## 6. 持久化与生命周期对账（G1.17 四行表）

| 生命周期 | 槽位与路径 | 证据要求 |
|---|---|---|
| 写入 | `project store.styleProfile` → 既有项目持久化；导入写入必须经项目级写队列（G2.8） | 并发导入/自动保存回归测试 |
| 读取 | `styleProfileEffective`、编译器、终稿任务快照 | 读取方只允许单源；禁止组件私拷字段 |
| 清理 | 项目切换 / 新建 / 清空沿用现有 reset 路径，同批清空 V2 字段 | reset 后旧档案字段为空且 trace 不再注入 |
| 终态语义 | 锁定后写路径拒绝；终稿任务完成后快照不再读实时风格 | 二次进入矩阵：新鲜 / 锁定 / 终稿完成后再生成 |

终稿快照新增 `styleProfileVersion` 与 `constraintsHash`；旧任务缺字段时按 V1 语义消费，不补写历史数据（G1.8）。

## 7. UI / 客户体验设计

1. 收起态摘要改为资产摘要：“冷硬快节奏 · 8 条句式 · 5 条日则 · 4 条警戒线”，空态显示两个入口按钮：导入拆书档案 / AI 分析大纲风格。
2. 展开态用四个页签：概览、声口与句式、场景与规则、警戒线。概览页保留现有轻量控件与量化指标条；规则页每行提供启停开关，锁定态全部只读。
3. 导入预览用弹窗：左侧解析结果，右侧将应用值与差异，底部“应用为草稿 / 取消”。失败态列出具体段落错误。
4. 键盘与响应式：页签可 Tab + Enter 切换，focus 可见；窄屏页签横向滚动，卡片展开仍受 `max-height: min(46vh, 420px)` 约束，不挤压大纲输入区。
5. 双视图（大纲工作台、流水线设定层）继续共享同一组件与 store，不允许出现两套卡片逻辑（G1.3）。

## 8. SKILL 中立与模板变量（G2.13）

1. 风格档案只改变提示词与领域能力，不改变工具面、权限、路由、写回协议。
2. 模板变量保留 `{{styleTags}}/{{pacingParams}}`，新增 `{{styleVoice}}`、`{{styleSentencePatterns}}`、`{{styleProhibitions}}`，全部遵守空值契约；未锁定时为空。
3. SKILL 双态验收矩阵：无 SKILL 与真实 UI 选择 SKILL 各一轮，权限、工具面、注入语义必须一致，唯一差异是 SKILL guidance。
4. trace 记录 `styleGuidancePresent`，禁止用注入式冒充（G0.11）。

## 9. 观测与 trace（G1.8 / v8.12）

- `style-profile` 事件扩展：`profileVersion`、各 section 条数、目标层、注入字符数、是否截断、裁剪原因。
- 新增 `style-benchmark-import` 事件：文件名、解析结果、应用/拒绝原因、导入报告摘要。
- 存储类型、入口回填、导出通道、验证器白名单同批升级；验证器断言与采集器同步发布，禁止断言读新字段而采集器不产出。
- trace 只保存结构化摘要与有界预览，不保存全文档案，防滚动膨胀。

## 10. 新旧并存矩阵（G0.10）

| 消费面 | V1 行为 | V2 行为 | 清零条件 |
|---|---|---|---|
| 注入出口 | 各层手拼两行字符串 | 全部改走编译器 | 手拼字符串在生产源码 0 命中 |
| 终稿快照 | 旧 constraints | 新增版本与 hash | 旧任务按 V1 消费并显式标记 |
| 模板变量 | 两个变量 | 五个变量，前两个语义不变 | 旧契约测试同批更新 |
| UI | 标签 + 节奏 | 页签 + 规则启停 | 无并行旧卡片/旧入口 |
| trace | 旧事件字段 | 向后兼容新增 | 导出旧 trace 不补写 |

## 11. 验证矩阵

1. 单测：解析器正/负样本、字段清洗与截断、normalize 兼容、锁定守卫、编译器预算与裁剪优先级、写队列并发、reset 清理。
2. 组件测试：页签渲染、启停开关、锁定只读、导入预览差异、键盘切换、空态入口。
3. 注入测试：六个目标层正/未锁定零注入/超预算裁剪/本地变换与抽取豁免。
4. SKILL 双态：无 SKILL 与真实 UI 选择 SKILL 各一轮，唯一差异为 guidance。
5. Electron 真实 UI（可见窗口、独立 profile、双隔离开关，G1.13）：真实点击导入文件 → 预览 → 应用 → 逐条启停 → 锁定 → 双视图同步 → 持久化重启；失败路径用真实损坏文件验证错误提示。
6. 二次进入矩阵（G1.17）：新鲜启动 / 锁定后再次进入 / 终稿完成后再生成 / 导入失败后再导入。
7. 性能账本（G1.19）：代表性 prompt before/after 长度与字符增量，确认在预算内且不改变窗口路由判定。
8. 回归：`project.spec.ts`、`StyleProfileCard.spec.ts`、`volumeGeneration.spec.ts`、`realSkillExecutor.spec.ts` 同批更新，跑全量服务测试。

## 12. 作者反证与不可验证项（G1.17）

最可能错误的三个假设：

1. “客户的拆书档案都符合标准结构” → 用《踏星》原件 + 3 份变体（缺量化段、段落顺序变化、含未知二级标题）证伪；解析失败必须给出可行动错误。
2. “更丰富的风格块会提升生成质量” → 本任务无法用单测证明，只能验证“注入内容正确且有界”；质量提升标记 `untested`，需后续 live 对照，不得在完成声明中冒充已验证。
3. “预算裁剪不会伤害风格表达” → 用超长档案构造裁剪用例，断言警戒线优先保留且 trace 记录裁剪；无法证明模型主观感受，标记边界。

## 13. 阶段计划与停止条件

| 阶段 | 内容 | 停止条件 |
|---|---|---|
| P0 | 代表性 prompt 长度账 + 最终预算定值 | 六层各 3 条样本；最终预算写入本方案并登记 DEV_LOG |
| P1 | 数据模型 + normalize + 写队列接线 | 单测通过；旧项目加载 V1 语义不变 |
| P2 | 导入服务 + AI 分析升级 + 预览 UI | 正负样本解析测试通过；AI 结构化返回测试通过；锁定拒绝路径通过 |
| P3 | 编译器 + 六层出口迁移 | 手拼注入 0 命中；最终预算与裁剪测试通过 |
| P4 | trace + 模板变量 + 导出 | 采集器与断言同批通过；导出可读 |
| P5 | UI 页签与双视图 | 组件测试 + 可见 Electron 真实 UI 通过 |
| P6 | 回头看 + DEV_LOG + 版本 + 封装 | 台账七节齐；diff 逐行审；工作区干净 |

## 14. 收尾链

DEV_LOG 记录方案与实现、经验文件显式裁决是否升级门禁、版本号升级、`npm run build` 与封装核验、旧产物清理、提交并确认工作区干净。未执行项写入台账缺口清单，禁止省略。

## 15. 成熟度结论

- 执行器/数据层：成熟。schema、解析、写队列、生命周期可明确落地。
- 应用方案/交互闭环：成熟。导入-预览-草稿-启停-锁定-注入-豁免闭环完整；AI 分析与导入共用 schema 和清洗管线。
- 实现接线：成熟。影响圈、新旧矩阵、单源编译器已定。
- 验证标准：成熟。含真实 UI、双态 SKILL、二次进入、负路径与性能账本。
- 生成质量收益：未验证。本方案只能交付“结构化风格正确注入且有界”，质量提升需后续 live 对照；该边界不随三个待确认点的收口而消失。
