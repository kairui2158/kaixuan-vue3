# 方案：正文契约降级门禁与产物面单源根治（待审核）

日期：2026-10-17  
状态：待用户审核，审核通过前不改业务代码  
事故来源：`run-trace-正文层-20261017-043758-deep/`、`run-trace-正文层-20261017-043758-standard/`

## 1. 目标不变量

本轮不是补一个“降级且无输出”的旧形状，而是把以下四条固化为系统不变量：

1. S2 产物低于字数契约时，当步失败，不允许进入 S3。
2. `degraded` 与契约失败叠加时，不能因为输出非空就继续流转。
3. 步骤契约与终局验收必须量同一个“最终正文提取面”，不允许一个量原始输出、一个量提取正文。
4. 本次真实 trace 必须转化为自动回归资产，未来同类复发必须在测试层直接变红。

## 2. 根因分层（按 G1.15 四层递进）

### 2.1 症状层

三次 attempt 的最终正文分别为 1654 / 1971 / 2011 字，均低于契约下限 2100 字（3500 × 0.6），最终 `generation_failed`。trace 中 S2 为 `degraded` 但保留非空输出，随后继续流转到 S3。

### 2.2 链路层

执行链路为：

`genBody()` → `generateBodyArtifact()` → `callBodyApi()` → `runStepSkills()` → folder SKILL executor → S2 `degraded` 分支 → 步骤契约校验 → S3 → attempt 终局验收。

关键断点：

- `src/components/pipeline/PipelinePanel.vue:2261`：`folderStatus === "degraded"` 时，只要 `output.trim()` 非空就返回输出继续流转。
- `src/components/pipeline/PipelinePanel.vue:3239`：步骤契约用 `validateBodyArtifact(stepOutput, ...)` 校验原始 `stepOutput`。
- `src/services/bodyArtifactOrchestrator.ts:315`：终局验收用 `validateBodyArtifact(generation.body, ...)`，其中 `generation.body` 来自 `parseGenerationResult()`。
- `src/services/generationResult.ts:85`：`parseGenerationResult()` 会剥离思考标签、JSON envelope、交接元数据后才得到正文。

因此步骤校验量的是含交接元数据的原始输出，终局验收量的是剥离后的正文。本次事故中原始输出足够长，步骤校验通过；提取后正文过短，终局才发现。

### 2.3 组件组合层

单看每个组件都有局部理由：

- `realSkillExecutor.ts:1216/1248`：postProcess 三次失败后返回 `degraded`，并保留最后一次输出，用于诊断和可能的人工恢复。
- `PipelinePanel.vue:2261`：认为“降级但非空”可以继续，避免一次结构校验失败浪费整次生成。
- `PipelinePanel.vue:3239`：认为步骤内应尽早拦截字数问题。
- `bodyArtifactOrchestrator.ts:315`：认为终局必须验收最终交付正文。

组合后互相打架：

1. `degraded` 的“可诊断输出”被下游当成“可流转产物”。
2. 步骤契约量原始面，终局验收量提取面，两处都以为自己在保护正文。
3. S1 收到应用注入的“请为本章节生成约3500字正文内容”，但 S1 SKILL 自身职责是输出骨架；S2 的系统提示又声明“只能输出正文”。同一基础 prompt 被塞进两种职责的步骤，模型在 S1 被迫裁决冲突。
4. 字数缺口发生在 S2，长度验收却在 attempt 终局才统一暴露，S3 打磨师没有能力也不应该承担补字数职责。

### 2.4 机制层

深层机制缺陷有三个：

1. **状态语义未分层**：`degraded` 同时承担“调用有瑕疵”和“产物可进入下游”两个语义，实际应是前者；后者必须由产物验收门决定。
2. **契约测量面没有单源**：正文契约没有绑定“提取后的最终正文”这个唯一测量面。
3. **执行包目标词注入没有步骤语义**：`buildChapterExecutionPrompt()` 把正文目标字数追加到基础 prompt，而这个 prompt 会进入 S1/S2/S3 所有步骤，未按 `chainHandoff.role` 分发。

## 3. 修复设计

### P0-1 新增统一产物验收门

新增服务层单源函数（建议 `src/services/stepArtifactAcceptance.ts`）：

```ts
interface StepArtifactAcceptanceInput {
  rawOutput: string
  contract: BodyArtifactContract | null
  callerStatus: 'success' | 'degraded' | 'failed' | 'blocked'
}

interface StepArtifactAcceptanceResult {
  decision: 'accept' | 'reject'
  extractedBody: string
  validation: BodyArtifactValidation | null
  downstreamPayload: string | null
  reason: 'no_contract' | 'contract_valid' | 'contract_failed' | 'caller_failed'
}
```

规则：

- `failed/blocked` 永远 reject。
- 无契约步骤维持现有行为，但 trace 必须记录 `acceptance.reason = no_contract`。
- 有契约步骤先 `parseGenerationResult(rawOutput)`，再对 `extractedBody` 做契约校验。
 - `callerStatus = degraded` 且契约失败：reject，错误信息合并“降级原因 + 契约错误”。
 - `callerStatus = degraded` 且契约通过：accept，下游收到的必须是 `extractedBody`，trace 保留 warning。
- `callerStatus = success` 且契约失败：reject。

这实现了“调用状态”和“流转资格”分离：`degraded` 描述调用质量，验收门决定是否能往下游走。

### P0-2 步骤契约与终局验收共用同一提取面

`PipelinePanel.vue:3239` 不再直接校验 `stepOutput`：

1. 先经统一验收门提取 `extractedBody`。
2. 步骤契约校验 `extractedBody`。
3. 校验通过后，传给 S3 的 handoff 产物也使用 `extractedBody`，避免 S3 消费原始元数据后再次生成“剥离前/剥离后”落差。
4. attempt 终局继续用 `generateBodyArtifact()` 的提取面验收；两者现在天然同源。

trace 新增结构化事件 `body-step-acceptance`：

```json
{
  "stepIndex": 1,
  "callerStatus": "degraded",
  "rawWordCount": 15000,
  "extractedWordCount": 1654,
  "metadataDelta": 13346,
  "decision": "reject",
  "contract": { "targetWords": 3500, "minWords": 2100 },
  "degradedErrors": ["正文交接缺少NEW_FACT"],
  "contractErrors": ["正文过短：1654字，要求不低于2100字"]
}
```

这个事件让“原始输出很长但正文很短”的现象在 trace 里直接可见，不再依赖人工翻 payload。

### P0-3 目标字数注入按步骤语义分发

应用侧修改：

1. `buildChapterExecutionPrompt()` 不再在基础 prompt 尾部追加“请为本章节生成约X字正文内容”。
2. `runStepSkills()` 根据步骤的 `chainHandoff.role` / `isBodyContractStep()` 判定生成步，仅向生成步追加目标字数契约。
3. 修复请求（targeted/full_chain）同样只在生成步注入字数修复目标，S1/S3 不接收正文生成指令。
4. 若链没有可识别 generator 步，显式失败并写 trace `body-generator-step-unresolved`，禁止退回“所有步骤都拿到正文指令”的旧语义。

责任边界：

- 应用负责：不向 S1 发送正文生成目标；向 S2 精确发送字数契约。
- SKILL 层负责：S1 骨架职责提示词、S2 postProcess 的 `NEW_FACT/FACT_LOCK` 校验口径。这两项只登记转达，不在应用内代改 SKILL 内容。

### P0-4 attempt 台账补齐降级与验收门证据

`body-artifact-attempt` 事件增加：

- `stepAcceptanceDecisions`: 每步 accept/reject 与理由。
- `degradedSteps`: 降级步骤及错误。
- `rawVsExtractedDelta`: 原始字数与提取正文字数差。
- `generatorStepIndex`: 实际识别到的生成步。

要求三次 attempt 的每一步都可对账，不允许只有终局结果。

### P1-1 全流水线同类组合审计

逐项审计以下路径是否存在“调用降级/非空输出越过产物契约”：

- `src/services/skillOrchestrator.ts:313` 附近：`degraded` 且非空即 `transition('done')`。
- 卷纲层：`volumeBatchOrchestrator` + `validateVolumeBatch` 的测量面是否与最终落库面一致。
- 章节层：`chapterBatchOrchestrator` + `validateChapterBatch` 的测量面是否与最终章节产物一致。
- 设定层：`settingsArtifactOrchestrator` + `validateSettingsArtifact` 的测量面是否与设定落库面一致。

审计输出必须是三列表：调用状态来源、产物验收位置、最终消费面。任何两列不一致都列为缺陷，不允许“看起来都有校验”通过。

### P1-2 降级语义单源化

把“degraded 输出能否继续”的判断从组件局部代码收敛到验收门：

- `PipelinePanel.vue` 不再自行判断 `folderStatus === 'degraded' && output.trim()`。
- `skillOrchestrator.ts` 消费同一个验收门；无契约链保持现状但 trace 记录 `no_contract`。
- 后续任何新层级接入时，默认问“你的产物契约是什么、验收面在哪里”，没有答案就不能接 degraded 流转。

## 4. 验证方案

### 4.1 行为级单测

新增/升级测试，禁止用 `expect(source).toContain(...)` 冒充行为证据：

1. **降级越权阻断**：mock folder 返回 `degraded`、非空原始输出、提取正文 1654 字、目标 3500 字。断言：验收门 reject；S3 未被调用；attempt 终态失败；trace 有 `body-step-acceptance` reject。
2. **原始面/提取面一致性**：构造原始输出 15000 字、其中交接元数据 13000+ 字、正文 1654 字。断言步骤校验失败，错误为“正文过短”，不是“通过”。
3. **降级但契约通过**：`degraded` + 提取正文 2200 字。断言可以继续，但 S3 收到的是提取正文，trace 保留 warning。
4. **步骤注入语义**：捕获 S1/S2/S3 实际 request。断言 S1 request 不包含“生成约3500字正文”；S2 request 包含目标字数；S3 request 不包含“补字数”指令。
5. **generator 识别失败**：构造无 generator 角色链。断言显式失败并写 `body-generator-step-unresolved`，禁止静默全步骤注入。
6. **修复链不漂移**：targeted/full_chain 修复时，S1 prompt 不因修复请求新增正文生成语义；生成步 prompt 保持目标字数。

### 4.2 真实 trace 回归资产

按 G2.10 建立 `scripts/verify-body-contract-degraded-replay.mjs`：

1. 优先读取本机真实调试目录中的 `run-trace.json` 与 `payloads/`（路径可通过环境变量传入，不写入仓库）。
2. 回放原始调用顺序、S2 三次 postProcess 失败、降级状态与三次 attempt。
3. 旧 trace 期望 `generation_failed`；当前实现断言在 S2 步骤即失败，并输出 `result.json.diff`：
 - `historicalOutcome: generation_failed`
 - `currentOutcome: failed_at_generator_step`
 - `s3Invoked: false`
 - `rejectReason: degraded_plus_contract_failure`
4. 对外置 payload 不存在的环境，提供从真实 trace 派生的最小 fixture，文件头明确标注“derived from 20261017-043758，非自造序列”，并保留关键字段：callerStatus、raw 长度、提取正文长度、三次 attempt 的 wordCount/ratio、错误码。禁止把 fixture 冒充完整原件。

### 4.3 真实 Electron UI 硬门禁

新增 `scripts/verify-body-contract-degraded-electron.mjs`，必须满足：

1. 先 `npm run build:vue`，对账 `dist-renderer` 中存在新验收门语义、不存在旧 `degraded && output.trim() 即流转` 语义。
2. 启动真实 Electron 生产窗口，通过真实 UI 选择正文层 SKILL，禁止注入式冒充 SKILL 已加载。
3. 使用本地 OpenAI-compatible provider 模拟事故形态：
 - S1 返回骨架（不带正文目标冲突）。
 - S2 返回 `degraded`，原始输出含大量交接元数据，提取正文 1654 字。
 - 断言 UI 在 S2 步骤显示失败，不进入 S3。
 - 断言物理请求序列中没有 S3 请求。
 - 断言 trace 有 `body-step-acceptance` reject 事件。
 - 断言运行终态为 failed，错误文案同时包含降级原因和契约错误。
4. 第二轮正向场景：S2 `degraded` 但提取正文 2200 字，断言 S3 执行、终态成功且 trace 保留 warning。
5. 证据写入 `_audit/verification-body-contract-degraded-electron/`，包含 report.json、截图、请求序列。

### 4.4 全量回归

- `npm run test:services`
- `npm run type-check`
- `npm run build:vue`
- 既有 Electron 验证脚本中与 body 修复、断点、postProcess 相关的至少各跑一条，防止新门禁破坏既有语义。

## 5. 盲区抹杀循环

为避免“修一处、漏一面”，执行中采用以下循环，且不设固定轮次上限，停止条件是连续一轮无新发现：

1. **作者反证**：列出本方案最可能错误的假设：
 - 假设一：所有正文链都能识别 generator 步。证伪：构造 2 步链、无 role 链、role 缺失链。
 - 假设二：`parseGenerationResult()` 足以覆盖所有正文提取形态。证伪：JSON envelope、legacy metadata、思考标签、空 body、纯元数据输出。
 - 假设三：其他层级都有独立契约。证伪：逐层查“调用状态 → 验收位置 → 最终消费面”三列表。
2. **组合矩阵**：`{success, degraded, failed} × {契约通过, 契约失败, 无契约} × {S2, S3, targeted, full_chain}` 全部断言终态与下游调用次数。
3. **trace 反查**：修复后重放本次事故，任何“步骤通过但终局失败”的正文长度差都必须在 trace 里有解释字段。
4. **跨层反查**：卷纲、章节、设定、大纲工作台各自输出三列表；没有契约的层登记为“显式无契约”，不允许空白。
5. **验证器自审**：每个新增断言回答“如果实现者把这段逻辑删了，这个测试会不会红”；不会红的断言删除或重写。

## 6. 门禁与经验回写

经验文件升级（预计 v8.14）：

- G2.9 新增：调用状态与产物流转资格分离；`degraded` 不得越过产物契约失败；正文契约必须绑定唯一提取面。
- G1.17 新增：契约类修复必须先回答“测量面是什么、谁消费同一个面”；两处校验量不同文本面时，测试必须构造“原始面通过、提取面失败”的用例。
- G1.5 新增：验证器不得只断言事件存在，必须断言决策结果与下游副作用（例如 S3 未调用）。

收尾必做：

1. `_audit/TASK_LEDGERS/` 七节台账。
2. DEV_LOG 记录修复、验证、诚实边界、经验文件升级。
3. 按 G1.16 写事故因果复盘，明确记录：用户指出“上一轮和这一轮像没区别”，执行者复查后确认上一轮修的是断点回放与四漏，本轮是降级流转与测量面错位，属于同一系统的另一个未封闭通道。
4. 清理临时脚本与工作区残留，仓库保持干净。

## 7. 执行顺序

1. Phase 1：实现统一验收门与测量面对齐。
2. Phase 2：目标字数按 generator 步注入。
3. Phase 3：trace 与 attempt 台账补齐。
4. Phase 4：行为级单测与组合矩阵。
5. Phase 5：真实 trace 回放器。
6. Phase 6：真实 Electron UI 双场景验证。
7. Phase 7：全流水线三列表审计。
8. Phase 8：经验、门禁、台账、DEV_LOG、清理、版本升级与封装。

每阶段完成条件都必须是机器可判定：测试输出、trace 字段、UI 证据、请求序列，不接受“已实现”口头声明。

## 8. 不做项与责任边界

- 不修改 S1/S2/S3 SKILL 的提示词内容；SKILL 层问题只登记转达。
- 不放宽字数契约阈值；`0.6/2.0` 比例本轮不变，避免用放宽验收掩盖产物质量。
- 不引入新的预览/确认状态机；本轮只在步骤边界做确定性验收。
- 不把外部调试目录 payload 复制进仓库，也不把 API key、完整客户文本写入测试或证据文件。

## 9. 为什么这次能阻断复发

1. 旧通道被结构性删除：组件不再自行判断“degraded 非空即可流转”。
2. 测量面单源：步骤校验、handoff、终局验收都消费同一个提取面。
3. 事故变成回归资产：本次 trace 的失败形态会在单测与回放器中直接变红。
4. UI 证据绑定副作用：不仅看事件，还断言 S3 物理请求不存在。
5. 跨层三列表审计把“只在正文层修”的盲区显式化。
