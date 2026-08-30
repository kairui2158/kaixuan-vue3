# AI 命名工作台 开发日志

## 日期
2026-08-30

## 范围
为小说作者提供角色名、地点名、城市名、势力名、物品名、功法技能名、自定义类别的 AI 起名服务。生成结果可直接插入当前编辑器光标处或替换选中文本，支持收藏、历史、重新生成、取消和失败重试。

## 新增文件
- `src/types/aiNaming.ts` — 类型定义、常量、工厂函数、归一化
- `src/services/namingService.ts` — buildNamingPrompt、generateNames、repairNamingJson、regenerateSingleName
- `src/composables/useAiNaming.ts` — 状态/生成/取消/重试/收藏/历史/复制/插入
- `src/components/naming/AiNamingModal.vue` — 完整弹窗 UI

## 精确编辑文件
以下 6 个文件只做了行级精确编辑，未整文件覆盖：

1. **EditorPanel.vue** — `aiNames()` 移除 `if (!activeTab.value) return` 守卫，改为捕获编辑器选区快照后 dispatch `open-ai-naming` CustomEvent
2. **ChatPanel.vue** — `handleEditorAction` 新增 `ai-names` 分支，dispatch `open-ai-naming`
3. **App.vue** — import + 挂载 `<AiNamingModal />`，新增 `handleAiNamingInsert` 函数和 `ai-naming-insert` 事件监听
4. **PipelinePanel.vue** — `toolAction('names')` 改为 `openNaming()` dispatch `open-ai-naming`；移除 `toolAction` 中的 `names` 分支
5. **project.ts** — 新增 `aiNaming` ref、load/save 归一化、5 个 actions，return 导出
6. **useAiTools.ts** — `generateNames` 函数添加 `@deprecated` 注释

## 根因记录
前序 agent 把 worktree 整文件复制到 D 盘主项目，导致 worktree 独有提交中的写作规则、时间线、批量审阅、修订、变量等无关代码被一并带入。用户发现后要求精确修复。已用 `git checkout HEAD --` 恢复全部 6 个被污染文件到干净状态，再逐文件用 apply_patch 精确编辑。

## 已知 Bug 修复
1. `confirm()` -> `window.confirm()` — Electron contextIsolation 下 `confirm` 可能失效（3 处）
2. `naming.visible` -> `naming.visible.value` — composable 返回的 ref 在模板中不自动解包

## 验证

### 构建
- `npx vue-tsc --noEmit` -> exit:0 | 无类型错误
- `npx vite build` -> exit:0 | 195 modules transformed, built in 1.12s
- `npx vitest run` -> exit:0 | 12 spec files, 100 tests passed

### Electron CDP 验证
启动器：`start-electron.bat` -> CDP 端口 9227

| 步骤 | 结果 |
| --- | --- |
| btn-ai-names 存在 | true |
| 按钮文本 | AI命名 |
| 点击后 .naming-overlay 可见 | true |
| 弹窗标题 | AI 命名工作台 |
| Tab 数量 | 7 |
| Tab 标签 | 角色 | 地点 | 城市 | 势力 | 物品 | 功法技能 | 自定义 |
| 关闭按钮存在 | true |
| 点击 X 关闭后 overlay 消失 | true |
| 点击遮罩关闭后 overlay 消失 | true |
| 底部关闭按钮 | 生成名字 | 关闭 |
| 底部关闭后 overlay 消失 | true |
| 截图 | naming-modal.png 已保存 |

## 未验证边界
- 真实 AI 生成（需客户配置 API Key）— 生成链路代码已实现但未做真实网络请求验证
- 收藏/历史持久化跨进程恢复（需完整 UI 操作流程 + 杀进程重启）
- 插入编辑器光标处/替换选中文本（需有 activeTab 的编辑器场景下验证）

## 经验教训
1. **禁止跨分支整文件复制**：worktree 独有提交中的功能代码不能整文件复制到主分支，否则会带入无关功能。必须用 apply_patch 逐文件精确编辑。
2. **composable ref 在模板中的解包**：从 composable 返回的 ref 在模板中需要 `.value` 访问，因为它是通过解构返回的，Vue 不会自动解包。
3. **Electron 下的 confirm**：`confirm()` 在 contextIsolation 下可能失效，统一使用 `window.confirm()`。
4. **Node.js 原生 WebSocket**：Node 24 的 `WebSocket` 是全局对象，使用 `addEventListener` 而非 `on` 事件 API。
