# 生成流水线修复经验总结 2026-08-16

## 问题全景

本日针对用户报告的生成流水线 5 层重大缺陷进行精准修复，最终通过 CDP 验证全部通过。

## 五层问题与修复

### 1. 大纲层（字数联动）
- 原问题：全书字数设置后未自动影响卷纲层卷数，需要手动调整
- 修复：新增 `linkedVolumeCount` 计算属性，`字数 ÷ 每卷字数 = 卷数` 自动联动
- 新增 `syncVolumeCount`，用户手动改卷数时保存
- 新增 watch：全书字数或每卷字数变化时自动重算卷数
- 大纲确认时自动保存 `bookWordCount` 和卷字配置到 storage
- 验证：20 万字 → 每卷 10 万 → 卷数自动变 2，显示"全书 20 万字自动分配"

### 2. 设定层（新增设定）
- 原问题：点击"新增设定"无反应，页面没有次级面板
- 修复：模板中 `@click="addSetting"` 改为 `@click="openAddSettingModal"`
- 新增渲染 `showAddSettingModal` 模态框，含名称/分类/属性文本域
- 新增保存按钮（名称空时禁用），保存后 push 到 `projectStore.settings`，写入持久化
- 验证：点击弹出模态框，填名称后保存按钮启用，保存后模态框关闭、设置写入

### 3. 卷纲层（四种生成模式）
- 原问题："自动生成卷纲"和"AI生成全卷"行为重复，"逐卷生成"和"批量续生成"都调用同一续生成逻辑
- 修复：`genVolumes` 支持三模式
  - `auto`：AI生成全卷
  - `single`：逐卷生成（每次只生成下一卷）
  - `continue`：批量续生成（从已生成卷续到目标卷数）
- 确认完成：点击后设 `volumesConfirmed=true`，自动跳到章节层
- 验证：确认按钮点击后 store 变化 + 步骤跳转正确

### 4. 章节层（情节框 + 卷联动）
- 原问题：章节卡片只显示标题，没有情节框；与卷纲层的选择联动不完整
- 修复：`pl-ch-card` 增加 `pl-ch-plot` 文本域，显示并编辑每章 `plot`
- 卷选择下拉已通过 `selectedVolumeIndex` 联动卷纲层，预计章数自动计算
- `genChapters` 生成的章节现在分配稳定 `id`，保证 `syncChapterManager`/`editorStore.openTab` 可用
- 验证：2 个章节卡片显示 plot 文本域，"第一卷 起源"选择显示 2 章、"第二卷 成长"显示 1 章

### 5. 正文层（持久化）
- 原问题：生成正文后重新打开面板，"插入到编辑器"和"确认完成"按钮不可用
- 根本原因：`bodyResult` 是组件本地 `ref`，不是持久化 store 字段
- 修复：新增 `currentBodyContent` computed 从 `projectStore.chapters[vol].body` 读取
- 按钮 `:disabled` 条件改为 `!(currentBodyContent || bodyResult)`
- 正文生成后自动插入编辑器（dispatch `insert-text` 事件）
- 验证：注入持久化 body 后，正文显示、插入可用、确认可用；点击插入事件捕获到正确 payload

## 关键经验

1. **组件本地状态不是持久化状态**：用户关掉面板再打开，本地 `ref` 丢失导致按钮禁用。凡是用户能恢复的状态必须放到 store 或 storage。
2. **字数链必须自动传导**：大纲字数 → 卷数 → 每卷字数 → 章数，不只是单层展示，要通过 computed/watch 联动。
3. **功能按钮必须检查真实渲染**：`addSetting` 那个函数存在但模板引用旧名导致按钮无效果。
4. **"逐卷生成"和"批量续生成"是不同的业务模式**：必须显式区分 `single` 与 `continue`，不能共用一个逻辑。
5. **章节 `id` 是跨模块契约**：`ChapterManager` 和编辑器 Tab 需要它。AI 返回的章节没有 id，必须在写入前补齐。
6. **只用 CDP 验证"按钮存在"远远不够**：本轮用 CDP 点击测试完整验证了按钮的启用/禁用状态、点击后 store 变化、UI 响应、事件捕获四层。
7. **项目名字不能只在"新建项目"路径初始化**：`handleImport` 文件导入路径如今项目 ID 已有值时不再走到 `if (!currentProjectId)`，导致 `projectName` 永远为空、左侧树显示「未打开项目」。兜底应从项目 JSON 或 outline 首行提取并回写保存。
8. **CDP 验证必须同时读 store 和真实 DOM 类名**：编辑器标签真实 DOM 是 `.chapter-tabs .tab`，不是 `.editor-tab/[data-editor-tab]`。之前 E2E 报 tabs:[] 是脚本选择器错误，不是应用丢失内容。

## 验证证据

- `npm run build:vue` 构建通过
- CDP 验证脚本：`cdp_verify_all.js`、`cdp_verify_addsetting*.js`、`cdp_verify_body*.js`、`cdp_verify_chapter*.js`、`cdp_verify_volume*.js`
- CDP 插入链路探针：`_audit/probe_insert_link.cjs`
- 项目 UI 探针：`_audit/probe_project_ui.cjs`
- 实时报告：`_audit/PIPELINE_REAL_E2E_20260816.md`
- 全部验证记录见对话日志

---

## UI 统一计划 V2 经验教训（Phase1→Phase2）

### 1. CSS 变量统一是"减法工程"，不是"加法工程"
UI 统一的核心不是加新样式，而是删重复。Phase1.B 清理 9 个组件 scoped 按钮覆盖 + 3 个全局覆盖，Phase2.F 从 global.css 移出 CL-1~CL-10 到 base-components.css。每次改动都是在减少"同一个 UI 的多种写法"。

### 2. 弹窗统一的关键是基类，不是逐个修
先定 modal.css 基类（header/body/footer 间距），再逐个组件替换 backdrop→modal-overlay。基类准了，单个组件的修复就是模板替换 + 清 scoped 覆盖，不需要重写弹窗逻辑。

### 3. 字号统一分两层：全局层和组件层
- 全局层：	okens.css 的 --font-size-* 变量值，影响所有引用 token 的文本
- 组件层：各 .vue 文件内部的硬编码 font-size，属于组件自身设计需要（如 ChatMessage 气泡、PipelinePanel 步骤编号、EditorPanel 工具栏）
- 本次只改全局层 + 修复最明显的 4 处硬编码（LogIndicator/LogToast/tooltip）。组件层的硬编码是设计选择，不是遗漏。

### 4. 递归检查要按"范围→条件→结果"三级结构
Phase2.G 的五项检查（backdrop 残留、modal-close scoped、font-size 硬编码、按钮 scoped、构建验证）每项都明确范围和条件。没有"随便扫一眼"式的检查。

### 5. "先删后改"防止死代码
CL-1~CL-10 从 global.css 移到 base-components.css 时，global.css 中保留的注释标注（CL-11~CL-20）作为遗留标记留待后续整理。没有删除还在被引用的样式。

### 6. 截图验证是可信的运行时证据
CDP 截图 60KB 确认应用启动正常、页面渲染无空白。比"构建通过"更接近真实用户看到的效果。

### 7. 对账表单是进度追踪工具，不是审计替代品
表单记录"做了什么"，但验证才是"做对了没有"。H2/H3 在此次任务中暴露了"台账标记完成但实际未写内容"的问题——这是表单的局限，下次应用表单 + 实际文件双重确认。
