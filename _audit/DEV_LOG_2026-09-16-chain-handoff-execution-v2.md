# Chain Handoff 真执行 V2 开发日志

日期：2026-09-16

## 交付内容

本任务执行 [PROPOSAL_2026-09-16_CHAIN_HANDOFF_EXECUTION_V2.md](PROPOSAL_2026-09-16_CHAIN_HANDOFF_EXECUTION_V2.md)，把生成流水线 chain 模式的中间产物传递从“只记录 handoff，实际仍传全文”升级为按 SKILL 消费契约执行：

1. `src/services/chainHandoff.ts:135` 新增 `resolveChainPreviousOutput()`：默认全文；`full` / `requiresFullPreviousOutput` 全文；`structured` 只在全部 `requires` 命中且非空时生效；`excerpt` 仅显式声明时截取 2400 字。
2. `src/components/pipeline/PipelinePanel.vue:2779` chain 主链接入交付决策；`:2804` 记录 `chain-handoff-delivery`；`:2818` 记录 contract-miss；`:2897` 每步全文进入 `chain-handoff` processing report；`:2954` 非全文交付校验失败后升级全文重试一次。
3. `src/stores/runTrace.ts:269` 扩展 `RunTraceProcessingReport.processor`，允许 `chain-handoff`，全文经 Electron payload 机制外置并记录 sha256。
4. 断点语义保持不变：`chainBreakpoint.lastOutput` 仍保存全文，恢复后由下游 meta 重新决策，不自动全文。

## 质量与安全策略

- 未声明契约的 SKILL 与第三方 SKILL 拿全文，零默认截断。
- structured 提取只做确定性 JSON 顶层键与 Markdown 标题节匹配，不做语义猜测。
- contract-miss、空字段、非法 JSON、标题不匹配一律回退全文。
- 非全文交付后输出校验失败，自动升级全文重试一次；成功继续并降级，失败才终止。
- 全文始终存档到 runTrace payload，SKILL 调试方不丢证据。

## 验证

- `npx vitest run`：10 个测试文件、196 条测试通过，覆盖 chainHandoff 22 条专项、runTrace chain-handoff 3 条，以及 aiService、realSkillExecutor、generationValidity、chainExecution、chainBreakpoint、volumeGeneration 等回归。
- `node --check scripts/verify-chain-handoff-execution-v2.mjs`：语法检查通过。
- `node scripts/verify-chain-handoff-execution-v2.mjs`：真实 Electron E2E 通过，退出码 0。断言包含：6 次 API 调用；S2 默认收 S1 全文且仅一次；S3 structured 命中且不收 `unused` 字段；S3 非法输出触发 escalation，全文重试成功；S4 contract-miss 回退全文；trace 记录 `chain-handoff-delivery` / `chain-handoff-contract-miss` / `chain-handoff-escalation`；3 份 chain-handoff processing report 存全文。
- `npx vue-tsc --noEmit -p tsconfig.json`：通过，无输出错误。
- `npm run build:vue`：双构建通过，`vite build` 与 `vite build --config vite.protocols.config.mts` 均成功。

## 验证矩阵对账

- structured 命中、contract-miss 回退、escalation 全文重试、S2 默认全文、processing report 全文存档：E2E 覆盖。
- excerpt 显式声明、非法 `requires`、JSON 顶层非 object、Markdown 部分命中回退、text 模板变量全文、断点恢复后决策：单测覆盖，未单独做 E2E。原因：这些是 `resolveChainPreviousOutput()` 的纯函数边界，单测已覆盖同一入口；E2E 额外价值低。
- RunTracePanel / RunTraceDiff 可见性：E2E 已断言 processing report 存在；面板按 `report.processor / report.stage` 泛化展示，无 processor 特判分支。
- 质量对比门：本轮未做真实模型 A/B 对比。原因是 E2E 使用固定 mock 输出，无法产生可信质量结论；该门保持为“structured 不优于全文基线则不切换默认”，当前默认策略仍是全文，未违反方案约束。
- 回头看：`rg` 确认 `resolveChainPreviousOutput` 只接入 PipelinePanel chain 循环；`workspaceSkillEngine.ts` 对话链未接入；compose/parallel 无 previousOutput 交付问题，未改动。

## 执行中的真实失误

E2E 调试中有两次测试数据层面失误，已修正：

1. S2 mock 输出最初是 JSON 数组，不符合协议要求的 Markdown `## facts / ## constraints / ## unused`，导致 S3 structured 提取不命中；已改为协议格式。
2. `outputFormat: 'json'` 曾误加在 S2 上；folder 执行器实际只认 folder `schema.json`，已移到 S3，使 escalation 场景按预期触发。

这两个失误暴露了“测试数据必须与 SKILL 协议完全对齐”的坑，后续写 E2E mock 时应先核对 meta/schema 契约再造数据。

## 文档对账

- [SKILL_HANDOFF_VOLUME_PIPELINE_STATE.md](SKILL_HANDOFF_VOLUME_PIPELINE_STATE.md)：补充当前交付契约、structured 规则、失败升级和 trace 事件。
- [SKILL_HANDOFF_CHAIN_INTERMEDIATE_OUTPUT.md](SKILL_HANDOFF_CHAIN_INTERMEDIATE_OUTPUT.md)：重写为当前协议状态，面向 SKILL 制作方说明交付形态、输出铁律和调试证据。

## 后续边界

- 第一期只改生成流水线 chain 主链；`workspaceSkillEngine.ts` 对话链路接入同一决策器是二期候选。
- 本任务不封装安装包，版本保持 3.52.1。

## 2026-09-16 二次回头看补丁

用户确认继续执行后，对 V2 做了二次回头看，发现并修复 6 项遗漏：

1. `chainCtx` 原来从 `baseCtx` 继承并预写 `prevResponse`，上游全文可能绕过 handoff 决策；现初始化为空，仅在每步成功后写入当前步骤全文。
2. 断点恢复时删除 `resumePoint.resumed` 分支里的 `chainCtx.prevResponse = current` 预写，恢复步骤仍由交付契约决定实际输入。
3. text SKILL 的模板归属检测改用未解析的原始 `t.template`；此前用已解析模板检测，占位符被吞后会把“模板变量通道”误判成 inline 通道。
4. 每步统一注入 `previousOutput` / `previousSkillOutput` / `prevResponse` 三个等价别名，text SKILL 可任选变量名；升级全文重试时模板也用全文重新解析。
5. `RUN_TRACE_SCHEMA_VERSION` 升到 8，并新增旧 trace 兼容测试：未知事件类型 `chain-handoff-delivery` 和 processor `chain-handoff` 可读，导出 schemaVersion=8。
6. E2E 从 4 个 folder 技能链扩展为 6 步混合链：`S1(text) -> text structured -> text final -> folder S2 -> folder S3 -> folder S4`。新增断言：folder S2 只收紧邻上一步全文，不收 S1 和 text structured 输出，直接验证滚雪球阻断；text 变量别名只交付一次；5 份 handoff 全文存档。

执行中修正两处测试自身问题：mock 请求索引偏移一位；`previousOutput` 声明位置晚于使用导致 TypeScript 报错。

补丁后验证：

- `node scripts/verify-chain-handoff-execution-v2.mjs`：退出码 0，8 次 API 调用（1 分析 + 6 链步 + 1 升级重试），30 条 E2E 断言全部 PASS。
- `npx vitest run`：70 个测试文件、619 条测试全部通过。
- `npx vue-tsc --noEmit -p tsconfig.json`：退出码 0，无错误。

## 2026-09-16 三次回头看补丁

按 M17 再执行一轮回头看与反推，复核五个疑点后确认三个真实缺陷并修复：

1. **对话链 handoff 事件被吞**：`workspaceSkillEngine.ts` 每个完成步骤都会发 `chain_handoff` 事件，但主页 `ChatPanel.vue` 与大纲 `OutlineWorkspace.vue` 的 routing event 记录函数没有该分支，事件发出后不会进入 runTrace。两个入口均补充 `chain-handoff` trace 事件，重复 hash 使用 warn 级别，detail 保存完整 handoff artifact。
2. **对话链 delivery 标注失真**：对话链两条通道实际都传全文，但 artifact 曾按模板归属标成 `canonical_excerpt`。已统一改为 `full_text`，与实际执行一致；`workspaceSkillEngine.spec.ts` 新增断言，2 步链每步各发 1 条 handoff，且 delivery 全部为 `full_text`。
3. **流水线 handoff 决策缺 DiagLogger**：`PipelinePanel.vue` 只把 delivery / contract-miss / escalation 写入 runTrace，诊断日志面板看不到现场。新增 `logPipelineChainHandoff()`，三类事件同步写 `pipeline/chain-handoff` 分类日志；DiagLogger 缺失时静默跳过，不影响生成链路。

三次补丁验证：

- `npx vitest run src/services/workspaceSkillEngine.spec.ts src/stores/runTrace.spec.ts src/stores/runTrace.chainHandoff.spec.ts src/services/chainHandoff.spec.ts`：4 个文件、71 条测试通过。
- `npx vue-tsc --noEmit -p tsconfig.json`：退出码 0。
- `npx vitest run`：70 个文件、620 条测试全部通过。
- `node scripts/verify-chain-handoff-execution-v2.mjs`：30 条 E2E 断言全部 PASS，包含 8 次 API 调用、structured 命中、contract-miss 回退、escalation 全文重试与 5 份 handoff 全文存档。脚本退出码为 1 的唯一原因是 Windows 在 finally 清理临时 profile 时目录暂时被锁；业务断言全部通过后已人工复核并清理该临时目录。

边界保持不变：`workspaceSkillEngine` 对话链仍不接 `resolveChainPreviousOutput()` 交付决策器，维持全文传递；本补丁只修正观测与标注，不改变对话链交付行为。
