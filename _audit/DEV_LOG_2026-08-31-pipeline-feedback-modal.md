# 开发日志：流水线进度弹窗重叠修复（2026-08-31）

## 问题

客户截图显示生成流水线同时出现"卷纲层 AI 生成进度"和"章节 AI 生成进度"两个弹窗叠加。用户确认每一层都会出现双弹窗，不是单层偶发。

## 根因

三层进度弹窗的 visible computed 均写成 `pipelineStore.isGenerating || 本层日志存在`。`isGenerating` 是全局状态：生成章节时全局为 true，卷纲层若有历史日志也满足条件，两层弹窗同时显示。三层各自满足条件时理论上最多三个弹窗叠加。

## 修复

`src/components/pipeline/PipelinePanel.vue`：

1. 新增组件级 `activeGenerationFeedbackStep = ref<1 | 2 | 3 | null>(null)`。
2. `genSettings` / `genVolumes` / `genChapters` 入口分别设置活跃层为 1 / 2 / 3。
3. 三层 visible computed 改为生成中只亮 `activeGenerationFeedbackStep` 对应层，完成/中断后回落到本层日志判断。

## 验证

1. `node _audit/tmp/pipeline_feedback_modal_regression.mjs`：7 项断言全部通过（step1/2/3 生成中各只亮一个对应 overlay、无日志完成态全收起、idle 无残留），pageErrors 为空，结果写入 `_audit/tmp/pipeline_feedback_modal_result.json`。
2. `npm run type-check` 通过。
3. `npm run build:vue` 通过，286 个模块转换成功。
