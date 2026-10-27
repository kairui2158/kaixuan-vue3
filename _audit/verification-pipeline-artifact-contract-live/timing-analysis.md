# Phase 5B 全层真实采样耗时结构

- 生成时间: 2026-10-27T01:11:22.364Z
- 模型: deepseek-v4-pro
- 供应商: https://openapi.cloud-ai.cn/v1

## 层级汇总

| 层 | 状态 | 总耗时 | API call | 物理请求 | 重试 | 首 token | 流式输出 | 本地校验 | 持久化 | 层间 gap |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
Step 0 大纲风格分析 | degraded | 2.44s | 1 | 1 | 0 | 0ms | 0ms | 0ms | 0ms | 0ms
Step 1 设定层 | success | 3.16m | 1 | 2 | 1 | 3.54s | 3.09m | 3ms | 99ms | 0ms
Step 2 卷纲层 | success | 38.83m | 12 | 12 | 0 | 27.41s | 38.35m | 0ms | 267ms | 0ms
Step 3 章节层 | success | 55.68s | 1 | 1 | 0 | 3.00s | 52.63s | 1ms | 18ms | 0ms
Step 4 正文层 | success | 14.57m | 3 | 5 | 3 | 18.68s | 14.25m | 1ms | 129ms | 0ms
记忆抽取 | success | 36.82s | 1 | 1 | 0 | 0ms | 0ms | 0ms | 0ms | 1.51s

## 上下文与输出

| 层 | contextChars | outputChars | repeatedPromptBlocks |
|---|---:|---:|---|
Step 0 大纲风格分析 | 464 | 167 | {}
Step 1 设定层 | 6669 | 3473 | {"[已生成卷事实清单]":0,"[全书大纲]":0,"[大纲]":0,"[style reference]":1,"[上一步 SKILL 完整输出]":0}
Step 2 卷纲层 | 137754 | 78857 | {"[已生成卷事实清单]":1,"[全书大纲]":0,"[大纲]":1,"[style reference]":1,"[上一步 SKILL 完整输出]":0}
Step 3 章节层 | 5876 | 328 | {}
Step 4 正文层 | 60074 | 11165 | {"[已生成卷事实清单]":0,"[全书大纲]":0,"[大纲]":0,"[style reference]":1,"[上一步 SKILL 完整输出]":0}
记忆抽取 | 2633 | 7439 | {}

## 归因边界

- firstTokenSumMs/outputSumMs 是模型侧结论。
- promptBuild/contextLoad/validation/persistence 是本地耗时结论。
- stepBoundaryGapMs 只表示同 scope 两次 run 之间的间隔，不能自动等同用户等待。
- 本文件只记录本批采样，不直接推出并发或路由改动。