# TASK LEDGER — postProcess warnings 投影闭环 3.128.5

## 1. 目标与原话

用户转达正文层 SKILL 的两条应用侧残留：word-gap 长度失败应走 candidate-anchored，以及 S1 `hook-field-ignored: warnings` 需要应用 hook 适配。要求按经验文件执行到可交付并封装。经源码与规格核证，第一条不属实，不改路由；第二条属实并完成 SKILL warnings 从 postProcess 到 trace 的投影。

## 2. 门禁读证

- G0.3 诚实闭环：先答转达判定，不为取悦 SKILL 把历史裁定改成新路由。
- G0.13 最小必要性：只投影 SKILL 显式 warnings，不新增裁判、预算系统、调度器或 UI。
- G2.9 终稿与流水线：warning-only 降级不能静默，机器可读错误/警告必须进入 trace。
- G1.14 DEFECT-SWEEP：反查执行器、trace 存储、文本导出、工作台与流水线两个消费面。
- G1.21/G1.30：夹具过时单独登记，台账、日志、版本、封装、清理逐项回填。

## 3. 路由判定

加入：postProcess warnings 类型与归一化、trace 存储与 folder diagnostic 投影、文本导出、ChatPanel/OutlineWorkspace/PipelinePanel 透传、负向回归测试、版本封装与旧产物清理。

排除：word-gap 改为 candidate-anchored。`schemaRetryFeedback.ts` 中结构/格式失败（含信封+混合字数错）已前置 candidate-anchored；纯字数失败才进入 word-gap；`SKILL_HANDOFF_BODY_LAYER_FULL_PIPELINE_SPEC_2026-11-14.md:91` 与经验 G2.9 均钉死 word-gap 不携带候选全文。SKILL 将“长度失败”误并成“结构失败”，是对策略表的误读，不改实现。

## 4. 影响圈与作者反证

影响圈：`realSkillTypes.ts`、`realSkillExecutor.ts`、`runTrace.ts`、`runTraceExportService.ts`、`ChatPanel.vue`、`OutlineWorkspace.vue`、`PipelinePanel.vue`、相关 spec、S2 集成夹具、版本与清理脚本。

作者反证：

1. “warnings 会改变执行终态”不成立：类型为 advisory string[]，缺失或非法项归一化为空，合法 warnings 不触发 post-process warning 降级。
2. “word-gap 丢候选全文”不成立：纯字数路径本来就按规格不带全文，只带有界骨架；结构/格式混合失败已在 candidate-anchored 分支携带完整候选。
3. “PipelinePanel 无需透传”不成立：folder diagnostic 输入已支持 postProcessReport，但两个 append 点只展开顶层字段，历史缺陷会继续丢失 warnings。

## 5. 停止条件

完成：warnings 投影全链通过；word-gap 保持现行合同；定向/全量测试、type-check、build、封装与 packaging 验证通过；旧安装包和避锁目录清理完成；台账与日志登记。

失败或回滚条件：warnings 被当成 blocking 裁决、word-gap 语义被改写、trace 泄漏全文、全量测试出现本任务回归、封装证据缺失或安装包哈希不一致。

## 6. 执行证据

1. 路由核证：`src/services/schemaRetryFeedback.ts:336-368` 结构/格式失败走 candidate-anchored 并携带完整候选；`:371-425` 纯字数失败走 word-gap；`:22-36` 定义结构/格式与纯字数判定；`:68-109` 从信封 `metadata.extractedMeta`、body 与原始候选解析骨架。
2. warnings 投影：`src/services/realSkillTypes.ts:75-76` 定义必填 `warnings: string[]`；`src/services/realSkillExecutor.ts:1402,1414-1419` 提取并归一化；`src/stores/runTrace.ts:617,709,993,2293` 存储与透传；`src/services/runTraceExportService.ts:210-212` 文本导出；`src/components/chat/ChatPanel.vue:2747`、`src/components/common/OutlineWorkspace.vue:5660`、`src/components/pipeline/PipelinePanel.vue:3467,3588` 消费/透传。
3. 定向测试：`npx vitest run src/services/realSkillExecutor.spec.ts src/services/runTraceExportService.spec.ts src/services/workspaceSkillEngine.spec.ts src/services/realS2ProtectedContract.integration.spec.ts` → 4 files / 136 tests PASS。新增合法 advisory warnings 保留用例、缺失/非法 warnings 归一化用例、text 导出投影用例。
4. 全量服务：`npm run test:services` → 252 passed / 1 failed。失败为 `de-ai-v2.spec.ts` 冷 JIT 性能预算 flake（321ms > 300ms）；单独重跑 14/14 PASS（241ms），判定非本任务回归。
5. 静态与构建：`npm run type-check` exit 0；`npm run build` PASS；`npx electron-builder --win` exit 0。
6. 封装：版本 3.128.5；`npm run verify:packaging` PASS；安装包 `dist/神意助手-Setup-3.128.5.exe`，231,670,931 bytes，SHA-256 `2103f4e3b59d923fdccfc718d2c95dea46a820e02037e25d20285466502660ba`；证据 `_audit/verification-packaging-3.128.5/packaging-evidence.json`；`electronApp.close` 15s 超时登记为既有观测项，不改判。
7. 清理：`scripts/cleanup-old-release-artifacts.ps1` 当前版本钉到 3.128.5 并运行，删除 3.128.4 安装包与 blockmap；通过路径安全脚本删除 `dist/win-unpacked-old-3.128.5` 与 `dist/win-unpacked-postdir-3.128.5`，临时清理脚本用后删除。dist 仅保留 3.128.5 安装包、blockmap、builder 元数据与 `win-unpacked`。

## 7. 缺口与 DEFECT-SWEEP

1. S2 集成夹具预存过时：对白排布应为“无出声”，场景分段应为“段1-段22”等。已对齐现役 S2 脚本，属损坏修复，不是本任务引入的语义改动。
2. `de-ai-v2.spec.ts` 性能预算存在冷启动 flake，已用单独重跑证明功能稳定；预算标定可另开观测项，不混入本任务。
3. word-gap 长文用户体验可继续讨论，但当前裁定的合同是“不携带候选全文”；若未来调整必须先改规格与经验门禁，再改实现。
4. DEFECT-SWEEP 已反查 ALLOWED_POST_FIELDS、processing report、folder diagnostic、文本导出、工作台与流水线消费面；除已修透传外未发现新增阻断缺陷。

[DEFECT-SWEEP] PASS：路由判定、warning 投影、测试、封装与清理闭环完成；遗留项均为观测/后续标定，不阻断交付。
