# 玄武/凯旋应用层升级 P0 基线

日期：2026-08-27
范围：只读审计与基线记录，不修改业务代码。

## 当前工作区边界

本次开始前工作区已存在大量历史源码改动、构建产物、审计记录和未跟踪文件。本阶段未执行回滚、`git clean` 或历史文件删除。后续只允许识别并处理本次新增文件，不能把历史状态当作本次产物。

## 关键执行入口

| 能力 | 文件 | 函数/位置 | 当前行为 |
|---|---|---|---|
| 流水线 Skill 执行 | `src/components/pipeline/PipelinePanel.vue` | `runStepSkills` / `_runStepSkillsInner` | 根据层级模式走 chain、compose 或引擎分支 |
| chain | `src/components/pipeline/PipelinePanel.vue` | 1805-1867 | `current` 依次传递，保存简化断点 |
| compose | `src/components/pipeline/PipelinePanel.vue` | 1869-1884 | 模板先独立渲染，再合并，单次 API 调用 |
| Agent 解析 | `src/components/pipeline/PipelinePanel.vue` | 1191-1196、1713-1740 | Skill 覆盖优先，但使用 `step-skillIndex` |
| 统一 AI 入口 | `src/services/aiService.ts` | `callAi` 327-469 | 统一路由、流式、重试、思考标签和 JSON 解析 |
| 公共 chain | `public/skill-engine.js` | `chain` 247-309 | 失败后恢复上一文本并继续后续步骤 |
| 正文写入 | `src/components/pipeline/PipelinePanel.vue` | `genBody` 2228-2271 | `result.text` 直接写入章节和编辑器事件 |
| 断点存储 | `src/stores/pipeline.ts` | 67-105 | 只保存 `lastOutput` 等简化字段 |

## 当前高风险缺口

1. 正文文本与来源、校验、执行日志没有独立结果模型。
2. L5 默认 `compose`，凯旋多 Skill 不会自动形成多次流水调用。
3. 没有正式的 L4 到正文层章节执行包契约。
4. Skill Agent 按索引绑定，调整 Skill 顺序可能导致 Agent 错位。
5. `inputSchema`、`outputSchema`、`retryPolicy` 没有流水线通用消费链。
6. 公共 chain 的失败状态可能继续使用旧输出，状态未严格区分。
7. 没有事件、场景、伏笔、角色状态的通用语义完整性校验。
8. 现有断点没有保存 Skill ID、输入、Agent、配置版本和错误快照。

## P0 验证命令

工作目录：`D:\codex\novel-workshop-vue3`

### `npm run type-check`

结果：命令退出码 0，无错误输出。

### `npm run test:services`

结果：`Test Files 2 passed (2)`；`Tests 44 passed (44)`。

### `npm run build:vue`

结果：`vite v8.2.1 building client environment for production...`；`176 modules transformed`；`built in 3.62s`。

现状警告：Vite config native loader、动态导入无效、大 chunk。它们属于基线风险，本阶段不顺手修复。

## P0 判定

- [x] 当前源码入口、函数和行号已记录。
- [x] 当前模式、Agent、chain、正文写入和断点事实已记录。
- [x] 现有验证命令已在本轮执行并记录原始关键输出。
- [x] 历史工作区改动边界已确认，未执行破坏性清理。
- [x] P0 未修改业务代码。

P0 状态：基线审计完成，可进入 P1。P1 必须先建立正文与 metadata 的结果边界，并以测试证明元数据不会进入正文。
