# 内嵌降AI“方法指导者”方案 V4.1

日期：2026-11-01
状态：待用户审核；审核通过前不改生产代码
前置：`_audit/PROPOSAL_2026-11-01_DEAI_MENTOR_GUIDANCE_V4.md`
范围：生成流水线正文层内嵌降AI、folder SKILL `meta.deai` 契约、流水线 UI、trace、测试守护、技能导入预检
核心定位：**只做方法指导者。生成前教方法，生成后给位置化教学反馈；不改稿、不裁判、不评分、不阻断叙事**

## 0. V4.1 升级结论

V4 的 21 项四件套保留，本版不推翻重写，只做两件事：

1. **补入 V4 审计出的 10 个漏项**，每项同样按“机制、证据、断言、停机条件”落地，不允许只登记不处置。
2. **新增执行条例**。用户已明确指出系统性病灶：方案写得好，执行时缺漏、闭环缺失。V4.1 不再把执行约束停留在经验文件口号层，而是把每个 Phase 拆成带编号、验收标准、预写验证命令的 Task 单元；任何 Task 没有原始验证输出，状态只能是未完成。

V4.1 的排除边界同步修正：手动去AI味功能本体仍不动，但设置页观测逻辑存在“消费流水线事件未按 source 过滤”的混源缺陷，属于双向隔离修复面；修复方式限定为只读过滤，不改变手动检测、改稿、配置、trace 功能本体。

## 1. 执行条例

### 1.1 Task 单元

每个 Phase 拆成 Task 单元，编号规则 `A1/A2/B1/...`。每个 Task 必须包含：

1. 目标一句话。
2. 改动文件清单。
3. 验收标准，逐条机器可判定。
4. 预写验证命令与期望输出，执行前写死，禁止事后补写。
5. 负向断言，证明旧路径或干扰路径不存在。

### 1.2 执行对账表

每个 Phase 结束时更新台账中的五列对账表，列为：方案条文、实施文件、验证命令、原始输出、状态。任何一行缺原始输出，该 Task 状态只能是 `未完成`；禁止用“测试通过”四个字替代输出截断。

### 1.3 中断恢复协议

每完成一个 Task 立即更新台账状态。恢复执行时不允许凭记忆续做，必须先读台账，从第一个非完成 Task 继续；若上一 Task 未有原始输出，先补验证再前进。

### 1.4 回头看清单

每个 Phase 收尾执行：

1. 逐行审 `git diff`，每行归入某个 Task。
2. 生产入口与旁路双向扫描：正向验证新入口生效，负向 `rg` 验证旧入口不可达。
3. 新旧语义清零扫描，覆盖源码、测试、脚本、规格、日志、运行状态、构建产物七层。
4. 文档、测试、实现三方同批对账，任何一方仍描述旧行为即未闭环。
5. 手动功能回归面必须显式列出并执行，不允许因“未改动”而跳过。

### 1.5 违例即停

出现以下任一情况，当前 Phase 停止并登记缺口，禁止带病前进：Task 无预写验证、验证命令被临时改宽、负向断言缺失、台账空白节、发现影响圈外文件被修改且无法归入某个 Task。

## 2. V4 补入的 10 个漏项处置

### L1. 双向隔离缺半边

机制：`DeAiSettings.vue` 的 `latestDeaiObservations` 扫描全部 runs，消费流水线事件时未按 `source` 过滤；手动事件 `source:'home'`（`useDeAi.ts:623`）与流水线事件混在同一观测面板。Phase A 增加只读 source 过滤，手动面板只消费 `home`，流水线观测只消费 `pipeline`。

证据：`src/components/settings/DeAiSettings.vue:321-359`、`src/composables/useDeAi.ts:623`。

断言：双向测试分别注入 home/pipeline 同名事件，两个观测面各自只显示本侧事件；手动检测、改稿、配置、手动 trace 不变。

停机条件：过滤实现改变手动功能任何行为，或流水线事件仍泄漏进手动面板，Phase A 停止。

### L2. blocking 第二裁判

机制：当前降AI检测把 blocking findings 写入 attempt errors，并以 `blocking === 0` 决定 success（`PipelinePanel.vue:6177-6187`）；`deaiObservationEvents.ts:62-88` 又把 style-drift blocking 升级为 warn。这与“应用只做方法指导者、不做裁判”冲突。V4.1 明确：教学反馈不进入 errors、success、retry、终态；blocking 语义在流水线路径退场。

证据：`src/components/pipeline/PipelinePanel.vue:6177-6187`、`src/services/deaiObservationEvents.ts:62-88`。

断言：负向测试注入 blocking findings，attempt success、errors、retry、finalBody、终态全部不变；trace 仅保留 informational-only 观测。

停机条件：blocking 出现在任何终态或重试布尔表达式，Phase B 停止。

### L3. 声纹预算缺口

机制：V4 的 6 条/1200 字符预算没有计算 `DEAI_VOICE_PROFILE_BUDGET = 700`；且 `runBodyMinimalEdit` 路径二次注入 voice profile。总注入预算改为：指导包 1200 + 声纹 700 = 1900 字符硬上限，trace 分项记录；`runBodyMinimalEdit` 随 Phase C 退场后不再产生二次注入。

证据：`src/services/deaiVoiceProfile.ts:32`、`src/components/pipeline/PipelinePanel.vue:6223,6369-6500,6404`。

断言：单元测试断言总预算与分项预算；trace 记录 guidanceChars、voiceProfileChars、totalInjectionChars；任何组合超过 1900 即失败。

停机条件：预算测试失败或 trace 分项缺失，Phase B 停止。

### L4. step:4 多点耦合

机制：正文层编号 4 硬编码在多处。V4.1 引入共享常量 `BODY_LAYER_STEP = 4`，由单一事实源导出，消费点统一引用；不改变现有步骤编号，只消除漂移风险。

证据：`src/services/de-ai.js:1254`、`src/services/skillDeaiContract.ts:97`、`src/components/settings/DeAiSettings.vue:345`、`src/components/pipeline/PipelinePanel.vue:2680,6404,6549`。

断言：负向 `rg` 断言执行层不再出现裸 `step === 4` / `step !== 4` / `step: 4` 字面量（测试源码中的负向断言除外）；共享常量单测。

停机条件：任一消费点仍用字面量且无法归入测试守护，Phase A 停止。

### L5. HelpGuide 与文档面

机制：帮助文档与徽章 tooltip 必须与实际指导者行为一致，且与手册同批更新。真实路径是 `src/components/common/HelpGuide.vue`，流水线徽章入口在 `PipelinePanel.vue:589`。

证据：`src/components/common/HelpGuide.vue:34,85,277`、`src/components/pipeline/PipelinePanel.vue:589`。

断言：文档-测试-实现三方绑定测试扩展到 HelpGuide；文档不出现“自动改稿”“阻断”“评分”承诺。

停机条件：文档承诺超前实现或与 trace 实值不一致，Phase B 禁止发布。

### L6. 预检 warning 放行缺口

机制：当前技能导入预检只把 contract errors 转 issues，warnings 放行（`skillPackageManager.ts:78-91`）；未知字段进入 warnings（`skillDeaiContractValidation.ts:66-69`）。契约 V2 引入后，未知 `meta.deai` 字段必须是 error，导入时阻断或要求兼容读，不允许静默忽略。

证据：`src/services/skillPackageManager.ts:78-91`、`src/services/skillDeaiContractValidation.ts:66-69,113`。

断言：契约 V2 测试覆盖未知字段 error、已知字段合法、旧版本包兼容读三条路径；覆盖导入 UI 与健康检查双入口。

停机条件：未知字段仍静默回退，Phase B 停止。

### L7. finalStepRetry 透传链

机制：`skillRouter.ts:62,213` 透传 `finalStepRetry`；修复正常终步接线时必须同批验证链式调用与 compose 双路径的透传，不只测真实执行器。

证据：`src/services/skillRouter.ts:62,213`、`src/components/pipeline/PipelinePanel.vue:2698-2714,4183,4350,4411,4427,4704`。

断言：集成测试证明 `finalStepDetection` 从 contract 到 requestMessages/反馈生成的完整链路，两条执行路径均覆盖。

停机条件：任一路径丢失透传，Phase A 停止。

### L8. keyword-lite 双处实现

机制：关键词交集逻辑在 `skillDeaiContract.ts:118-146` 与 `deaiVoiceProfile.ts:34-77` 各有一份。Phase B 抽共享纯函数，显式入参，不读 store；两处行为同批迁移并同批测试。

证据：`src/services/skillDeaiContract.ts:118-146`、`src/services/deaiVoiceProfile.ts:34-77`。

断言：共享函数单测；两侧调用点行为等价测试；负向断言共享函数不 import store。

停机条件：抽取后任一侧行为漂移，Phase B 停止。

### L9. voice profile run 级快照

机制：`useDeAi.ts:345` 与 PipelinePanel 都用 `buildDeaiVoiceProfile(projectStore.styleProfileEffective)`。流水线指导包必须在 run 启动时创建快照，run 内不随项目风格变化漂移；手动功能保持实时计算。

证据：`src/composables/useDeAi.ts:345`、`src/components/pipeline/PipelinePanel.vue:916-919`。

断言：并发测试中 run 启动后修改项目风格，该 run 的 requestMessages 与 trace 不变；手动侧实时变化不受影响。

停机条件：流水线 run 内快照漂移或手动实时性被破坏，Phase A 停止。

### L10. 测试脆弱断言

机制：`deai-injection-policy.spec.ts:79` 直接断言 `detail.step === 4` 源码字符串；`proseHardSignalWiring.spec.ts:9` 依赖读取点位置。编号收口与隔离改造必须同批迁移这些断言。

证据：`src/components/pipeline/__tests__/deai-injection-policy.spec.ts:79`、`src/services/proseHardSignalWiring.spec.ts:9`。

断言：迁移后测试断言共享常量或行为结果，不再断言源码字面位置；同批运行全部相关测试。

停机条件：断言未迁移导致误红/误绿，Phase A 停止。

## 3. Phase 任务清单

### Phase A：隔离与确定性影子

Task A1：切断流水线对手动 store 的 4 读 1 写（含 `hardruleEnabled`、`setLastDetectReport`）。
Task A2：修 `finalStepDetection` 正常终步接线，并验证 `skillRouter` 透传链（L7）。
Task A3：body layer step 常量收口（L4）与脆弱测试迁移（L10）。
Task A4：双向 source 过滤（L1），只读不改手动功能本体。
Task A5：voice profile run 级快照（L9）。
Task A6：指导包构造器、trace 摘要、确定性零 diff、并发隔离测试。

门禁：A1-A6 全部有原始验证输出；隔离负向断言、终步 off/on、确定性零 diff、并发测试、手动功能回归全部通过；失败停止，禁止进入 Phase B。

### Phase B：教学接管与契约 V2

Task B1：指导包替换旧三段提示词，blocking 退场为 informational-only（L2）。
Task B2：注入总预算 1900 字符与分项 trace（L3）。
Task B3：契约 V2：`guidanceOwnership`、`overlaps`、版本化预检、未知字段 error（L6）。
Task B4：keyword-lite 共享化（L8）。
Task B5：UI 徽章、日志、反馈面板、HelpGuide 按 trace 实值显示（L5）。
Task B6：配对影子数据：20 章、2 题材、2 模型。

门禁：21 项 + 10 漏项断言全部落地；文档-测试-实现三方同批；advisory/blocking 负向断言；真实 UI 验证；影子数据达标。

### Phase C：旧语义七层清零

Task C1：删除旧提示词、`legacy-auto/deep-fix` 执行路径、`runBodyMinimalEdit`。
Task C2：测试同批迁移，含位置耦合断言。
Task C3：trace 执行层写入、文档、构建产物清理。
Task C4：五证验收与安装包扫描。

门禁：七层 `rg` 清零；五证齐全；全量回归、类型检查、真实 UI 验证、安装包扫描通过。

## 4. 验证矩阵升级

在 V4 八项矩阵上追加：

1. 混源隔离：home/pipeline 双向事件过滤。
2. blocking 非裁判负向断言。
3. 注入预算分项：1200 + 700 = 1900。
4. step 常量负向扫描。
5. HelpGuide 三方绑定。
6. 未知字段预检 error。
7. finalStepRetry 双路径透传。
8. keyword-lite 共享函数等价。
9. voice profile run 快照。
10. 脆弱断言迁移后全量相关测试。

## 5. 决策点

1. 是否把设置页混源过滤纳入 Phase A：建议是，限定只读过滤。
2. 是否让流水线路径 blocking 语义退场为 informational-only：建议是。
3. 注入总预算是否定为 1900 字符并分项 trace：建议是。
4. 是否引入 `BODY_LAYER_STEP` 常量并负向扫描裸字面量：建议是。
5. 契约 V2 未知字段是否从 warning 升级为 error：建议是，同时保留旧版本包兼容读。
6. voice profile 是否采用 run 级快照：建议是，仅流水线路径。

## 6. 本轮边界

- 本轮只新增 V4.1 方案、台账、开发日志、主索引登记，并给 V4 台账加指向。
- 不修改生产代码。
- 不升版、不封装、不提交 git。
- 不改手动去AI味功能本体；混源过滤属于观测面隔离，实施时只读过滤。
- 不解除 provisional 校准状态。
