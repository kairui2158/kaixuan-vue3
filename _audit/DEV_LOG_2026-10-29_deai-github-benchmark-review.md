# DEV_LOG 2026-10-29 正文层内嵌降AI GitHub 基准审查

## 1. 目标

对生成流水线正文层内嵌降AI机制做外部基准审查：多轮搜索并克隆 9 个 GitHub 去 AI 味项目/SKILL，逐项对账我们的实现是否过时、是否有缺陷，并输出详细审查报告。

## 2. 审查范围

- 本仓：`src/services/de-ai.js`、`src/components/pipeline/PipelinePanel.vue`、`src/services/realSkillExecutor.ts`、`src/services/schemaRetryFeedback.ts`
- 外部：`D:\codex\_research\deai-github-20261029\` 下 9 个仓库
- 产物：`_audit/DEAI_GITHUB_BENCHMARK_REVIEW_2026-10-29.md`

## 3. 主要结论

1. 架构方向领先：生成期注入、检测/深度修复/兼容清洗分离、保护片段回对、契约复验、trace 观测、有界 retry 反馈。
2. P0 缺陷四个：`retentionRatio` 恒为 1；终步降AI检测异常静默吞掉；缺 30%/50% 变更率门禁；缺 n-gram 重复指纹与长度自适应阈值。
3. P1 缺陷五个：无作者声纹档案接入；无长章节风格漂移检测；无 hedging 场景豁免；无整体评分/verdict/AI-edited fraction；提示词规则堆叠偏重。
4. schema retry 候选全文回传问题在当前源码中已修复，不再是缺口。
5. 外部项目机制可借鉴，但英/德/韩文词表和阈值不能直接用于中文小说，需中文网文样本重新校准。

## 4. 产物

- 审查报告：[_audit/DEAI_GITHUB_BENCHMARK_REVIEW_2026-10-29.md](DEAI_GITHUB_BENCHMARK_REVIEW_2026-10-29.md)
- 任务台账：[_audit/TASK_LEDGERS/2026-10-29_deai-github-benchmark-review.md](TASK_LEDGERS/2026-10-29_deai-github-benchmark-review.md)
- 主索引登记：[_audit/DEV_LOG_MASTER_INDEX.md](DEV_LOG_MASTER_INDEX.md)

## 5. 验证

见任务台账第 6 节。核心验证包括：

- 3 份新增/更新文档 `Test-Path` 全部为 True。
- `rg` 复核本仓 P0 证据行号。
- `rg` 复核外部仓关键机制行号。
- `git status --short` 对账本轮只新增审计文档，不改产品源码。

## 6. 边界

- 本轮是只读审查，不修改 `src/`。
- 不提交 git，不封装，不发起 live API。
- 修复建议尚未实施，后续需按报告第 8 节优先级立项。
