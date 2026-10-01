# 2026-09-25 F1 查找替换增强收尾

## 范围

- 共享替换模型：`src/services/editorReplace.ts`
- 大纲替换服务：`src/services/outlineReplace.ts`
- 双入口接线：`src/components/editor/EditorPanel.vue`、`src/components/common/OutlineWorkspace.vue`
- Electron 实测：`scripts/verify-editor-replace-electron.mjs`

## 本轮修复

1. 修正 Electron 验证器 `matchCount` 断言：测试文档固定为 12 段正文，`replace current` 的真实计数是 12，原脚本误写 13。
2. 修正主页轮次状态泄漏：全词匹配勾选后必须取消，否则下一轮 `alpha` 搜索会继承全词语义。
3. 修正大纲入口断言口径：大小写敏感 `Alpha` 为 13（12 段正文 + 1 个样例行），全词 `灯塔` 为 14（15 处中排除 `灯塔下`）。
4. 修复 Node 侧误用 `window` 的脚本错误，改为读取页面返回的 `state.diagnostics`。
5. 大纲锁定态验证改为断言按钮 disabled，不再对禁用按钮做无效点击。
6. 每轮大纲准备阶段显式恢复 `outlineLocked = false`，避免断言失败后锁定状态污染后续轮次。
7. 大纲查找栏改为幂等打开，避免第二轮点击把已打开的查找栏关闭。

## 验证

- `node scripts/verify-editor-replace-electron.mjs`：PASS，主页 10/10 + 大纲 10/10。
- 证据：`_audit/verification-editor-replace/electron-10-rounds.json`，`generatedAt: 2026-09-25T00:29:37.501Z`。
- `npm run test:services -- src/services/editorReplace.spec.ts src/services/editorSearch.spec.ts src/services/outlineReplace.spec.ts`：3 个文件、32 条用例通过。
- `npm run type-check`：通过。
- `npm run build:vue`：通过；仅有 Vite chunk 与配置类既有 warning。

## 回头看

- `rg` 确认双入口均消费 `editorReplace.ts` 的 `computeEditorMatches` / `buildEditorReplacementPlan`，未发现旧字面替换逻辑并存。
- 大纲替换继续走 `outlineReplace.ts`，保持原 `commitOutlineChange` 路径；主页替换保持 `editorStore.updateContent` 原路径。
- runTrace `editor-replace` 与 DiagLogger `editor-replace` 覆盖均已在 20 轮实测中断言。
- 临时 profile `_audit/tmp/editor-replace-profile` 已由脚本清理，`Test-Path` 为 False。

## 遗留

- F1 已收口。后续进入已批准的 F2。
