# 大纲工作台导入后编辑闭环

日期：2026-08-23

## 目标

修复大纲文件导入后用户无法输入、删除、复制粘贴和使用键盘编辑命令的问题。

## 根因

`src/composables/useShortcuts.ts` 在 `window` 级别统一处理 `Ctrl+S/Z/Y/F` 并调用 `preventDefault()`，没有排除正在编辑文本的 `INPUT`/`TEXTAREA`。因此全局快捷键会抢走编辑器的原生保存、撤销、重做和查找组合键；普通字符输入虽然原本可用，但用户执行键盘编辑命令时会判断为编辑器失效。

## 最小修改

在全局快捷键处理器中，除聊天输入框和查找框外，文本输入控件直接返回，让浏览器原生处理编辑快捷键。没有改动导入解析、`projectStore.outlineText`、锁定逻辑或大纲行为。

## 验证证据

- `npm run build`：Vite 构建成功，electron-builder 完成 `dist\\win-unpacked` 与 `dist\\神意助手-Setup-3.2.1.exe`。
- `start-electron.bat`：启动最新 `dist-renderer`，CDP 端口 `9227` 可连接。
- 真实 CDP 操作：打开大纲工作台，注入 `.txt` 文件，导入内容长度 `22` 且内容完全一致；输入/删除后长度 `24`，复制粘贴后长度 `26`；撤销长度 `24`，重做长度 `26` 且恢复粘贴结果。
- DOM 状态：`disabled=false`、`readOnly=false`、`active=true`、`pointerEvents=auto`。

## 边界

本轮直接验证的是源文件 Electron 的 TXT 导入。未把该证据扩展为 DOCX 真实客户样本兼容，也未声称已完成网络/API行为验证；DOCX 客户样本和安装包独立验收应列入下一步。

## 清理

本轮 CDP 临时脚本和临时 TXT 已在验证后删除。
