# 2026-08-30 大纲工作台 Agent/SKILL 迁移收尾

## 变更

- 生成流水线大纲层不再重复承载 Agent/Skill/模式配置，改为只读信息框并保留跳转入口。
- 大纲工作台顶栏接入智能体、Skill、并行/串行配置；底栏显示已选 Skill，chain 模式支持按 Skill 绑定 Agent。
- AI 共创继续走 `aiService.callAi`，chain 与 compose 均能消费工作台配置；Skill 输出可回到大纲编辑器。
- 修复 `askPlainAi` 函数体丢失问题，并让手动打字进入撤销栈；连续 800ms 内输入合并为一次撤销。
- 流水线大纲层信息框与工作台共享 `pipeline_step_config`，配置恢复和状态显示保持单一数据源。
- 修复 Skill 列表过滤后 TypeScript 仍可能为 undefined 的类型边界。

## 验证

- `npm run build:vue` 通过，产物生成于 `dist-renderer`。
- `npm run type-check` 通过。
- `npm run test:services` 通过：2 个测试文件、44 条测试全部通过。
- 真实 Electron CDP 回归通过：手动输入、撤销、重做、确认锁定、进入流水线、锁定只读、解锁恢复编辑。
- 大纲工作台 UI 回归通过：顶栏配置、编辑器、AI 对话、输入区、底部操作区无横向/纵向溢出，关键控件全部可见。
- 错误路径回归通过：缺少生成供应商时显示“请先配置API供应商”，验证后恢复原供应商引用并清理临时项目。

## 版本

- `package.json` 从 `3.6.1` 升级为 `3.7.0`；本次属于工作台功能迁移与闭环补齐，按次版本号升级。
