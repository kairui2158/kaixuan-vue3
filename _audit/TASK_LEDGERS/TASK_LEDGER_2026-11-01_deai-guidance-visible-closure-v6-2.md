# TASK LEDGER — 降AI可视闭环 V6.2

日期：2026-11-01  
方案：[_audit/PROPOSAL_2026-11-01_BODY_DEAI_VISIBLE_CLOSURE_V6_2.md](_audit/PROPOSAL_2026-11-01_BODY_DEAI_VISIBLE_CLOSURE_V6_2.md)  
目标版本：3.110.14 → 3.110.15

## 1. 目标与原话

- 用户原话：三次正文层实测后，新版内嵌降AI在正文层没有可视情况；需要确认新内嵌降AI是否起作用，并给出成熟可执行方案。
- 用户裁决：三个决策点均按建议执行；每 SKILL 独立 + 链级 mixed 聚合；旧手册直接升级；agent 死接口只登记不混入本 diff。
- 最终可感知行为：正文层徽章和反馈面板在任何契约状态下都可见：app、skill 接管、off、mixed、unknown 五态不再空白；SKILL 接管显示“0注入”而不是图标消失。
- 交付物：投影纯函数、PipelinePanel UI 接线、五态 Electron 验证器、手册 v2、版本 3.110.15、DEV_LOG 与本台账。

## 2. 门禁读证

- G0.3 诚实闭环：无真实 Electron UI 证据前不得声称可视闭环；B6 教学有效性保持 provisional。
- G0.5 回头看：收尾前必须逐行 diff、旧语义反查、生产入口对账、验证器完整重跑。
- G0.10 新旧并存清零：`deaiGuidanceTraceForRun`、旧“一律以 deai-guidance-pack 为准”语义必须从执行层清零；历史文档只保留追溯语义。
- G0.11 真实交互冒充禁令：Electron 验证器必须真实点击正文页签；store 注入仅用于隔离外部依赖和准备 trace 数据。
- G0.12 台账七节：本文件为七节凭证，缺节不得进入完成声明。
- G1.5 验证器质量：五态必须独立 run 隔离；dist-renderer 新鲜度不满足时拒绝执行；finally 必须清理 Electron 与临时 profile。

## 3. 路由判定

加入：G0.3、G0.5、G0.10、G0.11、G0.12、G1.1、G1.5。  
排除：

- G0.2 无预算铁律：本轮用户未声明不设预算，按正常任务执行。
- 手动降AI改造门禁：本轮明确不改手动去AI味功能，因此不读取其专项历史。
- SKILL 模板治理：本轮不改 folder SKILL 模板内容；相关要求只写入手册。
- agent 死接口清理：方案裁决为独立后续项，不在本 diff 扩大爆炸半径。

## 4. 影响圈与作者反证

打算改：

- `src/services/deaiGuidanceDisplay.ts` / `.spec.ts`
- `src/components/pipeline/PipelinePanel.vue`
- `src/components/pipeline/__tests__/deai-injection-policy.spec.ts`
- `scripts/verify-deai-guidance-ui.mjs`
- `_audit/FOLDER_SKILL_DEAI_MENTOR_GUIDE_2026-11-01.md`
- `_audit/FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md`
- `package.json` / `package-lock.json`
- `_audit/DEV_LOG_2026-11-01_deai-guidance-visible-closure-v6-2.md`
- `_audit/DEV_LOG_MASTER_INDEX.md`

可能碰到：

- 正文层进度条反馈区域布局：徽章与反馈面板同处该区域，需保持不遮挡、不换行异常。
- run trace 事件过滤：只消费当前 displayed body run 的 `mode=body` trace。
- 手册读者（folder SKILL 作者）：语义必须从“单 pack 事件”迁移为“policy 判 owner + pack 判 app 注入量”。

最可能错假设与证伪：

- 假设 trace 的 `skillNames.length` 可靠。证伪结果：`startStepTrace` 会登记三个模板名，但验证器或特殊模式可能少于三；因此优先读事件内 `totalSkillCount`，缺失才回落 `skillNames.length`。
- 假设单 pipeline run 只有一条 trace。证伪结果：多 trace 是现实形态；本实现逐 trace 投影后按状态合并，冲突显示 mixed，不拼接事件。
- 假设 skill 级也可显示 mixed。证伪结果：类型模型只有四态；多 trace 冲突的技能级显示 unknown + `multi-trace-state-conflict` warning，链级仍为 mixed。

## 5. 停止条件

完成条件（机器可判定）：

1. 定向测试 4 个文件全部通过。
2. `npm run type-check` exit 0。
3. `npm run build:vue` exit 0。
4. `node scripts/verify-deai-guidance-ui.mjs` 五个 run 全部输出 PASS，且无相关 page/console error。
5. 执行层旧语义命中为 0：`deaiGuidanceTraceForRun` 只允许出现在历史台账/方案的追溯描述中，不允许出现在 `src/`、`scripts/`。
6. `package.json` 与 `package-lock.json` 均为 3.110.15。
7. 构建安装包成功且核验版本。
8. Git 提交包含本轮全部合法交付物。

失败条件：任一真实 Electron run 五态文案不符、console/page error 非空、类型或构建失败、旧执行语义残留、版本或提交缺失。

## 6. 执行证据

- 定向测试：`npx vitest run src/services/deaiGuidanceDisplay.spec.ts src/components/pipeline/__tests__/deai-injection-policy.spec.ts src/services/skillDeaiContract.spec.ts src/services/deaiChainVariantIntegration.spec.ts` → `Test Files 4 passed (4)`，`Tests 37 passed (37)`。
- 类型检查：`npm run type-check` → exit 0（修复导入名 `DeaiGuidanceOwnership` 与测试输入类型后）。
- 投影函数：`src/services/deaiGuidanceDisplay.ts:69` 为链级投影入口；skill 接管返回 0 注入，app 缺 pack 返回 unknown，off 独立四态。
- UI 接线：`src/components/pipeline/PipelinePanel.vue:590` 徽章五态常显；`src/components/pipeline/PipelinePanel.vue:611` 反馈面板按 S1/S2/S3 逐行显示；`src/components/pipeline/PipelinePanel.vue:1327` 起 trace 限定与投影。
- 预注入日志：`src/components/pipeline/PipelinePanel.vue:5839` 改为 `deai-injection-policy` 与 `deai-guidance-pack` 双事件对账。
- 验证器：`scripts/verify-deai-guidance-ui.mjs` 含 run A/B/C/D/E 隔离数据、真实点击正文页签、dist 新鲜度校验和 finally 清理。
- 手册：`_audit/FOLDER_SKILL_DEAI_MENTOR_GUIDE_2026-11-01.md:149` 第 10 节升级为双事件对账与每 SKILL 独立投影。
- agent 路径：`rg -n "callApiWithAgentVariant\(" src scripts electron` 仅命中定义 `src/components/pipeline/PipelinePanel.vue:3843`，无生产调用点；登记为独立后续清理项。
- 版本：`package.json:4` = 3.110.15；`npm install --package-lock-only --ignore-scripts` exit 0。

- 收尾补充：五态 Electron 验证首次执行暴露验证器两个问题：`seedGuidanceRun` 被 `page.evaluate` 隔离后不可见；连续 seed 未显式登记 trace ownership 且 run 未闭合，导致 displayed body run 停留在上一态。修复为序列化 seed 函数在页面执行、`rememberTraceRunOwnership` + `finishRun` + `finishGeneration` 完整闭合。产品断言未放宽。
- 五态真实 Electron：`node scripts/verify-deai-guidance-ui.mjs` → exit 0，输出 `[PASS] run A: 方法指导 16/3步 · 3210字符`、`[PASS] run B: SKILL 方法指导接管 · 0注入`、`[PASS] run C: 应用方法指导关闭`、`[PASS] run D: 未观测到方法指导契约`、`[PASS] run E: 方法指导混合 · 展开查看`、`[PASS] DEAI guidance per-skill ownership states render in real Electron UI`。
- 旧语义清零：`rg -n "deaiGuidanceTraceForRun|一律以 deai-guidance-pack 为准" src scripts electron` → 仅命中 `deai-injection-policy.spec.ts:150` 的负向断言 `not.toContain('deaiGuidanceTraceForRun')`，执行层无旧语义。
- 边界补漏：diff 审查发现 `mergeDeaiGuidanceDisplays([])` 会把无 trace 误判为 `mixed`。红绿验证：先新增两条测试（空输入、双 trace 冲突）确认失败，再把合并逻辑移入 `mergeDeaiChainGuidanceDisplays` 纯函数；空输入返回 unknown，多 trace 冲突链级 mixed、技能级 unknown + `multi-trace-state-conflict`。定向测试 35→37 全绿。
- 构建与安装包：`npm run build:vue` → exit 0；`npm run build` → exit 0，生成 `dist/神意助手-Setup-3.110.15.exe`，大小 231644738 bytes，`package.json` / `package-lock.json` 均为 3.110.15，`dist/win-unpacked/resources/app.asar` 内版本标记 3.110.15 命中。
- 全量回归：`npm run test:services` → exit 0，`Test Files 239 passed (239)`，`Tests 2552 passed (2552)`。

## 7. 缺口清单

- 已完成：`npm run build:vue`、五态 Electron 真实 UI 验证器完整重跑、3.110.15 安装包核验、全量回归、DEV_LOG_MASTER_INDEX 登记。
- 已完成：git 提交 `030049c4`（`feat(deai): render per-skill guidance ownership states`，18 files changed，1673 insertions，89 deletions）。
- 边界：B6 教学有效性保持 provisional；本轮不声明降AI质量效果；不修改手动降AI功能；`callApiWithAgentVariant` 死接口清理为后续项。
