# 修复方案：正文层终步元数据保真与重试语义（2026-10-19）

## 0. 方案状态

- 状态：待用户审核，未进入写码阶段。
- 输入证据：`run-trace-正文层-20261018-133836-standard`、`payloads/007-response.json`、`payloads/015-response.json`、`payloads/021-response.json`、`payloads/025-response.json`。
- 适用层：生成流水线正文层（S1 分析 -> S2 生成 -> S3 打磨）。卷纲层、设定层只做同类风险反查，不在本轮直接改代码。
- 明确不混入：`legacy_outline_no_scope` 上下文缺失属历史大纲结构问题，按既有约定单独立项，本轮只保留如实登记。

## 1. 根因链

本轮不是单点缺陷，而是四个机制叠加：

1. **摘要交接切掉账本原文**：2026-10-17 为修 metadata 滚雪球，`formatUpstreamMetadata` 把 `extractedMeta` 压成 `count=1,totalChars=558`。这个修复对中间步是对的，但终步 S3 的职责是“保事实、改表达”，它必须能核对 S2 的 `来源覆盖状态 / 目标字数 / 生成下限 / FACT_LOCK`。现在 S3 请求里没有账本原文，模型只能写“无法核对”。
2. **终步无独立验收**：`body-step-acceptance` 只在唯一生成步（S2）后触发；S3 输出直接成为终稿，元数据退化没有任何门拦截。
3. **终稿 metadata 无回填**：S2 的完整账本已经保存在验收事件里，但应用没有把它作为权威账本回填到终稿 metadata，下一章拿到的是 S3 的退化账本，事实账跨章节变薄。
4. **重试反馈与职责冲突**：`buildSchemaRetryFeedback` 对所有步骤统一注入“必须以它为基底、只修正错误、保留其余内容”并回传整段候选。S3 是打磨步，这套指令会诱导复述；而候选里又缺 8 个 FACT_LOCK 字段值，形成“既复述又修不好”的循环。

因果结论：这是 10 月 17 日修复的**副作用未被终步语义覆盖**，不是那次修复方向错误。禁止直接回滚摘要交接；回滚会让 metadata 滚雪球回归。

## 2. 修复设计

### Fix A：终步受控账本通道（P0）

目标：中间步保持摘要，终步拿到可核对的账本原文。

- `formatUpstreamMetadata` 增加模式参数：默认 `summary`（现行为不变）；终步打磨使用 `final_step_ledger`。
- `final_step_ledger` 模式下：
  - 只放行 `extractedMeta` 与少量标量字段（如 `status`、`runId`）。
  - `extractedMeta` 每节按原文传递，单节上限 4000 字符，总上限 12000 字符；超限保留头部并登记 `truncated=true` 与截断字节数。
  - 继续执行既有 marker 归一与空白压缩，避免重新引入滚雪球。
- 接线位置：`chainExecution.ts` 的 `buildChainSkillPrompt` / `formatUpstreamMetadata`，由 `PipelinePanel.vue` 根据 `si === templates.length - 1` 且终步角色为 polish 传入。

验收标准：
- 中间步请求仍只有 `count/totalChars` 摘要，旧滚雪球回归测试保持通过。
- 终步请求包含 `--- 上一步结构化交接（终步账本） ---` 与 S2 账本原文，且不含 `【正文交接】` 原始 marker。

### Fix B：终步独立元数据验收（P0）

目标：S3 后也有一道应用层门，不再“生成步验完就裸奔”。

- 在 `stepArtifactAcceptance.ts` 新增 `resolveFinalStepMetadataFlow`：
  - 输入：S3 输出解析出的 metadata、S2 权威 metadata、终步角色。
  - 对账项：`来源覆盖状态`、`目标字数`、`生成下限`、逐条 `FACT_LOCK` 的键与值。
  - 输出结构化 `metadataComparison`：`matched / missing_in_final / conflicting` 三列，不做模糊相似判定。
- 决策规则：
  - 内容契约失败（字数、空稿、caller failed）仍走现有失败路径。
  - **元数据-only 退化不触发模型重试**，由 Fix C 应用层回填，并写 `body-final-step-metadata-repaired` warning 事件。理由：元数据核对是应用职责，让模型重写一遍只为补账本会重演“慢速复述”。
  - `conflicting` 必须再分两型，禁止一律回填：
    - `label_drift`：S2 的 FACT_LOCK 值经归一化后仍能在 S3 终稿正文中找到对应事实，只是 S3 元数据标签写错或缺失。此时回填 S2 权威值是安全的。
    - `body_divergence`：S2 的 FACT_LOCK 值在 S3 终稿正文中找不到对应事实。这说明 S3 可能真的改了事实，回填标签会把内容退化伪装成元数据退化。此型不回填，升级为 `body-final-step-fact-divergence` warning，按内容级问题处理。
    - 判定方式：确定性子串/归一化包含检查，有界执行，不做模糊相似。
- `PipelinePanel.vue` 在 S3 输出后调用该门，写 trace 事件 `body-final-step-metadata`。

验收标准：
- S3 账本完整：事件 `decision=pass`，无回填。
- S3 账本退化：事件 `decision=backfilled`，终稿 metadata 含 S2 权威值，warning 保留。
- S3 标签退化但正文事实未变：归入 `label_drift`，允许回填。
- S3 正文事实与 S2 FACT_LOCK 不一致：归入 `body_divergence`，禁止回填，事件升级为内容级警告。
- S2 自身无账本：登记 `generator-ledger-missing`，禁止伪造权威值，终稿 metadata 标注来源为空。
- 事件必须同时记录决策值与下游实际消费的 metadata，满足“决策结果 + 消费面”双断言。

### Fix C：终稿权威账本回填（P0）

目标：跨章节事实账不因 S3 退化而变薄。

- S2 验收通过时，把 `artifactFlow.metadata` 存为 `authoritativeGeneratorMetadata`，随 handoff/attempt 生命周期传递。
- 终稿组装处（`bodyArtifact` -> `generationResult.metadata`）执行合并：
  - S3 值与 S2 一致：保留 S3。
  - S3 缺失或 `label_drift` 型冲突：以 S2 权威值回填，S3 原值进入 `conflicts` 登记字段，不静默丢弃。
  - `body_divergence` 型冲突：不回填，保留 S3 原值并标注 divergence，交由内容级处理。
  - S2 账本缺失：不回填，登记 `generator-ledger-missing`，禁止用 S3 退化值或应用默认值伪造权威账本。
- 回填后的 metadata 进入终稿产物、断点恢复数据与下一章上下文，三面同源。

### Fix B2：终步角色识别失败防御（P0）

Fix A 的终步账本通道依赖“终步角色为 polish”的判定。folder SKILL 未声明 `chainHandoff.role` 时目前靠启发式。方案要求：

- 角色可确认：启用终步账本通道。
- 角色无法确认：退回摘要交接，并写 `final-step-role-unresolved` warning，禁止猜角色启用账本原文。
- 判定逻辑复用 `isBodyContractStep` 的单源角色解析，不新增第二套识别口径。

### Fix D：终步专用重试反馈（P1）

目标：消除“整段候选 + 保留其余内容”对打磨步的复述诱导。

终步 retry 反馈的三个候选形态，逐条裁决如下：

| 形态 | 内容 | 裁决 | 理由 |
| --- | --- | --- | --- |
| 1. 只传失败指标 | `FACT_LOCK缺字段：人物状态、位置…`，无任何基底 | 不采纳为唯一形态 | 无基底会导致凭空重写，事实来源变弱；S3 retry 面对的是内容契约失败，需要权威事实基底 |
| 2. 失败指标 + 上游原始输入 | 失败指标 + S2 权威输出（不传 S3 自己的上一版候选） | **主方案** | S2 原文已在链式上下文单独提供，retry 从权威基底重新打磨；彻底切断候选复述先验，事实来源不断供，成本几乎为零 |
| 3. 失败指标 + 缺失内容锚点 | `你在候选稿中未输出 FACT_LOCK` + 有界锚点片段 | 补充证据，锚点取上游 | 保留定位精度，但锚点从 S2 上游输出截取（每段 200 字符，最多 3 段，含前后 40 字符上下文），不从 S3 候选取 |

落地到 `buildSchemaRetryFeedback(errors, previousOutput, options)` 的终步模式：

- **不回传 S3 候选全文**，包括不作为“基底”回传。
- retry 反馈结构：失败指标（含“你在候选稿中未输出 FACT_LOCK”这类定位句）+ 上游锚点片段（取自 S2）+ 明确指令“基于单独提供的上一步 SKILL 完整输出重新输出完整打磨稿”。
- 文案区分职责：S3 允许改表达，不允许改事实；元数据账本由应用维护，模型不需要自行补账本。
- 元数据-only 退化仍不触发 retry，走 Fix B/C 的应用层回填。
- 中间步与其他 SKILL 的现有重试语义不变，避免全局回归。

验收标准：
- 终步 retry 请求的反馈块中不出现 `<<<上一版候选输出开始>>>`，也不出现 S3 候选全文。
- retry 请求仍携带上游 S2 输出（既有链式上下文块），失败指标与上游锚点可逐项断言。
- 中间步 retry 的既有行为与测试不变。

### Fix E：DEAI 提示词接线（P1，应用侧边界）

- `src/services/de-ai.js`：
  - `DEAI_CREATIVE_PROMPT` 补完整版约束：短句仅限关键转折；整章节号密度参考上限 35/千字；保留“过度纠错也是 AI 信号”的保护。
  - `DEAI_POLISH_PROMPT` 补显式例外：信息无损的相邻短句合并、句号改逗号/分号属于合法语言打磨，不算结构变更。
- 边界声明：SKILL guidance 不得改变执行协议；这里只补应用内置降 AI 文案，不触碰权限、工具面与验收语义。

### Fix F：Trace 与观测同步（P0）

- 新事件：
  - `body-final-step-metadata`：终步对账决策、三列差异、回填来源。
  - `body-final-step-fact-divergence`：正文事实与 S2 FACT_LOCK 分歧，内容级警告。
  - `final-step-role-unresolved` / `generator-ledger-missing`：链路降级与权威账本缺失，均不得静默。
  - 必要时扩展 `body-artifact-attempt.stepAcceptanceDecisions`，增加终步一条，字段保持结构化而非全文。
- trace 只保存结构化摘要与有界预览，禁止全文重复膨胀。

### Fix G：降AI与终步协同单源化（P0）

目标：消除【语气诊断】、schema retry 反馈、S3 打磨职责三套指令互相冲突、由模型自行裁决协议的问题。

本轮 trace 证据：S3 retry 请求同时携带“必须以它为基底，只修正上述错误，保留其余内容”与【语气诊断】“只修命中句，不扩大重写范围”，模型 reasoning 被迫自行裁定“正文完全不动，只改 FACT_LOCK”。这不是模型漂移，是应用把协议裁决权丢给了模型。

设计：

- 新增 `buildFinalStepFeedback` 单源函数，终步所有反馈统一从这里产出。输入包括：
  - 内容契约失败指标（字数、FACT_LOCK 缺字段等）；
  - 降AI机械检测命中项（报告句、明喻密度、连续短句等）；
  - 上游 S2 权威输出锚点。
- 输出只有一份反馈块，内部按固定优先级排序：
  1. 事实与账本约束（FACT_LOCK / 事实不变）；
  2. 内容契约失败项；
  3. 降AI语言打磨项，且必须带“信息无损合并、句号改逗号/分号属于合法打磨”的例外；
  4. 明确的输出要求：“基于单独提供的上一步完整输出，输出完整打磨稿”。
- 禁止同请求内出现互相矛盾的指令对：
  - “只修正上述错误、保留其余内容”与“输出完整打磨稿”不得并存；
  - “只修命中句”与“补齐 FACT_LOCK 字段”不得并存，必须改写为统一职责描述：“允许为满足账本与语言契约调整表达；不得改变事实、事件顺序与场景结果”。
- 【语气诊断】仍只注入终步；S1/S2 的降AI分层注入（方法论/创作精简）保持现状。
- 降AI检测本身不改：`DeAiProcessor.detectBody` 仍是报告源，不越权改写；改变的只是检测报告注入终步时的协议包装。
- trace 新增 `final-step-feedback-composed` 事件，记录反馈来源计数（contentContract、deai、upstream anchors）与合并后长度，不记录全文。

验收标准：
- 构造“FACT_LOCK 缺字段 + 降AI命中”复合失败样例，终步 retry 请求只出现一个反馈块。
- 断言请求中不存在“必须以它为基底”“只修正上述错误”与“输出完整打磨稿”的矛盾组合。
- 断言 FACT_LOCK 修复项与降AI命中项同时存在时，两者都在同一反馈块内且优先级正确。
- 单独降AI命中、单独契约失败两种退化场景也各有回归。

## 3. 任务拆分

### Phase 1：单源契约（Fix A/B 核心）

- Task 1：`chainExecution.ts` 终步账本模式 + 单测。
- Task 2：`stepArtifactAcceptance.ts` 终步 metadata 对账 + 单测。
- 验收：`npx vitest run src/services/chainExecution.spec.ts src/services/stepArtifactAcceptance.spec.ts` 通过；旧摘要行为与终步新行为同时有正反断言。

### Phase 2：编排接线（Fix B/C/F）

- Task 3：`PipelinePanel.vue` 终步验收调用、权威账本传递、终稿回填、trace 事件。
- Task 4：断点/attempt 生命周期同步：权威账本与 completed step outputs 同批传递，恢复后不丢。
- 验收：新增回归证明 S3 退化时终稿 metadata 仍为 S2 权威值，且 warning 事件保留。

### Phase 3：重试与提示词（Fix D/E）

- Task 5：`realSkillExecutor.ts` 终步 retry 反馈改造 + 单测。
- Task 6：`de-ai.js` 文案补全 + 相关既有测试更新。
- Task 7：`buildFinalStepFeedback` 单源函数 + 【语气诊断】/ schema 反馈 / 打磨职责合并 + 复合失败单测。
- 验收：终步 retry 请求不包含整段候选；中间步 retry 语义不变。
- 验收（Fix G）：复合失败请求只有一个反馈块，矛盾指令对命中 0。

### Phase 4：真实证据

- Task 8：回放 `run-trace-正文层-20261018-133836-standard`：
  - 使用真实 `run-trace.json` 与外置 `payloads/`。
  - 断言 S3 请求含终步账本；终稿 metadata 与 S2 账本一致；`无法核对` 不再出现在终稿账本。
- Task 9：Electron 真实 UI 验证（硬门禁）：
  - 真实 UI 选择正文层 SKILL，禁止注入式冒充。
  - 跑一条真实章节生成链，用户可监督。
  - 断言：S3 后出现 `body-final-step-metadata` 事件；终稿账本保真；总耗时不劣化于本轮基线（773 秒量级，不因回填增加模型调用）。
  - 断言：S3 retry 请求只有一个反馈块，且无“基底/保留其余内容/输出完整打磨稿”矛盾组合。
- Task 10：执行边界反证矩阵（G1.17 作者反证的机器化部分）：
  - folder 注入通道：`PipelinePanel.vue` folder 分支构造 S3 retry 请求，断言 `buildFinalStepFeedback` 单源反馈生效。
  - 非 folder 注入通道：同一断言覆盖非 folder 分支，防止只修 folder 后旧通道继续注入矛盾协议。
  - 变长链：构造 4 步正文链，断言第 4 步（末步）按 polish 终步语义处理，且终步判定复用 `resolveDeaiPromptForChainStep` 同一计数口径；禁止任何实现硬编码 `skillIndex === 2`。
  - compose 单调用：断言 `resolveDeaiPromptForChainStep(4, 0, 1)` 仍返回方法论文案，且不启用终步账本通道、不消费 `buildFinalStepFeedback`。
  - 非正文层负向断言：卷纲 / 设定层构造同形态调用，断言终步账本通道与终步反馈单源化均不生效。
  - 断点恢复：恢复后再次触发 S3 retry，断言权威账本与 completed step outputs 同批恢复，且 retry 只产生一个反馈块。

### Phase 5：收尾

- 全量 `npx vitest run`、`npm run type-check`、`npm run build:vue`。
- 更新 `神意开发经验总结`（预计 G2.9/G1.5 补“终步交接与终稿账本保真”规则）。
- 新建 DEV_LOG 与 `TASK_LEDGERS` 台账，登记证据与缺口。
- 版本升级、封装、真实启动核验、工作区清理、git 提交。

## 4. 验证矩阵

| 层 | 证明内容 | 不证明内容 |
| --- | --- | --- |
| 单测 | 摘要/终步双模式、三列对账、回填合并、retry 差异 | 真实供应商行为 |
| trace 回放 | 本轮事故现场被修复，旧失败不再复现 | 新供应商矩阵 |
| Electron UI | 真实 UI 选择 SKILL 后全链路生效 | 外部 live 供应商 |
| 全量回归 | 既有 2015+ 测试不回归 | 新增语义的线上稳定性 |

Fix G 额外验证：复合失败（FACT_LOCK 缺字段 + 降AI命中）样稿必须同时产生两类指标并走单源合并；单独降AI命中、单独契约失败两个退化场景分别回归。

Fix G 执行边界（v4 补入）：
1. 双注入通道覆盖：folder（`PipelinePanel.vue` folder 分支）与非 folder（非 folder 分支）都必须消费 `buildFinalStepFeedback`；只修其中一条属于未完成。
2. 变长链口径：终步判定必须复用 `resolveDeaiPromptForChainStep` 的 `skillIndex >= count - 1` 计数语义，支持 3 步以上链；禁止硬编码 `skillIndex === 2`。
3. 断点恢复：恢复后的终步 retry 同样只允许一个反馈块；权威账本必须随 completed step outputs 同批恢复，不允许恢复态产生第二套反馈协议。
4. compose 边界：单次调用无终步打磨语义，不启用终步账本通道，不消费 `buildFinalStepFeedback`；`resolveDeaiPromptForChainStep(4, 0, 1)` 的方法论行为保持不变。
5. 非正文层边界：`resolveDeaiPromptForChainStep` 对 `step !== 4` 返回空串，卷纲 / 设定层不得被误接终步反馈协议。

验证流程契约（v4.1 补入，服从 G1.5/G1.6/G1.7/G1.8）：

1. 证据生命周期：trace 回放开始前，把 `run-trace.json`、外置 payloads、验证脚本输出复制到 `_audit/evidence/<date-task>/`；每个文件记录尺寸与哈希，源/目标校验通过才算证据在案。清理只允许清临时运行态，payload、trace、summary、截图、验证原始输出属于不可再生证据，必须保留。
2. 验证器自身质量：每个验证脚本显式设置启动超时、单阶段超时、阶段日志；挂起必须能暴露卡点。验证脚本修改后完整重跑脚本本体，禁止用局部测试、导入检查或历史产物冒充执行闭环。
3. 夹具职责差异：S2 样稿、S3 好样稿、S3 label_drift 样稿、S3 body_divergence 样稿必须互不相同；S3 好样稿至少保留事实并改变表达，防止把“职责保留”误判成“未执行修复”。
4. 三面查账：所有验收断言同时覆盖“决策值 + 下游消费面 + 后续物理调用”。例如元数据回填必须证明终稿、断点恢复数据、下一章上下文三面同源；body_divergence 必须证明未被回填且未触发额外模型重试。
5. 观测同批：Fix F 新事件与新字段的存储类型、服务返回、入口回填、导出通道、schemaVersion、验证器白名单同批升级；测试必须覆盖一个成功事件与一个拒绝/失败事件。
6. 失败处置协议：验证不过时先分类为产品缺陷 / 验证器口径缺口 / 环境差异，登记进 G0.12 台账；禁止为绿灯放宽产品断言、改产品语义或删除断言。修复后从单测层重新完整重跑验证链，不允许只补跑失败项。
7. 耗时与成本口径：773 秒只是本轮单次观测，不作为硬阈值。验收记录总耗时、各步骤耗时、物理请求数、重试数、输出 token，与基线同表对比；若供应商波动导致总时长不可比，以物理请求数、重试数与各阶段耗时为主判据，并在台账登记环境差异。

停止条件（机器判定）：
1. 上述四个验证层全部有本轮原始输出证据。
2. S3 退化样例终稿 metadata 与 S2 权威账本逐键一致。
3. 中间步摘要请求无账本原文回归。
4. 终步 retry 请求无 S3 候选全文（含“基底”形态），且仍携带 S2 上游输出与失败指标。
5. 终步 retry 请求只有一个反馈块，矛盾指令对（“只修正上述错误/保留其余内容”与“输出完整打磨稿”并存；“只修命中句”与“补齐 FACT_LOCK 字段”并存）命中 0。
6. 执行边界反证矩阵六项全部通过：folder 通道、非 folder 通道、变长链末步、compose 单调用、非正文层负向、断点恢复。
7. 验证流程契约七项全部落实：证据哈希留存、验证器超时与重跑、夹具职责差异、三面查账、观测同批、失败处置台账、耗时成本对比表。
8. 无未登记缺口；无法验证项必须写 `untested`，不得冒充通过。

## 5. 风险与裁决

| 风险 | 处置 |
| --- | --- |
| 终步传账本原文重新引发滚雪球 | 仅终步启用；保留 marker 归一与长度上限；中间步回归测试不删除 |
| 回填掩盖 S3 正文事实退化 | conflicting 拆分 label_drift / body_divergence；body_divergence 禁止回填并升级内容级警告 |
| S2 账本本身缺失 | 登记 generator-ledger-missing，禁止伪造权威值；回填通道自然短路 |
| 终步角色启发式误判 | 角色未确认时退回摘要并显式 warning，禁止猜角色传账本原文 |
| 增加终步耗时 | 元数据-only 退化不触发模型重试，走确定性回填 |
| de-ai 文案改动影响其他层 | 只改正文层内置降 AI 文案，卷纲/设定层单独反查后再立项 |
| 反馈单源化改造伤及中间步 | `buildFinalStepFeedback` 只在终步消费；中间步 retry 既有测试不删不改，回归证明 |

## 6. 同类面反查（本轮只登记，不混改）

- 卷纲层：终步若有“账本交接”形态，应复用 Fix A/B 模式，待专项确认。
- 设定层：目前无 FACT_LOCK 型逐行账本，风险低。
- 大纲/API 直写：metadata 语义不同，不套用本方案。

## 7. 成熟度结论（G0.6）

- 执行器/工具层：成熟。改动集中在 4 个服务文件 + 1 个编排文件，均有现成测试锚点。
- 应用方案/交互闭环：成熟。用户可感知行为是“终稿事实账不再退化为无法核对，且不增加等待时间”；label_drift / body_divergence / 账本缺失 / 角色未确认四个异常路径均有显式终态。
- 实现接线：成熟。每个改动点已锚定真实 file:line。
- 验证标准：成熟。含单测、真实 trace 回放、Electron 真实 UI 硬门禁与停止条件。

修订记录：

- v1 结论“成熟”属于过度自信：Fix D 缺三条 retry 形态决策矩阵，实际为半成熟。已补决策矩阵与停止条件。
- v2 作者反证继续发现三处遗漏：conflicting 未区分标签退化与正文事实分歧、S2 账本缺失无兜底终态、终步角色识别失败无防御。均已补入 Fix B/B2/C/F 与风险表。
- v3 用户质询“降AI协同失责/降AI冲突”暴露新漏项：V2 只补文案，未把【语气诊断】注入通道纳入终步反馈协议，导致 schema retry 指令与降AI诊断在 S3 请求内互相矛盾。已补 Fix G 单源反馈合并与矛盾指令对断言。
- v4 作者反证再次发现 Fix G 缺 5 个执行边界：folder/非 folder 双注入通道、3 步以上变长链、断点恢复后的单源反馈、compose 单调用边界、非正文层负向边界。已补入 Fix G 执行边界、Phase 4 Task 10 与停止条件第 6 条，并升级为六项反证矩阵。
- v4.1 用户质询“验证流程是否完善”暴露验证器自身契约缺口：v4 只有产品断言，未覆盖证据哈希留存、验证器超时与完整重跑、夹具职责差异、决策值/消费面/物理调用三面查账、观测字段同批升级、失败处置协议与耗时成本口径。已补验证流程契约七项与停止条件第 7 条。

综合结论：**v4.1 成熟，可执行**。该结论的前提是：九组测试矩阵全部纳入并通过（conflicting 双型、S2 账本缺失、终步角色未确认、复合反馈合并、folder 通道、非 folder 通道、变长链末步、compose 单调用、非正文层负向），断点恢复单源反馈与验证流程契约七项作为停止条件。已知反证面已全部覆盖；不可绝对宣称“未来无新漏项”，若执行中出现新证据，必须按 G0.12 登记后裁决，禁止静默吸收或静默扩项。等待用户确认后进入 Phase 1，执行开始前先建 G0.12 任务台账。
