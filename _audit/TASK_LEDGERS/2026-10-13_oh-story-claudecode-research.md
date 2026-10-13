# 任务台账：oh-story-claudecode 全维度价值分析

## 1. 目标与原话

- 用户原话要点："git里有一个开源项目名字叫oh-story-claudecode 这个开源项目你深度爬取分析看看他对我们的应用有没有用？ 有那些用，全维度，全应用分析，全组件，全协议，你做一个详细的分析表格"
- 最终可感知行为：产出逐维度证据对账表，明确"有用/不适用/不可移植"与优先级，供用户审核是否立项。
- 交付物：`_audit/RESEARCH_2026-10-13_OH_STORY_CLAUDECODE_ANALYSIS.md`、本台账、DEV_LOG。

## 2. 门禁读证

- G0.1 目标对齐：报告标题、总结论、采纳方案均对准"是否对我们应用有用、有哪些用"。
- G0.3 诚实闭环：报告第 8 节明确区分已验证/未验证；未运行上游完整流程，不冒充实测。
- G0.4 门禁复读：开工前已读取 `_audit/神意开发经验总结_v7.md` v8.9 的 L0 与 L1 相关条目。
- G0.5 回头看：报告成稿后复核全部 file:line，发现并修正交接摘要中的错误路径（见第 7 节）。
- G0.6 方案成熟度：调研报告为"成熟"（证据完备）；采纳方案为"半成熟"（需用户审核范围与顺序，未进入写码）。
- G0.12 任务台账：本文件即七节台账。
- G1.19 耗时观测：报告中明确性能收益必须以落地后的 before/after 账本验证，不拿机制推断当性能证据。

## 3. 路由判定

- 加入：G0.1、G0.3、G0.4、G0.5、G0.6、G0.12、G1.19；调研类任务不修改生产代码，故 G1.1-G1.7 只在后续实现阶段适用。
- 排除 G0.2（无预算）：本轮未使用 goal 工具、未设置预算；用户当前任务不是无预算长执行模式。
- 排除 G0.11（真实交互冒充）：本轮目标是调研分析，不含"用户可通过 UI 完成 X"的验证目标。
- 排除 G0.8（收尾清理）：未产生临时探针或可再生成产物；只新增报告与台账，均为不可再生的交付物。

## 4. 影响圈与作者反证

- 打算改的：无生产代码改动；只新增 `_audit` 调研产物。
- 可能碰到的：DEV_LOG 总索引追加一行，不触碰既有日志内容。
- 方案最可能错的假设：a) "作用域闭包能显著减少上下文"可能被我们的项目模型限制抵消；证伪方式：Phase 1 落地后对比上下文字节与请求数。b) "事务状态能解决流水线连续性"可能受 IndexedDB 并发模型限制；证伪方式：并发批次写同一项目的实测。c) "新增物三级可被模型遵守"可能被供应商差异破坏；证伪方式：多供应商 live 样本测试。

## 5. 停止条件

- 完成：报告包含 ≥10 个对账维度，每行有 oh-story 与本应用双侧 file:line 证据；明确 P0/P1/P2 与不采纳清单；明确未验证边界；台账七节齐全。
- 失败：任一表格行缺证据、结论与证据冲突、或把 README/star 数当工程证据。

## 6. 执行证据

- 上游定位：`git -C C:/Users/凯瑞/AppData/Local/Temp/oh-story-claudecode log -1` → `2cf7be6 release: v0.8.5`
- 真实路径勘误：交接摘要中的 `story-long-write/tracking_commit.py` 不存在；`rg --files` 定位到 `skills/story-long-write/scripts/tracking_commit.py`。
- 上游关键证据复核：`tracking_commit.py:43-47` 容量常量；`:277-289` 写锁；`:243-254` 原子写；`:1030-1047`、`:1627-1630` 修订号校验；`workflow-chapter.md:13-14` 作用域读取与写前门禁；`artifact-protocols.md:52-107` 契约与作用域；`narrative-writer.toml:20-45` 三级新增物与路径禁令；`story_codex_hook.py:1312-1373` 写前拦截、`:1636-1653` Stop 复扫。
- 应用侧证据复核：`chapterGenerationContract.ts:70-103`、`volumeGenerationContract.ts:63-96`、`bodyArtifactContract.ts:49-57`、`chapterBatchOrchestrator.ts:50-216`、`memoryMerger.ts:118-277`、`memoryVersion.ts:21-74`、`chapterExecutionPackage.ts:104-111`、`memoryRetriever.ts:65-93`、`editTaskService.ts:201-214`、`documentReadLedger.ts:75-108`、`editorTools.ts:1046-1122`、`de-ai.js:48-110/568/608-691`、`skillGuidanceSanitizer.ts:84`、`agentToolConflict.ts:4-22`、`agentOrchestrator.ts:424-447`。
- 工作区状态：任务开始时 `git status --short` 为空，HEAD `d7dac0b`。

## 7. 缺口清单

- 未逐行分析上游全部 472 个文件；深挖范围覆盖 story-long-write/story-setup/story-deslop 机制文件与 demo 协议实例，story-import/story-review 为结构级对账。若要求逐技能逐文件扩展，需另立项。
- 未运行上游完整写作流程，不对其生成效果下结论。
- Phase 1-4 为方案，未实现、未验证性能收益；生产改动等待用户审核。
