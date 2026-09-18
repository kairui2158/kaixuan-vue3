# 2026-09-10 Folder 协议成熟化第四阶段

## 开发功能

依据 `_audit/FOLDER_PROTOCOL_MATURITY_RESEARCH_2026-09-10.md` 执行第四阶段“with/baseline 评测闭环”，补齐第三方 folder SKILL 的可判定评测能力。

1. **evals.json 随包加载**：folder 包支持可选 `evals.json`；坏 JSON、非对象内容降级为 `evals-invalid` warning，不阻断导入；`evals.json` 加入 knownFiles，不会被资源扫描重复注入。`RealSkillPackage` 正式声明 `evals` 字段并贯穿 loader。
2. **评测服务**：新增 `folderSkillEval.ts`，定义 `shenyi.skill-evals/1` 评测协议；每个用例同时执行 with（folder 执行器链路）与 baseline（无技能基线）双路请求，本地断言打分，输出每用例 grading 与整体 benchmark（提升/持平/退化/无法判定）。支持 `min_length`、`max_length`、`contains`、`not_contains`、`json_valid`、`resource_referenced` 断言；单用例执行失败降级为 failed case，不中断整个 benchmark。
3. **设置页 UI 接入**：folder 技能测试弹窗新增“运行评测”按钮与评测报告区，展示 with/baseline 通过率、逐用例断言结果和双路输出；评测仅在用户点击按钮时触发，避免误耗 API 费用。
4. **运行记录接入**：运行记录新增“技能评测”来源；评测中的每次 API 调用通过代理 `callAi` 包裹，写入独立 API 记录与最终评测报告事件，第三方 SKILL 作者可以复现评测现场。
5. **元数据协议化**：`CallAiParams.meta` 新增 `caseId`，评测用例与 API 记录之间建立正式关联，不依赖隐式约定。

## 用途

第三方 folder SKILL 作者可以在技能包内附带可判定的评测用例；用户或制作者在设置页点击“运行评测”后，应用会对比“启用技能”和“无技能基线”的输出，直观看到该技能是否真实带来提升、在哪些断言上退化。评测过程进入运行记录，可按次导出给 SKILL 制作方，解决“技能改了但无法证明变好”的问题。

## 验证

```text
npx vitest run electron/ipc/skill-loader.spec.js
Test Files  1 passed (1)
Tests  9 passed (9)

npx vitest run src/services/folderSkillEval.spec.ts
Test Files  1 passed (1)
Tests  5 passed (5)

npm run test:services
Test Files  16 passed (16)
Tests  179 passed (179)

npm run type-check
vue-tsc --noEmit
exit 0

npm run build:vue
vite v5.4.19 building for production...
✓ built successfully

node scripts/verify-folder-skill-eval.mjs
[PASS] 源 Electron CDP 启动 | port=9242
[PASS] 评测报告显示 with 1/1 · baseline 0/1
[PASS] 断言结果展示
[PASS] 双路输出展示
[PASS] 运行记录出现技能评测来源
[PASS] 技能评测包含 2 条 API 调用记录
[VERDICT] PASS
```

验证方式遵守项目铁律：未使用网页测试、开发者模式或安装版；`verify-folder-skill-eval.mjs` 使用源 Electron 启动 + CDP + 本地 mock API，真实走设置页 UI、评测按钮、报告展示与运行记录面板。

## 遗留

无遗留。第四阶段闭环，Folder 协议成熟化研究方案四个阶段全部完成。评测默认不自动执行，只在用户明确点击“运行评测”时调用 API，避免产生额外费用。
