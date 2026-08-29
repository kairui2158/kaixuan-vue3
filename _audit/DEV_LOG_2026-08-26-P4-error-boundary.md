# P4 去 AI 味错误路径闭环（2026-08-26）

## 目标

处理去 AI 味流程中 API 失败被静默吞掉、界面显示完成或直接回退原文的问题。

## 根因

- `useDeAi.ts/processSplitMerge` 的分段 Promise 使用 `.catch(() => seg)`，单段请求失败会被伪装为成功结果。
- `crossModelCheck` 和 `zhuqueCheck` 捕获异常后直接返回输入文本，外层流程无法知道验证/检测未完成。
- `App.vue` 仅在 `isProcessing` 为真时挂载 `DeAiProgress`；失败后进度状态结束，错误信息即使写入 store 也无法呈现。
- `finishProcessing()` 会把步骤写成 `done`，失败处理若先记录再 finish 会覆盖失败状态。

## 最小修复

- 分段失败不再回退原文，错误向外抛出。
- 跨模型验证和 AI 检测验证失败抛出带中文上下文的错误。
- `deai` store 增加 `errorMessage`、`lastFailedStep`、`setError()`、`clearError()`；开始新处理时清空旧错误。
- 失败路径先结束忙碌状态，再记录失败步骤，避免被 `done` 覆盖。
- `DeAiProgress` 在错误态继续挂载，显示错误提示和失败步骤；按钮在错误态为“关闭”，不会再次发送取消事件。
- 步骤列表错误态优先于 100% 完成态。

## 验证证据

- `npm run test:services`：2 个测试文件、42/42 tests passed（20:38:09）。
- `npm run type-check`：exit 0（20:38:09）。
- `npm run build:vue`：176 modules transformed，构建成功；保留已知 dynamic import/chunk size 警告。
- `start-electron.bat` 启动后 CDP：页面标题 `神意助手`，URL `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`。
- 只读 DOM 核验：`deaiProgressVisible=false`、`deaiErrorVisible=false`、`activePanel=""`，与空闲态预期一致。

## 未核销边界

本轮没有真实供应商在途请求，也没有可用于可逆验证的客户项目快照，因此“真实网络断开/HTTP 错误触发错误框、错误后重试”仍为 `UNVERIFIED`。代码错误态、挂载条件和失败传播已核对；不能把空闲态核验扩大为供应商运行时通过。

## 清理

本轮临时探针 `_audit/tmp_p4_dom_probe.cjs` 在收尾时删除，并用文件存在性复核。
