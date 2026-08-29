# Agent/Skill Markdown 导入底座 P2 开发日志

## 目标

让第三方 Agent/Skill 配置使用常见字段名时，经统一归一化入口转换为应用内部协议；标准字段保持优先，别名映射可审计。

## 本轮修改

- `src/services/configExchange/validation.ts`
  - Agent 支持 `agentId`、`title/displayName`、`instruction`、`modelName`、`temp`、`max_tokens`、`providerId` 别名。
  - Skill 支持 `skillId`、`title/displayName`、`prompt/instruction`、`mode`、`output_format`、`validation` 别名。
  - 增加标准字段优先和别名映射 warning。
- `src/services/configExchange.spec.ts`
  - 将 `agentId` 行为改为可兼容导入。
  - 增加 Agent/Skill 别名归一化回归。

## 验证

- `npx vitest run src/services/configExchange.spec.ts --reporter=verbose`
  - `Test Files 1 passed (1)`
  - `Tests 18 passed (18)`
- `npm run type-check`
  - `vue-tsc --noEmit` 无错误输出。
- `npm run build:vue`
  - `vite v8.2.1`，`189 modules transformed`，`built in 2.44s`。
  - 既有动态导入和大 chunk warning 未改变。

## 状态

- [x] Agent 第三方字段映射
- [x] Skill 第三方字段映射
- [x] 标准字段优先与 warning
- [x] focused 测试、类型检查、生产 Vue 构建
- [ ] 普通 Markdown 标题推导（P3）
- [ ] 生产 Electron/CDP 客户路径：因本轮启动载体退出，仍待独立核销
