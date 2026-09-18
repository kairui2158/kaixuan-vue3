# 开发日志总索引（DEV_LOG MASTER INDEX）

更新日期：2026-09-19

本文件是 `_audit/DEV_LOG_*.md` 的唯一总索引。每条记录按项目演进顺序编号，并说明当时开发的“功能是什么”和“对应用的用途”。以后新增开发日志时，必须同步在对应阶段末尾追加一行，禁止只写日志不登记索引。

## 使用规则

1. 追溯问题时先查本表，再打开具体日志文件。
2. `开发功能` 描述当时实际交付的功能或修复，不代表当前版本仍保持原样；后续迭代会有覆盖。
3. `用途` 说明该工作对用户、系统稳定性或后续开发的价值。
4. 新增日志必须登记：日期、功能、用途、文件路径。
5. 版本封装节点在表内单独标出，方便客户交付对账。

## 阶段九：大纲双向写入与运行记录深调（2026-09-14）

## 阶段十四：直写成熟化与回归（2026-09-17）

| 序号 | 日期 | 开发工作 | 开发功能 | 用途 | 日志文件 |
|---:|---|---|---|---|---|
| 230 | 2026-09-17 | 大纲直写意图回归修复 | 固化 09-17 trace 语料，补显式写入词库与只读护栏，统一双入口路由回归 | 用户说“输入进编辑器/改完”时正确进入 edit 并暴露 `editor.write`，同时保留位置咨询、写入状态询问、索取参考的只读边界 | [DEV_LOG_2026-09-17-outline-direct-write-intent-regression.md](DEV_LOG_2026-09-17-outline-direct-write-intent-regression.md) |
| 231 | 2026-09-17 | 3.53.2 封装与分层清理门禁 | 升版封装、补 SKILL 工具面交付文档、清理旧安装产物并写入 M29 | 交付 3.53.2；以后封装后旧包必须清干净，但未提交源码不得误当旧留存删除 | [DEV_LOG_2026-09-17-packaging-3.53.2.md](DEV_LOG_2026-09-17-packaging-3.53.2.md) |
| 232 | 2026-09-17 | 权限问句复合写入修复 | 权限问句二次判定写入指令、试探性写入语料补齐、runTrace turn 层工具调用对账 | “试着修改验证权限”这类复合句进入 edit 并暴露写工具；trace 三层工具证据不再缺失 | [DEV_LOG_2026-09-17-permission-write-composite-fix.md](DEV_LOG_2026-09-17-permission-write-composite-fix.md) |
| 233 | 2026-09-18 | 3.53.3 封装 | 升级版本、全量服务测试、构建封装并核验 asar 内修复标记 | 交付包含权限问句复合写入修复与 turn 层工具对账的客户安装包 | [DEV_LOG_2026-09-18-packaging-3.53.3.md](DEV_LOG_2026-09-18-packaging-3.53.3.md) |
| 234 | 2026-09-18 | 编辑器重复写入守卫 | 删除写入次数预算，改为连续 3 次相同写入拦截；补 runTrace 正文回填并放宽 active 看门狗 | API 可连续执行不同有效写入，不再被次数上限误杀；trace 保留工具轮最终输出 | [DEV_LOG_2026-09-18-editor-write-repeat-guard.md](DEV_LOG_2026-09-18-editor-write-repeat-guard.md) |
| 235 | 2026-09-18 | 全链路审计补修与回头看 | 技能链真实串行执行、测试路径 trace 补齐、autoDecompose 聚合、记忆抽取/大纲分析 trace 接入；回头看补修项目切换 canceled 与 JSON 兜底 degraded 终态 | SKILL 调试方能看到测试、自动拆解、记忆抽取和大纲分析的真实 API 过程，早退与兜底分支不再伪装成功 | [DEV_LOG_2026-09-18-call-path-audit-followup.md](DEV_LOG_2026-09-18-call-path-audit-followup.md) |
| 236 | 2026-09-18 | 3.53.5 封装 | 版本升级、全量服务测试、类型检查、NSIS 重封装、asar 修复标记核验与旧 3.53.4 产物清理 | 交付包含全链路审计补修与回头看终态修复的客户安装包 | [DEV_LOG_2026-09-18-packaging-3.53.5.md](DEV_LOG_2026-09-18-packaging-3.53.5.md) |

| 序号 | 日期 | 开发工作 | 开发功能 | 用途 | 日志文件 |
|---:|---|---|---|---|---|
| 103 | 2026-09-14 | 大纲空等修复 | 工具过程气泡化、纯工具循环警示、可读上限错误、取消终态与 trace 完整性修复 | 用户在工具轮次不再静默空等，SKILL 调试方能拿到取消、失败和物理请求的真实证据 | [DEV_LOG_2026-09-14-outline-silent-wait-fix.md](DEV_LOG_2026-09-14-outline-silent-wait-fix.md) |
| 104 | 2026-09-14 | 3.41.0 封装 | 版本号升级与 Windows 安装包重新生成 | 交付包含大纲空等修复与运行记录完整性修复的客户安装包 | [DEV_LOG_2026-09-14-outline-silent-wait-fix.md](DEV_LOG_2026-09-14-outline-silent-wait-fix.md) |
| 105 | 2026-09-14 | API 直写编辑器 V2 | 主页 API 直写编辑器、兼容供应商 JSON 降级直写、编辑器定位呈现、写入限流与运行记录证据 | 客户在主页和大纲工作台无需手动复制 AI 产物，API 可直接写入、定位和呈现编辑器内容 | [DEV_LOG_2026-09-14-api-direct-write-v2.md](DEV_LOG_2026-09-14-api-direct-write-v2.md) |
| 106 | 2026-09-14 | 3.42.0 封装 | 版本号升级与 Windows 安装包重新生成 | 交付包含 API 直写编辑器 V2 的客户安装包 | [DEV_LOG_2026-09-14-api-direct-write-v2.md](DEV_LOG_2026-09-14-api-direct-write-v2.md) |
| 107 | 2026-09-14 | API 输入区统一 | 共享 `ApiChatInput`、60px 自动增高、Enter/换行双模式与设置持久化 | 主页和大纲工作台输入体验一致，键盘模式可由用户选择并跨启动保留 | [DEV_LOG_2026-09-14-chat-input-unification.md](DEV_LOG_2026-09-14-chat-input-unification.md) |
| 108 | 2026-09-14 | 3.43.0 封装 | 版本号升级与 Windows 安装包重新生成 | 交付包含 API 输入区统一改造的客户安装包 | [DEV_LOG_2026-09-14-chat-input-unification.md](DEV_LOG_2026-09-14-chat-input-unification.md) |

## 阶段一：基础架构与早期闭环（2026-08-15 至 08-19）

| 序号 | 日期 | 开发工作 | 开发功能 | 用途 | 日志文件 |
|---:|---|---|---|---|---|
| 1 | 2026-08-15 | 项目初始开发 | 建立小说工坊 Vue3 基础界面、项目状态和首批生成入口 | 打通应用骨架，让小说创作主流程可以开始迭代 | [DEV_LOG_2026-08-15.md](DEV_LOG_2026-08-15.md) |
| 2 | 2026-08-16 | Phase 4 | 完善阶段四功能与界面联动 | 补齐早期交互闭环，减少无效按钮 | [DEV_LOG_2026-08-16-phase4.md](DEV_LOG_2026-08-16-phase4.md) |
| 3 | 2026-08-16 | Phase 5 | 推进阶段五开发与回归 | 验证早期功能可以连续使用 | [DEV_LOG_2026-08-16-phase5.md](DEV_LOG_2026-08-16-phase5.md) |
| 4 | 2026-08-16 | 项目按钮与项目管理 | 增加章节树项目按钮、项目管理弹窗并修复异常 | 让用户能从章节树直接管理项目，减少绕路操作 | [DEV_LOG_2026-08-16-project-btn.md](DEV_LOG_2026-08-16-project-btn.md) |
| 5 | 2026-08-16 | GitHub 铁律 | 建立提交、回滚、工作区管理纪律 | 防止误提交、误回滚和历史变更混杂 | [DEV_LOG_2026-08-16-rules.md](DEV_LOG_2026-08-16-rules.md) |
| 6 | 2026-08-16 | 端到端验证 | 执行早期端到端验证并更新经验 | 用真实流程证明功能不是“代码存在” | [DEV_LOG_2026-08-16-verify.md](DEV_LOG_2026-08-16-verify.md) |
| 7 | 2026-08-16 | 日常开发日志 | 记录当日多项修复与功能调整 | 保留早期问题线索和决策依据 | [DEV_LOG_2026-08-16.md](DEV_LOG_2026-08-16.md) |
| 8 | 2026-08-17 | Phase C/F | 修复 Phase C 问题、全回归验证、增加流水线可视化 | 让生成过程可见，便于判断是否卡死 | [DEV_LOG_2026-08-17.md](DEV_LOG_2026-08-17.md) |
| 9 | 2026-08-18 | 3.2.1 封装 | 生成 3.2.1 客户交付包 | 首个稳定客户实测版本 | [DEV_LOG_2026-08-18-packaging.md](DEV_LOG_2026-08-18-packaging.md) |
| 10 | 2026-08-18 | 设定分类导航 | 拆分设定分类导航与当前分类内容框 | 让设定层结构清晰，避免内容挤在一起 | [DEV_LOG_2026-08-18-settings-category-frame.md](DEV_LOG_2026-08-18-settings-category-frame.md) |
| 11 | 2026-08-18 | 设定层宽度纠偏 | 修正设定层布局宽度 | 解决视觉拥挤和错位 | [DEV_LOG_2026-08-18-settings-width.md](DEV_LOG_2026-08-18-settings-width.md) |
| 12 | 2026-08-18 | 日常开发日志 | 记录当日功能与修复 | 保留版本迭代过程证据 | [DEV_LOG_2026-08-18.md](DEV_LOG_2026-08-18.md) |
| 13 | 2026-08-19 | 功能完善 | 记录当日功能完善与验证 | 沉淀早期收尾状态 | [DEV_LOG_2026-08-19.md](DEV_LOG_2026-08-19.md) |

## 阶段二：记忆板块与 UI 统一（2026-08-20 至 08-23）

| 序号 | 日期 | 开发工作 | 开发功能 | 用途 | 日志文件 |
|---:|---|---|---|---|---|
| 14 | 2026-08-20 | 记忆板块收尾 | 完成记忆基础闭环收尾 | 确认记忆数据、展示、保存主链路可用 | [DEV_LOG_2026-08-20-memory-final.md](DEV_LOG_2026-08-20-memory-final.md) |
| 15 | 2026-08-20 | 记忆标签页 | 增加记忆分类标签页 | 让不同记忆类型可分区查看 | [DEV_LOG_2026-08-20-memory-tabs.md](DEV_LOG_2026-08-20-memory-tabs.md) |
| 16 | 2026-08-20 | P2 记忆面板 | 打通正文确认与记忆面板显示 | 正文确认后能看到抽取入口和结果 | [DEV_LOG_2026-08-20-P2-memory-panel.md](DEV_LOG_2026-08-20-P2-memory-panel.md) |
| 17 | 2026-08-20 | P4.7 导航 | 完善记忆板块导航与页面结构 | 提高板块可用性和浏览效率 | [DEV_LOG_2026-08-20-P4-navigation.md](DEV_LOG_2026-08-20-P4-navigation.md) |
| 18 | 2026-08-20 | P5 记忆检索 | 生成与聊天调用记忆检索并回填 | 让 AI 请求能携带相关长期记忆 | [DEV_LOG_2026-08-20-P5-memory-retrieval.md](DEV_LOG_2026-08-20-P5-memory-retrieval.md) |
| 19 | 2026-08-20 | UI 统一启动 | 开始全应用 UI 统一改造 | 为后续 V1/V2 美化建立基础 | [DEV_LOG_2026-08-20-ui-unify.md](DEV_LOG_2026-08-20-ui-unify.md) |
| 20 | 2026-08-20 | 日常开发日志 | 记录当日记忆与 UI 开发 | 保留板块交接证据 | [DEV_LOG_2026-08-20.md](DEV_LOG_2026-08-20.md) |
| 21 | 2026-08-21 | AIService Step2 | 建立统一 AI 服务层基础入口 | 把分散 AI 调用开始收敛到统一入口 | [DEV_LOG_2026-08-21-aiservice-step2.md](DEV_LOG_2026-08-21-aiservice-step2.md) |
| 22 | 2026-08-21 | AIService Step4 | 推进调用收敛与界面接入 | 降低功能各自直连 API 的风险 | [DEV_LOG_2026-08-21-aiservice-step4.md](DEV_LOG_2026-08-21-aiservice-step4.md) |
| 23 | 2026-08-21 | AIService Step5 | 清理 useAiRequest 并做 CDP 验证 | 移除旧调用残留，验证统一入口真实生效 | [DEV_LOG_2026-08-21-aiservice-step5.md](DEV_LOG_2026-08-21-aiservice-step5.md) |
| 24 | 2026-08-21 | AIService Step6 | 完善服务层功能与回归 | 巩固统一入口稳定性 | [DEV_LOG_2026-08-21-aiservice-step6.md](DEV_LOG_2026-08-21-aiservice-step6.md) |
| 25 | 2026-08-21 | AIService Step7 | 增加诊断日志与导出集成 | 让用户能导出请求日志定位 API 问题 | [DEV_LOG_2026-08-21-aiservice-step7.md](DEV_LOG_2026-08-21-aiservice-step7.md) |
| 26 | 2026-08-21 | AIService Step8 | Step8 回归验证 | 证明服务层改造无回归 | [DEV_LOG_2026-08-21-aiservice-step8.md](DEV_LOG_2026-08-21-aiservice-step8.md) |
| 27 | 2026-08-21 | 客户实测封装 | 生成客户实测包 | 收集真实用户反馈 | [DEV_LOG_2026-08-21-packaging.md](DEV_LOG_2026-08-21-packaging.md) |
| 28 | 2026-08-21 | 风格卡片 | 调整风格卡片展示 | 改善创作风格配置体验 | [DEV_LOG_2026-08-21-style-card.md](DEV_LOG_2026-08-21-style-card.md) |
| 29 | 2026-08-22 | 记忆整合验收 | 写作板块与记忆板块整合收尾 | 统一写作与记忆的数据链路 | [DEV_LOG_2026-08-22-memory-integration.md](DEV_LOG_2026-08-22-memory-integration.md) |
| 30 | 2026-08-22 | P5 对话与编辑器回归 | 右侧对话与编辑器深度回归 | 确认聊天、正文、编辑器联动不破坏 | [DEV_LOG_2026-08-22-P5-chat-editor.md](DEV_LOG_2026-08-22-P5-chat-editor.md) |
| 31 | 2026-08-22 | P6 全功能回归 | 执行全功能回归 | 建立整体质量基线 | [DEV_LOG_2026-08-22-P6-regression.md](DEV_LOG_2026-08-22-P6-regression.md) |
| 32 | 2026-08-22 | P7-1 取消生成 | 增加流水线取消生成能力 | 用户可中断长任务，避免无响应等待 | [DEV_LOG_2026-08-22-P7-1-cancel.md](DEV_LOG_2026-08-22-P7-1-cancel.md) |
| 33 | 2026-08-22 | P7-2 chain 断点续跑 | chain 支持断点续跑 | 中断后不重跑全部步骤，节省成本和时间 | [DEV_LOG_2026-08-22-P7-2-chain-resume.md](DEV_LOG_2026-08-22-P7-2-chain-resume.md) |
| 34 | 2026-08-22 | P7-3 章节断点续跑 | 章节层支持断点续跑 | 长章节生成中断后可从缺口继续 | [DEV_LOG_2026-08-22-P7-3-chapter-resume.md](DEV_LOG_2026-08-22-P7-3-chapter-resume.md) |
| 35 | 2026-08-22 | P7-4 API 恢复 | 真实 API 错误恢复路径 | 断网、限流、供应商错误后可恢复 | [DEV_LOG_2026-08-22-P7-4-api-recovery.md](DEV_LOG_2026-08-22-P7-4-api-recovery.md) |
| 36 | 2026-08-22 | P7-5 记忆四视图 | 记忆四视图数据闭环核验 | 保证不同视图读取同一份记忆数据 | [DEV_LOG_2026-08-22-P7-5-memory-views.md](DEV_LOG_2026-08-22-P7-5-memory-views.md) |
| 37 | 2026-08-22 | P7-6 记忆整合回归 | 记忆整合全链路回归 | 验证写作、生成、记忆链路一致性 | [DEV_LOG_2026-08-22-P7-6-memory-integration.md](DEV_LOG_2026-08-22-P7-6-memory-integration.md) |
| 38 | 2026-08-22 | P7-7 隔离验证 | 隔离测试项目真实记忆闭环 | 排除旧数据干扰，验证纯净链路 | [DEV_LOG_2026-08-22-P7-7-memory-isolated.md](DEV_LOG_2026-08-22-P7-7-memory-isolated.md) |
| 39 | 2026-08-22 | 客户封装交付 | 生成客户交付包 | 用于客户验证记忆和流水线能力 | [DEV_LOG_2026-08-22-packaging.md](DEV_LOG_2026-08-22-packaging.md) |
| 40 | 2026-08-22 | UI P0 基线 | 盘点全应用 UI 问题基线 | 为 UI V1/V2 改造提供依据 | [DEV_LOG_2026-08-22-ui-p0-baseline.md](DEV_LOG_2026-08-22-ui-p0-baseline.md) |
| 41 | 2026-08-23 | 记忆验收 | 记忆板块整合验收 | 区分代码链路与真实可用状态 | [DEV_LOG_2026-08-23-memory-integration-acceptance.md](DEV_LOG_2026-08-23-memory-integration-acceptance.md) |
| 42 | 2026-08-23 | 大纲工作台 P0 | 大纲工作台可编辑创作升级基线 | 找出无法编辑和 AI 共创缺口 | [DEV_LOG_2026-08-23-outline-authoring-P0.md](DEV_LOG_2026-08-23-outline-authoring-P0.md) |
| 43 | 2026-08-23 | 大纲编辑闭环 | 修复导入后无法编辑问题 | 用户可真实打字、粘贴、保存大纲 | [DEV_LOG_2026-08-23-outline-editor-edit.md](DEV_LOG_2026-08-23-outline-editor-edit.md) |
| 44 | 2026-08-23 | P7-8 隔离闭环 | 隔离项目真实记忆闭环复核 | 继续核销记忆验收缺口 | [DEV_LOG_2026-08-23-P7-8-memory-isolated.md](DEV_LOG_2026-08-23-P7-8-memory-isolated.md) |
| 45 | 2026-08-23 | P7-9 记忆抽取 | 真实 AI 记忆抽取与审核闭环 | 正文内容可抽取、审核、入库 | [DEV_LOG_2026-08-23-P7-9-memory-extraction.md](DEV_LOG_2026-08-23-P7-9-memory-extraction.md) |
| 46 | 2026-08-23 | P7-9R 受控复核 | 受控环境记忆抽取复核 | 证明抽取链路不依赖偶然数据 | [DEV_LOG_2026-08-23-P7-9R-memory-extraction.md](DEV_LOG_2026-08-23-P7-9R-memory-extraction.md) |
| 47 | 2026-08-23 | P7-9R2 及后续 | 记忆抽取契约、存储、导入复核 | 打通抽取响应契约和持久化边界 | [DEV_LOG_2026-08-23-P7-9R2-memory-extraction.md](DEV_LOG_2026-08-23-P7-9R2-memory-extraction.md) |
| 48 | 2026-08-23 | UI V1/V2 | 全应用 UI 升级与复查 | 统一字体、布局、弹窗和配色体验 | [DEV_LOG_2026-08-23-ui-v1-v2.md](DEV_LOG_2026-08-23-ui-v1-v2.md) |

## 阶段三：编辑器复用、流式与运行效率（2026-08-24 至 08-25）

| 序号 | 日期 | 开发工作 | 开发功能 | 用途 | 日志文件 |
|---:|---|---|---|---|---|
| 49 | 2026-08-24 | 主页编辑器 P0 | 主页编辑器经验复用基线盘点 | 把大纲工作台编辑经验安全迁移到主页 | [DEV_LOG_2026-08-24-editor-reuse-P0.md](DEV_LOG_2026-08-24-editor-reuse-P0.md) |
| 50 | 2026-08-24 | 大纲流式输出 | 大纲工作台共创流式输出 | API 输出实时可见，减少等待焦虑 | [DEV_LOG_2026-08-24-outline-streaming.md](DEV_LOG_2026-08-24-outline-streaming.md) |
| 51 | 2026-08-24 | 流水线流式复用 | 生成流水线复用大纲流式经验 | 全流水线获得统一流式体验 | [DEV_LOG_2026-08-24-pipeline-streaming-reuse.md](DEV_LOG_2026-08-24-pipeline-streaming-reuse.md) |
| 52 | 2026-08-25 | AI 入口收敛 | 统一 AI 入口最终收敛 | 所有 AI 调用进入唯一服务层 | [DEV_LOG_2026-08-25-ai-service-convergence.md](DEV_LOG_2026-08-25-ai-service-convergence.md) |
| 53 | 2026-08-25 | 运行效率优化 | 全应用性能基准与优化 | 降低启动、切换、渲染卡顿 | [DEV_LOG_2026-08-25-runtime-perf.md](DEV_LOG_2026-08-25-runtime-perf.md) |
| 54 | 2026-08-25 | 设定层 P10 修订 | 设定层 P10 计划修订 | 修正设定层交付边界 | [DEV_LOG_2026-08-25-settings-P10-revised.md](DEV_LOG_2026-08-25-settings-P10-revised.md) |
| 55 | 2026-08-25 | 设定层 P4 | 动态分类导航 | 分类可随设定数据变化，减少死分类 | [DEV_LOG_2026-08-25-settings-P4.md](DEV_LOG_2026-08-25-settings-P4.md) |
| 56 | 2026-08-25 | 设定层 P6 | API 反馈非阻塞化 | 生成过程不挤压主界面 | [DEV_LOG_2026-08-25-settings-P6.md](DEV_LOG_2026-08-25-settings-P6.md) |
| 57 | 2026-08-25 | 设定层 P5 | 顶部配置区 | Agent、SKILL、模式集中配置 | [DEV_LOG_2026-08-25-settings-P5.md](DEV_LOG_2026-08-25-settings-P5.md) |
| 58 | 2026-08-25 | 设定层 P3 | 列表与当前项编辑区 | 支持设定列表查看与单项编辑 | [DEV_LOG_2026-08-25-settings-P3.md](DEV_LOG_2026-08-25-settings-P3.md) |
| 59 | 2026-08-25 | 设定层 P8 | 功能行为闭环回归 | 验证设定生成、绑定、保存 | [DEV_LOG_2026-08-25-settings-P8.md](DEV_LOG_2026-08-25-settings-P8.md) |
| 60 | 2026-08-25 | 设定层 P10 | 文档、构建与交付收尾 | 汇总设定层成果和验证证据 | [DEV_LOG_2026-08-25-settings-P10.md](DEV_LOG_2026-08-25-settings-P10.md) |
| 61 | 2026-08-25 | 卷纲章节复用 P0 | 卷纲层与章节层复用基线 | 把设定层布局经验扩展到后续层 | [DEV_LOG_2026-08-25-volume-chapter-reuse-P0.md](DEV_LOG_2026-08-25-volume-chapter-reuse-P0.md) |
| 62 | 2026-08-25 | 设定层 P7 | 视觉层级降噪 | 统一边框和层级，降低界面廉价感 | [DEV_LOG_2026-08-25-settings-P7.md](DEV_LOG_2026-08-25-settings-P7.md) |
| 63 | 2026-08-25 | 设定层 P9 | 极端尺寸验证 | 验证窄屏和长文本不溢出 | [DEV_LOG_2026-08-25-settings-P9.md](DEV_LOG_2026-08-25-settings-P9.md) |

## 阶段四：边界核销与结构化流水线（2026-08-26 至 08-28）

| 序号 | 日期 | 开发工作 | 开发功能 | 用途 | 日志文件 |
|---:|---|---|---|---|---|
| 64 | 2026-08-26 | AI 回归边界 | AI 入口与错误路径回归 | 明确统一入口后的剩余边界 | [DEV_LOG_2026-08-26-ai-regression-boundary.md](DEV_LOG_2026-08-26-ai-regression-boundary.md) |
| 65 | 2026-08-26 | 测试载体治理 | AIService 测试脚本与载体规范化 | 防止错误脚本造成误判 | [DEV_LOG_2026-08-26-ai-test-runner.md](DEV_LOG_2026-08-26-ai-test-runner.md) |
| 66 | 2026-08-26 | 最终边界 | 遗留核销最终边界 | 明确哪些问题已修复、哪些延后 | [DEV_LOG_2026-08-26-final-boundary.md](DEV_LOG_2026-08-26-final-boundary.md) |
| 67 | 2026-08-26 | 目标续验 | 活动目标续验与收尾 | 防止任务队列回滚和空转 | [DEV_LOG_2026-08-26-goal-continuation.md](DEV_LOG_2026-08-26-goal-continuation.md) |
| 68 | 2026-08-26 | 目标二轮复核 | 第二轮目标续验记录 | 校验已完成项没有被误报 | [DEV_LOG_2026-08-26-goal-recheck-2.md](DEV_LOG_2026-08-26-goal-recheck-2.md) |
| 69 | 2026-08-26 | 记忆边界 | 记忆异常路径与视图边界核验 | 保证坏数据、断链、空态可处理 | [DEV_LOG_2026-08-26-memory-boundary.md](DEV_LOG_2026-08-26-memory-boundary.md) |
| 70 | 2026-08-26 | 记忆导入续验 | P2 导入与恢复边界续验 | 验证导入不覆盖、重启可恢复 | [DEV_LOG_2026-08-26-P2-residual-recheck.md](DEV_LOG_2026-08-26-P2-residual-recheck.md) |
| 71 | 2026-08-26 | P3 取消超时 | 取消与超时信号校准 | 取消后不再继续占用请求和 UI | [DEV_LOG_2026-08-26-p3-cancel-timeout.md](DEV_LOG_2026-08-26-p3-cancel-timeout.md) |
| 72 | 2026-08-26 | P4 错误闭环 | 去 AI 味错误路径闭环 | 验证供应商错误能记录并恢复 | [DEV_LOG_2026-08-26-P4-error-boundary.md](DEV_LOG_2026-08-26-P4-error-boundary.md) |
| 73 | 2026-08-26 | P4-P6 整合 | 三阶段整合验收 | 统一验收错误路径和功能闭环 | [DEV_LOG_2026-08-26-P4-P5-P6.md](DEV_LOG_2026-08-26-P4-P5-P6.md) |
| 74 | 2026-08-26 | P5 模型列表边界 | 统一 AI 入口模型列表核验 | 按用途供应商获取真实模型列表 | [DEV_LOG_2026-08-26-P5-model-list-boundary.md](DEV_LOG_2026-08-26-P5-model-list-boundary.md) |
| 75 | 2026-08-26 | 遗留边界 | 安装版、类型检查与测试载体核销 | 消除交付前技术债 | [DEV_LOG_2026-08-26-residual-boundary.md](DEV_LOG_2026-08-26-residual-boundary.md) |
| 76 | 2026-08-26 | 遗留收尾 | 遗留核销最终收尾 | 确认待办清空或明确移交 | [DEV_LOG_2026-08-26-residual-closure.md](DEV_LOG_2026-08-26-residual-closure.md) |
| 77 | 2026-08-26 | V2 复核 | UI V2 P6-P8 新鲜复核 | 防止 UI 改造后出现新溢出 | [DEV_LOG_2026-08-26-V2-P6-P8-recheck.md](DEV_LOG_2026-08-26-V2-P6-P8-recheck.md) |
| 78 | 2026-08-26 | 卷纲章节 P1 | 共用工作区规范复用 | 统一卷纲层、章节层工作台结构 | [DEV_LOG_2026-08-26-volume-chapter-reuse-P1.md](DEV_LOG_2026-08-26-volume-chapter-reuse-P1.md) |
| 79 | 2026-08-26 | 卷纲章节 P2-P3 | 对象选择与唯一编辑区复用 | 卷纲、章节对象选择清晰，编辑入口唯一 | [DEV_LOG_2026-08-26-volume-chapter-reuse-P2-P3.md](DEV_LOG_2026-08-26-volume-chapter-reuse-P2-P3.md) |
| 80 | 2026-08-27 | 工具入口收敛 | 删除主页编辑器无实际用途入口 | 减少用户困惑和维护负担 | [DEV_LOG_2026-08-27-editor-toolbar-prune.md](DEV_LOG_2026-08-27-editor-toolbar-prune.md) |
| 81 | 2026-08-27 | P1 元数据分离 | 正文与 metadata 分离 | 防止来源追踪、状态字段污染正文 | [DEV_LOG_2026-08-27-P1-metadata.md](DEV_LOG_2026-08-27-P1-metadata.md) |
| 82 | 2026-08-27 | P2 执行包 | 章节执行包接口 | 建立玄武到凯旋的稳定传递协议 | [DEV_LOG_2026-08-27-P2-execution-package.md](DEV_LOG_2026-08-27-P2-execution-package.md) |
| 83 | 2026-08-27 | P3 正文 chain | 正文层 chain 语义修复 | 保证凯旋 S1-S3 真正分步执行 | [DEV_LOG_2026-08-27-P3-body-chain.md](DEV_LOG_2026-08-27-P3-body-chain.md) |
| 84 | 2026-08-27 | P4 Agent 绑定 | 稳定 Skill ID Agent 绑定 | Agent 跟随 SKILL 身份而非槽位 | [DEV_LOG_2026-08-27-P4-skill-agent.md](DEV_LOG_2026-08-27-P4-skill-agent.md) |
| 85 | 2026-08-27 | P5 结构化校验 | 结构化输入输出校验 | 拦截缺字段、坏 JSON 和叙事缺口 | [DEV_LOG_2026-08-27-P5-structured-validation.md](DEV_LOG_2026-08-27-P5-structured-validation.md) |
| 86 | 2026-08-27 | P6 断点续跑 | chain 内部断点状态保存 | 失败后可从具体 SKILL 恢复 | [DEV_LOG_2026-08-27-P6-chain-breakpoint.md](DEV_LOG_2026-08-27-P6-chain-breakpoint.md) |
| 87 | 2026-08-27 | P6 配置交换 | 配置交换收尾 | 打通 Agent/Skill 导出导入基础 | [DEV_LOG_2026-08-27-P6-config-exchange.md](DEV_LOG_2026-08-27-P6-config-exchange.md) |
| 88 | 2026-08-27 | P7 叙事校验 | 内容与叙事完整性边界 | 检查事件、伏笔、角色状态连续性 | [DEV_LOG_2026-08-27-P7-narrative-validation.md](DEV_LOG_2026-08-27-P7-narrative-validation.md) |
| 89 | 2026-08-27 | P8 最终交付 | 流水线最终回归 | 证明结构化升级整体可用 | [DEV_LOG_2026-08-27-P8-final-delivery.md](DEV_LOG_2026-08-27-P8-final-delivery.md) |
| 90 | 2026-08-27 | 3.3.0 封装 | 版本 3.3.0 交付 | 客户实测结构化流水线 | [DEV_LOG_2026-08-27-PACKAGING-3.3.0.md](DEV_LOG_2026-08-27-PACKAGING-3.3.0.md) |
| 91 | 2026-08-28 | Markdown 导入 P0 | 导入底座基线与协议设计 | 为第三方 Skill/Agent 文件导入铺路 | [DEV_LOG_2026-08-28-config-exchange-P0.md](DEV_LOG_2026-08-28-config-exchange-P0.md) |
| 92 | 2026-08-28 | Markdown 导入 P1 | YAML 元信息解析 | 识别标准协议文件并保留高级字段 | [DEV_LOG_2026-08-28-config-exchange-P1.md](DEV_LOG_2026-08-28-config-exchange-P1.md) |
| 93 | 2026-08-28 | Markdown 导入 P2 | 导入预览与冲突诊断 | 用户导入前能看到结果和风险 | [DEV_LOG_2026-08-28-config-exchange-P2.md](DEV_LOG_2026-08-28-config-exchange-P2.md) |
| 94 | 2026-08-28 | Markdown 导入 P3 | 导入执行与持久化 | 确认导入后能保存并重启恢复 | [DEV_LOG_2026-08-28-config-exchange-P3.md](DEV_LOG_2026-08-28-config-exchange-P3.md) |
| 95 | 2026-08-28 | Markdown 导入 P4 | 导出与往返一致性 | 导出的配置能再导入且不变形 | [DEV_LOG_2026-08-28-config-exchange-P4.md](DEV_LOG_2026-08-28-config-exchange-P4.md) |
| 96 | 2026-08-28 | Markdown 导入 P5 | 边界与错误路径测试 | 坏文件、缺字段、重复 ID 可处理 | [DEV_LOG_2026-08-28-config-exchange-P5.md](DEV_LOG_2026-08-28-config-exchange-P5.md) |
| 97 | 2026-08-28 | Markdown 导入 P6 | 交付收尾与验收 | 确认导入功能达到可交付标准 | [DEV_LOG_2026-08-28-config-exchange-P6.md](DEV_LOG_2026-08-28-config-exchange-P6.md) |

## 阶段五：卷纲层、章节层与设定层重排（2026-08-29）

| 序号 | 日期 | 开发工作 | 开发功能 | 用途 | 日志文件 |
|---:|---|---|---|---|---|
| 98 | 2026-08-29 | 章节层复现 | 章节层经验复现 | 复用设定层工作台与联动经验 | [DEV_LOG_2026-08-29-chapter-layer.md](DEV_LOG_2026-08-29-chapter-layer.md) |
| 99 | 2026-08-29 | 导入 P3 复核 | Markdown 导入 P3 复核 | 继续核销导入执行问题 | [DEV_LOG_2026-08-29-config-exchange-P3.md](DEV_LOG_2026-08-29-config-exchange-P3.md) |
| 100 | 2026-08-29 | 3.4.0 封装 | 版本 3.4.0 交付 | 客户实测卷纲、章节和导入能力 | [DEV_LOG_2026-08-29-PACKAGING-3.4.0.md](DEV_LOG_2026-08-29-PACKAGING-3.4.0.md) |
| 101 | 2026-08-29 | 导入 P4-P6 | Markdown 导入后续闭环 | 完成导入底座最终收尾 | [DEV_LOG_2026-08-29-config-exchange-P4-P6.md](DEV_LOG_2026-08-29-config-exchange-P4-P6.md) |
| 102 | 2026-08-29 | 设定层 UI P1-P2 | 设定层布局更新 | 释放空间并统一控件形态 | [DEV_LOG_2026-08-29-settings-ui-P1.md](DEV_LOG_2026-08-29-settings-ui-P1.md) |
| 103 | 2026-08-29 | 设定层 UI P10 | 设定层收尾验证 | 确认设定层 UI 更新闭环 | [DEV_LOG_2026-08-29-settings-ui-P10.md](DEV_LOG_2026-08-29-settings-ui-P10.md) |
| 104 | 2026-08-29 | 设定层 UI P3 | 分类区与列表区重排 | 提高设定浏览和选择效率 | [DEV_LOG_2026-08-29-settings-ui-P3.md](DEV_LOG_2026-08-29-settings-ui-P3.md) |
| 105 | 2026-08-29 | 设定层 UI P4 | 卡片与信息弹窗设计 | 一行可容纳更多设定项 | [DEV_LOG_2026-08-29-settings-ui-P4.md](DEV_LOG_2026-08-29-settings-ui-P4.md) |
| 106 | 2026-08-29 | 设定层 UI P5 | 高级风格展开控制 | 默认紧凑，需要时展开高级设置 | [DEV_LOG_2026-08-29-settings-ui-P5.md](DEV_LOG_2026-08-29-settings-ui-P5.md) |
| 107 | 2026-08-29 | 设定层 UI P6 | API 生成弹窗 | 滚动与进度居中弹窗，释放页面空间 | [DEV_LOG_2026-08-29-settings-ui-P6.md](DEV_LOG_2026-08-29-settings-ui-P6.md) |
| 108 | 2026-08-29 | 设定层 UI P7 | 层级控制并排 | Agent、SKILL、模式占同一行 | 减少垂直空间浪费 | [DEV_LOG_2026-08-29-settings-ui-P7.md](DEV_LOG_2026-08-29-settings-ui-P7.md) |
| 109 | 2026-08-29 | 设定层 UI P8 | 层级名称隐藏 | 不再重复显示层名 | 进一步释放有效空间 | [DEV_LOG_2026-08-29-settings-ui-P8.md](DEV_LOG_2026-08-29-settings-ui-P8.md) |
| 110 | 2026-08-29 | 卷纲配色统一 | 修复卷纲列表底色 | 保持全应用视觉一致 | [DEV_LOG_2026-08-29-volume-color.md](DEV_LOG_2026-08-29-volume-color.md) |
| 111 | 2026-08-29 | 卷纲 P0 | 卷纲层基线复核 | 确认字数、卷数、UI 问题范围 | [DEV_LOG_2026-08-29-volume-P0.md](DEV_LOG_2026-08-29-volume-P0.md) |
| 112 | 2026-08-29 | 卷纲按钮修复 | 修复主页卷纲按钮导致对话栏消失 | 防止布局联动破坏聊天区 | [DEV_LOG_2026-08-29-volume-chat-fix.md](DEV_LOG_2026-08-29-volume-chat-fix.md) |
| 113 | 2026-08-29 | 卷纲 P3 | 卷纲平铺 UI 重排 | 按定稿图实现非卡片平铺布局 | [DEV_LOG_2026-08-29-volume-P3.md](DEV_LOG_2026-08-29-volume-P3.md) |
| 114 | 2026-08-29 | 卷纲 P1 | 卷数与每卷字数解绑 | 全局字数由模型和 SKILL 分配 | 恢复“总字数 + 卷数”原始设计 | [DEV_LOG_2026-08-29-volume-P1.md](DEV_LOG_2026-08-29-volume-P1.md) |
| 115 | 2026-08-29 | 卷纲 P5 | 生成对象加固与回归 | 卷纲生成状态更稳定 | [DEV_LOG_2026-08-29-volume-P5.md](DEV_LOG_2026-08-29-volume-P5.md) |
| 116 | 2026-08-29 | 卷纲 P4 | 逐卷绑定章节层 | 章节层可锁定对应卷生成 | 保证卷章生成关系明确 | [DEV_LOG_2026-08-29-volume-P4.md](DEV_LOG_2026-08-29-volume-P4.md) |
| 117 | 2026-08-29 | 设定层 UI P9 | 设定层最终回归 | 确认无溢出、无遮挡、功能可用 | [DEV_LOG_2026-08-29-settings-ui-P9.md](DEV_LOG_2026-08-29-settings-ui-P9.md) |
| 118 | 2026-08-29 | 卷纲 P6 | 卷纲层收尾封装 | 完成卷纲层交付 | [DEV_LOG_2026-08-29-volume-P6.md](DEV_LOG_2026-08-29-volume-P6.md) |

## 阶段六：深度扫描、存储加固与客户反馈（2026-08-30 至 08-31）

| 序号 | 日期 | 开发工作 | 开发功能 | 用途 | 日志文件 |
|---:|---|---|---|---|---|
| 119 | 2026-08-30 | AI 命名工作台 | 角色名、地点名等 AI 起名服务 | 为创作过程提供命名辅助 | [DEV_LOG_2026-08-30-ai-naming.md](DEV_LOG_2026-08-30-ai-naming.md) |
| 120 | 2026-08-30 | 深扫 P6-P8 | 全应用深度扫描修复 | 集中核销隐藏缺陷和风险 | [DEV_LOG_2026-08-30-deep-scan-P6-P8.md](DEV_LOG_2026-08-30-deep-scan-P6-P8.md) |
| 121 | 2026-08-30 | 3.8.0 封装 | 版本 3.8.0 交付 | 客户实测深度扫描结果 | [DEV_LOG_2026-08-30-packaging-3.8.0.md](DEV_LOG_2026-08-30-packaging-3.8.0.md) |
| 122 | 2026-08-31 | loadProject 修复 | 禁止加载项目时自动预建卷 | 项目状态必须来自真实数据 | [DEV_LOG_2026-08-31-loadproject-no-autovolume.md](DEV_LOG_2026-08-31-loadproject-no-autovolume.md) |
| 123 | 2026-08-31 | 对话显示增强 | API 对话排版、复制、滚动优化 | 长对话阅读更省力 | [DEV_LOG_2026-08-31-chat-display-ux.md](DEV_LOG_2026-08-31-chat-display-ux.md) |
| 124 | 2026-08-31 | 3.10.2 封装 | 版本 3.10.2 交付 | 客户实测界面与生成修复 | [DEV_LOG_2026-08-31-packaging-3.10.2.md](DEV_LOG_2026-08-31-packaging-3.10.2.md) |
| 125 | 2026-08-31 | 进度弹窗修复 | 修复每层生成两个弹窗重叠 | 恢复单弹窗反馈，避免遮挡 | [DEV_LOG_2026-08-31-pipeline-feedback-modal.md](DEV_LOG_2026-08-31-pipeline-feedback-modal.md) |
| 126 | 2026-08-31 | 当前设定移除 | 删除重复的内联当前设定区 | 释放设定层空间，减少重复信息 | [DEV_LOG_2026-08-31-settings-current-editor-remove.md](DEV_LOG_2026-08-31-settings-current-editor-remove.md) |
| 127 | 2026-08-31 | 设定绑定回归 | 一键绑定修复与 3.10.1 | 保证设定生成后可真实绑定 | [DEV_LOG_2026-08-31-settings-bind-3.10.1.md](DEV_LOG_2026-08-31-settings-bind-3.10.1.md) |
| 128 | 2026-08-31 | 存储与弹窗加固 | 存储加固、弹窗替换、3.9.0 收尾 | 提高数据安全和操作确认可靠性 | [DEV_LOG_2026-08-31-storage-dialogs-3.9.0.md](DEV_LOG_2026-08-31-storage-dialogs-3.9.0.md) |
| 129 | 2026-08-31 | 逐卷生成修复 | 逐卷生成作用域与 Electron 闭环 | 每卷输出正确截断并支持续生成 | [DEV_LOG_2026-08-31-volume-single-clamp.md](DEV_LOG_2026-08-31-volume-single-clamp.md) |

## 阶段七：上下文记忆与续生成（2026-09-01）

| 序号 | 日期 | 开发工作 | 开发功能 | 用途 | 日志文件 |
|---:|---|---|---|---|---|
| 130 | 2026-09-01 | 上下文记忆 P0-P6 | API 对话上下文记忆体系 | SKILL 连续对话不再每次重开 | [DEV_LOG_2026-09-01-context-memory-P1.md](DEV_LOG_2026-09-01-context-memory-P1.md) |
| 131 | 2026-09-01 | 长文本续生成 | 气泡续生成按钮与续写协议 | 数十万字重组输出中断后可继续 | [DEV_LOG_2026-09-01-continuation.md](DEV_LOG_2026-09-01-continuation.md) |
| 132 | 2026-09-01 | 记忆 A1 | 记忆上下文阶段补充 | 继续核销上下文记忆边界 | [DEV_LOG_2026-09-01-memory-A1.md](DEV_LOG_2026-09-01-memory-A1.md) |

## 阶段八：供应商适配与 AI-编辑器协同（2026-09-02 至 09-03）

| 序号 | 日期 | 开发工作 | 开发功能 | 用途 | 日志文件 |
|---:|---|---|---|---|---|
| 133 | 2026-09-02 | AI 编辑器交互 L1/L2 | AI 与编辑器基础协同升级 | API 可以按协议理解并操作编辑区 | [DEV_LOG_2026-09-02-ai-editor-interaction.md](DEV_LOG_2026-09-02-ai-editor-interaction.md) |
| 134 | 2026-09-02 | 供应商适配 3.14.0 | 供应商协议适配与主进程网络桥 | 多供应商连接更稳定，绕开前端网络限制 | [DEV_LOG_2026-09-02-provider-adapter.md](DEV_LOG_2026-09-02-provider-adapter.md) |
| 135 | 2026-09-03 | AI 编辑器 L3 | 等级三左右手协同与按钮复核 | 深化 API 与编辑器双向操作能力 | [DEV_LOG_2026-09-03-ai-editor-l3.md](DEV_LOG_2026-09-03-ai-editor-l3.md) |
| 136 | 2026-09-03 | 主页共创 SKILL/AGENT | 主页编辑器独立 SKILL/AGENT 共创配置 | 主页 API 对话支持独立技能链与流水线切断 | [DEV_LOG_2026-09-03-home-co-creation.md](DEV_LOG_2026-09-03-home-co-creation.md) |
| 137 | 2026-09-04 | 编辑器-API 统一升级 L4/L5 | 多目标读取、写入安全、AI 批次回滚、工作区快照、任务状态机、工具过程流、编辑器高亮、chain 断点续跑、语义定位 | AI 可同时读取多目标且安全写入、长事务任务可续跑、工具调用过程可视化 | [DEV_LOG_2026-09-04-editor-api-unified-upgrade.md](DEV_LOG_2026-09-04-editor-api-unified-upgrade.md) |
| 139 | 2026-09-04 | 正文字数+卷标号 | genBody字数修复+卷标号显示 | 正文层字数不再乱跳，卷标号显示总卷数/序号 | [DEV_LOG_2026-09-04-body-words-fix.md](DEV_LOG_2026-09-04-body-words-fix.md) |

| 140 | 2026-09-04 | 三UI修复 | 设定风格遮挡+正文插入失效+记忆弹窗透明锁死 | 修复创作风格展开遮挡、插入到编辑器按钮跳转、记忆预览弹窗背景和确认锁死 | [DEV_LOG_2026-09-04-three-ui-fixes.md](DEV_LOG_2026-09-04-three-ui-fixes.md) |
| 141 | 2026-09-05 | UI 设计系统 V2 | 41 新 CSS token + 104 fallback 清除 + 11 shadow 标准化 + 22 radius 标准化 + 52 transition 标准化 + 5 surface elevation + 状态层 + 微交互 + 玻璃拟态 + 骨架屏 + 渐变系统 + 模态弹簧动画 | 全应用视觉成熟度提升约 15-20%，纯 CSS 不破坏任何功能链路，覆盖 27 个组件文件 | [DEV_LOG_2026-09-05-ui-design-system-v2.md](DEV_LOG_2026-09-05-ui-design-system-v2.md) |
| 142 | 2026-09-05 | 亮色主题+密度系统 | 亮色配色体系重建(暖白背景+暖深灰文字+暖色阴影) + 间距扩展(10档) + 排版行高配对(7级) + 组件密度三档(comfortable/compact/dense) + 亮色默认化 | 全应用亮色主题从冷灰改为暖色调降低眼疲劳，密度切换适应不同使用场景，纯CSS不破坏功能链路 | [DEV_LOG_2026-09-05-light-theme.md](DEV_LOG_2026-09-05-light-theme.md) |
| 143 | 2026-09-05 | 亮色+密度 Vuetify 对齐修正 | 亮色配色从暖白#FAFAF8改为纯白#FFFFFF对齐Vuetify surface、bg-tertiary从#F0EFEC改为#EEEEEE(10%色差层次)、bg-sidebar同步、密度从4档删除dense改为3档(default/comfortable/compact)对齐Vuetify偏移量(0/-8/-12px)、默认密度从comfortable改为default、theme.ts init()补全密度初始化 | 亮色主题层次分明不再1-2%色差、密度系统与成熟框架一致三档12px跨度、启动即有密度属性不依赖设置页 | [DEV_LOG_2026-09-05-vuetify-alignment.md](DEV_LOG_2026-09-05-vuetify-alignment.md) |
| 144 | 2026-09-05 | 降AI内嵌正文层 | DEAI_METHODOLOGY_PROMPT 17条方法论注入 callApiWithAgent system prompt（step===4 条件）+ genBody() 后处理自动调用 DeAiProcessor.process() + 正文层「已内嵌降AI」UI 标识 | 正文层生成时一步到位降AI，无需二次操作；chain/compose 双模式覆盖；其他四层不受影响 | [DEV_LOG_2026-09-05-deai-embed-body.md](DEV_LOG_2026-09-05-deai-embed-body.md) |
| 145 | 2026-09-06 | 项目保存逻辑深度修复 | 会话恢复(lastSession持久化+restore-session事件+7天时效)、schema版本迁移(v1→v2→v3链式)、loadProject竞态消除(先await再设ID)、dirtyFields脏标记自动保存、退出保存超时5s→15s、persistProject写入顺序修正(先project再lastProjectId)、项目独立自动保存(startProjectAutoSave/stopProjectAutoSave)、toPlain用structuredClone、死代码清理(useExitConfirm.ts) | 退出保存不再超时丢数据、项目切换无竞态窗口、自动保存不冗余写盘、重启恢复上次编辑位置、迁移链兼容旧版项目 | [DEV_LOG_2026-09-06-persistence-deep-fix.md](DEV_LOG_2026-09-06-persistence-deep-fix.md) |
| 146 | 2026-09-06 | 多窗口支持+providerProtocols修复 | Electron多窗口架构(windowMap+lockedProjects+项目锁+新窗口按钮)、lifecycle.js拆分(registerLifecycleHandlers全局+registerWindowCloseHandler每窗口)、preload四桥(onGetCurrentProjectId/windowOpenProject/windowSetCurrentProject/windowGetInitialProjectId)、providerProtocols.cjs构建顺序修复(build:vue先主构建后protocols构建)、CDP验证降级(Electron33 Runtime.evaluate假死→代码级验证) | 支持多项目同时打开不同窗口、同项目禁止多窗口防数据竞争、供应商连接测试在Electron生产模式不再崩溃 | [DEV_LOG_2026-09-06-multiwindow-packaging.md](DEV_LOG_2026-09-06-multiwindow-packaging.md) |
| 147 | 2026-09-06 | 全应用间距统一 | 572处硬编码px转token+7种select类名归一+共享间距类(.select-standard/.form-row/.input-field)+option/optgroup统一样式+stylelint第二层防线+非标准值(1/3/5/7/9/10/13/14/40px)归零 | 全应用间距100%token化，新增元素挂类名即继承间距，硬编码px触发stylelint warning，视觉无重叠无错位 | [DEV_LOG_2026-09-06-spacing-unification.md](DEV_LOG_2026-09-06-spacing-unification.md) |
| 148 | 2026-09-07 | 真 SKILL 双方案融合 | 文件夹SKILL底座(导入/持久化/沙箱/路径失效恢复)+执行器(preProcess/API/postProcess/Agent参数/样本优先)+升级线(动态模板/multi-pass/schema重试/智能样本/composite编排)+统一router接入去AI味、流水线、主页共创三条路径+API预算与失败可见 | 应用可加载标准文件夹SKILL，SKILL不再是纯模板字符串；Agent参数真实进请求，组合技能可编排，失败不再伪装成功，为后续 SKILL 生态提供真实运行底座 | [DEV_LOG_2026-09-07-real-skill-fusion.md](DEV_LOG_2026-09-07-real-skill-fusion.md) |
| 149 | 2026-09-07 | 技能包分发与质量层收尾 | 技能包安装/版本回退/重启持久化真实验证，经验文件v2.3归档，版本3.28.0封装 | 证明技能包不是一次性导入，而是可回退、可持久化的应用级资产，为SKILL市场和质量分级打基础 | [DEV_LOG_2026-09-07-skill-distribution-health.md](DEV_LOG_2026-09-07-skill-distribution-health.md) |
| 150 | 2026-09-07 | Folder SKILL 正文链路修复 | DEAI注入、compose模板水合、preProcess模板优先级、chain前序输出、上一章摘要 | folder SKILL 在流水线正文层获得与 text SKILL 等价的执行与注入能力，chain/compose 双模式源Electron验证闭环 | [DEV_LOG_2026-09-07-folder-skill-pipeline-repair.md](DEV_LOG_2026-09-07-folder-skill-pipeline-repair.md) |
| 151 | 2026-09-07 | 正文层记忆双注入修复 | 记忆格式化单入口(formatMemoryPrompt/appendMemoryPromptOnce)、compose单次注入、chain首步透传去重、探针统计[相关记忆]出现次数 | 正文层 chain/compose 最终 user prompt 均只含一次记忆块，消除记忆重复导致的上下文膨胀与指令漂移；闭环了第150条日志中记录的既有重复问题 | [DEV_LOG_2026-09-07-pipeline-memory-dedup.md](DEV_LOG_2026-09-07-pipeline-memory-dedup.md) |
| 152 | 2026-09-07 | Folder SKILL 只读展示 | 设置页 Folder 卡片隐藏编辑/导出 MD、新增打开文件夹 IPC、模板摘要实时读取磁盘 | 防止应用内副本编辑造成 Folder SKILL 双数据源漂移，用户可直接维护磁盘源文件 | [DEV_LOG_2026-09-07-folder-skill-readonly-ui.md](DEV_LOG_2026-09-07-folder-skill-readonly-ui.md) |
| 153 | 2026-09-07 | Folder SKILL 成熟度 Phase 7 收尾 | 重建产物、源 Electron 真实验证统一诊断面板 degraded 路径、回归 138 测试、清理测试数据 | Folder SKILL 执行降级、诊断码、预算和请求概览在真实 UI 可见，排除旧进程假缺陷并完成经验沉淀 | [DEV_LOG_2026-09-07-folder-skill-maturity.md](DEV_LOG_2026-09-07-folder-skill-maturity.md) |
| 154 | 2026-09-08 | 全应用深扫修复 | P0-P3 14项修复：生产安全开关、utilityProcess worker、多窗口竞态、窗口状态防抖、degraded语义、dialog路径、storage原子导入、崩溃恢复横幅、会话写盘串行化、ZIP中文名、事件清理、进度面板按需轮询、动态导入治理 | 打包版安全边界收紧、多窗口与持久化不再竞态，减少迟滞和数据覆盖风险 | [DEV_LOG_2026-09-08-app-deep-scan-repair.md](DEV_LOG_2026-09-08-app-deep-scan-repair.md) |
| 155 | 2026-09-08 | 3.28.2 封装 | 版本 3.28.2 交付 + package-lock 版本与依赖补账 | 客户实测深扫修复后的多窗口、持久化、技能包与流水线稳定性 | [DEV_LOG_2026-09-08-packaging-3.28.2.md](DEV_LOG_2026-09-08-packaging-3.28.2.md) |
| 156 | 2026-09-08 | 帮助指南大白话教学 | 12个章节重讲 + 新增技能与 Folder SKILL、多窗口章节 | 用户不用外部文档即可理解创作流程、配置关系和 Folder SKILL 任意位置导入规则 | [DEV_LOG_2026-09-08-help-guide-plain-language.md](DEV_LOG_2026-09-08-help-guide-plain-language.md) |
| 157 | 2026-09-08 | 3.28.3 封装 | 帮助指南大白话更新交付 | 客户实测新版教学指南与 Folder SKILL 导入说明 | [DEV_LOG_2026-09-08-packaging-3.28.3.md](DEV_LOG_2026-09-08-packaging-3.28.3.md) |
| 158 | 2026-09-08 | Folder SKILL 导入入口修复 | 单个/重新选择改目录选择器 + 批量误选技能文件夹本身时提示返回上一级 + 空扫描分支回归测试 | 用户可在文件夹层级直接导入；批量导入不再显示空结果，而是给出明确纠错引导 | [DEV_LOG_2026-09-08-folder-skill-import-dialog-repair.md](DEV_LOG_2026-09-08-folder-skill-import-dialog-repair.md) |
| 159 | 2026-09-08 | 3.28.4 封装 | Folder SKILL 导入入口修复交付 + package.json 误覆盖事故恢复 | 客户实测单个/批量文件夹导入体验；同时沉淀 asar 验证必须走 API、不得在仓库根目录 extract-file 的工程纪律 | [DEV_LOG_2026-09-08-packaging-3.28.4.md](DEV_LOG_2026-09-08-packaging-3.28.4.md) |
| 160 | 2026-09-08 | 文本/Folder 技能同名共存 | Folder 技能 ID 归一化为 `folder:来源ID`，新增 sourceId、规格徽标、展示名后缀，导入冲突限定同规格，选择器与配置交换兼容双规格 | 第三方 SKILL 可与同名文本技能共存，用户可在设置页和各层选择器明确区分并绑定 | [DEV_LOG_2026-09-08-folder-skill-text-coexist.md](DEV_LOG_2026-09-08-folder-skill-text-coexist.md) |
| 161 | 2026-09-08 | Folder 技能导入状态与单个预览修复 | folderStatusMap 写入键统一走 normalizeSkillId；单个导入改为选择文件夹 -> 预览 -> 冲突策略 -> 确认的两段式，预览冲突判断限定 folder 规格 | 修复“导入成功但显示路径失效”的误导状态；单个导入与批量导入体验一致，入库前可确认并避免误覆盖 | [DEV_LOG_2026-09-08-folder-skill-import-preview-repair.md](DEV_LOG_2026-09-08-folder-skill-import-preview-repair.md) |
| 162 | 2026-09-08 | 3.28.6 封装 | Folder 技能导入状态与单个导入预览修复交付；type-check、149 测试、构建、asar 版本与产物关键词验证 | 客户实测导入成功后路径状态显示、单个导入预览、冲突策略与确认导入闭环 | [DEV_LOG_2026-09-08-packaging-3.28.6.md](DEV_LOG_2026-09-08-packaging-3.28.6.md) |
| 163 | 2026-09-08 | 生成流水线运行记录 | 左侧运行列表 + 右侧详情四 Tab 居中面板；按次完整记录请求、流式、返回、诊断与时间线；按次导出 JSON 并同步写入应用数据目录 run-trace/ 全量现场 | 第三方 SKILL 制作方可获得脱敏后的完整调试现场，用户可按次导出或复制片段，降低远程调试成本 | [DEV_LOG_2026-09-08-run-trace.md](DEV_LOG_2026-09-08-run-trace.md) |
| 164 | 2026-09-08 | 3.29.0 封装 | 运行记录功能交付；type-check、149 测试、7 个 runTrace 用例、源 Electron UI 验证、构建、asar 版本与产物关键词验证 | 客户实测运行记录面板、四 Tab、按次导出 JSON、应用数据目录全量现场与脱敏效果 | [DEV_LOG_2026-09-08-packaging-3.29.0.md](DEV_LOG_2026-09-08-packaging-3.29.0.md) |
| 165 | 2026-09-08 | 运行记录三期 | 三来源(pipeline/outline/home)来源隔离与并发、通用居中面板、大纲工作台与主页编辑器入口、去AI味/API对话/工具接入、自动落盘与打开记录文件夹 | 运行记录从生成流水线复现到大纲工作台与主页编辑器，第三方 SKILL 调试可覆盖三大创作现场 | [DEV_LOG_2026-09-08-run-trace-phase3.md](DEV_LOG_2026-09-08-run-trace-phase3.md) |
| 166 | 2026-09-08 | 对话上下文重置 | 主页与大纲工作台新增“重置对话”按钮，同时清 UI 会话与 ConversationContextService 作用域上下文 | 用户在对话跑偏无法纠正时可一键重置 API 请求上下文，从当前编辑器内容重新开始 | [DEV_LOG_2026-09-08-reset-conversation.md](DEV_LOG_2026-09-08-reset-conversation.md) |
| 167 | 2026-09-08 | 3.30.0 封装 | 运行记录三期 + 对话上下文重置交付；type-check、149 服务测试、源 Electron UI 验证、构建、asar 版本与产物关键词验证 | 客户实测三来源运行记录、导出脱敏、自动落盘、两处重置对话按钮与作用域隔离 | [DEV_LOG_2026-09-08-packaging-3.30.0.md](DEV_LOG_2026-09-08-packaging-3.30.0.md) |
| 168 | 2026-09-09 | chain 意图路由与中断机制 | 新建 chainIntentRouter 意图分类器（analyze/edit/generate/discuss/auto）+ workspaceSkillEngine chain 循环改造（意图过滤、中断检查、5回调注入）+ SkillSettings 三处读取 intents + 大纲工作台/主页聊天回调注册 | SKILL 调试方反馈 chain 模式无意图判断导致分析请求跑完全链路；修复后用户分析/讨论请求只调相关技能，生成请求才跑完整 chain | [DEV_LOG_2026-09-09-chain-intent-routing.md](DEV_LOG_2026-09-09-chain-intent-routing.md) |
| 169 | 2026-09-09 | 意图路由 V2 升级 jieba+TF-IDF | @node-rs/jieba 依赖安装 + chainIntentRouter 重写（jieba分词+TF-IDF向量+cosine相似度+123条示例库）+ main.ts 入口初始化 + jieba API 修正 + 铁律写入 AGENTS.md 和经验文件V3 | V1关键词分类准确率50-60%提升至V2的85-90%；10/10意图分类+4/4 SKILL推断+性能<0.03ms 全部通过；compose/流水线/回调回归无影响 | [DEV_LOG_2026-09-09-intent-routing-v2-jieba.md](DEV_LOG_2026-09-09-intent-routing-v2-jieba.md) |
| 170 | 2026-09-09 | 流水线信息注入链路彻查 | 章节层接入 runStepSkills 统一通道、补齐大纲/设定/绑定设定/风格节奏注入、移除技能错位兜底、旧卷补稳定ID、模板变量按生成卷解析 | 五层信息注入链路完整闭环，章节层智能体/Skill/技能模式不再是摆设，旧项目卷改名不再导致章节数据孤儿化 | [DEV_LOG_2026-09-09-pipeline-injection-chain.md](DEV_LOG_2026-09-09-pipeline-injection-chain.md) |
| 171 | 2026-09-09 | 正文层硬规则后处理安全化 | CLICHES_BODY_SAFE 白名单 + processBody 完整性回滚门 + useDeAi 四处切换 + 设置页开关联动 + ChatPanel 类型修复 | 正文层与主页编辑器“去AI味”不再打碎完整文章；规则吞标点、旧 process 二次破坏、无安全网、开关脱节四个风险闭环 | [DEV_LOG_2026-09-09-deai-body-safety.md](DEV_LOG_2026-09-09-deai-body-safety.md) |
| 172 | 2026-09-09 | 降AI硬规则架构V2 | detect-report/deep-fix/legacy-auto 三模式 + detectBody 检测器 + 保护片段回对 + 最小编辑API + 完整性门禁 + 运行记录接入 | 正文默认不再静默改写；用户和SKILL调试方先看到分级报告，深度修复失败自动保留原文，第三方可复现降AI处理现场 | [DEV_LOG_2026-09-09-deai-architecture-v2.md](DEV_LOG_2026-09-09-deai-architecture-v2.md) |
| 173 | 2026-09-09 | 3.32.0 封装 | 降AI硬规则架构V2交付；type-check、build:vue、9项单测、16步源Electron CDP、产物SHA256与渲染产物关键词验证 | 客户实测三模式切换、检测报告事件、深度修复门禁回滚、兼容模式安全替换与主页查看报告入口 | [DEV_LOG_2026-09-09-packaging-3.32.0.md](DEV_LOG_2026-09-09-packaging-3.32.0.md) |
| 174 | 2026-09-10 | 运行记录会话聚合 | 大纲工作台与主页编辑器运行记录按会话聚合、轮次分组、每轮落盘、手动封存；流水线保持单任务粒度 | 多轮对话调试一次导出覆盖完整现场，第三方 SKILL 制作方不再拼接多条碎片记录 | [DEV_LOG_2026-09-10-run-trace-session-aggregation.md](DEV_LOG_2026-09-10-run-trace-session-aggregation.md) |
| 174a | 2026-09-10 | 3.33.0 版本封装 | 运行记录会话聚合与主页链路修复打包；13/13 runTrace 单测、源 Electron + CDP 三轮会话聚合实测、产物 SHA256 | 客户实测 3.33.0：连续对话聚合为一条会话、轮次分隔、手动封存与原子落盘 | [DEV_LOG_2026-09-10-packaging-3.33.0.md](DEV_LOG_2026-09-10-packaging-3.33.0.md) |
| 175 | 2026-09-10 | 意图路由 V3 修复与真实验证 | folder 判据改为显式规格字段、fallback 增加一次性 routingOverride 与推荐技能、3 条回归测试、源 Electron + CDP 真实 UI 验证、清理 codex-e2e 测试残留与临时脚本 | 文本技能不再被误判为 folder；低置信请求可按推荐技能继续或跳过路由全链执行，验证数据不污染用户技能库和流水线配置 | [DEV_LOG_2026-09-10-intent-routing-v3.md](DEV_LOG_2026-09-10-intent-routing-v3.md) |
| 176 | 2026-09-10 | 3.34.0 封装 | 意图路由 V3 打包交付；打包版 Electron + CDP 真实 UI 验证 13 项断言、验证脚本收尾修复、测试数据与临时脚本清理 | 客户实测 3.34.0：低置信请求 fallback 气泡、推荐技能、高级选项全链执行、无 API 误调用与测试数据残留 | [DEV_LOG_2026-09-10-packaging-3.34.0.md](DEV_LOG_2026-09-10-packaging-3.34.0.md) |
| 177 | 2026-09-10 | Folder 协议成熟化第一阶段 | 递归资源扫描、可选文件宽容降级、postProcess.issues 语义、folder 模板执行权、逐技能 usage/finishReason 回填、folderPackageCache | 第三方 folder SKILL 资源不再静默丢失，运行记录可复现包结构与执行决策，chain 每技能 API 记录闭环 | [DEV_LOG_2026-09-10-folder-protocol-maturity.md](DEV_LOG_2026-09-10-folder-protocol-maturity.md) |
| 178 | 2026-09-10 | Folder 协议成熟化第二阶段 | SKILL.md 正文完整注入、全部资源无截断注入、资源/警告摘要展示、源 Electron + CDP + SSE mock 真实 UI 验证 | 第三方 folder SKILL 的入口协议与深层参考资料完整进入模型上下文，导入前后可自检包结构 | [DEV_LOG_2026-09-10-folder-protocol-phase2.md](DEV_LOG_2026-09-10-folder-protocol-phase2.md) |
| 179 | 2026-09-10 | Folder 协议成熟化第三阶段 | skill.json manifest、Electron/Node 双协议脚本桥修复、postProcess stdout 结构化输出、导入路径/ID 冲突规则、源 Electron IPC P0 探针 | 第三方 folder SKILL 作者获得稳定包元数据与社区脚本兼容路径；用户导入重复路径或重复 ID 时获得显式提示与策略入口 | [DEV_LOG_2026-09-10-folder-protocol-phase3.md](DEV_LOG_2026-09-10-folder-protocol-phase3.md) |
| 180 | 2026-09-10 | Folder 协议成熟化第四阶段 | evals.json 随包加载、with/baseline 双路评测服务、六种本地断言、设置页运行评测按钮与报告、运行记录技能评测来源、caseId 协议化 | 第三方 folder SKILL 可附带可判定评测用例，用户运行后直观对比技能与基线的提升/持平/退化，评测现场进入运行记录供 SKILL 制作方调试 | [DEV_LOG_2026-09-10-folder-protocol-phase4.md](DEV_LOG_2026-09-10-folder-protocol-phase4.md) |
| 181 | 2026-09-10 | Folder SKILL 评测协议交接文档 | evals.json 文件位置、字段结构、六种断言语义、with/baseline 判定、费用规则、常见失败原因与快速模板 | 第三方 Folder SKILL 制作方可按文档编写标准评测用例，用户运行评测后导出现场，形成技能改版前后的质量对比 | [DEV_LOG_2026-09-10-folder-evals-handoff.md](DEV_LOG_2026-09-10-folder-evals-handoff.md) |
| 181a | 2026-09-10 | 大纲共创底座阶段1：读取地基 | outlineStructure 结构索引、outline.* 四只读工具、getAllSnapshots 补齐、ContextPack 化移除 12,000 字截断 | 几十万字大纲先看结构地图再按需读取局部全文，大纲工作台跨目标工具真实可用 | [DEV_LOG_2026-09-10-outline-cocreation-stage1.md](DEV_LOG_2026-09-10-outline-cocreation-stage1.md) |
| 181b | 2026-09-11 | 大纲共创底座阶段2：写入可靠性 | 统一定位引擎(唯一命中/多匹配拒绝/模糊候选)、失败诊断只重提失败条、编辑协议长文档化+结构锚点、chain 按意图授权工具 | API 写入从 indexOf 首次命中升级为可诊断的提案式定位，SKILL 与 plain 能力面统一 | [DEV_LOG_2026-09-11-outline-cocreation-stage2.md](DEV_LOG_2026-09-11-outline-cocreation-stage2.md) |
| 181c | 2026-09-11 | 大纲共创底座阶段3：审批与体验 | Diff 卡片化与原文定位、pending 批次会话状态机(过期不可应用/首答不可变)、兼容模式明示与过程状态 | 用户能看懂每条修改、确认状态不混乱，供应商不支持原生工具时可靠性差异可见 | [DEV_LOG_2026-09-11-outline-cocreation-stage3.md](DEV_LOG_2026-09-11-outline-cocreation-stage3.md) |
| 182 | 2026-09-11 | 大纲工作台长文档共创阶段4收口 | Stage4 探针 mock 死分支修复、DiffModal critical override 按钮解禁、影响分析引用去重、完整性面板按需显示；type-check、216 服务测试、构建与四个源 Electron CDP 探针全绿 | 大纲工作台获得结构锚点、完整性校验、讨论蒸馏提案、影响分析与批次回滚完整闭环，阶段4方案全部勾选并沉淀经验 | [DEV_LOG_2026-09-11-outline-cocreation-stage4.md](DEV_LOG_2026-09-11-outline-cocreation-stage4.md) |
| 183 | 2026-09-11 | 3.35.0 版本封装 | 大纲工作台长文档共创底座打包；处理源 Electron 验证实例导致的 EBUSY 后重新构建；验证安装包元数据、asar 版本、大小与 SHA256 | 将阶段 1 至阶段 4 功能发布为 Windows 安装包，供客户实操验证，并沉淀 EBUSY 根因与封装处理经验 | [DEV_LOG_2026-09-11-packaging-3.35.0.md](DEV_LOG_2026-09-11-packaging-3.35.0.md) |
| 184 | 2026-09-11 | 全应用深度递归检测 | IPC 对账、全量测试发现治理、渲染层监听生命周期、残留与颜色扫描；修复 Vitest 污染、ChatPanel 三个监听泄漏、AgentProgressPanel 静默 catch | 3.35.0 大更新后核销跨任务遗留风险，全量测试恢复 53 文件/394 用例全绿，长会话与组件重挂载不再累积 window 监听，轮询异常可诊断 | [DEV_LOG_2026-09-11-recursive-audit.md](DEV_LOG_2026-09-11-recursive-audit.md) |
| 184a | 2026-09-11 | 开发日志与经验文件对账补全 | 补阶段1-3独立日志与主索引断档、补 3.33.0 索引、经验 v3 补大纲共创规则与多阶段文档对账规则、消除“两个方案融合”命名歧义 | 后续会话可按日期/任务名/关键词双向追溯 09-07 至 09-11 全部任务，防止再串台 | [DEV_LOG_2026-09-11-doc-reconciliation.md](DEV_LOG_2026-09-11-doc-reconciliation.md) |
| 185 | 2026-09-11 | API 对话系统底座统一 | 三入口统一权限/上下文/工具/批次事件 + 横向契约测试 + 源 Electron CDP 14 项真实 UI 验证 | 主页、大纲、流水线共享同一对话底座，后续对话能力升级不再三处分叉；写入仍走提案确认与回滚，测试数据无残留 | [DEV_LOG_2026-09-11-api-dialogue-foundation-unification.md](DEV_LOG_2026-09-11-api-dialogue-foundation-unification.md) |
| 186 | 2026-09-11 | 3.36.0 版本封装 | API 对话系统底座统一打包；type-check、218 服务测试、构建、安装包元数据、asar 版本与 SHA256 验证 | 客户实测 3.36.0：主页、大纲、流水线统一对话底座与写入安全模型；同时沉淀 rcedit/EBUSY 文件锁恢复流程 | [DEV_LOG_2026-09-11-packaging-3.36.0.md](DEV_LOG_2026-09-11-packaging-3.36.0.md) |
| 187 | 2026-09-11 | 运行记录深度化 V2 | v4 数据模型、API/物理请求/工具现场、提示词快照、处理报告、payload 外置与三种导出模式、并发保存串行化、严格前缀流式记录、源 Electron E2E 验证 | 第三方 SKILL 制作方可获得可复现的完整调试现场，主 JSON 保持轻量，敏感信息双侧脱敏；同时沉淀构建产物验证与运行目录清理纪律 | [DEV_LOG_2026-09-11-run-trace-depth-v2.md](DEV_LOG_2026-09-11-run-trace-depth-v2.md) |
| 188 | 2026-09-12 | 生成流水线 folder chain 单一所有权 E2E | text→folder 混合链真实 Electron E2E + folder 交付通道修复（强制 inline_block）+ 无 base-template-applied 断言 | folder SKILL 加入生成流水线 chain 后，上一步输出完整进入 folder 请求且只注入一次，folder template.md 拥有执行权 | [DEV_LOG_2026-09-12-folder-pipeline-chain-e2e.md](DEV_LOG_2026-09-12-folder-pipeline-chain-e2e.md) |
| 189 | 2026-09-12 | 3.37.0 版本封装 | folder chain 单一所有权修复交付；type-check、432 测试、三个 chain E2E 串行验证、构建、安装包元数据、asar 版本与 SHA256 验证 | 客户实测 3.37.0：text+folder 混合链路逐卷/流水线生成，确认 folder 步骤拿到完整上一步输出且不重复注入 | [DEV_LOG_2026-09-12-packaging-3.37.0.md](DEV_LOG_2026-09-12-packaging-3.37.0.md) |
| 190 | 2026-09-12 | 开发经验文件 v4 重整 | 09-09 至 09-12 日期型经验提炼归位 §2/§3/§6/§8/§9，尾部过程章节删除，新增归档索引与回写铁律；v3 删除 | 经验文件保持规则型结构，后续会话按章节检索，避免日期日志和纪律混杂导致串台 | [神意开发经验总结_v5.md](神意开发经验总结_v5.md) |
| 191 | 2026-09-12 | Folder Chain 变量注入与 Reasoning 可见性 | folder 模板变量改为显式 `templateVariables` 注入；reasoning 流接入进度弹窗并持久化导出 | 修复卷纲 folder chain 变量未替换、长思考期间进度空白、SKILL 调试缺思考过程的问题 | [DEV_LOG_2026-09-12-folder-chain-variable-reasoning.md](DEV_LOG_2026-09-12-folder-chain-variable-reasoning.md) |
| 191 | 2026-09-12 | 3.37.1 封装修复 | 恢复 package.json 被覆盖丢失的 electron-builder NSIS 配置；type-check、432 测试、构建、有效配置、安装包元数据与 SHA256 验证 | 客户安装 3.37.1 时可重新选择安装目录，卸载仍保留用户数据；封装验收增加 NSIS 有效配置检查，防止静默回退一键安装 | [DEV_LOG_2026-09-12-packaging-3.37.1.md](DEV_LOG_2026-09-12-packaging-3.37.1.md) |
| 192 | 2026-09-12 | 3.38.0 版本封装 | 卷纲层运行记录六缺陷修复交付；E2E 脚本修复为真实 Electron + Playwright CDP，六项断言 PASS；type-check、定向 68 测试、chain 单一所有权 8 项 PASS、构建、产物元数据与 SHA256 验证 | 客户实测 3.38.0：folder diagnostics 输出引用化、payload 内容寻址去重、chain 中间产物事件、API 终态闭合；旧 3.37.x 安装包已清理 | [DEV_LOG_2026-09-12-packaging-3.38.0.md](DEV_LOG_2026-09-12-packaging-3.38.0.md) |
| 193 | 2026-09-12 | 产物有效性与状态一致性修复 | 统一产物有效性分类、provider finishReason/reasoning 归一化、folder 有效性门与直出重试、截断续写合并、degraded 状态链、失败路径诊断落 trace、sampleCount=0 语义修复 | 模型思考耗尽/空正文/截断不再伪装成功；SKILL 调试方导出运行记录可见 finishReason、usage、reasoning 与完整失败现场；基于 3.38.1 源码修复 | [DEV_LOG_2026-09-12-product-validity-status-repair.md](DEV_LOG_2026-09-12-product-validity-status-repair.md) |
| 194 | 2026-09-12 | 3.38.2 版本封装 | 产物有效性与状态一致性修复打包；type-check、定向 64 测试、build:vue、源 Electron E2E 四场景、NSIS 有效配置、安装包元数据与 SHA256 验证 | 客户实测 3.38.2：卷纲 folder chain 在空正文、reasoning 耗尽、截断、postProcess blocking 下均显示真实状态并导出完整运行记录 | [DEV_LOG_2026-09-12-packaging-3.38.2.md](DEV_LOG_2026-09-12-packaging-3.38.2.md) |
| 195 | 2026-09-12 | 卷纲生成挂死根因修复 | 流式 delta 化、UI 帧级节流、直出重试可见化、资源观测、G1-G6 发布矩阵；102 测试、G2/G3 压力与失败路径、三入口 G4、3.38.3 安装版实测全部通过 | 16384 token reasoning-only 长流不再压死渲染进程；空正文重试、超时、取消、连续失败全部用户可见、可取消、可导出，防止单测绿灯伪装发布闭环 | [DEV_LOG_2026-09-12-volume-generation-hang-fix.md](DEV_LOG_2026-09-12-volume-generation-hang-fix.md) |
| 196 | 2026-09-12 | 3.38.3 版本封装 | 根因修复打包；版本、NSIS 目录选择、安装包元数据与 SHA256 验证；G4 验证脚本支持安装版 exe 并修正 folder 显示名断言 | 客户实测 3.38.3：卷纲长 reasoning、空正文重试、取消导出与三入口 API 流式；无临时安装与测试 profile 残留 | [DEV_LOG_2026-09-12-volume-generation-hang-fix.md](DEV_LOG_2026-09-12-volume-generation-hang-fix.md) |
| 197 | 2026-09-12 | 降级终态与运行记录状态修复 | degraded 终态正确化、产物降级白名单、chain 非首步记忆去重、卷纲字数回退；61+30 定向测试、type-check、build、两项 E2E 全部通过 | SKILL 调试方可区分失败与降级完成，协议提示不再伪装降级，卷纲每卷字数在生成/解析/写入三环节一致 | [DEV_LOG_2026-09-12-degraded-trace-repair.md](DEV_LOG_2026-09-12-degraded-trace-repair.md) |
| 198 | 2026-09-12 | 3.38.4 版本封装 | 降级终态与运行记录状态修复打包；版本升级、NSIS 有效配置、安装包元数据、asar 版本与 SHA256 验证；旧 3.38.2/3.38.3 安装包清理 | 客户实测 3.38.4：验证降级完成状态、协议提示、chain 记忆单一注入与卷纲字数一致性 | [DEV_LOG_2026-09-12-packaging-3.38.4.md](DEV_LOG_2026-09-12-packaging-3.38.4.md) |
| 199 | 2026-09-13 | 全应用统一性修复收尾 | Modal 队列统一、AI Trace 生命周期统一、旧架构 6 服务删除、续生成 turn 修复、E2E 脚本隔离与路径修复；type-check、481 测试、构建、G2/G3/G4 三门 E2E 全部通过 | 消除 30+ overlay 各自管理 z-index 的风险、统一 AI 调用 trace 生命周期消除 running 僵尸、删除旧架构死代码减少维护负担 | [DEV_LOG_2026-09-13-full-unification-repair.md](DEV_LOG_2026-09-13-full-unification-repair.md) |
| 200 | 2026-09-13 | 3.39.0 版本封装 | 全应用统一性修复打包；版本升级、NSIS 目录选择、安装包元数据、asar 版本与 SHA256 验证；旧 3.38.4 安装包清理 | 客户实测 3.39.0：统一 Modal 队列、AI Trace 终态闭合、旧服务删除后的三入口功能与 folder chain 链路 | [DEV_LOG_2026-09-13-packaging-3.39.0.md](DEV_LOG_2026-09-13-packaging-3.39.0.md) |
| 201 | 2026-09-13 | 3.39.1 修复版封装 | 修复技能页 TDZ 回归；type-check、build:vue、真实 Electron 技能页 E2E、Modal 队列单测、构建、NSIS 目录选择、asar 版本与 SHA256 验证 | 3.39.0 废弃并清理；客户实测 3.39.1：设置页技能入口恢复、folder 导入与技能编辑弹窗可用、安装仍可选目录 | [DEV_LOG_2026-09-13-packaging-3.39.1.md](DEV_LOG_2026-09-13-packaging-3.39.1.md) |
| 202 | 2026-09-13 | 旧框架废弃文件清理 | 三面引用闭包确认后删除旧架构死文件、无调用 composable、失效 gate 脚本与 33 个归档 UI 审计脚本；保留仍在生效的 legacy 兼容逻辑与历史资料 | 消除“旧框架不适用”误导源，减少死代码维护面；锁文件、type-check、481 测试与双构建全部通过，版本保持 3.39.1 | [DEV_LOG_2026-09-13-obsolete-framework-cleanup.md](DEV_LOG_2026-09-13-obsolete-framework-cleanup.md) |
| 203 | 2026-09-13 | JSON 围栏清洗与 samples.txt 健康边界 | 新增统一平衡括号 JSON 解析服务并迁移全部调用点；folder SKILL 样本健康检查只警告不修改第三方文件夹；同步协议文档与帮助教学 | 模型围栏 JSON、解释文本包裹 JSON 不再因贪婪正则解析失败；第三方 SKILL 的完整成品样本会被体检显式提醒，降低模型复制示例内容的风险 | [DEV_LOG_2026-09-13-json-fence-samples-health.md](DEV_LOG_2026-09-13-json-fence-samples-health.md) |
| 204 | 2026-09-13 | 开发经验文件 v5 重整 | 合并 v4 全部有效规则并修复重复编号；删除旧归档声明与尾部整理记录；v1/phaseC/v4 旧经验文件删除，v5 成为唯一经验规则文件 | 后续会话只读一份经验文件，避免 v4 与历史归档并行导致引用串台；过程细节统一从 DEV_LOG 检索 | [DEV_LOG_2026-09-13-experience-file-v5.md](DEV_LOG_2026-09-13-experience-file-v5.md) |
| 205 | 2026-09-13 | 3.39.2 版本封装 | 发布旧框架清理、JSON 围栏清洗、samples.txt 健康边界与卷纲续生成单卷修复；type-check、198 条服务测试、设置页真实 Electron E2E、NSIS 构建、asar 版本与 SHA256 验证 | 客户实测 3.39.2：安装路径可选、技能页正常、卷纲续生成只出下一卷、模型围栏 JSON 可解析 | [DEV_LOG_2026-09-13-packaging-3.39.2.md](DEV_LOG_2026-09-13-packaging-3.39.2.md) |
| 206 | 2026-09-13 | 卷纲层三缺陷修复 | 续生成错卷根因定位（samples.txt 完整成品诱导）、run-trace 首载荷内联与嵌套诊断外置修复、folder 结构缺失 warning 降级归并；68 定向测试、type-check、构建与真实 6.6MB trace 复测通过 | 运行记录主文件从 6.63MB 降至 481KB 且无内联 payload；folder 缺少标记/快照/微场景时显示降级而不是伪装成功 | [DEV_LOG_2026-09-13-volume-three-defects.md](DEV_LOG_2026-09-13-volume-three-defects.md) |
| 207 | 2026-09-13 | 3.40.0 版本封装 | run-trace 旧导出兼容修复进入发布；14 文件 192 测试、type-check、双构建与 NSIS 打包通过；asar 版本与 runTrace 外置逻辑复核 | 生成 `神意助手-Setup-3.40.0.exe`，保留自定义安装路径；旧 3.39.2 产物已清理 | [DEV_LOG_2026-09-13-packaging-3.40.0.md](DEV_LOG_2026-09-13-packaging-3.40.0.md) |
| 208 | 2026-09-13 | 大纲工作台 compose + folder 修复 V2 验证闭环 | compose 复用统一路由/API trace/工具面/提案闭环；修复 prompt 外置载荷哈希与落盘内容不一致；新增 prompt sha256 回归测试；真实源 Electron + CDP 全场景验证通过 | 大纲工作台 compose + folder 讨论与写入闭环可被完整复现；深度导出 36 个 payload 全部校验通过，SKILL 调试方拿到可信现场 | [DEV_LOG_2026-09-13-outline-compose-folder-repair-v2.md](DEV_LOG_2026-09-13-outline-compose-folder-repair-v2.md) |
| 209 | 2026-09-13 | 3.40.1 版本封装 | prompt 外置载荷哈希一致性修复发布；type-check、5 条 prompt 回归、198 条服务测试、507 条全量测试、双构建与 NSIS 打包通过；asar 版本与 runTrace 修复复核 | 客户实测 3.40.1：大纲工作台 compose + folder 深度导出 payload 不再出现 hashMismatch，运行记录可作为可信调试现场 | [DEV_LOG_2026-09-13-packaging-3.40.1.md](DEV_LOG_2026-09-13-packaging-3.40.1.md) |
| 210 | 2026-09-13 | 3.40.1 封装收尾修复 | asar extract-file 误写仓库根目录覆盖源 package.json；恢复完整发布清单、删除根目录 runTrace.js 残留、复核源文件与安装包哈希未受影响 | 沉淀经验 §6-18：asar 校验必须用 Node API 内存读取或解到临时目录，封装收尾复核根目录无解包残留 | [DEV_LOG_2026-09-13-packaging-3.40.1.md](DEV_LOG_2026-09-13-packaging-3.40.1.md) |
| 211 | 2026-09-13 | 全局确认弹窗层级修复 | 确认框 9000 高于 Modal 队列，Escape 阻断级联，重置对话双入口 E2E 回归 | 全局确认层不再被宿主工作台遮挡，重置对话等确认操作恢复可见可点，层级变更形成固定回归门 | [DEV_LOG_2026-09-13-app-confirm-layering-fix.md](DEV_LOG_2026-09-13-app-confirm-layering-fix.md) |
| 212 | 2026-09-14 | 开发经验文件 v5.1 门禁修订 | 直写规则 26/69 与产品决策对齐，新增 M8 日志覆盖同步、M9 权限执行门、M10 测试契约门，修复 §8 重复编号 | 后续直写、日志覆盖与测试契约有最新硬门禁锚点，避免旧条款误导修复方向 | [DEV_LOG_2026-09-14-api-direct-write-v2.md](DEV_LOG_2026-09-14-api-direct-write-v2.md) |
| 213 | 2026-09-14 | API 直写权限门补验 | 兼容直写显式祈使意图补齐；classify/route 共享语义；源码 15 场景、安装版 3.42.2 十五场景与诊断覆盖面复验通过 | 显式“直写”请求进入 edit，讨论/分析只读门不变；意图单源规则沉淀为 M11 | [DEV_LOG_2026-09-14-direct-write-permission-gate.md](DEV_LOG_2026-09-14-direct-write-permission-gate.md) |
| 214 | 2026-09-14 | 3.42.2 封装 | 权限门补验后升级版本、NSIS 重封装、安装版静默安装与 15 场景 E2E 复验 | 客户拿到 `神意助手-Setup-3.42.2.exe`，兼容供应商 JSON 直写可复现且权限拒绝路径未回退 | [DEV_LOG_2026-09-14-direct-write-permission-gate.md](DEV_LOG_2026-09-14-direct-write-permission-gate.md) |
| 215 | 2026-09-15 | Outline Trace 递归修复与 3.44.0 全面收尾 | 修复 ChatPanel `toolCallSummary` 生产 TDZ；直写批次解析与提案工具语义落地、blocked 诊断与 toolSurface 补全；工具交换改非流式 JSON 并修正 5 个 mock；type-check、216 服务测试、build:vue、stage2 20/20 E2E、NSIS 构建、安装级烟测、安装级 15 场景直写 E2E 与双侧诊断覆盖 120/120 通过 | 大纲与主页的合法批次可进入预览并确认写入，批次失败真实归因可见；3.44.0 安装/卸载、自定义路径、asar 版本、15 场景直写、运行记录与诊断覆盖均有证据；客户仍需用真实供应商复验长素材、确认、undo 与 trace 归因 | [DEV_LOG_2026-09-15-outline-trace-recursive-repair.md](DEV_LOG_2026-09-15-outline-trace-recursive-repair.md) |
| 216 | 2026-09-15 | ContextPack 去重与续生成快照瘦身 | plain 与 SKILL 路径去重、ContextPack skipOutlineBody、主页大纲重复注入去重、续生成消息瘦身与兼容旧快照；type-check、216 服务测试、专项测试与 build:vue 通过 | 降低长大纲和长历史造成的上下文重复与请求膨胀，续生成快照不再无限携带旧全文 | [DEV_LOG_2026-09-15-context-dedup-snapshot-slim.md](DEV_LOG_2026-09-15-context-dedup-snapshot-slim.md) |
| 217 | 2026-09-15 | 3.45.0 封装 | ContextPack 去重与快照瘦身进入交付 | 客户可验证长文档对话的上下文重复减少与续生成稳定性 | [DEV_LOG_2026-09-15-context-dedup-snapshot-slim.md](DEV_LOG_2026-09-15-context-dedup-snapshot-slim.md) |
| 218 | 2026-09-15 | 全应用调用路径审计 V2 | Chain Handoff warn-only 对账、infra/background trace、Outline 共享收尾、状态冲突事件、classifyRunOutcome 归一与 Vite jieba external 修复；type-check、558 全量测试和生产构建通过 | chain 上下文交接有可导出证据，隐藏 AI 与供应商调用失败可溯源，运行终态不被 finally 覆盖，降级不被折叠成 success | [DEV_LOG_2026-09-15-call-path-audit-v2.md](DEV_LOG_2026-09-15-call-path-audit-v2.md) |
| 219 | 2026-09-15 | 3.46.0 封装 | 调用路径审计 V2 进入交付，生成 `神意助手-Setup-3.46.0.exe` | 客户重点复验 chain handoff 对账、供应商/AI 工具 trace、取消/失败终态与降级归因 | [DEV_LOG_2026-09-15-call-path-audit-v2.md](DEV_LOG_2026-09-15-call-path-audit-v2.md) |
| 220 | 2026-09-15 | Trace 加固 V2 | handoff hash 断点持久化、schemaVersion 5、Trace 落盘 fail-open、eval source 白名单补齐、并发收尾冲突事件与 E2E 清理加固；44 专项测试、562 全量测试、类型检查和真实 Electron E2E 通过 | 断点恢复不再重复注入已处理 handoff，trace 结构变更可版本识别，观测故障不阻断生成，技能评测记录保持正确来源，取消后的迟到收尾有可导出证据 | [DEV_LOG_2026-09-15-trace-hardening.md](DEV_LOG_2026-09-15-trace-hardening.md) |
| 221 | 2026-09-15 | 状态审计 V2（含回头看补修） | 修复预算耗尽/等待确认/技能阻断三类错误终态；建立状态守卫、看门狗、完整性检查、schemaVersion 6 状态时间线与关闭前状态上报；回头看补修 PipelinePanel blocked 折叠、看门狗 LifecycleStatus、快照合成终态历史，并声明测试量降档原因 | 运行记录可还原每次状态转换原因，folder SKILL blocked 不再伪装为 failed，chat 导出快照带证据链；后续状态改动必须经统一收口而不是散点赋值 | [DEV_LOG_2026-09-15-state-audit-v2.md](DEV_LOG_2026-09-15-state-audit-v2.md) |
| 222 | 2026-09-15 | 回头看门禁升格 | 经验文件 v5.6 新增 M17：每次任务收尾前必须执行目标对账、diff 自审、同款逻辑扫描、日志与经验覆盖、本轮证据复核；任一项缺失不得声称完成 | 后续所有任务把回头看作为硬门禁执行，防止“主体做完但链路断档、规则未回写、证据借用旧轮”的假闭环 | [DEV_LOG_2026-09-15-state-audit-v2.md](DEV_LOG_2026-09-15-state-audit-v2.md) |
| 223 | 2026-09-15 | 状态审计 V2 补完 | 等待用户确认恢复改为一次性登记，普通连续对话不再制造虚假恢复事件；AI 命名 partial 事件移到 trace finish 之前，SKILL 调试可见 NamingStatus.partial → RunTraceStatus degraded 契约；新增两条回归并完成专项、类型与全量验证 | 等待确认观测只在实际等待后出现，命名部分有效结果在运行记录中保留状态转换证据 | [DEV_LOG_2026-09-15-state-audit-v2.md](DEV_LOG_2026-09-15-state-audit-v2.md) |
| 224 | 2026-09-15 | 3.49.0 封装 | 版本升级并生成 NSIS 安装包；asar 版本、NSIS 自定义安装目录配置、测试与类型检查复核通过 | 客户可实操验证等待确认观测与 Naming partial trace 修复 | [DEV_LOG_2026-09-15-packaging-3.49.0.md](DEV_LOG_2026-09-15-packaging-3.49.0.md) |
| 225 | 2026-09-16 | 运行记录两次对比面板 RunTraceDiff | A/B 运行选择、六组差异 Tab、全文 diff、JSON 导出与递归脱敏；58 条单测、type-check、build:vue 与 31 项源 Electron E2E 通过 | SKILL 制作方可直接对比模板修改前后的 API、提示词、输出、工具、处理报告与状态链差异，导出全文供离线调试 | [DEV_LOG_2026-09-15-run-trace-diff.md](DEV_LOG_2026-09-15-run-trace-diff.md) |
| 226 | 2026-09-16 | 方案成熟度门禁 M18 | 经验文件 v5.8 新增 M18 四层成熟度评估、三档结论与方案成熟度声明；M12 增补防假研磨；根因索引登记 mock 假验证放行半成熟方案 | 后续任何方案审核必须明确“成熟 / 半成熟 / 不成熟”，未给出结论不得执行；mock 强制工具面不得作为链路验证证据 | [DEV_LOG_2026-09-16-plan-maturity-gate.md](DEV_LOG_2026-09-16-plan-maturity-gate.md) |
| 227 | 2026-09-16 | API 直写 V2 成熟化修复 | 大纲工具面单源构建、主页 actualToolSurface 双层记录、E2E 假失败源修复；14 场景真实 E2E、build:vue、type-check、216 服务测试通过 | 大纲与主页 API 直写的真实请求与运行记录共享同一工具面，SKILL 调试方不再被入口声明值误导 | [DEV_LOG_2026-09-16-api-direct-write-v2-maturity.md](DEV_LOG_2026-09-16-api-direct-write-v2-maturity.md) |
| 228 | 2026-09-16 | 3.51.0 封装 | 版本升级与 Windows 安装包重新生成 | 交付 API 直写 V2 成熟化修复客户复验包 | [DEV_LOG_2026-09-16-api-direct-write-v2-maturity.md](DEV_LOG_2026-09-16-api-direct-write-v2-maturity.md) |
| 229 | 2026-09-16 | API 直写成熟化执行与 3.52.0 交付 | 确认预览链路清零、意图语料单源、tool-loop 状态机、三层工具调用对账；补修 SKILL 路径失败批次接线、E2E 页面选择器与 Vite jieba 传递依赖；type-check、build:vue、602 服务测试、三套 E2E 全部通过 | 客户实测 3.52.0：大纲 SKILL 路径部分失败批次可只重提失败条，discuss 只读、edit 直写与 tool-loop 阶段可见，运行记录三层可对账 | [DEV_LOG_2026-09-16-api-direct-write-mature.md](DEV_LOG_2026-09-16-api-direct-write-mature.md) |
| 230 | 2026-09-16 | M17 回看维度扩充与 3.52.1 补修封装 | M17 扩充 8 维回看、M24 全仓入口盘点；补修主页 `createEditorTools` 失败批次接线与 12 处脚本页面选择器；同步修复 lockfile 版本分叉；type-check、602 测试、双构建、asar 版本与 NSIS 配置核验通过 | 客户实测 3.52.1：主页 API 对话框部分失败批次可只重提失败条，大纲直写与安装路径能力不回退 | [DEV_LOG_2026-09-16-m17-expansion-and-batch-repair.md](DEV_LOG_2026-09-16-m17-expansion-and-batch-repair.md) |
| 231 | 2026-09-16 | 卷纲 Chain 上游上下文契约改造 | S1/断点恢复主消费者保留全文，S2+ 默认替换 `[大纲]` 为确定性结构地图；folder `meta.json` 可声明 `chainHandoff.requiresFullPreviousOutput` 申请全文；meta 水合与 `chain-context-slim` trace 事件落地；34 专项测试、vue-tsc、双构建通过 | 卷纲 chain 中间步骤不再默认携带大纲全文，缓解输入滚雪球；SKILL 调试方可在运行记录中逐步对账每步拿到 full/slim 上下文 | [DEV_LOG_2026-09-16-chain-upstream-slim.md](DEV_LOG_2026-09-16-chain-upstream-slim.md) |
| 232 | 2026-09-16 | MAX_TOKENS 与思考重试 V2 | 移除 16384 硬顶、400 供应商上限降级、思考关闭协议、三入口直出重试、运行记录 retryStrategy/maxTokens 对账、四层失败终态修正 | 模型不再被本地硬顶截断，思考耗尽可用正确策略重试；SKILL 调试方能从 trace 看到实际输出上限、重试策略与失败原因 | [DEV_LOG_2026-09-16-max-tokens-reasoning-retry-v2.md](DEV_LOG_2026-09-16-max-tokens-reasoning-retry-v2.md) |
| 233 | 2026-09-16 | Chain Handoff 真执行 V2 | 生成流水线 chain 中间产物按消费契约交付：默认全文、structured 全命中才生效、excerpt 仅显式声明、contract-miss 回退、输出校验失败自动升级全文重试、每步全文入 runTrace payload | SKILL 可声明只需要上一步的字段，降低链式上下文滚雪球；任何截断失败都有全文兜底与可导出证据，第三方未声明 SKILL 零回归 | [DEV_LOG_2026-09-16-chain-handoff-execution-v2.md](DEV_LOG_2026-09-16-chain-handoff-execution-v2.md) |
| 234 | 2026-09-16 | tool-loop 悬死修复 | 请求级 supervisor（idle 150s / hard 300s / 重复工具错误 3 次）接入大纲 direct 对话；物理请求 running/canceled 观测补齐；finishTurn reason 与 cancelRunningApiCalls 物理请求兜底；119 专项测试、type-check、build:vue、真实 Electron E2E 与 DiagLogger 双侧对账通过 | 工具循环、供应商 hold、无进展流式不再无限等待，用户可取消，SKILL 调试方可从 trace 还原停滞原因 | [DEV_LOG_2026-09-16-tool-loop-stuck-fix.md](DEV_LOG_2026-09-16-tool-loop-stuck-fix.md) |
| 235 | 2026-09-17 | tool-loop 收敛缺口补漏 | 到达工具上限后新增不带 tools 的 `tool_convergence` 物理请求，注入“停止调用任何工具、基于已有结果输出最终回答”指令；runTrace phase 补 `tool_convergence`；E2E 从“失败提示”升级为“必须输出收敛回答” | 无法输出正文的核心缺口闭合：模型沉迷工具轮时仍会得到最终回答，trace 可区分工具轮与收敛轮 | [DEV_LOG_2026-09-17-tool-loop-convergence.md](DEV_LOG_2026-09-17-tool-loop-convergence.md) |
| 236 | 2026-09-17 | tool convergence 取消信号 V2 | `CallAiParams` 新增用户取消专用 `cancelSignal`，收敛请求继承用户取消但不继承 supervisor 总 deadline；工具执行组合双取消信号；大纲 direct 对话双 controller 同步生命周期并在收敛开始时记录 trace、停用工具监督器 | 保留“收敛救援不被逻辑 deadline 误杀”的成果，同时恢复用户取消能力，其他入口无回归 | [DEV_LOG_2026-09-17-tool-convergence-signal-v2.md](DEV_LOG_2026-09-17-tool-convergence-signal-v2.md) |
| 237 | 2026-09-17 | 3.52.3 版本封装 | tool convergence 取消信号 V2 交付；封装前回头复核全仓 `callAi` fallback、supervisor 单调用点与双 controller 生命周期；type-check、71 文件/633 测试、构建、asar 版本、NSIS 目录选择、安装包元数据与 SHA256 验证 | 客户实测 3.52.3：工具上限后的收敛正文、收敛期间用户取消、自定义安装路径不回退 | [DEV_LOG_2026-09-17-packaging-3.52.3.md](DEV_LOG_2026-09-17-packaging-3.52.3.md) |
| 238 | 2026-09-17 | 生产接线门禁与社区调研 | 新增 M26 旧假设清零门禁；真实克隆 semantic-router、Roo Code、knip、dependency-cruiser 并读取源码；对账出 ChatPanel/OutlineWorkspace 多入口自建工具面缺口；产出成熟化 V2 方案等待审核 | 后续生产接线改造有机器门禁依据：每路由阈值评估、工具面单源入口、依赖图 forbidden/reachable/orphan 规则 | [DEV_LOG_2026-09-17-production-wiring-gate.md](DEV_LOG_2026-09-17-production-wiring-gate.md) |
| 239 | 2026-09-19 | 意图等待恢复与构建告警收尾 | 实现 runId + createdAt + resumeToken 等待恢复结构、修复气泡清空前快照缺口、删除旧 Vite 配置并显式收敛测试范围、消除 Node typeless warning | 等待确认后的继续操作能带身份恢复 trace，不再必然落入 next_turn 兜底；构建与评估命令无配置类 warning | [DEV_LOG_2026-09-19-resume-token-and-build-warnings.md](DEV_LOG_2026-09-19-resume-token-and-build-warnings.md) |

## 维护要求

- 新开发日志必须追加到所属阶段末尾，并递增全局序号。
- 新版本封装必须写明版本号、交付目的和客户验证重点。
- 若某项工作被后续版本推翻或替换，不修改原记录，在当前索引新增一行说明新状态。
# 2026-09-18 上下文滚雪球修复 Phase 2

- 文件：[DEV_LOG_2026-09-18-context-snowball-fix.md](DEV_LOG_2026-09-18-context-snowball-fix.md)
- 范围：非破坏性上下文压缩生产接线、二次压缩身份折叠修复、模型输入窗口解析、workspace 隔离、runTrace/DiagLogger 双侧观测。
- 验证：服务测试 657/657，type-check 与 build:vue 通过。

# 2026-09-19 卷纲计划与 Reasoning Trace 修复

- 文件：[DEV_LOG_2026-09-19-volume-plan-reasoning-trace.md](DEV_LOG_2026-09-19-volume-plan-reasoning-trace.md)
- 范围：卷纲计划单一事实源与预算钳制、folder 模板空变量归一、reasoning delta 契约统一、最终 reasoningText 回填、大纲工作台与主页续生成旁路补漏。
- 验证：72 文件 / 672 条服务测试、type-check、build:vue 全部通过；build 仅存在既有 chunk 警告。

# 2026-09-19 意图路由 V5 收尾

- 文件：[DEV_LOG_2026-09-19-intent-routing-v5.md](DEV_LOG_2026-09-19-intent-routing-v5.md)
- 范围：大纲入口预组装工具面清零、fallback 推荐意图单源收口、旧链路七面扫描、ChatPanel 路由类型收窄、M36 门禁写入经验文件。
- 验证：type-check、2 文件 41 条路由/引擎测试、意图评测 20/20 与 253 条饱和语料、3 文件 101 条 trace/执行器/状态测试全部通过；旧链路残留扫描仅剩合法兜底与负向断言。
