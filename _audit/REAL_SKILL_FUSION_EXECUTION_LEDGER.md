# 真 SKILL 双方案融合执行台账

> 计划：`_audit/REAL_SKILL_FUSION_EXECUTION_PLAN.md`  
> 开始时间：2026-09-07  
> 状态：执行中  
> 工作区基线快照：`_audit/tmp/real-skill-fusion-baseline-status.txt`

## Phase 0：基线与保护门

### F0.1 影响圈

关键调用点（本轮 `rg` 输出）：

| 调用点 | 位置 |
|--------|------|
| App 启动加载 skills | `src/App.vue:272` |
| 流水线 getSkill | `src/components/pipeline/PipelinePanel.vue:1435,1469,3057` |
| 流水线技能名展示 | `src/components/pipeline/PipelineFlow.vue:187` |
| 主页共创技能列表 | `src/components/chat/ChatPanel.vue:218-220` |
| 主页共创执行入口 | `src/components/chat/ChatPanel.vue:436,836-837` |
| 大纲工作台 getSkill | `src/components/common/OutlineWorkspace.vue:470` |
| AI 工具 getSkill | `src/composables/useAiTools.ts:58` |
| 配置导入导出 | `src/composables/useConfigExchange.ts:201,238,274` |
| Skill store | `src/stores/skill.ts:48,52,95,164,179` |
| Markdown 解析序列化 | `src/services/configExchange/markdown.ts:224,265` |
| 进度条 | `src/components/pipeline/PipelinePanel.vue:273,401,535,606,914` |

其他确认：

- `aiService.callAi` 已支持 `temperature/maxTokens/model`，无需修改 `aiService.ts`。
- `useDeAi.ts` 当前 `getAgentConfig` 已存在但未消费，`callAiApi` 未传 Agent 参数。
- `ChatPanel.vue` 共创链路由 `runWorkspaceSkills` 执行，folder 接入点应放在其 adapter 或模板来源层。
- `skill-loader.js`、`realSkillLoader.ts`、`realSkillExecutor.ts`、`skillRouter.ts`、`apiCallBudget.ts`、`skillOrchestrator.ts` 当前均不存在。

### F0.2 脏工作区保护

- 已保存 `git status --short` 快照。
- 只触碰计划步骤表内文件。
- 不回滚、不清理、不格式化任何历史改动。

### 验证记录

#### F0.3 测试夹具

- 已创建 8 组夹具：`_audit/tmp/real-skill-fixtures/`。
- 当轮证据：`Get-ChildItem -Recurse -File` 显示 28 个文件，全部 UTF-8 可解码、无 BOM。
- 覆盖：text 基线、minimal、full、broken-path、bad-script、multi-pass、retry、composite。
- 未触碰 `_data` 用户真实数据。

#### F0.4 验证基线

- `npm run type-check`：exit 0，`vue-tsc --noEmit` 无错误。
- `npm run build:vue`：exit 0，主构建 6.50s 完成，protocols 构建 122ms 完成。
- 构建警告为既有动态导入与 chunk 体积警告，已记录为基线状态，不纳入本次回归判定。

### Phase 0 结论

- [x] 影响圈清单完成。
- [x] 脏工作区快照完成。
- [x] 8 组夹具创建并验证可读。
- [x] type-check / build:vue 基线通过。
- [x] 未修改任何应用源码。

## Phase 1：文件协议与持久化底座

### 代码落地

- `electron/ipc/skill-loader.js`：SKILL 文件夹读取、列表、脚本沙箱执行。
- `electron/main.js`：仅新增 skill-loader 注册。
- `electron/preload.js`：暴露 `skillLoadFolder/skillListFolders/skillExecuteScript`。
- `src/stores/skill.ts`：新增 `format/folderPath` 持久化字段。
- `src/services/configExchange/`：JSON 与 Markdown 双向兼容新字段。
- `src/components/settings/SkillSettings.vue`：文件夹导入、路径状态、重新选择入口。

### 发现并修复的接线缺陷

根因：测试文件选择器返回 `SKILL.md` 文件路径，而 `skillLoadFolder()` 需要技能文件夹路径。首次 UI 导入因此显示“缺少 SKILL.md”，实际是把 `SKILL.md` 当成文件夹解析。

修复：`SkillSettings.vue` 新增 `normalizeSkillFolderPath()`，导入和重新选择前统一把 `...\SKILL.md` 归一化为父目录。该修复同时覆盖首次导入与失效路径重选。

### 源 Electron UI 验证

- 设置入口：侧边栏 `#btn-settings`，切换到 `#tab-skill` 后进入技能页。
- 探针：`_audit/tmp/cdp_probe_real_skill.cjs`，CDP 真实 UI 验证，不使用浏览器 mock。
- 首次导入：`allStepsOk=true`，卡片显示“文件夹 / 路径有效”，`wa_skills` 磁盘记录包含 `format=folder` 与 `folderPath`。
- 重启恢复：关闭源 Electron 后重新启动，Pinia 快照 `skillCount=18`、`folderCount=1`、`targetPresent=true`。
- 失效状态：临时重命名夹具目录后，卡片显示“路径失效”，并出现“重新选择文件夹”入口。
- 恢复状态：目录改回原名并重开设置页后，卡片恢复“路径有效”，重选入口消失。
- 验证后存储状态：`folderCount=1`、`total=18`，与验证前一致，无数据丢失。

### Phase 1 回归

- `npm run type-check`：exit 0。
- `npm run build:vue`：exit 0，主构建与 protocols 构建均成功。

### Phase 1 结论

- [x] Node 侧 skill-loader 验证通过。
- [x] 源 Electron 设置页真实导入通过。
- [x] 重启恢复通过。
- [x] 路径失效/恢复状态通过。
- [x] type-check / build:vue 通过。
- [x] 修复路径归一化缺陷。

## Phase 2：单 SKILL 执行核心

### 代码落地

- `src/services/realSkillTypes.ts`：folder SKILL 包、执行结果、诊断、Agent 上下文类型。
- `src/services/realSkillLoader.ts`：IPC 加载、5 秒 TTL 缓存、失败返回 `null` 而不抛异常。
- `src/services/apiCallBudget.ts`：默认总预算 8 次，支持 `meta.apiCallLimit` 单技能限额，超限返回 `BLOCKED` 与调用记录。
- `src/services/realSkillExecutor.ts`：single pass 执行核心。
  - `preProcess -> API -> postProcess`
  - 归一化 hook 返回值，未知字段记 warning
  - Agent 注入顺序：Agent systemPrompt -> SKILL template
  - `model/temperature/maxTokens` 传入 `aiService.callAi`
  - SKILL `samples.txt` 优先，缺失回退全局样本，默认 3 条
  - 脚本异常、脚本桥不可用、样本失败均降级继续；预算阻断、模板缺失、API 最终失败为 failed/blocked
- `src/composables/useDeAi.ts`：
  - `callAiApi` 增加 Agent 参数并真实传入 `callAi`
  - chain / split-merge / multi-step 三模式统一走 `runSkillStep`
  - folder SKILL 走 executor，text SKILL 保持原模板语义
  - text 无技能时的默认提示词与原行为一致
- `src/services/realSkillExecutor.spec.ts`：新增服务级测试，覆盖 Agent 注入顺序、参数传递、样本优先级与预算阻断。

### Phase 2 验证

- `npm run type-check`：exit 0。
- `npm run build:vue`：exit 0，主构建与 protocols 构建均成功；既有动态导入与 chunk 体积警告保持基线状态。
- `npm run test:services -- realSkillExecutor`：exit 0，4 个测试文件、81 个用例通过。
- 服务级证据：
  - Agent systemPrompt 位于 system message 开头，SKILL template 紧随其后。
  - `model=test-model`、`temperature=0.2`、`maxTokens=1234` 均进入 `callAi` 参数。
  - SKILL 样本优先进入 user message；无 SKILL 样本时回退 `DeAiSamples.getAll()`。
  - 预算耗尽时不调用 `getAiService`，返回 `blocked`。

### Phase 2 结论

- [x] text skill 路径保持原提示词语义，未引入新弹窗。
- [x] folder single pass 执行核心落地。
- [x] Agent 参数真实进入请求参数。
- [x] SKILL 样本优先、全局样本回退。
- [x] API 预算与阻断生效。
- [x] type-check / build:vue / targeted tests 通过。
- [ ] 源 Electron 真实 UI 验证待 Phase 6 统一执行，不在本阶段伪称完成。

### Phase 2 补充修复

- `realSkillExecutor.spec.ts` 的 TS2532 根因是测试直接索引可选的 `messages[0].content`，不是执行器逻辑问题。
- 修复后 `npm run type-check` exit 0，`realSkillExecutor` 与 `workspaceSkillEngine` 相关 87 个用例通过。

## Phase 3：三条消费路径接入

### 代码落地

- `skillRouter.ts`：
  - 支持透传 `aiService/stream/signal/timeoutMs/onChunk/messageBuilder`。
  - folder 加载失败返回 text fallback 信号；folder 执行失败或预算阻断直接抛错，不再伪装成文本路径继续跑。
- `realSkillExecutor.ts`：
  - 支持调用方注入 `aiService`，folder 执行可进入共享上下文消息体系。
  - 返回 `apiMeta.finishReason/providerId/requestMessages`，供 UI 元数据链路消费。
- `workspaceSkillEngine.ts`：
  - `WorkspaceSkillTemplate.skill` 支持 folder 技能。
  - folder 分支先由 `conversationContextService.buildContextBundle` 构建上下文，再通过 `messageBuilder` 进入 executor。
  - Agent 解析顺序保持：per-skill Agent > 基础 Agent > 默认供应商。
  - folder 成功后写入 `recordTurn`，失败写入现有 chain failure breakpoint。
  - 共享 API 预算通过 `runWorkspaceSkills.apiBudget` 传入。
- `ChatPanel.vue` / `OutlineWorkspace.vue`：
  - folder 技能不再因 `template === ''` 被过滤。
  - 主页共创与大纲工作台均传入统一 `createApiCallBudget(8)`。
- `PipelinePanel.vue`：
  - `getStepSkillTemplates()` 保留 folder 技能并携带完整 `Skill` 对象。
  - `callValidatedSkill()` 内 folder 分支进入 `routeSkill`，沿用 per-skill/step Agent、现有流式日志、取消信号与超时。

### Phase 3 验证

- `npm run type-check`：exit 0。
- `npm run test:services -- realSkillExecutor workspaceSkillEngine`：exit 0，5 个测试文件、87 个用例通过。
- 源 Electron UI 验证按计划留到 Phase 6 V8/V10/V11 统一执行。

### Phase 3 结论

- [x] router 统一透传执行上下文。
- [x] 去AI味路径接入 router。
- [x] 主页共创接入 router。
- [x] 大纲工作台共享引擎同步接入。
- [x] 生成流水线 folder 分流接入。
- [x] folder 执行失败不再静默续跑。
- [ ] V8/V10/V11 源 Electron 真实验证待 Phase 6。

## Phase 4：单 SKILL 升级线 U1/U2/U3/U5

### 代码落地

- `realSkillExecutor.ts`：
  - U1 动态模板：`preProcess.template` 与 `api.setTemplate()` 均覆盖当轮模板，超 20000 字符截断并记 warning。
  - U2 multi-pass：仅 `meta.executionMode="multi-pass"` 且 `passes` 有效时启用，最多 5 步；每步可用 original/previous 输入；进度通过 `real-skill:pass` 事件发出；当前步失败即停止，不拿旧输出伪装完成。
  - U3 Schema 重试：postProcess 校验优先，其次 `schema.json`；默认最多 3 次尝试；第 3 次温度 `min(agentTemp+0.05, 1.0)`；超限返回最后输出 + `degraded` + 校验诊断。
  - U5 智能样本：`smartSamples=true` 时按输入关键词打分选样，默认 3 条上限 5 条，总字符预算 4000；SKILL 样本仍优先于全局样本。
  - 预算改为每次 API 调用前消耗；阻断时不解析 AI service，不发起调用。
  - `meta.step` 携带 attempt，未改动 `aiService.ts`。
- `realSkillLoader.ts`：导出 `FolderSkillStatus`。
- `SkillSettings.vue`：folder 卡片显示 multi-pass / retry / dynamic template / smart samples 只读能力标签，状态来自真实加载结果。
- `realSkillExecutor.spec.ts`：新增 4 条 Phase 4 测试。

### 发现并修复的问题

- smart samples 若先截断候选池再打分，会退化成固定取前 N 条；已改为全量池打分后再按数量和字符预算截断。
- 预算阻断测试暴露执行器在阻断前解析 AI service；已改为每次真实调用前惰性解析。
- 中文连续文本没有空格分词，整句匹配会导致样本选择失效；已增加 2 字符滑窗关键词。

### Phase 4 验证

- `npm run type-check`：exit 0。
- `npm run test:services -- realSkillExecutor workspaceSkillEngine`：exit 0，5 个测试文件、91 个用例通过。

### Phase 4 结论

- [x] 动态模板进入 system message，并有测试证明。
- [x] multi-pass 顺序执行并发出第 N/M 步事件。
- [x] 校验失败最多重试 3 次，最终非静默成功。
- [x] smart samples 按关键词选择，数量和字符预算生效。
- [x] 未声明升级能力的 folder SKILL 仍走单 pass 默认路径。
- [ ] V13-V15 源 Electron 真实 UI 验证按计划留到 Phase 6。

## Phase 5：组合编排 U4

### 代码落地

- `src/services/skillOrchestrator.ts`：composite 编排器落地。
  - 父 SKILL `plan` 返回 `{ order, mode }`，第一版仅支持 sequential，parallel 显式降级为串行并记录 warning。
  - `afterStep` 支持 continue / retry / skip / stop，retry 达到上限后整组 BLOCKED。
  - 嵌套深度最多 2 层，超过限制返回 BLOCKED。
  - 父路径进入循环检测，循环依赖返回 BLOCKED。
  - 父 SKILL 只编排不调 API，子 SKILL 失败或缺失均 BLOCKED，不伪装完成。
- `src/services/skillRouter.ts`：识别 `meta.executionMode="composite"`，调用 orchestrator 后归一化为 `RealSkillExecutionResult`。
- `src/services/workspaceSkillEngine.ts`：修复 `combineComposeTemplate()` 丢弃 folder 技能 `skill` 对象的问题。compose 组合模板现在优先返回带 `skill` 的 folder 模板，folder 技能不会退回 text 路径。
- `src/services/skillOrchestrator.spec.ts`：覆盖顺序执行、retry/skip/stop、深度超限、循环依赖、预算耗尽、子技能缺失。

### 发现并修复的问题

- compose 组合模板原实现只拼 `template` 字符串，找不到 folder 技能对象，导致共创 compose 混合 folder 技能时仍走 text 路径。修复后保留 folder 技能元数据，只合并模板文本、校验规则和输出配置。

### Phase 5 验证

- `npm run test:services -- skillOrchestrator`：exit 0，覆盖 2 个测试文件内的 composite 用例。
- 源 Electron UI 证据：`_audit/tmp/real-skill-generation-composite-evidence.json`。
  - `requestCount=3`，三个子 SKILL 按顺序请求。
  - 请求 system message 分别为“第一段处理 / 第二段处理 / 第三段处理”。
  - UI 快照包含 `composite-step-one完成1 次`、`composite-step-two完成1 次`、`composite-step-three完成1 次`。
  - `allStepsOk=true`、`compositeOk=true`、`requestCountOk=true`。

### Phase 5 结论

- [x] 三子 SKILL 顺序执行。
- [x] retry / skip / stop 三种 action 服务级测试覆盖。
- [x] 嵌套超限 BLOCKED。
- [x] 预算耗尽 BLOCKED，日志显示已用次数。
- [x] 子 SKILL 失败不伪装完成。
- [x] compose 混合 folder 技能不再退回 text 路径。

## Phase 6：全量回归、真实 UI 验证与收尾

### 探针与证据

统一探针：

- `_audit/tmp/cdp_probe_real_skill.cjs`：Phase 1 设置页导入、重启恢复、路径失效与恢复。
- `_audit/tmp/cdp_probe_real_skill_generation.cjs`：multi-pass 与 composite。
- `_audit/tmp/cdp_probe_real_skill_remaining.cjs`：folder-full、mixed、retry、coCreation。

证据文件：

- `_audit/tmp/real-skill-generation-multi-pass-evidence.json`
- `_audit/tmp/real-skill-generation-composite-evidence.json`
- `_audit/tmp/real-skill-remaining-folder-full-evidence.json`
- `_audit/tmp/real-skill-remaining-mixed-evidence.json`
- `_audit/tmp/real-skill-remaining-folder-retry-evidence.json`
- `_audit/tmp/real-skill-remaining-coCreation-evidence.json`

关键结论：

- multi-pass：3 次请求，UI 显示“第 1/3、2/3、3/3 步完成”，`allStepsOk=true`。
- composite：3 个子 SKILL 顺序执行，UI 显示三个子步骤完成，`compositeOk=true`。
- retry：3 次请求，第三次温度升到 0.75，UI 显示“失败3 次”，最终状态为 degraded，不是静默成功。
- mixed：text + folder 混合链完成，`folderSkillOk=true`。
- coCreation：Agent systemPrompt 注入；`model=real-skill-mock-model`、`temperature=0.35`、`maxTokens=777` 均进入请求；`wa_ctx_<projectId>` 上下文写入成功；`allStepsOk=true`。

### 探针修正记录

本轮探针曾出现三处假失败，均已按真实实现修正：

1. OpenAI 兼容请求实际使用 `body.max_tokens`，mock 服务器和断言已兼容 `max_tokens ?? maxTokens`。
2. 上下文真实存储键是 `wa_ctx_<projectId>`，不是 `wa_context_<projectId>`；断言与 finally 清理均已修正。
3. coCreation 成功路径夹具改用 `folder-minimal`。`folder-full` 自带 `schema.json` 且要求 JSON 输出，mock 返回普通文本会触发 3 次校验重试后 degraded，这是夹具特性，不是应用缺陷。

### V1-V16 验证矩阵

| 编号 | 验证项 | 结果 | 证据 |
|------|--------|------|------|
| V1 | text SKILL 不受影响 | 通过 | Phase 2 服务级测试 + mixed 探针 text 步骤 |
| V2 | folder SKILL 加载 | 通过 | Phase 1 源 Electron 设置页导入与重启恢复 |
| V3 | folder SKILL 去AI味执行 | 通过 | folder-full 探针，输出与状态正常 |
| V4 | preProcess 生效 | 通过 | realSkillExecutor.spec.ts 服务级断言 |
| V5 | postProcess 生效 | 通过 | realSkillExecutor.spec.ts 服务级断言 |
| V6 | SKILL 自带样本 | 通过 | realSkillExecutor.spec.ts 服务级断言 |
| V7 | 全局样本回退 | 通过 | realSkillExecutor.spec.ts 服务级断言 |
| V8 | 文本+folder 混用 | 通过 | real-skill-remaining-mixed-evidence.json |
| V9 | 沙箱安全 | 通过 | skill-loader 沙箱测试，require 被拦截 |
| V10 | 流水线覆盖 | 通过 | folder-full / multi-pass / composite 探针 |
| V11 | 共创覆盖 | 通过 | real-skill-remaining-coCreation-evidence.json |
| V12 | 路径失效回退 | 通过 | Phase 1 路径失效与恢复探针 |
| V13 | U1 动态模板 | 通过（服务级） | realSkillExecutor.spec.ts:172-180，无源 UI 专项证据 |
| V14 | U2 multi-pass | 通过 | real-skill-generation-multi-pass-evidence.json |
| V15 | U3 重试 + U5 样本 | 通过 | retry 证据 + realSkillExecutor.spec.ts |
| V16 | U4 composite | 通过 | real-skill-generation-composite-evidence.json |

说明：V13 的计划验收门是“动态模板进入 system message，且有测试证明”，本轮按服务级测试证据核销，不伪称已有 UI 专项验证。

### Phase 6 结论

- [x] `npm run type-check`：exit 0，`vue-tsc --noEmit` 无错误。
- [x] `npm run test:services`：exit 0，7 个测试文件、104 个用例通过。
- [x] `npm run build:vue`：exit 0，主构建 8.54s 完成，protocols 构建 128ms 完成；既有动态导入与 chunk 体积警告保持基线状态。
- [x] V1-V16 均有当轮证据；V13 明确标注为服务级证据。
- [x] compose folder 缺陷已修复并纳入 mixed/coCreation 回归。
- [x] 探针假失败根因已记录到经验文件，避免复用错误断言。
- [x] 临时诊断脚本已清理，保留探针、夹具和证据 JSON。
- [ ] 用户实操验收（F6.4 六条路径）待执行；验收通过前不升版本、不封装。
