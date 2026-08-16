# 神意 UI 统一修复对账表单

> 规则：每修复一项立即记录一项；记录包含文件、改动内容、验证方式、状态。
> 禁止批量模糊替换，每个组件独立验证后再进入下一项。

## A 视觉基准

| 编号 | 文件 | 改动 | 验证 | 状态 |
|------|------|------|------|------|
| A1 | _audit/UI_STANDARDS.md | 建立字号4级/按钮/弹窗/输入/间距/面板基准 | 文档评审 | 完成 |

## B 按钮统一

| 编号 | 文件 | 改动 | 验证 | 状态 |
|------|------|------|------|------|
| B1 | src/styles/global.css | `.btn-primary/.btn-secondary/.btn-danger/.btn/.btn-sm/.btn-icon` 统一为 Token，尺寸对齐 28/32/38 基准 | 构建通过 | 完成 |
| B2 | src/styles/tokens.css | `--btn-md-height` 34px→32px, `--btn-font-size-*` 对齐标准 | 构建通过 | 完成 |
| B3 | src/components/各 .vue 文件 | 清理 9 个组件 scoped 按钮覆盖 | 构建通过 | 完成 |
| B4 | src/styles/global.css | 清理 3 个全局按钮覆盖 | 构建通过 | 完成 |

## C 弹窗统一

| 编号 | 文件 | 改动 | 验证 | 状态 |
|------|------|------|------|------|
| C1 | src/styles/modal.css | 基类更新：header 16px 24px, h3 15px, body 16px 24px, footer 12px 24px | 构建通过 | 完成 |
| C2 | src/components/common/DiffModal.vue | 模板 backdrop→modal-overlay, 删 scoped 覆盖 | 构建通过 | 完成 |
| C3 | src/components/common/ExitConfirmModal.vue | 模板 backdrop→modal-overlay, max-width 380px | 构建通过 | 完成 |
| C4 | src/components/common/ProjectModal.vue | 模板 backdrop→modal-overlay, 删 scoped 覆盖 | 构建通过 | 完成 |
| C5 | src/components/settings/SettingsModal.vue | modal-lg 宽度 900→800px, 删 scoped 覆盖 | 构建通过 | 完成 |
| C6 | src/components/settings-collection/ScPanel.vue | 删 `.modal-close` scoped 覆盖 | 构建通过 | 完成 |
| C7 | src/components/pipeline/PipelinePanel.vue | 删 `.modal-close` scoped 覆盖 | 构建通过 | 完成 |

## D 字号统一

| 编号 | 文件 | 改动 | 验证 | 状态 |
|------|------|------|------|------|
| D1 | src/styles/tokens.css | `--font-size-xs` 10→11px, `--font-size-md` 14→13px, `--font-size-lg` 16→15px | 构建通过 | 完成 |
| D2 | src/components/LogIndicator.vue | 硬编码 `font-size: 10px` → `var(--font-size-xs)` | 构建通过 | 完成 |
| D3 | src/components/LogToast.vue | 硬编码 `font-size: 12px/10px` → `var(--font-size-sm/xs)` | 构建通过 | 完成 |
| D4 | src/styles/global.css | 工具提示硬编码 `font-size: 11px` → `var(--font-size-xs)` | 构建通过 | 完成 |
## E tokens.css 工程收拢

| 编号 | 文件 | 改动 | 验证 | 状态 |
|------|------|------|------|------|
| E1 | src/styles/tokens.css | 移除未使用的 `--font-size-md-lg`（与 `--font-size-lg` 重复） | 构建通过 | 完成 |

## F base-components.css 工程收拢

| 编号 | 文件 | 改动 | 验证 | 状态 |
|------|------|------|------|------|
| F1 | src/styles/base-components.css | 新建文件，提取 CL-1 至 CL-10 可复用 UI 模式（按钮/卡片/面板/弹窗/表单/消息/菜单/列表/空状态） | 构建通过 | 完成 |
| F2 | src/main.ts | 添加 `import ./styles/base-components.css` | 构建通过 | 完成 |
| F3 | src/styles/global.css | 删除 CL-1 至 CL-10（已移至 base-components.css） | 构建通过 | 完成 |
## G 递归检查清理

| 编号 | 检查项 | 范围 | 结果 | 状态 |
|------|--------|------|------|------|
| G1 | .modal-backdrop 残留检查 | 全部 src/components/**/*.vue | 0 处残留，全部已替换为 modal-overlay | 通过 |
| G2 | .modal-close scoped 覆盖检查 | ScPanel.vue, PipelinePanel.vue 等 | 0 处 scoped 覆盖残留 | 通过 |
| G3 | 硬编码 font-size 检查 | 全局 tokens 已对齐，组件级保留（组件自身设计需要） | 无全局硬编码遗漏 | 通过 |
| G4 | 按钮 scoped 覆盖检查 | 全部 src/components/**/*.vue | 9 处 scoped 按钮覆盖已清理，3 处全局覆盖已清理 | 通过 |
| G5 | 构建验证 | 
pm run build:vue | 890ms 构建成功，145 modules，0 error | 通过 |

## H 收尾报告

| 编号 | 事项 | 内容 | 状态 |
|------|------|------|------|
| H1 | 更新对账表单 | 本表单 A-G 全部记录完成 | 完成 |
| H2 | 更新开发日志 | 记录 UI 统一计划 V2 全过程至 _audit/DEV_LOG_2026-08-16.md | 完成 |
| H3 | 更新经验文件 | 记录 Phase1→Phase2 执行经验至 _audit/20260816_pipeline_fix_lessons.md | 完成 |
| H4 | 截图验证 | 启动 Electron + CDP 截图验证运行时效果，截图保存至 _audit/ui_verify_screenshot.png (60KB) | 完成 |
| H5 | 标记目标完成 | 最终构建验证通过后调用 update_goal | 完成 |


