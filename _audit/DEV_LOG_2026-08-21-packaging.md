# 神意助手开发日志 — 2026-08-21 封装客户实测

## 任务
封装神意助手安装包交付客户实测

## 执行步骤

| 步骤 | 内容 | 结果 |
|------|------|------|
| 1 | 读取经验文件封装规则 | 确认build配置、icon.ico、installer.nsh齐全 |
| 2 | 检查package.json build配置 | appId=com.kaixuan.shenyi-assistant, productName=神意助手, target=nsis x64, artifactName=神意助手-Setup-3.2.1.exe |
| 3 | 清理旧Electron进程 | taskkill /f /im electron.exe |
| 4 | 构建前端 | npx vite build → dist-renderer/ (552KB JS + 174KB CSS) |
| 5 | electron-builder打包 | npx electron-builder --win → NSIS安装包 |
| 6 | 验证安装包输出 | 神意助手-Setup-3.2.1.exe, 85,661,876 bytes (81.7MB), 2026-08-21 18:40 |
| 7 | 清理旧版本安装包 | 删除3.1.1和3.2.0旧exe+blockmap，只保留3.2.1 |
| 8 | Git状态确认 | 工作区干净，dist在.gitignore中 |

## 安装包信息
- 文件：`dist/神意助手-Setup-3.2.1.exe`
- 大小：81.7 MB
- 版本：3.2.1
- 类型：NSIS安装包（非一键安装，允许用户选择安装目录）
- 桌面快捷方式：自动创建
- 开始菜单：自动创建
- 应用图标：build/icon.ico

## 包含内容
- Electron 33.0.0 运行时
- Vue3 前端构建产物（dist-renderer/）
- 统一AI服务层（aiService + providerRouter + providerAdapter）
- 多供应商同时启用（生成+验证+检测）
- 诊断日志面板（DiagLogPanel + IPC + 导出）
- 生成流水线五层（大纲→设定→卷纲→章节→正文）
- 大纲工作台（导入→AI共创→锁定→内联）
- 记忆面板四视图
- 项目管理（新建/保存/切换/删除）
- 章节树联动

## 收尾
- [x] 旧版本安装包清理
- [x] 工作区干净
- [x] Git提交推送（dist在.gitignore中，无需提交二进制）

## 经验教训
1. electron-builder打包前必须先vite build，否则安装包里是旧前端
2. 旧版本安装包必须清理，只保留最新版本
3. dist目录在.gitignore中，不需要提交二进制安装包到GitHub
