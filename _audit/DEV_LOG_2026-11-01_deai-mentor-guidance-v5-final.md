# DEV_LOG_2026-11-01_deai-mentor-guidance-v5-final

## 目标

执行 `_audit/PROPOSAL_2026-11-01_DEAI_MENTOR_GUIDANCE_V5_FINAL.md`：把流水线内嵌降AI从“生成后改稿器”收口为“生成前方法指导者”，切断与手动去AI味的状态纠缠，并完成旧语义七层清零与 3.110.13 封装。

## 交付

1. Phase A：切断 `PipelinePanel` 对手动 DEAI store 的 4 读 1 写；`finalStepDetection` 正常终步教学反馈真实接线并区分 `kind=retry/teaching`；`BODY_LAYER_STEP=4` 单源化；设置页手动观测与 SKILL 终步声明双向隔离；voice profile 改为 run 级快照；新增确定性指导包构造器。
2. Phase B：指导包接入链式与 agent 双路径；`meta.deai` 契约升级 v2（`guidanceOwnership`、`overlaps`），v1 兼容读、未知字段 error、导入预检与运行时校验共用单源；keyword-lite 共享主题源；UI 徽章、教学反馈、HelpGuide 全部按 trace 实值显示。
3. Phase C：旧三段提示词、`legacy-auto/deep-fix` 流水线分支、`runBodyMinimalEdit` 与旧 prompt 专项规格退役；执行层、测试守护、文档、构建产物与安装包旧语义清零。
4. 版本升级 3.110.13，生成 `dist\神意助手-Setup-3.110.13.exe`。

## 验证

1. `npm run type-check` → exit 0。
2. `npm run test:services` → exit 0，`Test Files 238 passed (238)`，`Tests 2539 passed (2539)`。
3. `node scripts/verify-deai-guidance-ui.mjs` → PASS，真实 Electron UI 显示 `方法指导 6条 / 1180字符`，反馈面板为 `informational-only`。
4. `node scripts/verify-deai-settings-source-isolation-ui.mjs` → PASS，手动变更率可见、流水线质量门禁不可见、SKILL 终步声明可见。
5. `rg -a` 扫描 `app.asar` → 旧语义 0 命中。
6. `npm run build` → exit 0，安装包 231,646,326 字节。

## 执行事故与修正

1. `runTrace.ts` 曾误删 `deai-change-rate` 白名单；复核发现手动深修共用该事件后已恢复。
2. Phase0 守卫的 `activePipelineRunIds` 禁令误伤 A5 的多 run 快照集合；按“单一活跃 run 槽位”意图收窄到 `activePipelineRunIdForStep`。
3. 外部 folder SKILL S2 契约新增必填 `chapterIntent`，集成测试夹具漂移；补齐夹具，不改生产行为。

## 边界

1. B6 保持 `provisional`：教学有效性、效率劣化与合同失败率需要 20 章、2 题材、2 模型的有/无指导包配对样本，当前配对数据为 0，禁止宣称接管有效。
2. 手动去AI味功能本体不变；`legacy-auto/deep-fix` 只从流水线路径退场，手动入口保留。
3. 指导包只进 prompt，不改稿、不改终态、不触发重试；教学反馈不携带候选全文。
