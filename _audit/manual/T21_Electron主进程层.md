# T21 - Electron主进程层

## main.js架构
- 源文件: main.js (15KB)
- 职责: 窗口管理 + IPC处理 + 存储代理 + 加密 + 诊断日志

## 窗口管理
- 创建BrowserWindow
- 单实例锁: second-instance事件处理
- 窗口状态持久化: 位置/大小保存恢复
- 加载文件: renderer.html (开发) 或打包后路径

## 存储路径
- 数据目录: Documents/写作助手数据/
- safeKey: 替换非ASCII字符用于文件名
- 文件格式: 每个key一个文件({key}.json)

## IPC处理

### 存储IPC
- storage:read -> 读取key文件
- storage:write -> 写入key文件
- storage:remove -> 删除key文件
- storage:list -> 列出所有key
- storage:export -> 导出全部数据
- storage:import -> 导入数据

### 加密IPC
- safe:encrypt -> crypto加密
- safe:decrypt -> crypto解密

### 文件IPC
- dialog:saveFile -> 保存对话框
- dialog:openFile -> 打开文件对话框

### 诊断IPC
- diag:write -> 写诊断日志
- diag:read -> 读诊断日志
- diag:export -> 导出诊断日志
- diag:clear -> 清除诊断日志

### 网络IPC
- fetch:models -> 主进程fetch /models(绕CORS)

### 生命周期IPC
- close:request -> 关闭请求
- close:choice -> 关闭选择响应
- final:save -> 最终保存

## 错误处理
- 主进程错误日志
- IPC异常捕获

## 迁移注意
1. main.js改为TypeScript
2. IPC改为结构化(electron-trpc或自定义类型)
3. 存储改用electron-store
4. 加密改用electron safeStorage API
5. 窗口状态用electron-window-state库
