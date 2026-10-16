# DEV LOG: 降AI分层注入修复

## 目标

正文层降AI提示词从固定方法论升级为按链路角色分派：S1 方法论、S2 创作精简、S3 打磨契约，并补齐 folder、非 folder、compose 与 trace 证据。

## 改动

- `src/services/de-ai.js`：新增 `DEAI_POLISH_PROMPT`；`resolveDeaiPromptForChainStep` 支持变长链，首步方法论、中间步创作精简、末步打磨契约，单步与缺省回落方法论。
- `src/components/pipeline/PipelinePanel.vue`：folder 与非 folder 双路径传链序；chain 主调用、echo 修复、full-retry 均注入分层提示词；每条物理调用写入 `deai-prompt-variant` 事件；compose 保持方法论并标注 `methodology-compose`。
- `src/services/configExchange/json.ts`：导入配置时把旧 `split-merge` / `multi-step` 归一为 `chain`，并写入 warning issue，旧引擎不再产生第四条隐藏路径。
- 测试：`de-ai.spec.ts` 补变长链分派；`configExchange.spec.ts` 补旧模式导入归一。

## 验证

- `npm run type-check`：通过。首跑曾发现 folder 布尔收窄导致 `template.skill` 可空，已还原原判断链修复。
- `npx vitest run src/services/skillRouter.spec.ts src/services/realSkillExecutor.spec.ts src/services/skillOrchestrator.spec.ts`：3 files / 62 tests passed。
- `npm run test:services`：169 files / 1961 tests passed。
- `node scripts/verify-pipeline-repair-feedback-electron.mjs`：真实 Electron UI + 外部 live provider 三场景通过，exit 0。
  - baseline：`run-1792153772566-1`，3 个 apiCall，S1/S2/S3 链路完成，正文 1760 字。
  - schema-retry：`run-1792154922088-545`，3 个 apiCall，真实 schema 失败后重试请求包含 `repair_marker` 缺失字段与类型反馈，正文 1952 字。
  - echo-repair：`run-1792155558461-886`，4 个 apiCall，回显修复只触发一次，正文 1936 字。
  - 证据：`_audit/verification-pipeline-repair-feedback-live/summary.json` 与 `live-export/{baseline,schema-retry,echo-repair}/run-trace.json`。
  - SKILL 均通过 UI 下拉真实选择，无注入冒充；live 凭据来自既有 replay profile。

## 诚实边界

- 上一轮 200 字“通过”是 `[NOT-READY]` 透传，不能算有效正文证据；本轮夹具改为 1200 字目标并产生 1760/1952/1936 字真实输出，才完成有效验证。
- 上一轮 schema 断言失败源于验证脚本选择器选错 API 调用，不是应用缺陷。脚本已改为通过 `folderDiagnostics` 的 `schema-validation-failed` 对位到目标 `skillId` 再选调用。
- `deai-prompt-variant` 已落到 apiCall 结构化字段，并由三场景断言事件与字段一致。
- live 验证覆盖当前一个供应商形态；其他供应商仍按既有矩阵分阶段补测。
