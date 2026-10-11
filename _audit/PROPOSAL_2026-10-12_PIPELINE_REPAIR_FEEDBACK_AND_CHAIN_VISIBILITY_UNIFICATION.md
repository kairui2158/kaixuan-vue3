# 生成流水线修复反馈与链路可观测统一方案

日期：2026-10-12  
版本基线：3.80.0 / b6b3720  
状态：待审核，未执行

## 结论

正文层四条反馈全部真实，但根因分布不同：

1. folder SKILL 的 schema 重试是裸重试，模型不知道上次错在哪里。
2. chain 中间 warning 只进事件流，不进步骤日志，用户看不见。
3. S2 上下文变薄不是应用擅自瘦身，而是 folder 多 pass 在中途把输入切成“上一 pass 输出”；应用允许这种切换却不记录，trace 用 100K 的错误口径掩盖了真实 5.4K 请求。
4. DEAI 方法论按 `step === 4` 全量注入正文三步，S2 创作环被负面约束压制。

统一原则：**SKILL/Agent 只提供领域能力和上下文需求声明；执行、权限、验收、修复策略永远由应用层单源决定。**

## 目标

1. 校验失败后的每一次重试都携带具体错误反馈。
2. chain 的五类中间 warning 全部聚合进步骤日志，且不刷屏。
3. folder pass 的输入切换、最终请求长度、上下文来源全部进入 trace，消除“trace 口径”和“真实请求口径”分裂。
4. DEAI 支持按 chain step 配置，S1/S3 保留硬约束，S2 默认减配为正向风格指令。
5. 终步高回显触发一次带反馈的修复重试；中间步保持 warning 不阻断。
6. truncated 续写增加滚动上限，防止上下文滚雪球。
7. folder 重试轮补 request capture，重试请求可独立复盘。

## 非目标

1. 不修改 API 直写、编辑器、权限语义、工具面。
2. 不替 SKILL 决定创作策略；S2 是否需要更多上下文由 SKILL meta 声明，应用只负责执行与记录。
3. 不引入新的用户确认或预览步骤。
4. 不回填旧 run trace；旧记录只作为 expected-failure 回放证据。

## 跨层影响

本方案改的是共享执行底座，不是正文层专用补丁：

| 层 | 受益 |
|---|---|
| 正文层 | schema 重试带错误、S2 口径透明、DEAI 分步、终步回显修复 |
| 卷纲层 | folder 重试反馈、warning 聚合、重试 request capture、续写上限 |
| 章节层 | 同卷纲层 |
| 设定层 | 同卷纲层 |
| 大纲/API 直写 | 不触碰执行协议，边界不变 |

## Phase 1：修复反馈闭环

### Task 1：folder schema retry 注入具体错误

改动：

- `src/services/realSkillExecutor.ts`
  - `buildRequest(promptSuffix)` 扩展为可接收校验反馈。
  - schema 校验失败后，下一轮请求 system prompt 追加：
    - 上一次输出未通过校验。
    - 具体错误列表，来自 `buildValidationErrorReport(validation.errors)`。
    - 明确要求修复这些错误，不输出解释。
  - 保留最后一次尝试的温度提升策略，不新增重试次数。

验收：

- 单测：第一次输出缺 `FACT_LOCK`，第二次请求 system 包含该错误文本；第二次输出合格后结果为 `success`。
- 单测：三次失败仍降级，且每次重试请求都携带上一次错误。
- 回归：非末步 schema warning 仍不触发重试，不改变现有 chain 语义。

### Task 2：章节/卷纲 repair prompt 带具体错误

改动：

- `src/services/chapterBatchOrchestrator.ts`
- `src/services/volumeBatchOrchestrator.ts`

修复 prompt 从“缺失区间 + 数量”升级为：

1. 缺失区间与数量。
2. 上一次验收的具体错误，例如重复标题清单、结构错误、数量错误。
3. 明确禁止重复的历史标题/卷名清单。

验收：

- 单测：短产修复请求包含重复标题错误。
- 单测：结构错误修复请求包含具体错误文本。
- 单测：正常生成路径 prompt 不变，避免无谓膨胀。

## Phase 2：真实请求口径与 warning 可见性

### Task 3：folder pass 输入语义进入 trace

改动：

- `src/services/realSkillExecutor.ts`
  - 每个物理请求构建后回调最终 messages，不再只在首帧捕获。
  - `apiMeta.requestMessages` 保存最后一次请求；新增 `attemptRequestMessages`（如类型允许）保存每轮请求，至少保证重试轮可复盘。
  - 新增诊断事件 `folder-pass-input`：
    - `passIndex`
    - `inputMode: original | previous`
    - `inputLength`
    - `userPromptLength`
    - `systemPromptLength`
    - `sampleCount`
    - `isRetry`
- `src/components/pipeline/PipelinePanel.vue`
  - `chain-context-slim` 事件保留上游瘦身决策，但新增字段 `measurement: upstream_prompt_only`。
  - 新增或复用事件记录 folder executor 的最终请求口径，字段包含 `finalUserPromptLength / finalSystemPromptLength / inputMode / retryAttempt`。

验收：

- 单测：multi-pass 第二 pass `input=previous` 时，trace 能看到 `inputMode=previous` 与真实 user 长度。
- 单测：重试轮 request capture 不再为空。
- 回放验证：旧正文 trace 在新验证器下标记 `final request caliber missing`，属于 expected-fail；新 trace 必须能直接读出 S2 真实 5.4K 级请求，而不是误报 full 100K。

### Task 4：chain warning 聚合进步骤日志

改动：

- `src/components/pipeline/PipelinePanel.vue`
  - `chain-handoff-contract-miss`
  - `chain-dedupe`（主链与升级链）
  - `chain-handoff-escalation`
  - `chain-output-echo`
  - `chain-handoff-contract-miss` 升级重试路径

实现要求：

- 全部接入 `appendStepLog(step, line)`。
- 增加 coalescing：同一 step 内同一 code 的重复 warning 合并为一行，显示次数和最新摘要，避免 UI 刷屏。
- warning 仍同时写入 run trace 事件流，步骤日志只是补可见性，不替代事件。

验收：

- 单测：同一 step 连续三次 `chain-dedupe` 只产生一条聚合日志，计数为 3。
- 单测：五类事件各自至少有一条步骤日志。
- Electron UI：真实运行中用户能直接看到 handoff 契约未命中、去重、升级全文重试、回显警告。

## Phase 3：上下文契约与 DEAI 分步

### Task 5：S2 上下文契约显式化

结论先行：**不默认把全书大纲塞回 S2。** S2 变薄是其 folder 多 pass 设计的结果，应用要做的是把语义显式化，并把决定权交给 SKILL meta 声明。

改动：

- `src/services/chainHandoff.ts`
  - `ChainHandoffTemplateMeta` 已有 `requiresFullPreviousOutput` 与 `requiresFullUpstreamContext`，保持协议不变。
- `src/services/realSkillExecutor.ts`
  - 新增可选 `chainUpstreamContext` 输入。
  - 当 SKILL meta 声明 `requiresFullUpstreamContext: true` 时，即使 pass `input=previous`，也在 user prompt 中保留声明的上游上下文；未声明时维持现状。
- `src/components/pipeline/PipelinePanel.vue`
  - 将 `upstreamPrompt.prompt` 作为 `chainUpstreamContext` 传入 folder executor。
  - trace 记录 `declaredFullUpstream / appliedFullUpstream / finalInputMode`。

验收：

- 单测：未声明时 pass `input=previous` 行为不变。
- 单测：声明 `requiresFullUpstreamContext` 时，S2 类请求同时包含上游上下文与上一 pass 输出。
- 单测：声明但上游为空时降级为现状并记录 warning，不制造空上下文膨胀。

### Task 6：DEAI per-step 配置

改动：

- `src/services/de-ai.ts`
  - 新增 `DEAI_CREATIVE_PROMPT`：S2 使用的正向风格指令，保留节奏、动作因果、潜台词等正向要求，去掉高压负面清单。
- `src/components/pipeline/PipelinePanel.vue`
  - `systemPromptSuffix` 从 `step === 4 ? DEAI_METHODOLOGY_PROMPT : ""` 改为按 chain step 分派：
    - S1：`DEAI_METHODOLOGY_PROMPT`
    - S2：`DEAI_CREATIVE_PROMPT`
    - S3：`DEAI_METHODOLOGY_PROMPT`
  - 文本技能路径同步分派，不允许 folder 与 text skill 双口径。

验收：

- 单测：S2 system prompt 不含完整 17 条负面方法论，包含正向风格指令。
- 单测：S1/S3 仍含完整方法论。
- 回归：非正文层不受影响。

## Phase 4：防滚雪球与回显修复

### Task 7：truncated continuation 上限

改动：

- `src/services/realSkillExecutor.ts`
  - continuation 请求保留一次；第二次仍 truncated 时停止续写，标记 `generation-truncated-after-continuation`。
  - 新增滚动上限：continuation 请求的 user 内容只携带已输出文本的尾部窗口（建议 32,000 字符），不携带完整已输出全文。
  - 达到上限仍不完整时保留可用输出并降级，不允许无限放大。

验收：

- 单测：一次 truncated 后续写成功，正常合并。
- 单测：连续两次 truncated 停止，不再发第三次。
- 单测：长输出 continuation 请求不超过尾部窗口上限。

### Task 8：终步回显触发修复重试

改动：

- `src/services/chainExecution.ts`
  - `detectChainOutputEcho` 保持检测逻辑。
  - 新增 `shouldRepairChainEcho(stepIndex, totalSteps, echoRatio)`：
    - 仅终步生效。
    - `echoRatio >= 0.85` 触发一次修复。
    - 中间步保持 warning，不阻断。
- `src/components/pipeline/PipelinePanel.vue`
  - 终步检测到高回显时，以“上一步输出与本步输出高度重复，请只输出本步骤定稿产物”为反馈重试一次。
  - 重试后仍高回显则保留 warning 并按现有契约验收，不无限重试。

验收：

- 单测：终步 93% 回显触发一次修复。
- 单测：中间步 93% 回显只 warning。
- 单测：修复后回显降低则不再触发。

## Phase 5：验证与收口

### Task 9：专项测试与全量回归

命令：

```powershell
npx vitest run `
  src/services/realSkillExecutor.spec.ts `
  src/services/chainExecution.spec.ts `
  src/services/chainHandoff.spec.ts `
  src/services/chapterBatchOrchestrator.spec.ts `
  src/services/volumeBatchOrchestrator.spec.ts
npm run type-check
npm run test:services
npm run build:vue
```

新增测试文件：

- `src/services/pipelineRepairFeedback.spec.ts`（如跨模块契约需要独立测试载体）
- `src/services/chainWarningAggregation.spec.ts`

### Task 10：历史 trace 回放验证器

新增：`scripts/verify-pipeline-repair-feedback-replay.mjs`

输入：

```powershell
node scripts/verify-pipeline-repair-feedback-replay.mjs `
  "C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-正文层-20261009-170714-deep/run-trace.json"
```

预期：

1. 识别旧 trace 的 folder schema retry 为 `missing validation feedback`。
2. 识别 S2 的 `chain-context-slim` 为 `misleading request caliber`。
3. 识别 S3 三次 FACT_LOCK 裸重试为 `repair feedback absent`。
4. 旧 trace 输出 `EXPECTED-FAIL`；新版本运行必须输出 `ACCEPTED`。

### Task 11：Electron 级真实 UI 验证

要求：真实启动应用、真实选择 SKILL、真实 API，不允许注入冒充。

场景：

1. 正文 chain 三步小规模运行。
2. S2 folder 多 pass 场景，确认步骤日志显示真实 pass 输入与请求长度。
3. 人为构造 schema 失败样例（测试 SKILL，不改生产 SKILL），确认重试请求携带错误反馈。
4. 终步高回显样例，确认一次修复重试。
5. warning 聚合显示，确认用户在 UI 直接可见。

验收证据：

- `summary.json`
- 新导出 run trace
- 截图
- 回放验证器对新 trace 输出 `ACCEPTED`

### Task 12：回头看与收口

1. diff 逐行审。
2. `rg` 反查所有旧路径：
   - `buildRequest(` 是否仍有无反馈 schema retry。
   - `chain-context-slim` 是否仍只有上游口径。
   - `DEAI_METHODOLOGY_PROMPT` 是否仍全步骤注入。
   - 五类 warning 是否仍有事件流孤儿。
3. 检查新旧并存：旧 trace 字段可读，新字段必须单源，不允许多口径。
4. 更新 `_audit/神意开发经验总结_v8.7.md`：
   - 新增“真实请求口径门禁”：trace 记录的长度必须来自最终 messages。
   - 新增“重试反馈门禁”：任何校验重试不得裸重试。
5. 更新 DEV_LOG 与 TASK_LEDGER。
6. 工作区清理，无测试脚本残留。
7. 版本升级 3.80.0 → 3.81.0，封装。

## 100% 闭环判定

满足以下全部条件才算 100%，任何一条缺失都只能登记未完成：

1. 四条正文层反馈各有对应代码修复与测试。
2. 五类 chain warning 在步骤日志可见且聚合。
3. folder 重试轮 request capture 可复盘。
4. trace 的最终请求口径与物理请求一致。
5. S2 上下文契约由 SKILL meta 声明，应用执行且记录。
6. DEAI per-step 生效，folder 与 text skill 双路径一致。
7. 续写与回显均有防滚雪球机制。
8. 专项测试、type-check、全量服务测试、build 全部通过。
9. 历史 trace 回放 expected-fail，新 trace 回放 accepted。
10. Electron 真实 UI + 真实 API 验证完成。
11. 回头看、经验文件、DEV_LOG、任务台账、工作区清理、版本封装完成。

## 风险与反证

| 风险 | 处理 |
|---|---|
| S2 声明全文后 token 成本上升 | 仅显式声明时生效；trace 记录成本；不默认开启 |
| DEAI 减配改变正文风格 | S2 保留正向风格指令；S1/S3 不变；live 验证对比输出质量 |
| warning 聚合刷屏 | 同 code 聚合计数，一行摘要 |
| request capture 增大内存 | 只保存当前 pass/attempt 的最终 messages，历史轮次靠 physicalCalls |
| 回显修复误伤合法终步 | 阈值 0.85 + 仅一次重试 + 重试后仍按契约验收 |
| continuation 尾部窗口丢前文 | 保留 requestMessages 原上下文，只限制已输出文本回显窗口 |

## 审核点

1. 是否批准 S2 上下文采用“meta 声明 + 应用执行”的方案？
2. 是否批准 S2 DEAI 使用正向风格指令替代完整负面方法论？
3. 是否批准回显修复阈值 0.85、一次重试？
4. 是否批准 continuation 尾部窗口 32,000 字符？

