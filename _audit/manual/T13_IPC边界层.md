# T13 - IPC边界层 (IPC Boundary Layer)

> 旧架构行为手册 第十三层 | 源码权威参考 | Vue3迁移差异检测驱动依据

## 1. 层级定位与职责边界

IPC边界层是Electron主进程与渲染进程之间的唯一通信通道。通过preload.js的contextBridge暴露安全API，渲染进程无法直接访问Node.js API。

职责范围：contextBridge API暴露；同步IPC（ipcMain.on + sendSync）；异步IPC（ipcMain.handle + invoke）；IPC消息协议；安全隔离（contextIsolation: true, nodeIntegration: false）。

## 2. 安全模型

源码位置: main.js createWindow L70-73

webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false }

contextIsolation: true 确保preload.js的代码在隔离的V8上下文中运行，渲染进程的JS无法直接修改preload注入的对象。nodeIntegration: false 禁止渲染进程使用require等Node.js API。

## 3. IPC通道清单

源码位置: preload.js

### 3.1 存储IPC（同步）

- storageRead(key) -> storage:read -> 返回string/null
- storageWrite(key, data) -> storage:write -> 返回boolean
- storageRemove(key) -> storage:remove -> 返回boolean
- storageList() -> storage:list -> 返回string[]
- storageExport(filePath) -> storage:export -> 返回{success, count}
- storageImport(filePath) -> storage:import -> 返回{success, count}
- storageGetDataDir() -> storage:getDataDir -> 返回string

### 3.2 加密IPC（同步）

- encrypt(text) -> safe:encrypt -> 返回加密字符串
- decrypt(val) -> safe:decrypt -> 返回解密字符串

### 3.3 对话框IPC（同步）

- dialogSaveFile(defaultName) -> dialog:saveFile -> 返回文件路径/null
- dialogOpenFile() -> dialog:openFile -> 返回文件路径/null

### 3.4 诊断日志IPC（同步）

- diagWrite(batch) -> diag:write -> 返回boolean
- diagRead(date) -> diag:read -> 返回日志条目数组
- diagExport() -> diag:export -> 返回文件路径/null
- diagClear() -> diag:clear -> 返回boolean

### 3.5 应用控制IPC

- onFinalSave(callback) -> app:finalSave（主进程发送，渲染进程监听）
- forceQuit() -> app:quit（渲染进程发送）
- onCloseRequest(callback) -> app:requestClose（主进程发送，渲染进程监听）
- respondCloseChoice(choice) -> app:closeChoice（渲染进程发送，0=保存退出/1=直接退出/2=取消）

### 3.6 API代理IPC（异步）

- fetchModels(baseUrl, apiKey) -> api:fetchModels -> 返回{ok, data, status}或{ok: false, error}

这是唯一使用ipcMain.handle + ipcRenderer.invoke的异步IPC。其余全部是同步sendSync。

### 3.7 环境信息

- platform: process.platform（操作系统平台）
- version: process.versions.electron（Electron版本）

## 4. 关闭流程IPC协议

关闭流程是一个多步IPC交互：

1. 用户点击关闭按钮 -> main.js mainWindow.on("close") 触发
2. main.js发送 app:requestClose 到渲染进程
3. 渲染进程显示退出确认模态框
4. 渲染进程通过 app:closeChoice 发送用户选择
5. main.js根据choice执行：0=发送app:finalSave后延迟500ms关闭，1=立即关闭，2=不操作

关键不变量：close事件必须preventDefault（除非_forceClose为true），否则窗口直接关闭不等待用户选择。ipcMain.removeAllListeners("app:closeChoice")确保不重复监听。

## 5. IPC错误处理

每个同步IPC处理器都有独立try-catch。失败时设置event.returnValue为安全默认值（null/false/[]）并写入ErrorLog。event.returnValue必须被设置，否则sendSync会永久阻塞渲染进程。

异步IPC（api:fetchModels）使用ipcMain.handle，返回值通过Promise传递。失败时返回{ ok: false, error: e.message }。

## 6. Vue3迁移差异检测要点

必须保留：contextIsolation: true；nodeIntegration: false；所有18个IPC通道名称不变；同步IPC返回值类型不变；关闭流程IPC协议不变；api:fetchModels异步IPC不变。

可改进：存储IPC从sendSync改为invoke减少阻塞；增加IPC消息验证防止参数注入；preload API添加TypeScript类型定义。

差异检测规则：preload.js暴露的API名称必须完全保持；IPC通道名称必须保持；返回值类型必须保持；contextIsolation必须为true；nodeIntegration必须为false。

## 7. 已知问题

1.存储IPC全部同步阻塞渲染进程 2.storage:list重复注册两次 3.无IPC消息参数验证 4.preload无TypeScript类型 5.关闭流程中如果渲染进程不响应app:closeChoice，窗口永远无法关闭

---
*手册版本: T13 v1.0 | 生成时间: 2026-08-11 | 源码版本: 旧架构 2.7.x*