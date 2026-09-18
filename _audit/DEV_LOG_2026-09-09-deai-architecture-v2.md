# 2026-09-09 降AI硬规则架构V2

## 项目功能与用途

把正文降AI从“字符级自动替换”升级为“检测报告 + 保护片段 + 模型最小编辑 + 硬指标门禁”。目标是让应用默认不静默改写正文：先给用户和 SKILL 调试方一份可解释的风险报告，需要修复时再走受控的最小编辑链路，失败或门禁不过则保留原文。

## 交付内容

1. **三种硬规则模式**
   - `detect-report`：默认模式。`detectBody()` 只检测，不改写正文，输出 blocking / advisory 分级报告。
   - `deep-fix`：检测后调用模型做最小编辑，输入原文、检测报告和必须保留的保护片段；输出必须通过保护片段回对和完整性门禁，失败回滚原文。
   - `legacy-auto`：兼容模式。走 `processBody()` 白名单安全替换，不再使用会重组段落和句子的旧 `process()`。

2. **检测器与指标**
   - `src/services/de-ai.js` 新增 `detectBody()`、`extractProtectedSpans()`、`verifyProtectedSpans()`、`getMinimalEditPrompt()`、`getDetectThresholds()`。
   - 检测覆盖 AI 高频词、禁用词、禁用句式、破碎标点、句长趋同、连接词密度、保护片段回对；阈值集中在 `DEAI_DETECT_THRESHOLDS`。
   - `DEAI_MINIMAL_EDIT_PROMPT` 明确“最小修补、禁止整段重写、禁止回译、禁止新增事实”。

3. **流水线正文层**
   - `PipelinePanel.vue` 的 `genBody()` 生成后按模式分流：检测模式不改写正文；深度修复走 `runBodyMinimalEdit()`；兼容模式走安全替换。
   - 检测报告写入运行记录 `deai-detect` 事件，深度修复写入 `deai-minimal-edit` 事件，第三方 SKILL 调试可以复现完整现场。

4. **主页编辑器**
   - `useDeAi.ts` 三种处理模式统一按 `hardRuleMode` 分流；深度修复失败或门禁不过时保留原文。
   - `EditorPanel.vue` 在非兼容模式显示“查看报告”入口，报告按需处理 / 建议两组展示。

5. **设置页**
   - `DeAiSettings.vue` 新增三模式选择、最近检测报告展示；配置持久化并全局联动流水线与主页编辑器。
   - 旧配置缺失 `hardRuleMode` 时自动升级为 `detect-report`。

## 验证

- 单元测试：`node scripts/tests/deai-v2.test.mjs` → `9 tests passed`。
- 源 Electron + CDP 探针：16/16 步通过，`runtimeErrors: []`，现场恢复 `restored: true`，无残留键；覆盖设置页三模式持久化、主页检测不改写、报告弹窗、深度修复最小编辑请求、门禁回滚、兼容模式安全替换、流水线正文生成、运行记录 `deai-detect` 事件、运行记录面板打开。
- 类型与构建：`npm run type-check`、`npm run build:vue` 通过。

## 边界

- 本次只改降AI链路与对应 UI；folder skill、agent、provider、runTrace 主链路未重构。
- 深度修复是模型辅助路径，不等同于自动重写；所有失败路径最终都保留原始正文。
- 客户实测重点：三种模式切换、正文生成后的运行记录事件、主页“查看报告”、深度修复在真实供应商上的耗时与回滚表现。
