# chain 模式意图路由与中断机制方案

## 一、问题根因

### 1.1 运行记录日志缺陷（P0-日志）

**现象**：chain 模式下选了 S0/S1/S2/S3 四个技能，运行记录只显示 1 次 API 调用，且只记录了 S3 的 system prompt。

**根因**：
- runWorkspaceSkills 在 chain 模式下遍历每个技能独立调用 callWorkspaceSkill，每次都会发起独立的 API 调用
- 但 startOutlineApiCall 只在 runWorkspaceSkills 返回后调用一次
- lastRunMeta 是 WeakMap，每次迭代都覆盖前一个技能的 meta，最终只保留最后一个技能的记录
- 耗时 durationMs 是从整个运行开始算的总耗时，不是单次调用耗时

**代码位置**：
- src/services/workspaceSkillEngine.ts L445-492
- src/components/common/OutlineWorkspace.vue L1514-1528

### 1.2 chain 模式缺少意图判断（P0-架构）

**现象**：用户问「审核大纲缺失什么」（分析请求），但 chain 模式机械地跑完 S0->S1->S2->S3 全链路，S2 生成了编辑指令，S3 直接修改了大纲输出。

**根因**：
- runWorkspaceSkills 的 chain 分支（L415-500）无条件遍历所有 templates，没有意图判断逻辑
- 用户选择了几个技能就全跑几个，没有跳过、中断、或基于意图路由的机制
- SKILL 没有声明自己的适用场景（分析 vs 修改），应用层也没有路由器做意图匹配

## 二、社区调研结论

### 2.1 Semantic Router（3883 stars）

核心思路：语义相似度匹配用户输入到预定义 Route，零 API 调用即可完成意图分类。每个 Route 包含一组 utterances（示例句），通过向量相似度或关键词匹配判定意图。

我们的等价实现：不引入向量库依赖，用关键词加正则匹配做等价分类。在应用层维护一个意图关键词表，用户输入经过分类器后输出意图标签（analyze/edit/generate/discuss/auto）。

适配理由：我们的场景是写作工具，意图类型有限且区分度高，不需要高精度语义理解。关键词加正则足以覆盖 90% 以上的用例。

### 2.2 LangGraph（41266 stars）

核心思路：条件边（conditional edges）加 interrupt-resume 设计模式。每个节点执行后根据条件决定下一步走哪个节点，支持中途中断和恢复。

我们的等价实现：在 chain 循环中增加意图过滤和中断判断。每个 SKILL 可以声明自己的适用意图（meta.json 的 intents 字段），chain 循环开始前根据用户意图过滤掉不适用的 SKILL。同时增加中断检查点，在每步执行前检查是否应该继续。

适配理由：我们的 chain 模式已经有 breakpoint 机制（chainBreakpoint.ts），只需在循环内增加意图判断逻辑，不需要重构为图结构。

### 2.3 Dify 工作流编排

核心思路：条件节点基于上游输出做路由判断，支持 LLM 节点、代码节点、条件分支节点的组合编排。

我们的等价实现：简化为 SKILL 声明加应用路由模式。SKILL 在 meta.json 声明适用意图，应用层在 chain 启动前做意图分类，只激活匹配的 SKILL。

## 三、方案设计

### 3.1 意图分类器（chainIntentRouter.ts）

新建文件：src/services/chainIntentRouter.ts

意图类型：
- analyze（分析）：审核、检查、诊断、分析、评估、找问题、看看、评价、缺失什么、有什么问题
- edit（修改）：修改、改、调整、重写、替换、删掉、增加、补充、优化、润色
- generate（生成）：生成、写、创作、产出、创建、新写
- discuss（讨论）：讨论、聊聊、你觉得、建议、想法、怎么样、如何
- auto（自动，兜底）：无法匹配以上任何意图时，走全链路

接口设计：
- ChainIntentRouteResult 包含 intent（意图标签）、matchedKeywords（匹配到的关键词）、confidence（置信度 0-1）
- classifyChainIntent(userInput: string): ChainIntentRouteResult

向后兼容：当意图为 auto 或匹配度为 0 时，走原有全链路逻辑，行为完全不变。

### 3.2 SKILL 意图声明扩展

修改文件：src/services/realSkillTypes.ts

在 RealSkillMeta 接口增加可选字段 intents?: string[]，声明适用意图如 [ analyze, discuss]。
在 WorkspaceSkillTemplate 类型增加可选字段 intents?: string[]。

向后兼容：不声明 intents 字段的 SKILL 默认参与所有意图的链路，行为不变。

### 3.3 引擎回调扩展

修改文件：src/services/workspaceSkillEngine.ts

扩展 WorkspaceSkillEngineCallbacks，新增四个可选回调：
- onBeforeSkill(skillIndex, skillId, skillName)：每步执行前通知 UI
- onAfterSkill(skillIndex, skillId, skillName, output)：每步执行后通知 UI
- onApiCallStart(skillId, skillName, model) 返回 callId：每次 API 调用开始时记录到运行记录
- onApiCallFinish(callId, meta, durationMs)：每次 API 调用结束时完成记录
- onSkillSkipped(skillIndex, skillId, reason)：因意图不匹配被跳过时通知 UI

### 3.4 chain 循环改造

修改文件：src/services/workspaceSkillEngine.ts L415-500

改造要点：
1. 意图分类：chain 启动前调用 classifyChainIntent(input.requestText) 获取意图
2. SKILL 过滤：根据意图过滤 templates，只保留声明了该意图或未声明 intents 的 SKILL
3. 单步 meta 收集：lastRunMeta 从 WeakMap 改为数组 allMetas，每次 callWorkspaceSkill 后 push
4. 回调注入：在 callWorkspaceSkill 调用前后触发 onBeforeSkill / onApiCallStart / onApiCallFinish / onAfterSkill
5. 跳过通知：被过滤掉的 SKILL 触发 onSkillSkipped
6. 中断机制：每步执行前检查 signal 和 budget，超限则中断
7. 过滤结果为空时自动回退到全链路

### 3.5 运行记录修复

修改文件：src/components/common/OutlineWorkspace.vue L1488-1528

改造要点：
1. 在 runWorkspaceSkills 的 callbacks 中注册 onApiCallStart 和 onApiCallFinish
2. 每次 onApiCallStart 调用 startOutlineApiCall，获得 callId
3. 每次 onApiCallFinish 调用 finishOutlineApiCall，传入完整 meta
4. 移除 runWorkspaceSkills 返回后的单次 startOutlineApiCall 调用
5. 保留返回后的兜底逻辑（如果 allMetas 为空则用旧逻辑）

同步修改：src/components/chat/ChatPanel.vue L565 附近，同样的回调注册逻辑

### 3.6 compose 模式不变

compose 模式（一次 API 调用拼接所有模板）完全不受影响。不增加意图过滤，不增加回调。行为和现有完全一致。

## 四、执行步骤

| 步骤 | 文件 | 内容 | 验证方式 |
|------|------|------|----------|
| 1 | src/services/chainIntentRouter.ts（新建） | 意图分类器，关键词加正则匹配 | 单元测试：输入审核大纲 -> analyze，输入修改大纲 -> edit，输入生成大纲 -> generate |
| 2 | src/services/realSkillTypes.ts | RealSkillMeta 增加 intents 可选字段 | TypeScript 编译通过 |
| 3 | src/services/workspaceSkillEngine.ts L93-96 | 扩展 WorkspaceSkillEngineCallbacks | TypeScript 编译通过 |
| 4 | src/services/workspaceSkillEngine.ts L415-500 | chain 循环增加意图过滤加中断加 meta 数组加回调 | 构建加运行验证 |
| 5 | src/services/workspaceSkillEngine.ts L409 | lastRunMeta WeakMap 改为收集数组 | 代码审查 |
| 6 | src/components/common/OutlineWorkspace.vue L1488-1528 | 注册 onApiCallStart/onApiCallFinish 回调，移除单次调用 | 运行记录显示4次 API 调用 |
| 7 | src/components/chat/ChatPanel.vue L565 | 同步注册回调 | 主页运行记录显示每次调用 |
| 8 | src/services/realSkillExecutor.ts | 从 meta.json 读取 intents 字段传入 template | folder skill 声明 intents 后被正确过滤 |
| 9 | 全项目 | npm run build | 构建无错误 |
| 10 | 源应用启动 | npx electron . | 实际运行验证 |

## 五、验证标准

1. 运行记录完整性：chain 模式选4个技能，运行记录显示4次独立 API 调用，每次有独立的 system prompt、response、耗时
2. 意图过滤：输入审核类请求，只激活声明 analyze 的 SKILL，其余被跳过且在运行记录中显示跳过原因
3. 中断机制：AbortSignal 触发后 chain 循环立即停止，不继续后续 SKILL
4. compose 不变：compose 模式行为完全不变，一次 API 调用拼接所有模板
5. 向后兼容：不声明 intents 的 SKILL 在所有意图下都参与链路，行为与改造前一致
6. auto 兜底：无法识别意图的输入走全链路，行为与改造前一致

## 六、风险评估与缓解

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| 意图分类误判 | 中 | auto 兜底加用户可手动覆盖（未来加 UI 开关） |
| 过滤后无 SKILL 可执行 | 低 | 过滤结果为空时自动回退到全链路 |
| lastRunMeta 改为数组后引用断裂 | 中 | 同时保留 WeakMap 兼容旧调用方，新增 allMetas 数组 |
| 回调函数未注册时的空指针 | 低 | 所有新回调都是可选的，调用前检查 |
| compose 模式被误改 | 低 | 意图过滤只在 chain 分支内，compose 分支完全不碰 |

## 七、不修改清单

以下文件不做任何修改：
- src/services/chainBreakpoint.ts（断点机制不变）
- src/services/chainExecution.ts（chain prompt 构建逻辑不变）
- src/services/skillRouter.ts（路由器不变）
- src/services/skillValidation.ts（验证逻辑不变）
- src/services/apiCallBudget.ts（预算机制不变）
- compose 模式的所有代码路径
- 生成流水线四层（设定/卷纲/章节/正文）的 chain/compose 逻辑
- folder skill 的文件加载逻辑（realSkillLoader.ts）
- folder skill 的执行逻辑（realSkillExecutor.ts 的 executeRealSkill 函数本体）

## 八、与开发经验文件V3的衔接

本方案遵循以下经验条目：
- 铁律：先读再改、apply_patch 编辑中文、精准修复、防空转、不破坏现有功能
- 不新增依赖：chainIntentRouter.ts 纯 TypeScript 实现，评估风险后经用户确认可加装依赖
- 向后兼容优先：所有新增字段可选，所有新行为有 auto 兜底
- compose 模式不受影响：方案所有改动只在 chain 分支内
- 测试必须源应用启动：npx electron .，不允许网页/开发者模式/安装版
