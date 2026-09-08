# 正文层记忆双注入修复日志（2026-09-07）

## 任务目标

闭环 Folder SKILL 正文链路验证中发现的既有问题：正文层最终 user prompt 中 `[相关记忆]` 重复注入两次。

## 根因

记忆注入存在两处拼接责任：

1. `PipelinePanel.vue` 的 `runStepSkills()` 已通过 `appendMemoryPromptOnce(prompt, memoryContext)` 生成 `generationPrompt`，保证记忆最多一次。
2. `chainExecution.ts` 的 `buildChainSkillPrompt()` 在 `isFirst` 时仍执行 `initialPrompt + memoryPrompt`。chain 首步的 `initialPrompt` 正是已含记忆的 `generationPrompt`，因此首步被重复注入两次。

## 修复内容

- `chainExecution.ts`
  - 新增 `MEMORY_PROMPT_HEADER`、`formatMemoryPrompt()`、`appendMemoryPromptOnce()`，统一记忆块格式与单次追加语义。
  - `buildChainSkillPrompt()` 首步改为只透传 `initialPrompt`，不再拼接 `memoryPrompt`；后续步骤仍按“上一步完整输出 + 记忆块”组装。
- `PipelinePanel.vue`
  - `runStepSkills()` 统一使用 `formatMemoryPrompt()` 与 `appendMemoryPromptOnce()`，compose 与 chain 首步共用同一份已去重的 `generationPrompt`。
- 回归测试
  - `chainExecution.spec.ts` 覆盖记忆块格式、已有记忆不再追加、chain 首步不重复拼接。
  - `chapterExecutionPackage.spec.ts` 补齐既有快照夹具遗漏的 `prevChapterSummary: ""`，不改运行时行为。

## 验证矩阵

- `npx vitest run src/services/chainExecution.spec.ts src/services/chapterExecutionPackage.spec.ts`：2 个文件、9 个用例全部通过。
- `npm run test:services`：10 个文件、125 个用例全部通过。
- `npm run type-check`：通过。
- `npm run build:vue`：主构建与 providerProtocols 构建均通过。
- 源 Electron + mock 供应商探针 `verify_memory_dedup.cjs`：
  - chain 请求数 2，首步记忆 1 次，第二步记忆 1 次。
  - compose 请求数 1，记忆 1 次。
  - `chainFirstMemoryOnce`、`chainFirstMemoryPresent`、`chainSecondMemoryOnce`、`composeMemoryOnce`、`composeMemoryPresent`、`all` 全部为 true。
- 证据文件：`_audit/tmp/memory-dedup-evidence.json`，其中保留了两次 chain 请求与一次 compose 请求的完整最终消息。

## 沉淀

- 经验文件 v2 新增规则 85：上下文注入必须有单一所有权；chain 首步透传 `initialPrompt`，禁止再次拼接 `memoryPrompt`；验收必须统计 `[相关记忆]` 出现次数。

## 诚实边界

- 已完成源 Electron + mock 供应商的真实请求层验证。
- 未使用真实付费供应商做长文本正文实测；建议客户实操时观察正文生成的上下文稳定性与 token 消耗。
