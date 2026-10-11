# 流水线产物契约统一方案（卷纲层 / 设定层 / 正文层）

日期：2026-10-11
状态：已执行 / 已验证 / 已闭环（2026-10-12）

## 结论

章节层的 `Contract + Orchestrator + Trace Event` 模式已经被真实事故回放与单测证明有效：应用层不再依赖 SKILL 的 warning/blocking 判断批次是否完成，而是由契约判定数量守恒、历史事实与断点安全。

本方案将该模式推广到剩余三层，但不做机械复制。三层的契约语义不同：

1. **卷纲层**：同构度最高，直接复用“计划数量守恒 + 全量历史事实单源注入 + 短产修复”的形态。
2. **设定层**：没有预设目标数量，不适用数量守恒；契约核心是“可接受设定项的结构合法性、去重语义、非空内容、分类归属”，并显式记录丢弃原因。
3. **正文层**：契约核心是“章节正文产物质量门”，包括非空、目标字数区间、续写完整性；同时修复 `bodyGenerated` 在空正文时也被置 `true` 的状态缺陷。

统一原则保持不变：**SKILL/Agent 只提供领域能力；产物是否可落盘永远由应用层契约判定。**

## 证据基线

- 参考模式：[chapterGenerationContract.ts](../src/services/chapterGenerationContract.ts)、[chapterBatchOrchestrator.ts](../src/services/chapterBatchOrchestrator.ts)、[PipelinePanel.vue:3597](../src/components/pipeline/PipelinePanel.vue)。
- 章节层已验证方案：`_audit/PROPOSAL_2026-10-11_CHAPTER_BATCH_CONTRACT_AND_HISTORY_LEDGER.md`。
- 卷纲层现状：
  - [PipelinePanel.vue:3426](../src/components/pipeline/PipelinePanel.vue) `genVolumes` 只有空解析重试一次；短产、超产、数量不守恒不触发修复。
  - [volumeGeneration.ts](../src/services/volumeGeneration.ts) `clampGeneratedVolumes` 对 `single/continue` 截取 1 项，但 `auto` 模式不校验返回数等于计划卷数。
  - [narrativeValidation.ts:23](../src/services/narrativeValidation.ts) 已有 `validateVolumeNarrative`，当前只在写入前调用，未参与生成闭环。
  - `single/continue` prompt 只注入上一卷全文，没有全量卷事实清单。
- 设定层现状：
  - [PipelinePanel.vue:3359](../src/components/pipeline/PipelinePanel.vue) 单次调用；只过滤 `s.name`；同分类按名称去重；跨分类重复、空内容、非法字段、数量异常均无契约。
  - 运行记录 `run-trace-设定层-20261009-123018-deep` 只有 `write` 事件，无产物验收事件。
- 正文层现状：
  - [PipelinePanel.vue:3978](../src/components/pipeline/PipelinePanel.vue) `ch.bodyGenerated = true` 无条件置位，空正文也会标记为已生成。
  - 目标字数只进入 prompt，不参与验收。
  - 运行记录 `run-trace-正文层-20261009-170714-deep` 为 `degraded`，写入口径记录 3800 字，但没有任何“正文产物是否合格”的事件。
- runTrace：[runTrace.ts:750](../src/stores/runTrace.ts) 当前 schemaVersion 16；事件 type 为自由字符串，新增事件类型无需改类型定义。

## 目标

1. 每层产物在写入项目前必须通过应用层契约；契约失败不允许落盘半成品。
2. 每层都有可注入 API 的编排器，短产/低质产物可自动修复，修复失败进入显式失败态。
3. 每层都有关键历史事实单源注入，模型不再靠猜补上下文。
4. 每层都有 `*-validated` trace 事件，payload 足够独立复盘验收决策。
5. 三层契约共享同一套语义命名（`contract / attempt / validated`），降低后续维护与验证器成本。

## 非目标

1. 不修改各层 SKILL 模板、folder postProcess 规则、severity 分类；SKILL 质量信号保留，但不决定应用产物验收。
2. 不改变 API 直写、编辑器、权限、长文档一次成型链路。
3. 不回溯修复旧项目数据；旧数据缺少契约事实，只保证新运行生效。
4. 不引入新的用户确认/预览步骤；契约是应用内验收，不新增交互负担。

## 分层设计

### Phase 1：卷纲层（优先级最高）

**新服务**：`src/services/volumeGenerationContract.ts`

```ts
export interface VolumeGenerationContract {
  mode: 'auto' | 'single' | 'continue'
  expectedCount: number        // auto = 计划卷数；single/continue = 1
  existingCount: number
  totalPlannedVolumes: number
}

export interface VolumeHistoryFacts {
  totalGenerated: number
  volumes: Array<{ index: number; name: string; summary: string; allocatedWords: number }>
}

export function buildVolumeHistoryFacts(volumes: unknown[]): VolumeHistoryFacts
export function renderVolumeHistoryContext(facts: VolumeHistoryFacts): string
export function validateVolumeBatch(volumes: unknown[], contract: VolumeGenerationContract): VolumeBatchValidation
export function validateVolumeGenerationLedger(actualCount: number, totalPlannedVolumes: number): { valid: boolean; errors: string[] }
```

规则：

- `validateVolumeBatch`：数量必须等于 `expectedCount`；每卷 `name/outline|summary` 非空；`allocatedWords` 为非负整数；卷名不与历史重复、不批内重复。
- `renderVolumeHistoryContext`：输出 `[已生成卷事实清单]`，包含每卷序号、卷名、摘要、已分配字数；替代当前“只给上一卷全文”的记忆方式。
- `validateVolumeGenerationLedger`：auto 完成后实际卷数必须等于计划卷数；single/continue 每次只允许推进 1 卷且不越过计划上限。

**新编排器**：`src/services/volumeBatchOrchestrator.ts`

```ts
export interface GenerateVolumeBatchInput {
  contract: VolumeGenerationContract
  historyVolumes: Array<{ name: string }>
  callVolumeApi: (prompt: string) => Promise<string>
  maxRepairAttempts?: number  // 默认 3
  onAttempt?: (attempt: VolumeBatchAttempt) => void
}
```

执行语义：

1. 首次请求按原模式生成。
2. 解析后先 `clampGeneratedVolumes`，再契约验收。
3. 短产时补生成明确缺失的卷区间；超产时只保留契约所需数量并记录丢弃原因。
4. 达到契约数量且校验通过才返回 `complete`；修复用尽仍不足返回 `incomplete`，不落半批。
5. 取消语义与章节层一致：返回 `incomplete`，错误为“已被用户取消”。

**Pipeline 接线**：

- `genVolumes` 改用编排器；prompt 追加全量卷事实清单。
- 成功批次写事件 `volume-batch-validated`，payload 含 `mode/expectedCount/actualCount/repairAttempts/status`。
- auto 完成后执行 `validateVolumeGenerationLedger`；失败保留断点并显式失败。
- 保留现有 `volume-budget-clamped`、`write` 事件；新增事件不替代预算观测。

### Phase 2：设定层

**新服务**：`src/services/settingsArtifactContract.ts`

```ts
export interface SettingsArtifactContract {
  requireName: true
  requireContent: true
  allowedEmptyCount: 0
}

export interface SettingsArtifactValidation {
  valid: boolean
  accepted: any[]
  rejected: Array<{ item: any; reason: string }>
  errors: string[]
}

export function validateSettingsArtifact(items: unknown[], existing: Array<{ category: string; name: string }>): SettingsArtifactValidation
```

规则：

1. `name` 非空、非纯符号。
2. `content/attrsText/attrs` 至少一项非空；不允许“有名字无内容”的空壳设定。
3. 归一化分类：缺失分类归入“设定类”，不允许模型发明空分类。
4. 去重语义：同分类内同名去重；跨分类同名默认允许（同一实体可出现在不同分类是设定集常见形态），但记录 warning，不判失败。
5. 全部项被拒绝时契约失败；部分拒绝时成功落盘 accepted，并记录 rejected 与原因。

**新编排器**：`src/services/settingsArtifactOrchestrator.ts`

- 首次生成后验收；若全部无效或有效项为 0，携带错误重试一次。
- 部分有效时默认落盘，不为了“完美全收”反复消耗 API；这是与章节/卷纲数量守恒的关键差异。
- 事件 `settings-artifact-validated`，payload 含 `acceptedCount/rejectedCount/reasons/repairAttempts`。

### Phase 3：正文层

**新服务**：`src/services/bodyArtifactContract.ts`

```ts
export interface BodyArtifactContract {
  chapterId: string
  targetWords: number
  minWords: number   // 默认 targetWords * 0.6
  maxWords: number   // 默认 targetWords * 2.0，允许供应商正常浮动
}

export function validateBodyArtifact(body: string, contract: BodyArtifactContract): {
  valid: boolean
  errors: string[]
  wordCount: number
}
```

规则：

1. 非空正文是硬门；空正文禁止写入、禁止 `bodyGenerated = true`。
2. 目标字数区间默认 `60%~200%`；区间可配置但不做用户可见新设置面。
3. 只做中文汉字/常用字符计数，避免把 JSON 标记、空白、包裹符计为正文。
4. 截断/续写完整性不做猜测判定；没有证据时只登记 `untested`，不假装可检测。

**新编排器**：`src/services/bodyArtifactOrchestrator.ts`

- 空正文或字数过短时携带明确错误重试，默认最多 3 次。
- 合格正文进入现有 DeAI 后处理；DeAI 后处理不改变契约判定结果，只在事件中记录后处理前后的字数。
- 事件 `body-artifact-validated`，payload 含 `chapterId/targetWords/wordCount/ratio/status/repairAttempts`。
- `genBody` 与批量生成入口 `genBodyForSelected` 同批接入，避免单章入口修好、批量入口仍写旧状态。

## 统一 Trace 设计

`RUN_TRACE_SCHEMA_VERSION` 16 → 17。

| 层 | 事件 | 关键 payload |
|---|---|---|
| 卷纲 | `volume-batch-validated` | mode, expectedCount, actualCount, repairAttempts, status, errors |
| 设定 | `settings-artifact-validated` | acceptedCount, rejectedCount, reasons, repairAttempts |
| 正文 | `body-artifact-validated` | chapterId, targetWords, wordCount, ratio, status, repairAttempts |

同步要求：事件生产 → `PipelinePanel` 入口回填 → runTrace 存储 → 导出 JSON 四面同批断言；禁止只写事件不更新 schema/export 测试。

## 任务拆分

### Task 1：卷纲契约与编排器

- Create: `src/services/volumeGenerationContract.ts`
- Create: `src/services/volumeGenerationContract.spec.ts`
- Create: `src/services/volumeBatchOrchestrator.ts`
- Create: `src/services/volumeBatchOrchestrator.spec.ts`

验收：auto 短产/超产、single/continue 多产截取、历史重复、空卷纲、取消、修复用尽全部有单测；修复 prompt 明确缺失卷区间。

### Task 2：卷纲 Pipeline 接线

- Modify: `src/components/pipeline/PipelinePanel.vue`

验收：`genVolumes` 三模式都走编排器；prompt 含 `[已生成卷事实清单]`；`volume-batch-validated` 可在 trace 中看到；auto 数量不守恒不再落盘。

### Task 3：设定契约与编排器

- Create: `src/services/settingsArtifactContract.ts`
- Create: `src/services/settingsArtifactContract.spec.ts`
- Create: `src/services/settingsArtifactOrchestrator.ts`
- Create: `src/services/settingsArtifactOrchestrator.spec.ts`
- Modify: `PipelinePanel.vue` `genSettings`

验收：空壳设定、无有效项、部分拒绝、跨分类同名 warning、全部拒绝后重试均有单测；trace 出现 `settings-artifact-validated`。

### Task 4：正文契约与编排器

- Create: `src/services/bodyArtifactContract.ts`
- Create: `src/services/bodyArtifactContract.spec.ts`
- Create: `src/services/bodyArtifactOrchestrator.ts`
- Create: `src/services/bodyArtifactOrchestrator.spec.ts`
- Modify: `PipelinePanel.vue` `genBody` / `genBodyForSelected`

验收：空正文不落盘且 `bodyGenerated` 保持 `false`；过短正文触发修复；合格正文正常写入；两个生成入口行为一致。

### Task 5：runTrace schema 17 与观测闭环

- Modify: `src/stores/runTrace.ts`
- Modify: `src/stores/runTrace.spec.ts`

验收：schemaVersion 17；三个新事件的生产 → 存储 → 导出链路均有断言；旧 schema 16 数据可读。

### Task 6：三层真实运行记录回放验证器

- Create: `scripts/verify-pipeline-artifact-contracts-replay.mjs`

输入：

```powershell
node scripts/verify-pipeline-artifact-contracts-replay.mjs `
  "C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-卷纲层-20260918-224640-deep/run-trace.json" `
  "C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-设定层-20261009-123018-deep/run-trace.json" `
  "C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-正文层-20261009-170714-deep/run-trace.json"
```

预期：旧 trace 在新契约下被标为 `missing validated event / contract not enforced`；这是 expected-failure 证据，证明新契约能识别旧运行缺少应用层验收，而不是只在理想样例上通过。

### Task 7：Electron 级真实 UI 小规模实测

使用独立 profile 与测试数据，真实 UI 触发三层小规模生成：

1. 卷纲：3 卷 auto + 1 次 single/continue，断言全量卷事实注入与 `volume-batch-validated`。
2. 设定：单次生成，断言 accepted/rejected 统计与 trace 事件。
3. 正文：1 章正常生成，断言字数区间、`bodyGenerated` 与 `body-artifact-validated`。

说明：短产/空正文修复路径由单测和回放验证器证明；真实供应商无法稳定强制短产，不用造假请求冒充该路径。live 如因供应商成本未执行，只能登记 `untested`，不得引用历史 summary 冒充本轮证据。

## 验证命令

```powershell
npx vitest run `
  src/services/volumeGenerationContract.spec.ts `
  src/services/volumeBatchOrchestrator.spec.ts `
  src/services/settingsArtifactContract.spec.ts `
  src/services/settingsArtifactOrchestrator.spec.ts `
  src/services/bodyArtifactContract.spec.ts `
  src/services/bodyArtifactOrchestrator.spec.ts `
  src/services/narrativeValidation.spec.ts `
  src/stores/runTrace.spec.ts
npm run type-check
npm run test:services
node scripts/verify-pipeline-artifact-contracts-replay.mjs `
  "C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-卷纲层-20260918-224640-deep/run-trace.json" `
  "C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-设定层-20261009-123018-deep/run-trace.json" `
  "C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-正文层-20261009-170714-deep/run-trace.json"
```

## 风险与反证

1. **卷纲字数预算与契约冲突**：契约只验收数量与结构，字数预算仍由 `volumePlanIntegrity` 钳制；两个失败原因分开记录，不互相吞并。
2. **设定层部分拒绝是否算失败**：部分有效即落盘，避免为“全收”反复调用 API；全部无效才失败。若客户实测认为应更严格，再调整契约阈值，不在本轮擅自加严。
3. **正文字数区间误伤**：默认 60%~200% 是保守区间；若真实供应商常低于 60%，以真实 trace 为证据调整下限，禁止拍脑袋放宽。
4. **批量正文入口漏改**：Task 4 明确覆盖 `genBody` 与 `genBodyForSelected` 两个入口，并用 rg 复核 `bodyGenerated = true` 写点。
5. **旧断点恢复**：旧断点无契约台账，恢复后从当前事实重建新台账；不伪造旧契约事件。
6. **回放验证器假阳性**：旧 trace 缺新事件是预期结果；验证器必须区分“旧版本运行”与“新版本漏写事件”，按 schemaVersion 分支判断。

## 停止条件

1. 三层新服务、编排器、Pipeline 接线、runTrace schema 17、导出测试全部完成。
2. 专项单测、type-check、全量服务测试通过。
3. 三个真实 trace 回放均产生 expected-failure 证据。
4. Electron live 三层小规模链路通过；若因供应商成本未跑，登记 `untested` 并等待用户决策。
5. 回头看完成：diff 逐行审、生产入口与旁路双向扫描、证据属于本轮核对、遗留项写入 DEV_LOG 与任务台账。

## 成熟度评估

- 执行器/工具层：成熟。章节层已验证同构模式，vitest、runTrace、回放与 Electron 验证体系可直接承载。
- 应用方案/交互闭环：成熟。三层契约语义按产物性质区分，不机械复制数量守恒；失败路径、修复路径、观测路径均有定义。
- 实现接线：未开始，属执行阶段工作；本方案已列明文件与入口。
- 验证标准：成熟。单测 + 全量服务测试 + 真实事故回放 + Electron 真实 UI；每层证据边界明确。

整体结论：**成熟，可执行**。执行时仍需按 G0.5 回头看与 G0.12 任务台账收尾；live 验证未完成前不得宣称最终闭环。

## 执行与验证结果（2026-10-12 收口）

1. 三层契约与编排器已实现并接线：`volumeGenerationContract / volumeBatchOrchestrator / settingsArtifactContract / settingsArtifactOrchestrator / bodyArtifactContract / bodyArtifactOrchestrator`，`PipelinePanel` 三层入口消费同一契约，runTrace schema 升至 17。
2. 全量回归：`npm run test:services` → 147 files / 1757 tests 全部通过；`npm run type-check` → exit 0；`npm run build:vue` → exit 0（仅既有 Vite chunk/config warning）。
3. live Electron + 真实 API：`scripts/verify-pipeline-artifact-contracts-electron.mjs` 于 2026-10-12 00:45 完成四层真实运行；证据为 `_audit/verification-pipeline-artifact-contract-live/summary.json`、`final-state.png`、`heartbeat.jsonl` 与三层导出目录。
4. live 导出独立复核：`node scripts/verify-pipeline-artifact-contracts-replay.mjs <live volume> <live settings> <live body>` → 三层全部 `RESULT: ACCEPTED`。
5. 历史回放口径：卷纲 / 设定 / 正文三条历史记录为 `EXPECTED-FAIL`，原因是旧 schema 运行缺少新契约事件；该结果证明新契约能识别旧版本缺应用层验收，不作为当前缺陷。
6. 存储断点副作用：`storage:remove` 未同步删除 `.bak` 导致卷纲层 `.bak` 断点复活，已随本方案修复；详见 `_audit/TASK_LEDGERS/2026-10-11_storage-breakpoint-bak-resurrection.md`。
7. 证据边界：`electron-run.log` 只捕获 Electron 子进程输出，`PASSED` 由验证器主进程输出，不在该文件中；`ELECTRON CLOSE code=1` 是关闭子进程的退出码，不代表验证失败。完成证据以 `summary.json`、三层 trace 导出与回放器复核为准。
