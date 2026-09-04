# DEV LOG 140 - 设定层遮挡+正文插入失效+记忆弹窗透明锁死修复

**日期**: 2026-09-04
**版本**: 3.20.2
**改动等级**: bugfix (patch)

## 改动文件

- `src/components/pipeline/PipelinePanel.vue` (4处改动)

## 问题根因

### 问题1: 设定层创作风格框展开后被遮挡

`.pl-style-card` 的 `overflow: hidden` 配合祖先链的 `overflow-y: auto`，展开后 body 被祖先裁切。

### 问题2: 正文层插入到编辑器按钮失效

`insertToEditor()` 的 CustomEvent detail 缺少 `openEditor: true`，App.vue handleInsertText 无法触发面板切换。

### 问题3: 记忆弹窗透明+确认按钮锁死

`.pl-memory-preview-modal` 引用了不存在的 CSS 变量 `--bg-panel`。`closeMemoryPreview()` 未重置 `memoryPreviewLoading`，按钮 :disabled 永久锁死。

## 修复内容

1. `.pl-style-card` 行3210: `overflow: hidden` -> `overflow: visible`
2. `insertToEditor()` 行2773: 补 `openEditor: true`
3. `.pl-memory-preview-modal` 行3236: `background: var(--bg-panel)` -> `background: var(--bg-elevated)`
4. `closeMemoryPreview()` 行2947: 补 `memoryPreviewLoading.value = false`

## 验证

- vue-tsc --noEmit: 通过
- vite build: 通过 (2.54s)
- providerProtocols.cjs: 通过
- Electron 源码启动: 成功

## 经验规则

- 经验文件规则71已写入
