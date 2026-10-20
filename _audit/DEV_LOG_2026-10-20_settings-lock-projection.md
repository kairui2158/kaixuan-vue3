# 2026-10-20 设定卡片锁定状态单源化（问题一）

## 范围

- 新增 `src/services/settingsProjection.ts`：锁定状态判定、四层锁定投影、`settings-projection-composed` trace 事件。
- `src/stores/project.ts`：schemaVersion 3→4，旧 `isBound/boundTo/settingBindings` 语义迁移为 `status: draft | locked`。
- `src/components/pipeline/PipelinePanel.vue`：卷纲、章节、正文统一消费 `getLockedSettingsForLayer()`；删除 `getBoundSettingsText()` 重复真值。
- `src/components/chat/ChatPanel.vue`：首页对话注入同一锁定投影；模板上下文只使用 locked 人物。
- `src/services/chapterExecutionPackage.ts`、`src/services/volumeGeneration.ts`：删除 `[绑定设定]` 重复 prompt 通道。
- `src/components/common/OutlineWorkspace.vue`：设定拆解产物新建时使用 `status: draft`，不再制造旧 `isBound` 字段。

## 明确不动

- 卷纲 `isBound/boundTo` 保留，这是“卷纲绑定章节层”的业务语义，不是设定卡片锁定状态。
- 大纲工作台只读设定快照不改写。
- 问题二（分层语义约束）未开工，等待问题一验收后的承接判定。

## 验证

- `npm run test:services`：180 files / 2065 tests 全部通过。
- `npm run type-check`：通过。
- `npm run build:vue`：通过。
- 真实 Electron UI：`node scripts/verify-settings-lock-projection-electron.mjs` 通过，输出 `===== SETTINGS LOCK PROJECTION ELECTRON PASSED =====`。
- Electron 场景：schema 3→4 迁移；王芳旧 `isBound` 迁移为 locked，林舟保持 draft；真实点击单锁定、解锁、类目批量锁定；卷纲/章节/正文真实生成；首页真实发送。
- 投影断言：卷纲与章节各注入王芳、林舟 2 项 locked；正文与首页只注入王芳，林舟 draft 被排除；每层 trace 均有 `settings-projection-composed`。

## 证据

- 汇总报告：`_audit/verification-settings-lock-projection-electron/report.json`
- 分层请求与 trace：`volume-layer/`、`chapter-layer/`、`body-layer/`、`home-layer/`
- UI 截图：`ui-settings-after-migration.png`、`ui-linzhou-locked.png`、`ui-linzhou-unlocked.png`、`ui-category-batch-locked.png`、`ui-volume-generated.png`、`ui-chapters-generated.png`、`ui-body-generated.png`、`ui-home-projection.png`
- 心跳与运行日志：`heartbeat-copy.jsonl`、`electron-run.log`

## 2026-10-20 问题二终验补记

- 问题二联调首轮 Electron 在 body 层失败：`context-conflict-detected` 报 61 条冲突，其中 60 条来自“只有王芳知道它的用途”的物品卡，属于跨语义类目误配。
- 修复后终验通过：语义分类单源前置，实体冲突只看 `character`，世界冲突只看 `world`；最终 body trace 只保留 1 条真实人物冲突。
- 最终报告：`_audit/verification-settings-lock-projection-electron/report.json`，`generatedAt=2026-10-20T14:07:11.549Z`。
- 终验命令：`npx vitest run src/services/settingsLayerSemantics.spec.ts src/services/settingsProjection.spec.ts src/services/pipelineStyleArbiter.spec.ts src/services/pipelineStyleArbiter.wiring.spec.ts src/services/settingsCharacterContext.spec.ts src/services/contextConflictDetector.spec.ts src/services/styleContextCompiler.spec.ts`、`npm run type-check`、`npm run build:vue`、`node scripts/verify-settings-lock-projection-electron.mjs` 全部通过。
- 最终全量：`npm run test:services` → 185 files / 2091 tests passed；`npm run type-check` → exit 0。
- 收尾：三个边界项闭环（裁剪后统计口径、设定层生成风格单源、冲突检测 layer scope）；版本升级 3.101.0 并打包。

## 过程事故

- 首页等待超时的根因是脚本读取了不存在的 `chat.messages` 字段；`useChatStore` 实际导出 `activeMessages`。修正断言并新增超时现场 dump 后复跑通过。事故已登记 `lessons/ERROR_LOG.md`。

## 诚实边界

- Electron 使用本地 OpenAI-compatible provider，不是外部 live 供应商矩阵。
- 问题一只完成“锁定状态单源化与四层投影”，不包含分层语义约束。
- 经验文件无需升级：本轮教训已由 G1.5“验证器断言锚点必须跟随实现同批迁移”覆盖。
