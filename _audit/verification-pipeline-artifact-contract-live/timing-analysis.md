# Phase 5B 全层真实采样耗时结构

- 生成时间: 2026-10-19T20:14:41.763Z
- 模型: deepseek-v4-pro
- 供应商: https://openapi.cloud-ai.cn/v1

## 层级汇总

| 层 | 状态 | 总耗时 | API call | 物理请求 | 重试 | 首 token | 流式输出 | 本地校验 | 持久化 | 层间 gap |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
Step 0 大纲风格分析 | degraded | 3.90s | 1 | 1 | 0 | 0ms | 0ms | 0ms | 0ms | 0ms
Step 1 设定层 | success | 1.41m | 1 | 1 | 0 | 2.49s | 1.36m | 2ms | 38ms | 0ms
Step 2 卷纲层 | success | 34.64m | 12 | 12 | 0 | 25.80s | 34.18m | 1ms | 201ms | 0ms
Step 3 章节层 | success | 53.16s | 1 | 1 | 0 | 1.88s | 51.20s | 0ms | 13ms | 0ms
Step 4 正文层 | success | 11.05m | 3 | 7 | 8 | 15.95s | 10.77m | 1ms | 157ms | 0ms
记忆抽取 | success | 28.41s | 1 | 1 | 0 | 0ms | 0ms | 0ms | 0ms | 1.04s

## 上下文与输出

| 层 | contextChars | outputChars | repeatedPromptBlocks |
|---|---:|---:|---|
Step 0 大纲风格分析 | 464 | 167 | {}
Step 1 设定层 | 5379 | 2216 | {"[已生成卷事实清单]":0,"[大纲]":0,"[style reference]":1,"[上一步 SKILL 完整输出]":0}
Step 2 卷纲层 | 144859 | 78030 | {"[已生成卷事实清单]":1,"[大纲]":1,"[style reference]":1,"[上一步 SKILL 完整输出]":0}
Step 3 章节层 | 6367 | 602 | {}
Step 4 正文层 | 60248 | 7761 | {"[已生成卷事实清单]":0,"[大纲]":0,"[style reference]":1,"[上一步 SKILL 完整输出]":0}
记忆抽取 | 3088 | 5507 | {}

## 归因边界

- firstTokenSumMs/outputSumMs 是模型侧结论。
- promptBuild/contextLoad/validation/persistence 是本地耗时结论。
- stepBoundaryGapMs 只表示同 scope 两次 run 之间的间隔，不能自动等同用户等待。
- 本文件只记录本批采样，不直接推出并发或路由改动。