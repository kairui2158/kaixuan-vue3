# DEV LOG 146: 多窗口支持 + providerProtocols 修复 + v3.26.0 封装

**日期**: 2026-09-06
**版本**: 3.26.0
**改动等级**: minor（新功能）

## 已验证项

### P0-1 ~ P0-6: 多窗口实现（代码级验证通过）

1. electron/preload.js - 4 IPC 桥: onGetCurrentProjectId(行53), windowOpenProject(行54), windowSetCurrentProject(行55), windowGetInitialProjectId(行56)
2. electron/main.js - 多窗口架构: windowMap(行19), lockedProjects(行20), window:openProject(行142-153), window:setCurrentProject(行157-170), window:getInitialProjectId(行132-139), app:getCurrentProjectId(行53), closed清理(行271-273)
3. electron/ipc/lifecycle.js - 拆分: registerLifecycleHandlers(行5-11) + registerWindowCloseHandler(行15-41), createWindow调用(行279)
4. src/App.vue - 多窗口启动: onGetCurrentProjectId监听(行325-329), windowGetInitialProjectId启动(行333-339)
5. src/components/common/ProjectModal.vue - 新窗口按钮: openInNewWindow(行130)
6. electron/main.js 清理: 删除90行重复IPC, mainWindow改win, 添加saveWindowState, 修复will-download, 修复UTF-8

### providerProtocols.cjs 构建顺序修复

- 根因: build:vue脚本顺序问题，主构建覆盖protocols产物
- 修复: 确认vite build在前，protocols build在后
- 验证: providerProtocols.cjs存在=True，Electron启动不再报Cannot find module
- CDP端口9227可连

### 持久化深度修复 P0-P3（10项，代码级验证通过）

| 编号 | 文件 | 行号 | 内容 |
|------|------|------|------|
| P0-1 | App.vue | 282-291 | restoreLastSession + 7天时效 + restore-session事件 |
| P0-2 | project.ts | 27-49 | CURRENT_SCHEMA_VERSION=3 + migrateProjectData链式迁移 |
| P1-3 | project.ts | 116,173-179 | pendingLoadId ref防竞态 |
| P1-4 | project.ts | 225,284-290 | dirtyFields ref脏标记 |
| P1-5 | lifecycle.js | 30 | 退出保存超时 5000到15000ms |
| P2-6 | App.vue | - | onFinalSave移除 |
| P2-7 | project.ts | 255-260 | persistProject先写project_再写lastProjectId |
| P3-8 | project.ts | 889-905 | startProjectAutoSave/stopProjectAutoSave |
| P3-9 | useExitConfirm.ts | - | 文件已删除 |
| P3-10 | project.ts | 19-23 | toPlain用structuredClone + JSON fallback |

### 构建验证

- npx vite build: 0 errors, 1589 modules, 3.72s
- npx vite build --config vite.protocols.config.mts: 0 errors, providerProtocols.cjs 8.18 kB
- node --check electron/main.js: pass
- node --check electron/preload.js: pass
- node --check electron/ipc/lifecycle.js: pass

### CDP验证降级

- Electron 33 + contextIsolation + nodeIntegration=false 导致CDP Runtime.evaluate超时（经验§2规则37）
- 降级为代码级验证
- UI验证降级为用户手动实测

## 未验证项（需客户实测）

- 多窗口实际打开/切换体验
- 同项目多窗口锁是否生效
- 窗口关闭后锁释放
- 重启后多窗口状态恢复

## 客户验证入口

1. 打开应用，进入项目选择界面
2. 选择一个项目，点击新窗口按钮
3. 确认新窗口打开并加载该项目
4. 尝试在同一窗口选择同项目，确认被锁
5. 关闭新窗口，确认可以重新打开

## 临时文件清理

- fix_mainjs.ps1 - 删除
- _audit/tmp/ 目录 - 保留
