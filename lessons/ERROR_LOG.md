# 错误实时记录

## 2026-08-21 22:01:00｜P0｜纯函数验证载体首次失败
- 错误描述：`node scripts/tmp-p0-memory-merge.cjs` 调用 TypeScript 编译单文件时返回 `TS5112: tsconfig.json is present but will not be loaded if files are specified on commandline`。
- 根因分析：TypeScript 7 对“指定输入文件 + 仓库 tsconfig”要求显式传入 `--ignoreConfig`；不是业务源码编译错误。
- 修复方案：只在独立验证载体的 tsc 参数中增加 `--ignoreConfig`，不修改项目 tsconfig 和业务代码。
- 修复验证结果：待重跑。
- 是否闭环：待修复。

## 2026-08-21 22:02:00｜P0｜纯函数验证载体第二次失败
- 错误描述：编译命令返回后，验证脚本找不到 `scripts/.tmp-p0-compile/memoryIO.js`。
- 根因分析：TypeScript 保留了源码目录结构，实际输出路径是 `scripts/.tmp-p0-compile/services/memoryIO.js`；脚本错误假设输出在临时目录根部。
- 修复方案：按 TypeScript 实际输出目录加载编译模块；业务代码不变。
- 修复验证结果：待重跑。
- 是否闭环：待修复。

## 2026-08-21 22:05:00｜P0｜CDP 导入验证首次失败
- 错误描述：`tmp-p0-cdp-import.cjs` 点击 `#btn-memory` 超时，Playwright 报告 `#panel-backdrop` 拦截指针事件。
- 根因分析：上一轮菜单验证留下记忆面板/遮罩处于打开状态，验证脚本无条件再次点击侧栏按钮，未处理“面板已经打开”的状态分支。
- 修复方案：验证脚本增加面板状态判断；已打开时直接复用，关闭时才点击；每次菜单操作前先关闭已有菜单。
- 修复验证结果：待重跑。
- 是否闭环：待修复。

## 2026-08-21 22:07:00｜P0｜CDP 导入验证第二次失败
- 错误描述：面板已打开，但点击 `#btn-import-memory` 等待 30 秒后超时，按钮未出现在 DOM 中。
- 根因分析：验证脚本在多次导入之间无条件点击 `.mem-more-btn`，没有确认下拉菜单是否已打开；按钮受 `v-if` 控制，菜单未打开时不存在。
- 修复方案：增加 `openMoreMenu()`，仅在导入按钮不可见时点击菜单按钮，并等待目标按钮可见后再操作。
- 修复验证结果：待重跑。
- 是否闭环：待修复。

## 2026-08-21 22:10:00｜P0｜CDP 导入验证第三次失败
- 错误描述：导入按钮已渲染并进入点击动作，但 Playwright 在点击阶段超时；应用停在 Electron 同步原生文件对话框。
- 根因分析：`window.electronAPI.dialogOpenFile` 由 `contextBridge` 暴露并同步调用主进程，渲染页内给该属性赋值未能替换底层 IPC 方法；页面自动化不能把原生文件对话框当作浏览器对话框处理。
- 修复方案：不再用页面内 API 替身伪造导入；改为准备真实测试 JSON 并用原生窗口输入路径，导入后再回到 CDP 检查 store、持久化和提示。验证脚本只保留 DOM/状态读取职责。
- 修复验证结果：待重跑。
- 是否闭环：待修复。

## 2026-08-22｜整合交付｜类型检查工具恢复后暴露历史类型债务
- 错误描述：将 TypeScript 固定到 `5.7.3` 后，`npm run type-check` 能进入源码检查，但因全局 `window.electronAPI` 缺少声明、旧 JS 模块缺少声明、组件接口和 Pinia 字段不一致等历史问题失败。
- 根因分析：此前 `typescript@7.0.2` 与 `vue-tsc` 的启动器不兼容，掩盖了源码级类型问题；工具修复后才暴露真实债务。
- 修复方案：本轮只修复阻断构建与解析的 `PipelinePanel.vue:88` 模板表达式错误；不在记忆整合交付中批量重构全项目类型系统。
- 修复验证结果：`npm run build:vue` 通过；`npm run type-check` 未通过，历史类型债务列入未核销边界。
- 是否闭环：工具链阻断已闭环；全项目类型检查未闭环。
