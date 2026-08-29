# 主页编辑器工具入口收敛 — 最终交付报告

## 结论

已按目标模式完成主页编辑器顶部五个无用入口（写作规则、时间线、批量审阅、修订、变量）的下线，保留 AI 命名。共享能力保留在其他板块，未做全应用功能删除。

## 关闭的入口（EditorPanel.vue 主页）

- 写作规则
- 时间线
- 批量审阅
- 修订
- 变量（含弹窗、状态、confirmVar 等仅服务于变量入口的代码）

## 保留

- AI 命名按钮与 `aiNames()`
- `useAiTools.ts` 的共享函数
- 流水线 AI 工具
- 右侧对话修订处理
- 记忆板块 TimelineView / MemoryPanel
- SkillSettings / skill-template-engine.js 的变量能力

## 验证证据

- `npm run type-check`：通过
- `npx vitest run`：9 个测试文件、67 个测试通过
- `npm run test:services`：2 个测试文件、44 个测试通过
- `npm run build:vue`：构建成功（保留既有动态导入 / chunk 体积警告）
- 生产 Electron/CDP：页面标题“神意助手”；编辑器存在；AI命名存在；五个关闭入口不存在
- `rg` 复核：EditorPanel.vue 仅保留 `aiNames` / `AI命名`

## 边界与说明

- 本次为入口下线，共享能力保留，非全应用删除。
- 主页 AI 命名按钮目前仍是事件入口（发送 `editor-action` 的 `ai-names`），尚未有消费端闭环，本次未扩展该能力。
