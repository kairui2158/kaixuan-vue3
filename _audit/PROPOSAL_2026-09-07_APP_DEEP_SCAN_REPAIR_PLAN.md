# 全应用深扫修复执行方案（P0-P3）

日期：2026-09-07  
状态：已完成。P0-P3 共 14 项全部修复并完成编译、服务测试、构建、源 Electron CDP 运行时验证；收尾记录见 2026-09-08 开发日志。  
版本基线：`3.28.1`  
工作区约束：历史改动约 80 个 modified + 80 个 untracked，均不回滚、不清理；本轮只修改本方案列出的文件。  
验证载体：仓库内源 Electron 启动 + CDP `127.0.0.1:9227`；不使用网页模式、开发者模式或安装版。

## P0 生产安全

1. 生产包禁用开发兼容开关。`electron/main.js` 的 `no-sandbox` 与 `remote-allow-origins=*` 必须只存在于 `if (!app.isPackaged)` 内。
   - 验证：`node -e` 读取源文件并断言两个开关均位于 `app.isPackaged` 块内；源 Electron 启动正常。
2. 第三方 folder SKILL 脚本迁移到 utilityProcess worker。
   - 文件：`electron/ipc/skill-script-worker.js`、`electron/ipc/skill-loader.js`。
   - 验证：CDP 探针调用真实 `skillExecuteScript` IPC，覆盖正常脚本、`Function('return process')` 逃逸尝试、逃逸后继续调用三条路径。
   - 通过标准：正常脚本返回 `ok:true`；逃逸返回 blocked/undefined 而不是泄漏 PID；逃逸后第二次调用仍成功。

## P1 稳定性

3. 多窗口关闭选择竞态。`electron/ipc/lifecycle.js` 按 `webContents.id` 保存当前 handler，新 close 请求先移除旧 handler，禁止 `removeAllListeners` 误伤其他窗口。
   - 验证：源 Electron 新建两个窗口，分别触发 close 并发送 `app:closeChoice`，确认 A 的选择不会关掉 B，B 仍可继续响应。
4. 窗口状态写入防抖。`electron/main.js` 的 `resize/move` 当前每次事件同步写盘，拖动窗口会造成高频 IO；改为 500ms 防抖，`close/before-quit` 立即落盘。
   - 验证：类型检查、服务测试、构建、源 Electron 拖动窗口后重启恢复窗口状态。
5. `skillOrchestrator.ts` 的 degraded 语义。当前 composite 子步骤 degraded 直接整链 BLOCKED；应区分“校验失败但有最终输出”的降级完成与“无法继续”的阻塞。
   - 验证：服务测试覆盖 degraded 输出、blocked、failed 三种状态；不把 degraded 伪装成 success。

## P2 可靠性

6. `electron/ipc/dialog.js` 删除写死诊断路径 `C:/Users/凯瑞/Documents/神意助手数据/dialog-diagnostics.log`，改用应用数据目录；测试路径逻辑保留。
7. `electron/ipc/storage.js` 的 `storage:import` 采用与 `storage:write` 相同的临时文件 + 备份 + 原子替换，并按 key 进入写队列。
8. `render-process-gone` 增加恢复提示：主进程记录日志后向存活窗口发送恢复事件，前端显示非阻断提示，不自动重载丢状态。
9. `conversationContextService` 写盘串行化：`recordTurn`/`recordEditorEvent`/`clearSession` 按 `ctx_<projectId>` 排队，避免读改写覆盖。
10. `electron/ipc/skill-package.js` 的 `createZipBuffer` 补齐 ZIP 保真：为非 ASCII 文件名设置 UTF-8 flag，导出后立即用 yauzl 预览校验。
11. `OutlineWorkspace.vue` 清理窗口级事件监听，`diff-applied` 等事件必须挂到组件生命周期，避免多窗口重复响应。

## P3 性能与构建卫生

12. `AgentProgressPanel.vue` 轮询按需：仅在展开时启动 2 秒轮询，收起或卸载时停止。
13. 动态 import 警告治理只处理静态引用路径：`SettingsModal.vue` 与 `MemoryPanel.vue` 的懒加载组件保持代码分割；`aiService.ts` 的 store 动态导入先确认是否承担循环依赖隔离，再决定是否修改。
14. 全局验证门：`npm run type-check`、`npm run test:services`、`npm run build:vue`，随后源 Electron 真实操作验证并清理 `_audit/tmp` 本轮临时探针。

## 收尾

1. 更新 `_audit/神意开发经验总结_v2.md`：记录 utilityProcess `process.parentPort`、CDP 数字 ID 路由、探针断言必须匹配真实返回结构。
2. 更新 `_audit/DEV_LOG_MASTER_INDEX.md` 与本轮开发日志。
3. 清理本轮临时探针，不清理历史文件。
4. 最终答复必须区分：已完成并验证、代码完成未运行时验证、遗留项。
