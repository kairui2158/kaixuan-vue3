# 2026-09-18 全链路审计补修与回头看

## 任务

执行全应用调用路径审计后，修复审计发现的 P1/P2/P3 缺陷，并按 M17 回头看门禁复扫全部改动。

## 首轮修复

1. `useAiTools.callAi()` 技能链从“最后一个技能覆盖 system prompt”改为真实串行执行，每个技能独立产生一条 API trace；`callAi` 增加 `source/stepName` 可选参数供调用方声明 Trace 归属。
2. `useSkillTest` 的文本技能、folder 技能、智能体测试全部接入运行记录，folder 测试使用 traced `aiService` 包装，评测与测试同源。
3. `OutlineWorkspace.autoDecompose()` 增加聚合 run；设定拆解与伏笔提取两个子调用各自保留独立 API 记录，聚合终态按最差状态收口。
4. `PipelinePanel.analyzeOutline()` 与 `confirmBodyWithMemory()` 补齐大纲风格分析和记忆抽取 trace，此前这两次真实 API 调用不在运行记录内。
5. `namingService.repairNamingJson()` 收口到 `jsonExtraction.extractJsonArray()`，删除贪婪正则分叉。
6. folder 技能校验重试失败时写入 `skill-validation-retry` 诊断事件，包含 attempt 与错误信息。
7. `tool_converged_local` 本地拼接完成时触发 `onToolWarning` 终态事件，工具收敛不再缺最后一跳观测。
8. 清理本轮临时探针脚本 `tmp-compat-check.mts`、`tmp-parse-check.mjs`、`tmp-support-check.mts`。

## 回头看补修

复扫发现两个未被首轮测试覆盖的分支缺陷：

1. `confirmBodyWithMemory()` 在记忆抽取完成后如果项目已切换，直接 return，导致 memory run 永远停留在 running。现在写 `canceled` 终态、记录结构化失败日志并向用户提示结果已丢弃。
2. `analyzeOutline()` 在模型未返回 JSON 时使用原文截断兜底，但 run 终态仍标记 success。现在标记 `degraded` 并说明“未返回JSON，已使用原文截断兜底”，SKILL 调试方能看见降级原因。

其他复扫结论：`useSkillTest` 的 begin 前置失败路径由 finally 收口，不需要修改；`useAiTools` 技能链当前不传递前一步输出，每个技能消费同一 prompt，这是既有语义且无生产调用方传入多技能链，已在本文档登记为已知限制；记忆抽取前一次项目切换检查发生在 trace 创建之前，不会产生 running 残留。

## 验证

- `npm exec vitest run src/services/namingService.spec.ts src/services/workspaceSkillEngine.spec.ts src/composables/useAiCallTrace.spec.ts src/stores/runTrace.spec.ts --reporter=verbose`：4 files / 82 tests passed。
- `npm run type-check`：exit 0。
- `npm run verify:production-wiring`：267 modules / 883 dependencies，0 violations。
- `npm run test:services`：71 files / 664 tests passed。
- `npm run build:vue`：renderer 与 providerProtocols 双构建通过。
- 证据位置：`src/components/pipeline/PipelinePanel.vue`（memory canceled 分支、outline degraded 分支）、`src/composables/useAiTools.ts`（串行技能链）、`src/composables/useSkillTest.ts`（测试 trace）、`src/components/common/OutlineWorkspace.vue`（autoDecompose 聚合 trace）。

## 门禁对账

- M6：执行前已复读 `神意开发经验总结_v5.md` 的 M8/M13/M14/M17 相关章节。
- M8：本轮新增或修正的分支均进入 runTrace；memory canceled 另有结构化执行日志。
- M17：已完成目标对账、diff 自审、生产入口全量盘点（`useAiCallTrace` 与项目切换检查点全仓扫描）、测试证据复核与本日志回写。
- 未新增经验条款：本次问题均已被 M14（Trace 降级与终态）和 M17（回头看）覆盖，根因是测试未覆盖早退/兜底分支，不是规则缺失。
