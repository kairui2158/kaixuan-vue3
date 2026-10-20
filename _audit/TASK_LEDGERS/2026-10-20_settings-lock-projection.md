# 2026-10-20 设定卡片锁定状态单源化（问题一）

## 1. 目标与边界

- 目标：设定卡片状态收敛为 `draft | locked` 单源，四层消费面统一读取锁定投影。
- 范围：卷纲层、章节层、正文层、首页对话、SKILL 模板上下文。
- 不动：`vol.isBound/boundTo`（卷纲到章节的独立绑定语义）；流水线配置绑定（agents/skills/modes）；大纲工作台的只读设定快照。
- 隔离：问题二（分层语义约束）在问题一过验收并完成承接判定前禁止开工。

## 2. 证据基线

- `_audit/神意开发经验总结_v7.md`（内容 v8.16）：G0.12 台账、G1.15 四层递进、G1.17 作者反证、G2.9 配置入口不等于链路接入。
- `src/stores/project.ts:36`：当前 schemaVersion 3。
- `src/stores/project.ts:1426-1434`：归一化只补 `isBound/boundTo`。
- `src/components/pipeline/PipelinePanel.vue:904`：类目确认状态仅组件本地。
- `src/components/pipeline/PipelinePanel.vue:2543`：`getBoundSettingsText()` 另建绑定真值。
- `src/components/pipeline/PipelinePanel.vue:4189/4482/4679`：三层分别重复拼装设定上下文。
- `src/services/chapterExecutionPackage.ts:148`：正文执行包仍保留 `[绑定设定]` 重复通道。
- `src/components/chat/ChatPanel.vue:3243-3261`：首页对话读取 `isBound`。
- `src/components/pipeline/PipelinePanel.vue:2486-2496`：模板 `characters` 未过滤锁定状态。
- 起点：`git status --short` 无输出；HEAD `4ecfe341 3.100.0: close volume retry feedback loop`。

## 3. 执行清单

| # | 事项 | 状态 |
|---|---|---|
| 1 | 立账并复核锚点 | 完成 |
| 2 | 失败测试：投影服务、迁移、wiring | 完成 |
| 3 | schemaVersion 4 迁移与锁定 API | 完成 |
| 4 | 投影服务 `settingsProjection.ts` | 完成 |
| 5 | PipelinePanel UI 与三层消费改造 | 完成 |
| 6 | ChatPanel 与模板上下文改造 | 完成 |
| 7 | 删除 `[绑定设定]` 通道与 `getBoundSettingsText` | 完成 |
| 8 | trace `settings-projection-composed` | 完成 |
| 9 | 定向测试、全量回归、type-check、build | 完成 |
| 10 | Electron 真实 UI 验证 | 完成 |
| 11 | 回头看七面清理与 DEV_LOG | 完成 |
| 12 | 中间承接判定，向用户汇报 | 完成 |

## 4. 设计契约

- 状态：`status: 'draft' | 'locked'`，锁定时写 `lockedAt`。
- 迁移：`isBound === true` 或 `boundTo` 非空 → `locked`；否则 `draft`。
- 投影：`getLockedSettingsForLayer(layer)` 问题一阶段三层同一份 locked 投影；输出文本含分类、名称、属性；指标含 locked/draft 计数、字符数、FNV-1a hash。
- Trace：每次 prompt 组装记录 `settings-projection-composed`，暴露计数、字符数、hash。
- 反向约束：除迁移/兼容读取外，生成决策不得读取 `isBound/boundTo`。

## 5. 验证门

1. 单测：迁移、投影过滤、批量锁定、hash、trace 指标。
2. 集成：三层 prompt 各出现且仅出现一个设定区块。
3. wiring 反向断言：消费面调用投影服务；生成决策不再读取 `isBound`。
4. `npm run test:services`、`npm run type-check`、`npm run build:vue`。
5. Electron 真实 UI：真实点击锁定/解锁、批量锁定，检查状态与 trace。

## 6. 未验证面登记

- TDD 顺序偏差：曾先落 `settingsProjection.ts` 实现后补测试，已当场撤回；测试先红、实现后绿的顺序重新执行。
- Electron 验证使用本地 OpenAI-compatible provider，非外部 live 供应商矩阵；问题一的应用链路已验证，供应商差异保持 `untested`。
- 首页验证脚本曾误读 `chat.messages` 导致假超时；已改为 `chat.activeMessages` 并补 `home-diagnostics.json` 超时现场，事故已登记 `lessons/ERROR_LOG.md`。
- 问题二（分层语义约束）尚未开工，等待用户验收问题一后的承接判定。

## 7. 结论

- 问题一实现与验证完成：schema 3→4 迁移、锁定生命周期、卷纲/章节/正文/首页四处投影、旧重复通道删除、trace 指标全部通过。
- 验证结果：`npm run test:services` 180 files / 2065 tests passed；`npm run type-check` 通过；`npm run build:vue` 通过；`node scripts/verify-settings-lock-projection-electron.mjs` 输出 `===== SETTINGS LOCK PROJECTION ELECTRON PASSED =====`。
- 证据：`_audit/verification-settings-lock-projection-electron/report.json`、四个 layer 目录、七张 UI 截图、`heartbeat-copy.jsonl`、`electron-run.log`。
- 保留边界：卷纲 `isBound/boundTo` 语义未动；问题二未开工。
