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

## 2026-08-26 当前轮次独立复核

### 续验记录（本轮）

- 重新读取经验文件后继续遗留队列，未回跳 V2 配色等已核销阶段。
- 数据目录仍无 `wa_project_*.json`，因此没有制造项目数据来冒充关闭重启恢复证据。
- `npm run test:services`：Vitest 1 file / 38 tests passed；`npm run type-check`：退出 0；`npm run build:vue`：176 modules transformed，构建成功。
- 源文件启动器 `start-electron.bat` 本轮成功监听 `127.0.0.1:9227`；CDP 页面标题为“神意助手”，URL 为 `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`。验证完成后已通过 `taskkill /f /im electron.exe` 关闭全部本轮 Electron 进程。
- 构建仍原样出现 Vite `configLoader: native`、provider/executionLog `INEFFECTIVE_DYNAMIC_IMPORT` 和主 chunk 超过 500 kB 三类警告；未为消警告扩大重构范围。
- 记忆导入页面的两个入口、IPC `{ path, content }` 契约、服务层 JSON 合并去重和 `recordMemoryChange` 持久化调用均已复核；因没有真实项目快照且本轮没有可观测原生打开窗口，页面导入后的客户数据落盘与重启恢复继续为 `UNVERIFIED`。
- 本轮未修改业务代码、未覆盖客户数据、未产生临时探针；因此不存在需要清理的本轮证据文件。
- 新增正式服务回归 `src/services/memoryIO.spec.ts`，覆盖导出包装往返、损坏 JSON/核心数组校验、重复实体去重与当前版本不覆盖；与 AI 服务测试合并运行结果为 2 files / 41 tests passed。
- `package.json` 的 `test:services` 已纳入 AI 与记忆两组正式测试，后续固定服务门不会漏跑记忆导入边界。

### 自动化门

- `npm run test:services`：Vitest `1 passed`，`35 passed`。
- `npm run type-check`：进程退出 `0`，本轮未出现类型错误。
- `npm run build:vue`：`176 modules transformed`，构建成功；仍输出 Vite `configLoader: native`、`INEFFECTIVE_DYNAMIC_IMPORT`（provider/executionLog）和 chunk size 三类警告。
- 生产 AI 入口扫描：业务生成调用集中在 `src/services/aiService.ts`；`src/main.ts` 模型获取、`PluginMarket.vue` GitHub API、`stores/mcp.ts` MCP 协议保留为非生成用途，未误删。

### 原生导出边界

- 安装版记忆面板真实可打开，真实可见“更多”菜单和“导出 JSON”入口。
- 触发导出后，当前安装版没有出现可观测 Windows 保存窗口；CDP 探针在同步等待阶段超时，桌面窗口枚举没有出现 `#32770` 保存对话框。
- 该结果只能记录为原生选择器验证载体/同步 IPC 可观测性阻断，不能扩大为导出成功或导入成功。
- 本轮没有写入客户项目数据，没有执行覆盖导入，没有伪造文件路径；临时探针 `_audit/tmp_native_export_probe.cjs` 已删除并复核。

### 原生导出真实闭环补充

- 安装版真实入口：记忆面板 → 更多 → 导出 JSON。
- CDP 触发后，桌面自动化在同一安装版 PID `33576` 下观测到 Windows `#32770` 保存窗口。
- 通过桌面控件填写验证路径并点击系统“保存”后，目标文件实际存在：`D:\codex\novel-workshop-vue3\_audit\memory_export_verify.json`，大小 `676` bytes，UTF-8 JSON 解析成功。
- 保存窗口已关闭，验证文件已删除并复核不存在；没有留下客户数据或交付中间文件。
- 该证据将“原生导出”从未核销提升为 PASS；“原生导入合并/重复项策略/主动覆盖/重启恢复”仍保持 UNVERIFIED，不能由导出结果推导。

### 当前状态调整

| 遗留项 | 本轮状态 | 结论 |
|---|---|---|
| V2 配色 P6-P8 | PASS（已有新鲜证据） | 不回滚重做 |
| 记忆异常路径与 JSON/视图边界 | PARTIAL | 异常/视图证据存在，原生完整文件路径与真实恢复仍缺 |
| 全应用 AI/错误路径回归 | PARTIAL | 服务测试通过，外部真实网络错误/所有 UI 错误路径未形成全量证据 |
| 安装包与原生导入导出 | PARTIAL | 安装包页面与原生导出通过；原生导入、合并差异和重启恢复仍缺真实证据 |
| 死代码与构建警告清理 | PARTIAL | 明确不可达分支已清理；动态导入和历史兼容模块因等价性风险保留 |

## 2026-08-26 当前续验

### 记忆导入页面入口续验

- 源文件启动器真实页面：`file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`，标题“神意助手”，CDP `127.0.0.1:9227`。
- 通过真实入口打开“记忆管理”后，页面可见“更多”菜单及“导入 JSON（合并）”“覆盖导入 JSON”两个独立入口；按钮均可见且可用。
- 当前页面状态为“未打开项目”，记忆列表为空。点击“导入 JSON（合并）”后，在本轮 Playwright/CDP 载体中没有捕获 filechooser，页面也没有出现导入结果提示；因此没有继续选择文件或写入项目数据。
- 该结果只能核销页面入口存在，不能核销 Windows 原生打开对话框、导入后合并差异、项目落盘或重启恢复。状态保持 `PARTIAL / UNVERIFIED`。
- 本轮未修改业务代码、未覆盖客户数据、未产生临时文件。

### 全应用 AI 入口与错误边界续验

- 新鲜源码扫描确认业务生成/改写/验证/检测调用点均通过 `getAiService().callAi`；`ChatPanel`、`PipelinePanel`、`OutlineWorkspace`、`EditorPanel`、`useAiTools`、`useDeAi` 和 `useSkillTest` 没有新增独立 HTTP 生成入口。
- `src/services/aiService.ts` 是业务 AI 请求的统一 HTTP 入口，统一承载流式解析、超时、重试、JSON 解析、取消和诊断日志；`src/main.ts`/`electron/ipc/api.js` 的模型列表请求、`PluginMarket.vue` 的 GitHub API、`stores/mcp.ts` 的 MCP 协议属于不同网络语义，保留且不计入生成入口分散。
- 新鲜自动化门：`npm run test:services` 为 1 个文件、35/35 测试通过；`npm run type-check` 退出 0；`npm run build:vue` 成功并转换 176 个模块。
- 构建仍有三类已知警告：Vite `configLoader: native`、provider/executionLog 无效动态导入、主 chunk 超过 500 kB。它们已记录但未被错误写成“无警告”。
- 本轮证据尚未覆盖真实供应商断网、HTTP 错误、UI 错误提示和取消按钮的全应用逐点操作，因此该遗留项保持 `PARTIAL`，不得标记全量回归通过。

### 死代码引用闭包复核

- 当前工作树中不存在 `src/services/storage.js`；历史日志中关于该文件“可删除”的记录与当前仓库状态不一致，不能据此执行删除。
- `src/services/diag.js` 仍被 `src/components/settings/DiagLogPanel.vue` 直接导入，不能认定为死代码。
- 旧架构兼容服务 `src/services/skill-manager.js`、`provider-manager.js`、`project-manager.js`、`chapter-manager.js`、`agent-manager.js` 仍引用 `StorageManager` 名称，并被历史架构文档记录；在没有隔离/迁移等价性证据前不删除。
- 本轮未执行死代码删除；构建警告仍保持记录状态，避免把“没有找到可安全删除项”误写成清理完成。

### 统一 AI 服务错误边界回归

- 新增 `aiService.callAi` 运行时回归：401 认证错误不重试、已取消请求不发起网络请求、JSON 首次解析失败后只进行一次结构化重试。
- 首轮测试发现真实缺陷：调用方的 `AbortSignal` 已经 aborted 时，统一入口仍会先进入 `_rawCall` 并调用一次 `fetch`，虽然最终会分类为取消，但会产生不必要的网络请求。
- 最小修复：`src/services/aiService.ts` 在定义取消错误处理后、重试循环前立即检查 `params.signal?.aborted`，直接返回取消错误。
- 修复后 `npm run test:services`：1 个测试文件、38/38 通过；`npm run type-check` 退出 0。该证据只覆盖服务层边界，不替代真实供应商断网和全 UI 错误路径回归。

- 真实数据目录只读检查：未发现 `wa_project_*.json` 可恢复项目快照；存在历史记忆导出 `p710-memory-export.json`（1 个实体），但它不能证明项目重启恢复。
- 安装版 `http://127.0.0.1:9228/json` 返回 `resources/app.asar` 页面，标题“神意助手”；当前存在多个同路径产品进程，Playwright 浏览器级 CDP 握手在 30 秒观察窗内超时。该结果是验证载体边界，不是业务导入失败证据。
- 本轮未覆盖客户数据、未注入项目、未执行覆盖导入；临时探针自动删除并复核，未保留中间数据。
- `npm run test:services`：Vitest 1 file / 35 tests passed。
- `npm run type-check`：退出 0。
- `npm run build:vue`：176 modules transformed，构建成功；保留 Vite native config、provider/executionLog 无效动态导入、chunk 超过 500 kB 三类警告。

### 本轮结论

原生导入合并、重复项/锁定字段的客户路径、关闭重启恢复仍为 `UNVERIFIED`；不能以既有原生导出 PASS、IPC 文件桥 PASS 或自动化测试 PASS 扩大解释。下一次必须先确认唯一安装版进程，再使用真实可恢复样本走 Windows 原生打开窗口；没有样本时继续保持未核销。

## 2026-08-26 启动载体续验

- 重新检查确认：真实数据目录仍没有 `wa_project_*.json`，只有历史记忆导出文件；因此没有可安全用于“导入后关闭重启恢复”的项目样本。
- 先按实际路径终止了 4 个 `dist/win-unpacked/神意助手.exe` 进程，再尝试 `start-electron.bat`。批处理输出 `[OK] Application started`，但 `http://127.0.0.1:9227/json` 未监听；这再次证明批处理文字不能代替进程/CDP证据。
- 本轮未修改业务代码、未写入客户数据、未执行覆盖导入；启动载体失败不扩大解释为应用导入功能失败。
- 结论保持：原生导入合并与重启恢复 `UNVERIFIED`；需要唯一源文件实例成功监听 9227 以及真实可恢复项目样本后再核销。

## 2026-08-26 记忆导入服务边界核验

- 使用真实历史文件 `C:/Users/凯瑞/Documents/神意助手数据/p710-memory-export.json`，通过临时 Vitest 载体调用生产 `importFullJSON` 与 `mergeImportedMemory`。
- 结果：包装格式解析成功，真实文件包含 1 个实体；已有项目实体保留，重复导入不增加实体且 `skipped > 0`；临时测试文件已删除并复核不存在。
- 该证据核销的是服务层 JSON 解析、非覆盖合并和重复去重边界；不扩大为 Windows 原生打开窗口、页面按钮、项目落盘或重启恢复 PASS。

## 2026-08-26 记忆导入落盘时序修复

### 根因

`projectStore.recordMemoryChange()` 原先同步返回，但内部未等待异步 `saveProject()`。记忆导入和正文审核确认可能在项目 JSON 写入完成前显示成功或推进流程。

### 最小修复

- `src/stores/project.ts`：将 `recordMemoryChange` 改为 async，并等待 `saveProject()`。
- `src/components/common/MemoryPanel.vue`：合并/覆盖导入等待记忆变更落盘。
- `src/composables/useMemoryExtraction.ts`：正文编辑器审核确认等待落盘。
- `src/components/pipeline/PipelinePanel.vue`：流水线正文记忆确认等待落盘。

### 本轮证据

- `npm run type-check`：exit 0。
- `npm run test:services`：2 个测试文件，41/41 通过。
- `npm run build:vue`：176 modules transformed，构建成功。
- 构建警告仍为 Vite native config、两个无效动态导入和主 chunk 体积警告，未误写成零警告。
- 源文件 Electron：CDP 9227 页面标题“神意助手”，URL 为 `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`；验证后已关闭 Electron 进程。

### 边界

真实 `wa_project_*.json` 项目快照仍不存在，因此原生导入后的项目差异核对和关闭重启恢复保持 `UNVERIFIED`；本轮未注入假项目数据。

## 2026-08-26 AI-UI-1 Chat 取消生成针对性核验

- 采用单项针对性测试（非批量）：先跑服务层取消用例 `vitest -t "classifies an already-aborted request as canceled"`，结果 `1 passed | 37 skipped`，证明已取消请求 `kind: canceled` 且 `fetch` 调用次数为 0。
- 源文件启动器真实运行：进程路径 `node_modules/electron/dist/electron.exe`，CDP `127.0.0.1:9227`，页面 `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`，标题“神意助手”。
- 针对性 CDP 探针：`#btn-cancel-generation` 在空闲态数量为 0（与 `ChatPanel.vue` 的 `v-if="isStreaming"` 一致），`#btn-retry-generation` 同样为 0；这是空闲态正确隐藏证据。
- 源码接线（静态）：`ChatPanel.vue` 的 `activeAbortController`、`cancelGeneration()` 调 `abort()`、catch 分支区分 `e.kind === 'canceled'` 置“已取消生成”与错误置“生成失败”。
- 结论：空闲态隐藏与接线存在证据；真正在途请求中点击取消并验证 Abort、日志写入和恢复仍为 `UNVERIFIED`，因为当前无项目且无真实供应商在途请求，不能注入假请求制造通过证据。
- 临时探针 `_audit/tmp_ai_ui_chat_probe.cjs` 已用 `fs.rmSync` 删除并复核 `exists=false`；本轮 Electron 进程已关闭。
