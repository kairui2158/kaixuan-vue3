# AI 入口与错误路径回归边界

日期：2026-08-26

## 本轮证据

- `npm run build:vue`：`176 modules transformed`，`built in 1.01s`；构建成功，但保留 `INEFFECTIVE_DYNAMIC_IMPORT` 与 chunk 大于 500 kB 警告。
- 杀 Electron 后通过 `start-electron.bat` 重启，CDP 页面为 `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`，标题“神意助手”，`#btn-memory` 存在。
- `rg` 盘点显示生成/聊天/编辑器/流水线的主要 AI 调用均通过 `getAiService().callAi` 或其兼容壳；`src/services/aiService.ts` 集中处理流式、超时、重试、取消、JSON 解析重试、诊断日志。

## 未通过边界

- `src/main.ts`、`src/components/common/PluginMarket.vue`、`src/stores/mcp.ts` 仍存在直接 `fetch`，分别属于模型列表/插件市场/MCP 工具调用，尚未统一到 AIService purpose 路由。
- `src/components/pipeline/PipelinePanel.vue` 仍保留 `callApiWithAgent` / `callApiWithAgentTimeout` 兼容壳名称；当前实现内部委托 `aiService.callAi`，但名称不能作为“旧入口已删除”的证据。
- `node --experimental-strip-types --test src/services/aiService.spec.ts` 当前不能执行：Node 原生 ESM 解析无扩展名 import，报 `ERR_MODULE_NOT_FOUND ... providerAdapter`。这不是业务回归通过证据，测试脚本工具链仍需修复或换用项目可用 runner。

## 结论

AI 主业务路径已具备统一服务层接入证据，但“所有 AI/相关请求唯一 HTTP 入口”和自动化测试运行器仍为遗留项，暂不标记 PASS。
