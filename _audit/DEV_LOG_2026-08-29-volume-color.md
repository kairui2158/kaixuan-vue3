# 卷纲列表配色统一开发日志

## 问题

客户视角下，卷纲列表的展开、选中、绑定和锁定状态出现淡绿等非全局主题色，和深色 UI 明显割裂。

## 根因

`src/components/pipeline/PipelinePanel.vue` 中卷纲行状态样式引用了全局未定义的 `--row-active`，CSS 的 fallback 值 `#f2f8f4` 在运行期静默生效；同时组件内还存在 `#2e7d63`、`#a8862d` 两个状态色硬编码。编译期不报错，但视觉与主题令牌脱钩。

## 修改

- 卷纲行 `active` / `expanded` 背景统一为 `var(--accent-dim)`。
- 绑定状态文字统一为 `var(--success)`。
- 锁定状态文字统一为 `var(--warning)`。
- 版本号从 `3.5.0` 升到 `3.5.1`。

## 验证

1. `npx vite build` 通过。
2. 杀掉既有 Electron 进程后使用 `start-electron.bat` 启动源文件应用，CDP 端口 `9227` 连接正常。
3. CDP 行为断言 6/6 通过：3 个卷行可见；展开行背景为 `rgba(124, 140, 248, 0.12)`；绑定色为 `rgb(76, 175, 136)`；锁定色为 `rgb(240, 160, 80)`；页面内无 `#f2f8f4` 残留。
4. 截图 `_audit/tmp/vol_color_check.png` 已交用户目检，用户确认配色正常。
5. 复扫 `PipelinePanel.vue`，未发现残留的硬编码 CSS 色值；`--accent-dim` 在 `src/styles/tokens.css` 中有明暗两套定义。

## 结论

卷纲列表状态配色已接入全局主题令牌，问题闭环。收尾需完成文档、提交、临时证据清理和 3.5.1 封装。
