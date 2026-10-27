# Phase 5B 全层真实采样耗时结构

- 生成时间: 2026-10-22T16:45:10.953Z
- 模型: deepseek-v4-pro
- 供应商: https://openapi.cloud-ai.cn/v1

## 层级汇总

| 层 | 状态 | 总耗时 | API call | 物理请求 | 重试 | 首 token | 流式输出 | 本地校验 | 持久化 | 层间 gap |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
Step 0 大纲风格分析 | degraded | 8.77s | 1 | 1 | 0 | 0ms | 0ms | 0ms | 0ms | 0ms
Step 1 设定层 | success | 6.65m | 1 | 2 | 1 | 9.38s | 6.48m | 3ms | 100ms | 0ms
Step 2 卷纲层 | success | 50.82m | 12 | 12 | 0 | 49.01s | 49.98m | 1ms | 36ms | 0ms
Step 3 章节层 | success | 2.09m | 1 | 1 | 0 | 4.34s | 2.02m | 0ms | 28ms | 0ms
Step 4 正文层 | success | 12.94m | 3 | 7 | 8 | 26.51s | 12.49m | 0ms | 104ms | 0ms
记忆抽取 | success | 23.25s | 1 | 1 | 0 | 0ms | 0ms | 0ms | 0ms | 1.18s

## 上下文与输出

| 层 | contextChars | outputChars | repeatedPromptBlocks |
|---|---:|---:|---|
Step 0 大纲风格分析 | 464 | 167 | {}
Step 1 设定层 | 6670 | 2474 | {"[已生成卷事实清单]":0,"[全书大纲]":0,"[大纲]":0,"[style reference]":1,"[上一步 SKILL 完整输出]":0}
Step 2 卷纲层 | 147615 | 92919 | {"[已生成卷事实清单]":1,"[全书大纲]":0,"[大纲]":1,"[style reference]":1,"[上一步 SKILL 完整输出]":0}
Step 3 章节层 | 8737 | 1897 | {}
Step 4 正文层 | 70661 | 6999 | {"[已生成卷事实清单]":0,"[全书大纲]":0,"[大纲]":0,"[style reference]":1,"[上一步 SKILL 完整输出]":0}
记忆抽取 | 2590 | 5007 | {}

## 归因边界

- firstTokenSumMs/outputSumMs 是模型侧结论。
- promptBuild/contextLoad/validation/persistence 是本地耗时结论。
- stepBoundaryGapMs 只表示同 scope 两次 run 之间的间隔，不能自动等同用户等待。
- 本文件只记录本批采样，不直接推出并发或路由改动。