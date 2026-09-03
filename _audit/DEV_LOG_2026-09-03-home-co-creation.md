# 开发日志：主页编辑器 SKILL/AGENT 共创能力

日期：2026-09-03  
方案：`_audit/PROPOSAL_2026-09-03_HOME_CO_CREATION_SKILL_AGENT.md`  
状态：执行中

## P0 影响圈与基线锁定

- [x] 引用扫描完成。
- [x] 当前行为基线已锁定。
- [x] 工作区既有改动已识别：AI 编辑器 L3 相关改动未提交，本任务不覆盖、不回滚。
- [x] P0 不修改源码。

### 引用结论

| 主题 | 引用位置 | 结论 |
|---|---|---|
| 主页聊天面板 | `src/components/chat/ChatPanel.vue` | 唯一主页聊天入口，当前读取流水线层级技能 |
| 大纲工作台 | `src/components/common/OutlineWorkspace.vue` | SKILL/AGENT 执行闭环来源，`askAi/runWorkspaceChain` 位于 1459-1805 |
| 稳定绑定键 | `src/services/skillAgentBinding.ts` | 已有 `step-skillId` 稳定键与旧索引迁移 |
| 断点状态机 | `src/services/chainBreakpoint.ts` | 断点形状通用，持久化 key 当前在 pipeline store |
| 上下文服务 | `src/services/conversationContextService.ts` | 主页已接入 `workspace: 'main'`，SKILL 可按 skillId 延续 |
| 流水线配置 | `src/stores/pipeline.ts:108-218` | `pipeline_step_config` 是共享落点，主页共创必须独立存储 |

### 本任务会改

1. 新增 `src/services/workspaceSkillEngine.ts`。
2. 新增 `src/stores/coCreation.ts`。
3. 修改 `src/services/skillAgentBinding.ts`，增加前缀化 key 支持，保持旧行为。
4. 修改 `src/components/common/OutlineWorkspace.vue`，切换到共享引擎。
5. 修改 `src/components/chat/ChatPanel.vue`，接入独立共创配置和 UI。
6. 新增对应 spec、审计文档、开发日志、版本号更新。

### 可能受影响但必须保持行为不变

1. `src/components/pipeline/PipelinePanel.vue`：继续使用 pipeline store，不受主页配置影响。
2. `src/services/configExchange/*`：绑定导出格式保持 `step-skillId`，不改协议。
3. `src/services/chainBreakpoint.ts`：数据结构不变，只增加主页独立持久化 key。
4. AI 编辑器 L3 相关文件：当前有未提交改动，本任务只在其当前状态上追加，不回滚。

## P1 配置域与类型底座

- [x] 新增 `src/stores/coCreation.ts`：独立配置域、脏数据归一化、技能增删排序、逐技能 Agent 绑定。
- [x] 新增 `src/stores/coCreation.spec.ts`：覆盖空配置、旧字段、重复 skillId、非法 mode、绑定一致性、独立存储 key。
- [x] `src/services/skillAgentBinding.ts` 增加 `getWorkspaceSkillAgentKey()`，旧 `step-skillId` 行为不变。
- [x] 配置读写不触碰 `pipelineStore`，使用 `co_creation_config` 独立存储域。
- [x] 验证：`npx vitest run src/stores/coCreation.spec.ts src/services/skillAgentBinding.spec.ts`，9 个用例全部通过。
- [x] 验证：`npm run type-check` 通过。

## P2 抽取共享执行引擎

- [x] 新增 `src/services/workspaceSkillEngine.ts`，承接模板解析、compose 拼接、chain 输出传递、输入输出校验、重试、Agent 优先级、上下文策略和断点状态机。
- [x] 引擎不 import 组件、不读写 Pinia、不直接持有 DOM 状态，全部依赖通过 adapter 注入。
- [x] 新增 `src/services/workspaceSkillEngine.spec.ts`，覆盖注入模式、单技能、多技能串行、逐技能 Agent 优先级、结构化校验重试、失败断点与续跑。
- [x] 大纲工作台尚未切换，本阶段只新增引擎，不改变现有运行行为。
- [x] 验证：`npx vitest run src/services/workspaceSkillEngine.spec.ts src/stores/coCreation.spec.ts src/services/skillAgentBinding.spec.ts src/services/chainBreakpoint.spec.ts`，18 个用例全部通过。
- [x] 验证：`npm run type-check` 通过。

## P3 大纲工作台切换共享引擎

- [x] 删除 `OutlineWorkspace.vue` 内私有的模板解析、prompt 合并、校验、调用、chain 与上下文构建函数，收敛到 `workspaceSkillEngine.ts`。
- [x] `askAi()` 中 SKILL 执行段统一改为一次 `runWorkspaceSkills()` 调用，保持原有输出进入大纲编辑建议链路。
- [x] `createWorkspaceSkillAdapter()` 保留大纲工作台的 Agent、供应商、上下文、记忆与断点来源。
- [x] 验证：`npm run type-check` 通过。
- [x] 验证：`npx vitest run src/services/workspaceSkillEngine.spec.ts src/stores/coCreation.spec.ts`，2 个文件 11 个用例全部通过。

## P4 主页聊天面板接入独立共创配置

- [x] `ChatPanel.vue` 删除 `pipelineStore` 依赖，不再读取或显示流水线同步状态。
- [x] 主页智能体、模型、模式、技能列表全部读写 `coCreation.config`，持久化为 `co_creation_config`。
- [x] 技能列表支持添加、移除、逐技能 Agent 绑定；chain 模式显示逐技能 Agent 选择。
- [x] 新增主页 `createHomeSkillAdapter()`，向共享引擎提供主页编辑器上下文、记忆、设定、历史消息、模型与独立断点。
- [x] 已选共创技能时，`sendMessage()` 分流到 `runHomeCoCreationSkills()`，共享引擎负责 chain/compose、校验、重试和断点。
- [x] 最终输出继续进入现有 `parseEditorEditBatch()` / `parseEditorEditCommand()` 编辑建议链路。
- [x] 验证：`npm run type-check` 通过。

## P5 切断主页与流水线技能配置

- [x] 删除主页隐式注入 `skillStore.skills.filter(enabled)` 的行为。
- [x] 删除卷纲、章节剧情、正文三种编辑模式隐式注入 `pipelineSkills` 的行为。
- [x] 删除旧 `SkillExecutionEngine` 预加工链路及其 `resolveSkillTemplate()` 依赖。
- [x] 未选择共创技能时，主页保持普通 API 对话行为；选择技能后只执行当前共创配置，不再与流水线配置叠加。
- [x] 验证：`npm run type-check` 通过；`rg` 确认 `ChatPanel.vue` 无 `enabledSkills/pipelineSkills/SkillExecutionEngine/resolveSkillTemplate` 残留。

## P6 编辑器交互与工具边界

- [x] 共享引擎请求不传入写工具，chain 中间步骤只做文本推理，不直接修改编辑器。
- [x] chain 最终输出和 compose 输出继续进入 `parseEditorEditBatch()` / `parseEditorEditCommand()`，沿用预览确认、目标校验、批次记录与回滚规则。
- [x] 共创上下文记录补充 `HomeCoCreation.skill`、mode、skillIds、agentIds，便于日志与诊断区分主页共创和普通对话。
- [x] 验证：`npm run type-check` 通过。

## P7 续生成与取消闭环

- [x] 普通对话快照保留现有续生成协议，补充共创 skillIds 与去重 agentIds 元数据。
- [x] 续生成仍只续最终输出，不重启整条 chain；chain 中断恢复由共享引擎断点状态机处理。
- [x] 取消、异常、finally 状态清理沿用主页现有消息清理和 generation 状态规则。
- [x] 验证：`npm run type-check` 通过。

## P8 CDP 真实 UI 验证

- [x] 构建产物 rg 扫描确认所有共创 UI 元素 ID（`co-creation-config-row`、`co-skill-select`、`co-agent-select`、`co-mode-select`、`btn-home-co-create`、`co-skill-list`、`skill-area`）存在于 dist-renderer JS 和 CSS 中。
- [x] 构建产物 rg 扫描确认旧依赖（`pipelineStore`、`enabledSkills`、`pipelineSkills`、`SkillExecutionEngine`、`resolveSkillTemplate`、`同步流水线`）在 dist-renderer 中不存在。
- [x] `npm run type-check` 通过。
- [x] `npx vitest run` 34 文件 222 用例全通过。
- [x] `npm run build:vue` 通过（dist-renderer 时间戳 2026/9/3 17:40:36）。
- [~] CDP Runtime 域真实 UI 验证被环境阻断：Electron 33 / Chrome 130 在 `disableHardwareAcceleration=true` + `contextIsolation=true` + `nodeIntegration=false` 组合下，`Runtime.evaluate`、`DOM.getDocument`、`Page.captureScreenshot` 全部 120s 超时无响应。`Page.getNavigationHistory`（compositor 级）可用但 Runtime/DOM 级全不可用。Playwright `_electron.launch` 同样 firstWindow 成功但 evaluate/screenshot 超时。这是环境限制不是代码缺陷，降级为用户手动实测。

## P9 收尾

- [x] 更新经验文件 `_audit/神意开发经验总结_v2.md`：§2 新增规则 37（CDP Runtime 域假死），§9 根因索引新增 CDP Runtime 域假死条目。
- [x] 更新开发日志 P8 状态标记。
 - [x] 登记到 `_audit/DEV_LOG_MASTER_INDEX.md`：阶段八末尾追加序号 136。
 - [x] 版本号升级：`package.json` 3.16.1 → 3.17.0（minor，新增主页共创能力）。
 - [x] 重新 `npm run build:vue` 通过。
 - [x] 封装交付：`神意助手-Setup-3.17.0.exe` 已生成。
 - [x] 工作区有未提交改动（含本任务文件 + 无关的 AI 编辑器 L3 改动），不回滚不覆盖。
