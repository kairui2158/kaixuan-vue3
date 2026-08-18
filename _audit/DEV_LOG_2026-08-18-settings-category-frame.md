# 神意助手开发日志：设定分类导航与当前分类内容框拆分

## 目标

按用户确认的设定层结构修正界面：动态分类导航独立显示；内容框只显示用户当前选择的分类内容，不把分类导航包进内容框。

## 本次根因

之前的设定工作区把分类导航、分类内容和旧左右栏布局混在同一个容器职责里。这样即使分类按钮能点击，视觉边界仍然错误：用户无法清楚区分“选择分类”和“编辑当前分类内容”。这是布局结构错误，不是按钮功能缺失。

## 精准修改

- 文件：`src/components/pipeline/PipelinePanel.vue`
- 删除设定层旧说明文字，释放无意义的垂直空间。
- 将 `.pl-settings-workspace` 改为单列纵向结构。
- 将 `.pl-settings-navigation` 设为独立横向、可换行的分类导航区。
- 新增 `.pl-sc-content-frame`，只包住当前分类编辑器及该分类操作区。
- 保留分类操作在内容框底部，保留全层确认/保存操作在最底部。
- 删除旧 `.pl-sc-layout`、`.pl-sc-items-area` 的使用，不修改 `genSettings`、`confirmSettingsLayer`、绑定、删除等业务行为。

## 构建与启动

1. `npm run build:vue`：PASS，151 modules；仅有既存 deai CommonJS 警告。
2. 启动前执行 `taskkill /f /im electron.exe` 清理旧 Electron 进程。
3. 使用源文件启动器 `start-electron.bat`，未使用开发服务器或开发版启动器。
4. CDP 地址：`http://127.0.0.1:9227`。

## CDP 验证

验证脚本：`_audit/scripts/archive/verify_settings_category_frame_20260818.cjs`

报告：`_audit/screenshots/settings_category_frame_verify.json`

截图证据：`_audit/screenshots/settings_category_frame.png`

关键结果：

- 分类导航 `y=391`、高度 `28`、宽度 `926`，横向 `flex`，只有底部边界。
- 内容框 `y=469`、高度 `395`、宽度 `926`，四边边框和背景独立存在。
- `frameContainsNavigation=false`。
- `contentFrameContainsOnlyEditor=true`。
- 分类操作位于内容框底部，整层操作位于内容框下方的最底部。
- 旧布局节点 `.pl-sc-layout, .pl-sc-items-area` 数量为 `0`。
- 逐个点击可见分类后，活动状态为真、当前标题随分类变化，内容框仍不包含分类导航。

## 结论与边界

本次只完成设定层分类导航与内容框的结构纠偏，未把其他流水线层的视觉或业务状态宣称为已完成。后续任何设定层改动都必须先复核本日志中的 DOM 包含关系和纵向顺序。
