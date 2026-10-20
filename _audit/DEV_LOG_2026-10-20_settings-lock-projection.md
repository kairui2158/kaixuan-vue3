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

## 过程事故

- 首页等待超时的根因是脚本读取了不存在的 `chat.messages` 字段；`useChatStore` 实际导出 `activeMessages`。修正断言并新增超时现场 dump 后复跑通过。事故已登记 `lessons/ERROR_LOG.md`。

## 诚实边界

- Electron 使用本地 OpenAI-compatible provider，不是外部 live 供应商矩阵。
- 问题一只完成“锁定状态单源化与四层投影”，不包含分层语义约束。
- 未升版、未打包；等待用户验收问题一。
