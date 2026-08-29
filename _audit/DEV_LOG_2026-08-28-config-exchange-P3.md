# Agent/Skill Markdown 导入底座 P3 开发日志

## 目标

为无 Front Matter 的普通 Markdown 提供确定性 Agent/Skill 身份推导，并保留字段来源与诊断信息，避免把标题误写进提示词或模板。

## 本轮修改

- `src/services/configExchange/markdown.ts`
  - 识别首个一级标题；无标题时从来源文件名推导名称。
  - 由推导出的名称生成稳定 `id`。
  - 通过 `fieldTrace` 标记 `name/id` 的 `inferred` 来源，并通过 `diagnostics` 给出提示。
  - 标题从正文边界剥离，不进入 Agent `systemPrompt` 或 Skill `template`。
- `src/services/configExchange.spec.ts`
  - 增加 Agent 从普通 Markdown 标题推导的回归。
  - 增加 Skill 从文件名推导的回归。
  - 覆盖推导字段、正文边界和诊断元数据。

## 验证

- `npx vitest run src/services/configExchange.spec.ts --reporter=verbose`
  - `Test Files 1 passed (1)`
  - `Tests 20 passed (20)`
- `npm run type-check`
  - `vue-tsc --noEmit` 无错误输出。
- `npm run build:vue`
  - `vite v8.2.1`，`189 modules transformed`，`built in 3.54s`。
  - 仅有既有 `INEFFECTIVE_DYNAMIC_IMPORT`、大 chunk 和 plugin timing warning，无构建错误。
- 生产 Electron/CDP
  - 本轮未能取得新鲜 CDP 页面证据；先前启动器曾输出 `[OK] Application started`，但 Electron 随后退出，9227 无监听。
  - 因此普通 Markdown 原生文件选择器和安装路径仍标记为待核销，不能扩大解释为客户路径已通过。

## 状态

- [x] 普通 Markdown 标题推导
- [x] 普通 Markdown 文件名回退推导
- [x] 推导字段审计信息
- [x] focused 测试、类型检查、生产 Vue 构建
- [ ] 生产 Electron/CDP 客户路径：等待独立载体验证
