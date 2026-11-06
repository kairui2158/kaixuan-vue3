# TASK LEDGER 2026-11-06: 单一裁判收口 V1

方案：[_audit/PROPOSAL_2026-11-06_SINGLE_REFEREE_CONVERGENCE_V1.md](../PROPOSAL_2026-11-06_SINGLE_REFEREE_CONVERGENCE_V1.md)
状态：执行完成。裁决点 D1=A、D2=B、D3=A、D4=A、D5=A、D6=A（全部按建议锁定）。

## 1. 用户目标

用户原话：「V1先不收口，你先根据经验文件出一个单一裁判收口方案」→ 方案审核通过 →「确认执行」。核心需求：叙事有效性唯一裁判 = SKILL verdict；平台合同唯一裁判 = 应用；退役另一侧语义；只删不加。

## 2. 影响圈（G0.9 七面）

源码：chapterEventDensity.ts / realSkillExecutor.ts / PipelinePanel.vue / finalStepFeedback.ts / stepArtifactAcceptance.ts
测试：chapterEventDensity.spec / realSkillExecutor.spec / skillRouter.spec / finalStepFeedback.spec / stepArtifactAcceptance.spec
UI：PipelinePanel fallback 文案收窄
脚本：无新增
规格：无新增（legacy 命名说明在本台账登记）
日志：trace 事件 type 收窄（旧码不再产生）
产物：无安装包变更（本批次不封装）

## 3. 执行条目

| # | 条目 | 状态 |
|---|---|---|
| P0-A-1 | resolveChapterNarrativeBlock 删旧词表分支 | 完成：`src/services/chapterEventDensity.ts:96` 只消费 SKILL verdict |
| P0-A-2 | realSkillExecutor 删旧消费 | 完成：`src/services/realSkillExecutor.ts:10` 无 DeAiProcessor 死 import；raw-text 双裁判路径删除，由 `resolveChapterNarrativeBlock` 单入口消费 |
| P0-A-3 | PipelinePanel 删 fallback 文案与旧 detect | 完成：`src/components/pipeline/PipelinePanel.vue:886` 只保留新码 import；`:3451` fallback 统一为「SKILL 叙事裁决 NOT_READY」 |
| P0-A-4 | 同批迁移 3 测试文件旧断言 | 完成：见第 4 节；负向断言旧码不产生 |
| P0-B | 字数合同两点位登记（不删） | 完成：见第 9 节生命周期登记（应用 retry 驱动 + 终验收门） |
| P1-C | finalStepFeedback 措辞修订 | 完成：`src/services/finalStepFeedback.ts:52` |
| P3-D | FACT_LOCK 回填去重 | 完成：`src/services/stepArtifactAcceptance.ts:380-388` |
| P4-F | retry 映射表登记 | 完成：见第 9 节 |
| P5-G | DeAiProcessor 死 import 清理 | 完成：`src/services/realSkillExecutor.ts:10`；手动/校准链路的活消费豁免 |
| D2 | legacy 命名说明（仅文档） | 完成：本节与第 10 节登记 |

## 4. 验证记录

| 项 | 结果 | 证据 |
|---|---|---|
| 定向收口 specs（chapterEventDensity/realSkillExecutor/skillRouter/finalStepFeedback/stepArtifactAcceptance） | 123/123 passed | npm run test:services -- 5 specs |
| 全量服务测试 | 248 files / 2671 passed | npm run test:services（2026-11-06 14:56-14:57） |
| type-check | exit 0 | npm run type-check |
| 残留检索 | 生产路径 0 命中；测试 8 处为负向断言/自验证夹具；scripts 与手动降AI链路为活消费豁免 | rg "章级事件密度不足|chapter-event-density-not-ready|NOT-READY|DeAiProcessor" src scripts |
| 既有集成夹具修复 | realS2ProtectedContract.integration 1/1 passed；全量 2671/2671 passed | 夹具补充 `章节：第1章` 使 cleanChainInput 识别为真实重复交接：`src/services/realS2ProtectedContract.integration.spec.ts:72-78` |

before/after 关键证据：

| 位置 | before | after |
|---|---|---|
| `src/services/chapterEventDensity.ts:1-43` | NOT_READY_PATTERN + DENSITY_GAP_PATTERN + 独立旧码/检测函数/旧分支 | 只保留 `CHAPTER_NARRATIVE_NOT_READY_CODE` 与 verdict 通道 |
| `src/services/chapterEventDensity.ts:96-112` | 旧 density 优先于 verdict | 单一裁判注释 + verdict only |
| `src/services/realSkillExecutor.ts:10` | `collectDeaiFindings..., DeAiProcessor` | 无死 import |
| `src/components/pipeline/PipelinePanel.vue:884-888` | 两码 import | 只导入新码 |
| `src/components/pipeline/PipelinePanel.vue:3446-3462` | detect 旧词表 + 双码三元 + 两种 label | 新码 + 单一 label |
| `src/services/finalStepFeedback.ts:49-53` | 恒定禁全文 | 保留终步例外并登记 candidate-anchored 差异 |
| `src/services/stepArtifactAcceptance.ts:377-388` | 同键权威值追加成重复行 | 同键替换、新键追加 |

## 5. 缺陷面枚举（G1.14 DEFECT-SWEEP）

| 维度 | 枚举结果 | 处置 |
|---|---|---|
| 分支/状态清理点 | narrative block 由旧词表分支收窄为 verdict-only；`ChapterNarrativeBlock.code` 类型单值封死旧码 | 完成闭环 |
| sibling 调用点 | `resolveChapterNarrativeBlock` 全仓消费：executor；`isChapterNarrativeBlockDiagnosticCode` 全仓消费：PipelinePanel | 写读成对收窄；无第三消费者 |
| 旧协议残留 | `NOT-READY` 仅 executor.spec:257 与 chapterEventDensity.spec:13 作为负向夹具；`chapter-event-density-not-ready` 仅 3 处负向断言；`章级事件密度不足` 仅 2 处负向断言；scripts 0 命中 | 负向守护保留 |
| 链式字段三列对账 | 写=SKILL narrativeStatus；读=chapterEventDensity verdict 解析；传=executor block 消费；失败后果=旧词表曾抢先改判，现已单源 | 完成闭环 |
| 意外缺口 | realS2ProtectedContract 既有失败根因是夹具不是真实重复交接，`cleanChainInput` 需 `章节：` 才识别；已修正夹具 | 修正 + 全量回归 |

## 6. 边界与豁免

- 不写 SKILL 目录；不 commit / 不封装（延后）。
- Electron 真实负向验证不强制执行（无可控旧格式 SKILL），登记边界。

## 7. 失效事故登记

- 10-31 全层审计漏检 chapterEventDensity 旧词表残留，属于既有 G1.14「全链追踪/缺陷面枚举」未执行到位，不新增平行条款；本轮按 G1.14 四类发现式扫描回补枚举。
- 本轮既有失败 `realS2ProtectedContract.integration` 进一步暴露测试夹具与 SKILL 真实协议不一致：用「测试当前全绿」证明协议行为属于 G0.12 禁止事项；夹具已按 SKILL 真实识别条件修正。

## 8. 边界与豁免（补充）

- `DeAiProcessor` 在 `scripts/`、`useDeAi.ts`、`de-ai.js`、deai 观测/校准文件中是活消费；本任务只清理 executor 死 import，不越界重构。
- `NOT-READY` 字符串测试夹具是负向守护，证明旧语义不再被应用消费；不视为残留。
- Electron 真实负向验证不强制执行（无可控旧格式 SKILL），维持方案登记边界。

## 9. Retry 策略映射与字数合同生命周期登记

| 策略 | 触发条件 | 载体 | owner |
|---|---|---|---|
| `handoff-repair` | 交接账本缺失/损坏 | 账本定向修复 | 应用 |
| `word-gap` | 净字数不足/过长 | 骨架/缺口 | 应用 |
| `candidate-anchored` | 正文链结构/格式/字数类失败 | 上一版完整候选 | 应用 |
| `bounded-summary` | 质量/风格类与兜底 | 有界摘要 | 应用 |

冻结规则：新增策略必须通过 G0.13 最小必要性五问，并同步映射表。

字数合同生命周期：应用是唯一 owner，同一 `resolveProseWordContract` 服务两个点位——`realSkillExecutor.ts:1325` 重试驱动、`stepArtifactAcceptance.ts:474` 终验收门；工作台同源点在 `bodyArtifactOrchestrator.ts:412`。两点位只判合同字数，不判叙事内容。

## 10. 命名说明

`legacyMetadataSections` 的 legacy 指「旧式文本块协议载体」，不是已退役协议；该模块是活协议，维持仅文档裁决（D2=B），不改名。

## 11. 核心需求对账

| 需求 | 实现机制 | 验证 |
|---|---|---|
| 叙事有效性唯一裁判 = SKILL verdict | 删除应用旧词表双通道与 UI fallback 双码；只消费显式 narrativeStatus | 定向/全量测试 + 残留检索 |
| 平台合同唯一裁判 = 应用 | 字数合同两点位保留，只判合同不判叙事 | 既有 body contract / protected contract specs 全绿 |
| 只删不加 | 无新增机制、配置、状态；只做删除、措辞修正、同键去重 | diff 范围与方案一致 |
