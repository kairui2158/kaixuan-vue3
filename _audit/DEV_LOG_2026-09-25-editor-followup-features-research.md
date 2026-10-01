# DEV LOG：编辑器后续五方向调研与方案

## 2026-09-25

1. 复读门禁与经验：`神意开发经验总结_v5.md` 的 M1/M6/M12/M17/M18/M42；复读 `DEV_LOG_2026-09-24-editor-full-product-maturity.md`，确认上一轮已闭环折叠、书签、大纲导航、搜索高亮、选区保持、undo 单源、双入口 facade。
2. 摸清应用边界：
   - 主页替换：`EditorPanel.vue:1022/1037`，字面替换，无选项与预览。
   - 大纲替换：`outlineReplace.ts:77` + `OutlineWorkspace.vue:1824/1850`，有单源服务和锁定校验。
   - 搜索基础：`editorSearch.ts:22` 已有匹配/高亮计划。
   - 渲染：`EditorPanel.vue:101` 单 textarea；`editorViewport.ts:99` 全量前缀测量。
   - Diff 底座：`editorEditBatch.ts:61/150`、`editTaskService.ts` checkpoint 完整，缺编辑器内 hunk UI。
   - Trace 对比：`runTraceDiff.ts:59/74/121` 已有快照/工具/首分歧，缺模板版本与序列结构 diff。
   - 多光标：全仓 0 实现。
3. 执行社区调研：`node scripts/research-editor-followup-features.mjs`，5 维度 × 10 轮，完成 104 个真实仓库、419 个源码文件缓存，`failedRounds: 0`。台账在 `_audit/research-editor-followup-features-2026-09-25/`。
4. 深读关键源码（非 README）：
   - Lexical FindReplace：匹配模型、正则异常、空匹配推进、offset map。
   - Siyuan virtualScroll：renderedStart/End、spacer、行高缓存、选中状态恢复。
   - Zed agent_diff/columnar_selection：hunk 生命周期、列选归一化。
   - Cline diff.ts：LCS、统一 hunk、上下文窗口。
   - Continue decorations：added/removed 双装饰管理、range shift。
   - MLflow/Langfuse/promptfoo：运行列、trace 分层、首分歧摘要。
5. 反查适配：五个方向均明确“采用/裁剪/不采用”。关键取舍：
   - 不替换 textarea 底座，避免破坏 IME/API 直写/折叠/书签。
   - 多光标不做全量编辑器重写，先虚拟选区集合 + Find All。
   - Diff 不另起状态源，复用 batch plan + EditTask checkpoint。
6. 产出方案：`_audit/PROPOSAL_2026-09-25_EDITOR_FOLLOWUP_FEATURES.md`，状态待审核。
