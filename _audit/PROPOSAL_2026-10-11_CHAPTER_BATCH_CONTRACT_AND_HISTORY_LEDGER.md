# 章节层批次契约与历史标题台账修复方案

日期：2026-10-11
状态：EXECUTED / VERIFIED

## 结论

本次章节层运行记录证实了两个应用层缺陷：批次数量守恒缺失、历史标题未由应用单源注入。更深层的问题是章节层只有一个 `collected.length` 计数器，没有应用维护的章节事实台账；批次完成语义事实上外包给了 SKILL postProcess 的 warning/blocking 分类。

本方案把执行语义收回应用层：每个批次建立显式契约，短产自动补生成缺失区间，补不齐即失败并保留断点；每批注入全量历史标题清单和上一章事实；runTrace 记录批次验收结果。SKILL 仍只提供领域能力，不承担应用执行语义。

## 证据基线

- 运行记录：`C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-章节层-20261010-004549-deep/run-trace.json`
- 36 批中 5 批短产：`20→24`、`44→48`、`58→61`、`81→85`、`170→172`。
- 72 个 S1/S2 请求中 67 个历史标题为“未提供/待补信息”；仅 3 个出现历史标题且互相矛盾，证明是模型重构而非应用注入。
- 144 个步骤产生 196 条 postProcess warning，但 144/144 folder diagnostics 均为 `success`。
- 应用侧代码证据：
  - [PipelinePanel.vue:3677](../src/components/pipeline/PipelinePanel.vue) 批次起点只取 `collected.length`。
  - [PipelinePanel.vue:3692](../src/components/pipeline/PipelinePanel.vue) prompt 无历史标题清单。
  - [PipelinePanel.vue:3695](../src/components/pipeline/PipelinePanel.vue) 只在 `added.length === 0` 时重试。
  - [PipelinePanel.vue:3700](../src/components/pipeline/PipelinePanel.vue) 只过滤重复并截断，不校验短产。
  - [realSkillExecutor.ts:924](../src/services/realSkillExecutor.ts) 只有 blocking issue 才失败。

## 目标

1. 批次原子性：一批声明 `第X章到第Y章`，最终必须完整落盘该区间，缺章自动补生成。
2. 数量守恒：`实际输出章数 == 本批声明章数`，不相等不允许推进。
3. 历史单源：应用每批注入全量已生成标题清单与上一章标题/概要，消除 S2 虚构空间。
4. 执行语义收回：批次是否完成由应用契约判定，不由 SKILL postProcess severity 决定。
5. 可观测：每批记录验收事件，包括期望区间、实际数量、修复次数、失败原因。
6. 断点安全：批次失败时只保留此前完整批次，断点不包含半批数据。

## 非目标

1. 不修改章节层 SKILL 的模板、postProcess 规则和 severity 分类，那是 SKILL 层职责。
2. 不改变 API 直写、编辑器、权限面、长文档一次成型语义。
3. 不为历史标题清单设置应用侧 token 截断；标题本身是小体积结构化事实，是否超窗交给现有上下文预算层判定。
4. 不回溯修复旧运行数据；旧项目数据无法重建缺失区间事实，只能在新运行中生效。

## 架构设计

### 1. 新服务：`src/services/chapterGenerationContract.ts`

职责：纯函数契约与台账，不发起 API 请求，便于单测。

```ts
export interface ChapterBatchContract {
  volumeId: string
  batchIndex: number
  expectedStart: number   // 1-based，含
  expectedEnd: number     // 1-based，含
  requestedCount: number
  totalChapters: number
}

export interface ChapterHistoryFacts {
  totalGenerated: number
  titles: Array<{ index: number; title: string }>
  lastChapter?: { index: number; title: string; plot: string }
}

export function buildChapterHistoryFacts(chapters: any[]): ChapterHistoryFacts
export function renderChapterHistoryContext(facts: ChapterHistoryFacts): string
export function validateChapterBatch(
  chapters: any[],
  contract: ChapterBatchContract,
  existingTitles: Set<string>
): { valid: boolean; errors: string[]; missingCount: number }
export function validateChapterGenerationLedger(
  contracts: ChapterBatchContract[],
  totalChapters: number
): { valid: boolean; errors: string[] }
```

规则：

- `renderChapterHistoryContext` 输出 `[已生成章节标题清单]` 全量 `第N章《标题》`，以及 `[上一章事实]` 的标题与概要。
- `validateChapterBatch` 校验数量、标题非空、概要非空、无历史重复、无批内重复。
- `validateChapterGenerationLedger` 校验区间从 1 开始、连续、无重叠，覆盖到 `totalChapters`。

### 2. 新服务：`src/services/chapterBatchOrchestrator.ts`

职责：把“模型调用 + 契约验收 + 缺章补生成”做成可注入 API 的独立编排器，避免把逻辑埋进 3600 行的 Vue 组件。

```ts
export interface GenerateChapterBatchInput {
  contract: ChapterBatchContract
  historyTitles: Set<string>
  callChapterApi: (prompt: string) => Promise<string>
  maxRepairAttempts?: number   // 默认 3
  onAttempt?: (attempt: ChapterBatchAttempt) => void
}

export interface ChapterBatchResult {
  status: 'complete' | 'incomplete'
  chapters: any[]
  attempts: ChapterBatchAttempt[]
  errors: string[]
}
```

执行语义：

1. 首次调用按原区间生成。
2. 解析、过滤历史重复后，若 `chapters.length < requestedCount`，发起补生成请求，明确要求“只补第X章到第Y章，共N章”。
3. 补生成结果继续去重、校验、合并。
4. 达到 `requestedCount` 才返回 `complete`。
5. 修复次数用尽仍不足，返回 `incomplete`，不返回半批数据。

### 3. 修改 `PipelinePanel.vue` 的 `genChapters`

1. 构建每批 `ChapterBatchContract`。
2. prompt 追加 `renderChapterHistoryContext(...)` 输出的全量标题清单与上一章事实。
3. 用 `chapterBatchOrchestrator.generateChapterBatch(...)` 替换现有“空结果才重试”的循环。
4. 只有 `status === 'complete'` 才 `collected.push(...)`、写 store、保存断点。
5. `incomplete` 时保存 `batch-incomplete` 断点并失败收口，错误信息包含期望区间、实际数量、修复次数。
6. 成功批次写 trace 事件 `chapter-batch-validated`。
7. 最终除现有 `validateChapters` 外，再执行 `validateChapterGenerationLedger`。

### 4. runTrace 同步

- `RUN_TRACE_SCHEMA_VERSION` 从 15 升至 16。
- 新事件类型 `chapter-batch-validated`，payload 包含：
  - `batchIndex`、`expectedStart`、`expectedEnd`、`requestedCount`
  - `actualCount`、`repairAttempts`、`status`
  - 失败时附 `errors`
- 现有 `write` 事件保留，但批次验收以新事件为准。
- 同步更新 runTrace schema/export 兼容测试，禁止只加事件不更新测试。

## 文件与任务拆分

### Task 1：契约与台账服务

- Create: `src/services/chapterGenerationContract.ts`
- Test: `src/services/chapterGenerationContract.spec.ts`

测试覆盖：

1. 全量标题清单渲染，含 172 章规模样例。
2. 上一章事实渲染；无历史时输出“暂无已生成章节”。
3. 批次完整通过。
4. 短产、空标题、空概要、历史重复、批内重复分别失败。
5. 台账校验：从 1 连续到 172 通过；断档、重叠、末批不足失败。

### Task 2：批次编排器

- Create: `src/services/chapterBatchOrchestrator.ts`
- Test: `src/services/chapterBatchOrchestrator.spec.ts`

测试覆盖：

1. 首次输出正好 5 章，直接 complete。
2. 首次 4 章，修复请求补 1 章，合并后 complete；断言修复 prompt 包含缺失区间。
3. 修复返回历史重复标题，被过滤后继续修复。
4. 修复 3 次仍 4 章，返回 incomplete，且 `chapters.length === 0`。
5. API 抛错时不吞异常，attempt 记录错误。

### Task 3：Pipeline 接线

- Modify: `src/components/pipeline/PipelinePanel.vue`

验收：

1. prompt 中出现 `[已生成章节标题清单]` 和 `[上一章事实]`。
2. 批次短产时不再推进 `collected.length`。
3. `incomplete` 保存 `batch-incomplete` 断点并失败收口。
4. 成功批次写 `chapter-batch-validated` 事件。

### Task 4：runTrace schema 与观测

- Modify: `src/stores/runTrace.ts`
- Test: `src/stores/runTrace.spec.ts`

验收：

1. schemaVersion 为 16。
2. 事件生产 → 入口回填 → 导出 JSON 均能看到 `chapter-batch-validated` payload。

### Task 5：真实运行记录回放验证器

- Create: `scripts/verify-chapter-batch-contract-replay.mjs`

用途：读取本次 27MB run trace，重建 36 个批次契约，按新规则验收历史进度序列。

预期结果：检测出 5 个短产批次，并在 B5 首次短产处判定“不可推进”。这证明新契约能拦住本次事故，而不是只在理想样例上通过。

### Task 6：Electron 级真实 UI 小规模实测

使用独立 profile 与测试数据目录，通过真实 UI 选择卷并触发章节生成。规模控制为 12 章、批次 5，共 3 批，走真实章节层链式 SKILL 与真实供应商 API。

验收：

1. 三批均产生 `chapter-batch-validated` 且 `actualCount === requestedCount`。
2. 第 2、3 批请求 payload 包含真实历史标题清单，不再是“未提供/待补信息”。
3. 全部完成后 trace 状态 success，台账校验通过。
4. 中途取消或失败时断点只保留完整批次。

说明：短产修复路径由单测和回放验证器证明；真实供应商无法稳定强制短产，不用造假请求冒充该路径。

执行结果：已完成并验证。成功轮 `run-1791703645571-1` 曾通过 12 章、3 批、12 次 API success，脚本输出 `===== CHAPTER BATCH CONTRACT ELECTRON LIVE PASSED =====`，summary 曾写入 `_audit/verification-chapter-batch-contract-live/summary.json`。因供应商成本/时间不划算，用户批准本轮不重跑 live，以单测 + 事故回放 + 该 summary 口径作为证据；payload 原件因清理策略未留存，如实登记，不冒充实物证据。中断轮现场 `electron-run.log` / `heartbeat.jsonl` 保留，仅证明中断轮状态。

## 验证命令

```powershell
npx vitest run src/services/chapterGenerationContract.spec.ts src/services/chapterBatchOrchestrator.spec.ts src/services/narrativeValidation.spec.ts src/stores/runTrace.spec.ts
npm run type-check
npm run test:services
node scripts/verify-chapter-batch-contract-replay.mjs "C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-章节层-20261010-004549-deep/run-trace.json"
```

本轮新鲜结果：专项单测 105/105；全量服务测试 1697/1697；type-check 通过；build:vue 通过；事故回放在 B5 短产处 `REJECTED (1 short batch at stop point)`，exit 1 为预期正确结果。

## 风险与反证

1. **补生成仍短产**：最多修复 3 次，然后显式失败并保留断点；不允许滑动推进。
2. **历史标题很长**：只注入标题与上一章概要，不注入全文；不做应用侧截断。若供应商窗口不足，由现有上下文预算层显式处理。
3. **旧断点恢复**：旧断点只有数量没有台账，恢复后从当前数量继续建立新台账；不伪造旧区间事实。
4. **模型输出多余章节**：仅接受当前区间所需数量，多余项丢弃并记录在 attempt 中。
5. **SKILL warning 仍存在**：warning 保留为领域质量信号，但不参与应用批次完成判定。
6. **中段缺章不可检测**：当前 S4 JSON 不含章节序号，应用只能保证数量与区间原子性；要求增加序号会改变 SKILL 协议，超出本轮应用层边界。此限制如实登记，不伪装成已解决。

## 成熟度评估

- 执行器/工具层：成熟。现有 vitest、runTrace、Electron 验证体系可直接承载。
- 应用方案/交互闭环：成熟。批次原子性、历史单源、失败断点、观测事件形成闭环。
- 实现接线：未开始，属执行阶段工作。
- 验证标准：成熟。单测 + 全量服务测试 + 真实事故回放 + Electron 真实 UI 小规模链路。

整体结论：已执行并验证。诚实边界：live 成功轮 payload 原件因清理策略未留存；中段缺章受 S4 JSON 无章节序号限制，登记为遗留边界。
