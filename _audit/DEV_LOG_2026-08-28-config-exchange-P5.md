# Agent/Skill Markdown 导入底座 P5 开发日志

## 目标

让 Agent/Skill 设置页的 Markdown/JSON 导入预览与实际冲突处理保持一致，并确保取消后不会遗留上一次导入上下文。

## 本轮修改

- `src/components/settings/AgentSettings.vue`
  - 冲突策略变化时重新构建导入计划。
  - 取消时清理诊断信息和来源路径。
  - 补充 `buildImportPlan` 正式服务导入。
- `src/components/settings/SkillSettings.vue`
  - 冲突策略变化时重新构建导入计划。
  - 取消时清理诊断信息和来源路径。
  - 补充 `buildImportPlan` 正式服务导入。

## 验证

- `npx vitest run src/services/configExchange.spec.ts --reporter=verbose`
  - `Test Files 1 passed (1)`
  - `Tests 20 passed (20)`
- `npm run type-check`
  - `vue-tsc --noEmit` 无错误输出。
- `npm run build:vue`
  - `vite v8.2.1`，`189 modules transformed`，`built in 5.53s`。
  - 仅有既有动态导入与大 chunk warning，无构建错误。
- 真实 Electron/CDP
  - 尚未在本阶段核销，统一留到 P6；不能将组件源码检查扩大解释为客户导入通过。

## 状态

- [x] Agent 导入预览策略同步
- [x] Skill 导入预览策略同步
- [x] 取消状态清理
- [x] focused 测试、类型检查、生产 Vue 构建
- [ ] 生产 Electron/CDP 与原生文件路径
