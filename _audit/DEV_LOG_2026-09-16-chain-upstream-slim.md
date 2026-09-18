# 2026-09-16 卷纲 Chain 上游上下文契约改造

## 目标

- chain 中间步骤不再默认携带大纲全文，缓解 S2/S3/S4 输入滚雪球。
- S1/断点恢复步骤保持完整基础信息；S2+ 默认使用确定性结构地图。
- folder `meta.json` 可显式声明 `chainHandoff.requiresFullPreviousOutput` 申请全文。
- runTrace 同步记录每步上下文决策，满足 M8。

## 实现

- `volumeGeneration.ts`：新增 `buildVolumeOutlineScaffold`，仅保留结构标题，设定/绑定/卷数/字数不瘦身。
- `chainExecution.ts`：新增 `slimChainUpstreamPrompt`，输入决策确定性可测，返回 reason。
- `chainHandoff.ts`：保留 `requiresFullPreviousOutput` 作为全文申请字段。
- `PipelinePanel.vue`：
  - `hydrateFolderTemplates` 同步水合 folder `meta.json`；
  - chain 循环记录 `chain-context-slim` 事件；
  - `si === startSi` 为主消费者，断点恢复不回退成全文误判；
  - handoff artifact 使用水合后的 template meta。

## 验证

- `npx vitest run src/services/chainExecution.spec.ts src/services/chainHandoff.spec.ts src/services/volumeGeneration.spec.ts src/services/chainBreakpoint.spec.ts`
  - 4 files / 34 tests passed
- `npm run build:vue`
  - renderer build passed（现有 Vite 警告与本次无关）
- `npx tsc --noEmit`
  - 现有 `src/main.ts(3,17): Cannot find module './App.vue'` 报错为项目既有类型声明问题；`vue-tsc`/build 通过，未由本次修改引入。

## 回头看

- `buildChainSkillPrompt` 的另一个调用方 `workspaceSkillEngine.ts` 使用对话型请求，不含 `[大纲]` 块，瘦身函数不会误伤。
- 生成流水线四层中，只有 Step 2 prompt 由 `buildVolumePrompt` 构造出受控 `[大纲]` 块；Step 1/3/4 不含该块时返回 `outline_block_absent`，行为不变。
- 重试路径会重复调用 `runStepSkills`，但每次都会重新进入 chain 循环并重新生成 `generationPrompt`，决策幂等。
- `loadRealSkill` 60s TTL 内重复水合 meta 成本可忽略；`hydrateFolderTemplates` 不再因已有 template 而跳过 meta 水合。
