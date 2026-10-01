# 2026-09-25 3.65.0 章节树按钮竖排与全局按钮压缩修复封装

## 问题与根因

- 用户截图确认：章节树顶栏长项目名被压缩为省略号，右侧“生成/项目”按钮被压到每字一行竖排。
- 根因链：`.btn-sm` 曾缺少 `white-space: nowrap`，所在 flex 行允许按钮被压缩；树顶栏、Pipeline 提示卡、Diff 工具栏、API 配置操作行各自缺少换行或不压缩约束。

## 修复

- `src/styles/base-components.css`：全局 `.btn` 增加 `flex-shrink: 0`，`.btn-sm` 保持 `white-space: nowrap`；容器必须提供换行或滚动，按钮自身不再被压字。
- `src/components/sidebar/ChapterTree.vue`：树顶栏动作不压缩、按钮内边距极窄档收敛。
- `src/components/pipeline/PipelinePanel.vue`：Pipeline 提示卡窄屏上下堆叠、按钮不换行、内边距收敛。
- `src/components/common/DiffModal.vue`：Diff 工具栏允许换行。
- `src/components/settings/ApiSettings.vue`：配置导出/导入操作行允许换行。
- `scripts/verify-design-fusion-responsive-overflow.mjs`：删除“把任意按钮文本替换成超长文本”的无效压力注入；按钮压力改为容器级换行与边界验证。

## 验证

- `npm run type-check` 通过。
- `npm run build` 通过并生成 3.65.0 安装包。
- `node scripts/verify-design-fusion-responsive-overflow.mjs`：605/605 PASS，覆盖 12 宽度、42 视图、tooltip 396 例。
- `node scripts/probe-chapter-tree-overflow.mjs`：300/300 PASS，覆盖 4 视口、3 密度、5 树宽、hover/rename 交互态。
- 封装验证器 `scripts/verify-packaging-3-65-0.mjs` 与证据目录 `_audit/verification-packaging-3-65-0/` 用于 asar、启动、IPC 与 tooltip 核验。
