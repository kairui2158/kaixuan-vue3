# Phase 5B 全层真实采样耗时结构

- 生成时间: 2026-10-12T20:01:02.819Z
- 模型: deepseek-v4-pro
- 供应商: https://openapi.cloud-ai.cn/v1

## 层级汇总

| 层 | 状态 | 总耗时 | API call | 物理请求 | 重试 | 首 token | 流式输出 | 本地校验 | 持久化 | 层间 gap |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
Step 0 大纲风格分析 | success | 14.10s | 1 | 1 | 0 | 1.60s | 12.38s | 0ms | 0ms | 0ms
Step 1 设定层 | success | 1.60m | 1 | 1 | 0 | 3.00s | 1.54m | 2ms | 38ms | 0ms
Step 2 卷纲层 | success | 54.58m | 12 | 14 | 2 | 20.81m | 53.73m | 1ms | 89ms | 0ms
Step 3 章节层 | success | 12.02m | 2 | 3 | 1 | 0ms | 0ms | 0ms | 57ms | 0ms
Step 4 正文层 | success | 11.71m | 3 | 5 | 2 | 13.81s | 11.47m | 1ms | 276ms | 0ms
记忆抽取 | success | 29.07s | 1 | 1 | 0 | 0ms | 0ms | 0ms | 0ms | 0ms

## 上下文与输出

| 层 | contextChars | outputChars | repeatedPromptBlocks |
|---|---:|---:|---|
Step 0 大纲风格分析 | 284 | 252 | {}
Step 1 设定层 | 4660 | 2825 | {"[已生成卷事实清单]":0,"[大纲]":0,"[style reference]":1,"[上一步 SKILL 完整输出]":0}
Step 2 卷纲层 | 127221 | 64687 | {"[已生成卷事实清单]":1,"[大纲]":1,"[style reference]":1,"[上一步 SKILL 完整输出]":0}
Step 3 章节层 | 19521 | 1973 | {}
Step 4 正文层 | 56305 | 7967 | {"[已生成卷事实清单]":0,"[大纲]":0,"[style reference]":1,"[上一步 SKILL 完整输出]":0}
记忆抽取 | 2208 | 6533 | {}

## 归因边界

- firstTokenSumMs/outputSumMs 是模型侧结论。
- promptBuild/contextLoad/validation/persistence 是本地耗时结论。
- stepBoundaryGapMs 只表示同 scope 两次 run 之间的间隔，不能自动等同用户等待。
- 本文件只记录本批采样，不直接推出并发或路由改动。