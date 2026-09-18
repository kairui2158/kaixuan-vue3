# API 直写编辑器 V2 与 3.42.0 交付（2026-09-14）

## 任务

完成 API 直写编辑器 V2 收尾：修复兼容供应商 JSON 直写验证缺口，跑通 13 个真实 Electron E2E 场景，更新开发经验与索引，升级 3.42.0 并重新封装。

## 交付内容

1. 主页 API 对话进入直写模式：`toolPolicy.writeMode = 'direct'`，模型可通过 `editor.write` / `editor.reveal` 直接写入和定位编辑器，并保留写入次数上限、目标唯一性校验、版本冲突保护。
2. 兼容供应商降级：原生 tools 请求收到 HTTP 400 `tools unsupported` 后，自动降级为无 tools 请求，再解析 JSON 直写协议并写入编辑器。
3. 主进程流式桥补 `providerErrorSummary`，降级链路能准确识别供应商拒绝 tools 的原因。
4. 运行记录保留写入、定位、呈现方式（流式/一次性）、降级原因 `compatibility_write` 与导出证据。
5. E2E 覆盖 13 个场景：空编辑器插入、唯一目标替换、多目标拒绝、版本冲突阻断、大文档一次性写入、流式跟随、讨论定位、写入限流、大纲直写、锁定态只读、流水线工具面隔离、兼容供应商两次 JSON 直写、运行记录导出。

## 过程修复

1. 初始 E2E 出现“源码已改但现象不变”：`ChatPanel.vue` 已更新，但 `dist-renderer` 仍是旧构建。执行 `npm run build:vue` 后重新验证，确认是构建产物滞后，不是业务回归。
2. 场景 8 断言仍等待旧“写入提案”文案；直写 V2 实际文案为“本次任务只允许 1 次编辑器写入，请基于已写入结果直接结束请求”。已同步测试断言。
3. 场景 12 第二次请求失败：mock 只在 `compatibility-first-tools` 分支返回 tools 400，切到 `compatibility-json-write` 后带 tools 请求直接拿到 JSON 文本，未触发降级。已把两个兼容场景集中声明为同一降级能力，再按场景返回不同写入内容。
4. 原 E2E 结果声明 13 个场景但只有 12 张截图，导出验证场景没有截图。已补 `13-run-trace-export.png`，保证证据与场景数对账。

## 验证证据

- `node scripts/verify-api-direct-write-v2-e2e.mjs`：13 场景 PASS，输出 `===== API DIRECT WRITE V2 E2E PASSED =====`，清理输出 `[CLEANUP] profile and temporary exports removed`。
- `_audit/verification-api-direct-write-v2/e2e-result.json`：`passed: true`、`scenarios: 13`、13 张截图。
- `_audit/verification-api-direct-write-v2/e2e-mock-requests.json`：两个兼容场景均为 `#1 带 tools`、`#2 no tools`，证明降级重试真实发生。
- `_audit/verification-api-direct-write-v2/run-trace-export.json`：127 个事件，两条 API 记录带 `downgradeReason: "compatibility_write"`。
- `npm run type-check`：exit 0。
- `npm run test:services -- --run`：15 个测试文件、214 个测试全部通过。
- 清理复核：`_data/api-direct-write-v2-profile` 与 `_data/api-direct-write-v2-exports` 均不存在。

## 交付

- 版本升级到 3.42.0，重新封装 Windows 安装包，并清理旧安装包。

## 3.42.1 补验：诊断日志覆盖面与真实安装版闭环（2026-09-14）

### 本轮补齐

1. `editorEditDiagnostics.ts` 新增 `logEditorPresentation()`，主页和大纲工作台在直写呈现（流式/一次性）时写入 `ai-service/editor-presentation` 诊断。
2. 诊断覆盖面纳入 E2E：同时读取 renderer DiagLogger 与主进程 `diagRead()`，对账四类直写日志（`ai-service`、`ai-service/tool-call`、`ai-service/editor-presentation`、`ai-service/editor-batch`）。
3. 主进程支持 `SHENYI_TEST_LOG_DIR`，安装版 E2E 的诊断日志进入专用 profile，测试结束后随 profile 清理，不污染用户真实日志。
4. E2E 第 13 场景从“只导出文件”升级为“导出校验 + 真实打开运行记录面板截图”；第 14 场景补诊断覆盖面截图。最终 14 场景对 14 张截图。
5. 安装版校验新增截图防伪：清点磁盘截图、记录 SHA256、断言哈希互不相同、断言结果 JSON 与磁盘文件一致。

### 过程根因

- 第一轮安装版失败点不是产品缺陷：第 12/13 张截图相同，是因为导出 run trace 不产生 UI 变化。修复方式不是放宽断言，而是让第 13 场景真实打开运行记录面板后再截图。
- 复核发现 `scenarios: 14` 与 13 张截图不对账：诊断覆盖面场景缺少可视化证据。已补第 14 张截图（运行记录面板 API 调用页签）。

### 验证证据

- `node scripts/verify-api-direct-write-v2-e2e.mjs`：源码 Electron 14 场景 PASS，输出 `===== API DIRECT WRITE V2 E2E PASSED =====`。
- `node scripts/verify-installer-3-42-0-direct-write.mjs`：安装版 3.42.1 真实安装、14 场景、截图防伪、诊断覆盖面、静默卸载全部 PASS，输出 `===== INSTALLED 3.42.1 DIRECT WRITE PASSED =====`。
- `_audit/verification-api-direct-write-v2/e2e-result.json`：`passed: true`、`scenarios: 14`、`mode: installer`、14 张截图。
- `_audit/verification-api-direct-write-v2/diag-coverage.json`：renderer 113 条、主进程 113 条；四类日志双侧数量一致，`missingInMain: []`。
- `_audit/verification-api-direct-write-v2/installer-direct-write-screenshots.json`：14 张截图 SHA256 互不相同。
- 清理复核：`_data/api-direct-write-v2-profile-installer`、`_data/api-direct-write-v2-exports-installer`、`_data/installer-3-42-1-direct-write-install` 均不存在。

## 安装级烟测补验（2026-09-14）

### 根因与修复

第一版烟测脚本虽然退出码为通过，但六张截图字节数完全相同，属于假验证。根因是脚本通过 `window.location.hash` 切换视图，而本应用没有 vue-router，`activePanel` 只由组件内部 `handleNavigate` 控制，hash 完全不参与 UI 状态，导致所有截图停留在主页。

已重写 `scripts/verify-installer-3-42-0-smoke.mjs` 为真实用户路径驱动：

1. 点击 `#btn-settings` 打开设置，依次点击 `#tab-api`、`#tab-skill`、`#tab-agent`。
2. 每个视图等待唯一内容锚点可见并断言文本。
3. 关闭设置后点击 `#btn-outline-workspace` 打开大纲工作台。
4. 每张截图记录 SHA256，最终断言所有哈希互不相同；开跑前清空旧 PNG，防止旧证据污染。

### 验证证据

- 静默安装 `dist/神意助手-Setup-3.42.0.exe` 成功，安装目录内 `神意助手.exe` 存在。
- CDP 端口 9274 连通，页面加载成功，`consoleErrors: []`。
- 五个视图截图哈希互不相同（设置页技能/智能体列表存在时间戳等动态渲染，哈希跨轮变化属预期；验收条件是本轮五值互不相同）：
  - `01-installer-home.png`: `61b708ad03cdff7186984b9fddde2b89528caca2ac5eed0ea70a67102dc6b469`
  - `02-installer-设置-API.png`: `933ada774d092c80adf0a9cad453ff426cf9e22b7ad4c1ad91c2cbcb3bef4cac`
  - `03-installer-设置-技能.png`: `a035f716fb7a7aada690fd44d600ab1c4d823eb6c39587dde8d12daf498582c1`
  - `04-installer-设置-智能体.png`: `6525f9b524daa606b1f5187a8524b93883491b3ef721b83bc7f0663e3d021919`
  - `06-installer-大纲工作台.png`: `fbbd9816cc5a2cea149be20c8afad96ea6f09c9d474e98a32390dc4fc332e727`
- 结果文件：`_audit/verification-api-direct-write-v2/installer-smoke-result.json`，`passed: true`，包含五张截图及各自哈希。
- 静默卸载成功，安装目录与专用 profile 均已清理复核。

## 开发经验文件 v5.1 门禁修订（2026-09-14）

### 背景

全应用直写权限审查发现旧经验规则与 3.42 产品决策冲突：§8 规则 26/69 仍写“模型不得直写、永远是提案”，同时发现 plain 对话与共创入口绕过意图权限、单测/E2E 固化错误契约、运行记录缺 intent/writeMode/工具面等问题。

### 修订

1. `神意开发经验总结_v5.md` 升级 v5.1：规则 26 重写为“统一对话底座 + 意图权限门 + editor.write 统一执行器 + 唯一定位 + hash/版本校验 + 写入上限 + 锁定只读 + 回滚与日志留痕”。
2. 规则 69 重写为“intent 决定写权限，writeMode 只决定执行形态；所有入口禁止硬编码 direct 打穿权限”。
3. 新增 M8 日志覆盖同步门禁、M9 权限执行门禁、M10 测试契约门禁；§9 根因索引新增日志覆盖滞后、写权限入口旁路、测试固化错误契约三行。
4. 修复 §8 重复编号 114，后续重排为 115/116；保留 v5.0 修订记录并新增 v5.1 修订记录。

### 后续

产品代码本轮未改；基于 v5.1 的修复计划另行输出给用户审核。
