# TASK LEDGER: 创作风格档案结构化升级（V2 实施收口，3.92.0）

## 1. 目标与原话

- 用户原话：“你的升级方向在你的这版基础上还要继续优化，客户使用体验，UI的设计。”；“根据经验文件的教训，你这版的方案有没有遗漏？”；“你现在打消你偷懒和过度自信的盲点，用经验文件再来思考本次方案，不能留有任何盲区”；“你的3个待确认点 都需要再这个版本里解决，所以你要重新更新一个无遗留的是实施版本”。
- 最终可感知行为：客户可导入标准拆书档案，预览后应用为草稿，逐条启停并锁定；锁定后各层按预算消费结构化风格块；旧项目与旧锁定档案不发生静默变化。
- 交付物：`PROPOSAL_2026-10-16_STYLE_PROFILE_STRUCTURED_ARCHITECTURE.md` v2、Style Profile V2 实现、P0 预算账、Electron 验证、3.92.0 安装包与 DEV_LOG。
- 三个原待确认点的最终裁决：严格标准结构导入已实现；AI 分析同批升级且证据绑定字段禁改；P0 已先建六层 before/after 账本后再定预算。

## 2. 门禁读证

- G0.6 方案成熟度：经验文件“方案提交用户审核或执行前，必须分别评估执行器/工具层、应用方案/交互闭环、实现接线、验证标准四层”。
- G0.7 正反推研磨：目标倒推、爆炸半径、正反推已写入方案第 1、2、10、11 节。
- G0.9/G0.10：影响圈与新旧并存矩阵见方案第 2、10 节。
- G0.12：本台账即七节执行凭证。
- G1.5/v8.12：验证器断言与采集器同步升级契约，写入方案第 9、11 节。
- G1.8：trace 同步、schemaVersion、导出白名单，见方案第 9 节。
- G1.13：Electron 可见窗口、独立 profile、双隔离开关，见方案第 11 节。
- G1.17：作者反证、生命周期四行表、二次进入矩阵，见方案第 6、12 节。
- G1.19/G2.7：注入预算必须先建 before/after 长度账并计入上下文预算，见方案第 5 节。
- G2.8：导入写入经项目级写队列，见方案第 6 节。
- G2.9：终稿任务快照版本与 hash，见方案第 6 节。
- G2.13：SKILL 双态矩阵与模板变量空值契约，见方案第 8 节。

## 3. 路由判定

- 加入：G0.1、G0.3、G0.4、G0.5、G0.6、G0.7、G0.8、G0.9、G0.10、G0.11、G0.12、G1.1、G1.3、G1.4、G1.5、G1.6、G1.7、G1.8、G1.9、G1.11、G1.12、G1.13、G1.14、G1.15、G1.17、G1.19、G2.7、G2.8、G2.9、G2.13。
- 排除：G1.10 权限与安全门——本方案不触碰写入工具、意图路由或权限面；G2.1-G2.5——不触碰工具循环、直写协议、长文档重排；G2.6 编辑器——不改编辑器底座；G2.10 trace 回放——无客户故障需复刻；G2.11 供应商——不新增供应商协议；G2.12 窗口进程——不改主进程。

## 4. 影响圈与作者反证

- 打算改：`project.ts`、`StyleProfileCard.vue`、新 `styleBenchmarkImport.ts`、新 `styleContextCompiler.ts`、六层注入出口、trace schema、模板变量、相关测试与 Electron 验证脚本。
- 可能碰到：项目持久化与写队列、终稿任务快照、SKILL 模板上下文、运行记录导出、构建产物、封装核验。
- 最可能错误假设与证伪方式见方案第 12 节；无法证伪项已标 `untested`，禁止进入完成声明。

## 5. 停止条件

- 方案阶段停止条件：方案覆盖数据、导入、AI 分析、编译、持久化、UI、trace、SKILL、验证、收尾十面，三个原待确认点全部转为已裁决条款，且每个门禁路由都有对应设计；本文件与方案落盘。
- 实施阶段停止条件见方案第 13 节；禁止用“测试全绿”替代台账对账。

## 6. 执行证据

- 样品读取：`D:/codex/拆文库/踏星/.novel/benchmarks/踏星/文风.md`，8 个二级结构段全部读取，1368 字符样本导入成功。
- 现状证据：方案阶段的 `project.ts:118-170`、`StyleProfileCard.vue:12-110`、`PipelinePanel.vue:2387-2478`、`OutlineWorkspace.vue:1102-1106/1960-1969` 已升级为 V2 单源结构；六层旧手拼出口迁移到 `styleContextCompiler.ts`。
- 经验读证：`神意开发经验总结_v7.md` v8.12 已读取；本轮按 G0.6/G0.9/G0.10/G1.5/G1.8/G1.13/G1.17/G1.19/G2.7/G2.8/G2.9/G2.13 执行。
- P0 预算账：`STYLE_PROFILE_P0_BUDGET_ACCOUNT.json`，六层各 3 条样本；outline 232/600、settings 304/500、volume 219/600、chapter 379/800、body 767/1200、final-draft 767/1200，均 `truncated:false`；最终预算已回写方案第 5 节。
- P1 数据模型与持久化：`project.ts` 支持 `profileVersion:2`、`source:'benchmark-import'`、8 句式 / 4 场景 / 4 警戒线 / 5 日更规则，V1 归一化路径保留。
- P2 导入与 AI 分析：`styleBenchmarkImport.ts` 严格解析真实拆书档案；`styleAnalysis.ts` 仅允许填充 `positioning/styleTags/pacingParams/positiveRules`，`voice/sentencePatterns/sceneTemplates/dailyRules/prohibitions` 证据不足时不伪造。
- P3 编译与六层出口：`styleContextCompiler.ts` 单源编译，注入长度、裁剪、裁剪原因、sections 全量返回；大纲、设定、卷纲、章节、正文、终稿消费同一编译器。
- P4 trace：`style-profile` 事件记录 `profileVersion/target/injectedChars/truncated/truncationReason/sections`；请求级证据落在 `provider-requests.json`。
- P5 UI：StyleProfileCard 支持导入预览、应用、逐条启停、锁定、锁定态页签查看；双宿主 `outline/pipeline` 同源同步。
- P6 回头看与封装：发现并修复验证脚本重复 import、`truncated` 恰好等于预算时的假裁剪口径；3.92.0 完整 NSIS build 与真实启动核验通过。
- 验证命令与结果：定向 `npm run test:services -- src/services/styleContextCompiler.spec.ts src/services/styleAnalysis.spec.ts src/services/styleBenchmarkImport.spec.ts src/services/styleTemplateContext.spec.ts` → 4 files / 14 tests passed；全量 `npm run test:services` → 169 files / 1959 tests passed；`npm run type-check` → exit 0；`npm run build` → 通过，产出 3.92.0 安装包；`node scripts/verify-packaging-3-92-0.mjs` → `===== PACKAGING 3.92.0 VERIFICATION PASSED =====`，rendererFiles=74，electronAPI methods=77。
- Electron 证据：`verification-style-profile-electron/report.json`，V2 导入、`profileVersion:2`、结构化计数、AI 分析证据不足声明与越权字段忽略、锁定态导入/分析/启停禁用、页签可查看、大纲锁定注入 210 字符、请求级 provider prompt 均通过；历史失败现场归档于 `verification-style-profile-electron-archive/`。
- 收尾：版本 3.91.1 → 3.92.0；DEV_LOG 与主索引已登记；旧 3.91.1 安装包与 blockmap 清理，仅保留 3.92.0 产物。

## 7. 缺口清单

- 生成质量提升为 `untested`：本轮只证明结构化风格正确、有界、可审计地进入请求，不证明写作质量提升；后续需真实 live 对照与人工评分。
- 外部供应商 live 未覆盖：Electron 验证使用本地 OpenAI-compatible mock provider，覆盖 UI、导入、锁定、AI 分析边界与请求体，不覆盖外部供应商行为差异。
- 变体边界样本已覆盖基本负路径；导入解析器对更极端的拆书格式变体（半角标题、嵌套列表、混合表格）仍需在真实客户档案中持续采样。
- 本轮“失败时证据未落盘”问题由既有 G1.5 覆盖；不新增门禁，DEV_LOG 登记该裁决。
