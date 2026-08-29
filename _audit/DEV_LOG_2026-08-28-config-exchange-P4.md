# Agent/Skill Markdown 导入底座 P4 开发日志

## 目标

统一 Skill Markdown 导出规则，同时保留旧 store 导出方法的兼容行为，避免双 Writer 造成字段漂移。

## 本轮修改

- `src/stores/skill.ts`
  - 保留 `exportSkillToMD(skillId)` 作为历史兼容入口。
  - 删除该入口内的独立 YAML 拼接逻辑。
  - 改为 `toSkillRecord(s)` 后委托唯一正式 Writer `serializeSkillMd()`。

## 验证

- `npx vitest run src/services/configExchange.spec.ts --reporter=verbose`
  - `Test Files 1 passed (1)`
  - `Tests 20 passed (20)`
- `npm run type-check`
  - `vue-tsc --noEmit` 无错误输出。
- `npm run build:vue`
  - `vite v8.2.1`，`189 modules transformed`，`built in 2.79s`。
  - 仅有既有动态导入与大 chunk warning，无构建错误。
- 差异核对
  - `src/stores/skill.ts:153-158` 的旧入口只执行查找、归一化和正式序列化，不再维护第二套 Markdown 字段清单。
  - `src/services/configExchange/markdown.ts:205-223` 保留唯一 `serializeSkillMd` 字段顺序与模板输出。

## 状态

- [x] 旧 Writer 独立实现移除
- [x] 旧 store 入口兼容委托
- [x] focused 测试、类型检查、生产 Vue 构建
- [ ] 生产 Electron/CDP 原生导出路径：等待 P6 独立核销
