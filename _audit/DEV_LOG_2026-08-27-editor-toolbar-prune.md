# 2026-08-27 主页编辑器工具入口收敛

## 目标

关闭主页编辑器中暂无明确闭环的写作规则、时间线、批量审阅、修订和变量入口，保留 AI 命名及其他板块共享能力。

## 修改

- 修改 `src/components/editor/EditorPanel.vue`。
- 删除上述五个主页按钮、对应事件函数和仅服务于变量入口的弹窗状态、模板与样式。
- 保留 `AI命名` 按钮与 `aiNames()` 事件入口。
- 未删除 `useAiTools`、流水线工具、右侧对话修订、记忆板块时间线或 SKILL 模板变量引擎。

## 验证

- `npm run type-check`：通过。
- `npx vitest run`：9 个测试文件、67 个测试通过。
- `npm run build:vue`：构建成功；保留既有动态导入和 chunk 体积警告。
- 生产 Electron/CDP：`file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`；页面标题“神意助手”；编辑器存在；AI命名存在；四个关闭入口不存在。

## 边界

本次是主页入口下线，不代表全应用删除这些共享能力。后续若要删除流水线或记忆板块中的同类功能，必须另行盘点引用和验证。

## 补充验证

- `npm run test:services`：2 个测试文件、44 个测试通过。
- `rg` 复核：`EditorPanel.vue` 仅保留 `aiNames` / `AI命名`，五个关闭入口无残留引用。
- 临时残留文件 `$null`、`_audit_memory_rg_current.txt` 已清理。
- Electron 进程已全部关闭。
