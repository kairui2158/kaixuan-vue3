# 内嵌降AI“诊断-路由-回归”升级方案 V1

日期：2026-11-01  
状态：待用户审核；审核通过前不改生产代码  
适用范围：生成流水线正文层内嵌降AI、folder SKILL `meta.deai` 契约、降AI trace 与运行记录、手动降AI入口  
核心原则：**降AI为正文输出质量负责，不争夺正文内容改写权**

## 1. 目标与红线

### 1.1 原始需求

用户对当前内嵌降AI的核心担忧：

> 担心会不会对我们的正文输出质量有重大干预和扰乱；要为正文层的输出质量负责。

用户要求吸收 `story-deslop` 的“编译器式诊断”优点，但不能照搬成一个到处改稿的清理器：

- 保留高效定位能力：行号、列号、规则名、命中片段、修复方向。
- 禁止扩大干预：降AI不得打碎正文结构、不得覆盖 folder SKILL、不得与风格卡片争权。
- 修复必须回归 owner：平台合同归应用，叙事/风格归 folder SKILL，风格唯一 owner 是创作风格卡片。

### 1.2 最终可感知行为

1. 正文生成完成后，应用先出位置化诊断报告，用户和 SKILL 都能看到“哪里、什么规则、多严重、为什么”。
2. 默认行为是“诊断不改稿”：正文原样进入后续验收与交付，blocking 结果只触发路由，不触发文本改写。
3. folder SKILL 声明降AI能力时，应用注入自动退场，由 SKILL 自己承担风格与叙事修复。
4. 需要修复时，按 owner 路由：合同问题回到当前生成步或修复编排；叙事/风格问题交 folder SKILL；确定性格式问题走独立规范化层。
5. 任何修复都必须复扫并输出 before/after 对照；两次干预未清零即停止，保留原稿并报告残留。

### 1.3 不可越过的红线

- 降AI不得成为第二叙事裁判：场景推进、事件增量、动作链、事实漂移归 SKILL verdict（经验 G2.9）。
- 降AI不得改变执行协议、runtime 路由、工具面和写回协议（经验 G2.13）。
- 降AI检测阈值与整体 verdict 保持 `provisional`，只能由样本结构解锁（经验 G1.22）。
- 风格卡片是风格唯一 owner；降AI只消费风格约束，不得反向改写风格语义。
- legacy-auto 与 deep-fix 的旧改稿语义必须走 G0.10 七层清零，不允许新旧并存。

## 2. 现状与断点

### 2.1 检测层

现状：

- `makeFinding` 只有 `id/severity/type/count/perKilo/samples/suggestion`，没有行号、列号、规则名、原文摘录和修复方向：`src/services/de-ai.js:378-388`。
- `detectBody` 已是只读检测，但输出仍是统计摘要：`src/services/de-ai.js:1055-1193`。
- V2 阈值标注为 provisional，且明确受作者/题材误伤影响：`src/services/de-ai.js:63-86`。
- trace 消费面只展示 `ruleHits/issues`，无法定位到正文片段：`src/components/pipeline/PipelinePanel.vue:6200-6219`。

断点：用户无法判断“命中是否合理”，SKILL 无法定点修复，只能整体重写或整体忽略。

### 2.2 改稿层

现状：

- `processBody` 仍是唯一生产改稿入口，legacy-auto 直接替换正文：`src/services/de-ai.js:984-1052`。
- 流水线后处理保留 legacy-auto/detect/deep-fix 三模式：`src/components/pipeline/PipelinePanel.vue:6090-6265`。
- deep-fix 通过 `runBodyMinimalEdit` 直接改写终稿：`src/components/pipeline/PipelinePanel.vue:6220-6264`。
- 手动路径仍有 legacy-auto 和 deep-fix：`src/composables/useDeAi.ts:246-320`、`src/composables/useDeAi.ts:658-672`。
- 模式 store 仍暴露三模式：`src/stores/deai.ts:33-98`。

断点：即使 deep-fix 有变更率门、保护片段和完整性门，它仍是一个“后置第二作者”，与 folder SKILL 和风格卡片存在权力重叠。

### 2.3 契约层

现状：

- `skill-wins` 分支已存在：`src/services/skillDeaiContract.ts:157-164`。
- 默认 `conflictPolicy` 是 `report`，不是 `skill-wins`：`src/services/skillDeaiContractValidation.ts:23-28`。
- `suffix-only` 目前等价 `on`：`src/services/skillDeaiContractValidation.ts:31`。
- 注入策略与 trace 已有：`src/components/pipeline/PipelinePanel.vue:929-968`、`src/components/pipeline/PipelinePanel.vue:3713-3775`。

断点：folder SKILL 已能声明冲突策略，但应用默认仍保留注入权，导致“声明了降AI能力却仍被应用注入挤压”的风险。

### 2.4 可吸收的外部机制

对标 `story-deslop`：

- 退化指纹检测：逐行复读、长句复读、截断、占位符、AI 自指、工程词泄漏：`D:/codex/oh-story-claudecode/skills/story-deslop/scripts/check-degeneration.js:9-62`。
  - 逐行复读：同文件 `188-220`。
  - 截断检测：同文件 `223-236`。
  - 占位符与元信息泄漏：同文件 `239-261`。
  - 工程词泄漏分层：同文件 `63-70`。
- 位置化 finding：`line/column/type/severity/message/excerpt`，天然适合人审与定点修复。
- “报告不改写”原则：脚本只输出证据，修复由 owner 决定。
- 复扫与退出码语义：`blocking` 才是硬门，`advisory` 交给语境判断。

不吸收的部分：

- 不引入“AI身份判定”目标；应用仍不推断作者身份。
- 不引入外挂写手链；修复仍走应用编排和 folder SKILL。
- 不直接移植全部词表；评分/阻断只能使用高置信子集，并保持 G1.22 校准约束。

## 3. 20轮推演记录

### 第1轮：目标对齐

问题：升级目标容易漂成“检测更严”或“清理更狠”。  
推演：用户目标不是杀掉AI味本身，而是保护正文输出质量；检测器越强，误改风险越大。  
结论：目标写成“诊断-路由-回归”，降AI的权限从“写”降为“读”。

### 第2轮：单一裁判

问题：降AI是否需要判断叙事好坏？  
推演：G2.9 已明确叙事有效性归 SKILL，平台合同归应用。若降AI再判叙事，会形成第三裁判。  
结论：降AI只输出表达层与确定性缺陷 findings，不输出叙事 verdict，不阻断叙事语义。

### 第3轮：skill-wins 默认化

问题：folder SKILL 已声明降AI能力时，应用是否继续注入？  
推演：现状默认 `report` 会保留注入；这与“folder SKILL 是活的、可迭代的”冲突。  
结论：Phase 2 将默认值迁移为 `skill-wins`，并按 G0.10 清理旧配置、旧测试和旧文档。

### 第4轮：存量配置迁移

问题：直接改默认值会不会让旧用户配置语义突变？  
推演：G0.10 要求旧持久化数据自动迁移并落盘，覆盖导入保留新语义，磁盘包健康检查阻断旧口径。  
结论：迁移器把未显式配置的 `report` 解释为 `skill-wins`；显式 `app-wins` 保留并在 UI 标注高风险。

### 第5轮：deep-fix 的去留

问题：deep-fix 有保护门，是否可以保留为正式功能？  
推演：即便有门禁，它仍在验收后改写终稿，绕过 SKILL 修复链，容易制造“看似更干净但语义漂移”的稿。  
结论：deep-fix 降级为显式实验开关，先影子观察，再由路由修复接管，最后按 G0.10 退役。

### 第6轮：legacy-auto 的去留

问题：legacy-auto 只做字符级替换，是否足够安全？  
推演：它仍是“应用直接改稿”，且与 SKILL 降AI规则重复，是历史上规则挤压的来源之一。  
结论：与 deep-fix 同批分阶段退役，不允许长期共存。

### 第7轮：findings 位置化

问题：为什么必须加 line/column？  
推演：没有位置，用户无法指认豁免片段，SKILL 无法定点修复，trace 无法做前后对账。  
结论：finding 增加 `line/column/ruleName/excerpt/repairHint`，并保留原有统计字段。

### 第8轮：退化指纹是否并入 de-ai.js

问题：把退化检测加进现有统计器是否更快？  
推演：统计阈值是 provisional，退化指纹是确定性缺陷；混在一起会让误伤校准污染硬缺陷判定。  
结论：独立 `degenerationGuard`，只报告确定性退化，不使用 provisional 阈值。

### 第9轮：修复 owner 路由

问题：检测出 blocking 后谁修？  
推演：合同缺陷（截断、协议泄漏）归应用修复编排；叙事/风格缺陷归 folder SKILL；标点确定性归规范化层。  
结论：建立 finding owner 字段，禁止所有 finding 都涌向同一个修复器。

### 第10轮：规范化层边界

问题：标点规范化是否也算改稿？  
推演：对标 `normalize-punctuation.js`，确定性格式修复可以独立，但必须走保护片段与完整性回对。  
结论：只允许处理省略号、破折号、双连字符等格式缺陷，禁止触碰词汇、句法、段落结构。

### 第11轮：复扫门禁

问题：修复后如何证明没有变坏？  
推演：现有 deep-fix 有变更率与完整性门，但没有统一“复扫对照”。  
结论：修复后强制再跑 `detectBody + degenerationGuard`，输出 before/after findings 差分。

### 第12轮：干预预算

问题：会不会无限修复循环？  
推演：现有硬信号已有两次上限：`src/components/pipeline/PipelinePanel.vue:6645-6663`。  
结论：降AI定向修复每章最多2次，超限保留原稿，登记 `deai_unresolved`，不得继续消耗模型。

### 第13轮：阈值发布口径

问题：位置化后是否可以调阈值？  
推演：G1.22 明确 provisional 只能由样本结构解锁，不能由单测数量解锁。  
结论：阈值、词库、评分权重继续 provisional；blocking 只限确定性缺陷与高置信子集。

### 第14轮：白名单后置

问题：是否现在做用户豁免片段？  
推演：没有位置化 finding，用户无法选择“这一句保留”。  
结论：白名单排在 Phase 2 之后，等 finding 可定位后再设计。

### 第15轮：trace 兼容

问题：新增字段会不会破坏既有导出与回放？  
推演：trace 字段是增量字段，旧回放不消费新字段；但 UI 和导出必须显式展示，否则等于没做。  
结论：新增字段向后兼容；trace 摘要、处理报告、运行记录导出三面同步升级。

### 第16轮：UI 状态

问题：检测报告会不会新增一个阻塞用户状态？  
推演：用户此前明确反对不可操作的等待状态。  
结论：诊断报告是非阻塞信息面，用户可展开查看；不新增暂停等待作者裁定的状态。

### 第17轮：并行流水线影响

问题：诊断是否会拖慢并行生成？  
推演：位置扫描是本地字符串处理，复杂度低于现有检测；但必须避免每章全量 trace 膨胀。  
结论：findings 限量导出，trace 只保存结构化摘要与有界摘录。

### 第18轮：folder SKILL 是活的

问题：应用固定机制是否会把 SKILL 锁死？  
推演：用户明确说明 folder SKILL 会持续测试迭代。  
结论：应用只固定契约与路由，不固定 SKILL 内部规则；手册必须写明字段、合法值、缺失后果和更新步骤。

### 第19轮：分阶段放行

问题：一次性切换风险多大？  
推演：G0.6 要求成熟度结论，G0.10 要求旧语义清零；一次切换无法证明。  
结论：Phase 1 只观测；Phase 2 接管路由；Phase 3 退役旧模式；每阶段独立验收。

### 第20轮：反向质询

问题：该方案最可能错在哪？  
推演：

- 若 skill-wins 迁移不彻底，会出现 SKILL 与应用同时注入。
- 若 findings 位置计算错误，会误导 SKILL 修错片段。
- 若退化指纹误判对白复沓，会误伤网文合法节奏。
- 若复扫只报数量不报差异，修复质量不可证。
- 若 legacy-auto 残留测试守护旧行为，G0.10 未闭环。

结论：每项都进入验收门禁；未过门禁不得进入下一阶段。

## 4. 实施方案

### Phase 1：影子观察与诊断升级（不改生成行为）

目标：先把“看得见”做好，不改变任何正文输出。

任务：

1. `makeFinding` 增加 `line/column/ruleName/excerpt/repairHint`，保留原字段：`src/services/de-ai.js:378-388`。
2. 新增 `degenerationGuard` 模块，检测逐行复读、长句复读、截断、占位符、AI 自指、工程词泄漏；输出与 `detectBody` 同构 findings。
3. trace 与处理报告同步消费位置化字段：`src/components/pipeline/PipelinePanel.vue:6200-6219`。
4. 检测报告 UI 展示行号、列号、规则名、摘录、severity；保持非阻塞。
5. 复扫对照逻辑先以影子模式运行：记录 before/after findings，但不影响正文。

验收：

- 单测：位置计算、对白豁免、截断、工程词分层、trace 序列化。
- 回放：至少1份真实正文 run-trace，证明新增字段可见且旧字段不丢。
- 行为断言：Phase 1 下正文输出与升级前逐字节一致。

### Phase 2：路由修复接管与 skill-wins 默认化

目标：把修复权交还 owner，应用停止默认改稿。

任务：

1. finding 增加 `owner`：
   - `app-contract`：截断、协议泄漏、工程词 tier1、平台合同缺陷。
   - `skill-narrative-style`：表达、风格、叙事建议。
   - `normalize-format`：确定性格式问题。
2. 修复路由：
   - `app-contract` 进入当前步修复编排或候选回退，不直接改写成品。
   - `skill-narrative-style` 生成 SKILL 修复任务包，携带 finding 位置与失败指标，不携带全文强先验。
   - `normalize-format` 走保护片段 + 完整性回对的独立规范化层。
3. `conflictPolicy` 默认值迁移为 `skill-wins`：`src/services/skillDeaiContractValidation.ts:23-28`。
4. 存量配置迁移：未显式选择按新默认处理；显式 `app-wins` 保留但 UI 标注高风险。
5. 修复后复扫：输出 before/after findings 差分，blocking 清零或登记残留。
6. 干预预算：每章最多2次定向修复，超限保留原稿并登记 `deai_unresolved`。

验收：

- skill-wins 迁移五证：旧持久化自动迁移落盘、旧磁盘包健康检查阻断、覆盖导入保留新语义、执行面消费磁盘权威源、物理请求不再出现旧语义。
- 路由测试：每类 owner 至少一条正向与一条负向断言。
- 真实 run-trace 回放：证明修复任务包包含位置与指标，且不携带候选全文。
- UI 验证：真实点击查看诊断与修复结果，不得脚本注入冒充交互。

### Phase 3：旧改稿语义退役

目标：清零 legacy-auto 与 deep-fix 的生产改稿入口。

任务：

1. `legacy-auto` 从生产入口、store、UI、持久化、文档、测试、构建产物中退役。
2. `deep-fix` 降为开发实验入口或彻底移除，由路由修复接管。
3. 手动降AI入口改为“诊断报告 + 显式导出任务包”，不再提供一键改稿。
4. 手册更新：folder SKILL 降AI契约、字段清单、合法值、最小示例、缺失后果、更新步骤。
5. 按 G0.10 七层清零：源码、测试、脚本、规格、日志、运行状态、构建产物。

验收：

- `rg` 旧模式名在生产入口命中 0；测试中的负向断言不等于执行残留。
- 旧配置自动迁移并落盘。
- 全量回归、类型检查、真实 UI 验证通过。
- 运行记录中不再出现旧 processor 名。

## 5. 影响圈矩阵（G0.9 七面）

| 面向 | 打算改的 | 可能碰到的 | 验收 |
|---|---|---|---|
| 生产入口 | `detectBody`、`processBody` 调用点、流水线后处理 | 正文生成、终稿、手动降AI | 行为断言与 trace 回放 |
| 服务层 | findings 结构、degenerationGuard、契约默认值 | runTrace 序列化、skillDeaiContract | 单测 + 契约测试 |
| UI | 诊断报告展示、模式选择、修复结果 | 进度条、运行记录导出 | 真实 UI 点击验证 |
| 测试 | de-ai、契约、流水线、trace、导入迁移 | 旧模式守护用例 | 正向 + 负向断言 |
| 脚本 | 无新增临时脚本；验证脚本须有路径守卫与输出 | packaging / trace 回放 | 原始输出留存 |
| 规格文档 | folder SKILL 手册、降AI说明 | meta.deai 契约 | 四件套对账 |
| 日志/trace | findings 位置、owner、复扫差分 | 导出兼容与膨胀 | 有界摘录 + 旧回放兼容 |

## 6. 验证计划

1. 定向单测：findings 位置、退化指纹、owner 路由、skill-wins 迁移、复扫差分。
2. 契约测试：`meta.deai` 四件套，真实消费点、测试锚定、手册说明、主/渲染进程一致性。
3. run-trace 回放：使用最近真实正文 trace，验证新字段、旧兼容、修复任务包。
4. 真实 UI 验证：用户路径点击查看诊断、执行路由修复、查看 before/after。
5. 回归：`npm run type-check`、全量 Vitest、封装前置检查。
6. 交付前回头看：逐行 diff、生产入口与旁路扫描、日志与测试证据对账。

## 7. 成熟度结论（G0.6）

- 执行器/工具层：**成熟**。检测、路由、复扫均有明确现有锚点，不依赖未存在的基础设施。
- 应用方案/交互闭环：**成熟**。非阻塞诊断、owner 路由、复扫对照、预算封顶形成闭环。
- 实现接线：**成熟，但必须分阶段执行**。Phase 1/2/3 均有独立放行条件，不允许跳阶段。
- 验证标准：**成熟**。包含单测、契约、trace 回放、真实 UI、全量回归与 G0.10 七层清零。

总体结论：**方案成熟，可分阶段执行**。阈值与整体 verdict 继续 provisional，不得因本方案解除。

## 8. 决策点

1. **skill-wins 默认化迁移策略**
   - 建议：未显式配置迁移为 `skill-wins`；显式 `app-wins` 保留并标注高风险。
2. **deep-fix 影子观察期**
   - 建议：至少跑 20 章真实生成对照，观察 blocking 下降率、误改率、残留率后再裁决。
3. **干预预算 N**
   - 建议：N=2，与现有硬信号修复上限一致：`src/components/pipeline/PipelinePanel.vue:6645-6663`。
4. **legacy-auto 退役时间点**
   - 建议：Phase 2 验收通过后立即退役，避免与路由修复并存超过一个发布窗口。

## 9. 本轮边界

- 本轮只交付方案、台账、DEV_LOG 与主索引登记。
- 不改生产代码、不升版、不封装、不提交 git。
- 不修改 folder SKILL 目录；SKILL 侧适配待用户审核后另出 handoff。
