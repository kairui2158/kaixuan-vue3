# 神意助手开发日志：3.2.1 客户交付封装

## 目标

把已验证的 Vue3 生产资源严格封装为 Windows x64 NSIS 安装包，供客户安装后实测。

## 执行流程

1. 读取经验总结和 package.json 封装配置。
2. 核对 `build/installer.nsh`，确认卸载不删除用户数据。
3. 清理 Electron 进程。
4. 执行项目标准命令 `npm run build`。
5. 生成 `dist/神意助手-Setup-3.2.1.exe`。
6. 用封装后的 `dist/win-unpacked/神意助手.exe` 启动并连接 CDP 9228。
7. 确认页面来自 `resources/app.asar/dist-renderer/index.html`。
8. 杀掉生产包测试进程，保留安装包交付。

## 结果

- 封装 PASS。
- 生产包启动 PASS。
- 生产资源路径检查 PASS。
- 用户数据目录保护 PASS。
- 进程清理 PASS。

## 边界

本日志不把客户 API、客户项目数据和客户真实写作流程冒充为本机已验证；这些由客户安装后实测。
