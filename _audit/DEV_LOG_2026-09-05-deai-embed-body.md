# 降AI内嵌正文层

> 日期：2026-09-05
> 版本：3.23.0（minor）
> 文件：src/components/pipeline/PipelinePanel.vue
> 经验引用：S1 改码纪律 / S3 验证纪律 / S8 AI 服务纪律

## 改动概述

将降AI能力从生成后单独跑一遍改为生成时前置约束 + 生成后自动清洗两步闭环，使正文层一步到位产出低AI味正文。

## 改动清单

### 1. import 引入（P0）
- 新增 import DeAiProcessor 和 DEAI_METHODOLOGY_PROMPT
- 行号：892

### 2. 前置层 system prompt 注入（P1）
- 位置：callApiWithAgent 函数 行2090
- 逻辑：step === 4 时将 DEAI_METHODOLOGY_PROMPT 注入到 system prompt 末尾
- 注入顺序：SKILL template -> Agent systemPrompt -> 降AI方法论17条
- chain 和 compose 都走 callApiWithAgent 统一入口，一次覆盖
- 其他四层（step 1/2/3）不受影响

### 3. 后处理层自动清洗（P2）
- 位置：genBody 函数 行2710
- 逻辑：bodyResult 赋值前调用 DeAiProcessor.process()
- try-catch 保护，失败时用原文继续
- DeAiProcessor 自带 75% 字数保护
- finalBody 贯穿 insertToEditor、confirmBodyWithMemory、syncChapterManager 全链路

### 4. UI 标识（P3）
- 正文层生成按钮旁新增 已内嵌降AI 标识
- 纯展示 span，不涉及按钮和状态控制
- CSS 类 .pl-deai-badge 使用 inline-flex + white-space:nowrap

## 验证

- 类型检查：npx vue-tsc --noEmit 通过（0 错误）
- 构建：npm run build:vue 通过（1.43s）
- CDP 验证：源 Electron 启动后点击流水线 -> 正文层，确认 .pl-deai-badge 文本为 已内嵌降AI

## 影响范围

- 仅改 PipelinePanel.vue 1 个文件
- 约 16 行代码 + 5 行 CSS
- 不改 de-ai.js、aiService.ts、其他四层、主页编辑器降AI功能

## 客户验证重点

1. 正文层生成正文时 API 日志含 降AI后处理完成 N 处修正
2. 正文文本中 AI 套话和禁用词减少
3. 其他四层生成结果不受降AI影响
4. 已内嵌降AI 标识可见不溢出
