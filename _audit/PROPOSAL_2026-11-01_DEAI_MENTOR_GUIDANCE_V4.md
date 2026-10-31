# 内嵌降AI“方法指导者”方案 V4

日期：2026-11-01
状态：待用户审核；审核通过前不改生产代码
前置：`_audit/PROPOSAL_2026-11-01_DEAI_MENTOR_GUIDANCE_V3.md`
范围：生成流水线正文层内嵌降AI、folder SKILL `meta.deai` 契约、流水线 UI、trace、测试守护
明确排除：应用手动“去AI味”功能、`DeAiSettings.vue`、`EditorPanel.vue` 去AI味按钮、`useDeAi.ts`、`deai.ts` store
核心定位：**只做方法指导者。生成前教方法，生成后给位置化教学反馈；不改稿、不裁判、不评分、不阻断叙事**

## 0. V4 升级结论

V3 的方向保留，但第 9 节 21 轮推演不合格：多处只回答“会有风险，因此新增断言”，没有把风险变成可验证的停机条件。V4 按用户要求把 21 项全部重写为“机制、证据、断言、停机条件”四件套，并用源码反推修正了 V3 的四处失真：

1. 流水线对手动 store 的纠缠不止 `hardRuleMode/hardRules`，还包括 `hardruleEnabled` 读取和 `setLastDetectReport` 写回。隔离清单从 3 项扩为 4 读 1 写。
2. 当前 overlap 检测是 11 个中文关键词的字面交集，不是 V3 描述的“元数据声明 overlap 清单”。V4 不能把这个能力写成现状。
3. `finalStepDetection: off` 的真实断链在 `realSkillExecutor.ts:526-528`：终步 findings 只在 `role=polish` 且 `deaiDetection=on` 时生成。正常终步路径根本不消费这个开关。只加负向测试不够，必须先修接线再测。
4. `suffix-only` 现在由 `SUFFIX_ONLY_EQUIVALENT_MODE='on'` 显式等价。契约 V2 若要让它与 `on` 分叉，必须走独立迁移门禁，不能只在文档里改一行。

## 1. 用户裁决与不变式

1. 两套降AI严格区分：流水线内嵌降AI不读取、不写入手动 store；手动功能保持原状。
2. 旧内嵌降AI完整退场：三段提示词、`legacy-auto/deep-fix` 执行路径、跨 store 状态全部退役。
3. 角色唯一化：应用只做方法指导者，不做改稿器、裁判器、评分器。
4. 效率保护：本地构造零额外 API 请求，预算硬约束，影子对比不达标不得进入生产接管。
5. 应用体现：流水线徽章、步骤日志、运行记录反馈面板；不新增用户配置和阻塞状态。

硬不变式：

1. 指导包只进入 prompt，不修改请求产物。
2. 教学反馈不携带候选全文，不改稿，不改终态，不触发重试。
3. 叙事 verdict 归 folder SKILL，平台合同归应用，同一维度只有一个裁判。
4. 历史数据保持可读，执行层停止新增旧语义。
5. 风险处置必须有停机条件，没有停机条件的“观察项”不允许进入实施。

## 2. 现状证据

1. 共享状态读取：`src/components/pipeline/PipelinePanel.vue:6091`、`:6093`、`:6099`、`:6103` 读取 `hardruleEnabled/hardRuleMode/hardRules`；`:6176` 调用 `deAiStore.setLastDetectReport`，会污染手动功能“最近检测报告”。
2. 改稿路径：`:6105` 在 `legacy-auto` 时调用 `DeAiProcessor.processBody` 改写 `finalBody`；`:6220-6223` 在 `deep-fix` 时调用 `runBodyMinimalEdit`；真实执行器在 `:6369-6500`，包含 API 调用、变更率门禁、保护片段检查，退场清单必须覆盖它。
3. 旧提示词：`src/services/de-ai.js:1222-1267` 三段链步提示词经 `resolveDeaiPromptForChainStep` 分发。
4. overlap 现状：`src/services/skillDeaiContract.ts:118-127` 是 11 个中文关键词；`:145-146` 用 `includes` 做字面交集，无法捕捉换词后的同义重复。
5. 契约现状：`src/services/skillDeaiContractValidation.ts:30` 定义 `SUFFIX_ONLY_EQUIVALENT_MODE='on'`；`src/services/skillDeaiContract.spec.ts:70` 断言该等价。
6. 终步断链：`src/services/realSkillExecutor.ts:526-528` 中 findings 只在 `finalStepRetry.role==='polish'` 且 `deaiDetection==='on'` 时计算；`realSkillExecutor.spec.ts:1830` 的 off 用例只覆盖该分支，不覆盖正常终步。
7. 文档-测试-实现三方绑定：`src/components/pipeline/__tests__/deai-injection-policy.spec.ts:22-30` 同时读取手册、`PipelinePanel.vue`、`DeAiSettings.vue` 做字符串断言；契约改动必须三方同批。
8. 测试位置耦合：`src/services/proseHardSignalWiring.spec.ts:9` 依赖 `deAiStore.hardruleEnabled` 在源码中的出现位置；隔离改造必须同批迁移该断言，否则会因移动读取点而误红或误绿。
9. 效率观测基础：`src/stores/runTrace.ts:197`、`:322-323`、`:375`、`:384` 已有 timingLedger、firstTokenMs、physicalDurationSumMs、schemaRetryCount；`:2269-2357` 已做汇总，不新建观测面。

## 3. 21 项风险清零推演

每项格式：机制、证据、断言、停机条件。结论只有“不会”允许进入生产接管。

### 1. 两套系统会不会继续纠缠？

机制：Phase A 第一动作切断流水线对手动 store 的全部读路径，并移除 `setLastDetectReport` 写回。流水线行为只由正文层 contract 与 `meta.deai` 决定。

证据：当前 4 个读点为 `PipelinePanel.vue:6091,6093,6099,6103`；1 个写点为 `:6176`；手动侧另有 `useDeAi.ts:283,334` 正常写回，不动。

断言：隔离测试中手动 store 分别置为 `legacy-auto/deep-fix/detect-report`，流水线 requestMessages、正文产物、终态全部一致；源码负向断言 `PipelinePanel.vue` 不含 `deAiStore.hardruleEnabled`、`deAiStore.hardRuleMode`、`deAiStore.hardRules`、`setLastDetectReport`。

停机条件：任一断言失败或发现第 5 个读点/第 2 个写点，Phase A 停止，禁止进入 Phase B。

### 2. 只做指导者会不会退回改稿？

机制：指导包是 immutable prompt 文本；教学反馈只读产物。流水线中所有会改写 `finalBody` 的降AI调用全部退场。

证据：改写点为 `PipelinePanel.vue:6105` 与 `:6223`；执行器 `runBodyMinimalEdit` 定义于 `:6369-6500`。

断言：执行层源码中流水线路径不再调用 `DeAiProcessor.processBody` 与 `runBodyMinimalEdit`；测试断言 `finalBody === rawExtractedBody` 在 legacy/deep/detect 三种历史模式迁移后均成立。

停机条件：任一旧执行入口仍可达，Phase C 禁止开始；若发现新的 `processBody` 流水线调用点，回滚到隔离完成态。

### 3. 效率会不会变差？

机制：每步 6 条、1200 字符、本地构造 5ms warning 线；反馈构造复用既有检测结果，禁止重复全文扫描；影子期 20 章、2 题材、2 模型配对对比。

证据：效率字段已有基础：`runTrace.ts:197,322-323,375,384,2269-2357`。

断言：指导包构造耗时入 trace；配对样本必须同模型、同题材、同章节；中位端到端耗时或 first token 劣化超过 10% 时自动降条数 6→4→3 并复测。

停机条件：降到 3 条仍超过 10%，Phase B 延期；禁止放宽合同验收换效率。

### 4. 手动功能会不会受影响？

机制：手动链路不改代码；共享检测器只做纯函数复用，全部显式入参；流水线不传 store 值。

证据：手动链路为 `EditorPanel.vue:35`、`DeAiSettings.vue:14-28`、`useDeAi.ts:246-369`、`deai.ts:64-140`。

断言：手动路径调用 `detectBody/processBody` 时配置来自自身显式入参；流水线传入的是 run 级 options；双向负向测试证明互相改配置不影响对方。

停机条件：手动回归或 UI 验证失败，Phase A 停止；禁止用“共享默认值”解决冲突。

### 5. SKILL 迭代会不会被锁死？

机制：`guidanceOwnership=skill` 时应用注入空指导包，只写观测 trace；contractVersion 版本化，未知版本导入预检报错并进入兼容读模式。

证据：当前契约版本 1，默认值见 `skillDeaiContractValidation.ts:26-30`。

断言：skill ownership 下 requestMessages 不含应用指导文本；SKILL 升级模板后应用不因模板变化失败；契约 V2 测试覆盖 ownership、未知版本、默认推导。

停机条件：ownership 语义与 `conflictPolicy` 推导冲突，或预检阻断导致既有包不可用，冻结契约 V2 直到澄清。

### 6. overlap 会不会漏？

机制：不宣称语义级 overlap。Phase A 保留关键词初筛并 trace 留痕；契约 V2 新增 `overlaps` 数组，允许 SKILL 显式声明冲突域。省略依据写入 trace：`keyword` 或 `declared`。漏判风险只被降级为“可见”，不允许宣称清零为语义级。

证据：现状为 `skillDeaiContract.ts:118-127` 关键词表、`:145-146` 字面交集。

断言：关键词命中时 trace 有省略项；`overlaps` 声明时按声明省略；两者同时存在时取并集且 trace 可对账；没有声明且关键词未命中时 trace 记录 `overlapDetection: keyword-lite`。

停机条件：若实现者试图把 keyword-lite 包装成语义级判断，或省略项不可从 trace 还原，Phase B 禁止接管。

### 7. 教学反馈会不会诱导复述？

机制：反馈不携带候选全文；位置摘录每条不超过 120 字符、最多 5 条；反馈说明“这是阅读效果观察，不是重写要求”。

证据：V2 事故中旧稿全文回传会诱导复述；当前反馈上限为方案新约束。

断言：构造器单元测试断言无候选全文、摘录长度、条数上限；集成测试断言 retry 请求中不含候选全文。

停机条件：任一测试失败停止 Phase B；出现“完整保留上一版”类反馈文案时同样停止。

### 8. 语义 advisory 会不会变裁判？

机制：advisory 不进入失败码，不进入 retry decision，不改 acceptance status，不改终态。

证据：当前 `SkillDeaiMeta` 无 advisory 契约字段，V4 明确不把 advisory 契约化，避免制造第二裁判。

断言：负向测试注入 advisory findings，断言 verdict、retry、status、finalBody 均不变；源码断言 advisory 不参与终态计算。

停机条件：advisory 出现在任何终态/重试布尔表达式中，Phase B 停止。

### 9. 旧语义会不会残留？

机制：G0.10 七层清零；先建新语义，再同批迁移测试，再删执行面，最后清构建产物。

证据：测试守护面至少包括 `de-ai.spec.ts`、`skillDeaiContract.spec.ts`、`deaiChainVariantIntegration.spec.ts`、`deai-voice-profile-injection.spec.ts`、`deai-injection-policy.spec.ts`、`runTrace.spec.ts`；另加 `proseHardSignalWiring.spec.ts:9` 的位置耦合断言。

断言：执行层 `rg` 旧语义为 0；历史 trace 只保留兼容读；安装包扫描不含旧语义；旧持久化迁移、旧包健康检查、覆盖导入、磁盘权威源、物理请求五证齐全。

停机条件：七层任一层未清零或五证缺一，禁止封装。

### 10. trace 会不会膨胀？

机制：指导 trace 只存结构化摘要：版本、步骤、条数、字符数、ownership、省略项、构造耗时、hash、反馈摘要。不重复保存提示词全文。

证据：现有 run trace 已有 `timingLedger` 汇总结构，见 `runTrace.ts:2269-2357`。

断言：trace 字段上限测试；单 run 指导相关新增字段小于固定预算；导出 deep/standard 均不含重复全文。

停机条件：单 run 新增体积超预算或重复保存全文，Phase A 停止。

### 11. UI 会不会误导用户？

机制：徽章、日志、反馈面板显示的条数/字符数/省略数来自实际 trace 值，不做静态文案；反馈标签固定 `informational-only`。

证据：当前 UI 入口在 `PipelinePanel.vue` 正文层徽章与日志区域。

断言：UI 测试与真实 UI 验证对照 trace 数值完全一致；skill ownership 下显示“SKILL 自有方法，应用仅观测”。

停机条件：显示值与 trace 值不一致，或用户可解读为“必须处理/自动改稿”，Phase B 禁止发布。

### 12. 多流水线并发会不会受影响？

机制：指导包为 run 级 immutable 对象；本地构造无锁、无全局状态、无异步 IO。

证据：并行架构已由 V3.3 并行方案建立；新增面不写共享 store。

断言：并发单测两个 run 配置不同指导包，各自 requestMessages 与 trace 互不污染；禁用全局可变模块状态。

停机条件：并发测试失败或发现全局可变状态，Phase A 停止。

### 13. 是否影响终步检测？

机制：先修接线断链。正常终步与 polish retry 两条路径都消费 `finalStepDetection`，且只控制教学反馈生成，不改终态。

证据：断链在 `realSkillExecutor.ts:526-528`；现有 off 测试只覆盖 `role=polish` 分支。

断言：新增正常终步路径测试：`off` 时无 app-owned findings，`on` 时有 findings；两条路径终态一致；契约手册同步修正，不再说“已有完整断链”。

停机条件：接线修复后仍存在不消费开关的路径，或 off 导致终态变化，Phase B 停止。

### 14. 会不会新增等待状态？

机制：无用户裁定队列、无弹窗、无暂停态；反馈面板可折叠且默认不打断流程。

证据：应用已有并行进度模型，不新增人工 gate。

断言：状态机测试断言不新增 pending 用户输入状态；反馈生成不 await 用户操作。

停机条件：引入任何用户等待或暂停状态，Phase B 停止。

### 15. 手动与自动 trace 会不会混淆？

机制：pipeline guidance trace 与手动 DeAi trace 分类型、分导出 section；字段前缀区分。

证据：现有 trace 类型体系在 `runTrace.ts`；手动链路有独立 `useDeAi.ts` 工作流。

断言：导出测试证明两种 section 独立；字段查询不会把手动报告误认为流水线反馈。

停机条件：导出重叠或类型混淆，禁止 Phase B。

### 16. 检测器复用会不会传语义？

机制：共享检测器改为纯函数边界；若需要行为开关，拆成两个显式入口。禁止函数内部读 store 或读全局默认。

证据：`DeAiProcessor.detectBody` 已由两侧使用；手动侧配置来自 `deai.ts:64-140`。

断言：隔离测试改 store 不影响流水线；双向测试证明配置只在调用方发生；源码负向断言共享服务不 import store。

停机条件：共享工具引入隐式默认值或 store import，Phase A 停止。

### 17. 效率数据会不会不可信？

机制：配对协议写入测试与数据表：同模型、同题材、同章节、同供应商、同参数，只在“有无指导包”上分叉；至少 2 模型交叉。

证据：可直接复用 `runTrace.ts:197,322-323,375,384,2269-2357` 的计时与重试字段。

断言：影子数据表必须含配对键；无配对键的样本不得进入结论；供应商波动记录为环境字段。

停机条件：样本不满足配对结构，结论保持 provisional，禁止接管。

### 18. 回退会不会带回旧语义？

机制：feature flag 只有三个状态：`mentor`、`off`、`skill-only`。`off` 表示无应用教学注入，`skill-only` 表示应用退让。不存在映射回 `legacy-auto/deep-fix` 的状态。

证据：旧执行器 `runBodyMinimalEdit` 在 `PipelinePanel.vue:6369-6500`，必须在 Phase C 删除而不是注释保留。

断言：状态机单测枚举 flag 值；回退测试证明任何 flag 值都不触发 `processBody/runBodyMinimalEdit`；执行层 `rg` 无旧语义。

停机条件：任何回退路径可恢复旧执行器，Phase C 禁止完成。

### 19. 文档会不会超前实现？

机制：文档-测试-实现三方同批变更；手册只写已发布行为；每条承诺绑定测试名或 trace 字段。

证据：`deai-injection-policy.spec.ts:22-30` 已把手册、`PipelinePanel.vue`、`DeAiSettings.vue` 绑定为字符串断言。

断言：契约 V2 更新必须同批更新该 spec、指导手册、经验文件、开发日志；文档中出现的行为必须能指向测试或 trace 字段。

停机条件：文档出现未实现行为，或测试仍断言旧文档文本，禁止 Phase B/C。

### 20. 零 diff 会不会不可信？

机制：Phase A 是“构造影子”而不是“LLM 重跑比较”。同一请求对象在旧注入路径与指导包路径下断言输出逐字节一致；不在采样 LLM 输出上宣称零 diff。若指导包尚未注入生产，则 prompt 输出必须完全一致。

证据：LLM 输出天然非确定，不能用两次生成是否相同证明机制零影响；必须比较确定性构造物。

断言：同输入下 prompt builder 输出 hash 一致；已注入路径的 requestMessages 一致；发现任何非指导包差异立即停止。

停机条件：确定性构造物 diff 非零，Phase A 停止；不得用“概率上看起来一样”继续。

### 21. 反向质询：V4 自己的残余风险是什么？

机制：V4 不宣称“绝对无风险”，而是把残余风险登记并给停机条件。

证据：A 对应 `skillDeaiContract.ts:118-146` 的关键词边界；B 对应影子样本尚未生成；C 对应 `deai-injection-policy.spec.ts:22-30` 的导入预检与文档绑定；D 对应 UI 展示值尚未实施，须从 trace 实值渲染。

残余风险 A：`overlaps` 语义无法穷尽，keyword-lite 只能保证可见与可对账。
残余风险 B：教学效果本身需要真实样本验证，影子期前保持未验证。
残余风险 C：契约 V2 会触碰导入预检，需要旧包兼容读策略。
残余风险 D：UI 数值一致性依赖 trace-to-props 链路，必须真实 UI 验证。

断言：四项各自有对应停机条件；方案文档不得把 provisional 项写成已验证。

停机条件：任何残余风险没有停机条件，方案退回重写，不进入实施。

## 4. 实施阶段

### Phase A：隔离与确定性影子

1. 切断 4 读 1 写的跨 store 纠缠。
2. 修 `finalStepDetection` 正常终步接线。
3. 新增指导包构造器与指导 trace 摘要。
4. 建立确定性零 diff 影子与并发隔离测试。

门禁：隔离负向断言、正常终步 off/on 测试、确定性零 diff、并发测试、手动功能回归全部通过。失败即停止，禁止进入 Phase B。

### Phase B：教学接管与契约 V2

1. 指导包替换旧三段提示词。
2. 教学反馈进入运行详情与 trace。
3. 契约 V2：`guidanceOwnership`、`overlaps`、版本化预检。
4. UI 徽章、日志、反馈面板按 trace 实值显示。

门禁：21 项断言全部落地；文档-测试-实现三方同批；advisory 负向断言；UI 真实交互验证；配对影子数据达标。

### Phase C：旧语义七层清零

1. 删除旧提示词与改稿执行器。
2. 同批迁移测试，含 `proseHardSignalWiring.spec.ts` 位置耦合断言。
3. 清理 trace 执行层写入、文档、构建产物。
4. 五证验收与封装扫描。

门禁：执行层旧语义 `rg` 为 0；五证齐全；全量回归、类型检查、UI 验证、安装包扫描通过。

## 5. 验证矩阵

1. 单元：预算、ownership、overlap 省略、advisory 非裁判、trace 上限。
2. 集成：S1/S2/S3 requestMessages、agent 路径真实传入 `meta.deai`、终步 off/on 两条路径。
3. 隔离：4 读 1 写负向断言、双向配置互不影响。
4. 并发：两个 run 指导包互不污染。
5. 影子：20 章、2 题材、2 模型配对数据；效率劣化超 10% 降条数复测。
6. UI：徽章、日志、反馈面板与 trace 实值一致，真实交互验证。
7. 清零：七层 `rg`、五证、安装包扫描。
8. 文档：手册承诺逐条绑定测试或 trace 字段。

## 6. 决策点

1. Phase A 是否按“4 读 1 写”先隔离：建议是。
2. `finalStepDetection` 是否先修接线再测：建议是。
3. overlap 是否以 keyword-lite + declared overlaps 组合推进：建议是，不宣称语义级。
4. `suffix-only` 是否进入契约 V2 分叉：建议待 Phase A 完成后由五证决定，Phase A 不改语义。
5. 教学反馈上限是否为 5 条、每条 120 字符：建议是。
6. 零 diff 是否限定为确定性构造物：建议是，不承诺 LLM 输出零 diff。

## 7. 本轮边界

- 本轮只新增 V4 方案、台账、开发日志、主索引登记，并给 V3 台账加指向。
- 不修改生产代码。
- 不升版、不封装、不提交 git。
- 不改手动去AI味功能。
- 不解除 provisional 校准状态。
- 不替 folder SKILL 生成或修改模板。
