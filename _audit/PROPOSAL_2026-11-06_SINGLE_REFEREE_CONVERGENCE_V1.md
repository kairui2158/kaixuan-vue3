# PROPOSAL 2026-11-06: 单一裁判收口 V1（只删不加 · 逐条对账退役）

状态：待审核（未执行）。未获用户确认不进入写码阶段。执行批次在批准后启动 G0.12 台账；V1（SKILL 运行钉死 + candidate-anchored）的 commit 与封装按用户指令延后，不与本方案耦合。

## 一、用户原话与目标

用户原话：「V1先不收口，你先根据经验文件出一个单一裁判收口方案」。

收口对象定义（G2.9:561）：叙事有效性唯一裁判 = folder SKILL 显式机器可读 verdict；平台合同唯一裁判 = 应用。同一字段两层都能判失败时，先登记 owner 并退役另一侧语义。本方案不做的事：不新增机制、不新增配置、不新增状态、不写 SKILL 层。

## 二、裁判权归属表

| 维度 | owner | 依据 | 收口动作 |
|---|---|---|---|
| 叙事有效性 | SKILL 显式 `narrativeStatus` | G2.9:561 应用不得本地推断 | 退役应用侧旧词表双通道（P0-A） |
| 正文合同（字数） | 应用 | 用户裁决 11-05：应用负责完整传递，不参与内容质量 | 保留两点位，登记单 owner 生命周期（P0-B 文档化） |
| 事实账本 FACT_LOCK | SKILL 声明 + 应用透传对账 | 现行 G2.9 | 保留；回填保护只比对事实键（P3-D） |
| 降AI语言 | 指导者（生成前 prompt）+ SKILL 裁决 | 11-01 V5 FINAL | 保留现状，登记已归位（P5-G） |
| retry 策略 | 应用 | 合同失败修复编排 | 保留映射表，登记 owner（P4-F） |
| finalStep 禁全文 | 应用（终步职责例外） | 10-19 事故 + chain_output_echo 风险 | 修订措辞 + 登记例外（P1-C） |
| `narrativeStatus` 载体解析 | 应用（协议解析，非质量判断） | 单一 verdict 通道消费点 | 保留（P0-A 语义说明） |

## 三、退役清单（每项含 before/after 与 G0.13 五问）

### P0-A 叙事旧语义双裁判退役（唯一删除项）

证据：
- `chapterEventDensity.ts:4` `NOT_READY_PATTERN`（旧 `[NOT-READY]`）；`:5` `DENSITY_GAP_PATTERN`（`章级事件密度不足`）；`:127-136` `resolveChapterNarrativeBlock` 中旧检测优先于新 verdict（`:137-138`）。
- 消费点 1：`realSkillExecutor.ts:1284-1315` postProcess 前 raw-text 命中旧词表即 blocked。
- 消费点 2：`PipelinePanel.vue:3449-3474` UI fallback 文案 `章级事件密度不足：需要上游补剧情点`；`:3451` 还用旧 `detectChapterEventDensityNotReady(folderResult.output)` 提取 gap。
- 测试：`chapterEventDensity.spec.ts:15,23,135-148`、`realSkillExecutor.spec.ts:257-270`、`skillRouter.spec.ts:144-163` 均守护旧形态。
- 10-31 全层审计（`AUDIT_2026-10-31_single-owner-verdict-full-scope.md`）当时漏掉此残留（G1.14 失效事故，执行台账登记）。

改造（before → after）：
1. `resolveChapterNarrativeBlock`：删除 `detectChapterEventDensityNotReady` 调用与返回分支；只保留 `narrativeStatus` verdict 路径（declared_not_ready / unreadable_because_missing_handoff 阻断，undeclared 不断）。函数 JSDoc 注明「单一裁判：只消费 SKILL 显式 verdict」。
2. `realSkillExecutor.ts:1284` 不再命中旧词表；SKILL 若输出旧短格式且无 `narrativeStatus`，按 G2.9 undeclared 语义放行（不推断质量）。SKILL 层模板是活体契约，本应用不写；SKILL 对账报告不在本方案范围。
3. `PipelinePanel.vue:3449-3474`：删除旧 `detectChapterEventDensityNotReady` 消费与 fallback 文案；统一为 `SKILL 叙事裁决 NOT_READY` 单语义。`isChapterNarrativeBlockDiagnosticCode` 收窄为只认 `chapter-narrative-not-ready`。
4. 同批迁移测试（G1.11）：`chapterEventDensity.spec` / `realSkillExecutor.spec` / `skillRouter.spec` 旧形态正向断言全部改为断言新语义（旧短格式不再阻断）+ 负向断言旧码不再产生。`skillRouter` 夹具中仍需旧输出的用例改为验证错误透传而非旧码。

G0.13 五问：必须依赖？是——否则双层裁判反复打架，11-05 系列事故的根因面之一。现有机制不够？是——旧词表优先于 verdict。增延迟/纠缠？删除降低。删除损失价值？无：SKILL verdict 已覆盖。更小实现？删除即最小。

### P0-B 字数合同单 owner 两点位（裁决后定性，不删除——反推否决）

证据：应用侧两处都在终验收/重试驱动上消费同一 `resolveProseWordContract`：
- retry 驱动：`realSkillExecutor.ts:1324-1333`（`validateProtectedBodyCandidate` → blocking issue → 驱动 candidate-anchored 重试）。
- 终验收门：`stepArtifactAcceptance.ts:466-498`（`validateBodyArtifact` reject contract_failed）；`bodyArtifactOrchestrator.ts:407-423` 工作台路径同源。

处置：文档化「单一 owner、两点位」，两点位只判合同字数（min/max），不判叙事内容。SKILL `checkSceneBudgets`（`kaixuan-s2/script.js`）是 SKILL 自有施工闸，不退役。

反推否决记录：若把 retry 驱动点删掉，11-05 事故（SKILL blocking 耗尽后 3150>2800 被验收放行）直接复发；若把终验收门删掉，工作台与流水线失去平台合同兜底。两点位缺一不可，定性为同一裁判的两个生命周期点。

### P1-C 终步反馈语义修订（改一行措辞，不加机制）

证据：`finalStepFeedback.ts:52`「不携带候选输出全文」是恒定协议；但 10-06 candidate-anchored 已让结构/字数类失败携带全文（`schemaRetryFeedback.ts:384-390`），两者矛盾。终步（polish）另有 `chain_output_echo` 风险（`:34,76-79`），S3 与 S2 高度相似是职责允许。

处置（建议 A，裁决点 D1）：保留终步禁全文；把 `:52` 修订为「终步反馈不携带候选输出全文（终步职责例外：与重试层 candidate-anchored 协议不同）；结构修复基于上游完整输出，表达打磨基于失败事实与锚点」。同步 `finalStepFeedback.spec.ts:52` 措辞断言。不扩展终步到 candidate-anchored，理由：echo 风险 + 10-19 禁全文历史。

### P2-E 追加写禁止的硬性收口（无源码动作）

`chapterEventDensity.ts:36-41` `ChapterNarrativeBlock` 接口已限定 `code` 联合类型（`CHAPTER_EVENT_DENSITY_NOT_READY_CODE | CHAPTER_NARRATIVE_NOT_READY_CODE`），type-check 后旧码新增分支编译不过——结构上已封死。P0-A 执行时删掉旧码常量后，该类型收窄为单值，防御闭环。

### P3-D FACT_LOCK 对账语义收紧（合并保护，不加新机制）

证据：`stepArtifactAcceptance.ts:382-386` 回填时 `{ ...finalMetadata, extractedMeta, conflicts }` 展开——非 extractedMeta 字段（`sourceRefs`、`coveredItems`、`status` 等）实际保留。真实缺口：`:378-381` 回填把 S2 权威账本的全部 FACT_LOCK 键值追加进 S3 `extractedMeta`，若 S3 自有 key 与权威 key 同名但值不同（且 finalBody 语义命中），会同时出现两条同键异值行，下游文本对账歧义。

处置：回填追加前按 key 去重——S3 已有同键行时以 S2 权威值替换该行，不新增重复行。只动 `:353-381` 一个循环。测试：`stepArtifactAcceptance.spec.ts:119` 附近夹具补一条同键异值分支。不加新 trace 事件（G0.13）。

### P4-F retry 策略映射表登记（不收敛路径）

四套策略（`schemaRetryFeedback.ts`）：`handoff-repair`（:295）、`word-gap`（:363）、`candidate-anchored`（:397）、`bounded-summary` 兜底（:438）。G0.13 五问后保留：各自数据载荷不同（账本 vs 骨架 vs 全文 vs 摘要），强行收敛反而丢失结构信息。本方案只在方案文档登记映射表与触发条件，不改代码。

### P5-G 合规确认（已归位，本轮不动，方案登记）

- deai 在 executor 仅 teaching-only：`realSkillExecutor.ts:10`（`collectDeaiFindingsWithObservability`）；`:558-594` 只收集 findings 不改写；`DeAiProcessor` import 死标识（全文件无 `DeAiProcessor.` 调用点），P0-A 顺手清理该 import（G1.27 死标识清理条款）。
- advisory 不改终态：`stepArtifactAcceptance.ts:204-207` observability；消费点 `PipelinePanel.vue:4950-4973,5468-5485` 只 trace + warn。
- no_contract 显式登记：`stepArtifactAcceptance.ts:446-459`；degraded 无账本拒收 `:500-510`。
- 多步链无契约 throw：`PipelinePanel.vue:6455-6469`。
- contractReview / workspace 验收单源：`workspaceArtifactAcceptance.ts:211`。

## 四、信封残渣七层清零（G0.10）

现状：`__shenyiStepArtifact` 生产路径已退（`generationResult.ts:26-48` 只解析 generic JSON envelope body 字段；`stepArtifactFlow.spec.ts:83-98` 明确不授权 envelope 字符串）。残留全部是 spec 负向断言（断言不存在语义，非执行残留）：
- `bodyArtifactOrchestrator.spec.ts:200-217`（treats retired envelope as literal prose → failed）
- `generationResult.spec.ts:27-38`（does not authorize）
- `stepArtifactFlow.spec.ts:83-98`（does not treat as structured authorization → reject）

处置：全部保留（G0.10:94 负向断言命中≠残留；三条都断言旧形态不能通过）。执行时逐条列出并标注「负向守护保留」，台账登记。

## 五、命名误导：legacyMetadataSections

证据：`legacyMetadataSections.ts:10` `splitLegacyMetadataSections` 是活协议（`generationResult.ts:2,43,52`、`schemaRetryFeedback.ts:2,82` 消费），"legacy" 命名失真。

裁决点 D3：改名 `metadataSections`（全仓 churn）vs 仅文档。建议仅文档：G0.13 五问——改名无用户价值、纯 churn、破坏 diff 自审；文档注明「legacy 指旧式文本块协议载体，非已退役」。

## 六、影响圈七面（G0.9）

| 面 | 打算改 | 可能碰到 |
|---|---|---|
| 生产入口 | `realSkillExecutor.ts`（删旧词表消费 + 清死 import） | executor 其他路径（routeSkill 的 skillRouter.ts:145-160 probe 仍返回旧输出——probe 是诊断函数，P0-A 同步收窄） |
| 服务层 | `chapterEventDensity.ts`（删旧双通道）、`stepArtifactAcceptance.ts`（去重回填）、`finalStepFeedback.ts`（措辞） | `skillRouter.ts` 夹具旧输出透传断言同批迁 |
| UI | `PipelinePanel.vue:3449-3474`（删 fallback 文案与旧 detect 消费） | trace 事件 type 变化（旧码 `chapter-event-density-not-ready` 不再产生；`RETAINED_AUDIT_EVENT_TYPES:1004-1027` error/warn 级事件本就受保护，无需登记白名单） |
| 测试 | `chapterEventDensity.spec` / `realSkillExecutor.spec` / `skillRouter.spec` / `finalStepFeedback.spec` / `stepArtifactAcceptance.spec` 旧断言同批迁移 | 全量服务测试（247 files / 2672 baseline） |
| 脚本 | 无新脚本；`npm run test:services` + `type-check` | `scripts/` 目录旧协议字符串检索 |
| 规格文档 | 无新规格；SKILL 适配文档（若声明 narrativeStatus 单通道）已有，不写 | 不写 SKILL 目录 |
| 日志/trace | 事件 type 收窄 | 导出通道不受影响（error 级保护） |

## 七、正反推研磨（≥10 条，G0.7）

| # | 推演 | 结论与证伪方式 |
|---|---|---|
| 1 | 删旧词表后，SKILL 输出旧短格式 `[NOT-READY]` 会不会静默放行烂骨架？ | 是——但这是 G2.9 的正确语义：undeclared 时不推断。SKILL 是活体契约，它自己迭代后不再输出旧格式；应用不做裁判兜底。证伪：测试断言旧短格式只 warning 不阻断。 |
| 2 | `resolveChapterNarrativeBlock` 还有别的消费点吗？ | 已全仓检索：仅 `realSkillExecutor.ts:1284`。删旧分支后新语义签名不变，返回类型收窄，无其他消费方。 |
| 3 | P0-A 删旧码常量后 `PipelinePanel.vue:889` import 死掉？ | 是——`detectChapterEventDensityNotReady` + `CHAPTER_EVENT_DENSITY_NOT_READY_CODE` 两个 import 同批删（G1.27）；`isChapterNarrativeBlockDiagnosticCode` 收窄后 `:3452` 的 `CHAPTER_NARRATIVE_NOT_READY_CODE` 仍活。 |
| 4 | 字数两点位会不会还是「同一字段两裁判」？ | 否——两点位同一 owner（应用），同一单源计算（`resolveProseWordContract`），只判合同字数不判叙事。登记生命周期表即可，无需代码改动。 |
| 5 | 反推否决：能不能把 retry 驱动点（executor :1324）删掉让 SKILL 全权管字数？ | 否——11-05 事故修复载体就是它；SKILL 换闸后施工闸消失时应用必须兜底平台合同。G2.9:562 明确该夹缝矩阵是测试边界。 |
| 6 | 反推否决：能不能把终验收门（acceptance :466）删掉让 retry 驱动点全管？ | 否——工作台（bodyArtifactOrchestrator）与流水线共用终门；删掉后无兜底。两点位缺一不可。 |
| 7 | finalStepFeedback `:52` 措辞改了，spec 只测包含会不会太松？ | G1.27:478 数值/语义断言要求——spec 补 `not.toContain('不携带候选输出全文')` 旧措辞负向 + 新措辞 positive，同批。 |
| 8 | FACT_LOCK 去重回填会不会破坏 S3 自有事实（同键不同值是 SKILL 打磨新发现）？ | 不会——回填前提是 `!hasDivergence`（:323），同键不同值若 body 语义命中权威值，S3 值被判 label_drift 回填为权威值；若 body 也不同已走 divergence 不回填。去重只作用于回填分支。 |
| 9 | 去重回填会不会让 trace comparison 里 missing/conflicting 与 extractedMeta 不一致？ | 会——comparison 记录的是修复前状态（missing/conflict list），extractedMeta 是修复后状态。行为与现有 backfilled 语义一致，无需改。 |
| 10 | `DeAiProcessor` import 死标识删除会不会破坏 de-ai.ts 导出面？ | 不会——de-ai.ts 导出保留（useDeAi.ts 等多处消费），只删 executor 侧死 import。 |
| 11 | P4-F 只登记不收敛，四套策略会不会继续膨胀？ | 会——本方案冻结新增；任何新策略必须走 G0.13 五问。映射表登记就是膨胀制动器。 |
| 12 | 信封负向测试保留会不会让新人误以为信封是活协议？ | spec 名称已写「retired / does not authorize」；方案第五节已登记；执行时不改。 |
| 13 | 反推：本方案漏项最大风险是什么？ | 若只删旧词表不删 UI fallback 文案与消费点，UI 仍显示旧语义——影响圈第三面已列，执行台账逐项清零。 |

## 八、G0.13 最小必要性五问（方案整体）

新增机制？零。新增配置？零。新增状态？零。新增报告？零。新增验证链路？零。动作 = 删（旧词表 + 死 import + UI fallback）+ 修（措辞 + 去重）+ 文档（owner 表 + 映射表 + legacy 说明）。删除它会不会损失真实用户价值？——用户目标（单一裁判）必须依赖。

## 九、验证标准（G1.11 同批迁移 + 先红后绿）

1. 执行前先跑定向测试（chapterEventDensity / realSkillExecutor / skillRouter / finalStepFeedback / stepArtifactAcceptance），确认当前全绿基线。
2. 先写新断言（旧码不产生 + 新 verdict 唯一 + 去重回填），跑红。
3. 实施删除/修订，跑绿。
4. 全量 `npm run test:services` + `npm run type-check`。
5. `git diff` 逐行过（G1.1）：每行归入本方案目标。
6. `rg "chapter-event-density-not-ready|章级事件密度不足|NOT-READY" src/ --type ts --type vue`（残留=0 或仅负向断言）；`rg "DeAiProcessor" src/services/realSkillExecutor.ts`（=0）。
7. Electron 真实负向验证（G1.13 独立 profile）：SKILL 输出旧短格式 → run 不被旧词表阻断（undeclared 放行）。本项不强制（无可控旧格式 SKILL），登记为边界。

## 十、裁决点

| # | 问题 | 建议 |
|---|---|---|
| D1 | 终步禁全文措辞：修订保留（A）vs 扩展 candidate-anchored（B） | A（echo 风险 + 10-19 历史） |
| D2 | legacyMetadataSections：改名（A）vs 仅文档（B） | B（纯 churn 无价值） |
| D3 | FACT_LOCK 去重回填：做（A）vs 延后（B） | A（一行级修复，测试覆盖） |
| D4 | 四套 retry 策略：保留映射表（A）vs 收敛路径（B） | A（G0.13） |
| D5 | 信封负向测试：保留（A）vs 删（B） | A（G0.10 负向断言≠残留） |
| D6 | P0-A 旧词表删除：全删（A）vs 降级为 warning（B） | A（G2.9 单一裁判，降级仍是双裁判） |

## 十一、缺口清单（执行台账 G0.12 待办）

- 本方案批准后立台账：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-06_single-referee-convergence-v1.md`，七节结构。
- DEV_LOG 追加登记（G1.27 追加写）。
- 10-31 审计漏检事故回写：在台账「失效事故」节登记（G1.14 来源）。
- V1（pinning + candidate-anchored）的 commit / 3.115.0 封装延后：与本方案不耦合，不阻塞。
- SKILL 对账报告（旧短格式在 SKILL 层不再输出）：不在本方案范围（应用不写 SKILL 目录）。
