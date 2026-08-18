# 神意助手 3.2.1 封装交付验证

## 封装入口

- 执行命令：`npm run build`
- Vue 构建：151 modules，PASS。
- Electron Builder：25.1.8。
- Electron：33.0.0，Windows x64。
- 目标：NSIS 安装包。
- 安装包配置：允许选择安装目录，创建桌面快捷方式和开始菜单快捷方式。

## 数据保护

- 用户数据目录：`%USERPROFILE%\Documents\神意助手数据`
- 安装包卸载脚本只删除程序文件，不删除上述用户数据目录。
- 数据目录与安装目录分离，重装后可继续读取项目、API 配置和 SKILL 数据。

## 交付物

- 安装包：`dist\神意助手-Setup-3.2.1.exe`
- 大小：85,499,419 bytes
- SHA-256：`139be1e010d796e6c65f54d24f6a66343c0b0bb5febcbd21477e85ff474129bf`
- 便携解包程序：`dist\win-unpacked\神意助手.exe`（仅用于本地封装验证，不作为客户首选交付物）

## 生产包启动验证

- 验证脚本：`_audit/scripts/archive/verify_packaged_app_20260818.cjs`
- 结果：PASS
- CDP：`http://127.0.0.1:9228`
- 实际页面：`file:///D:/codex/novel-workshop-vue3/dist/win-unpacked/resources/app.asar/dist-renderer/index.html`
- 结论：封装程序加载的是 ASAR 内置生产资源，不是 `src`、`dist-renderer` 开发目录，也不是 Vite 开发服务器。
- 测试完成后已通过 `taskkill /f /t /pid` 清理生产包进程。

## 注意

本次验证确认“封装、生产资源加载、进程清理、数据目录保护”成立；API 真实调用和客户业务数据操作应由客户在安装包中配置自己的服务后实测。
