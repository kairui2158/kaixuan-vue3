# 开发日志：全应用深扫修复（2026-09-08）

## 开发功能

按 `_audit/PROPOSAL_2026-09-07_APP_DEEP_SCAN_REPAIR_PLAN.md` 完成 P0-P3 共 14 项修复与运行时验证。

1. 生产安全：`no-sandbox` 与 `remote-allow-origins=*` 只允许在非打包模式存在；第三方 Folder SKILL 脚本迁移到 utilityProcess worker，阻断 `process` 逃逸。
2. 稳定性：多窗口 close handler 按 `webContents.id` 隔离；窗口状态写入 500ms 防抖、退出立即落盘；`skillOrchestrator` 区分 degraded / blocked / failed。
3. 可靠性：dialog 诊断路径改用应用数据目录；storage 导入走临时文件 + 备份 + 原子替换 + 写队列；渲染崩溃显示恢复横幅；会话写盘按项目串行化；ZIP 文件名设置 UTF-8 flag；OutlineWorkspace 事件挂组件生命周期；AgentProgressPanel 只在展开时轮询。
4. 构建卫生：动态 import 只处理不承担循环依赖隔离的静态引用；保留懒加载代码分割。

## 对应用的用途

- 客户打包版不再暴露开发专用沙箱/远程源开关，第三方 SKILL 脚本无法直接触达 Node 进程对象。
- 多窗口拖动、关闭、恢复不会互相覆盖窗口状态，也不再因高频写盘造成迟滞。
- 项目导入、自动保存、上下文记忆写盘不会竞态覆盖，坏数据可回滚备份。
- 中文 ZIP 技能包在解包端保持原文件名，渲染异常会给用户可见提示而不静默丢状态。
- 生成进度面板默认不轮询，降低空闲 CPU 与 IO 占用。

## 验证证据

- `npm run type-check`：通过。
- `npm run test:services`：13 个测试文件、140 个测试全部通过。
- `npm run build:vue`：构建成功。
- `_audit/tmp/deep_scan_acceptance.cjs`：多窗口关闭竞态、Agent 进度面板、storage bridge、恢复横幅全部 PASS。
- `_audit/tmp/deep_scan_extra_acceptance.cjs`：ZIP 中文文件名、进度面板初始状态、恢复横幅注册与 cleanup 全部 PASS。
- `_audit/tmp/deep_scan_window_restore.cjs`：源 Electron 重启后窗口 `x/y/width/height` 与 `window-state-1.json` 全部一致，`DEEP_SCAN_WINDOW_RESTORE_PASS`。

## 临时文件

本轮探针验证完成后已删除：`deep_scan_acceptance.cjs`、`deep_scan_extra_acceptance.cjs`、`deep_scan_window_restore.cjs`。
