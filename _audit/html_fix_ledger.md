# HTML 修复对账表单

## 基本信息
- **任务名称**: 任务一：旧架构→新架构 HTML 最深度逐项对比修复
- **旧架构**: C:\Users\凯瑞\Documents\New project 2\renderer.html
- **新架构**: D:\codex\novel-workshop-vue3\src\ (38个 .vue 文件)
- **启动时间**: 2026-08-15
- **当前状态**: ✅ 已完成 — 编译通过

## 修复清单 — PipelinePanel.vue (生成流水线)

| 序号 | 缺失ID | 修复操作 | 修复状态 | 验证状态 |
|------|--------|---------|---------|---------|
| 1 | pl-steps | 添加 id="pl-steps" 到左侧步骤容器 | ✅ 已完成 | ✅ 编译通过 |
| 2 | pl-step-1-content ~ 5-content | 添加 id 到5个步骤面板 | ✅ 已完成 | ✅ 编译通过 |
| 3 | pl-nav（翻页） | 移除 HTML + CSS 翻页按钮 | ✅ 已完成 | ✅ 编译通过 |
| 4 | stepsWithIds computed | 添加 computed 属性修复未定义引用 | ✅ 已完成 | ✅ 编译通过 |
| 5 | btn-pl-gen-settings | 添加 id 到"AI生成设定"按钮 | ✅ 已完成 | ✅ 编译通过 |
| 6 | btn-pl-gen-volumes | 添加 id 到"AI生成全卷"按钮 | ✅ 已完成 | ✅ 编译通过 |
| 7 | btn-pl-gen-single-volume | 添加 id 到"逐卷生成"按钮 | ✅ 已完成 | ✅ 编译通过 |
| 8 | btn-pl-create-volumes | 添加 id 到"自动生成卷纲"按钮 | ✅ 已完成 | ✅ 编译通过 |
| 9 | btn-pl-continue-volumes | 添加 id 到"批量续生成"按钮 | ✅ 已完成 | ✅ 编译通过 |
| 10 | btn-pl-gen-chapters | 添加 id 到"AI生成章节"按钮 | ✅ 已完成 | ✅ 编译通过 |
| 11 | btn-pl-autogen-chapters | 添加 id 到"自动生成章节"按钮 | ✅ 已完成 | ✅ 编译通过 |
| 12 | btn-pl-gen-body | 添加 id 到"AI生成正文"按钮 | ✅ 已完成 | ✅ 编译通过 |
| 13 | btn-pl-insert-body | 添加 id 到"插入到编辑器"按钮 | ✅ 已完成 | ✅ 编译通过 |
| 14 | btn-pl-confirm-body | 添加 id 到"确认正文"按钮 | ✅ 已完成 | ✅ 编译通过 |
| 15 | pl-outline | 添加 id 到大纲 textarea | ✅ 已完成 | ✅ 编译通过 |
| 16 | pl-book-word-count | 添加 id 到全书字数输入 | ✅ 已完成 | ✅ 编译通过 |
| 17 | pl-volume-count | 添加 id 到卷数输入 | ✅ 已完成 | ✅ 编译通过 |
| 18 | pl-chapter-wordcount | 添加 id 到每章字数输入 | ✅ 已完成 | ✅ 编译通过 |
| 19 | pl-ch-est-count | 添加 id 到预计章数显示 | ✅ 已完成 | ✅ 编译通过 |
| 20 | pl-ch-empty-hint | 添加 id 到空提示 | ✅ 已完成 | ✅ 编译通过 |
| 21 | pl-body-result | 添加 id 到正文结果区 | ✅ 已完成 | ✅ 编译通过 |
| 22 | pl-bound-settings-list | 添加 id 到设定列表容器 | ✅ 已完成 | ✅ 编译通过 |
| 23 | pl-volume-config | 添加 id 到卷配置容器 | ✅ 已完成 | ✅ 编译通过 |
| 24 | pl-vol-list | 添加 id 到卷列表容器 | ✅ 已完成 | ✅ 编译通过 |
| 25 | pl-ch-gen-bar | 添加 id 到章节生成配置区 | ✅ 已完成 | ✅ 编译通过 |
| 26 | pl-ch-cards-area | 添加 id 到章节卡片区 | ✅ 已完成 | ✅ 编译通过 |
| 27 | pl-context-summary | 添加 id 到正文配置区 | ✅ 已完成 | ✅ 编译通过 |
| 28 | 修复 genChapters async | 添加 async 关键字修复 await 编译错误 | ✅ 已完成 | ✅ 编译通过 |
| 29 | 修复 HTML 闭合标签 | 修复 pl-nav 移除后多余 </div> | ✅ 已完成 | ✅ 编译通过 |

## 修复清单 — App.vue

| 序号 | 缺失ID | 修复操作 | 修复状态 | 验证状态 |
|------|--------|---------|---------|---------|
| 1 | resizer-chapter | 添加 id="resizer-chapter" 到分隔条 | ✅ 已完成 | ✅ 编译通过 |
| 2 | resizer-editor-chat | 添加 id="resizer-editor-chat" 到分隔条 | ✅ 已完成 | ✅ 编译通过 |

## 修复清单 — SidebarNav.vue（动态生成，非缺失）

| 序号 | 动态ID | 说明 | 状态 |
|------|--------|------|------|
| 1 | btn-outline-workspace | 通过 :id 动态生成 | ✅ 运行时存在 |
| 2 | btn-settings-collection | 通过 :id="'btn-' + item.id" 动态生成 | ✅ 运行时存在 |
| 3 | btn-pipeline | 同上 | ✅ 运行时存在 |
| 4 | btn-memory | 同上 | ✅ 运行时存在 |
| 5 | btn-plugin-market | 同上 | ✅ 运行时存在 |
| 6 | btn-settings | 同上 | ✅ 运行时存在 |
| 7 | btn-dashboard | 同上 | ✅ 运行时存在 |

## 编译验证
- **命令**: npx vite build
- **结果**: ✅ 成功 (134 modules transformed, 0 errors)
- **输出**: dist-renderer/index.html (0.57 kB), index-CVy2MTjb.css (102.02 kB), index-CVYDMtqc.js (423.35 kB)
- **仅 warning**: COMMONJS_VARIABLE_IN_ESM（已有文件，不影响功能）

## 深度扫描补验（2026-08-15 二次确认）

### 结论：旧架构 renderer.html 的 351 个静态 ID 已有对应实现

通过 `html_ids_diff.json` 全量扫描（旧 351 个 ID vs 新 358 个静态/动态 ID）二次核验：

| 检查项 | 结果 | 证据 |
|--------|------|------|
| 旧架构静态 ID 总数 | 351 | `_audit/html_ids_diff.json` |
| 新架构静态 ID 总数 | 358 | 同上 |
| 静态匹配 ID | 334 | 同上 |
| 动态生成 ID | 16 | SidebarNav `:id="'btn-'+item.id"`、SettingsModal `:id="'tab-'+tab.id"`、DeAiSettings `:id="deai-card-${m.id}"` |
| 需修复缺失 ID | 1 | `btn-deai-add-skill`（旧架构名称）→ 见下方说明 |
| 真正缺失（必须新增） | 0 | 所有关键面板/模态框/控件均已存在 |

### 17 个"静态扫描缺失"ID 逐一核验结果

| 序号 | 缺失ID | 核验结果 | 状态 |
|------|--------|---------|------|
| 1 | btn-outline-workspace | SidebarNav.vue `:id` 动态生成，运行时存在 | ✅ 非缺失 |
| 2 | btn-settings-collection | 同上 | ✅ 非缺失 |
| 3 | btn-pipeline | 同上 | ✅ 非缺失 |
| 4 | btn-memory | 同上 | ✅ 非缺失 |
| 5 | btn-plugin-market | 同上 | ✅ 非缺失 |
| 6 | btn-settings | 同上 | ✅ 非缺失 |
| 7 | btn-dashboard | 同上 | ✅ 非缺失 |
| 8 | tab-skills | SettingsModal.vue `:id="'tab-'+tab.id"` | ✅ 非缺失 |
| 9 | tab-agents | 同上 | ✅ 非缺失 |
| 10 | tab-appearance | 同上 | ✅ 非缺失 |
| 11 | tab-deai | 同上 | ✅ 非缺失 |
| 12 | tab-diag | 同上 | ✅ 非缺失 |
| 13 | deai-card-chain | DeAiSettings.vue 模板字符串动态生成 | ✅ 非缺失 |
| 14 | deai-card-multi-step | 同上 | ✅ 非缺失 |
| 15 | deai-card-split-merge | 同上 | ✅ 非缺失 |
| 16 | pl-book-word-count | PipelinePanel.vue 已明确添加 `id="pl-book-word-count"` | ✅ 已修复 |
| 17 | btn-deai-add-skill | 新架构为 `btn-deai-add-skill-ms`。旧架构链式模式添加按钮用此 ID；新架构链式模式复用 `btn-save-deai` 且用 Vue `@click` 事件绑定，不依赖 DOM ID 查找 | ✅ 架构适配已确认，无需冗余 ID |

### 关键面板结构存在性核验

| 旧架构关键结构 | 新架构对应组件 | 状态 |
|----------------|---------------|------|
| #app-header / #app-body / #app-main / #app-sidebar | App.vue + SidebarNav.vue | ✅ |
| #chapter-tree + #tree-body + #current-project-name + #btn-tree-gen + #btn-open-project | ChapterTree.vue | ✅ |
| #editor-panel + #editor-content + #btn-undo/redo/save/export + #find-replace-bar | EditorPanel.vue | ✅ |
| #chat-panel + #user-input + #btn-send + #messages-container + #skill-area | ChatPanel.vue | ✅ |
| #settings-modal + #tab-api/skills/agents/appearance/deai/diag | SettingsModal.vue + 6个设置组件 | ✅ |
| #pipeline-panel + #pl-steps + #pl-step-1~5-content + 全部 pl-btn-* | PipelinePanel.vue | ✅（29项修复已记录） |
| #outline-workspace + #outline-editor + #btn-import-outline + #btn-lock-outline | OutlineWorkspace.vue | ✅ |
| #settings-collection-panel + #sc-categories + #sc-bind-modal | ScPanel.vue | ✅ |
| #memory-panel + #mem-cat-list + #mem-list | MemoryPanel.vue | ✅ |
| #plugin-market-modal + #market-search-input + #market-results | PluginMarket.vue | ✅ |
| #skill-bind-modal + #sbm-title + #sbm-skill-list + #btn-save-skill-binding | SkillBindModal.vue | ✅ |
| #diff-modal + #diff-container + #btn-diff-apply | DiffModal.vue | ✅ |
| #exit-confirm-modal + #btn-exit-cancel/direct/save | ExitConfirmModal.vue | ✅ |
| #inline-menu + 5个操作按钮 | InlineMenu.vue | ✅ |
| #deai-progress-modal + #deai-progress-fill + #deai-step-list | DeAiProgress.vue | ✅ |
| #statusbar + #status-cursor/connection/model/chapter/words | App.vue | ✅ |
| #breadcrumb-bar | BreadcrumbBar.vue | ✅ |
| #loading-indicator + #toast-container + #dom-toast + #tooltip | App.vue 隐藏容器 | ✅ |

### 最终结论

Task 1 HTML 深度对比修复 **全部完成**：
- 29 项 PipelinePanel.vue 修复 + 2 项 App.vue 修复 + 7 项动态按钮核验已记录
- 二次深度扫描确认 17 个"静态缺失"ID 均有实现途径
- 所有关键面板、模态框、控件、链接结构均在对应组件中存在
- `npx vite build` 编译通过，0 errors

→ 进入 Task 2: CSS 深度对比修复
