# 意图路由语料自成长系统 V2 开发日志

日期：2026-09-22

## Phase 0：基线与影响圈

### 门禁复读

- M8：采集链路必须与 runTrace / DiagLogger 双侧对账。
- M17：每阶段收尾执行回头看，包含目标对账、diff 归属、生产入口全量盘点。
- M34：观测样本必须与真实 API 请求同源，禁止用旧 trace 或 UI 反推冒充现场。
- M40：fallback 点击、跨轮标注、写盘失败等用户可感知行为必须做 Electron 级真实 UI 验证。
- M42：任务收尾前执行分层清理，历史脏工作区不得误删，也不得把本轮验证证据当残留清理。
- M52：只有 confirmed 真实样本可进校准候选；影子语料物理隔离，禁止进 train/dev/test；写入类安全阈值不得放宽。

### 影响圈

生产决策入口：

- `src/services/workspaceSkillEngine.ts`
  - `resolveWorkspaceIntentRouting()`：chain 模式主路由入口。
  - `fallback_requested` 事件：fallback 气泡与 awaiting_confirmation 的现场来源。
- `src/components/common/OutlineWorkspace.vue`
  - outline direct 对话路由事件消费与 fallback 点击。
- `src/components/chat/ChatPanel.vue`
  - home direct 对话路由事件消费与 fallback 点击。

观测与关联：

- `src/stores/runTrace.ts`
  - `startTurn()` / `finishTurn()` / `updateTurnIntent()` / `startAwaitingUser()` / `finishAwaitingUser()`。
  - 采集样本必须携带 runId、turnId、workspace、projectId，保证可回溯。
- `src/services/diag.js`
  - 采集失败与落盘状态走 DiagLogger，不允许抛回主链路。

存储与桥接：

- `electron/ipc/runTrace.js`
  - 复用其原子写、临时文件、写锁模式。
- `electron/preload.js`
  - 新增 intent corpus IPC 暴露。
- `electron/main.js`
  - 注册新 IPC，并接入当前 dataDir 初始化。

校准与评估：

- `src/services/chainIntentEvalData.ts`
- `scripts/calibrate-intent-routing-thresholds.mjs`
- 真实语料与社区影子语料必须物理分文件、分类型。

明确不动：

- 不修改生产阈值常量。
- 不修改 `INTENT_EXAMPLES` 生产示例库。
- 不改变 fallback 判定语义和 API 请求构建。
- 不处理与意图路由语料采集无关的历史脏文件。

### 基线证据

命令：

```powershell
npx vitest run src/services/chainIntentRouter.spec.ts src/services/workspaceSkillEngine.spec.ts
```

结果：

```text
Test Files  2 passed (2)
     Tests  66 passed (66)
```

### Phase 0 结论

基线通过，影响圈已锁定，可以进入 Phase 1。

## Phase 1：采集与存储底座

### 实现

- 新增 `src/services/intentCorpusCollector.ts`：消费引擎路由决策，不反推 UI；样本携带 runId / turnId / workspace / projectId，保证与 runTrace 同源可回溯。
- 新增 `electron/ipc/intentCorpus.js`：主进程负责 JSONL append、manifest/index 维护、原子写、10000 条环形覆盖与 byHash 去重。
- 接线 `electron/preload.js` 与 `electron/main.js`，向 renderer 暴露 append / status / exportPackage IPC。
- 采集为观测层：写盘失败走 DiagLogger，不抛回主链路，不阻塞对话与编辑器写入。

### 验证

```powershell
npx vitest run src/services/intentCorpusCollector.spec.ts
```

结果：intentCorpusCollector 专项测试通过，覆盖写入、去重、环形、失败 fail-open。

## Phase 2：标注回流

### 实现

- 三级标注：`confirmed`（fallback 显式选择）、`inferred`（跨轮行为推断）、`observed`（纯观测）。
- `stageIntentCorpusInference()` 在 fallback/低置信时暂存本轮现场，`consumeIntentCorpusInference()` 在下一轮读取并判定是否可升级 inferred。
- `recordIntentRoutingConfirmation()` 在用户点击 fallback 气泡后落 confirmed 样本；confirmed 优先级最高，但 suppression 机制只抑制一次 observed，避免后续真实观测被永久吞掉。
- 推断有效期 10 分钟，超时或证据不足降级 observed。

### 接线

- Home：`ChatPanel.vue` sendMessage 内 startHomeRun 后先 consume 上一轮，再 stage 本轮，最后 record observed。
- Outline：`OutlineWorkspace.vue` askAi 与 askPlainAi 均按同一顺序接线，fallback continue 走 confirmed 记录。

### 验证

- `intentCorpusCollector.spec.ts` 覆盖三级标注、confirmed 抑制一次性、有效期与降级。
- Electron 场景 2/3 实测 confirmed 与 inferred 落盘。

## Phase 3：治理与导出

### 实现

- 输入归一化后 hash 去重，同输入保留最新路由现场。
- 输入长度钳制 2000 字，避免语料库变成项目全文存储。
- 项目作用域保留；导出默认 project scope，避免跨项目混装。
- 导出 schema 为 `shenyi.intent-corpus-package`，包含 manifest 与分级样本，不包含 API key、项目正文或完整 response。

### 验证

- 单测覆盖去重、长度钳制、项目过滤与导出字段。
- Electron 场景 5 导出 project 语料包，5 条样本分级正确；场景 6 确认包泄漏 0、磁盘泄漏 0。

## Phase 4：社区影子语料层

### 实现

- 新增 `src/services/shadowIntentCorpus.ts`，承载社区影子句式。
- 影子语料与真实语料物理分文件，schema 独立：`shenyi.shadow-intent-corpus`。
- 影子层只做分数分布与盲区诊断，永不进入 train/dev/test，永不参与阈值选择。

### 验证

- `shadowIntentCorpus.spec.ts` 锁定影子隔离。
- Electron 场景 6 验证导出包与真实 JSONL 均无影子样本泄漏。

## Phase 5：影子校准与升级包

### 实现

- `scripts/calibrate-intent-routing-thresholds.mjs` 接入：
  - `SHENYI_INTENT_CORPUS_PACKAGE`：真实语料包，仅 confirmed 样本可进候选。
  - `SHENYI_INTENT_SHADOW_CORPUS`：影子语料，只做泄漏检测与诊断。
- 硬约束继续由 M52 保护：writeFalseTriggers = 0、missedRejections = 0 才能成为候选；写入类安全阈值禁止放宽。
- 输出 `_audit/intent-routing-v6-phase6-calibration.json`，只作为建议升级包，不自动改生产常量。

### 事故与修复

回头看发现脚本真实缺陷：Phase 5 给脚本接入真实语料包时，`allSamples` 在 `realCorpus` 声明之前引用 `realCorpus.samples`，形成 TDZ ReferenceError。此前只做了局部接入检查，没有重跑完整校准脚本，导致缺陷漏网。

修复：将 `realCorpus` 与 `shadowSamples` 声明移动到 `allSamples` 之前，保持四段样本展开顺序不变。

修复后完整重跑：

```powershell
node scripts/calibrate-intent-routing-thresholds.mjs
```

结果：

- best 策略 centroid，阈值 analyze 0.30 / edit 0.34 / generate 0.34 / discuss 0.30。
- dev 8/9，writeFalseTriggers 0，missedRejections 0，discussBlocked 1。
- train 9/10（falseRejections 2），test 8/9（falseRejections 1）。
- 证据落盘 `_audit/intent-routing-v6-phase6-calibration.json`，generatedAt 为 2026-09-21T21:31:39.750Z。

该事故已回写经验文件为 M53 门禁。

## Phase 6：Electron 级真实 UI 验证

### 验证脚本

`scripts/verify-intent-corpus-electron.mjs`

### 七场景结果（含 2026-09-22 回头看补修）

1. observed-routing：正常 discuss 对话自动采样，pass。
2. fallback-confirmation：低置信输入触发 fallback，用户点击后生成 confirmed 样本，pass。
3. next-turn-inference：用户下一轮重述写入意图，生成 inferred 样本且 relatedTurnId 匹配，pass。
4. write-failure-fail-open：写盘失败注入后 turn success，fallback 未误出现，pass。
5. project-package-export：导出 project 语料包，5 条样本 observed/confirmed/inferred = 3/1/1，pass。
6. shadow-corpus-isolation：包泄漏 0、磁盘泄漏 0，pass。

证据：`_audit/verification-intent-corpus-electron/intent-corpus-electron-evidence.json`。

### 后续修正

原六场景证据生成后，又完成了 ChatPanel 顺序修复（consume 先于 stage）。按 M47 基线新鲜度门禁，该证据时间戳早于最终顺序修复，不能作为最终收尾证据；本轮回归已重新执行 Electron 验证并生成新证据。回头看补审时新增第 7 场景：大纲 plain 对话路由保真。

### 最终回归

```powershell
npx vitest run src/services/intentCorpusCollector.spec.ts src/services/shadowIntentCorpus.spec.ts src/services/chainIntentRouter.spec.ts src/services/workspaceSkillEngine.spec.ts
```

结果：4 files / 78 tests 全部通过。

```powershell
npm run type-check
```

结果：通过。

```powershell
npm run build:vue
```

结果：通过；Vite 仅保留既有 chunk 体积与 native configLoader 警告，无构建失败。

```powershell
node scripts/verify-intent-corpus-electron.mjs
```

结果（2026-09-22 回头看补审后重跑）：7 场景全部通过，corpusSamples=5。最终证据 generatedAt 为 2026-09-21T23:24:27.249Z（本地 2026-09-22 07:24:27），晚于第 17 轮采集器类型契约修复、第 19 轮全量专项回归与 Vue 构建，满足 M47 新鲜度门禁。

## Phase 7：文档与经验回写

- 本 DEV_LOG 补全 Phase 1-7 实际落地状态。
- `_audit/神意开发经验总结_v5.md` 升级 v5.30，新增 M53 校准脚本完整重跑门禁。
- 新增路由说明文档 `docs/INTENT_ROUTING_CORPUS_SPEC.md`，记录当前交付状态的采集范围、三级标注、存储治理、导出边界、影子语料限制与验证命令。
- `DEV_LOG_MASTER_INDEX.md` 登记第 247 条任务索引。
- M17 回头看记录见下节。

## M17 回头看

### 2026-09-22 20 轮回头看补审记录

本轮复用既有回头看经验，对 V2 已交付状态执行 20 轮递归审计。结论：

- 第 1-3 轮：plain 路由保真、suppression 精确性、IPC 队列重试完成修复与 Electron 七场景验证。
- 第 4 轮：Phase 0-7 对账通过；文档“六场景”残留改为七场景。
- 第 5 轮：确认 confirmed/inferred/observed 排序契约由测试锁住。
- 第 7 轮：存储层 routing/diagnostics 不含正文、API key 或完整 response。
- 第 8 轮：队列 500 上限、保留最新样本、丢弃计数补齐回归测试。
- 第 10 轮：校准脚本完整重跑，baseline 阈值仍最优。
- 第 12 轮：发现文档虚报“流水线采集”；实际生产入口只有大纲工作台与主页 API 对话。规格文档已改为真实两入口，并说明 `pipeline` 枚举仅为后续预留。
- 第 13-16 轮：DEV_LOG 六场景残留清零、新旧口径扫描清零、性能面（批量 50 / 2000 字钳制 / 500 队列上限）与安全隐私审计通过；校准产物未包含 API key、responseText、streamText 或 outlineText。
- 第 17 轮：发现 `IntentCorpusSample` 身份字段类型与 IPC 归一化落盘形态不一致。修复为：落盘样本保持必填 `string`，公共入队入口 `AppendInput` 允许 `undefined/null` 并在入队前统一归一为 `''`；队列类型拆成 `QueuedCorpusSample`。专项 15 tests 与 `npm run type-check` 通过。
- 第 18 轮：反查第 17 轮爆炸半径。ChatPanel / OutlineWorkspace 均通过包装函数传宽容输入；Electron `sanitizeSample` 对非字符串统一归一为 `''`；导出与 UI 脚本不直接消费可空类型，无外溢。
- 第 19 轮：全量意图路由专项回归 5 files / 65 tests 通过；`npm run build:vue` 两次构建通过，仅保留既有 Vite chunk 体积与 native configLoader 警告。
- 第 20 轮：重新执行 Electron 级真实 UI 验证，7 场景全部通过，corpusSamples=5，新证据 generatedAt 为 2026-09-21T23:24:27.249Z。

### 目标对账

- Phase 0：基线与影响圈，完成。
- Phase 1：采集与存储底座，完成。
- Phase 2：三级标注回流，完成。
- Phase 3：治理与导出，完成。
- Phase 4：社区影子层与物理隔离，完成。
- Phase 5：影子校准与升级包，完成；本轮补修 TDZ 后完整重跑。
- Phase 6：Electron 七场景，完成；最终回归重新执行以满足新鲜度门禁。
- Phase 7：文档与经验回写，完成。

### diff 归属

- 本轮直接触碰：`scripts/calibrate-intent-routing-thresholds.mjs`、本 DEV_LOG、经验文件。
- 历史脏文件与本任务无关，不 revert、不删除，保持原状。

### 生产入口盘点

`rg "stageIntentCorpusInference|consumeIntentCorpusInference|recordIntentRoutingConfirmation|recordIntentRoutingSample" src` 显示：

- Home 生产链路：ChatPanel.vue。
- Outline 生产链路：OutlineWorkspace.vue。
- 服务实现与测试：intentCorpusCollector.ts / spec。

无旧采集路径并存。

### 日志覆盖

- runTrace：样本携带 runId / turnId，可回溯现场。
- DiagLogger：采集失败、写盘状态有独立事件。
- Electron 证据覆盖 fail-open 与导出。

### 残留项

- 语料积累仍需真实使用产生 confirmed 样本；当前校准仍以内置 28 条真实 trace 为考卷。
- train/dev/test 中 falseRejections 合计 3 条，属于语料覆盖差距，不放宽写入安全阈值。
- 临时 profile `_data/intent-corpus-electron-profile` 已由验证脚本清理，复核 `Test-Path` 为 False。
- 构建警告属于既有 Vite 配置类 warning，未在本任务影响圈内，不处理。

### 收尾核验

- `scripts/calibrate-intent-routing-thresholds.mjs` 最后修改时间 2026-09-22 05:15:13，校准产物 `_audit/intent-routing-v6-phase6-calibration.json` 生成时间 2026-09-22 05:31:39，产物新于脚本，满足 M53。
- 采集入口全量盘点仅命中 home / outline 生产链路、采集器实现与专项测试，无第三入口或旧路径并存。
- 经验文件三处对齐核验通过：文件头 v5.30、最高门禁速查第 37 条 M53、§8 正文 M53、v5.30 修订记录。
- 20 轮回头看最终核验：第 17 轮类型契约修复后，本轮重新执行 `npx vitest run src/services/intentCorpusCollector.spec.ts`（15 tests 通过）、`npm run type-check`（通过）、意图专项回归（5 files / 65 tests 通过）、`npm run build:vue`（通过）与 `node scripts/verify-intent-corpus-electron.mjs`（7 scenarios pass，corpusSamples=5）。
