# TASK LEDGER 2026-11-15 正文层 LHC 反馈链路修复 V1

## 1. 目标与原话

- 用户原话：确认执行已批准方案；SKILL 四条应用侧残留全部属实，优先级 F1 -> F2 -> F3 -> F4。
- 最终可感知行为：正文层重试反馈兼容 LHC 信封，不再用 legacy 合同句误导模型，结构失败携带完整候选，上游骨架数据源正确。
- 本轮交付物：源码修复、同批测试迁移、经验补条、DEV_LOG、验证证据。

## 2. 门禁读证

- G0.6：方案四层成熟度，见 `_audit/PROPOSAL_2026-11-15_BODY_LHC_RETRY_FEEDBACK_V1.md` 第 5 节。
- G0.7：正反推已锚定真实 payload 与反馈路由，见方案第 5 节。
- G0.10：legacy 合同句需在源码、测试与执行路径清零。
- G0.12：本台账七节齐全；完成声明引用缺陷面枚举。
- G0.13：只修既有解析、合同句、接线与路由，不新增裁判/预算/UI。
- G1.31：12403/12000 按完整 request 字段口径定性为不动作项。
- G2.9：结构/格式/字数类失败必须携带完整候选；质量/风格类失败仍禁止候选全文。

## 3. 路由判定

- 加入：G0.6、G0.7、G0.10、G0.12、G0.13、G1.31、G2.9。
- 排除 G0.11：本轮目标是服务层反馈解析与合同句，不是 Electron UI 用户交互验收。
- 排除新增预算机制：无证据要求，且违反最小必要性。

## 4. 影响圈与作者反证

- 打算改：chainExecution 合同句、schemaRetryFeedback 解析与路由、PipelinePanel 上游数据源、四个测试、经验文件、DEV_LOG。
- 可能碰到：protectedSkillContract、bodyArtifactOrchestrator、realSkillExecutor 相关 fixture。
- 最可能错假设：F1 新合同句可能与 S1 legacy 骨架冲突。证伪方式：保护合同消费点与 S1/生成步上下文断言；确认现役函数只用于 body contract。

## 5. 停止条件

- 通过：定向测试与全量 `npm run test`、type-check、build 均 exit 0；legacy 句源码/测试/执行路径命中 0；新增信封正反断言通过；台账七节补齐。
- 失败：任一验证失败或发现语义冲突；登记偏差并修复后重验，不得宣称完成。

## 6. 执行证据

### 代码与测试

- F1：`src/services/chainExecution.ts:50-54` 合同句改为 LHC 信封口径；`src/services/protectedSkillContract.ts:55` 单源消费。
- F2/F4：`src/services/schemaRetryFeedback.ts` 信封解析、missingHandoff 提取面判定、结构/JSON pattern 前置 candidate-anchored 路由；模型可见 legacy 文案 7 处改信封口径。
- F3：`src/components/pipeline/PipelinePanel.vue` 上游接线改用 S1 骨架产物。
- 测试：`src/services/schemaRetryFeedback.spec.ts` 19/19 PASS；定向 5 files / 137 tests PASS。

### 命令证据

1. `npm run test:services -- --run src/services/schemaRetryFeedback.spec.ts src/services/chainExecution.spec.ts src/services/proseWordContract.spec.ts src/services/realS2ProtectedContract.integration.spec.ts src/services/realSkillExecutor.spec.ts`
   - 首跑 `1 failed | 136 passed`，暴露 `realSkillExecutor.spec.ts:1690` 仍锚定旧句。
   - 修正锚点后 `Test Files 5 passed (5)` / `Tests 137 passed (137)`。
2. `rg -n "正文本体后必须追加【正文交接】区块" _audit/FOLDER_SKILL_BODY_PROTECTED_CONTRACT_GUIDE_2026-10-30.md _audit/SKILL_HANDOFF_BODY_LAYER_FULL_PIPELINE_SPEC_2026-11-14.md src`
   - 生产 `src/` 命中仅负向守护断言；`_audit` 命中均已改为信封句或加退役标注。

### 文档与经验

- `_audit/SKILL_HANDOFF_BODY_LAYER_FULL_PIPELINE_SPEC_2026-11-14.md:72` 改现役信封句。
- `_audit/FOLDER_SKILL_BODY_PROTECTED_CONTRACT_GUIDE_2026-10-30.md:31` 加退役标注，保留历史语境。
- `_audit/神意开发经验总结_v9.md:617` G2.9 补 run 起点/生效快照与磁盘 mtime/构建时间对账规则。
- `_audit/DEV_LOG_2026-11-15_body-lhc-retry-feedback-v1.md` 新建；`_audit/DEV_LOG_MASTER_INDEX.md` 追加登记。

## 7. 缺口清单与缺陷面枚举

### 已修复缺陷面

1. 模型可见 legacy 合同句与 LHC 信封冲突。
2. word-gap 只拆 legacy 追加账本，信封候选账本提取为空。
3. `missingHandoff` 用字符串包含误判信封账本存在。
4. 上游 fallback 误用章节基础 prompt 而非 S1 骨架。
5. JSON/信封解析失败落入 bounded-summary，未携带完整候选。

### 本轮明确不动作

1. `12403/12000`：按 G1.31 定性为完整 request 总长与终步账本限，不是反馈合成限。
2. folder SKILL 模板/脚本：本轮不改。
3. 历史 trace payload：保留原始证据，不改写。

### 保留观测与后续验证

1. `requiresFullUpstreamContext` 当前为 false，接线能力已通，真实消费待 SKILL 声明后验证。
2. 全量服务测试、type-check、build、packaging 与真实供应商 smoke 在收尾阶段执行。
3. `deai-model-profile` 校准门禁和 reasoning-only 断流仍按既有观测项跟踪。

### 全量与封装证据

1. `npm run test:services` → `253 passed (253)` / `2774 passed (2774)`。
2. `npm run type-check` → exit 0。
3. `npm version patch --no-git-tag-version` → `v3.128.1`。
4. `npm run build` → exit 0，生成 `dist/神意助手-Setup-3.128.1.exe` 与同名 blockmap。
5. `npm run verify:packaging` → `PACKAGING 3.128.1 VERIFICATION PASSED`；installer SHA-256 `14200a14e50b6b9518b75edf9e382dae85668dc125cb6615913c85f6d5a2714d`。
6. `scripts/cleanup-old-release-artifacts.ps1` → 3.128.0 exe 与 blockmap 已删除；3.128.1 exe 与 blockmap 保留。
