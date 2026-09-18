# 2026-09-12 产物有效性与状态一致性修复

## 项目功能

应用新增统一“产物有效性”判定层，并贯通 provider 归一化、folder 执行器、运行记录、流水线 UI 与技能测试的状态链。核心能力：

1. `generationValidity.ts` 将模型输出分为 `usable / truncated / reasoning_exhausted / empty / canceled / error`，不再把“请求没有抛异常”当作“产物有效”。
2. `providerAdapter.ts` / `aiService.ts` 修正 `finish_reason` 归一化与 reasoning 传递，空正文不再把 reasoning 复制成正文，也不再被短路成 `stop`。
3. `realSkillExecutor.ts` 在 postProcess 前执行有效性门：空正文/思考耗尽触发一次直出模式重试；截断正文触发续写合并；失败路径返回完整 `folderPackageCache/postProcessReport/apiMeta`。
4. `runTrace.ts` 的 run 与 API 状态扩展 `degraded`，终态按 failed 优先、降级次之、全 success 才是 success 归并。
5. `PipelinePanel.vue` 的 folder 状态映射、进度 UI、catch 分支诊断落 trace；`useSkillTest.ts`、`useDeAi.ts`、`folderSkillEval.ts` 不再固定写 success。
6. 修复 `sampleCount: 0` 被 `|| 3` 默认值吞掉的问题，显式禁用样本注入保持语义。

## 用途

- 模型把输出预算耗尽在 reasoning、正文 0 字时，应用不再把空产物继续传给 chain，也不再显示成功。
- SKILL 调试方可以从运行记录看到真实 `finishReason/usage/reasoning` 与失败诊断，而不是被折叠成 `success` 的假象。
- 截断正文可续写合并，思考耗尽可自动直出重试，用户在进度 UI 能看到“模型思考中，尚未输出正文”等阶段提示。
- 第三方 folder SKILL 出现 postProcess blocking issue、schema 失败或 API 失败时，导出的运行记录能还原完整失败现场。

## 根因

1. 旧链路缺少“产物有效性”这一层：`finish_reason=length`、`completion_tokens=16364`、正文 0 字的结果会进入 postProcess，无 schema 时 `valid=true`，最终 run 仍写 `success`。
2. folder 模板优先级旧实现要求 `resources.length > 0`，真实 folder 包无 resources 时会退回流水线 base template，并写入误导性 `base-template-applied`。
3. runTrace、PipelinePanel、技能测试、评测路径多处把非 failed 折叠成 success，`degraded` 只剩一行日志，无法进入状态模型。
4. 本轮 E2E 曾出现“源码已修复但 C/D 场景仍失败”：根因是源 Electron 未带 `--dev` 时加载 `dist-renderer` 生产包，修复后未先 `npm run build:vue`，测到旧 bundle；重建后 C/D 全部通过。

## 验证

- 定向单测：`npx vitest run src/services/generationValidity.spec.ts src/services/providerAdapter.spec.ts src/services/realSkillExecutor.spec.ts src/services/folderSkillEval.spec.ts src/stores/runTrace.spec.ts`，输出 `4 passed (4)`、`64 passed (64)`，exit 0。
- `npm run type-check`：通过，exit 0。
- `npm run build:vue`：通过，输出 `1632 modules transformed`。
- 真实源 Electron E2E：`node scripts/verify-product-validity-status-e2e.mjs`，场景 A（reasoning 耗尽）、B（思考后正文截断）、C（folder 无 resources 模板优先）、D（postProcess blocking）全部 PASS，最终输出 `===== PRODUCT VALIDITY AND STATUS E2E PASSED =====`。
- 排查用 37MB 请求体临时文件 `scripts/tmp-s2-request.txt` 已删除。

## 经验沉淀

已回写 `_audit/神意开发经验总结_v4.md`：生产 bundle 假验证、mock 请求字段错读、产物有效性门、degraded 状态归并、失败现场落 trace、显式零值禁用回退。
