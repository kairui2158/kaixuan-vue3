# P5 统一 AI 入口分类核验：模型列表边界

日期：2026-08-26

## 本轮范围

- 只核验统一 AI 服务层中的模型列表 GET 请求。
- 不迁移插件市场 GitHub 请求或 MCP `/tools`、`/call` 协议请求。
- 不制造真实供应商响应，不把空闲页面烟测写成客户 API 回归。

## 根因

`src/services/aiService.ts` 的 `fetchModels()` 虽然已经属于统一 AI 服务层，但原实现直接抛出普通 `Error`，没有统一的 `AiServiceError` 分类，也没有写入统一诊断日志。设置页因此无法获得与聊天调用一致的错误语义和诊断证据。

## 最小修复

- 模型列表成功响应写入统一诊断日志。
- 401/403 映射为 `auth`，其他 HTTP 错误映射为 `http`。
- Abort/Timeout 映射为 `timeout`，其他异常映射为 `network`。
- 供应商不存在映射为统一错误对象。
- 保留模型列表的 GET 语义，不把模型获取改造成聊天 POST。
- 新增 Vitest：成功返回模型并记录日志；401 分类为鉴权错误。

## 验证证据

- `npm run test:services`：2 个测试文件，44/44 tests passed；运行时间约 617ms。
- `npm run type-check`：exit 0，无错误输出。
- `npm run build:vue`：176 modules transformed，构建成功。
- `taskkill /f /im electron.exe`：清理旧 Electron 进程成功。
- `start-electron.bat`：输出 `[OK] Application started`，随后独立核对端口和 CDP。
- `netstat -ano | findstr :9227`：`127.0.0.1:9227 LISTENING`，PID 3792。
- `curl http://127.0.0.1:9227/json/list`：页面标题 `神意助手`，URL `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`。

## 未核销边界

- 未执行真实供应商模型列表请求、网络断开和设置页客户操作；当前没有安全可用的真实供应商在途条件。
- `src/main.ts` 的浏览器开发模式 polyfill、插件市场和 MCP 仍是不同网络语义，未误判为统一 AI 生成入口缺陷。
- P2 的真实原生导入、项目 JSON 差异和关闭重启恢复仍为 `UNVERIFIED`。
- P4 的真实供应商错误、取消和重试仍为 `UNVERIFIED`。

## 第二轮接线补充

首次核验发现设置页 `ApiSettings.vue` 和 `stores/provider.ts` 仍直接调用
`window.electronAPI.fetchModels/providerTestConnection`。已将设置页的获取模型、测试连接按钮改为调用
`getAiService().fetchModelsForProvider()` / `testConnectionForProvider()`，因此新建但尚未保存的供应商也能经过统一服务层；已保存供应商的 store 兼容方法也委托到同一服务层。

补充验证：

- `npm run test:services`：2 个测试文件，44/44 tests passed，20:53:34。
- `npm run type-check`：exit 0。
- `npm run build:vue`：176 modules transformed，构建成功。
- 重启后 CDP：`127.0.0.1:9227 LISTENING`，页面标题 `神意助手`，URL 为
  `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`。
- 收尾已终止本轮源文件 Electron 进程；`_audit/tmp` 不存在，`_audit/tmp_*.cjs` 无残留。

## 本轮真实 DOM 递归核验（2026-08-26）

- 首次只读探针连接到源文件 Electron 页面：标题为“神意助手”，URL 为
  `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`；首页入口使用
  `#btn-settings` 和 `aria-label="设置"`，不是可见文字“设置”。
- 点击 `#btn-settings` 后，设置弹窗和 `API设置` 标签真实出现；API 页显示两个供应商，且用途开关分别呈现生成/验证激活状态。
- 递归点击首个供应商的“编辑”后，真实 DOM 核验结果：
  - `#btn-fetch-models`：count=1，visible=true，disabled=false
  - “测试连接”按钮：count=1，visible=true
- 本轮没有点击网络按钮，因此只核销 DOM 入口和可用状态，不把真实供应商请求成功写成 PASS。
- 探针 `_audit/tmp_p5_dom_probe.cjs` 已删除；随后 `taskkill /f /im electron.exe` 成功终止本轮 Electron 进程。

## 本轮结论

P5 的模型获取/连接测试入口已完成代码接线并完成源文件 Electron 的递归 DOM 核验；真实供应商网络成功、断网和错误恢复仍保持 `UNVERIFIED`，等待客户供应商条件下实测。
