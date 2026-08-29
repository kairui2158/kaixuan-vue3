# 卷纲与章节经验复用 P1：共用工作区规范

日期：2026-08-26  
范围：只调整 `PipelinePanel.vue` 的工作区承载样式，不改变生成、store、持久化和按钮事件。

## 目标

- 卷纲列表和章节列表拥有明确的独立纵向滚动边界。
- 卡片内输入框不能把父级撑出横向边界。
- 底部操作区保持可见，不随列表内容失去布局位置。
- 保留空状态：没有章节时不渲染章节卡片列表。

## 实施

- `.pl-vol-list` 与 `.pl-ch-list` 共用 `min-width: 0`、`min-height: 0`、`overflow-x: hidden`、`overflow-y: auto` 和 `overscroll-behavior: contain`。
- 卷纲列表增加 `max-height: min(48vh, 520px)`，避免多卷卡片把工作区无限撑高。
- `.pl-actions` 作为不收缩的底部操作区，右对齐并使用统一间距与上边界。
- 卷/章卡片及其输入控件增加 `box-sizing`、`min-width: 0` 和 `max-width: 100%` 约束。
- `.pl-step-panel` 增加 `min-width: 0` 和 `overflow: hidden`，防止内部内容把步骤面板横向撑开。

## 验证

1. `npx vite build`
   - 结果：成功构建。
   - 记录：存在既有 Vite config、动态导入和 chunk 体积警告；无编译错误。
2. `taskkill /f /im electron.exe /t`
   - 结果：旧 Electron 进程全部终止。
3. `cmd /c "start-electron.bat < nul"`
   - 结果：源文件 Electron 启动，CDP `127.0.0.1:9227` 可连接。
4. CDP 真实操作：点击生成流水线 → 点击“卷纲”。
   - `#pl-vol-list`: `clientWidth=1576`, `scrollWidth=1576`, `clientHeight=230`, `scrollHeight=230`, `overflowY=auto`。
   - `.pl-actions`: `clientWidth=1576`, `scrollWidth=1576`, `clientHeight=42`，可见。
   - 页面横向：`body scrollWidth=1904`, `clientWidth=1904`。
5. CDP 真实操作：点击“章节”。
   - 当前无可生成章节时 `#pl-ch-cards-area` 不渲染，`#pl-ch-empty-no-volume` 显示。
   - `.pl-actions`: `clientWidth=1576`, `scrollWidth=1576`, `clientHeight=42`，可见。
   - 页面横向：`body scrollWidth=1904`, `clientWidth=1904`。

## 边界

本阶段没有验证多卷/多章压力下的实际滚动增长，因为不能在只读验证中写入客户项目数据。P2/P3 将在稳定对象选择区完成后，用可恢复的真实对象或现有数据验证列表与详情区的行为。

