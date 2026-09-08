# WriterHelper vs 神意助手 全维度竞品对比报告书

> 生成日期: 2026-09-05
> 我方应用: 神意助手 v3.20.2 (Vue3 + Electron + TypeScript)
> 竞品应用: WriterHelper v1.0.9 (Flutter + Dart 桌面应用)
> 报告范围: 全量源码级解析，覆盖 WriterHelper 656 个 Dart 包路径 + 我方 36 个 Vue 组件 / 119 个 TS 服务文件

---

## 一、技术栈对比

| 维度 | WriterHelper | 神意助手 |
|------|-------------|----------|
| 前端框架 | Flutter (Dart) AOT 编译 | Vue 3 + TypeScript |
| 桌面容器 | Flutter Desktop (自渲染引擎) | Electron (Chromium + Node.js) |
| 状态管理 | Riverpod + MobX | Pinia |
| 富文本编辑器 | AppFlowy Editor (富文本/markdown 混合) | 自研 textarea + 代码编辑器 |
| 可视化节点编辑器 | vyuh_node_flow (工作流编排) | 无 (流水线为固定5层) |
| GPU 渲染 | Vulkan/ANGLE 硬件加速 | Chromium GPU 加速 (will-change/contain) |
| 媒体播放 | libmpv-2.dll (内嵌播放器) | 无 |
| 包大小 | 30MB (NSIS 安装器) | ~80MB+ (Electron NSIS) |
| 跨平台 | Windows (桌面+移动双端布局) | Windows (桌面) |
| 向量数据库 | 内置 vectordb + Python embedding | 无独立向量数据库 |
| 云同步 | WebDAV (dav.jianguoyun.com) | 无云同步 |
| 后端 API | 完整租户体系 (/api/tenant_1/) | 纯本地应用，无后端 |

---

## 二、AI 能力对比

### 2.1 AI 供应商覆盖

| 供应商 | WriterHelper | 神意助手 |
|--------|-------------|----------|
| OpenAI (GPT-4o) | 支持 | 支持 |
| Anthropic (Claude 3/3.5/3.7) | 支持 | 支持 |
| DeepSeek (v3/v4-flash/v4-pro) | 支持 | 支持 |
| 通义千问 (qwen-plus) | 支持 | 支持 |
| 智谱 (bigmodel) | 支持 | 支持 |
| Gemini | 支持 | 支持 |
| 供应商协议归一化 | 固定端点列表 | providerProtocols.ts 统一归一化 (OpenAI/Anthropic/Gemini 三协议) |
| 工具调用 (tool calling) | 支持 (ai_agent_tools/writing_tools) | 支持 (providerTools.ts, 最多6轮, 含 JSON 兼容模式) |
| 模型列表获取 | 各端点独立 | fetchModels 统一入口 + 降级测试 |

### 2.2 AI Agent 体系

| 功能 | WriterHelper | 神意助手 |
|------|-------------|----------|
| 智能体配置 | agent_market (市场+本地) | AgentStore (id/name/model/temperature/maxTokens/systemPrompt) |
| Skill 系统 | skill_creator/skill_installer/skillshub_client | SkillStore (template/executionMode/outputFormat/validationRules) |
| 子 Agent | shell_sandbox/trajectory | 无独立子 Agent |
| 计划面板 | plan_panel/process_zone | EditorToolPlan (stage + steps) |
| Agent 工具调用 | writing_tools | editorTools.ts (read: get_state/search/locate; write: propose_edits/update_plan) |
| 工具执行沙箱 | shell_sandbox | ToolGateway (注册+验证+执行+事件追踪) |
| Agent 市场 | 完整推广+VIP体系 | 纯本地配置，无市场 |
| per-skill Agent | 未知 | 支持 (skillAgents[step-skillId] 绑定) |

---

## 三、工作流与流水线对比

### 3.1 工作流引擎

| 功能 | WriterHelper | 神意助手 |
|------|-------------|----------|
| 工作流类型 | 可视化节点编辑器 (vyuh_node_flow) | 固定5层流水线 (大纲->设定->卷纲->章节->正文) |
| 节点类型 | inject_chapter_context, load_outline, load_chapter_outline, load_prev_ending, load_characters, load_other_settings, load_rules, analyze_rules, build_content_prompt, build_plot_prompt, generate_content, generate_plot, write_chapter_content + AI模型节点/控制节点/读写文件节点/变量节点 | PipelinePanel 5层 + chainExecution.ts (chain/compose 两种模式) |
| 工作流可定制性 | 用户可自由编排节点 | 固定5层，每层可选 SKILL 和 Agent |
| 工作流预设 | default_workflow.json (content/plot 双流程) | 无预设工作流，由 SKILL 模板驱动 |

### 3.2 执行模式

| 模式 | WriterHelper | 神意助手 |
|------|-------------|----------|
| chain | 节点串联执行 | chainExecution.ts (S1输出->S2输入) |
| compose | 节点并行拼接 | compose 模式 (模板拼接后一次调用) |
| split-merge | 未知 | 支持 (代码存在但UI保存时可能归一) |
| multi-step | 未知 | 支持 (代码存在但UI保存时可能归一) |
| 断点续跑 | 工作流级 | chainBreakpoint.ts (chain内部SKILL级断点) |
| 失败处理 | 未知 | 保留上一步结果继续执行 (已知缺陷) |

---

## 四、设定系统对比

| 功能 | WriterHelper | 神意助手 |
|------|-------------|----------|
| 设定卡片 | setting_card (小卡片形式) | 设定分类区 (世界观/角色/势力/物品) |
| 设定详情 | setting_detail | 绑定按钮+信息弹窗 |
| 设定状态历史 | setting_state_history | 无 |
| 设定导入导出 | settings_import_export | configExchange (JSON + Markdown) |
| 自定义颜色 | custom_color_picker | 无 |

---

## 五、章节与卷纲系统对比

| 功能 | WriterHelper | 神意助手 |
|------|-------------|----------|
| 章节大纲树 | chapter_outline_tree | ChapterTree.vue (侧边栏章节树) |
| 卷编辑 | volume_edit | PipelinePanel 卷纲层 |
| 阶段块 | stage_block | 无独立阶段块 |
| 章节摘要推导 | chapter_summary_deduction | 无独立推导功能 |
| 批量操作 | batch_operation | 批量生成章节 |
| 时间线 | chapter_timeline + character_timeline + node_network | 已删除 (标记为不需要) |
| 章节执行包 | 无独立概念 | chapterExecutionPackage.ts (volume+chapter+outline+scenes+sourceRefs) |

---

## 六、灵感与素材系统对比

| 功能 | WriterHelper | 神意助手 |
|------|-------------|----------|
| 灵感生成 | inspiration_generation | 无 |
| 灵感收藏 | inspiration_collection | 无 |
| 情节素材构建 | plot_material_builder | 无 |
| JSON 卡片解析 | json_card_parser | 无 |
| 融化库(熔炼) | melt_card/melt_furnace/melt_fusion/melt_decomposition/melt_keyword_locator + card_rarity | 无对应功能 |
| 书籍解构 | book_deconstruct/text_chunker/deconstruction_service | 无 |
| 书籍测试 | book_test/fanqie_scraper (番茄小说爬取)/evaluator_profile | 无 |

---

## 七、历史记录与 Diff 对比

| 功能 | WriterHelper | 神意助手 |
|------|-------------|----------|
| 历史记录 | history_recorder/history_persister/history_stack/text_diff/history_change_type | useUndoRedo (undo/redo 栈, 50步上限) |
| AI Diff | diff_controller/diff_calculator/diff_split_mode (inline/side-by-side)/char_diff | DiffModal.vue + editorBatchRecord.ts (逐项接受/拒绝) |
| 工作区快照 | 无独立概念 | workspaceSnapshot.ts |

---

## 八、去 AI 味系统对比

| 功能 | WriterHelper | 神意助手 |
|------|-------------|----------|
| 禁用词库 | default_rules.json (200+ 条禁用词, 含分类描述) | DeAiStore (hardRules, 自定义) |
| 禁用句式 | 33 条句式规则 | 无内置句式规则 |
| 验证器 | de-ai validators | DeAiSettings + useDeAi |
| 写作风格包 | 12 种风格 (言情/古风/武侠/玄幻/悬疑/恐怖/科幻/都市/历史/治愈/热血/搞笑), 每种含 technique/referenceAuthors/commonVocabulary/commonPhrase | 无内置风格包 |
| 跨模型校验 | cross-model | DeAiStore 有 cross-model 步骤 |
| 朱雀校验 | zhuque | DeAiStore 有 zhuque 步骤 |

---

## 九、记忆系统对比

| 功能 | WriterHelper | 神意助手 |
|------|-------------|----------|
| 向量数据库 | vectordb + Python embedding | 无独立向量数据库 |
| 记忆抽取 | 未知细节 | memoryExtractor.ts (实体/关系/事件/世界/伏笔, evidence+snippet 验证) |
| 记忆存储 | 未知 | memoryIO.ts + memoryVersion.ts |
| 记忆检索 | 未知 | memoryRetriever.ts |
| 记忆合并 | 未知 | memoryMerger.ts |
| 记忆导出 | 未知 | memoryExport.ts |
| 记忆面板 | 无独立面板 | MemoryPanel.vue + TimelineView + GraphAnalysis + CharacterCard + RelationGraph + MindMap |
| 记忆审核 | 无 | snippet 验证 (verifySnippet, 原文比对) |
| 对话上下文 | chat_config/chat_reference | conversationContextService.ts (会话上下文+续生成快照) |

---

## 十、编辑器与 AI 交互对比

| 功能 | WriterHelper | 神意助手 |
|------|-------------|----------|
| 编辑器类型 | AppFlowy Editor (富文本/markdown) | textarea + 自研编辑器 |
| AI 直接修改编辑器 | write_chapter_content 节点 | editorEditService.ts (append/insert/replace_selection/replace_match/delete/rewrite) |
| 编辑器工具调用 | writing_tools | editorTools.ts (get_state/search/locate/propose_edits/update_plan/multi_get_state/global_search/workspace_summary) |
| 用户审批 | 未知 | 编辑器写入必须预览确认, 不可绕过 |
| 内容 hash 校验 | 未知 | editorTarget.ts (contentHash 验证) |
| 锁定拒绝 | 未知 | editorTarget.ts (locked 状态拒绝写入) |
| 部分接受重规划 | 未知 | editorEditBatch.ts (部分接受后重新规划剩余编辑) |
| 诊断日志 | 未知 | editorEditDiagnostics.ts |
| 批次回滚 | 未知 | editorBatchRecord.ts (batchId 持久化, 回滚此 AI 批次) |
| 续生成 | 未知 | continuationService.ts + continuationStorage.ts |
| 上下文记忆 | chat_reference | conversationContextService.ts (会话上下文记忆) |
| 模糊定位 | 未知 | fuzzyLocate (Levenshtein 相似度 >= 0.6) |
| 工具调用流 | trajectory | ToolCallStreamEvent (tool_start/progress/result/error) |

---

## 十一、小说初始化配置对比

| 功能 | WriterHelper | 神意助手 |
|------|-------------|----------|
| 受众选择 | 男频/女频/不限 | 无标准化配置 |
| 题材选择 | 20 种 (都市/古风玄幻/仙侠/武侠/...) | 无标准化配置 |
| 故事类型 | 16 种 (爽文/甜宠/虐恋/复仇/...) | 无标准化配置 |
| 篇幅选择 | 中篇/长篇/超长篇/无限制 | 大纲层字数设置 |
| 基调选择 | 10 种 (轻松/温馨/搞笑/...) | 无标准化配置 |
| 避坑选择 | 14 种 (虐主/悲剧/狗血/...) | 无标准化配置 |
| 时代选择 | 12 种 (古代/现代/未来/...) | 无标准化配置 |
| 篇幅->章节数映射 | 中篇30/长篇50/超长篇100 | 无自动映射 |

---

## 十二、VIP/付费/社区体系对比

| 功能 | WriterHelper | 神意助手 |
|------|-------------|----------|
| VIP 门控 | vip_gate/vip_required_dialog | 无 |
| VIP 充值 | vip_recharge/vip_pay | 无 |
| 推广分销 | 完整推广体系 | 无 |
| 作品广场 | works_square | 无 |
| AI 提示词分享 | ai_prompt 分享 | 无 |
| AI 技能市场 | ai_skills 市场 | 无 |
| Agent 市场 | agent 市场 | 无 |
| 社区互动 | 完整社区体系 | 无 |
| 系统托盘 | 有 | 有 (ExitConfirmModal) |
| 功能催促 | func_urge | 无 |
| 写作统计 | writing_stats | 无 |

---

## 十三、MCP 与外部协议对比

| 功能 | WriterHelper | 神意助手 |
|------|-------------|----------|
| MCP 协议 | 无 | mcp-protocol.ts (Model Context Protocol 支持) |
| 插件市场 | 无 | PluginMarket.vue |
| 帮助指南 | 无 | HelpGuide.vue |
| 诊断日志 | 无独立面板 | DiagLogPanel.vue |
| AI 命名 | 无独立功能 | AiNamingModal.vue (AI 起名系统) |

---

## 十四、综合评分

| 维度 | WriterHelper | 神意助手 | 说明 |
|------|-------------|----------|------|
| 技术架构 | 8/10 | 7/10 | Flutter AOT 优势明显，但 Electron 生态更丰富 |
| AI 供应商 | 8/10 | 9/10 | 神意助手协议归一化更成熟 |
| Agent 体系 | 8/10 | 7/10 | WriterHelper 有市场和子Agent，神意助手有per-skill绑定和工具沙箱 |
| 工作流 | 9/10 | 6/10 | 节点编辑器远超固定5层流水线 |
| 设定系统 | 7/10 | 6/10 | WriterHelper 有状态历史和自定义颜色 |
| 章节系统 | 8/10 | 7/10 | WriterHelper 有时间线，神意助手有执行包 |
| 灵感素材 | 9/10 | 0/10 | 神意助手完全缺失 |
| 历史记录 | 9/10 | 5/10 | WriterHelper 有持久化和字符级diff |
| 去AI味 | 9/10 | 6/10 | WriterHelper 规则库远超神意助手 |
| 记忆系统 | 5/10 | 9/10 | 神意助手记忆系统完整且独有 |
| 编辑器交互 | 6/10 | 9/10 | 神意助手安全模型是强项 |
| 小说初始化 | 9/10 | 3/10 | WriterHelper 有完整配置体系 |
| 商业化 | 9/10 | N/A | 不同产品定位 |
| 社区 | 9/10 | N/A | 不同产品定位 |
| MCP/协议 | 0/10 | 8/10 | 神意助手有MCP支持 |

---

## 十五、我们的优势（WriterHelper 没有的）

1. 编辑器安全模型: 内容 hash 校验、锁定拒绝、部分接受重规划、诊断日志、批次回滚
2. 记忆系统: 完整的抽取->存储->检索->合并->导出链路 + 记忆面板(时间线/关系图/思维导图/角色卡片)
3. 供应商协议归一化: OpenAI/Anthropic/Gemini 三协议统一接口 + 工具调用 JSON 兼容模式
4. 章节执行包: volume+chapter+outline+scenes+sourceRefs 打包传递的独有概念
5. MCP 协议支持: 为未来扩展提供协议级基础
6. 续生成: continuationService + continuationStorage 完整实现
7. 对话上下文记忆: conversationContextService 会话级上下文
8. AI 命名系统: AiNamingModal 独立起名功能
9. 大纲工作台: OutlineWorkspace 独立的大纲编辑+AI共创工作台
10. per-skill Agent 绑定: skillAgents[step-skillId] 精细绑定
11. 模糊定位: Levenshtein 相似度辅助定位编辑目标
12. 工具调用流: ToolCallStreamEvent 实时追踪工具执行过程
13. GPU 加速优化: will-change/contain CSS 优化 + Chromium GPU 硬件加速

---

## 十六、WriterHelper 的优势（我们缺失的）

1. 可视化节点编辑器: vyuh_node_flow 允许用户自由编排写作流程 -- 最大差距
2. 灵感与素材系统: 灵感生成/收藏/情节素材构建/JSON卡片解析 -- 完全缺失
3. 融化库(熔炼)系统: 卡片稀有度/关键词定位/分解融合 -- 独特创作辅助体系
4. 书籍解构: text_chunker/deconstruction_service -- 分析已有作品的能力
5. 书籍测试 + 番茄爬取: fanqie_scraper/evaluator_profile -- 竞品分析能力
6. 写作风格包: 12种完整风格(技法/参考作家/常用词汇/常用短语) -- 可直接内置
7. 去AI味规则库: 200+禁用词(带分类描述) + 33禁用句式 -- 可直接内置
8. 小说初始化配置: 受众/题材/故事类型/篇幅/基调/避坑/时代 -> 章节数映射
9. 历史记录持久化: history_persister + 变更类型分类 + 字符级diff
10. AI Diff 双模式: inline/side-by-side + char_diff
11. 云同步: WebDAV (dav.jianguoyun.com)
12. 向量数据库: vectordb + Python embedding (语义检索)
13. 富文本编辑器: AppFlowy Editor (比 textarea 体验更好)
14. 设定状态历史: setting_state_history
15. 时间线系统: 章节时间线 + 角色时间线 + 节点网络
16. 写作统计: writing_stats
17. 系统托盘深度集成
18. 移动端布局: 桌面+移动双端
19. Agent 市场 + Skill 市场: 分发体系
20. 推广分销体系: 商业化能力

---

## 十七、可借鉴方向建议

### 优先级 P0 (直接可移植)

1. 内置去AI味规则库: 把 WriterHelper 的 default_rules.json (200+禁用词 + 33禁用句式) 直接移植到 DeAiStore hardRules
2. 写作风格包: 把 12 种写作风格包移植到神意助手的 SKILL 模板中
3. 小说初始化配置: 参考 novel_init_config.json，在大纲层增加受众/题材/故事类型/篇幅/基调/避坑/时代选择

### 优先级 P1 (需适配实现)

4. 历史记录持久化: 把 useUndoRedo 的内存栈改为持久化到 electronAPI.storageWrite
5. AI Diff 升级: 在 DiffModal.vue 增加 inline/side-by-side 双模式 + 字符级 diff
6. 设定状态历史: 在设定分类区增加状态历史追踪

### 优先级 P2 (架构级改造)

7. 灵感与素材系统: 需要新建灵感生成/收藏/素材构建的完整模块
8. 融化库(熔炼)系统: 需要新建卡片稀有度/关键词定位/分解融合模块
9. 可视化节点编辑器: 把固定5层流水线升级为可视化节点编辑器
10. 云同步: 增加 WebDAV 同步能力

### 优先级 P3 (战略性方向)

11. 向量数据库: 引入 vectordb + embedding，实现语义级记忆检索
12. 书籍解构: 增加 text_chunker/deconstruction_service
13. 书籍测试: 增加 evaluator_profile

---

## 十八、功能映射总表

| WriterHelper 模块 | 神意助手对应 | 状态 |
|-------------------|-------------|------|
| agent_market | AgentStore + AgentSettings.vue | 有对应，无市场分发 |
| skill_creator/skill_installer | SkillStore + SkillSettings.vue | 有对应 |
| skillshub_client | 无 | 缺失 |
| ai_agent_tools/writing_tools | editorTools.ts | 有对应 |
| chat_config/chat_reference | conversationContextService.ts | 有对应 |
| shell_sandbox/trajectory | ToolGateway + ToolCallStreamEvent | 部分对应，无独立子Agent |
| plan_panel/process_zone | EditorToolPlan | 有对应 |
| vyuh_node_flow | PipelinePanel (固定5层) | 有对应，灵活性差距大 |
| setting_card/setting_detail | 设定分类区 | 有对应 |
| setting_state_history | 无 | 缺失 |
| settings_import_export | configExchange (JSON+MD) | 有对应 |
| custom_color_picker | 无 | 缺失 |
| chapter_outline_tree | ChapterTree.vue | 有对应 |
| volume_edit | PipelinePanel 卷纲层 | 有对应 |
| stage_block | 无 | 缺失 |
| chapter_summary_deduction | 无 | 缺失 |
| batch_operation | 批量生成章节 | 有对应 |
| chapter_timeline/character_timeline/node_network | 已删除 | 不需要 |
| inspiration_* | 无 | 完全缺失 |
| melt_* | 无 | 完全缺失 |
| book_deconstruct/text_chunker | 无 | 完全缺失 |
| book_test/fanqie_scraper | 无 | 完全缺失 |
| history_* | useUndoRedo | 部分对应 |
| diff_*/char_diff | DiffModal + editorBatchRecord | 部分对应 |
| de-ai validators/default_rules | DeAiStore + DeAiSettings | 有对应，规则库差距大 |
| writing_style_packs | 无 | 完全缺失 |
| novel_init_config | 无 | 缺失 |
| vip_*/recharge/pay | 无 | 不同定位 |
| works_square/ai_prompt/ai_skills/agent市场 | 无 | 不同定位 |
| func_urge | 无 | 缺失 |
| writing_stats | 无 | 缺失 |
| vectordb/python_settings | 无 | 缺失 |
| sync_engine/WebDAV | 无 | 缺失 |
| AppFlowy Editor | textarea + 自研 | 有对应，体验差距 |
| mcp-protocol | mcp-protocol.ts | 神意独有 |
| continuation | continuationService | 神意独有 |
| conversationContext | conversationContextService | 神意独有 |
| memoryExtractor/memoryIO/memoryRetriever | 无对应 | 神意独有 |
| editorEditService/editorTools/editorBatchRecord | write_chapter_content 节点 | 神意独有安全模型 |
| chapterExecutionPackage | 无对应 | 神意独有 |
| AiNamingModal | 无 | 神意独有 |
| OutlineWorkspace | 无 | 神意独有 |
| PluginMarket | 无 | 神意独有 |
| DiagLogPanel | 无 | 神意独有 |
| HelpGuide | 无 | 神意独有 |

---

## 十九、结论

WriterHelper 和神意助手是两种不同定位的写作客户端。WriterHelper 偏向平台型创作工具，有完整的后端体系、社区生态、商业化能力和可视化工作流。神意助手偏向工程型创作工具，有独特的安全模型、记忆系统、编辑器交互安全控制和 MCP 协议支持。

WriterHelper 的三大核心优势: 可视化节点编辑器、灵感素材+融化库系统、去AI味规则库+写作风格包。

神意助手的三大核心优势: 编辑器安全模型(hash校验+锁定拒绝+部分接受重规划+批次回滚)、记忆系统(抽取+存储+检索+合并+面板)、供应商协议归一化(三协议统一+工具调用双路径)。

最值得立即执行的三个行动:
1. 移植 WriterHelper 的 200+ 禁用词和 33 禁用句式到 DeAiStore hardRules
2. 移植 12 种写作风格包到 SKILL 模板
3. 移植小说初始化配置体系到大纲层

这三项不需要架构改造，可以直接在现有框架内实现，能快速提升用户体验。

---

## 二十、UI/布局/美工美术/界面元素对比

### 20.1 图标与素材资产

WriterHelper 自身只在 assets/images/ 下放置了 5 个文件，其余界面素材全部来自第三方包。

| 资产文件 | 用途 | 神意助手对应 |
|---------|------|-------------|
| logo1.png (508KB) | 应用 Logo | 自有 Logo |
| qr_douyin.webp | 抖音二维码 | 无 |
| qr_feishu_feedback.webp | 飞书反馈二维码 | 无 |
| qr_qq.webp | QQ群二维码 | 无 |
| qr_wechat.webp | 微信二维码 | 无 |

### 20.2 字体系统

| 维度 | WriterHelper | 神意助手 |
|------|-------------|----------|
| 图标字体 | MaterialIcons-Regular.otf (1.6MB) + CupertinoIcons.ttf | 内联 SVG + lucide icons |
| 自定义字体 | 无自定义字体文件 | 无自定义字体文件 |
| 字体大小管理 | Flutter ThemeData 统一管理 | CSS 变量 + theme store |

### 20.3 编辑器工具栏图标 (AppFlowy Editor)

WriterHelper 的富文本编辑器 AppFlowy Editor 自带完整的工具栏图标体系，分四组共 60+ 个 SVG 图标：

**桌面工具栏 (toolbar/):** bold, italic, underline, strikethrough, code, h1, h2, h3, link, bulleted_list, numbered_list, quote, divider, center, left, right, text_color, highlight_color, text_direction_auto, text_direction_ltr, text_direction_rtl, text

**移动端工具栏 (mobile/toolbar_icons/):** bold, italic, underline, strikethrough, code, h1, h2, h3, heading, link, list, bulleted_list, numbered_list, quote, checkbox, close, color, divider, setting, text_decoration

**选区菜单 (selection_menu/):** text, h1, h2, h3, bulleted_list, numbered_list, checkbox, image, quote, number

**图片工具栏 (image_toolbar/):** align_left, align_center, align_right, copy, delete, divider, share

神意助手对应：EditorPanel.vue 使用 textarea，工具栏仅有 undo/redo + 字数统计，没有富文本工具栏图标。

### 20.4 着色器与视觉效果

| 维度 | WriterHelper | 神意助手 |
|------|-------------|----------|
| 自定义着色器 | ink_sparkle.frag (水墨涟漪) + stretch_effect.frag (拉伸效果) | 无自定义着色器 |
| GPU 渲染路径 | Vulkan/ANGLE 硬件加速 | Chromium GPU + will-change/contain CSS 优化 |
| 动画框架 | Flutter AnimationController + Tween | CSS transition/animation + Vue transition |
| 设计规范 | Material 3 默认主题 | 自定义配色，无统一设计规范 |

### 20.5 布局架构

| 维度 | WriterHelper | 神意助手 |
|------|-------------|----------|
| 响应式布局 | 桌面+移动双端自适应 | 仅桌面端 |
| 导航模式 | 侧边导航 + 底部导航栏(移动) | 侧边栏导航 (SidebarNav) + 面包屑 (BreadcrumbBar) |
| 页面结构 | Scaffold (AppBar + Body + BottomNav) | 左侧栏 + 主编辑区 + 右侧面板 |
| 弹窗系统 | Flutter showDialog + 自定义 Widget | AppConfirmModal + ExitConfirmModal + DiffModal 等 |
| 卡片风格 | setting_card 小卡片形式 | 设定分类平铺形式 |

### 20.6 配色方案

| 维度 | WriterHelper | 神意助手 |
|------|-------------|----------|
| 主题管理 | Flutter ThemeData (ColorScheme) | theme store + AppearanceSettings.vue |
| 深色模式 | Material 3 dark theme | 有 (theme store) |
| 强调色 | Material 3 primary/secondary/tertiary | CSS 变量定义 |
| 自定义颜色 | custom_color_picker (设定卡片可自定义颜色) | 无 |

### 20.7 界面交互模式

| 维度 | WriterHelper | 神意助手 |
|------|-------------|----------|
| 手势支持 | Flutter GestureDetector (滑动/长按/双击) | 基础鼠标点击 |
| 下拉刷新 | RefreshIndicator | 无 |
| 拖拽排序 | ReorderableListView | pipelineSkills moveUp/moveDown 按钮 |
| 系统托盘 | 有 (深度集成) | 有 (ExitConfirmModal) |
| 通知系统 | flutter_local_notifications | 无 |

### 20.8 美工设计总结

WriterHelper 的 UI 美术体系：
- 基于 Flutter Material 3 设计语言，有统一的设计规范
- AppFlowy Editor 提供 60+ 个 SVG 图标 (桌面+移动端+选区菜单+图片工具栏)
- 有水墨涟漪和拉伸两种自定义着色器，增加视觉精致度
- 桌面+移动双端布局，有底部导航栏
- 有设定卡片自定义颜色选择器
- 有通知系统

神意助手的 UI 美术体系：
- 基于 Vue 3 + CSS，自定义配色方案和主题切换
- 工具栏图标使用内联 SVG，编辑器为 textarea 无富文本工具栏
- 无自定义着色器，依赖 CSS transition/animation
- 无 Material Design 规范
- 仅桌面端，无移动端适配
- 有弹窗系统 (AppConfirmModal/ExitConfirmModal/DiffModal 等)
- 有帮助指南 (HelpGuide.vue) 和诊断日志面板 (DiagLogPanel.vue)

关键差距：WriterHelper 的界面美工成熟度明显高于神意助手。Material 3 提供统一视觉规范，AppFlowy Editor 的 60+ 个 SVG 图标让编辑器工具栏丰富完整，自定义着色器增加视觉精致度，双端布局覆盖更多场景。神意助手在界面美工上需要补强：富文本编辑器工具栏图标、统一设计规范、移动端适配。