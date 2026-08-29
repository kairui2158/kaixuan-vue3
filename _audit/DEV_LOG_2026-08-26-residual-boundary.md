# 遗留核销记录：安装版、类型检查与测试载体

日期：2026-08-26
目标：继续核销 V2/记忆/AI/安装版/死代码五类遗留项。

## 本轮真实证据

- 安装版文件存在：`dist/神意助手-Setup-3.2.1.exe`、`dist/win-unpacked/神意助手.exe`。
- 解包安装版以 `--remote-debugging-port=9228` 启动后，`GET http://127.0.0.1:9228/json/version` 返回 Electron 33.0.0，`GET /json/list` 返回页面标题“神意助手”，URL 为 `file:///.../resources/app.asar/dist-renderer/index.html`。
- 安装版页面有 `window.electronAPI`，页面横向尺寸为 `scrollWidth=1904`、`clientWidth=1904`。
- 安装版临时文件 IPC 往返：`dialogWriteFile` 返回 `true`；`dialogReadFileAsync` 返回 `{ path, content }` 对象。验证脚本第一次误将对象与字符串直接比较，`equal=false` 不能解释为读写失败；应比较 `read.content === content`。临时文件已删除。
- 以上只证明解包程序启动、CDP 页面和 IPC 桥接，不证明 Windows 原生选择器、客户项目重启恢复或安装版 JSON 导入合并。
- 重新以 `call start-electron.bat <nul` 启动源文件后，取得真实证据：`electron.exe` PID `37872`，`127.0.0.1:9227 LISTENING`，`/json/list` 页面标题“神意助手”，URL 为 `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`。Playwright CDP 读取到 `window.electronAPI=true`，按钮入口存在，页面 `scrollWidth=1904`、`clientWidth=1904`。本次源文件启动与基础 DOM 烟测可核销；业务闭环仍不能由烟测扩大解释。

## 类型检查

首次 `npm run type-check` 暴露全局 `electronAPI` 声明缺失及多类接口漂移。补充 `src/env.d.ts` 后，Electron API 大量重复错误已收敛，但仍有以下真实错误：Vue/旧 JS 声明边界、OutlineWorkspace AI 接口、settings/store 接口漂移、PipelineFlow/PipelinePanel 接口、事件目标类型、API purpose 类型、EditorPanel 二进制类型以及 `memoryMerger` 之外的若干隐式类型错误。

当前结论：类型检查未通过，不能标记完成；不通过 `any` 全局覆盖或关闭 strict 来伪造通过。

## 测试载体

`node --experimental-strip-types --test src/services/aiService.spec.ts` 失败，原因是项目使用 Vite `moduleResolution: bundler` 和无扩展名 ESM import，Node 原生 runner 无法解析 `./providerAdapter`。不修改生产 import 规则迎合 Node runner；需后续引入适配当前项目的 runner，或建立隔离测试载体。

## 未完成边界

- 安装版原生打开/保存对话框真实用户路径：未核销。
- 真实项目关闭、重启、恢复：未核销；当前数据目录没有可用的标准 `wa_project_*` 客户项目样本，未注入假数据。
- 安装版 JSON 导入合并及重复项行为：未核销。
- 类型检查：未通过。
- AIService 自动化断言：runner 未建立，未通过。
- Vite 构建警告治理：仍待单独处理，不能写成无警告。
