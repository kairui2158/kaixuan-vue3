# 内嵌降AI“方法指导者”最终执行方案 V5 FINAL

日期：2026-11-01
状态：跨版本审计完成，全部决策点已按用户裁决锁定为“是”；待用户确认执行
前置链：V1 诊断-路由-回归 → V2 方法论指导者 → V3 五条裁决 → V4 21项四件套 → V4.1 10漏项+执行条例
范围：生成流水线正文层内嵌降AI、folder SKILL `meta.deai` 契约、流水线 UI、trace、测试守护、技能导入预检
核心定位：**只做方法指导者。生成前教方法，生成后给位置化教学反馈；不改稿、不裁判、不评分、不阻断叙事**

## 1. 跨版本审计结论

V1 到 V4.1 的演进方向一致，未发现目标漂移；但存在三处早期承诺已被后续用户裁决覆盖，最终执行版以最后有效裁决为准：

1. **手动降AI入口不改造**。V1 Phase 3 与 V2 Phase 3 曾写“手动入口改为诊断报告、退役一键改稿”；V3 用户五条裁决明确手动去AI味功能保持原状。最终版执行：不动手动功能本体，只修设置页观测混源过滤。
2. **blocking 语义不保留**。V1/V2 曾保留“确定性门禁”可阻断；V3 裁决只做方法指导者，V4.1 L2 已把 blocking 从 attempt success/errors 中退场。最终版执行：降AI findings 一律 informational-only；截断、协议泄漏等平台合同缺陷仍由既有正文合同验收处理，与降AI无关。
3. **skill-wins 默认化保留**。V1/V2 决策点未被后续版本推翻，且与 `guidanceOwnership` 语义一致。最终版执行：契约 V2 的 `conflictPolicy` 默认迁移为 `skill-wins`，按 G0.10 五证迁移。

其余结论：

- V2 的“自动语义导师、自动评分导师、自动改稿导师”三项不支撑判定继续有效，provisional 校准状态不解除。
- V3 的两套系统隔离、V4 的 21 项四件套、V4.1 的 10 漏项与执行条例全部并入本版，无遗漏登记。

## 2. 锁定决策清单

以下决策全部采纳建议值，执行中不得重开：

1. 设置页混源过滤纳入 Phase A，限定只读过滤。
2. 流水线路径 blocking 退场为 informational-only。
3. 注入总预算 1900 字符并分项 trace。
4. 引入 `BODY_LAYER_STEP` 常量并负向扫描裸字面量。
5. 契约 V2 未知字段从 warning 升级为 error，保留旧版本包兼容读。
6. voice profile 采用 run 级快照，仅流水线路径。
7. skill-wins 默认化，迁移走五证。
8. 指导包每步最多 6 条、1200 字符、本地构造 5ms 警告线。
9. 教学反馈不带候选全文，位置摘录每条 120 字符、最多 5 条。
10. 效率影子样本 20 章、2 题材、2 模型，配对比较；劣化超 10% 先降条数 6→4→3 复测。
11. `guidanceOwnership=skill` 时应用注入退场，只观测。
12. 旧三段提示词、`legacy-auto/deep-fix` 流水线分支、`runBodyMinimalEdit` 在 Phase C 七层清零，不做长期兼容。
13. UI 只做徽章、日志、可折叠反馈面板，不新增用户配置与阻塞等待状态。
14. 零 diff 限定为确定性构造物比较，不承诺 LLM 输出零 diff。

## 3. 核心不变式

1. 指导包只进入 prompt，不修改请求产物与正文。
2. 教学反馈不携带候选全文，不改稿，不改终态，不触发重试。
3. 叙事 verdict 归 folder SKILL，平台合同归应用，同一维度只有一个裁判。
4. 风格唯一 owner 是创作风格卡片；指导包只声明默认方法，并显式让位。
5. 阈值、词库、评分权重、整体 AI 率结论保持 provisional，不得因本方案解除。
6. 手动去AI味功能本体不动；共享检测器必须显式入参，禁止读 store。
7. 历史数据保持可读，执行层停止新增旧语义。

## 4. 执行条例（防缺漏机制）

### 4.1 Task 单元

每个 Phase 拆为编号 Task，必须包含：目标、改动文件、验收标准、预写验证命令与期望输出、负向断言。Task 清单见第 5 节。

### 4.2 执行对账表

每 Phase 结束更新五列对账表：方案条文、实施文件、验证命令、原始输出、状态。缺原始输出的 Task 只能是未完成；禁止用“测试通过”替代输出截断。

### 4.3 中断恢复协议

每完成一个 Task 立即更新台账。恢复执行必须先读台账，从第一个非完成 Task 继续；上一 Task 无原始输出时先补验证。

### 4.4 回头看清单

1. 逐行审 `git diff`，每行归入某个 Task。
2. 生产入口与旁路双向扫描：新入口正向生效，旧入口负向不可达。
3. 旧语义七层清零扫描：源码、测试、脚本、规格、日志、运行状态、构建产物。
4. 文档、测试、实现三方同批对账。
5. 手动功能回归面显式执行，不得因“未改动”跳过。

### 4.5 违例即停

Task 无预写验证、验证被临时改宽、负向断言缺失、台账空白节、影响圈外修改无法归属，任一命中即停止当前 Phase 并登记缺口。

## 5. Phase 任务清单与验证命令

### Phase A：隔离与确定性影子

Task A1：切断流水线对手动 store 的 4 读 1 写（`hardruleEnabled`、`hardRuleMode`、`hardRules`、`setLastDetectReport`）。
验证：`npx vitest run src/services/proseHardSignalWiring.spec.ts`；`rg -n "deAiStore\\.(hardruleEnabled|hardRuleMode|hardRules)|setLastDetectReport" src/components/pipeline/PipelinePanel.vue` 期望 0。

Task A2：修 `finalStepDetection` 正常终步接线，并验证 `skillRouter` 透传链。
验证：新增/迁移集成测试覆盖链式与 compose 双路径 off/on；`npx vitest run src/services/realSkillExecutor.spec.ts src/services/skillRouter.spec.ts`（无对应文件时新增）。

Task A3：`BODY_LAYER_STEP` 常量收口与脆弱测试迁移。
验证：`rg -n "step === 4|step !== 4|step: 4" src/services/de-ai.js src/services/skillDeaiContract.ts src/components/settings/DeAiSettings.vue src/components/pipeline/PipelinePanel.vue` 期望仅剩测试负向断言；相关 spec 全绿。

Task A4：设置页 source 双向过滤，只读不改手动功能本体。
验证：双向事件隔离测试；`npx vitest run src/components/pipeline/__tests__/deai-injection-policy.spec.ts`；真实 UI 冒烟确认手动面板只显示 home 事件。

Task A5：voice profile run 级快照。
验证：并发测试 run 启动后改项目风格，requestMessages 与 trace 不变；手动侧实时计算不受影响。

Task A6：指导包构造器、trace 摘要、确定性零 diff、并发隔离测试。
验证：预算单测（6条/1200字符/5ms）；确定性构造物 hash 一致；两个 run 指导包互不污染。

Phase A 门禁：A1-A6 全部有原始验证输出；隔离负向断言、终步 off/on、零 diff、并发、手动回归全部通过；失败禁止进入 Phase B。

### Phase B：教学接管与契约 V2

Task B1：指导包替换旧三段提示词；blocking 退场为 informational-only。
验证：S1/S2/S3 requestMessages 分别携带对应指导包且不含旧提示词；blocking findings 注入后 success/errors/retry/终态不变。

Task B2：注入总预算 1900 字符与分项 trace（guidance 1200 + voice 700）。
验证：预算单测；trace 字段 `guidanceChars/voiceProfileChars/totalInjectionChars` 存在且合计不超限。

Task B3：契约 V2：`contractVersion: 2`、`guidanceOwnership`、`overlaps`、未知字段 error、skill-wins 默认迁移。
验证：契约测试覆盖未知字段 error、旧版本兼容读、ownership 推导；导入 UI 与健康检查双入口；五证验收。

Task B4：keyword-lite 共享纯函数。
验证：共享函数单测；`skillDeaiContract` 与 `deaiVoiceProfile` 两侧行为等价；共享函数无 store import。

Task B5：UI 徽章、日志、反馈面板、HelpGuide 按 trace 实值显示。
验证：真实 UI 交互验证（G0.11），数值与 trace 完全一致；文档-测试-实现三方绑定。

Task B6：配对影子数据 20 章、2 题材、2 模型。
验证：配对键齐全；效率与合同失败率报告；劣化超 10% 降条数复测。

Phase B 门禁：21 项 + 10 漏项断言全部落地；advisory/blocking 负向断言；真实 UI 验证；影子数据达标。

### Phase C：旧语义七层清零

Task C1：删除旧提示词、`legacy-auto/deep-fix` 流水线分支、`runBodyMinimalEdit`。
验证：`rg -n "DEAI_METHODOLOGY_PROMPT|DEAI_CREATIVE_PROMPT|DEAI_POLISH_PROMPT|runBodyMinimalEdit" src` 期望仅剩兼容读/负向断言位置。

Task C2：测试同批迁移，含位置耦合断言。
验证：全部相关 spec 迁移为新语义断言 + 旧形态负向断言；定向测试全绿。

Task C3：trace 执行层写入、文档、构建产物清理。
验证：执行层旧 processor/variant 新增写入为 0；文档与手册同步；安装包扫描不含旧语义。

Task C4：五证验收与最终回归。
验证：`npm run type-check`；全量 Vitest；真实 UI 验证；安装包扫描；五证逐条输出。

Phase C 门禁：七层清零；五证齐全；全量回归、类型检查、真实 UI、安装包扫描全部通过。

## 6. 验证矩阵总表

1. 单元：指导包分步、上限、预算、ownership 推导、overlap 省略、trace 上限。
2. 集成：S1/S2/S3 requestMessages、agent 路径真实传入 `meta.deai`、终步 off/on 双路径。
3. 隔离：4 读 1 写负向断言、双向 source 过滤、共享检测器无 store。
4. 非裁判：advisory/blocking 注入不改终态、不触发重试。
5. 并发：两个 run 指导包互不污染；voice profile run 快照。
6. 影子：20 章、2 题材、2 模型配对；效率劣化 10% 阈值。
7. UI：徽章、日志、反馈面板与 trace 实值一致，真实交互验证。
8. 清零：七层 `rg`、五证、安装包扫描。
9. 文档：手册承诺逐条绑定测试或 trace 字段。
10. 回归：类型检查、全量 Vitest、手动去AI味功能回归。

## 7. 停止条件

1. 用户确认执行前不改生产代码。
2. 任一 Task 缺预写验证或无原始输出，该 Phase 禁止完成。
3. 隔离、零 diff、并发、手动回归任一失败，停止前进。
4. 影子样本不满足配对结构，教学有效性保持 provisional，禁止接管宣称。
5. 效率降到 3 条仍劣化超 10%，Phase B 延期，禁止放宽合同验收。
6. 七层清零或五证缺一，禁止封装。
7. provisional 校准未解除，禁止输出总分或语义 verdict。

## 8. 本轮边界

- 本轮只交付最终执行方案与登记文档，不改生产代码。
- 不升版、不封装、不提交 git。
- 不改手动去AI味功能本体。
- 不替 folder SKILL 生成或修改模板；SKILL 适配手册在 Phase B 实施后同步更新，只写已实现行为。
