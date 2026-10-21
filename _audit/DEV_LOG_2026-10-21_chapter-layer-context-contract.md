# 2026-10-21 章节层上下文与契约修复

## 交付范围

- 新增 `promptBlockProtocol` 单源：`[全书大纲]` / `[大纲]` / `[卷纲]` 的块头与识别协议集中管理，章节链不再靠散落字符串双头识别。
- 非首跳上下文瘦身：首跳保留全量素材，非首跳优先压缩全书大纲块，并记录 `outlineOriginalLength`、候选长度与最终长度；结构地图更大时走 `scaffold_not_smaller` 保守路径。
- 章节数单源仲裁：`volume_outline_declared > configured_chapter_count > word_estimate`，冲突不再静默，`chapter-count-arbitration` / `chapter-count-arbitration-failed` 写入 trace。
- 章节内容重复可观测：标题重复保持错误，plot 全文重复降为非阻塞 warning，`chapter-content-duplicate` 事件记录。
- Agent model 空值回退显式化：`agent-model-fallback` 记录 `fallbackModel/fallbackSource`，消除静默走供应商默认模型。
- run trace 导出新增 `artifactRole: final | intermediate`，同名或同内容 payload 不再被误读为生成重复。
- 验证器强化：live 脚本断言批次契约、仲裁事件、非首跳 slim、model fallback、artifactRole、timeout 导出；新增 `verify-chapter-context-contract-replay.mjs` 回放事故形态。

## 验证

- `node scripts/verify-chapter-batch-contract-electron.mjs`：真实 Electron UI + 应用内供应商 KEY + deepseek-v4-pro；12 章、3 批（5/5/2）全部 `complete`，`repairAttempts=0`，12 次 API 全部 `success`，总耗时 1,897 秒。
- `node scripts/verify-chapter-context-contract-replay.mjs _audit/verification-chapter-batch-contract-live/live-export/run-trace.json`：`RESULT: ACCEPTED (6 checks)`，覆盖非首跳 outline 定位、旧 `declared_full_context` 负向、章节数仲裁、plot 重复观测、model fallback。
- `npm run type-check`：通过。
- `npx vitest run`：187 files / 2114 tests 全部通过。
- 证据：`_audit/verification-chapter-batch-contract-live/summary.json`、`live-export/run-trace.json`、`heartbeat.jsonl`、`final-state.png`。

## Before / After

- Before：用户事故 trace 中 S1-S4 prompt 为 89,059 / 97,351 / 96,876 / 104,322 字符，总耗时 29.9 分钟，S2 约 20 分钟；章节数三源冲突（90 / 143 / 0）且无仲裁事件；非首跳 `outlineOriginalLength: 0`；plot 重复不可见；Agent model 空值静默回退。
- After：12 章 live 中非首跳 9/9 定位到 bounded outline block（`outlineOriginalLength=298`）；章节数由单一仲裁事件确认为 12；12 次 model fallback 全部显式记录；96 个导出 payload 全部带 `artifactRole`。历史清单注入后 request 尺寸线性增长，未出现每跳携带全书大纲的形态。

## 诚实边界

- 本轮 live 为 12 章种子项目，未复刻用户 7.5 万字大纲的同规模长文；同规模缩减幅度与耗时登记 `untested`。
- 单一供应商 `deepseek-v4-pro`，其他供应商矩阵未复跑。
- `scaffold_not_smaller` 是保守保护路径：结构地图不小于原 prompt 时保持原文；真实压缩幅度需长文项目采样。
- SKILL 层元数据与提示词问题由 SKILL 层处理，应用侧不代改。
- 本轮未升版、未封装；版本保持 3.102.0。
