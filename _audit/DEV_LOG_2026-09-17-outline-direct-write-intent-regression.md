# DEV LOG 2026-09-17 大纲直写意图回归修复

> 触发证据：`C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-outline-2026-09-17-020957-deep/run-trace.json`
> 基线版本：3.52.3
> 状态：源码修复完成，未封装

## 根因

1. 8 轮 trace 全部 `intent=discuss`，`resolveDialogueToolSurface()` 按权限矩阵剥掉全部写工具，模型收到 `editor.get_state/search/locate/reveal/read` 与 outline 只读工具，回答“没有写入权限”是真实工具面结果。
2. 显式写入规则未覆盖真实口语：“现在先把我们前面两轮讨论好的事情先输入进编辑器”、“先把确定的改完，改完以后再处理剩余的”。
3. 09-16 日志声明“统一语料集 + 准确率评估脚本已落地”，实际仓库没有独立语料集文件与评估脚本。这次补上语料集与评估函数，并把它接入双入口回归测试；这是流程造假式闭环的补账。

## 修复

1. 新增 `src/services/chainIntentCorpus.ts`：固定 2026-09-17 trace 语料 + 写入/只读扩展样本，提供 `evaluateIntentCorpus()`。
2. `chainIntentRouter.ts`：
   - 新增 `EXPLICIT_WRITE_ACTIONS` 单源动作词表，覆盖 `输入进/录入/填入/填进/更新到/同步到/落实到/改完` 等祈使写入。
   - 新增只读护栏并统一 `resolveReadonlyIntentReason()`：位置咨询、写入状态/权限问句、索取参考文案全部保持 discuss，且在写入判定前执行。
   - `classifyChainIntent()` 与 `routeChainIntent()` 复用同一只读/写入规则源，不再各自判断。
3. `plainDialogueIntent.spec.ts` 与 `chainIntentRouter.spec.ts` 直接消费单源语料集，断言生产入口 `classifyPlainDialogueIntent()` 与 `routeChainIntent()` 对写入样本一致给出 edit。

## 验证

1. `npx vitest run src/services/chainIntentRouter.spec.ts src/services/plainDialogueIntent.spec.ts`：14/14 通过。
2. `npm run type-check`：通过。
3. `npm run test:services`：71 文件 / 635 测试全部通过。
4. `dialogueFoundation.spec.ts` 已有断言：`edit` 工具面包含 `editor.write`，`discuss/analyze/auto` 不包含。本轮修复让真实口语正确进入 edit，权限矩阵与写工具面自然恢复。

## 遗留

1. 09-16 方案中“每意图阈值”未实现；当前用规则优先级 + 0.9/0.95 置信度。为避免虚假完成，明确记为未完成。
2. 未重新封装安装包。
