# 全应用运行效率优化 — P0 基准报告
## 生成时间：2026-08-25 12:50

## 调用点清单

### 1. IPC 同步阻塞（最大瓶颈）
**文件：** electron/preload.js
**问题：** 18 处 ipcRenderer.sendSync 调用
**影响：** 每次 storageRead/Write 都阻塞 UI 线程

**文件：** electron/ipc/storage.js
**问题：** 8 个 handler 全部使用 ipcMain.on + vent.returnValue（同步模式）

### 2. 启动加载 — 全量同步读取
**影响：** 应用启动时多个 store 串行同步 IO
- project.ts: storageList() + storageRead 逐个项目
- agent.ts: storageRead agents
- skill.ts: storageRead skills
- settings.ts: storageRead appSettings
- provider.ts: storageRead providers
- chat.ts: storageRead 聊天会话

### 3. 聊天面板 — 无虚拟滚动
**文件：** src/components/chat/ChatPanel.vue
**影响：** 大量消息时 DOM 节点过多
**修复资源：** vue-virtual-scroller 已安装未使用

### 4. 重试超时过长
**文件：** src/services/aiService.ts
**影响：** 最长等待 8 次 × 20s = 160s

### 5. Store 响应式未优化
**影响：** pipeline.ts 等 store 响应式追踪开销

## 影响评估
| 瓶颈 | 严重程度 | 优先级 | 预计改善 |
|------|---------|-------|---------|
| IPC 同步阻塞 | 高 | P1 | 项目加载/保存 5-10x |
| 启动全量加载 | 中 | P2 | 启动时间减少 30-50% |
| 聊天无虚拟滚动 | 中 | P3 | 大量消息渲染流畅 |
| 重试超时过长 | 低 | P4 | 网络恢复更快 |
| Store 响应式 | 低 | P5 | 整体流畅度提升 |
