# 2026-09-11 chain 中间产物单一所有权修复

## 项目功能
生成流水线 / 大纲共创 / 主页编辑器共用的 SKILL chain 执行引擎。

## 用途
让串行 SKILL 在多步执行时，上一步输出只通过一个通道传给下一步：folder SKILL 走 user prompt 交接，文本 SKILL 优先走模板变量，否则走独立 context block。避免中间产物滚雪球式重复注入，降低长链耗时和模型注意力稀释。

## 改动
1. `src/services/chainExecution.ts`
   - 后续步骤 prompt 改为输出契约 + 归属声明，不再直接拼接上一步输出。
   - 新增 `detectChainOutputEcho()`：检测当前输出对上一步输入的大块复述，输出 `chain-output-echo` warning。
2. `src/services/workspaceSkillEngine.ts`
   - 每步计算 `templateOwnsPreviousOutput`，决定 user prompt / context block 归属。
   - step 0 的 `previousSkillOutput` 属性完全省略。
   - folder `folderInput` 使用链式 user prompt + 单次上一步输出。
   - 输出回显诊断写入该步 meta diagnostics。
3. `src/services/chainExecution.spec.ts`
   - 断言后续步骤保留原始请求与“只输出当前步骤定稿产物”契约，不包含上一步输出。
4. `src/components/pipeline/PipelinePanel.vue`
   - 复盘时发现生成流水线 chain 使用新契约但未显式声明交付通道，模板未引用 `{{previousOutput}}` 的文本 SKILL / folder SKILL 存在拿不到上一步输出的断链风险。
   - 按 SKILL 类型与模板引用情况选择 `template_variable` / `inline_block`：模板已引用则只通过模板变量交付；folder 由 folder 执行器交付；普通文本后续步骤在 user prompt 中恰好注入一次完整上一步输出。
   - folder 仍传入 `baseTemplateOverride=undefined`，避免流水线 base template 抢走 folder template 的执行权。
5. `scripts/verify-pipeline-chain-single-ownership.mjs`
   - 新增流水线真实 UI E2E：卷纲层配置 2 个文本 SKILL + chain，走真实大纲确认、风格分析、卷纲生成链路。
   - 断言总调用为 3 次（1 次大纲风格分析 + 2 次 chain SKILL），第一步不预载上一步输出，第二步完整包含且恰好 1 次。
   - 输出 `===== PIPELINE CHAIN SINGLE OWNERSHIP E2E PASSED =====`。
6. `src/services/workspaceSkillEngine.spec.ts`
   - mock folder loader / executor。
   - 新增 text 链路单一注入计数测试和 text → folder 交接测试。
7. 2026-09-12 补充：`scripts/verify-pipeline-folder-chain-single-ownership.mjs`
   - 新增 text → folder 混合链路的生成流水线真实 UI E2E。
   - E2E 发现 folder 步骤被误判为 `template_variable` 交付，但 folder executor 不解析流水线模板变量，导致上一步输出无法进入请求。
   - 修复为 folder 步骤强制 `inline_block`，上一步输出通过 user prompt 恰好注入一次；folder `template.md` 保持执行权，无 `base-template-applied` 诊断。

## 验证
- `npx vitest run src/services/workspaceSkillEngine.spec.ts src/services/chainExecution.spec.ts`：23/23 通过。
- `npx vitest run`：55 个测试文件、432 个测试全部通过。
- `npm run type-check`：exit 0。
- `npm run build:vue`：exit 0，主渲染与 protocols 构建均成功。
- `node scripts/verify-chain-single-ownership-e2e.mjs`：源 Electron + CDP + 真实 UI 验证通过。
  - 真实 UI 触发大纲共创串行两步 SKILL，发起 2 次 provider 调用。
  - 第一步请求不预载上一步输出。
  - 第二步请求完整包含上一步输出且恰好 1 次。
  - 运行记录存在，记录 2 个 API call、2 个 physical call。
  - 输出 `===== CHAIN SINGLE OWNERSHIP E2E PASSED =====`。
- `node scripts/verify-pipeline-chain-single-ownership.mjs`：生成流水线真实 UI E2E 通过。
  - 3 次 provider 调用 = 1 次大纲风格分析 + 2 次 chain SKILL。
  - 第一步请求不预载上一步输出。
  - 第二步请求完整包含上一步输出且恰好 1 次。
  - 输出 `===== PIPELINE CHAIN SINGLE OWNERSHIP E2E PASSED =====`。
- `node scripts/verify-pipeline-folder-chain-single-ownership.mjs`：生成流水线 folder chain 真实 UI E2E 通过。
  - 3 次 provider 调用 = 1 次大纲风格分析 + 1 次文本 SKILL + 1 次 folder SKILL。
  - folder 请求完整包含上一步输出且恰好 1 次。
  - folder 请求包含真实 `template.md` 内容，无 `base-template-applied` 诊断。
  - 输出 `===== PIPELINE FOLDER CHAIN SINGLE OWNERSHIP E2E PASSED =====`。

## 遗留
- 无。E2E 脚本本轮补齐了三类隔离：
  - 项目与上下文持久化（`wa_project_*`、`wa_ctx_*`）按测试前清理，避免历史对话污染请求。
  - mock SSE 使用应用实际解析格式（`data: {json}` + `data: [DONE]`），并支持 `stream: false`。
  - 断言改为检查完整上一步输出块，避免短锚点在上下文正文中误报。
  - 三个 chain E2E 脚本（folder 流水线 / 文本流水线 / 大纲工作台）共享 `_data` 存储，必须串行执行，并行会互相覆盖 `wa_skills` 制造假失败。
