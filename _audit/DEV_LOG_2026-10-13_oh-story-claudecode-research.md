# DEV_LOG：oh-story-claudecode 开源仓库全维度调研

日期：2026-10-13

## 目标

深度爬取并分析 `zenstory-ai/oh-story-claudecode`，判断其机制对本应用的工程价值，产出证据化对账表，不修改生产代码。

## 调研基线

- 上游：MIT License，main `2cf7be6`，v0.8.5，本地克隆 `C:/Users/凯瑞/AppData/Local/Temp/oh-story-claudecode`
- 本应用：`d7dac0b`（3.82.0 收尾后），工作区干净

## 核心结论

1. 上游价值集中在四类机制：作用域化大纲读取（`skills/story-long-write/references/workflow-chapter.md:13`、`artifact-protocols.md:97-107`）、追踪状态事务（`scripts/tracking_commit.py:43-47/243-254/277-289/1030-1047`）、新增物三级授权（`skills/story-setup/references/codex/agents/narrative-writer.toml:20-28`）、写前/写后硬信号门禁（`skills/story-setup/references/codex/hooks/story_codex_hook.py:1312-1373/1636-1653`）。
2. 与我们的生成流水线契约体系互补：我们有数量契约与历史防重复（`chapterGenerationContract.ts:70-103`、`volumeGenerationContract.ts:63-96`），缺"承诺/禁区/作用域"语义契约。
3. 与我们的 memory 体系互补：我们有版本快照与冲突标记（`memoryVersion.ts:21-74`、`memoryMerger.ts:50-60`），缺修订号乐观锁与派生视图一致性校验。
4. 明确不采纳：文件型书库、bash/python hooks 载体、多端 TOML、browser-cdp、照搬去 AI 味提示词。

## 勘误

前一轮交接摘要中的上游路径缺少 `skills/` 前缀，导致首轮 rg 全部报"找不到路径"。已用 `rg --files` 重新定位真实路径并复核全部引用；此勘误已写入报告第 8 节，作为"引用必须指向真实文件"的反例记录。

## 产物

- 调研报告：`_audit/RESEARCH_2026-10-13_OH_STORY_CLAUDECODE_ANALYSIS.md`
- 任务台账：`_audit/TASK_LEDGERS/2026-10-13_oh-story-claudecode-research.md`

## 后续建议

按报告 Phase 2 → Phase 1 → Phase 3 → Phase 4 顺序立项；Phase 2（状态事务）是 Phase 1（作用域闭包）的地基，不能延后到闭包落地之后。所有阶段落地时遵循 G0.9/G0.10：迁移 memoryMerger 调用点、保留旧入口防御断言、禁止新旧状态双写并存。
