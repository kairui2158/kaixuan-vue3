# 遗留核销最终边界（2026-08-26）

## 已核销

- 记忆板块四视图真实挂载与横向边界：CDP 逐一点击，四个对应节点分别挂载，横向溢出 `0`。
- 记忆 JSON 服务层：损坏 JSON、缺字段、包装格式、裸格式均有明确结果；默认合并不覆盖已有条目；覆盖导入独立入口并二次确认。
- AI 主业务调用：生成流水线、聊天、编辑器主要调用点已通过 `getAiService().callAi`/兼容壳进入统一服务层；服务层具备超时、重试、取消、JSON 重试、日志能力（源码证据）。
- 安装包最小烟测：`dist/win-unpacked/神意助手.exe` 启动后 CDP 9228 可连接，标题为“神意助手”，四个主入口存在，页面宽度 `1904/1904`。
- 构建：`npm run build:vue` 成功，`176 modules transformed`，但保留 Vite native config、无效动态导入和 chunk size 警告。

## 不可标记为全部通过的边界

1. AIService 尚未成为所有网络请求的唯一入口：`src/main.ts`、`src/components/common/PluginMarket.vue`、`src/stores/mcp.ts` 仍有直接 fetch；其中模型获取、插件市场、MCP 不应被误归为生成调用，但若目标是“所有 AI/相关请求唯一入口”，仍需单独设计 purpose/adapter。
2. `src/services/pipeline-manager.js` 未被当前 Vue3 生产入口引用；历史文档和旧审计脚本仍引用它，因此保留为历史行为基准，不删除、不批量改写。V2-P7 的生产 Vue3 范围已核销。
3. `npm run type-check` 仍失败，输出包含缺少 `window.electronAPI` 声明、Vue/JS 模块声明、store 与组件接口漂移等既有问题。
4. `node --experimental-strip-types --test src/services/aiService.spec.ts` 因无扩展名 ESM import 报 `ERR_MODULE_NOT_FOUND`，自动化测试 runner 需要单独治理。
5. 原生文件选择器的客户路径、关闭重启恢复和真实磁盘 JSON 导入导出，本轮没有使用假文件操作冒充通过，留为安装版深度验收项。

补充尝试：通过真实 Electron preload IPC 做临时文件写入/读回时，本轮启动载体未在 `9227` 建立 CDP 监听，命令输出为 `connect ECONNREFUSED 127.0.0.1:9227`；临时验证脚本已删除，未生成客户数据。该项因此继续保持未核销，不以源码 IPC 存在替代运行时证据。

## 清理说明

本轮没有新增临时脚本或截图；启动前已有的历史 `_audit`、构建产物和用户改动未删除。源文件 Electron/安装版 Electron 进程均已结束。

## 2026-08-26 续验：原生文件往返与工程边界

### 新鲜证据

- 启动载体根因已定位：封装版进程名为 `神意助手.exe`，仅执行 `taskkill /IM electron.exe` 不会释放单实例锁；清理封装版进程后，`start-electron.bat` 真实建立 `127.0.0.1:9227`。
- 源文件 Electron + CDP 真实执行 `window.electronAPI.dialogWriteFile` 和 `dialogReadFileAsync`：写入结果为 `true`，读回路径与临时文件一致，内容与写入 JSON 一致；页面为 `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`，标题为“神意助手”。临时文件位于系统 Temp，脚本执行后已删除。
- 杀进程后再次使用 `start-electron.bat`，`127.0.0.1:9227` 重新监听，证明源文件启动器可复现；当前数据目录没有 `wa_lastProjectId.json` 或 `wa_project_*.json`，因此本轮没有伪造项目来扩展“关闭重启恢复”结论。
- `npm run build:vue` 新鲜成功：`176 modules transformed`，`built in 1.47s`；仍有 Vite native config、`INEFFECTIVE_DYNAMIC_IMPORT` 和 chunk 超过 500 kB 警告。
- `npm run type-check` 新鲜失败：包含 `window.electronAPI` 全局声明缺失、Vue/JS 模块声明、store/组件接口漂移等既有问题。
- `node --experimental-strip-types --test src/services/aiService.spec.ts` 新鲜失败：Node 原生 ESM 无扩展名导入 `src/services/providerAdapter`，报 `ERR_MODULE_NOT_FOUND`；不能把该 runner 当作可用回归门。

### 本轮结论

- 原生 IPC 文件写入/读取：核销通过（应用侧桥接层与主进程处理真实可用）。
- 安装版客户原生文件选择器完整路径、真实项目关闭重启恢复：仍未核销；没有项目数据和客户样本时不制造证据。
- 构建：通过但有已知非阻断警告。
- 类型检查、AIService 自动化 runner：未通过，需独立治理。
- 直接 `fetch` 仍存在于 `src/main.ts`、`src/components/common/PluginMarket.vue`、`src/stores/mcp.ts`，分别属于模型获取、插件市场和 MCP；它们不能被误报为生成主链路已统一，也不能在没有 purpose/adapter 设计前批量删除。
- `src/services/pipeline-manager.js` 仍被历史文档和旧审计脚本引用，继续作为历史兼容基准保留；V2-P7 生产 Vue3 范围为 `PASS`。

### 临时产物

- `_audit/tmp_native_roundtrip.cjs` 已在验证命令结束后删除。
- 未新增截图、客户项目、持久化测试键或中间文件。

## 2026-08-26 续验：V2-P7 与 AI 入口边界定界

- `src/services/pipeline-manager.js` 的引用闭包已重新核对：当前 Vue3 `src/` 生产入口无引用；命中仅来自历史文档和 `tests/scripts/audit_ui.js` 的旧架构审计路径。
- 因此不删除、不批量替换该文件；它作为历史行为基准隔离保留。当前 Vue3 生产组件颜色 token 清理核销为 PASS，不能把历史基准文件的字符串扫描结果混同为运行时 UI 缺陷。
- AI 请求边界重新分类：生成/验证/聊天/编辑器主链路统一进入 `getAiService().callAi`；模型列表使用 `getAiService().fetchModels`。`main.ts` 的直接 `fetch` 仅为浏览器兜底 shim，插件市场是 GitHub API，MCP 是工具协议调用，均不属于生成 AI 调用，暂不批量迁移。

## 2026-08-26 续验：构建、类型与测试载体

- `npm run build:vue`：exit `0`，`176 modules transformed`，`built in 1.60s`。保留 Vite native config、`INEFFECTIVE_DYNAMIC_IMPORT` 与 chunk 大于 500 kB 警告。
- `npm run type-check`：exit `1`。主要类别为 `window.electronAPI` 声明缺失、Vue/JS 模块声明缺失、store/组件接口漂移、若干隐式 `any` 与 `memoryMerger.ts` 类型错误；这不是本轮 V2-P7 的颜色改动引入证据，单独列为类型治理遗留。
- `node --experimental-strip-types --test src/services/aiService.spec.ts`：exit `1`，原生 ESM 无法解析项目无扩展名导入 `src/services/providerAdapter`；测试载体不适合直接运行当前 Vite 模块规范，不能据此判定 AI 业务断言失败。
- 结论：构建门 PASS；类型门与当前测试 runner 未通过，均保持未核销，不修改生产导入规范来迁就 Node runner。

## 2026-08-26 续验：临时产物与安装版深度边界

- 定点清理：删除 `_audit/tmp_setting_audit.png`、`_audit/cdp_step8_final.cjs`、`_audit/del.cjs`，并删除空目录 `_audit/tmp`；复核无 `tmp*`、`cdp_*`、`del.*` 残留。
- 安装版资产存在：`dist/神意助手-Setup-3.2.1.exe` 与 `dist/win-unpacked/神意助手.exe` 均存在。
- 本轮尝试使用安装版启动并连接 CDP `9228`，未建立监听，进程未保持存活；因此本轮没有把安装版启动或原生文件选择器路径标记为 PASS。
- 数据目录存在历史导出、聊天和章节文件，但未发现标准 `wa_project_*.json` 项目快照；不能用这些文件伪造“关闭重启项目恢复”证据。
- 结论：临时产物清理 PASS；安装版深度导入/导出与重启恢复仍未核销，需在可保持运行的安装版启动载体和真实项目样本下继续。
