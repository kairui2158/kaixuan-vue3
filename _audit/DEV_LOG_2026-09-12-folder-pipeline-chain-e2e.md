# 2026-09-12 生成流水线 folder chain 单一所有权 E2E

## 项目功能

生成流水线 chain 中 text SKILL 与 folder SKILL 的混合串行执行链路。

## 用途

用真实源 Electron + CDP + 本地 SSE mock 验证生成流水线 folder chain：上一步输出必须完整进入 folder 步骤，且全程只注入一次；同时确认 folder `template.md` 拥有执行权，不被流水线 base template 静默接管。

## 改动

1. 新增 `scripts/verify-pipeline-folder-chain-single-ownership.mjs`
   - 构造混合链路：`pipeline-folder-s1`（text）→ `folder:pipeline-folder-s2`（folder，真实磁盘文件夹含 `SKILL.md` + `template.md`）。
   - folder 技能源放置在 E2E 专用 profile 目录 `_data/pipeline-folder-chain-ownership-e2e-profile/skills/`，不污染用户技能库。
   - 断言总 provider 调用为 3 次：1 次大纲风格分析 + 1 次文本 SKILL + 1 次 folder SKILL。
   - 断言 folder 请求恰好 1 次完整包含上一步输出。
   - 断言 folder 请求包含 `template.md` 的真实内容，并且没有 `base-template-applied` 诊断。
2. `src/components/pipeline/PipelinePanel.vue`
   - E2E 发现真实缺陷：folder 步骤原逻辑把 `templateOwnsPreviousOutput` 判为 true，走 `template_variable` 交付，但 folder executor 不解析流水线模板变量，导致上一步输出无法进入 folder 请求。
   - 修复为 folder 步骤强制走 `inline_block`，上一步输出通过 user prompt 恰好注入一次。
   - `baseTemplateOverride` 继续保持 `undefined`，避免流水线 base template 抢走 folder template 的执行权。

## 验证

- `node scripts/verify-pipeline-folder-chain-single-ownership.mjs`：通过，输出 `===== PIPELINE FOLDER CHAIN SINGLE OWNERSHIP E2E PASSED =====`。
- `node scripts/verify-pipeline-chain-single-ownership.mjs`：文本流水线回归通过。
- `node scripts/verify-chain-single-ownership-e2e.mjs`：大纲工作台回归通过。
- E2E 必须串行执行。三个验证脚本共享 `_data` 存储，并行会互相覆盖 `wa_skills` 并制造假失败。
- `npx vitest run src/services/workspaceSkillEngine.spec.ts src/services/chainExecution.spec.ts`：23/23 通过。
- `npx vitest run`：55 个测试文件、432 个测试全部通过。
- `npm run type-check`：exit 0。

## 遗留

- 无。
