# IPC 链路修复对账记录

> 生成时间: 2026-08-13
> 验证方式: 真实 Electron 进程 + CDP Runtime.evaluate + 真实文件读回

## 修复记录

| 编号 | 断链位置 | 问题 | 修复 | 验证结果 | 状态 |
|------|---------|------|------|---------|------|
| LINK-01 | `electron/ipc/dialog.js` 第 37 行 `dialog:readFile` | 使用 `fs.readFileSync` 但未 `require('fs')`，抛 ReferenceError 被 catch 吞掉，恒返回 null | 补 `const fs = require('fs')` | 真实进程读出测试文件内容 `链路验证文本: 神意助手打开文件链路测试 2026-08-13` | 已修复 |

## IPC 通道静态普查

主进程注册 31 个通道，preload 调用 31 个通道。

- `app:getVersion`：主进程注册但 preload 未暴露，不影响现有功能（旧架构遗留）。
- `app:closeChoice`：由 `lifecycle.js` 在 close 事件回调中动态注册，preload 调用有效。

## 真实用户链路回归

`scripts/real_user_v4.js` 全量 31 项：

- OK: 31
- WARN: 0
- 截图: 14

覆盖：启动确认 → 新建项目 → 添加卷 → 添加章节 → 编辑器激活与输入 → 保存 → 头部按钮 → 管道面板 → 侧边栏面板（大纲/设定合集/流水线/记忆/插件/设置/仪表盘）→ 主题切换 → 状态栏。
