# 开发日志：意图路由 V3 修复与真实 UI 验证（2026-09-10）

## 功能

意图路由 V3 修复了文本技能被误判为 folder 技能的问题，并补齐 fallback 气泡的一次性执行覆盖。

1. `workspaceSkillEngine.ts`：`isFolderTemplate()` 只认 `format === 'folder' && folderPath`；folder 路径失败时回退文本执行；新增 `routingOverride` 支持 `bypass` 与 `forcedIntent`。
2. `OutlineWorkspace.vue` 与 `ChatPanel.vue`：fallback 的“按推荐技能继续”“本次直接全链执行”按钮携带一次性路由覆盖，重发不再被同一路由器拦截。
3. `chat.ts`：`routingFallback` 记录 `recommendedSkillIds`，UI 可以明确展示推荐技能。
4. `workspaceSkillEngine.spec.ts`：新增 3 条回归测试，覆盖 folder 判据、forcedIntent 与 bypass。

## 用途

用户在大纲工作台或主页聊天里提出低置信请求时，应用不再误报“folder SKILL 配置不完整”；fallback 气泡提供可继续的路径，用户可以按推荐技能执行，也可以选择本次跳过意图路由直接全链执行。第三方 SKILL 不声明 intents 时也能得到基础保护，不会因为路由死循环看起来“按钮失效”。

## 真实 UI 验证

验证方式：源码 Electron 启动 + CDP 操作真实 UI，不使用网页模式、开发者模式或安装版。

```text
[PASS] outline workspace: three text skills selected (3/3)
[PASS] low-confidence input shows fallback bubble
[PASS] fallback records no-match routing ({"kind":"no_match","confidence":0,"reason":"no-keyword-overlap"})
[PASS] low-confidence fallback recommends discussion skill only (["codex-e2e-discuss"])
[PASS] fallback run does not call provider (2 rendered messages)
[PASS] full-chain bypass is available under advanced options
[DONE] intent routing V3 UI verification completed
```

验证前清空 `wa_project_deep-scan-race.outlineChat`，避免持久化历史触发 `await_user` 续答规则；低置信样例使用 `今天天气不错呀`，避开与 discuss 示例库语义相似的句子，防止真实 API 调用。

## 回归验证

```text
npx vitest run src/services/workspaceSkillEngine.spec.ts src/services/chainIntentRouter.spec.ts src/services/skillRouter.spec.ts
Test Files  3 passed (3)
Tests  25 passed (25)

npx vue-tsc --noEmit
exit 0

npm run build:vue
✓ built in 2.92s
✓ built in 34ms
```

## 数据清理

清理旧失败验证轮留下的测试数据：

1. `wa_skills`：删除 `codex-e2e-analyze`、`codex-e2e-generate`、`codex-e2e-discuss`，技能数量 22 -> 19。
2. `wa_pipeline_step_config`：第 0 层技能绑定清空测试残留。
3. `wa_pipeline_breakpoint`：通过 `storageRemove` 删除失败断点。
4. `wa_project_deep-scan-race`：`outlineChat` 清空，内存与持久化计数均为 0。

清理后复查：`wa_skills`、`wa_pipeline_step_config` 无 `codex-e2e` 字符串；断点文件不存在；项目文件无测试提示词、旧错误文本或 E2E 技能名残留。

## 临时文件清理

验证完成后删除：

- `scripts/verify-intent-routing-v3-ui.mjs`
- `scripts/inspect-outline-chat.mjs`
- `scripts/cleanup-intent-routing-test-residue.mjs`
- `scripts/check-intent-routing-residue.mjs`
