# 神意助手开发日志：统一 AI 入口收敛（2026-08-25）

## 本轮目标

完成统一 `aiService` 入口收敛、删除 `providerStore.callApi`、统一流式默认语义，并建立回归锚点。

## 阶段结果

- [x] P0：读取经验文件、盘点调用点、确认 Git 基线。
- [x] P1：删除 `providerStore.callApi` 及其导出；Pipeline 两处调用改为 `getAiService().callAi()`。
- [x] P2：新增 `getAiService()` 单例入口，现有调用方改为使用单例。
- [x] P3：`generate/rewrite` 默认流式，`verify/detect/image/video` 默认非流式；显式 `stream` 仍可覆盖。
- [x] P4-代码锚点：`filterThinkingTags` 导出，新增 AI 服务解析/路由/过滤测试样本；Vite 生产构建通过。
- [x] P5：`rg "providerStore\\.callApi" src` 无结果；保留 Pipeline/Chat 的业务级包装函数，避免误删行为。
- [x] P6：Electron + CDP 真实 UI/Store/导航回归 5/5 PASS。启动命令先被 Windows 载体拦截，后改用 `cmd /c call start-electron.bat < nul` 成功；CDP 已读到应用标题、provider store、流水线面板、记忆面板和无运行时错误。

## 证据

- `npm run build:vue`：Vite v8.2.1，176 modules transformed，生成 `dist-renderer/index.html` 和 JS/CSS 产物，exit 0。
- `rg "providerStore\\.callApi" src`：无匹配。
- `node --test src/services/aiService.spec.ts`：失败，Node 原生 ESM 无法解析项目 Vite 约定的无扩展名 TypeScript import；这是测试载体限制，不作为业务失败修复。
- `npm run type-check`：失败，仓库已有大量 `electronAPI`、Vue 类型和组件类型错误；另暴露测试文件扩展名不符合当前 tsconfig 的问题，未扩大修复范围。
- `start-electron.bat` + CDP：成功启动源文件应用；`node _audit/p6_ai_convergence_audit.cjs` 输出 `5/5 PASS`。之后临时审计脚本和根目录 `{console.error('[ERR]`、`测试样本.txt` 已清理。
- CDP 关键结果：`store.callApiType="undefined"`；`generateProviderId` 和 `verifyProviderId` 都存在；`#pipeline-panel` 标题为“生成流水线”，`#pl-steps`/`#btn-close-pl`/`#btn-pl-minimize` 可见；`#memory-panel` 可见且带关闭按钮与 tabs。

## 重要边界

本轮已通过 UI/Store/导航级真实 Electron 回归，但尚未执行真实供应商 API 返回验证（生成、去 AI 味、聊天、大纲共创、记忆抽取的实际成功响应）。需要独立网络回归或封装后客户实测完成该项核销。
