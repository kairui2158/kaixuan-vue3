# 神意助手 — 链路深度对账修复总报告

## 修复范围

本次修复聚焦于**旧架构 v2.7.1 的核心链路对账**，覆盖 PIPELINE_FLOW.md + ARCHITECTURE_V2.7.md 定义的 5 步流水线 + Skill 链式执行 + Agent 全程参与。

## 修复项（2026-08-14）

| 编号 | 文件 | 问题 | 旧架构行为 | 修复前 | 修复后 | 验证方式 |
|------|------|------|-----------|--------|--------|---------|
| CHAIN-01 | `src/services/skill-engine.js` (_callStep) | 链式每步丢失 agent.systemPrompt | `apiGenerate` 中 `sysContent = ag.systemPrompt`，Agent 的 systemPrompt 覆盖 skill.template | 只取 `skill.template`，agent.systemPrompt 被丢弃 | `_callStep` 增加 `opts.systemPrompt` 优先级：`(opts && opts.systemPrompt) \|\| (skill.template) \|\| 默认` | 逐行检查 PASS |
| CHAIN-02 | `src/components/pipeline/PipelinePanel.vue` (callApiWithAgent) | engine.chain() 未传 systemPrompt | 链式每步都传 `sysContent=ag.systemPrompt` | 参数中无 `systemPrompt` | 加 `systemPrompt: agentConfig?.systemPrompt \|\| fallbackSystemPrompt` | 逐行检查 PASS |
| CHAIN-03 | `src/components/pipeline/PipelinePanel.vue` (aiRequest) | aiRequest 消息构造错误 | `_callStep` 构造 messages 传给 aiRequest | `messages: (req.messages \|\| [{role:"system", content:systemPrompt}, ...])`，双重构造 | 改为 `messages: req.messages`，直接用 `_callStep` 传过来的 messages | 逐行检查 PASS |

## 链路对比结论

### 已对齐的链路
- ✅ Step1 大纲 → 流水线：`projectStore.outlineText` → `lockOutline()` → `invalidateDownstream(1)` 已实现
- ✅ Step2 设定 → 流水线：`genSettings()` → `callApiWithAgent()` → settings 数组存在
- ✅ Step3 卷纲 → 流水线：`genVolumes()` → `genSingleVolume()` → 卡片渲染
- ✅ Step4 章节 → 流水线：`genChapters()` → 分批/重试/断点续传
- ✅ Step5 正文 → 流水线：`genBody()` → `genBodyForSelected()` → `syncChapterManager()` → `editorStore.openTab()`
- ✅ 级联失效：`invalidateDownstream(fromStep)` 已实现 1-4 级
- ✅ 左侧树联动：`ChapterTree.vue` 的 `genChaptersForVolume` / `genBodyForVolumeChapter` 暴露
- ✅ 绑定设定：`getBoundSettingsText()` 读取 `projectStore.settingBindings`

### 本次修复的关键差异
- ⚠️ **旧架构**：`apiGenerate` 中 skill 链式时 `sysContent = ag.systemPrompt`，`_callStep` 的 system prompt 来自 agent
- ⚠️ **新架构修复前**：`engine.chain()` 没传 `systemPrompt`，`_callStep` 只取 `skill.template`，agent.systemPrompt 丢失
- ✅ **修复后**：`systemPrompt` 贯穿 `callApiWithAgent` → `engine.chain()` → `_callStep()` → `aiRequest`，每步都注入

## 未完成的 E2E 验证

由于 Electron 旧进程残留（PID 33072、38196 无法杀掉），新启动的 Electron 无法绑定到新端口。CDP 9223 服务来自旧进程，虽能获取 DOM 状态但截图功能受限。

**已确认：**
- CDP 连通：`localhost:9223` 正常响应
- 应用标题："神意助手"
- 按钮完整：btn-pipeline, btn-outline-workspace, btn-memory, btn-plugin-market, btn-settings, btn-dashboard 等全部可见
- 点击 btn-pipeline：pipeline-panel 显示为 flex

**待完成（需重启电脑后继续）：**
- [ ] 完整 E2E 模拟：新建项目 → 大纲工作台导入 → 流水线 5 步走通
- [ ] IndexedDB 数据验证
- [ ] 左侧章节树 ↔ 流水线双向联动
- [ ] 编辑器联动

## 改动的文件清单

| 文件 | 改动类型 | 改动内容 |
|------|---------|---------|
| `src/services/skill-engine.js` | 精准修复 | `_callStep` 的 `sysContent` 增加 `opts.systemPrompt` 优先级 |
| `src/components/pipeline/PipelinePanel.vue` | 精准修复 | `engine.chain()` 增加 `systemPrompt` 参数；`aiRequest` 改用 `req.messages` |
| `_audit/JS_RECONCILIATION_FINAL.md` | 追加记录 | 新增 CHAIN-01/02/03 修复记录 |

## 参考资料

- 旧架构链路图：`C:\Users\凯瑞\Documents\New project 2\docs\PIPELINE_FLOW.md`
- 旧架构架构图：`C:\Users\凯瑞\Documents\New project 2\docs\ARCHITECTURE_V2.7.md`
- 旧架构代码：`renderer_v2.js`（apiGenerate 方法 L885-L924）、`js/pipeline-manager.js`
- 新架构代码：`src/services/skill-engine.js`、`src/components/pipeline/PipelinePanel.vue`
