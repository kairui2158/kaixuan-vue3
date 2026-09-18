# 2026-09-12 Folder Chain 变量注入与 Reasoning 可见性修复

## 项目功能

生成流水线的 folder SKILL 链式执行修复。目标是让 folder 自带 `template.md` 保留自身结构，同时接收流水线层的真实变量；并让 reasoning 流在进度弹窗与运行记录中可见、可导出，避免长时间思考期间用户看到空白进度。

## 开发内容

1. `realSkillTypes.ts` / `skillRouter.ts` 新增 `templateVariables` 通道，由 PipelinePanel 直接传入 `ctxForSkill`。
2. `realSkillExecutor.ts` 移除“从已解析模板反推变量”的启发式实现，改为用显式变量表替换 folder `template.md` 的 `{{name}}` 占位符；folder 模板优先级不变，缺失同名占位符时输出 `folder-template-variables-missing` 诊断。
3. `PipelinePanel.vue` 的 folder chain 调用传入 `ctxForSkill`，避免 `resolvedTemplate` 已替换完成后无法恢复变量值。
4. `runTrace.ts` 的 `RunTraceApiCall` 记录 `reasoningText`，`appendReasoning()` 按累计流计算增量；文本导出新增“思考过程全文”，JSON 导出天然包含该字段。
5. `realSkillExecutor.spec.ts` / `runTrace.spec.ts` 增加变量注入、缺失变量诊断、reasoning 透传与导出回归测试。

## 验证

- `npm run type-check`：通过。
- `npx vitest run src/services/realSkillExecutor.spec.ts src/stores/runTrace.spec.ts src/services/skillRouter.spec.ts`：51/51 通过。
- 版本号升级至 `3.38.1`。

## 经验教训

不能用“已解析结果”反推“输入变量”。一旦占位符被替换，信息已经丢失，启发式解析只会制造偶发成功。跨层传递必须提供显式上下文通道，并把缺失情况写成可诊断事件。
