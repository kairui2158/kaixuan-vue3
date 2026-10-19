# Phase 5B 全层真实采样耗时结构

- 生成时间: 2026-10-12T21:09:50.970Z
- 模型: deepseek-v4-pro
- 供应商: https://openapi.cloud-ai.cn/v1

## 层级汇总

| 层 | 状态 | 总耗时 | API call | 物理请求 | 重试 | 首 token | 流式输出 | 本地校验 | 持久化 | 层间 gap |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
Step 0 大纲风格分析 | success | 22.48s | 1 | 1 | 0 | 2.03s | 20.34s | 0ms | 0ms | 0ms
Step 1 设定层 | success | 2.09m | 1 | 1 | 0 | 1.63s | 2.06m | 2ms | 83ms | 0ms
Step 2 卷纲层 | success | 36.66m | 12 | 12 | 0 | 26.97s | 36.18m | 1ms | 30ms | 0ms
Step 3 章节层 | success | 2.59m | 1 | 1 | 0 | 0ms | 0ms | 0ms | 42ms | 0ms
Step 4 正文层 | success | 10.94m | 3 | 5 | 2 | 12.53s | 10.73m | 1ms | 125ms | 0ms
记忆抽取 | success | 15.75s | 1 | 1 | 0 | 0ms | 0ms | 0ms | 0ms | 1.05s

## 上下文与输出

| 层 | contextChars | outputChars | repeatedPromptBlocks |
|---|---:|---:|---|
Step 0 大纲风格分析 | 284 | 238 | {}
Step 1 设定层 | 4660 | 3002 | {"[已生成卷事实清单]":0,"[大纲]":0,"[style reference]":1,"[上一步 SKILL 完整输出]":0}
Step 2 卷纲层 | 136499 | 73910 | {"[已生成卷事实清单]":2,"[大纲]":1,"[style reference]":1,"[上一步 SKILL 完整输出]":0}
Step 3 章节层 | 11411 | 1384 | {}
Step 4 正文层 | 61559 | 7139 | {"[已生成卷事实清单]":0,"[大纲]":0,"[style reference]":1,"[上一步 SKILL 完整输出]":0}
记忆抽取 | 2111 | 3418 | {}

## 归因边界

- firstTokenSumMs/outputSumMs 是模型侧结论。
- promptBuild/contextLoad/validation/persistence 是本地耗时结论。
- stepBoundaryGapMs 只表示同 scope 两次 run 之间的间隔，不能自动等同用户等待。
- 本文件只记录本批采样，不直接推出并发或路由改动。