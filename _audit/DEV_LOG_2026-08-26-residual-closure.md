# 遗留核销收尾记录（2026-08-26）

## 本轮目标

按既定遗留队列核销安装版边界、测试与构建门，并对死代码/构建警告进行误删风险审查。

## 安装版证据

- 启动文件：`D:\codex\novel-workshop-vue3\dist\win-unpacked\神意助手.exe`
- CDP：`127.0.0.1:9228`，监听进程为安装版路径下的产品进程。
- 页面：`file:///D:/codex/novel-workshop-vue3/dist/win-unpacked/resources/app.asar/dist-renderer/index.html`
- 标题：`神意助手`
- `window.electronAPI` 存在。
- `dialogWriteFile` 与 `dialogReadFileAsync` 均为函数；真实写入后读取结果的 `read.content === content` 为 `true`。

## 边界结论

- 安装包生成、解包程序启动、生产 `app.asar` 页面和 IPC 文件桥：核销。
- Windows 原生文件选择器的完整用户路径：未核销，不能用 IPC 往返替代。
- 真实客户项目关闭重启恢复、JSON 导入合并和重复项不覆盖：本轮没有注入假数据，仍需真实可恢复样本才能核销。

## 死代码与警告审查

- `aiService.ts` 中 provider/executionLog 动态导入虽被静态入口间接引用，但承担避免循环依赖的边界；未证明静态化等价前不删除、不改写。
- Vite native config、无效动态导入提示和 chunk 超过 500 kB 记录为非阻断构建警告，未扩大修改范围。
- 未执行全局删除，避免误删历史行为基准和测试入口。

## 本轮状态

`PARTIAL / UNVERIFIED`：安装版基础边界已核销，但原生选择器和真实项目恢复仍未核销；不能标记全量遗留清零。

## 续验补充

- `electron/ipc/dialog.js` 删除了 `dialog:writeFile` 空路径分支中的不可达 `return`，不改变空路径仍返回 `false` 的行为。
- 修改后 `npm run build:vue`：exit `0`，`176 modules transformed`，仍原样出现 native config、两个 `INEFFECTIVE_DYNAMIC_IMPORT` 和 chunk size 警告。
- 修改后源文件启动器真实运行：`file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`、标题“神意助手”、`window.electronAPI=true`；空路径写入返回 `false`。
- `_audit/tmp_source_probe.cjs` 已删除。

## 2026-08-26 最终安装版续验

- 安装版进程：`dist/win-unpacked/神意助手.exe`。
- CDP：`127.0.0.1:9228` 监听，页面标题为“神意助手”。
- 页面 URL：`file:///D:/codex/novel-workshop-vue3/dist/win-unpacked/resources/app.asar/dist-renderer/index.html`。
- 证明安装包页面实际加载 `resources/app.asar`，不是开发服务器；本次没有重复启动进程。
- `_audit/tmp_final_package_probe.cjs` 已删除；本轮临时探针未留存。
- 该证据只核销安装包启动与页面载体边界；Windows 原生选择器完整用户路径、真实项目关闭重启恢复、真实 JSON 导入合并仍未核销。
