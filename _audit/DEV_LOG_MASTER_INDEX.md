# 开发日志总索引（DEV_LOG MASTER INDEX）

更新日期：2026-11-03

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
| 237 | 2026-09-19 | API 直写协议成熟化 Phase 3 | 跨轮 compact 工具审计、上一轮写入事实 system 注入、孤儿 tool_call 检测、run trace 补写与四路径接线 | 模型下一轮能看见上一轮成功/失败/拒权终态，不再重复提交已成功写入，SKILL 调试方也能在 trace 中看到工具对摘要 | [DEV_LOG_2026-09-19_api-direct-write-protocol-phase3.md](DEV_LOG_2026-09-19_api-direct-write-protocol-phase3.md) |
| 238 | 2026-09-19 | API 直写协议成熟化 Phase 4 | 意图矩阵正负样本、路由优先级修正、precision/recall/F1 校准报告与 335 样本回归 | analyze/generate 明确指令不再被 discuss 语境护栏吞掉，确认后写入和参考请求边界可量化验证 | [DEV_LOG_2026-09-19_api-direct-write-protocol-phase4.md](DEV_LOG_2026-09-19_api-direct-write-protocol-phase4.md) |
| 239 | 2026-09-19 | API 直写协议成熟化 Phase 5 | 兼容直写协议形状修复、15 场景负向/跨轮/权限矩阵、生产接线门禁、意图评估与 M37 经验回写 | 兼容供应商 JSON 直写恢复可用且不再输出协议原文；严格校验、trace、DiagLogger 与 E2E 形成完整闭环 | [DEV_LOG_2026-09-19_api-direct-write-protocol-phase5.md](DEV_LOG_2026-09-19_api-direct-write-protocol-phase5.md) |
| 240 | 2026-09-20 | 意图语料 20 轮社区补齐与结构化替换路由修复 | 三路 20 轮精准搜索、结构化替换正负样本单源入库、祈使/预览问句分流、Electron 契约修正与全量验证 | “把某内容换成某内容”进入 edit 直写，“改成什么样”保持只读讨论，385 样本意图评估全指标 1.0000 | [DEV_LOG_2026-09-20_intent-corpus-structured-replace.md](DEV_LOG_2026-09-20_intent-corpus-structured-replace.md) |
| 241 | 2026-09-20 | 意图路由 V6 Phase 1 生产加载与 Electron 证据闭环 | jieba 迁移到 Electron 主进程 IPC、验证器分类口径修正、三轮真实 UI 实测与 deep trace 落盘 | 意图路由在生产 Electron 不再因 Vite stub 全局降级；Phase 1 词表层失败被四侧证据完整采集，供 Phase 2 语义层对账 | [DEV_LOG_2026-09-20_intent-routing-v6-phase1.md](DEV_LOG_2026-09-20_intent-routing-v6-phase1.md) |
| 242 | 2026-09-21 | 意图路由 V6 Phase 5 兜底矩阵与验证口径收口 | ambiguous LLM 兜底失败保持等待用户、no_match 保持只读讨论、Electron 10 场景兜底矩阵、fallback 恢复链路、live-divergence 分类与当前基线对账 | LLM 兜底故障不再把真实歧义输入误降级；SKILL 调试方能区分词层失败、会话观测分叉与兜底行为，并获得 deep trace 证据 | [DEV_LOG_2026-09-21_intent-routing-v6-phase5.md](DEV_LOG_2026-09-21_intent-routing-v6-phase5.md) |
| 243 | 2026-09-21 | 设计融合响应式溢出反查 | 技能七类子弹窗三段式滚动结构、24 视图 12 宽度 341 用例压力矩阵、状态桥同进程注入修复与 M48 经验回写 | 按钮与长文本在 320-2560px 缩放范围内不再溢出或裁切；验证器不再因跨进程 getter 序列化产生假注入 | [DEV_LOG_2026-09-21-design-fusion-responsive-overflow.md](DEV_LOG_2026-09-21-design-fusion-responsive-overflow.md) |
| 244 | 2026-09-21 | 3.55.0 响应式反查后重封装与仓库清理 | 清理旧 3.55.0 产物与设计审计临时文件，按最新响应式修复重新封装并完成 asar、启动、IPC 与哈希核验 | 交付包含 341 用例响应式修复后的新 3.55.0 安装包；仓库只保留当前产物与可追溯证据 | [DEV_LOG_2026-09-21-packaging-3.55.0-responsive-followup.md](DEV_LOG_2026-09-21-packaging-3.55.0-responsive-followup.md) |
| 245 | 2026-09-22 | 递归审计收敛与 3.56.0 封装 | 删除损坏旧 preload 副本、统一 electron-log 入口、修复测试类型，完成 Electron 级三线验证与零新增问题收敛 | 交付 3.56.0 安装包；全量测试、类型检查、依赖巡航、意图语料同步与打包启动核验通过 | [DEV_LOG_2026-09-22_recursive-audit-packaging-3.56.0.md](DEV_LOG_2026-09-22_recursive-audit-packaging-3.56.0.md) |
| 246 | 2026-09-22 | 意图语义路由 Phase 2 社区适配 | 60 仓库源码深读后的 OOS 独立判定、分意图歧义阈值、误拒/漏拒校准指标与 Electron 深度验证 | 路由器升级 v6.1；写意图使用更严 margin，越域输入可诊断降级，SKILL 调试方能在 trace 中看到完整阈值与决策层 | [DEV_LOG_2026-09-22_intent-semantic-routing-phase2.md](DEV_LOG_2026-09-22_intent-semantic-routing-phase2.md) |
| 247 | 2026-09-22 | 意图路由语料自成长系统 V2 | 三级标注回流、主进程语料存储与项目作用域导出、社区影子语料隔离、影子校准接入与 Electron 七场景实测 | 客户正常使用即自动积累真实意图语料，无需反复导出完整运行记录；只有 confirmed 样本可进校准，写入安全阈值不被自动放宽 | [DEV_LOG_2026-09-22_intent_corpus_self_growth_v2.md](DEV_LOG_2026-09-22_intent_corpus_self_growth_v2.md) |
| 248 | 2026-09-22 | 意图路由自动化对抗语料工厂 | 七类确定性变异、1000 字手稿测试稿、Silver/Bronze 分级工厂、社区来源挖掘、Electron 八场景长上下文写入隔离验证与 Gold 需求降为 30 条 | 客户无需反复导出运行记录，系统自动挖掘路由盲区并守住写入安全回归；合成语料永不污染生产阈值校准 | [DEV_LOG_2026-09-22_intent-adversarial-corpus-factory.md](DEV_LOG_2026-09-22_intent-adversarial-corpus-factory.md) |
| 249 | 2026-09-22 | 3.57.0 对抗语料工厂封装 | 版本升级 3.57.0、全量服务测试、类型检查、NSIS 重封装、asar/renderer/electronAPI/真实启动核验与旧 3.56.0 产物清理 | 交付包含意图对抗语料工厂、八场景长上下文验证与 M54 门禁的客户安装包 | [DEV_LOG_2026-09-22-packaging-3.57.0-adversarial-corpus.md](DEV_LOG_2026-09-22-packaging-3.57.0-adversarial-corpus.md) |
| 250 | 2026-09-23 | EditTask 系统成熟化调研 | 60 个真实仓库的编辑任务状态机、分批执行、checkpoint、失败恢复与工具面治理调研，形成 EditTask 系统方案 V1 | API 直写从单轮工具调用升级为跨轮可恢复编辑任务的方案基础，沉淀社区成熟实现证据 | [DEV_LOG_2026-09-22_edit-task-maturity-research.md](DEV_LOG_2026-09-22_edit-task-maturity-research.md) |
| 251 | 2026-09-23 | EditTask 系统 Phase 1-4 | EditTask 状态机、分批执行器、checkpoint、跨轮恢复、任务条 UI、runTrace/DiagLogger 生命周期覆盖与双入口接线 | 长文编辑失败后可按批次恢复，不再反复重放或折叠部分失败；SKILL 调试方可见任务全生命周期 | [DEV_LOG_2026-09-23_EDIT_TASK_SYSTEM_PHASE5.md](DEV_LOG_2026-09-23_EDIT_TASK_SYSTEM_PHASE5.md) |
| 252 | 2026-09-23 | EditTask 系统 Phase 5 收口 | 终态任务工具面归一、写入权限声明、task.resume/task.cancel 控制面、验证器 D2 mock 分支修复与 Electron 十场景高强度实测 | 编辑任务结束后下一轮 edit 自动恢复普通写入面；失败暂停、恢复、取消与终态收敛全部可用且 trace 可审计 | [DEV_LOG_2026-09-23_EDIT_TASK_SYSTEM_PHASE5.md](DEV_LOG_2026-09-23_EDIT_TASK_SYSTEM_PHASE5.md) |
| 253 | 2026-09-22 | 3.58.0 意图对抗工厂收敛封装（补登） | round-20 五项失败指标全零、S1-S6 停止审计 PASS、全量服务测试与 Electron 打包核验、3.57.0 旧产物清理 | 交付 3.58.0 安装包；意图工厂达到机器可判定停止条件，且保留路径自选安装与 embedding 本地加载证据 | [DEV_LOG_2026-09-22-packaging-3.58.0.md](DEV_LOG_2026-09-22-packaging-3.58.0.md) |
| 254 | 2026-09-23 | EditTask 20 轮回头看 | 修复取消终态任务条不收敛、终态任务弱恢复假成功，完成状态机、工具面、trace、验证器与全仓旧链路审计 | 编辑任务取消后 UI 与工具面立即收敛，终态任务不再被伪恢复，814 测试与 Electron 十场景实测全部通过 | [DEV_LOG_2026-09-23_EDIT_TASK_20R_LOOKBACK.md](DEV_LOG_2026-09-23_EDIT_TASK_20R_LOOKBACK.md) |
| 255 | 2026-09-23 | 侧栏 tooltip 溢出修复 | 右侧默认 + 左侧翻转 + 两侧空间择优收窄 + 垂直钳制的 tooltip 定位控制器，验证器改为测量真实 `::after` 几何并新增四缘合成宿主 | 主页左栏点击/悬停不再出现文字显示不全；12 宽度 341 响应式用例、396 条 tooltip 断言、视觉矩阵、新旧并存与确认层回归全部通过 | [DEV_LOG_2026-09-23-sidebar-tooltip-overflow.md](DEV_LOG_2026-09-23-sidebar-tooltip-overflow.md) |
| 256 | 2026-09-23 | 3.59.0 侧栏 Tooltip 修复封装 | 版本升级、815 全量测试、依赖单源规则同步、NSIS 重封装、打包内 7 个 tooltip 真实几何核验与 3.58.0 旧产物清理 | 交付包含侧栏 tooltip 溢出修复与 M60 门禁的 3.59.0 安装包；打包验证脚本假绿吞错与 NaN 假失败已修复 | [DEV_LOG_2026-09-23-packaging-3.59.0.md](DEV_LOG_2026-09-23-packaging-3.59.0.md) |
| 257 | 2026-09-23 | API 直写长文档 V3 用户级收尾 | 删除五个入口假上限、收敛轮伪工具调用判定与强纠正、范围限定写入路由修复、7605 字六步 Electron 实测与全量回归 | 5000 字级文档的改句、增句、删句、移动、整理、倒序全部真实写入并可导出完整 trace；真实外部供应商监督实测作为明确剩余项登记 | [DEV_LOG_2026-09-23-api-direct-write-v3-user-visible.md](DEV_LOG_2026-09-23-api-direct-write-v3-user-visible.md) |
| 258 | 2026-09-23 | 3.60.0 API 直写 V3 收口封装 | 版本升级、856 全量测试、伪工具调用收敛与完整性修复交付、NSIS 重封装、打包真实启动核验与 3.59.0 旧产物清理 | 交付 API 直写长文档成熟化 V3 的 3.60.0 安装包；验证器 tooltip 竞态已修复，安装路径可自选 | [DEV_LOG_2026-09-23-packaging-3.60.0.md](DEV_LOG_2026-09-23-packaging-3.60.0.md) |
| 259 | 2026-09-23 | API 直写 100% 闭环 Phase 1 | 上下文容量模型、请求前三态预算决策、真实 usage 对账、trace 五字段全链路写入与 Electron 压测验证器口径修复 | 每次直写请求可审计供应商窗口、输入估算、预算决策与 usage 漂移；验证器不再因白名单缺字段把产品误报为缺陷 | [DEV_LOG_2026-09-23_api-direct-write-100-closure-phase1.md](DEV_LOG_2026-09-23_api-direct-write-100-closure-phase1.md) |
| 260 | 2026-09-24 | API 直写 100% 闭环 Phase 2 | 编辑器文档地图、cursor 分段读取、搜索分页与所在节定位、模型窗口读取上限、SKILL 协议同步与 882 全量回归 | API 在 1M 级长文档上先读结构地图再分段消费全文；非法 cursor、全文请求和超限读取返回结构化错误 | [DEV_LOG_2026-09-23_api-direct-write-100-closure-phase2.md](DEV_LOG_2026-09-23_api-direct-write-100-closure-phase2.md) |
| 261 | 2026-09-24 | API 直写 100% 闭环 Phase 3 | 长文档自动进入 EditTask、多批 checkpoint 与终态收口、整篇替换硬拦截、范围词路由窄修与 M65 门禁 | 全文整理不再靠 12 轮 direct 硬吃；“修改第N章/首尾两节”能进入写意图，大文档按受限命令分批写入且可恢复、可取消、可审计 | [DEV_LOG_2026-09-23_api-direct-write-100-closure-phase3.md](DEV_LOG_2026-09-23_api-direct-write-100-closure-phase3.md) |
| 262 | 2026-09-24 | API 直写 100% 闭环 Phase 4 | 读取收敛第二轮改为 write-only 写入收口、steering 注入一次性修复、供应商矩阵分层报告与 Gemini 流式工具修复 | 模型读完全文后不再被移除写入工具导致假闭环；live 六步实测与供应商矩阵获得真实可审计证据 | [DEV_LOG_2026-09-23_api-direct-write-100-closure-phase4.md](DEV_LOG_2026-09-23_api-direct-write-100-closure-phase4.md) |
| 263 | 2026-09-24 | API 直写 100% 闭环 Phase 5 | 工具拒绝分类归一化、native/JSON 双协议观测字段、run trace 与 DiagLogger 双侧接线、导出文本增强与 Gold 语料审计 | SKILL 调试方可按 unknown_tool / schema_invalid / permission_denied / range_invalid / invalid_protocol 直接检索拒绝原因，区分“模型没权限”与“工具面未接线” | [DEV_LOG_2026-09-24_api-direct-write-100-closure-phase5.md](DEV_LOG_2026-09-24_api-direct-write-100-closure-phase5.md) |
| 264 | 2026-09-24 | API 直写 100% 闭环 Phase 6 | 意图路由事件 DiagLogger 镜像桥、主页与大纲工作台双侧接线、8 类路由事件分级与核心 payload 归一 | 路由开始、结果、诊断、fallback、handoff、跳过、预算耗尽、终态可在诊断日志和运行记录两侧对账，消除单侧观测盲区 | [DEV_LOG_2026-09-24_api-direct-write-100-closure-phase6.md](DEV_LOG_2026-09-24_api-direct-write-100-closure-phase6.md) |
| 265 | 2026-09-24 | API 直写 100% 闭环 Phase 7 实测收口 | 长文档工作流写授权、Electron 13 场景高强度实测、write_only_mode 负向导流证据与验证器 turn 级断言修复 | 长文档 EditTask 即使被路由判为讨论意图也能真实写入；1M 文档整篇替换被拦截并按批执行 | [DEV_LOG_2026-09-24_api-direct-write-100-closure-phase7.md](DEV_LOG_2026-09-24_api-direct-write-100-closure-phase7.md) |
| 266 | 2026-09-24 | 3.61.0 API 直写闭环封装 | 版本升级、NSIS 重封装、asar/renderer/electronAPI/tooltip 真实启动核验与 3.60.0 旧产物清理 | 交付包含 API 直写 100% 闭环 Phase 1-8 的 3.61.0 安装包 | [DEV_LOG_2026-09-24-packaging-3.61.0.md](DEV_LOG_2026-09-24-packaging-3.61.0.md) |
| 267 | 2026-09-24 | 真实大纲 10 轮直写组合实测 | 使用 74,841 字符真实大纲完成 10 轮 Electron 级 UI 实测，每轮同批执行补写、修改、删除、整节重排与标点整理 | 验证 direct 长文档路径、原子批次、工具面、trace 会话聚合与导出完整度；修正验证脚本的跨轮标点状态与 run 聚合口径 | [DEV_LOG_2026-09-24_real-outline-10r-direct-write-e2e.md](DEV_LOG_2026-09-24_real-outline-10r-direct-write-e2e.md) |
| 268 | 2026-09-24 | 3.61.0 实测后干净重封装 | 产品源码未变的 3.61.0 重封装、真实启动核验复跑、SHA256 与产物盘点 | 交付包含真实大纲 10 轮直写实测证据链的当前安装包；首次 tooltip 核验超时判定为偶发，复跑 7 个侧栏 tooltip 全通过 | [DEV_LOG_2026-09-24-packaging-3.61.0-real-outline-followup.md](DEV_LOG_2026-09-24-packaging-3.61.0-real-outline-followup.md) |
| 269 | 2026-09-24 | 编辑器完整产品标准成熟化 P0-A1 | Markdown 折叠服务与 EditorPanel 接线、TDZ 修复、11,244 字 10 轮 Electron 真实 UI 实测 | 几万字文档可折叠只读导航，输入/保存/diff 定位自动展开且存储与撤销栈永不消费折叠文本 | [DEV_LOG_2026-09-24-editor-full-product-maturity.md](DEV_LOG_2026-09-24-editor-full-product-maturity.md) |
| 270 | 2026-09-24 | 编辑器完整产品标准成熟化 P0-A2 | 书签服务、项目切换硬边界、20 轮 Electron 书签与项目隔离实测 | 用户可标记编辑位置，项目切换后书签、页签与撤销状态不再跨项目泄漏 | [DEV_LOG_2026-09-24-editor-full-product-maturity.md](DEV_LOG_2026-09-24-editor-full-product-maturity.md) |
| 271 | 2026-09-24 | 编辑器完整产品标准成熟化 P1-A1 | 撤销服务单源化、大纲/主页/批次回滚统一事务栈、10 轮 Electron 撤销实测与书签回归 | 手动编辑、API 写入、导入共用同一文档级 undo/redo 时间线，项目切换后撤销状态彻底隔离 | [DEV_LOG_2026-09-24-editor-full-product-maturity.md](DEV_LOG_2026-09-24-editor-full-product-maturity.md) |
| 272 | 2026-09-24 | 编辑器完整产品标准成熟化 P0-A3 | Markdown heading 解析服务、右侧大纲导航面板、10 轮 Electron 跳转实测 | 编辑器内可按标题层级定位章节，点击即居中滚动到原始 offset | [DEV_LOG_2026-09-24-editor-full-product-maturity.md](DEV_LOG_2026-09-24-editor-full-product-maturity.md) |
| 273 | 2026-09-24 | 编辑器完整产品标准成熟化 P0-A4 | 搜索匹配单源服务、独立高亮叠加层、10 轮 Electron 实测 | 查找结果在编辑器内持久高亮，匹配计算不再散落组件，关闭或无结果时干净清理 | [DEV_LOG_2026-09-24-editor-full-product-maturity.md](DEV_LOG_2026-09-24-editor-full-product-maturity.md) |
| 274 | 2026-09-25 | 编辑器完整产品标准成熟化 P0-A5 | 选区快照接线、选区感知折叠、10 轮 Electron 选区恢复实测 | 外部写入与折叠切换后用户选区可恢复或明确置零，行为可审计且不再静默丢失 | [DEV_LOG_2026-09-24-editor-full-product-maturity.md](DEV_LOG_2026-09-24-editor-full-product-maturity.md) |
| 275 | 2026-09-25 | 编辑器完整产品标准成熟化 P1-A2 | 双入口 facade 单源化、outline context pack 收敛、双入口等价性 Electron 回归 | 主页与大纲工作台共用同一套 read cap、snapshot 与 ContextPack 入口，后续上下文与长文档能力不再分叉 | [DEV_LOG_2026-09-24-editor-full-product-maturity.md](DEV_LOG_2026-09-24-editor-full-product-maturity.md) |
| 276 | 2026-09-25 | 编辑器完整产品标准成熟化 P1-A3 | 上下文注入五阶段管道、双入口 packed ContextPack、117,910 字 10 轮 Electron 实测 | 长文档对话不再重复注入全文，模型通过 document_map/read_range 按需读取，上下文成本从约 100% 降至约 1.1% | [DEV_LOG_2026-09-24-editor-full-product-maturity.md](DEV_LOG_2026-09-24-editor-full-product-maturity.md) |
| 277 | 2026-09-25 | 编辑器完整产品标准成熟化 P1-A4 | 操作语义分类 + 整篇操作自动路由 EditTask、100,049 字 10 轮 Electron 实测 | “全文整理/替换/重排”不再塞进 direct 对话，而是自动进入分批、可恢复、可审计的 EditTask 流程 | [DEV_LOG_2026-09-24-editor-full-product-maturity.md](DEV_LOG_2026-09-24-editor-full-product-maturity.md) |
| 278 | 2026-09-25 | 供应商接线矩阵收口 | usage 归一断言修正、Anthropic 流式 usage 帧级合并、Gemini 工具 ID 与 finish reason 验证契约修正，四供应商 Electron 矩阵全绿 | OpenAI-compatible、Anthropic、Gemini、Azure 原生工具环、直写、usage 与 trace 断言获得统一可审计证据；live 供应商差异仍登记为后续项 | [DEV_LOG_2026-09-25-provider-wire-matrix-closure.md](DEV_LOG_2026-09-25-provider-wire-matrix-closure.md) |
| 279 | 2026-09-25 | UI 全视图覆盖门禁收口 | 响应式溢出门禁扩至 42 视图 605 用例，修复记忆黑名单/合并/冲突、流水线配置弹窗与模式标签溢出，删除 readonly computed 验证桥 setter | 全部可 E2E 打开视图在 320-2560px 矩阵内无文字/按钮溢出；类型、1070 服务测试、605 响应式、407 文件新旧并存、19 视觉矩阵与 300 章节树压力用例全部通过 | [DEV_LOG_2026-09-25-ui-coverage-gate.md](DEV_LOG_2026-09-25-ui-coverage-gate.md) |
| 280 | 2026-09-26 | Agent Orchestrator V3 Phase 1-2 | Tokens 无感化与假默认清零、压缩生命周期、跨轮 checkpoint 元数据继承、双哈希恢复校验与双入口观测接线 | 上下文预算不再被本地假上限误伤，压缩触发/成功/失败/恢复全部可审计且失败不丢历史与任务目标 | [DEV_LOG_2026-09-26_agent_orchestrator_v3_phase1_phase2.md](DEV_LOG_2026-09-26_agent_orchestrator_v3_phase1_phase2.md) |
| 281 | 2026-09-26 | Agent Orchestrator V3 Phase 3 | AgentOrchestrator 状态机、防空转门禁、`context.remaining`、长文档自动路由 EditTask 与五层 runTrace 事件 | Agent 编排具备收敛判定和长文档安全闸门，整篇任务不再绕过 EditTask 直写 | [DEV_LOG_2026-09-26_agent_orchestrator_v3_phase3.md](DEV_LOG_2026-09-26_agent_orchestrator_v3_phase3.md) |
| 282 | 2026-09-26 | Agent Orchestrator V3 Phase 4 | 主进程 checkpoint IPC、hash 校验、cancel token 与重启恢复，替换 `renderer_handled` 空壳 | Agent 任务可跨应用重启恢复，状态不再由渲染层口头接管 | [DEV_LOG_2026-09-26_agent_orchestrator_v3_phase4.md](DEV_LOG_2026-09-26_agent_orchestrator_v3_phase4.md) |
| 283 | 2026-09-26 | Agent Orchestrator V3 Phase 5 | 内置工具名单、重名冲突剔除、顺序子 Agent 管理、工具冲突观测接线 | 子 Agent 不递归获得 agent 运行时工具，外部 SKILL 重名工具被单源剔除并留痕 | [DEV_LOG_2026-09-26_agent_orchestrator_v3_phase5.md](DEV_LOG_2026-09-26_agent_orchestrator_v3_phase5.md) |
| 284 | 2026-09-26 | Agent Orchestrator V3 Phase 6 与 3.67.0 交付 | 生产工具面接通 `agent.spawn/wait/cancel`、12 个 `tool-activity` 派发点统一过滤、M17 回头看、3.67.0 封装核验 | API 对话可安排子任务，工具明细只留 RunTrace，滚动 UI 不泄漏工具 JSON | [DEV_LOG_2026-09-26_agent_orchestrator_v3_phase6.md](DEV_LOG_2026-09-26_agent_orchestrator_v3_phase6.md) |
| 285 | 2026-09-26 | Agent Orchestrator V3 Phase 6B 用户可见矩阵 | 50 万字五类任务各 3 轮、1M 窗口、压缩后强制中断恢复、可见 Electron 窗口与供应商 live 分层 | 用户亲眼确认长文档读、改、删、重排、标点整理与恢复链路真实可跑；证据与用户观察层对齐 | [DEV_LOG_2026-09-26_agent_orchestrator_v3_phase6b.md](DEV_LOG_2026-09-26_agent_orchestrator_v3_phase6b.md) |
| 286 | 2026-09-27 | 客户大纲删除确认 trace 可见复刻 | 21 物理请求、41 工具调用、授权/拒绝双分支 Electron 复刻，修复工具轮上限钳制与并行失败误判 | 客户第 6 轮死锁路径可真实重放并收敛；历史 write_only_mode 缺陷以双语义对账，防止旧缺陷被误当成回归 | [DEV_LOG_2026-09-27-outline-deletion-confirmation-replay.md](DEV_LOG_2026-09-27-outline-deletion-confirmation-replay.md) |
| 287 | 2026-09-27 | 长文档重排架构 V2 Phase 1-2 | 执行计划单源、供应商窗口冲突纠偏、EditTask plan_ready 事件顺序与批次元数据修复 | 长文档整理按计划分段执行，不再出现 0 可用上下文、计划缺失与 steering/toolPolicy 互相矛盾 | [DEV_LOG_2026-09-27_long_document_restructure_phase1_phase2.md](DEV_LOG_2026-09-27_long_document_restructure_phase1_phase2.md) |
| 288 | 2026-10-03 | Phase 7-A3 compose 统一 Agent runtime | 大纲工作台与首页 compose 路径接入统一 Agent runtime，SKILL guidance 真实注入，旧 chain 引擎在 compose 模式下防御性抛错 | compose 对话不再回退旧引擎；SKILL 只影响提示词与领域能力，不改变应用执行协议 | [DEV_LOG_2026-10-03_phase7-a3-compose-unified-runtime.md](DEV_LOG_2026-10-03_phase7-a3-compose-unified-runtime.md) |
| 289 | 2026-10-03 | 3.72.0 Phase 7-A3 收尾封装 | 更新经验门禁、归档并清理旧运行日志、删除调试脚本、升版 NSIS 封装并完成真实启动核验 | 交付包含 compose 统一 runtime 的 3.72.0 安装包；工作区无 3.71.0 旧安装产物与临时运行目录 | [DEV_LOG_2026-10-03_phase7-a3-packaging-3-72-0.md](DEV_LOG_2026-10-03_phase7-a3-packaging-3-72-0.md) |
| 290 | 2026-10-31 | 技能/智能导入链路与 contextPolicy 旧语义退役 | folder 记录构造、协议 v3、ZIP 二进制等价、运行时三面水合单源化，`chatHistory: latest/all` 全链路退役并完成真实 Electron UI 验证 | 设置页导入、覆盖导入、体检与技能测试共用同一事实源；旧上下文语义不再回流，导入后消费磁盘新模板并可通过物理请求对账 | [DEV_LOG_2026-10-31_skill-import-chain-overhaul.md](DEV_LOG_2026-10-31_skill-import-chain-overhaul.md) |
| 291 | 2026-10-31 | 经验文件 v9.8.6 与技能链路收尾回写 | 旧语义退役五项验收、本地 mock 协议分流、测试成功结果硬断言与请求类型分账 | contextPolicy 旧语义退役和 UI 验证器事故沉淀为门禁，后续验证器不再把模型列表请求或请求报告冒充业务成功 | [DEV_LOG_2026-10-31_skill-import-chain-overhaul.md](DEV_LOG_2026-10-31_skill-import-chain-overhaul.md) |
| 290 | 2026-10-03 | SKILL/Agent 权限单源化 | 写入授权改为“意图 + 操作类型 + 执行计划模式”三元组单源，长文档 discussion 只读，SKILL 仅提供 guidance | `discuss/analyze` 加载 SKILL 后不再被 workflow 授权推向写入或 tool-loop；合法 edit/generate 直写链路保持可用 | [DEV_LOG_2026-10-03_skill_agent_authority_single_source.md](DEV_LOG_2026-10-03_skill_agent_authority_single_source.md) |
| 291 | 2026-10-03 | 3.73.0 封装 | 升版、构建 NSIS 安装包并执行 asar、真实启动、electronAPI、安装路径与 SHA256 核验 | 交付包含 SKILL/Agent 权限单源化修复的 3.73.0 安装包 | [DEV_LOG_2026-10-03_skill_agent_authority_single_source.md](DEV_LOG_2026-10-03_skill_agent_authority_single_source.md) |
| 292 | 2026-10-03 | 开发经验文件 v7 去旧补新重整 | v6 四层门禁升级为 v7：取消 G0.11 平行优先级、通用化执行路径迁移防御、吸收 SKILL / 无 SKILL 同一执行方案，删除 v6 并更新活跃引用 | 后续任务只读一份最新经验规则，消除特殊优先级矛盾与新旧规则并存风险 | [DEV_LOG_2026-10-03_experience-file-v7.md](DEV_LOG_2026-10-03_experience-file-v7.md) |
| 293 | 2026-10-03 | SKILL/Agent 权限单源化社区验证 | 8 个真实开源项目源码取证，对照 3.73.0 三元组授权、SKILL guidance、服务层守卫与 Electron 证据 | 确认权限单源方向与社区主流一致；登记观测性与防御纵深增强项，不改生产代码 | [DEV_LOG_2026-10-03_skill_agent_authority_community_validation.md](DEV_LOG_2026-10-03_skill_agent_authority_community_validation.md) |
| 294 | 2026-10-04 | SKILL/Agent 权限单源化 R1-R5 收尾 | folder 技能导入 guidance 缺失修复、RoutedSkill 类型补齐、Electron folder 夹具纠偏、R5 跨轮确认绑定门禁登记 | 真实 UI 下拉选择 folder SKILL 后，discuss/analyze 保持只读、edit/generate 才可写入，且 guidance 不再虚假为空 | [DEV_LOG_2026-10-03_skill_agent_authority_single_source.md](DEV_LOG_2026-10-03_skill_agent_authority_single_source.md) |
| 295 | 2026-10-04 | 3.74.0 封装 | 版本升级、NSIS 构建与安装包核验、清理旧 3.73.0 安装产物、主索引与 DEV_LOG 收口 | 交付包含 folder guidance 修复与权限单源化完整验证的 3.74.0 安装包 | [DEV_LOG_2026-10-03_skill_agent_authority_single_source.md](DEV_LOG_2026-10-03_skill_agent_authority_single_source.md) |
| 296 | 2026-10-04 | 3.74.0 终稿生产回归修复 | 意图路由“约束性不要改写”误判修复、执行计划补“输出/生成完整终稿”交付语义、验证器 turn failed 快速失败 | 客户终稿指令重新进入 final-draft runner；停滞、重试、供应商切换与三段完成在可见 Electron 中通过 | [DEV_LOG_2026-10-04-final-draft-production-regression.md](DEV_LOG_2026-10-04-final-draft-production-regression.md) |
| 297 | 2026-10-04 | SKILL/Agent 权限 R4 真实链路闭环 | `onToolCall` 事件、native/JSON 双协议发射点、双入口 runTrace 投影与 ToolGateway 透传 `defaultToolPolicy/riskLevel`；新增 legacy trace 回放校验 | 运行记录可区分“工具面声明”与“真实执行事件”的静态策略；旧客户 trace 不伪造新字段，R4 不再是存储层假闭环 | [DEV_LOG_2026-10-03_skill_agent_authority_single_source.md](DEV_LOG_2026-10-03_skill_agent_authority_single_source.md) |
| 298 | 2026-10-04 | 3.74.0 R4 后最终重封装 | 重建 renderer 与 NSIS 安装包，真实启动打包应用并核验 `electronAPI`、renderer 新鲜度与 SHA256 | 交付包含 R4 真实链路修复的最终 3.74.0 安装包，消除重打包前旧哈希口径 | [DEV_LOG_2026-10-03_skill_agent_authority_single_source.md](DEV_LOG_2026-10-03_skill_agent_authority_single_source.md) |
| 299 | 2026-10-04 | 大纲导出 API 回复索引与 3.74.1 封装 | trace schema 13、`apiResponseIndex`、导出索引完整性校验、流式回填守卫与 3.74.1 重封装 | SKILL 层可直接从主 JSON 定位每个 API 回复 payload，不再被外置 `responseText` 断链 | [DEV_LOG_2026-10-04-outline-export-response-index.md](DEV_LOG_2026-10-04-outline-export-response-index.md) |
| 300 | 2026-10-04 | 预览状态机移除与直写协议收口 | 删除修改预览/批准写回/写入未执行状态机与会话级操作提示，统一 `editor.write` 直写；Electron 中立执行验证通过 | API 对话不再被旧确认链路拦截或降级；SKILL / Agent 只影响领域能力，写入权限保持三元组单源 | [DEV_LOG_2026-10-04-preview-state-machine-removal.md](DEV_LOG_2026-10-04-preview-state-machine-removal.md) |
| 301 | 2026-10-04 | 3.75.0 封装 | 版本升级、NSIS 重封装、asar/renderer/electronAPI/真实启动核验与 3.74.1 旧产物清理 | 交付删除预览状态机并统一直写协议后的 3.75.0 客户安装包 | [DEV_LOG_2026-10-04-preview-state-machine-removal.md](DEV_LOG_2026-10-04-preview-state-machine-removal.md) |
| 302 | 2026-11-02 | 正文层内嵌降AI协同 V6.1 Phase A | S2 retry 上游事实链修复、S2→S3 位置化诊断注入、`deai-stage-guidance` trace、候选账本保留输出 | SKILL 接管写作时应用只送有界情报；诊断不参与验收/终态/retry，运行记录可审计诊断链路且不携带候选正文 | [DEV_LOG_2026-11-02_body-deai-v6-1-phase-a.md](DEV_LOG_2026-11-02_body-deai-v6-1-phase-a.md) |

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

# 2026-09-19 3.53.6 重复写入语义收口封装

- 文件：[DEV_LOG_2026-09-19-packaging-3.53.6-repeat-write.md](DEV_LOG_2026-09-19-packaging-3.53.6-repeat-write.md)
- 范围：主页同轮多次直写快照修复、重复写入守卫语义统一、活动规范与 E2E 场景命名去旧、3.53.6 NSIS 安装包重封装。
- 验证：type-check、源码与安装版 Electron E2E、生产构建、asar 版本、NSIS 自定义安装目录配置、安装包 SHA256 与旧产物清理复核。
- 客户重点复验：同轮多次不同写入全部生效，连续 3 次完全相同写入被 `duplicate_write_blocked` 拦截，安装路径可选不回退。
# 2026-09-19 API Direct Write Protocol Maturity - Phase 1

- 文件：[_audit/DEV_LOG_2026-09-19_api-direct-write-protocol-phase1.md](_audit/DEV_LOG_2026-09-19_api-direct-write-protocol-phase1.md)
- 范围：协议单源收敛、protocolVersion 接线、tool_not_found 语义修正与诊断补录、E2E 拒绝面成熟化。
- 验证：type-check、全量 671 条服务测试、生产接线门禁、build:vue 与真实 Electron E2E 通过。

# 2026-09-19 API Direct Write Protocol Maturity - Phase 2

- 文件：[_audit/DEV_LOG_2026-09-19_api-direct-write-protocol-phase2.md](_audit/DEV_LOG_2026-09-19_api-direct-write-protocol-phase2.md)
- 范围：写入失败反馈成熟化，包含错误码目录、失败索引、合法枚举、候选、修复策略与成功批次防重发。
- 验证：专项服务测试与协议负向路径回归通过。

# 2026-09-19 API Direct Write Protocol Maturity - Phase 5

- 文件：[_audit/DEV_LOG_2026-09-19_api-direct-write-protocol-phase5.md](_audit/DEV_LOG_2026-09-19_api-direct-write-protocol-phase5.md)
- 范围：兼容直写协议形状修复、15 场景 E2E、全量 680 条测试、生产接线门禁、意图四类 F1=1.0000 与 M17 回头看。
- 验证：type-check、build:vue、E2E、全量测试、生产接线门禁与意图评估全部通过。

# 2026-09-19 API Direct Write Protocol Maturity V2 - Phase 3

- 文件：[_audit/DEV_LOG_2026-09-19_api-direct-write-protocol-maturity-v2-phase3.md](_audit/DEV_LOG_2026-09-19_api-direct-write-protocol-maturity-v2-phase3.md)
- 范围：协议版本单源与 v1 兼容缺省策略、未知版本结构化拒绝、`protocolVersionDefaulted` 从服务事件到双入口 runTrace 的完整接线、native 路径声明顺序修复。
- 验证：type-check、全量 692 条服务测试、协议专项测试通过。

# 2026-09-19 API Direct Write Protocol Maturity V2 - Phase 4

- 文件：[_audit/DEV_LOG_2026-09-19_api-direct-write-protocol-maturity-v2-phase4.md](_audit/DEV_LOG_2026-09-19_api-direct-write-protocol-maturity-v2-phase4.md)
- 范围：工具循环策略单源、四场景上限矩阵、入口 scenario 接线、`usageUnavailable` 透传、长文档工具轮压测与依赖规则门禁。
- 验证：长文档压测、生产接线门禁 275 模块 0 违规、type-check、全量 692 条服务测试通过。

# 2026-09-19 API Direct Write Protocol Maturity V2 - Phase 5

- 文件：[_audit/DEV_LOG_2026-09-19_api-direct-write-protocol-maturity-v2-phase5.md](_audit/DEV_LOG_2026-09-19_api-direct-write-protocol-maturity-v2-phase5.md)
- 范围：四层验证收口、全量回归、真实 Electron mock E2E、openai-compatible live 验证、意图饱和评估、经验文件 v5.19 与 M38/M39 回写。
- 验证：type-check、692 条服务测试、协议仿真五供应商、13 场景 E2E、build:vue、意图四类 F1=1.0000 通过；live 仅 openai-compatible pass，其余供应商 untested。

# 2026-09-19 3.54.0 API 直写协议成熟化 V2 封装

- 文件：[_audit/DEV_LOG_2026-09-19-packaging-3.54.0.md](_audit/DEV_LOG_2026-09-19-packaging-3.54.0.md)
- 范围：版本升级 3.54.0、类型检查与全量服务测试、生产构建、NSIS 打包、asar / EXE 元数据核验、SHA256 与旧 3.53.6 产物清理。
- 验证：type-check、692 条服务测试、意图四类 F1=1.0000、协议仿真五供应商、13 场景 E2E、构建与产物核验通过；openai-compatible live pass，其余供应商 untested。
- 客户重点复验：自定义安装路径、协议版本协商 trace、工具轮 scenario 与 usageUnavailable、folder schema 严格校验、长文档多轮定位收敛。

# 2026-09-20 意图 Embedding V6 Phase 2 与 3.55.0 修复封装

- 文件：[_audit/DEV_LOG_2026-09-20_intent-embedding-v6-phase2.md](_audit/DEV_LOG_2026-09-20_intent-embedding-v6-phase2.md)
- 范围：本地 bge-small-zh-v1.5 embedding 服务、preload API 暴露、Electron 验证脚本超时与阶段日志强化、3.55.0 preload 语法事故修复、旧 3.54.0 产物清理。
- 验证：type-check、703 条服务测试、build:vue、production-wiring 278 模块 0 违规、Node embedding 验证、真实 Electron 三轮 embedding 验证、3.55.0 EXE 版本与 SHA256 核验通过。
- 客户重点复验：安装 3.55.0 后应用可正常启动，`window.electronAPI` 可用；运行记录、技能导入、API 对话不受 preload 事故影响。

# 2026-09-20 Graphite Ink 设计融合 P0-P6

- 文件：[_audit/DEV_LOG_2026-09-20-design-fusion-graphite-ink.md](_audit/DEV_LOG_2026-09-20-design-fusion-graphite-ink.md)
- 范围：Token 单源、Toast/Tooltip/EmptyState 统一、Chat 与 ai-content token 化、G6/诊断面板 token 化、overlay 与 z-index 层级统一、动画与 GPU 层收口、现役文档与经验回写。
- 验证：legacy 扫描 P0-P5 规则 0 命中、type-check、build:vue、703 条服务测试、app-confirm 层级验证全部通过；`verify-app-confirm-layering` 末尾出现 Windows EPERM 清理警告，进程 exit 0。

# 2026-09-20 3.55.0 设计融合与意图路由成熟化封装

- 文件：[_audit/DEV_LOG_2026-09-20-packaging-3.55.0.md](_audit/DEV_LOG_2026-09-20-packaging-3.55.0.md)
- 范围：3.55.0 NSIS x64 重封装、M28 旧包新鲜度判定与旧产物清理、asar / renderer / preload 独立核验、真实打包产物启动验证、M29/M42/M43/M44 门禁收口。
- 验证：preload `node --check`、完整 `npm run build`、安装包 SHA256 与 EXE 元数据、asar 3.55.0、renderer 74 条目、`window.electronAPI` 74 方法、旧产物仅保留一套复核通过。
- 客户重点复验：自定义安装路径、Graphite Ink 三档响应式格局、新旧样式并存清零、意图路由与运行记录行为。

# 2026-09-22 意图路由 V6 Phase 6：falseRejections 语料与 train/dev/test 收口

- 文件：[_audit/DEV_LOG_2026-09-22_intent-routing-phase6.md](_audit/DEV_LOG_2026-09-22_intent-routing-phase6.md)
- 范围：19 条 falseRejections 溯源、edit/discuss 示例语料扩充（126 -> 151）、holdout 确定性三切分、校准器去缺陷化（删除 falseRejections 硬上限）、生产 thresholdSource 修正、切分结构锁定测试。
- 验证：66/66 专项测试、type-check、build:vue、Electron 级验证 64 cases 全部通过；写入类安全阈值未放宽，train/dev/test 的 writeFalseTriggers 均为 0。

# 2026-09-25 F1 查找替换增强

- 文件：[_audit/DEV_LOG_2026-09-25-editor-find-replace.md](_audit/DEV_LOG_2026-09-25-editor-find-replace.md)
- 范围：主页与大纲工作台共享查找替换模型、大小写/全词/正则/非法正则防护、替换当前/全部、runTrace 与 DiagLogger 覆盖；Electron 验证器计数与状态泄漏修复。
- 验证：32/32 服务测试、type-check、build:vue、真实 Electron 双入口 10+10 轮全部通过；证据文件 `_audit/verification-editor-replace/electron-10-rounds.json`。

# 2026-09-25 F2 超长文档性能层

- 文件：[_audit/DEV_LOG_2026-09-25-editor-virtualization.md](_audit/DEV_LOG_2026-09-25-editor-virtualization.md)
- 范围：超长文档精确行号、viewport 同源测量与行窗口、搜索高亮视窗化、50 万字基准、大纲虚拟化验证器修复与共享证据目录保护。
- 验证：50 万字基准最慢动作 617ms；编辑器与大纲 Electron 各 10/10 轮；104 文件 / 1047 条服务测试、type-check、build:vue 通过。

# 2026-09-25 3.62.0 编辑器 F1/F2 交付封装

- 文件：[_audit/DEV_LOG_2026-09-25-packaging-3.62.0.md](_audit/DEV_LOG_2026-09-25-packaging-3.62.0.md)
- 范围：F1 查找替换、F2 超长文档性能层与 Provider Wire Matrix 进入 3.62.0 安装包；封装级真实启动核验、旧产物与解包残留清理。
- 验证：F1 双入口 10+10、F2 双入口 10+10 与 50 万字基准、Provider 四矩阵、asar/IPC/tooltip 打包核验、清理复核全部通过。
- 客户重点复验：查找替换选项与锁定态、50 万字滚动/跳转/搜索/写入跟随、供应商 wire trace，以及安装路径可选不回退。

# 2026-09-25 F3 API 写入后的行内 Diff 视图

- 文件：[_audit/DEV_LOG_2026-09-25-editor-diff.md](_audit/DEV_LOG_2026-09-25-editor-diff.md)
- 范围：API 直写批次 hunk 化、行内 Diff 层、单命令回滚与 rebase、整批回滚、stale 锁定、runTrace/DiagLogger 覆盖。
- 验证：主页与大纲真实 Electron 各 10 轮通过；服务测试、type-check、production wiring、build:vue 全绿；证据 `_audit/verification-editor-diff/electron-10-rounds.json`。

# 2026-09-25 F4 SKILL 调试对比增强

- 文件：[_audit/DEV_LOG_2026-09-25-run-trace-diff-enhancement.md](_audit/DEV_LOG_2026-09-25-run-trace-diff-enhancement.md)
- 范围：模板版本 diff、工具序列结构 diff、首个不同 API 调用、SkillDebugSummary、导出双方全文不截断。
- 验证：真实 RunTracePanel 对比流 10 轮通过；报告 `_audit/verification-run-trace-diff/electron-10-rounds.json`；全量回归通过。

# 2026-09-25 F5 多光标与虚拟选区

- 文件：[_audit/DEV_LOG_2026-09-25-editor-multi-cursor.md](_audit/DEV_LOG_2026-09-25-editor-multi-cursor.md)
- 范围：单主光标 + 虚拟选区集合、Find All 多光标、插入/删除/换行 undo 事务、外部写入降级、日志覆盖。
- 验证：主页与大纲真实 Electron 各 10 轮通过，服务测试 14/14；报告 `_audit/verification-editor-multi-cursor/electron-10-rounds.json`；全量回归通过。

# 2026-09-25 Provider live 矩阵补测

- 文件：[_audit/DEV_LOG_2026-09-25-provider-wire-matrix-closure.md](_audit/DEV_LOG_2026-09-25-provider-wire-matrix-closure.md)
- 范围：修复无凭据重跑覆盖既有 pass 结论的问题；补测 openai-compatible 与 deepseek live；明确 Anthropic/Gemini/Azure 为凭据缺口。
- 验证：openai-compatible/deepseek live pass 且各 1 次工具调用；报告 `_audit/verification-api-direct-write-provider-matrix.json`。

# 2026-09-25 3.63.0 编辑器 F3/F4/F5 交付封装

- 文件：[_audit/DEV_LOG_2026-09-25-packaging-3.63.0.md](_audit/DEV_LOG_2026-09-25-packaging-3.63.0.md)
- 范围：F3 行内 Diff、F4 SKILL 调试对比增强、F5 多光标与虚拟选区、Provider live 补测进入 3.63.0 安装包；经验文件 v5.42 与 M67-M70 回写；旧 3.62.0 安装产物清理。
- 验证：F3/F4/F5 双入口真实 Electron 各 10 轮、全量 1070 条服务测试、type-check、production wiring、build:vue、3.63.0 asar/IPC/tooltip 打包核验、清理复核全部通过。
- 客户重点复验：API 写入后的行内 diff 与回滚、RunTrace 对比导出、Find All 多光标编辑、长文档操作稳定性，以及安装路径可选不回退。

# 2026-09-25 3.64.0 UI 全覆盖收口交付封装

- 文件：[_audit/DEV_LOG_2026-09-25-packaging-3.64.0.md](_audit/DEV_LOG_2026-09-25-packaging-3.64.0.md)
- 范围：UI 42 视图/605 溢出案例全覆盖、章节树 300 压力案例、三处溢出修复、readonly computed setter 清理进入 3.64.0 安装包；旧 3.63.0 安装产物清理。
- 验证：type-check、1070 条服务测试、responsive/legacy/visual/chapter-tree 四条 UI 验证链、production wiring、3.64.0 真实启动 asar/IPC/renderer 新鲜度/tooltip 几何打包核验、清理复核全部通过。
- 客户重点复验：安装路径可选不回退、侧栏 tooltip 与章节树在极窄/极宽窗口下的显示、MemoryPanel 与 Pipeline 弹窗滚动、生成流水线模式标签换行。

# 2026-09-25 3.65.0 章节树按钮竖排与全局按钮压缩修复封装

- 文件：[_audit/DEV_LOG_2026-09-25-packaging-3.65.0.md](_audit/DEV_LOG_2026-09-25-packaging-3.65.0.md)
- 范围：章节树顶栏“生成/项目”竖排、项目名挤压、Pipeline 提示按钮压缩、Diff 工具栏压缩、API 配置按钮压缩、stress 探针无效按钮文本注入修复进入 3.65.0 安装包。
- 验证：type-check、605/605 responsive overflow、300/300 章节树压力、build、3.65.0 打包核验全部通过。
- 客户重点复验：章节树顶栏窄窗口不竖排、Diff 弹窗按钮完整可读、Pipeline 窄屏提示卡上下堆叠、设置页导出/导入按钮不压缩。

# 2026-09-26 直写测试项目污染清理与数据隔离修复

- 文件：[_audit/DEV_LOG_2026-09-26-test-project-isolation-cleanup.md](_audit/DEV_LOG_2026-09-26-test-project-isolation-cleanup.md)
- 范围：定位 `API Direct Write Electron Stress` 来源，新增 `SHENYI_DATA_DIR` Electron 数据隔离开关，验证脚本统一隔离注入，清理真实数据目录测试项目/lastProjectId/mock 供应商并恢复真实供应商备份。
- 验证：三个脚本 `node --check` 通过；清理脚本路径守卫与执行通过；真实数据目录复核 lastProjectId 不存在、api-direct-write 残留为 0、供应商列表恢复。
- 客户重点复验：重新打开应用后项目列表和章节树不再出现 API Direct Write Electron Stress，供应商设置显示真实 deepseek 供应商。

# 2026-09-26 API 滚动状态与工具调用分层收口

- 文件：[_audit/DEV_LOG_2026-09-26-live-status-no-tool-ui.md](_audit/DEV_LOG_2026-09-26-live-status-no-tool-ui.md)
- 范围：切断 UI 滚动区工具流残留展示、删除重复写入拦截的 UI 展示链、本地兜底摘要去工具身份；修正取消与会话导出 e2e 旧契约；新增 M72。
- 验证：outline silent-wait e2e 全场景 PASS、aiService/runTrace 172 条 PASS、type-check exit 0、`tool-stream` 源码零命中。
- 客户重点复验：API 对话框只看到连接/流式状态，不再看到工具 JSON；工具调用明细只查运行记录。

# 2026-09-26 Agent Orchestrator V3 Phase 4

- 文件：[_audit/DEV_LOG_2026-09-26_agent_orchestrator_v3_phase4.md](_audit/DEV_LOG_2026-09-26_agent_orchestrator_v3_phase4.md)
- 范围：主进程 Agent 状态 IPC、checkpoint hash 校验、cancel token、主进程重启恢复，替换 `renderer_handled` 空壳。
- 验证：agent-state Electron 真实双实例验证 PASS、type-check、1108 条服务测试全部通过。

# 2026-09-26 Agent Orchestrator V3 Phase 5

- 文件：[_audit/DEV_LOG_2026-09-26_agent_orchestrator_v3_phase5.md](_audit/DEV_LOG_2026-09-26_agent_orchestrator_v3_phase5.md)
- 范围：内置工具名单、外部重名冲突剔除、顺序子 Agent 管理、工具冲突 runTrace/DiagLogger 接线；修复 `editor.reveal_target` 名单错误与并行化缺陷。
- 验证：专项 36/36、type-check、1108 条服务测试全部通过；`agent.spawn/wait/cancel` 尚未接生产工具面，已在日志登记为未闭环项。

# 2026-09-26 Agent Orchestrator V3 Phase 6 与 3.67.0 交付

- 文件：[_audit/DEV_LOG_2026-09-26_agent_orchestrator_v3_phase6.md](_audit/DEV_LOG_2026-09-26_agent_orchestrator_v3_phase6.md)
- 范围：生产工具面接通 `agent.spawn/wait/cancel`、OutlineWorkspace workspace skill engine 两个 `tool-activity` 派发口补统一过滤、M72 补强、M17 四向回头看、版本 3.67.0 与封装核验、测试 profile 清理。
- 验证：子 Agent Electron 双场景 PASS、Agent 状态 Electron 双实例 PASS、1117 条服务测试全绿、type-check、build、3.67.0 asar 真实启动 + 75 项 IPC 核验 PASS；12 个 `tool-activity` 派发点全部单源过滤。
- 客户重点复验：API 对话中安排子任务时只看到滚动状态与最终正文，工具明细在运行记录中可见；子 Agent 不递归暴露 agent 运行时工具；应用重启后可恢复未完成任务。

# 2026-09-26 3.68.0 仓库清理与封装

- 文件：[_audit/DEV_LOG_2026-09-26-packaging-3-68-0.md](_audit/DEV_LOG_2026-09-26-packaging-3-68-0.md)
- 范围：M42/M29 分层清理旧安装产物、探针临时输出与 Electron 测试 profile；版本升级 3.68.0；新增 3.68.0 封装核验脚本。
- 验证：type-check、1139 条服务测试、依赖巡检、build、asar 真实启动 + 75 项 IPC + 安装路径可选 + SHA256 全部通过；旧 3.66.0/3.67.0 安装产物清理并复核。
- 客户重点复验：安装 3.68.0 后可自选安装路径，应用真实启动且设置页、API 对话、运行记录功能可用。

# 2026-09-27 长文档重排架构 V2 Phase 5

- 文件：[_audit/DEV_LOG_2026-09-27_long_document_restructure_phase5.md](_audit/DEV_LOG_2026-09-27_long_document_restructure_phase5.md)
- 范围：runTrace schema v10、长物理请求与终态归并事件、无总上限但保留 idle watchdog 的契约。
- 验证：专项 66 条、全量服务测试 116 文件 / 1185 条、type-check 全部通过；schema v9 生产引用清零。
- 登记缺口：Phase 6 真实 100k/200k/1M 字 UI 与 API 验证未执行，未通过前不封装。

# 2026-09-27 长文档重排架构 V2 Phase 6

# 2026-10-03 SKILL/Agent 权限单源化

- 文件：[_audit/DEV_LOG_2026-10-03_skill_agent_authority_single_source.md](_audit/DEV_LOG_2026-10-03_skill_agent_authority_single_source.md)
- 范围：写入授权改为“意图 + 操作类型 + 执行计划模式”三元组单源；`discuss/analyze` 长文档计划进入 `discussion`；删除双入口 workflow 授权伪造意图；Agent 进展与收敛按 discussion 分叉；SKILL adapter 只透传单源授权；trace guidance 事件补 payload；完成结构化授权调用点类型改造。
- 验证：type-check、build:vue 通过；Electron 真实 UI 双入口 × 无 SKILL/真实下拉选择 SKILL 矩阵 4/4 通过（8 只读轮、4 写入轮）；126 文件 1364 条服务测试通过；旧 workflow 覆盖语义无生产残留。
- 封装：版本升为 3.73.0；真实供应商 smoke 按既有登记保留 `untested`。
- 客户重点复验：加载 SKILL 后进行只读讨论不应出现 tool-loop、写入等待或“无权限”话术；局部修改仍应真实 `editor.write`。

- 文件：[_audit/DEV_LOG_2026-09-27_long_document_restructure_phase6.md](_audit/DEV_LOG_2026-09-27_long_document_restructure_phase6.md)
- 范围：S200 与 S1M 真实 Electron + 真实 API 全操作矩阵、网络断流保留一次物理重连、runTrace 失败终态不被 canceled 覆盖、M17 测试标题语义残留修复。
- 验证：S200 200,066 字符与 S1M 1,000,024 字符各 6 项操作全部 success；190 条定向、1,196 条全量服务测试、type-check、build:vue、M17 后 139 条定向回归全部通过。
- 封装：3.69.0 安装包、asar 真实启动、75 项 electronAPI、安装路径可选与 SHA256 核验通过；旧 3.68.0 安装产物已清理。
- 客户重点复验：20 万 / 100 万字大纲的全文排序、标点整理、重复项删除授权与拒绝、局部修改、中断恢复。

# 2026-09-30 终稿停滞恢复闭环

- 文件：[_audit/DEV_LOG_2026-09-30_final-draft-stalled-recovery-closure.md](_audit/DEV_LOG_2026-09-30_final-draft-stalled-recovery-closure.md)
- 范围：修复停滞卡片重试快照无法克隆 reactive proxy、慢流物理重试伪装活跃、活动 API 记录误关闭；修正 Electron 验证器的分段 mock 映射与编辑器分隔符口径；沉淀 M80。
- 验证：stalled-recovery Electron live PASS，72 条终稿专项、1293 条全量服务测试、type-check 全部通过。
- 封装：3.70.0 安装包真实 Electron 启动通过，75 项 electronAPI、安装路径可选、asar/renderer 新鲜度与 SHA256 核验通过；旧 3.69.0 安装产物已清理。
- 客户重点复验：终稿停滞卡片点击换供应商重试后可续跑并完整写入；低速流期间不出现重复请求；运行记录 API 调用不被旧 run 关闭。

# 2026-10-01 仓库大清理与长期改动归档

- 文件：[_audit/DEV_LOG_2026-10-01_repo-consolidation-cleanup.md](_audit/DEV_LOG_2026-10-01_repo-consolidation-cleanup.md)
- 范围：3.30-3.70 周期 150+ 修改文件与 400+ 未跟踪文件分批归档；删除 5 处第三方调研原始缓存（约 80MB）与 `dist/win-unpacked`（约 972MB）；修复孤儿 idx / tmp_obj 后重建 multi-pack-index；嵌套第三方 Git 仓库从版本索引移除、本地保留并加入 ignore 规则。
- 验证：`git status --short` 无 tracked/untracked 残留；`git fsck --full` 0 error/missing/corrupt；归档提交 `0764672`、`39414c8`、`b6704c4`、`c40e19b` 可在 `git log` 追溯。
- 客户重点复验：无需客户操作；本地 `_data/` 用户数据、3.70.0 安装包与全部审计证据保留。

# 2026-10-01 门禁体系重构 v6

- 文件：[_audit/DEV_LOG_2026-10-01_gate-system-refactor.md](_audit/DEV_LOG_2026-10-01_gate-system-refactor.md)
- 范围：开发经验文件从 v5 升级为 v6 四层门禁结构（L0 永恒 / L1 通用 / L2 领域 / L3 归档映射）；M1-M80 全量归位，删除尾部日期修订记录；删除 v5 旧经验文件；更新 STACK.md 与活跃 docs 指向。
- 验证：活跃文档 v5 引用清零、M 编号映射全覆盖、`git diff --check` 通过、工作区仅含本轮改动。
- 客户重点复验：后续任务开始前按 v6 使用路由读取 L0 + 相关 L1/L2；发现规则失效按失效条件归档，不回滚 v5。

# 2026-10-01 SKILL / 无 SKILL 执行体系统一 v2 与 3.71.0

- 文件：[_audit/DEV_LOG_2026-10-01_skill-neutral-execution-unification.md](_audit/DEV_LOG_2026-10-01_skill-neutral-execution-unification.md)
- 范围：双入口 final-draft 判定删除“未加载 SKILL”条件；大纲单源执行计划；`skillGuidance` 贯通终稿 runner 与分段/续写；engine 透传 `requestText` 与 `writeAuthorization`；SKILL 包协议边界单源校验；RunTrace 补 skill 中立观测字段。
- 验证：1303 条服务测试、type-check、build:vue、Electron 可见 UI 双入口矩阵（无 SKILL / 有 SKILL × final-draft / targeted edit）全部通过；真实外部供应商未执行，已按 G1.4 登记 untested。
- 封装：3.71.0 安装包、asar 协议文件核验、真实启动与 SHA256 核验；旧 3.70.0 安装产物清理。
- 客户重点复验：加载任意 SKILL 后发出“整篇重排 / 格式整理 / 去重”请求，仍进入终稿 runner 并写回编辑器；局部修改仍走工具循环且 `editor.write` 可用；API 对话框不出现工具 JSON，明细查运行记录。

# 2026-10-04 SKILL/Agent 权限单源化 R1-R5 收尾

- 文件：[_audit/DEV_LOG_2026-10-03_skill_agent_authority_single_source.md](_audit/DEV_LOG_2026-10-03_skill_agent_authority_single_source.md)
- 范围：R1-R4 补齐 folder 诊断与协议边界观测；Electron 验证夹具修正为真实 folder 格式后暴露并修复导入 folder 技能 guidance 缺失的生产缺陷（`template.md` / `description` 回退链）；`RoutedSkill` 补 `description` 类型；R5 登记跨轮确认必须绑定 toolCallId/批次、工具名与参数 hash 的设计门禁。
- 验证：`workspaceSkillEngine.spec.ts` 38/38；Electron 真实 UI 下拉选择 SKILL 矩阵 4/4 case，8/8 只读对话不越权、4/4 编辑对话执行 `editor.write`；证据在 `_audit/verification-skill-agent-authority-v2/`。
- 客户重点复验：在大纲工作台和首页真实下拉选择 folder SKILL 后，讨论/分析类请求仍保持只读，编辑请求才可写入编辑器；运行记录中 folder 诊断与 guidance 来源一致。

# 2026-10-04 3.74.0 封装

- 文件：[_audit/verification-packaging-3-74-0/packaging-evidence.json](_audit/verification-packaging-3-74-0/packaging-evidence.json)
- 范围：版本升级到 3.74.0；新增 3.74.0 封装校验器；全量服务测试、type-check、build 与安装包核验；清理 3.73.0 旧安装产物。
- 验证：126 files / 1372 tests 全绿；安装器 `dist\神意助手-Setup-3.74.0.exe`，SHA256 `d5cf431eb273377a566abbb9737ebec439f5602099b64693474be5172dd37624`（该值为重打包前版本；最终 3.74.0 安装包哈希见下方终稿生产回归修复记录）；打包应用真实启动，renderer 74 文件、`electronAPI` 75 方法。
- 客户重点复验：安装 3.74.0 后确认可选择安装目录；加载 SKILL/Agent 的两条入口均保持权限单源语义，明细查运行记录。

# 2026-10-04 3.74.0 终稿生产回归修复

- 文件：[_audit/DEV_LOG_2026-10-04-final-draft-production-regression.md](_audit/DEV_LOG_2026-10-04-final-draft-production-regression.md)
- 范围：路由层将“不要改写正文含义”识别为约束而非禁止写入；planner 将“输出/生成完整终稿”识别为整篇替换；Electron 验证器在 turn failed 且无 task 时立即保存证据并失败。
- 验证：87 条终稿/路由/planner 专项、126 files / 1375 tests 全量服务测试、type-check、build:vue 通过；stalled-recovery Electron live PASS，`finalTask=completed`，三段完成并保留停滞、重试与 provider switch 事件。
- 封装：修复后重跑 `npm run build` 与 `node scripts/verify-packaging-3-74-0.mjs`；安装器 `dist\神意助手-Setup-3.74.0.exe`，SHA256 `de4b5a27a5bd48820ebc4c09b00a442fd4b09294abf2bead23fb3f8eb3d7e50d`，真实启动、renderer 74 文件与 `electronAPI` 75 方法核验通过。
- 客户重点复验：重新安装封装后的 3.74.0，发送“整理排序，统一格式，不要改写正文含义，输出完整终稿”，应出现终稿任务并支持停滞重试与供应商切换。

# 2026-10-04 SKILL/Agent 权限 R4 真实链路闭环

- 文件：[_audit/DEV_LOG_2026-10-03_skill_agent_authority_single_source.md](_audit/DEV_LOG_2026-10-03_skill_agent_authority_single_source.md)
- 范围：`defaultToolPolicy/riskLevel` 从工具定义贯通到 `onToolCall` 事件、native tools 与 compatibility JSON 双协议发射点、首页/大纲双入口 runTrace 投影及 `ToolGateway`；`tool_not_found` 不伪造工具元数据；新增真实客户 legacy trace 回放脚本。
- 验证：目标 spec 217/217；服务总套件 126 文件 1376 测试；type-check、build:vue、Electron 4/4 case 与 legacy trace 2/2 通过。证据在 `_audit/verification-skill-agent-authority-v2/`。
- 客户重点复验：导出运行记录后查看 `editor.write` 工具调用，应看到 `defaultToolPolicy: allowedWithPermission` 与 `riskLevel: medium`；旧版本导出的记录没有这两个字段属预期，不表示权限缺失。

# 2026-10-04 3.74.0 R4 后最终重封装

- 文件：[_audit/verification-packaging-3-74-0/packaging-evidence.json](_audit/verification-packaging-3-74-0/packaging-evidence.json)
- 范围：在 R4 真实链路修复后重跑完整 `npm run build`，重建 renderer 与 x64 NSIS 安装包，并再次执行打包应用真实启动核验。
- 验证：打包应用真实启动通过，renderer 74 文件均新于最新源码变更，`electronAPI` 暴露 75 个方法；安装器 `dist\神意助手-Setup-3.74.0.exe`，SHA256 `AD28C51B627D1D787958A0F6A004E04FDBD1B303E0CC1B744AF9664D11FA2E97`。
- 客户重点复验：重新安装本版 3.74.0 后，加载 SKILL/Agent 的编辑对话中导出运行记录，`editor.write` 应带 `defaultToolPolicy: allowedWithPermission` 与 `riskLevel: medium`。

# 2026-10-04 大纲导出 API 回复索引

- 文件：[_audit/DEV_LOG_2026-10-04-outline-export-response-index.md](_audit/DEV_LOG_2026-10-04-outline-export-response-index.md)
- 范围：导出的 `run-trace.json` 新增 `apiResponseIndex`，每个逻辑/物理 API 调用直接给出 response、stream、reasoning 的 payload ref、文件名、hash、长度与 preview；`export.json` 增加索引完整性校验；trace schema 升至 13。
- 验证：runTrace 导出/存储专项 81 测试通过，type-check 通过；旧 2026-10-04 导出证据确认正文存在于 payload 文件，本修复让其在主 JSON 中可直接定位。
- 客户重点复验：导出深度运行记录后，SKILL 层应能直接读取 `apiResponseIndex` 中每个 API 回复的 payload 文件，不再依赖已被外置清空的 `responseText` 字段。
- 封装：升级 3.74.1 并执行完整 `npm run build` 与 `node scripts/verify-packaging-3-74-1.mjs`；安装器 `dist\神意助手-Setup-3.74.1.exe`，SHA256 `0c3ac48cae8845135e567def24b3c4343de5c5e88fc58f450076fda13b1008cc`，真实启动、renderer 74 文件、`electronAPI` 75 方法与可自选安装目录核验通过。

# 2026-10-05 组件生命周期退役与收敛

- 文件：[_audit/DEV_LOG_2026-10-05_component-lifecycle-retirement.md](_audit/DEV_LOG_2026-10-05_component-lifecycle-retirement.md)
- 范围：执行组件存在必要性方案，退役流水线旧 AI 工具栏与 `useAiTools`，迁移大纲自动拆解，修复编辑器写入跟随、DeAI 预算续命、`timeoutHint`、旧状态名归一、子 Agent 生命周期与共享物理请求预算根因。
- 验证：type-check 通过；服务总套件 129 文件 / 1458 测试通过；`build:vue` 通过；`verify-component-lifecycle-electron.mjs` PASSED，证据 `_audit/verification-component-lifecycle/`。子 Agent live 与长文档 live 未冒充通过，详见日志“诚实边界”。
- 客户重点复验：生成流水线只保留 AI起名；大纲自动拆解可用且有 trace；DeAI 预算耗尽可继续；API 写入时编辑器跟随滚动且用户滚动可接管；运行记录可见 timeout hint。

# 2026-10-06 API 直写覆盖收敛修复

- 文件：[_audit/DEV_LOG_2026-10-06_direct-write-coverage-convergence.md](_audit/DEV_LOG_2026-10-06_direct-write-coverage-convergence.md)
- 范围：修复 `editor.write` 生产返回 `data.coverage` 被覆盖判定层漏读的问题；单段 direct 成功写入不再被误判为 `partially_applied`，消除 25+ 次物理请求空转到 `physical_request_limit` 的循环。
- 验证：type-check 通过；服务总套件 129 文件 / 1466 测试通过；`build:vue` 通过；`verify-model-interference-electron.mjs` PASSED，edit-intent 2 次请求完成写入与正文收口，discuss-intent 保持只读。证据 `_audit/verification-model-interference-electron/evidence.json`。
- 客户重点复验：编辑类请求应一次工具写入后很快收口，不再长时间“正在等待 API 返回”；讨论类请求仍不提供 `editor.write`。

# 2026-10-06 经验文件升级 v8

- 文件：[_audit/DEV_LOG_2026-10-06_experience-file-v8.md](_audit/DEV_LOG_2026-10-06_experience-file-v8.md)
- 范围：新增 G1.15 系统层递进诊断门禁，要求症状层、链路层、组件组合层、机制层四层定位，并显式假设“正常组件组合后互相干扰”；使用路由同步加读规则。
- 验证：本轮为经验与方案文档任务，不涉及生产代码；`git diff --check` 通过，G1.15 与使用路由已逐行复核。
- 后续：文件名仍为 `神意开发经验总结_v7.md`，待用户确认后随“去旧补新”统一改名，避免 v7/v8 双文件并存。

# 2026-10-06 逐轮对话复盘与经验文件 v8.1

- 文件：[_audit/RETROSPECTIVE_2026-10-06_DIALOGUE_ROUND_REPLAY.md](_audit/RETROSPECTIVE_2026-10-06_DIALOGUE_ROUND_REPLAY.md)
- 范围：按用户要求完成 36 轮逐轮对话因果复盘，每轮登记触发原话、讨论动因、分歧、验证结果与下次第一步；经验文件升级 v8.1，新增 G1.16 对话因果复盘门禁，并把“经验回写必须先回放逐轮因果”加入使用路由。
- 验证：本轮为文档任务，不涉及生产代码；`git diff --check` 通过；G1.16、DEV_LOG 与总索引登记已逐行复核。
- 诚实边界：用户原话完整保留；我旧回复不可逐字恢复，因果链由用户原话、当轮交付物、DEV_LOG、方案与代码证据重建，不冒充逐字回放。
- 后续：文件名仍为 `神意开发经验总结_v7.md`，待用户确认后随“去旧补新”统一改名，避免旧新双文件并存。

# 2026-10-06 执行者自盲区门禁与经验文件 v8.2

- 文件：[_audit/RETROSPECTIVE_2026-10-06_DIALOGUE_ROUND_REPLAY.md](_audit/RETROSPECTIVE_2026-10-06_DIALOGUE_ROUND_REPLAY.md)
- 范围：追加 R37 用户纠偏；经验文件升级 v8.2，新增 G1.17 执行者自盲区，覆盖证明式验证、设计意图当验收标准、自建组件默认正常、替代证据顶替真实证据、方案确认后停止怀疑五类根源；使用路由新增方案确认后与写码前必须执行作者反证。
- 验证：本轮为文档门禁任务，不涉及生产代码；`git diff --check` 通过；G1.17、R37、DEV_LOG 与总索引登记已逐行复核。
- 后续：文件名仍为 `神意开发经验总结_v7.md`，待用户确认后随“去旧补新”统一改名，避免旧新双文件并存。

# 2026-10-06 反偷懒台账门禁与经验文件 v8.3

- 文件：[_audit/DEV_LOG_2026-10-06_experience-file-v8.md](_audit/DEV_LOG_2026-10-06_experience-file-v8.md)
- 范围：审计经验文件自身偷懒漏洞，确认口头合规、自判路由、无凭证回头看、作者自评成熟度、不可判定停止条件、无冲突裁决顺序六类通道；新增 G0.12 门禁执行台账，要求非平凡任务七节台账与实际行号读证；维护规则新增 L0 > L1 > L2 的门禁冲突裁决；复盘追加 R38。
- 验证：本轮为文档门禁任务，不涉及生产代码；`git diff --check` 通过；G0.12、R38、DEV_LOG 与总索引登记已逐行复核。
- 后续：从下一个非平凡任务开始强制执行 `_audit/TASK_LEDGERS/` 台账；文件名仍为 `神意开发经验总结_v7.md`，待用户确认后统一改名。

# 2026-10-06 遗留问题收敛总方案（待审核）

- 文件：[_audit/PROPOSAL_2026-10-06_RESIDUAL_CONVERGENCE_MASTER_PLAN.md](_audit/PROPOSAL_2026-10-06_RESIDUAL_CONVERGENCE_MASTER_PLAN.md)
- 范围：合并 R1-R7 全部登记遗留：长文档单源重构、子 Agent 退役、供应商 live、意图语料、工具手册固化、1M 实测、Phase 7 heartbeat 收口。
- 状态：方案待用户审核，未改生产代码；R1 内设 section id 稳定性与滚动上下文两个放行点。

# 2026-10-07 长文档执行效率修复

- 文件：[_audit/DEV_LOG_2026-10-07_long_document_execution_efficiency.md](_audit/DEV_LOG_2026-10-07_long_document_execution_efficiency.md)
- 范围：新增确定性本地变换执行器与 `local-transform` 路由；工具上下文压缩；`no_write_progress` 收敛门；双入口即时反馈；修复首页 trace 用户原话丢失与活动任务写入前版本收口。
- 验证：72/72 相关单测、type-check、build:vue、性能基准与 Electron 可见 UI 双入口复刻全部通过；7,602 字 3.319ms、1,035,784 字 61.561ms；双入口 0 物理请求 / 0 API call / 0 工具调用。
- 诚实边界：真实 API 语义分支 `untested`，无可用 live key，禁止 mock 冒充；版本封装未执行。
- 客户重点复验：发送“整理整篇文章：统一小节编号、清除多余空行、按编号重排，并保持所有正文内容不丢失。”应本地即时完成并导出 `execution_mode: local-transform` trace；语义改写类请求仍走模型路径。

# 2026-10-07 API 直写四线拆解修复

- 文件：[_audit/DEV_LOG_2026-10-07_direct_write_four_line_untangle.md](_audit/DEV_LOG_2026-10-07_direct_write_four_line_untangle.md)
- 范围：SKILL guidance 执行协议净化器；内层用户交接/协议违例停止门；物理请求预算单源；UI 终态事件驱动解锁。
- 验证：Electron 负路径、四态 SKILL 权限、双入口等价、S/M/L 三档矩阵通过；2026-10-08 新鲜复跑 297 条相关单测通过。
- 诚实边界：真实 live API 语义分支 `untested`；SKILL 手册待复核；版本封装未执行。
- 客户重点复验：加载 SKILL 后运行记录应出现 guidance 净化事件；模型提问时输入框立即解锁；预览形态立即停止不续发请求。

# 2026-10-08 API 直写残留缺口收口与 3.77.0

- 文件：[_audit/DEV_LOG_2026-10-08_api_direct_write_residual_gap_closure.md](_audit/DEV_LOG_2026-10-08_api_direct_write_residual_gap_closure.md)
- 范围：本地重排多重集校验；活动任务手动写入护栏；主页手动插入/修订直写化并删除 DiffModal；SKILL 手册 3.77.0 同步；live v3 六步真实验证；heading move 语义修复；工具上下文压缩 live 证据收口。
- 验证：live v3 6/6 通过（deepseek-v4-pro）；132 files / 1545 tests 全绿；type-check、build:vue、负路径 Electron、直写压测、provider wire matrix、3.77.0 打包真实启动全部通过。
- 客户重点复验：手动插入/修订不弹预览；活动任务挂起时手动写入提示恢复/取消；整节移动落在 section 边界；整理类请求出现 `local-transform-executed`。

# 2026-10-08 Active Plan Continuation 与 1M 读取坐标修复

- 文件：[_audit/DEV_LOG_2026-10-08_active-plan-continuation-and-million-read-range.md](_audit/DEV_LOG_2026-10-08_active-plan-continuation-and-million-read-range.md)
- 范围：跨轮计划 T1/T2/T3 单源续接；修复 `editor.read_range` 标题独占节与尾部分页混用 `charCount` / 完整区间两套坐标的缺陷。
- 验证：TDD 红测转绿；133 files / 1562 tests 全绿；type-check、build:vue、Electron 全量 stress E2E（含 1M 场景）通过；整篇替换负路径仍被安全阻断。
- 客户重点复验：百万字大纲的分批读取不再出现“offset 0 超出节内容长度 0”；T1 建计划、T2 讨论、T3 确认会复用同一执行计划并完成写入。

# 2026-10-11 3.79.0 版本封装

- 文件：[_audit/DEV_LOG_2026-10-11-packaging-3-79-0.md](_audit/DEV_LOG_2026-10-11-packaging-3-79-0.md)
- 范围：升级 3.79.0；新增 3.79.0 封装验证器；完整 NSIS 重打包与真实启动核验；清理 3.78.0 旧安装产物、旧验证器与旧证据目录。
- 前置成果：single-pass 全上下文重构、主页终稿流 OOM 修复、崩溃检测硬化、工具运行预算、读取台账与双入口真实链路验证。

# 2026-10-11 章节层批次契约与历史标题台账

- 文件：[_audit/DEV_LOG_2026-10-11_chapter-batch-contract-live-verification.md](_audit/DEV_LOG_2026-10-11_chapter-batch-contract-live-verification.md)
- 范围：章节批次显式契约、短产补生成、失败断点、全量历史标题单源注入、runTrace schema 16 与批次验收事件。
- 验证：专项 105/105、全量 1697/1697、type-check、build:vue 通过；27MB 事故回放在 B5 短产处 REJECTED。live 成功轮按用户批准以 summary 口径登记，payload 原件因清理策略未留存。
- 客户重点复验：短产批次不再滑动推进；第 2、3 批请求应包含 `[已生成章节标题清单]`；runTrace 应出现 `chapter-batch-validated`。

# 2026-10-10 全文上下文一次成型真实链路验证

- 文件：[_audit/DEV_LOG_2026-10-10_full-context-single-pass-live-verification.md](_audit/DEV_LOG_2026-10-10_full-context-single-pass-live-verification.md)
- 范围：真实 Electron UI + 真实 API 验证大纲/首页、无 SKILL/有 SKILL 共 4 个整篇重构场景；确认零工具调用、全文完整写入与 runTrace 归属正确。SKILL 场景均通过真实 UI 下拉选择。
- 验证：4/4 场景 `success / final_draft_complete`；74,293 字大纲均成功重排写回，`finishReason: stop`；3 个场景 1 次物理请求，`home-no-skill` 为 2 次物理请求。
- 诚实边界：`home-no-skill` 的第二次全文生成与约 1,261 秒总耗时登记为效率疑点；带 SKILL 场景首字延迟约 40-68 秒登记为观察项。live 证据覆盖单轮整篇重构，多轮会话连续性由代码契约和单测保证；本轮未重新封装，版本保持 3.78.0。
- 客户重点复验：对可容纳窗口内的大纲发送“按叙事逻辑重排、合并删除重复项、统一标点和标题层级、按 Word 格式整理”，应直接生成终稿并写回编辑器，不出现读取循环或工具调用。

# 2026-10-11 流水线产物契约统一与存储断点修复

- 文件：[_audit/DEV_LOG_2026-10-11_pipeline-artifact-contract-unification.md](_audit/DEV_LOG_2026-10-11_pipeline-artifact-contract-unification.md)
- 范围：卷纲/设定/正文三层产物契约与编排器、runTrace schema 17、统一终态归并、`storage:remove` 同步删除 `.bak` 断点。
- 验证：147 files / 1757 tests 全绿；type-check 与 build:vue 通过；真实 Electron UI + API live 四层 success，三层导出回放全部 `RESULT: ACCEPTED`；三条旧 schema 记录按 `EXPECTED-FAIL` 口径登记。
- 诚实边界：`electron-run.log` 只承载 Electron 子进程输出，`PASSED` 由验证器主进程输出；完成证据以 `summary.json`、三层 trace 导出与回放复核为准。

# 2026-10-12 3.80.0 流水线产物契约统一封装

- 文件：[_audit/DEV_LOG_2026-10-12-packaging-3-80-0.md](_audit/DEV_LOG_2026-10-12-packaging-3-80-0.md)
- 范围：升级 3.80.0；新增 3.80.0 封装验证器；完整 NSIS 重打包与真实启动核验；清理 3.79.0 旧安装包、旧验证器与旧证据目录。
- 验证：147 files / 1757 tests、type-check、build:vue、NSIS 打包、asar 版本、renderer 新鲜度、75 项 `electronAPI`、可见正文与 SHA256 全部通过。
- 安装包：`dist/神意助手-Setup-3.80.0.exe`，231,515,087 bytes，SHA256 `f2086c8c60636e63380a34b688819b7c7882815ef0ee1bd254271e444fe35e5f`。
- 客户重点复验：生成流水线卷纲/设定/正文应出现产物契约验收事件；删除带断点的存储文件后 `.bak` 不应残留。
# 2026-10-12 流水线修复反馈与链路可观测统一

- 文件：[_audit/DEV_LOG_2026-10-12_pipeline-repair-feedback-unification.md](_audit/DEV_LOG_2026-10-12_pipeline-repair-feedback-unification.md)
- 范围：schema 重试反馈、folder pass 物理口径事件、五类 chain warning 步骤日志聚合、S2 全上下文声明、DEAI 创作步正向化、续写防滚雪球与终步回显修复；章节/卷纲修复请求携带验收错误与禁止重复清单。
- 验证：专项 83 tests、type-check、全量 149 files / 1775 tests、build:vue、真实 Electron + 真实供应商 API 三场景（baseline / schema-retry / echo-retry）全部 success；三份新 trace 回放 ACCEPTED，旧正文层历史 trace 保持 EXPECTED-FAIL。
- 回头看修正：续写请求保留原始 system/template 上下文，仅将 user 限制为 32,000 字符尾部窗口，并新增单测锁死该契约。
- live 超时口径：单步 30 分钟、全局 3 小时；测试 SKILL `preProcess` 使用 `{ hook, payload }`；trace 归档先于断言。

# 2026-10-12 3.81.0 流水线修复反馈统一封装

- 文件：[_audit/DEV_LOG_2026-10-12-packaging-3-81-0.md](_audit/DEV_LOG_2026-10-12-packaging-3-81-0.md)
- 范围：升级 3.81.0；新增 3.81.0 封装验证器；完整 NSIS 重打包与真实启动核验；清理 3.80.0 旧安装包、旧验证器与旧证据目录。
- 验证：NSIS 打包、asar 3.81.0、renderer 新鲜度、74 个 renderer 文件、75 项 `electronAPI`、可见正文与 SHA256 全部通过。
- 安装包：`dist/神意助手-Setup-3.81.0.exe`，231,516,909 bytes，SHA256 `72e6116228ea4783ea69a434cbaed2e307e5487004cec30e7261be669dfc3186`。
- 客户重点复验：正文层 schema 失败后的下一轮请求应包含具体校验错误；warning 应出现在步骤日志而非仅事件流；终步回显不足时应出现一次带反馈修复。

# 2026-10-12 流水线耗时账本 Phase 1

- 文件：[_audit/DEV_LOG_2026-10-12_pipeline-timing-ledger.md](_audit/DEV_LOG_2026-10-12_pipeline-timing-ledger.md)
- 范围：runTrace schema 17→18；物理请求 first token / output 分段；API call 与 run 级 timingLedger 自动汇总；requestBuild / schemaValidate / retry / postProcess 本地分段；PipelinePanel 观测接线。只加观测，不改行为，旧 trace 兼容。
- 验证：149 files / 1778 tests、type-check、build:vue 全部通过；baseline / schema-retry / echo-repair 三份 live trace 回放全部 `RESULT: ACCEPTED`。
- 回头看修正：`schemaValidateMs` 计时起点曾覆盖 postProcess，已改为后处理结束后计时，避免耗时账本重叠失真。
- Phase 2 live run：3 卷 x S1-S4 完整通过；Top 3 为流式输出 3,276,691ms、首 token 658,956ms、postProcess 115ms；同时暴露 retry 口径负开销与 600 秒总时长切断活跃流两个缺陷。
- Phase 3 修复：物理重试 durationMs 改为 per-attempt 起点；首输出后禁用总时长超时并交给 idle / progress watchdog；Agent 编排器把 chunk/reasoning 增量上报为进度。TDD 专项 3 条、全量 149 files / 1781 tests、type-check 全部通过；未重新跑 live，后续采账时复用验证脚本。
- 后续：基于修正后的真实耗时分布，评估重复上下文与无效串行等待、受控并发、模型路由与增量校验。

# 2026-10-13 生成流水线耗时修复 Phase 5C/5D/5E

- 文件：[_audit/DEV_LOG_2026-10-13_pipeline_timing_remediation_phase5c5d.md](_audit/DEV_LOG_2026-10-13_pipeline_timing_remediation_phase5c5d.md)
- 范围：确认卷纲层慢在物理请求层；修复活跃流被 600 秒总超时误杀、retry 首 token 继承失败尝试耗时、卷纲层硬编码超时三个缺陷；补真实 Electron + 真实 API + 真实 UI 复测。
- 验证：`aiService.spec.ts` 168 条通过；服务总套件 1798 条、type-check、build:vue 通过。Phase 5E 六层全部 `success`；卷纲层从 54.58m / 14 物理请求 / 2 retry 降至 36.66m / 12 物理请求 / 0 retry，`firstTokenSumMs` 从约 20.81m（口径污染）降至 26.97s。
- 证据：`_audit/verification-pipeline-artifact-contract-live/summary.json`、`timing-analysis.json`；before 事故保留 `_audit/verification-pipeline-artifact-contract-live-archive/2026-10-12T20-05-51-471Z/`。
- 诚实边界：`PASSED` stdout 标记未落盘，完成判据只使用 summary 与 trace；正文层 schema retry 与卷纲层 `fullReasonMissing` 另行立项。

# 2026-10-13 流水线耗时修复 Phase 5F/5G 收尾

- 文件：[_audit/DEV_LOG_2026-10-13_pipeline_timing_remediation_phase5c5d.md](_audit/DEV_LOG_2026-10-13_pipeline_timing_remediation_phase5c5d.md)
- 范围：卷纲层 `fullReasonMissing` 收口、正文层 schema 重试反馈、验证器 WALL_BUDGET 预算修复、证据导出健壮复制、经验文件 v8.9。
- 验证：真实 Electron + 真实供应商 API 复验通过：run `run-1791884865708-1`，3 卷、12 API calls / 12 物理请求 / 0 retry / 0 timeout failure；`npm run test:services` 149 files / 1803 tests、type-check、build:vue 通过。
- 诚实边界：脚本退出码曾为 1，原因是 Windows CopyFile `UNKNOWN` 瞬态，目标 run trace 已完整落盘并经离线断言复核；验证器已改为字节级回退复制 + 尺寸校验。

# 2026-10-13 3.82.0 流水线耗时修复收尾封装

- 文件：[_audit/DEV_LOG_2026-10-13-packaging-3-82-0.md](_audit/DEV_LOG_2026-10-13-packaging-3-82-0.md)
- 范围：将 Phase 5C/5D/5E/5F/5G 成果交付为 3.82.0 安装包；升级版本号、新增 3.82.0 封装验证器、清理 3.81.0 旧验证器与旧产物。
- 验证：`npm run test:services` 149 files / 1803 tests、type-check、`npm run build` 通过；真实启动打包应用通过，asar `version=3.82.0`，renderer 74 个文件，`electronAPI` 77 个方法。
- 产物：`dist/神意助手-Setup-3.82.0.exe`，231,520,779 bytes，SHA256 `25dbe73b457394eb2caf21667963ebb0a0b5a38d2bed4f7be12005e6cd7ec824`。
- 证据：`_audit/verification-packaging-3-82-0/packaging-evidence.json`。

# 2026-10-13 oh-story-claudecode 开源仓库调研

- 文件：[_audit/DEV_LOG_2026-10-13_oh-story-claudecode-research.md](_audit/DEV_LOG_2026-10-13_oh-story-claudecode-research.md)
- 范围：本地克隆 `zenstory-ai/oh-story-claudecode`（main `2cf7be6`，v0.8.5），逐机制对账 story-long-write / story-setup / story-deslop 与我们的契约、memory、Agent、DEAI、直写体系；产出 P0-P2 采纳方案与不采纳清单。
- 价值：确认作用域化大纲读取、追踪状态事务、新增物三级授权、写后硬信号网四类机制可移植；文件型书库与多端 hooks 载体明确不采纳。
- 边界：调研报告与方案均已落盘，生产代码未改；上游完整写作流程未运行，性能收益待立项后用 before/after 账本验证。

# 2026-10-13 oh-story-claudecode 采纳项升级方案

- 文件：[_audit/PROPOSAL_2026-10-13_OH_STORY_ADOPTED_UPGRADE_PLAN.md](_audit/PROPOSAL_2026-10-13_OH_STORY_ADOPTED_UPGRADE_PLAN.md)
- 范围：把调研确认的五组采纳机制转成可审核落地方案，逐项给出 Before/After、具体升级项、验收门禁、失败禁止路径与风险对策。
- 顺序：P0-B Memory 状态事务先行，P0-A 作用域上下文闭包随后，P1-C/D/E 依次落地。
- 边界：仅方案落盘，生产代码未改；性能收益不承诺百分比，待实测对账表。
- 裁决更新：新增物三级申报（原 P1-C）整体取消，不引入阻塞确认状态机，也不做非阻塞清单分流；执行顺序调整为 P0-B → P0-A → P1-D/E。

# 2026-10-14 P0-B Memory 状态事务系统收口

- 文件：[_audit/DEV_LOG_2026-10-14_p0b-memory-transaction-closure.md](_audit/DEV_LOG_2026-10-14_p0b-memory-transaction-closure.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-14_p0b-memory-transaction-closure.md](_audit/TASK_LEDGERS/2026-10-14_p0b-memory-transaction-closure.md)
- 范围：新增 trackingStateService 事务队列与修订号乐观锁；抽取、导入、覆盖导入、版本回滚、章节回滚全部迁移到单写入口；MemoryPanel infra runTrace 与 `tracking_commit` 事件；组件直调 mergeMemory 禁令；导入缺字段归一化防崩溃。
- 验证：`npm run test:services` 151 files / 1817 tests、type-check、build:vue、`verify:production-wiring` 0 violations；真实可见 Electron + 真实 DOM 点击 + 真实本地 provider 5 Case 全过，证据 `report.json`。
- 诚实边界：尺寸阈值为首版采样值；runTrace 未保存完整 before/after 快照；P0-A 作用域闭包尚未实现。
- 封装：升级 3.83.0；`npm run build` 通过；安装包 `dist/神意助手-Setup-3.83.0.exe`，231,523,277 bytes，SHA256 `FDD63FE66224A0561B6F54B83554F96000D2D0D5745A8BE8DA19DFC6586D1FF0`；已清理 3.82.0 旧安装包与 blockmap。

# 2026-10-14 P0-A 作用域上下文闭包收口

- 文件：[_audit/DEV_LOG_2026-10-14_p0a-context-scope-closure.md](_audit/DEV_LOG_2026-10-14_p0a-context-scope-closure.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-14_p0a-context-scope-closure.md](_audit/TASK_LEDGERS/2026-10-14_p0a-context-scope-closure.md)
- 范围：卷纲段位契约解析与单元闭包构建、执行包 v2 禁止全书回退、记忆三档优先检索、`context_scope` 与 `memory_context` trace 事件、Electron 三 Case 验证器。
- 验证：专项 25 tests、全量 154 files / 1837 tests、type-check、build:vue、Electron 正例 / legacy 显式降级 / 缺失单元结构化失败全部通过；真实 SSE provider 请求体确认 `stream:true` 且无关单元未进入 prompt。
- 诚实边界：本轮为本地 SSE mock provider，非外部 live；`unitId` 仍有正则推断路径；闭包预算为首版采样值。
- 封装：升级 3.84.0；`npm run build` 通过；安装包 `dist/神意助手-Setup-3.84.0.exe`，231,526,544 bytes，SHA256 `9F1353A9EB0697B5223FA8F9E75F1F8E2DC0BD2A8FDABBCC44AECDE629DB2AE9`；已清理 3.83.0 旧安装包与 blockmap。

# 2026-10-14 P1-D 写后硬信号 Stop 网收口

- 文件：[_audit/DEV_LOG_2026-10-14_p1d-hard-signal-stop-net.md](_audit/DEV_LOG_2026-10-14_p1d-hard-signal-stop-net.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-14_p1d-hard-signal-stop-net.md](_audit/TASK_LEDGERS/2026-10-14_p1d-hard-signal-stop-net.md)
- 范围：新增四类硬信号扫描器（截断/拒绝语/工程词/紧邻复读）、定点修复器与完整性门禁、PipelinePanel 回合末必扫接线、provider 截断短路本地修复、两次不净进入 `hard_signal_unresolved` 降级终态。
- 关键修复：扫描器无 `g` 标志正则死循环改为单次匹配 + 同类型重叠去重；复扫事件补齐 `detected/status/counts/findings`；`latestBodyFinishReason` 修复为同时读取 success/degraded，截断证据不再被丢弃。
- 验证：专项 4 files / 33 tests、build:vue、真实可见 Electron 三 Case 全过；clean 为 1 scan / 1 request，repair 为 2 scans / 2 requests，provider truncation 为 degraded / 2 scans / 1 request，证据 `report.json`。
- 诚实边界：`persisted-bodies.json` 快照键位不匹配导致 body 空字符串，业务正文断言已通过，登记为验证器后续修正项；真实项目误报分布需持续采样。

# 2026-10-14 P1-E 卷契约语义扩充收口

- 文件：[_audit/DEV_LOG_2026-10-14_p1e-contract-semantics.md](_audit/DEV_LOG_2026-10-14_p1e-contract-semantics.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-14_p1e-contract-semantics.md](_audit/TASK_LEDGERS/2026-10-14_p1e-contract-semantics.md)
- 范围：卷契约五类语义字段（读者期待/主推线/解锁里程碑/禁区/风险）、卷生成 9 字段协议、闭包禁区合并、正文执行 `[禁止提前释放]` 块、确定性三态契约审查与 `contract_review` trace 事件；只报告不阻塞。
- 关键修复：wiring 断言从 `indexOf` 单匹配改为全局计数，防止第二处卷写入缺接线假绿；契约审查不信任模型自评，落盘后本地判定。
- 验证：专项 6 files / 65 tests、全量 159 files / 1882 tests、type-check、完整 NSIS build、3.86.0 打包真实启动核验、Electron 双 Case 全过；normal 为 `contract_safe` / 1 request，early reveal 为 `contract_broken` / 1 request，证据 `report.json`。
- 诚实边界：揭示词表与 80 字窗口为首版采样，暗示式剧透需持续采样；本地 provider 非 live；生成质量收益未人工评分，标注“未验证”。
- 封装：升级 3.86.0；安装包 `dist/神意助手-Setup-3.86.0.exe`，231,529,296 bytes，SHA256 `aa4427b9c78ebbebea0afc2ebc662565ac5140efdc3f4844470604ed4acf7519`；已清理 3.85.0 旧安装包与 blockmap。

# 2026-10-14 P1-F 章节分批生成模式收口

- 文件：[_audit/DEV_LOG_2026-10-14_p1f-chapter-batch-modes.md](_audit/DEV_LOG_2026-10-14_p1f-chapter-batch-modes.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-14_p1f-chapter-batch-modes.md](_audit/TASK_LEDGERS/2026-10-14_p1f-chapter-batch-modes.md)
- 范围：章节层三入口（生成本批章节 / 全量生成章节 / 续生成）共用 `genChapters(mode)` 单引擎；模式规划器、部分账本校验、批次成功暂停、最终章清断点、取消不入库、旧文案与旧验证入口清零。
- 关键修复：Electron 验证器取 run 从 `.at(-1)` 修正为 `.at(0)`，并强制新 run id 防回归；取消用例升级为 4/6 未完成时取消，证明半批不入库且不得伪装 `paused`。
- 验证：专项 3 files / 28 tests、全量 161 files / 1897 tests、type-check、完整 NSIS build、Electron 三批次 + 取消真实 UI 全过；2/4/6 章递进，前两批 `chapters_batch_complete` + `paused`，第三批 `chapters_generation_complete` + 断点清空，取消保持 4 章且 run `canceled`，证据 `report.json`。
- 诚实边界：本地 provider 非 live；分批解决可操作性与恢复，不做耗时优化声明；`_data` 历史 profile / 凭据 / run-trace 分属多个已收口任务，列为独立清理专项。
- 封装：升级 3.87.0；安装包 `dist/神意助手-Setup-3.87.0.exe`，231,528,921 bytes，SHA256 `b0540ee8e6e3df1372440fd13a6a76f1625152f06de2c83ed27818a9df67d503`；已清理 3.86.0 旧安装包与 blockmap。

# 2026-10-15 reasoning-only 卡流语义重试收口

- 文件：[_audit/DEV_LOG_2026-10-15_reasoning-only-stall-retry.md](_audit/DEV_LOG_2026-10-15_reasoning-only-stall-retry.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-15_reasoning-only-stall-retry.md](_audit/TASK_LEDGERS/2026-10-15_reasoning-only-stall-retry.md)
- 范围：reasoning-only 流 12 分钟 body-absent watchdog、`reasoning_only_stalled` 终态分类、一次性协议感知语义重试（`thinking_disabled` / `max_tokens_raised`）、physical call 诊断字段、deep run trace payload 解引用验证。
- 关键修复：deep 导出正文按契约外置到 payloads，验证器改为解引用真实落盘文件，不再把 payload 引用对象当字符串；renderer override 改为 build define + 提前注入，解决测试 12 分钟等待假失败。
- 验证：专项 1 file / 171 tests、type-check、15 秒 override build、可见 Electron 真实 UI 全过；2 次物理请求，第一轮 `reasoning_only_stalled`，第二轮 `thinking_disabled`，成功持久化 1 卷，证据 `report.json`。
- 诚实边界：本地 OpenAI-compatible provider 非 live；`max_tokens_raised` 为单测覆盖，未做双协议 Electron 实测。
- 封装：升级 3.88.0；升版后专项 171/171、type-check、build、打包核验全部通过；安装包 `dist/神意助手-Setup-3.88.0.exe`，231,529,621 bytes，SHA256 `bb07565088ac8b9ce432fb6f1ae9ff7025ef594ef7952c1a76bb7f729f4ab47f`；已清理 3.87.0 旧安装包与 blockmap。

# 2026-10-15 大纲工作台创作风格锁定与全流水线同步收口

- 文件：[_audit/DEV_LOG_2026-10-15_outline-style-profile-lock-sync.md](_audit/DEV_LOG_2026-10-15_outline-style-profile-lock-sync.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-15_outline-style-profile-lock-sync.md](_audit/TASK_LEDGERS/2026-10-15_outline-style-profile-lock-sync.md)
- 范围：项目级 `styleProfile` 单源持久化、StyleProfileCard 单源双视图、大纲 chain/plain 系统提示词注入、终稿 constraints 任务快照、本地变换与自动拆解豁免、设定/卷纲/章节/正文四层接线、SKILL 模板变量仅锁定注入、`style-profile` trace 事件。
- 关键补口：收尾自审清掉未锁定草稿经模板变量与正文执行包漏入模型的三条通道；终稿 create/continue/retry/resume 补 `constraintsSource:'task_snapshot'` 观测；修复先建 prompt 后建 run 导致第一轮风格 trace 丢失的顺序问题。
- 验证：`npm run test:services` 162 files / 1912 tests、type-check、build:vue、真实 Electron UI 全过；unlocked 不注入、locked 注入、本地变换豁免、流水线同步、持久化均有 report 证据。
- 诚实边界：Electron 为本地 mock provider，非外部 live；风格锁为项目级，不做跨项目复制。
- 封装：升级 3.89.0；安装包 `dist/神意助手-Setup-3.89.0.exe`，231,530,562 bytes，SHA256 `db3e9e10a772977314128d3fefde83a3106ce464436b5dbac476421cdfba34c7`；已清理 3.88.0 旧安装包与 blockmap。

# 2026-10-16 正文修复台账与断点 owner 隔离收口

- 文件：[_audit/DEV_LOG_2026-10-16_body-repair-ledger-owner-isolation.md](_audit/DEV_LOG_2026-10-16_body-repair-ledger-owner-isolation.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-16_body-repair-ledger-owner-isolation.md](_audit/TASK_LEDGERS/2026-10-16_body-repair-ledger-owner-isolation.md)
- 范围：正文修复升级为 `none / targeted / full_chain` 三态，targeted 失败后仅允许一次 full_chain 兜底；attempt 与 post-process 同账记录；chain 与共创断点按 owner 隔离；生成中锁定卷/章节选择与编辑删除入口；trace attempt 改为结构化摘要 + 200 字预览。
- 验证：专项 5 files / 69 tests、全量 `npm run test:services` 164 files / 1929 tests、type-check、build:vue、真实 Electron UI 全过；短文 `too_short` 后 targeted 修复为 `complete/2460字`，物理请求 2 次，生成中 UI 锁定与恢复均有 `report.json` 证据。
- 诚实边界：Electron 为本地 OpenAI-compatible provider，非外部 live；本轮只断言正文层单章路径，批量子 Agent 与多 SKILL 组合未纳入。
- 封装：升级 3.90.0；安装包 `dist/神意助手-Setup-3.90.0.exe`，231,531,641 bytes，SHA256 `9930d761905d97db2dfdbffd2e4345ff03336714627a829e383fd4f40493ed3d`；打包真实启动核验通过，证据 `_audit/verification-packaging-3-90-0/packaging-evidence.json`；已清理 3.89.0 旧安装包与 blockmap。
- 补账：用户追问经验文件未跟随更新后，经验文件升级 v8.10（G2.9 并入正文修复三态、attempt 单账、owner 隔离与生成中目标锁），新增 RETROSPECTIVE_2026-10-16_BODY_REPAIR_LEDGER.md，DEV_LOG 增补回写追记。

# 2026-10-16 owner 断点事故经验回写与方案

- 文件：[_audit/DEV_LOG_2026-10-16_owner-breakpoint-experience-closure.md](_audit/DEV_LOG_2026-10-16_owner-breakpoint-experience-closure.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-16_owner-breakpoint-experience-closure.md](_audit/TASK_LEDGERS/2026-10-16_owner-breakpoint-experience-closure.md)
- 范围：核实 015556 正文层事故根因；经验文件升级 v8.11，G1.17 补状态生命周期对账、二次进入矩阵、查账三列法，G2.9 补断点清理对称、已完成链拒绝恢复、attempt 请求指纹；新增事故复盘与 F1-F6/V1-V10 修复方案，等待用户审核。
- 验证：文档任务，不改生产代码；经验文件版本、G1.17、G2.9、L3 映射与 diff check 待收尾复核。
- 诚实边界：V1-V10 验证矩阵与事故 trace 回放尚未执行；生产修复未开始。

# 2026-10-16 owner 断点生命周期闭环实施收口

- 文件：[_audit/PROPOSAL_2026-10-16_OWNER_BREAKPOINT_LIFECYCLE_CLOSURE.md](_audit/PROPOSAL_2026-10-16_OWNER_BREAKPOINT_LIFECYCLE_CLOSURE.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-16_owner-breakpoint-experience-closure.md](_audit/TASK_LEDGERS/2026-10-16_owner-breakpoint-experience-closure.md)
- 范围：F1-F6 全量落地；owner 成功断点对称清理、completed 断点拒绝恢复、attempt 请求指纹、degraded 无效输出拦截、正文长度契约前移、终步 echo 职责化。
- 关键修正：Electron 首跑发现契约误套 S1 分析步；新增 `isBodyContractStep()` 与 `chainHandoff.role`，仅生成步执行正文契约。
- 验证：定向 3 files / 33 tests、全量 165 files / 1937 tests、type-check、build:vue、两个真实 Electron 验证器全过；completed owner 断点被拒绝、S2 短产契约结构化失败、旧产物未入库、targeted 修复回归不破坏。
- 诚实边界：V6/V7/V10 当轮为接线断言与历史回归，015556 原始 trace 用同语义 Electron 复刻替代逐 token 回放器；该缺口已在同日故障注入补强条目收口。
- 封装：升级 3.91.0；安装包 `dist/神意助手-Setup-3.91.0.exe`，231,553,091 bytes，SHA256 `9758313b7c5ff5ff02f6d4595a909e41072daf70d8652d14e2dd0141b390ab11`；打包真实启动核验通过，证据 `_audit/verification-packaging-3-91-0/packaging-evidence.json`；已清理 3.90.0 旧安装包与 blockmap。
- 打包机况：本机首次完整构建出现 `win-unpacked/神意助手.exe` EBUSY/rcedit `Unable to commit changes` 间歇资源锁；独立复测同一 EXE 的完整 rcedit 参数成功。最终 NSIS 构建使用一次性 `--config.win.signAndEditExecutable=false` 绕过该间歇冲突，asar integrity 与打包后真实启动核验均已通过。后续若复现，应优先查杀安全软件/索引器句柄并恢复默认签名编辑路径。

# 2026-10-16 owner 断点故障注入证据补强与 3.91.1 封装

- 脚本：[_audit/verification-owner-breakpoint-failure-injection-electron/report.json](_audit/verification-owner-breakpoint-failure-injection-electron/report.json)
- 范围：补齐 V6 storage 清理失败、V7 folder degraded、V10 owner/章节共享槽双注入三个真实 Electron 故障注入场景；无假 SKILL 注入，V6 失败仅注入存储层。
- 根因修正：`isBodyContractStep()` 改为 `declaredRole` 优先，两步链 S1 `role: analysis` 不再被位置推断误判为生成步；closure/body-repair heartbeat 采集器补 `durationMs()`，修复“断言升级但采集器未升级”的假失败。
- 经验回写：`神意开发经验总结_v7.md` 升级 v8.12；G1.5 补入验证器断言、采集器、证据载体同批升级契约。
- 验证：故障注入脚本 PASSED（V6/V7 各 4 次物理请求且 run failed，V10 4 次物理请求且 success）；closure/body-repair Electron 验证器重跑 PASSED；`npm run test:services` 165 files / 1939 tests；type-check、build:vue、build 通过。
- 诚实边界：本地 mock 供应商 Electron 验证，未覆盖外部 live 供应商；015556 原始 trace 仍未做逐 token 回放器。
- 封装：升级 3.91.1；安装包 `dist/神意助手-Setup-3.91.1.exe`，231,532,815 bytes，SHA256 `451167c3cc43b242dd1410d8565276925829242ef1fd161bdd790a4354a0412e`；rendererFiles=74、electronAPI methods=77；证据 `_audit/verification-packaging-3-91-1/packaging-evidence.json`；已清理 3.91.0 安装包与 blockmap 及 `_data/owner-breakpoint-failure-profile` 临时 profile。

# 2026-10-16 创作风格档案结构化 V2 与 3.92.0 封装

- 文件：[_audit/DEV_LOG_2026-10-16_style-profile-structured-v2.md](_audit/DEV_LOG_2026-10-16_style-profile-structured-v2.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-16_style-profile-structured-plan.md](_audit/TASK_LEDGERS/2026-10-16_style-profile-structured-plan.md)
- 方案：[_audit/PROPOSAL_2026-10-16_STYLE_PROFILE_STRUCTURED_ARCHITECTURE.md](_audit/PROPOSAL_2026-10-16_STYLE_PROFILE_STRUCTURED_ARCHITECTURE.md)
- 范围：`profileVersion:2`、真实拆书档案严格导入、AI 分析证据边界、单源风格编译器、六层预算注入、结构化 trace、锁定态保护、双宿主同步与 P0 before/after 长度账。
- 验证：定向 4 files / 14 tests、全量 169 files / 1959 tests、type-check、完整 build、可见 Electron UI、3.92.0 打包真实启动核验全部通过；V2 导入 8 句式 / 4 场景 / 4 警戒线 / 5 日更规则，锁定态导入、分析、启停禁用，注入账 232-767 字符且未裁剪。
- 诚实边界：生成质量提升 `untested`；Electron 为本地 mock provider，非外部 live；极端拆书格式变体需真实客户档案持续采样。
- 封装：升级 3.92.0；安装包 `dist/神意助手-Setup-3.92.0.exe`，231,539,306 bytes，SHA256 `aa25935ec9313b9387fd4c350760764ca97af46247976098fb91fe0b02250a2f`；rendererFiles=74、electronAPI methods=77；证据 `_audit/verification-packaging-3-92-0/packaging-evidence.json`；已清理 3.91.1 安装包与 blockmap。

# 2026-10-16 降AI分层注入修复

- 文件：[_audit/DEV_LOG_2026-10-16_deai-layered-injection.md](_audit/DEV_LOG_2026-10-16_deai-layered-injection.md)
- 范围：S1 方法论 / S2 创作精简 / S3 打磨契约三档分派；folder 与非 folder 全链接线；chain 主调用、echo 修复、full-retry 全覆盖；compose 保持方法论并标注 `methodology-compose`；导入配置把 `split-merge` / `multi-step` 归一为 `chain` 并写 warning。
- 验证：type-check 通过；skillRouter / realSkillExecutor / skillOrchestrator 62 tests 通过；全量 `npm run test:services` 169 files / 1961 tests 通过；真实 Electron UI + 外部 live provider 三场景通过（baseline 3 calls / 1760 字、schema-retry 3 calls / 1952 字、echo-repair 4 calls / 1936 字，脚本 exit 0）。
- 诚实边界：上一轮 200 字通过是 `[NOT-READY]` 透传，本轮 1200 字目标夹具才构成有效证据；schema 断言失败曾由验证脚本选错调用导致，已修复并复核；live 覆盖当前一个供应商形态。
- SKILL 反馈闭环：新增 `deaiChainVariantIntegration.spec.ts` 贯通 routeSkill → realSkillExecutor → requestMessages，锁定三档变体互斥；清理 `callApiWithAgentTimeout` 死代码。验证：定向 4 files / 54 tests、type-check、全量 170 files / 1962 tests 通过。

# 2026-10-17 协议建议、真降级与终步回显状态收口

- 文件：[_audit/DEV_LOG_2026-10-17_protocol-status-echo-consolidation.md](_audit/DEV_LOG_2026-10-17_protocol-status-echo-consolidation.md)
- 范围：advisory warnings 与真降级分流、`success_with_warnings / completed_with_warnings` 终态、两个工作台 postProcess 文案统一、升级重试路径终步回显豁免。
- 验证：定向 6 files / 153 tests、全量 170 files / 1966 tests、type-check、真实 Electron 双工作台 UI 全过；历史卷纲/正文 trace 回放完成双语义对账。
- 诚实边界：本地 mock OpenAI-compatible provider，非外部 live 供应商。

# 2026-10-17 正文层四漏整改收口与 3.94.0 升版

- 文件：[_audit/DEV_LOG_2026-10-17_four-leak-remediation.md](_audit/DEV_LOG_2026-10-17_four-leak-remediation.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-17_four-leak-remediation.md](_audit/TASK_LEDGERS/2026-10-17_four-leak-remediation.md)
- 门禁：[_audit/PHASE_MINUS1_FOUR_LEAK_GATES_2026-10-17.md](_audit/PHASE_MINUS1_FOUR_LEAK_GATES_2026-10-17.md)
- 范围：终步回显三路单源化、build manifest/runtime fingerprint、targeted 修复按 generator 步执行、断点清理与 attempt 产物同步传递、S1 字数契约单次注入、验证器锚点与样稿职责差异修正、经验 v8.13。
- 验证：全量 170 files / 1978 tests、type-check、build:vue、真实 Electron UI 全过；首链 3 请求后 targeted 2 请求，S1 仅执行 1 次，attempt 2 为 `targeted/complete/2000字`。
- 诚实边界：Electron 为本地 OpenAI-compatible provider，非外部 live 矩阵；SKILL 层 S1 模板问题已转达；原始 021335 trace 未做逐 token 回放器。
- 封装：版本升级 3.94.0；`package.json` 与 `package-lock.json` 同步；既有 chunk 超限与 `vite.protocols.config.mts` `__dirname` warning 保持登记不修。

# 2026-10-17 正文层降级越权与产物契约收口

- 文件：[_audit/DEV_LOG_2026-10-17_body-contract-degraded-gate.md](_audit/DEV_LOG_2026-10-17_body-contract-degraded-gate.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-17_body-contract-degraded-gate.md](_audit/TASK_LEDGERS/2026-10-17_body-contract-degraded-gate.md)
- 方案：[_audit/PROPOSAL_2026-10-17_BODY_CONTRACT_DEGRADED_GATE_ROOT_CLOSURE.md](_audit/PROPOSAL_2026-10-17_BODY_CONTRACT_DEGRADED_GATE_ROOT_CLOSURE.md)
- 跨层审计：[_audit/CROSS_LAYER_DEGRADED_AUDIT_2026-10-17.md](_audit/CROSS_LAYER_DEGRADED_AUDIT_2026-10-17.md)
- 范围：单源 `stepArtifactAcceptance` 验收门、生成步契约注入、degraded envelope、S3 只消费提取面、attempt 决策台账、`skillOrchestrator` 局部放行规则清除、复合 SKILL `no_contract` 边界、经验 v8.14。
- 范围补口：收尾复跑发现无 SKILL compose 未被识别为唯一生成步；修复 `null` / `0` 语义、compose 契约注入与验收台账，compose 契约失败时修复决策权交回编排器；经验升级 v8.15。
- 验证：定向 4 files / 67 tests；历史事故回放 PASSED（旧 `generation_failed` 在生成步以 `degraded_plus_contract_failure` 阻断且 S3 零调用）；真实 Electron UI PASSED（拒绝场景 S3 零调用且 run failed，通过场景 S3 一次调用且 warning 保留）；全量 172 files / 1998 tests、type-check、build:vue、body-repair / owner-breakpoint / postprocess 双工作台 Electron 回归全部通过。
- 诚实边界：Electron 为本地 OpenAI-compatible provider，非外部 live 矩阵；原始 043758 trace 未做逐 token 回放器；SKILL 提示词内容未修改；postProcess 证据位于 `output/playwright/postprocess-terminal-ui/`。

# 2026-10-17 五项登记边界闭环与 3.96.0 升版

- 文件：[_audit/DEV_LOG_2026-10-17_boundary-closure.md](_audit/DEV_LOG_2026-10-17_boundary-closure.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-17_boundary-closure.md](_audit/TASK_LEDGERS/2026-10-17_boundary-closure.md)
- 范围：大纲产物契约生产接线、恶意 SKILL 提示词/授权边界测试、payload 三方同源回放、live 供应商生产入口验证器、Electron 契约 UI 复验。
- 验证：type-check、专项 49 tests、全量 173 files / 2009 tests、build:vue、payload replay、Electron 拒收/接受双场景全部通过。
- 诚实边界：外部 live 供应商两个已配置 key 均返回 401，状态为 `blocked_external_credentials`，应用链路已验证但 live 成功响应未验证。
- 封装：升级 3.96.0；构建 chunk 超限为真实体积提示（index 1,054.41 kB、g6 1,406.66 kB），未调阈值伪装消警。
- 封装收口：安装包 `dist/神意助手-Setup-3.96.0.exe`，231,544,720 bytes，SHA256 `b43ec972633ae06458ab9d2e38ee489f4376ae68da2b3ccc55be71bed3b3d141`；打包后真实启动核验 PASSED（rendererFiles=81、electronAPI methods=77），证据 `_audit/verification-packaging-3-96-0/packaging-evidence.json`；3.94.0 旧安装包与 blockmap 已清理，dist 仅保留 3.96.0 产物及核验载体。

# 2026-10-17 正文层 metadata 契约与物理重试台账收口

- 文件：[_audit/DEV_LOG_2026-10-17_metadata-retry-ledger-closure.md](_audit/DEV_LOG_2026-10-17_metadata-retry-ledger-closure.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-17_metadata-retry-ledger-closure.md](_audit/TASK_LEDGERS/2026-10-17_metadata-retry-ledger-closure.md)
- 范围：metadata 受控摘要交接与断点持久化、`normal/schema_retry/direct_retry/continuation` 物理请求分类、run/step timing 同源求和、token 校准方向修正、`countBodyWords` 生产统一、`legacy_outline_no_scope` 如实登记。
- 验证：全量 173 files / 2015 tests、type-check、build:vue、真实 Electron 拒绝/接受双场景全部通过；接受场景 S3 请求携带 `extractedMeta: count=1,totalChars=6867` 且无原文，timing 为 call/run/step same-source sums。
- 诚实边界：`legacy_outline_no_scope` 为历史遗留；`buildSchemaRetryFeedback` 全文回传为同族未修登记项；Electron 为本地 provider，非外部 live 矩阵。
- 经验裁决：保持 v8.15，不升 v8.16；验证器断言自相矛盾属于 G1.5 既有门禁覆盖案例。
- 封装：升级 3.97.0；安装包 `dist/神意助手-Setup-3.97.0.exe`，231,547,162 bytes，SHA256 `d25c45ac8a88a2881869b6855a82ac63f278c13b0c44c24e1a3ecba21a06f723`；打包后真实启动核验 PASSED（rendererFiles=81、electronAPI methods=77），证据 `_audit/verification-packaging-3-97-0/packaging-evidence.json`；3.96.0 旧安装包与 blockmap 已清理，dist 仅保留 3.97.0 产物及核验载体。

# 2026-10-19 正文终步元数据保真与流水线契约 live 收口

- 文件：[_audit/DEV_LOG_2026-10-19_final-step-metadata-fidelity.md](_audit/DEV_LOG_2026-10-19_final-step-metadata-fidelity.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-19_final-step-metadata-fidelity.md](_audit/TASK_LEDGERS/2026-10-19_final-step-metadata-fidelity.md)
- 方案：[_audit/PROPOSAL_2026-10-19_BODY_FINAL_STEP_METADATA_FIDELITY.md](_audit/PROPOSAL_2026-10-19_BODY_FINAL_STEP_METADATA_FIDELITY.md)
- 范围：终步反馈单源化且 retry 禁携候选全文、终步元数据提取与结构化修复、终步角色显式推断、卷纲逐批事实同步、验证器语义断言与预算随执行形态迁移。
- 验证：反证矩阵 3 files / 15 tests、实现面 5 files / 107 tests、全量 177 files / 2048 tests、type-check、build:vue 全部通过；第 12 轮完整 Electron + 真实 API live 输出 `PIPELINE ARTIFACT CONTRACT ELECTRON LIVE PASSED`，卷纲 12 次调用 3 卷收敛，正文 3 API / 7 物理 / 4 schema retry 后契约通过。
- 诚实边界：live 为 `deepseek-v4-pro` 单一供应商形态；1500 字结构下限与降 AI 约束冲突属 SKILL 层缺口，应用不放宽阈值；其他供应商与未来输出形态登记 `untested`。
- 经验回写：升级 v8.16；G2.9 补终步角色与反馈单源契约，G1.19 补验证器预算随执行形态迁移契约。
- 封装：版本升级 3.99.0；live 证据保留于 `_audit/verification-pipeline-artifact-contract-live/`，历史失败现场归档于 `verification-pipeline-artifact-contract-live-archive/`。

# 2026-10-20 卷纲层历史问题修复与 schema retry 反馈收口

- 文件：[_audit/DEV_LOG_2026-10-20_volume-retry-feedback-closure.md](_audit/DEV_LOG_2026-10-20_volume-retry-feedback-closure.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-20_volume-retry-feedback-closure.md](_audit/TASK_LEDGERS/2026-10-20_volume-retry-feedback-closure.md)
- 范围：非终步 schema retry 反馈单源化且禁携候选全文、`schema-retry-feedback-composed` 观测事件、卷纲 folder/direct 输出协议分流、续卷上下文 summary + 240 字符锚点、旧 JSON 协议新旧句式剥离。
- 验证：定向 4 files / 96 tests、全量 178 files / 2055 tests、type-check、build:vue 全部通过。
- 诚实边界：新反馈未做 Electron + 真实 API live 复跑，登记 `untested`；`chainHandoff.reason` 属 SKILL 层元数据缺口；reasoning per-step 配置化仍为登记项。
- 经验裁决：保持 v8.16，不升 v8.17；本轮是既有 G2.9/G0.10/G1.19 门禁的执行收口，无新纪律缺陷。
- 封装：升级 3.100.0；安装包 `dist/神意助手-Setup-3.100.0.exe`，231,551,270 bytes，SHA256 `7339303075759fcf68eccd1dc5985b729c21ee8959cd07ccf19bab23fcc304ab`；打包后真实启动核验 PASSED（rendererFiles=81、electronAPI methods=77），证据 `_audit/verification-packaging-3-100-0/packaging-evidence.json`；3.97.0 旧安装包与 blockmap 已清理。

# 2026-10-20 设定卡片锁定状态单源化（问题一）

- 文件：[_audit/DEV_LOG_2026-10-20_settings-lock-projection.md](_audit/DEV_LOG_2026-10-20_settings-lock-projection.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-20_settings-lock-projection.md](_audit/TASK_LEDGERS/2026-10-20_settings-lock-projection.md)
- 范围：设定卡片 `status: draft | locked` 单源、schema 3→4 迁移、四层锁定投影、旧 `[绑定设定]` 重复通道删除、`settings-projection-composed` trace。
- 验证：全量 180 files / 2065 tests、type-check、build:vue 全部通过；真实 Electron UI PASSED，覆盖迁移、单锁/解锁/批量锁、卷纲/章节/正文生成、首页对话投影。
- 诚实边界：本地 OpenAI-compatible provider，非外部 live 矩阵；卷纲 `isBound` 业务语义保留；问题二未开工。
- 封装：未升版、未打包，等待问题一用户验收。

# 2026-10-20 设定层分层语义约束（问题二）

- 文件：[_audit/DEV_LOG_2026-10-20_settings-layer-semantics.md](_audit/DEV_LOG_2026-10-20_settings-layer-semantics.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-20_settings-layer-semantics-plan.md](_audit/TASK_LEDGERS/2026-10-20_settings-layer-semantics-plan.md)
- 方案：[_audit/PROPOSAL_2026-10-20_settings-layer-semantics.md](_audit/PROPOSAL_2026-10-20_settings-layer-semantics.md)
- 范围：四层设定语义单源（卷纲规划、章节规划、正文执行、首页共创）、触发词旁路删除、trace 分类分布与入选/排除原因、正文接线分叉修复、首页消息快照崩溃修复、终步回放证据仓库化。
- 验证：定向投影/接线/回放测试通过，回放 4/4；全量 180 files / 2067 tests、type-check、build:vue 全部通过；真实 Electron UI 最终轮 PASSED（schema 3→4、锁/解锁/批量锁、四层语义块、草稿排除、心跳 4 帧）。
- 诚实边界：本地 OpenAI-compatible provider，非外部 live 矩阵；首页相关性为名称/关键词匹配；预算裁剪链路未触发；版本保持 3.100.0，未升版、未打包，等待问题二用户验收。

# 2026-10-21 大纲编辑器回头看收口

- 文件：[_audit/DEV_LOG_2026-10-21_outline-editor-lookback-closure.md](_audit/DEV_LOG_2026-10-21_outline-editor-lookback-closure.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-21_outline-editor-lookback-closure.md](_audit/TASK_LEDGERS/2026-10-21_outline-editor-lookback-closure.md)
- 范围：direct 写任务预算按执行形态派生、live 预算实例单源、大纲删除授权单源、回放后门删除、旧位置型 sectionId 回放迁移与负向断言、未知窗口共享预算、语义负向模式。
- 验证：`build:vue`、真实 Electron 回放、全量 187 files / 2103 tests、`type-check` 全部通过；授权后删除 1,566 字，拒绝后保留 74,841 字，3 个历史 `write_only_mode` locate 失败在新语义下转为 success。
- 诚实边界：本地 OpenAI-compatible provider，非外部 live 矩阵；版本保持 3.101.0，未升版、未封装，等待用户审核。
- 经验回写：升级 v8.17，新增 G1.20 预算派生与回放锚点契约。
- [2026-10-21 大纲删除外部 live smoke](./DEV_LOG_2026-10-21_outline-deletion-live-smoke.md)：默认供应商 401 后，继续复核应用内历史验证 profile KEY，确认可用并直接复用；真实 Electron + 真实 API live 通过，授权回放事件补齐 `execution: "authorized-replay"` 观测。
- 封装：升级 3.102.0；安装包 `dist/神意助手-Setup-3.102.0.exe`，231,554,396 bytes，SHA256 `d6601aa52e169607860ae37886d9dbe986ff86801989c7d4f76a04a76f0a441a`；打包后真实启动核验 PASSED（rendererFiles=81、electronAPI methods=77），证据 `_audit/verification-packaging-3-102-0/packaging-evidence.json`；3.100.0、3.101.0 旧安装包与 blockmap 已清理，dist 仅保留最新交付。

# 2026-10-21 章节层上下文与契约修复

- 文件：[_audit/DEV_LOG_2026-10-21_chapter-layer-context-contract.md](_audit/DEV_LOG_2026-10-21_chapter-layer-context-contract.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-21_chapter-layer-context-contract-repair.md](_audit/TASK_LEDGERS/2026-10-21_chapter-layer-context-contract-repair.md)
- 范围：prompt block 协议单源、非首跳全书大纲瘦身、章节数单源仲裁、plot 重复 warning、Agent model 回退观测、导出 payload `artifactRole`、live/replay 验证器强化。
- 验证：真实 Electron + 真实 API live 通过（12 章、3 批 complete、12 API success、0 修复）；回放 `RESULT: ACCEPTED (6 checks)`；`type-check` 通过；全量 187 files / 2114 tests 通过。
- 诚实边界：未复刻 7.5 万字同规模长文，登记 `untested`；单一供应商 deepseek-v4-pro；`scaffold_not_smaller` 在短 prompt 中为保守路径，真实压缩幅度需长文采样。
- 封装：未升版、未打包，版本保持 3.102.0，等待用户裁决。

# 2026-10-22 降级语义清零

- 文件：[_audit/DEV_LOG_2026-10-22_degraded-semantic-closure.md](_audit/DEV_LOG_2026-10-22_degraded-semantic-closure.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-22_degraded-semantic-closure.md](_audit/TASK_LEDGERS/2026-10-22_degraded-semantic-closure.md)
- 范围：`no_contract + degraded` 双验收门统一拒收、skillOrchestrator 旧放行分支删除、`schema-contract-warning` 归入降级 warning 集合、G0.10 补“门禁语义升级必须反查存量测试与包装层”条款。
- 验证：全量 187 files / 2116 tests、`type-check` 通过；`step-degraded-with-output` / `step-artifact-no-contract` 生产源码 0 命中，仅测试负向断言保留。
- 诚实边界：未做 Electron + 真实 API live 复跑，登记 `untested`；未升版、未打包，等待用户裁决。

# 2026-10-22 正文层 V3 契约收口

- 文件：[_audit/DEV_LOG_2026-10-22_body-v3-contract-closure.md](_audit/DEV_LOG_2026-10-22_body-v3-contract-closure.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-22_body-v3-contract-closure.md](_audit/TASK_LEDGERS/2026-10-22_body-v3-contract-closure.md)
- 范围：正文 V3 契约 Phase 4-7 收口；generator 账本守卫前移到终步派发前，80% 下限 Electron 夹具迁移，新增无账本终态场景与“不覆盖上一有效正文”断言；Phase 5/6 历史完成状态对账。
- 验证：真实可见 Electron UI + 本地 OpenAI-compatible provider 三场景通过（A 拒绝 4 请求、B 成功 5 请求、C 无账本 4 请求且 S3 未调用）；定向 5 files / 68 tests、降AI/终步反馈 3 files / 9 tests、全量 188 files / 2126 tests、type-check 全部通过。
- 诚实边界：非外部 live 供应商矩阵；版本保持 3.102.0，未升版、未封装。
- 经验回写：升级 v8.19，G1.5 补入门时序证据契约，G1.17 补入副作用断言面契约。

# 2026-10-22 正文候选账本与修复反馈协议

- 文件：[_audit/DEV_LOG_2026-10-22_body-candidate-ledger-repair-protocol.md](_audit/DEV_LOG_2026-10-22_body-candidate-ledger-repair-protocol.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-22_body-candidate-ledger-repair-protocol.md](_audit/TASK_LEDGERS/2026-10-22_body-candidate-ledger-repair-protocol.md)
- 范围：schema retry 候选账本与最优失败候选保留、终步候选跨任务泄漏清零、targeted repair 旧稿全文回传清零、attempt/trace 反馈审计、runId 归属单源化。
- 验证：定向 3 files / 170 tests、Electron targeted repair 2 物理请求通过；全量、type-check、build:vue、封装核验见 DEV_LOG 收尾验证。
- 诚实边界：本地 OpenAI-compatible provider，非外部 live 供应商矩阵；最优候选只按契约质量排序，不评估文学质量。
- 经验回写：升级 v8.20，G2.9 补候选账本契约，G1.17 补 runId 单源契约。

# 2026-10-22 经验文件 v9 去旧纳新

- 文件：[_audit/DEV_LOG_2026-10-22_experience-file-v9.md](_audit/DEV_LOG_2026-10-22_experience-file-v9.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-22_experience-file-v9-restructure.md](_audit/TASK_LEDGERS/2026-10-22_experience-file-v9-restructure.md)
- 范围：经验文件内部版本 v8.20 → v9.0.0；文件名 `_v7.md` → `_v9.md`；删除头部版本流水账；修复使用路由重复编号；迁移 STACK 与历史架构文档的活跃规则指针。
- 验证：`_audit` 经验文件唯一；活跃指针 `_v7` 命中 0，历史记录保留；`git diff --check` 无 whitespace error；无生产代码变更，应用版本保持 3.103.0。
- 经验回写：仅元信息升级，门禁语义与编号不变；v8.0-v8.20 入库细节由本索引与 Git 历史追溯。

# 2026-10-22 流水线依赖并行 V3 解封复审

- 文件：[_audit/DEV_LOG_2026-10-22_pipeline-parallelism-v3-unseal-review.md](_audit/DEV_LOG_2026-10-22_pipeline-parallelism-v3-unseal-review.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-21_pipeline-dependency-parallelism-v3.md](_audit/TASK_LEDGERS/2026-10-21_pipeline-dependency-parallelism-v3.md)
- 范围：V3 解封；按 v9 门禁完成源码全景对账；V3 升级为 V3.1 复审版；登记验证器旧进度断言、性能预算未采样、章节共享断点例外、settings 写键矩阵四个新增缺口。
- 验证：只读源码对账完成；`git diff --check` 通过；无生产代码变更，Phase 0-J 未启动。
- 后续更新：用户已批准第 12.8 节全部 4 个决策点；第 12.9 节补齐执行器/工具层成熟化包。2026-10-22 追加第 13 节 20 轮深度推演，方案升级为 V3.2 待审核，新增 D5-D7 三个决策点；同日补充第 13.6 节链路支持性审计并登记 `activeToolRunBudget` 单例串账风险，随后完成方案重整：链路/预算结论并入第 0/1/2/7/8/12.9 节，新增 12.9.8 与第 13.7 节对账清单。生产实现、Electron 并行、live、性能采样仍为 `untested`，生产代码实施待 V3.2 审核通过后从 Phase 0 开始。
- 门禁对账：2026-10-22 完成 V3.2 对 v9 逐条对账，登记于台账第 13 节；主方向判定为机制层根修，但发现 8 个半接入缺口（四格再入矩阵、供应商 `quota_exhausted` 软错误语义、写队列临界区读新值、trace schema 同步、预算执行计划派生、断点/attempt 生命周期、副作用断言面、发布级封装核验）。方案正文与生产代码未改动，等待用户裁决是否升级 V3.3。
- V3.3：用户批示“确认并入”后，8 个缺口已一次性写入方案正文（Phase 0/B/C/E/I/J、8.1/8.3/8.4/8.5、12.9.4/12.9.5/12.9.8、13.3、13.5.1、13.5.2、13.7），登记于台账第 14 节。方案升级为 V3.3 待审核 D5-D7；无生产代码改动，Phase 0-J 未启动。
- 批准：用户批示 D5-D7 全部采纳“是”后，方案升级为“V3.3，已批准待实施”，登记于台账第 15 节。V3.3 为唯一执行版本；下一步从 Phase 0 红测试与单 run 只读性能基线开始。生产实现、Electron 并行、live、性能采样仍为 `untested`。
- Phase 0：2026-10-22 按批示开始执行，登记于 [_audit/TASK_LEDGERS/2026-10-22_pipeline-parallelism-phase0.md](_audit/TASK_LEDGERS/2026-10-22_pipeline-parallelism-phase0.md)。新增 [pipelineParallelismPhase0.spec.ts](/d:/codex/novel-workshop-vue3/src/services/pipelineParallelismPhase0.spec.ts:1) 共 14 项测试，实测 `7 红 / 7 绿`：红灯钉住隐式中止、进度覆盖、终态吞失、runTrace 自动放弃、agent bridge 串线、配置 RMW 丢写、再入生命周期缺失；保存队列旧快照覆盖未复现，按 G1.17 登记为意外绿灯/守护。单 run 只读基线 run-1792564350585-1743 显示 `durationMs=1,793,484`、`outputSumMs=1,751,306`、`localOverheadSumMs=189`，耗时主体是模型流式输出；S2 usage 未记录，留 Phase B 修观测。补齐后全量回归 `189 files: 1 failed / 188 passed`、`2142 tests: 7 failed / 2135 passed`，唯一失败文件即 Phase 0 红测试文件，既有测试无新增回归。生产代码未改，Electron UI 性能、并行 3 run 压测、Phase A-J 仍未执行。
- Phase A-D：2026-10-22 继续执行，台账登记于同文件第 8/9 节。Phase A 落地 run 生命周期/取消/工具预算 registry；Phase B 移除 runTrace auto-abandon 与 agent bridge current fallback；Phase C 完成配置事务化、run 启动快照与正文断点 owner key；Phase D 落地 RunProgressChannel、四个生成器 runId 线程化、四个进度条 per-layer 读数、13 个 Electron 验证脚本迁移。最终验证：`npx vue-tsc --noEmit` exit 0；`npx vitest run` `194 files / 2162 tests` 全绿，Phase 0 目标红灯全部转绿；`npm run build:vue` 两个构建成功。诚实边界：Electron 脚本 live 复跑属 Phase J；`generationProgress/generationStatus` 过渡兜底与 `isGenerating` 串行守卫属 Phase F/I 收口，四层真正并行开放仍不可宣称。
- Phase E-F：2026-10-22 继续执行，台账登记于同文件第 10/11 节。Phase E 将项目保存队列改为 request-sequence + drain loop，物理写挂起期间的新修改追加读最新 state 的第二次落盘；章节批次提交改为按章节 ID 合并，保留并行 run 同卷新章。Phase F 落地同层同目标目标锁，不同层可并行，同层同目标新 run 入队并记录 `queuedReason`；`isGenerating` 改为存在 active run 的派生语义，四个生成按钮改目标锁，顶部提供逐 run 取消与取消全部。验证：定向与全量 `195 files / 2167 tests` 全绿，`npx vue-tsc --noEmit` exit 0。诚实边界：注册表级排队不等于完整队列调度器；Electron 真实窗口四层同时运行属 Phase J；残留全局编辑禁用语义归 Phase I。
- Phase G：2026-10-22 继续执行，台账登记于同文件第 12 节。新增 providerScheduler 按供应商槽位排队，排队中取消不发起物理请求；软错误统一 `quota_exhausted/auth/402` 终态并禁止物理重试；主页对话、大纲工作台、生成流水线三入口补齐 `provider-queue` trace 与 `onProviderQueue` 透传；runTrace 新增同源并发 run 隔离测试。验证：`npx vue-tsc --noEmit` exit 0；定向 3 files / 202 tests、2 files / 114 tests 全绿；全量 `196 files / 2175 tests` 全绿。诚实边界：供应商槽位按 ID 全局控制，未分层限额；`provider-queue` 未接运行中心 `queuedReason`；真实 Electron 并行压测与 live 观测属 Phase H/J。
- Phase H-I：2026-10-22 继续执行，台账登记于同文件第 13/14 节。Phase H 新增 performanceMonitor（long task、freeze watchdog、点击反馈预算）并接入 App 生命周期；持久化恢复将非终态 run 显式转 `interrupted`，不再静默丢失；3 run × 300 高频事件合成压测通过。Phase I 删除 `generationProgress` 与 `generationAbortController`，生产代码零引用。验证：`npx vue-tsc --noEmit` exit 0；Phase H 定向 3 files / 109 tests、Phase I 定向 4 files / 111 tests 全绿。诚实边界：真实 Electron 性能数字、live 脚本、版本升级与封装核验属后续 Phase。
- Phase I 收尾：2026-10-22 同日补齐。`activeToolRunBudget` 全仓 0 命中确认已清零；版本升级 `3.103.0 -> 3.104.0`；`npm run build:vue` 双构建 exit 0；全量 `npx vitest run` 197 files / 2180 tests 全绿。诚实边界：封装核验、13 个 live 脚本、真实 Electron 四格再入与性能预算报告仍属 Phase J，未宣称完成。
- Phase J：2026-10-23 真实 Electron + mock provider 并行验收 PASS，报告 [_audit/verification-pipeline-parallelism-live/report.json](_audit/verification-pipeline-parallelism-live/report.json)。三层同时 running、章节取消 121ms 隔离、provider 并发重叠、成功终态再入产生新 runId/hash 且物理请求 1→2、freeze/slow-click 均为 0。两个验证脚本缺陷（trace runId/pipeline runId 跨域混用、`find` 观测最早 run）已定案并只修脚本；经验回写 v9 G1.5/G1.17。诚实边界：断点恢复与失败终态后再入未触发，不宣称四格再入全闭环；13 个历史 Electron 脚本未全部复跑；版本升级与封装核验未执行。

# 2026-10-24 流水线并行 V3.3 收口

- 文件：[_audit/DEV_LOG_2026-10-24_pipeline-parallelism-v3-closure.md](_audit/DEV_LOG_2026-10-24_pipeline-parallelism-v3-closure.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-23_pipeline-parallelism-v3-closure.md](_audit/TASK_LEDGERS/2026-10-23_pipeline-parallelism-v3-closure.md)
- 范围：P0-1 四格再入矩阵闭环、P0-5 StyleProfileCard current 指针清零、P1-6 取消全部单源化、P1-7 排队原因 UI/trace 同源、P1-10 pipeline 旧全局态清零、P2-11 3.104.0 封装与清理。
- 验证：mock 故障注入矩阵 coverage 五项全 true；live 内置 key 供应商矩阵 PASS；31 项定向测试、`vue-tsc`、`build:vue`、`build` 全部通过；3.104.0 真实 packaged Electron 启动核验 PASSED。
- 封装：3.104.0；安装包 `dist/神意助手-Setup-3.104.0.exe`，231,562,775 bytes，SHA256 `8ce409b0e017dc3b3fd45088681f7dc81a2e8403c479124bdabd6c38ea601929`；rendererFiles=81、electronAPI methods=77；3.103 旧安装包/脚本/证据与临时日志已清理，dist 仅保留最新交付。
- 诚实边界：mock 矩阵负责断点恢复与失败终态再入故障注入，live 矩阵负责真实供应商并发；git 已按功能源码、测试验证、3.104.0 版本、审计证据四类提交（`0c77681a`、`e8274e0f`、`bbfa13ba`、`10d7d661`），提交后 `git status --short` 为空，仓库与工作区收口。

# 2026-10-24 大纲编辑器 V6.3 Phase 4-5 收口

- 文件：[_audit/DEV_LOG_2026-10-24_OUTLINE_V6_3_PHASE4_5_CLOSURE.md](_audit/DEV_LOG_2026-10-24_OUTLINE_V6_3_PHASE4_5_CLOSURE.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-24_OUTLINE_V6_3_EXECUTION.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-24_OUTLINE_V6_3_EXECUTION.md)
- 范围：Responsiveness Supervisor 三档真实 UI 验证（6500ms / 5500ms / 4800ms 负向）、验证器自动恢复竞态修复、全量回归、台账与经验回写、版本 3.105.0、工作区清理与提交。
- 验证：三档 E2E 全部 PASS；`node --check`、`npm run type-check`、`npx vitest run` 209 files / 2281 tests 全部通过；`_data/outline-v6-phase4-e2e-profile` 不存在。
- 诚实边界：真实 API 长流与 SKILL 下拉已在 Phase 3 live 验证闭环；本轮 Phase 4 使用本地 mock provider 注入 renderer 阻塞，安全模式行为不依赖供应商内容。经验回写 G1.5。

# 2026-10-25 大纲编辑器 V6.3 崩溃账本收口

# 2026-10-25 大纲编辑器 V6.3 Phase D 断流恢复

- 文件：[_audit/DEV_LOG_2026-10-25_OUTLINE_V6_3_PHASE_D_RECOVERY.md](_audit/DEV_LOG_2026-10-25_OUTLINE_V6_3_PHASE_D_RECOVERY.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-24_OUTLINE_V6_3_EXECUTION.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-24_OUTLINE_V6_3_EXECUTION.md)
- 范围：孤儿流 `recovering/partial` checkpoint 的会话内 UI 闭环；保存为草稿、丢弃本段、继续接收走 InputGate `new_run`，partial 不冒充 assistant 输出。
- 验证：type-check、build:vue、定向 vitest 199/199、Phase D 真实 Electron E2E、Phase 3 E2E 回归全部 PASS；证据 `_audit/verification-outline-v6-phase-d-recovery-e2e/result.json`。
- 收口：全量 `npm run test:services` 212 files / 2303 tests 全绿；`directWriteWiring.spec.ts` 结构断言从旧 `inputGate.canSend` 字符串同步到 Phase A 的 `resolveOutlineEntryDecision(...).allowed` 单源契约；版本 3.106.0 → 3.107.0。
- 诚实边界：跨主进程重启持久化按用户裁决暂缓第二期。

- 文件：[_audit/DEV_LOG_2026-10-25_OUTLINE_V6_3_CRASH_LEDGER_CLOSURE.md](_audit/DEV_LOG_2026-10-25_OUTLINE_V6_3_CRASH_LEDGER_CLOSURE.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-24_OUTLINE_V6_3_EXECUTION.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-24_OUTLINE_V6_3_EXECUTION.md)
- 范围：popup/嵌套 popup 响应面递归接线、崩溃后账本 E2E 三类验证器缺陷修复（顶层 `await`、恢复事件时序、失效 Playwright 句柄）、经验文件 v9.1.0、版本 3.106.0。
- 验证：`electron/ipc/responsivenessLedger.spec.js` 9/9；`verify-outline-v6-main-ledger-e2e.mjs` PASS；全量 212 files / 2296 tests；`type-check`、`build:vue` 通过。
- 诚实边界：本轮未捕获 Electron 原生 `unresponsive/responsive`，报告保留 false，不冒充通过；未重新执行真实外部供应商 live 长流。

# 2026-10-26 大纲编辑器 V6.3 Phase 5 组合回归与原生事件收口

- 文件：[_audit/DEV_LOG_2026-10-26_OUTLINE_V6_3_PHASE5_COMBO_NATIVE_CLOSURE.md](_audit/DEV_LOG_2026-10-26_OUTLINE_V6_3_PHASE5_COMBO_NATIVE_CLOSURE.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-24_OUTLINE_V6_3_EXECUTION.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-24_OUTLINE_V6_3_EXECUTION.md)
- 范围：Phase D 裁决边界注记、安全模式长文复制、渲染冻结 journal 追加、40/60 秒原生事件实测、测试隔离上限 60 秒。
- 验证：组合回归 6 项断言全 true；主账本 40/60 秒档 PASS；Phase 4 复跑 9 项断言全 true；`build:vue`、`type-check`、全量 212 files / 2303 tests 全部通过。
- 诚实边界：当前环境组合下 40/60 秒 busy-wait 未触发 Electron 原生 `unresponsive/responsive`，保留 false；跨主进程重启恢复为第二期裁决项。

# 2026-10-26 大纲运行记录导出与共创消息滚动修复

- 文件：[_audit/DEV_LOG_2026-10-26_OUTLINE_EXPORT_AND_MESSAGE_SCROLL_CLOSURE.md](_audit/DEV_LOG_2026-10-26_OUTLINE_EXPORT_AND_MESSAGE_SCROLL_CLOSURE.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-26_OUTLINE_EXPORT_AND_MESSAGE_SCROLL_CLOSURE.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-26_OUTLINE_EXPORT_AND_MESSAGE_SCROLL_CLOSURE.md)
- 范围：运行记录导出按钮 `DataCloneError` 静默失效修复；大纲共创消息滚动区普通/虚拟列表滚动恢复；用户滚动意图保护与流式自动跟随节流；导出/复制失败可见反馈。
- 验证：定向 2 files / 29 tests、`type-check`、`build:vue` 全部通过；源码版与打包版双真实 Electron UI 回归 PASS（导出真实点击产出 `export.json`；消息区静态与生成态滚轮位移均非 0）。
- 封装：3.108.0 → 3.108.1；安装包 `dist/神意助手-Setup-3.108.1.exe`，231,609,991 bytes，SHA256 `D2AF831266D686D8E1703F80ED3C73D91201310E636EA8A2074E4B921E245782`；3.108.0 安装包与 blockmap 已清理。
- 诚实边界：未做 NSIS 人工安装路径核验与真实外部供应商长流滚动验证；生成态由应用真实 streaming 测试钩子进入，不依赖供应商内容。
- 经验回写：经验文件升级 v9.3.0，G1.5 补真实失效区域验证，G1.8 补 Worker 边界 unwrap 与失败可见门禁，G1.9 补滚动意图与自动跟随契约。

# 2026-10-26 经验文件 v9.4.0 回归门禁升级

- 文件：[_audit/DEV_LOG_2026-10-26_EXPERIENCE_FILE_V9_4_UPDATE.md](_audit/DEV_LOG_2026-10-26_EXPERIENCE_FILE_V9_4_UPDATE.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-26_EXPERIENCE_FILE_V9_4_UPDATE.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-26_EXPERIENCE_FILE_V9_4_UPDATE.md)
- 范围：把 3.108.0 导出静默失效与消息滚动回归提炼为发布级门禁；G1.5 补用户可见回归与引入点追账，G1.12 补发布前真实 UI 回归面最小矩阵。
- 引入点：导出缺陷定位到 `e3abea2c`（3.106.0）；滚动缺陷为历史结构遗留，首次引入提交未定位并显式登记。
- 验证：v9.4.0 唯一经验文件、台账七节、总索引与 STACK 指针齐备；`git diff --check` 通过；本轮文档收口提交后工作区干净。

# 2026-10-26 经验文件 v9.5.0 整理性升级

- 文件：[_audit/DEV_LOG_2026-10-26_EXPERIENCE_FILE_V9_5_UPDATE.md](_audit/DEV_LOG_2026-10-26_EXPERIENCE_FILE_V9_5_UPDATE.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-26_EXPERIENCE_FILE_V9_5_UPDATE.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-26_EXPERIENCE_FILE_V9_5_UPDATE.md)
- 范围：适用性审计后的整理性升级；G1.5 从事故流水账瘦回规则本体，G2.11 的 Vite 重启改为条件化运维规则，L3 归档映射外置为 `_audit/神意开发经验总结_v9_L3_ARCHIVE.md`。
- 验证：S200/S1M 经源码核实仍存在于验证脚本，不移除；主文件版本、STACK 指针、附录映射、台账七节齐备；收尾时补齐命令输出与工作区状态。

# 2026-10-26 流水线并行 V4 破坏面对账与修复方案

- 文件：[_audit/DEV_LOG_2026-10-26_PIPELINE_PARALLELISM_V4_PLAN.md](_audit/DEV_LOG_2026-10-26_PIPELINE_PARALLELISM_V4_PLAN.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-26_PIPELINE_PARALLELISM_V4_PLAN.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-26_PIPELINE_PARALLELISM_V4_PLAN.md)
- 范围：对账 V3.3 并行交付后的同层 runId 单槽覆盖、假排队、UI 单实例状态、provider 排队错归属与运行中心缺失，形成 V4 P0-P2 修复方案。
- 用途：把“半成品破坏”与“设计内供应商排队”分开，红灯先行修复并行 UI 契约，防止 mock PASS 继续冒充用户契约完成。
- 验证：`rg` 复核源码与方案锚点；`git diff --check` 通过；本轮只新增审计文档，无生产代码改动。

# 2026-10-26 流水线并行 V4 执行收口

- 文件：[_audit/DEV_LOG_2026-10-26_PIPELINE_PARALLELISM_V4_PLAN.md](_audit/DEV_LOG_2026-10-26_PIPELINE_PARALLELISM_V4_PLAN.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-26_PIPELINE_PARALLELISM_V4_PLAN.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-26_PIPELINE_PARALLELISM_V4_PLAN.md)
- 范围：用户批准 V4 后落地 run 归属闭包化、真排队激活、per-run UI、PipelineRunCenter、终态归属覆盖与验证器硬化；同层排队 run 物理请求为 0，取消只影响目标 run，四格再入均产生新 runId/新产物。
- 验证：真实 Electron + mock-provider 全场景 PASS（coverage 六项 true；取消 94ms；provider 6 请求 max concurrency 2；longTask/freeze/slowClick 全 0）；定向 4 files / 61 tests、全量 212 files / 2322 tests、`vue-tsc`、`build:vue` 全部通过。验证器两个自身缺陷（跨章节 hash 假失败、证据写失败掩盖主结果）已定案并修复。
- 诚实边界：live 外部供应商并行未执行，登记 `untested`；本轮未重新封装，沿用 3.108.1 安装包。经验回写：v9.6.0，G1.5 补断言目标与证据外围规则，G1.17 补第十二类自盲区。

# 2026-10-27 客户可交付版本 3.109.0 收口

- 文件：[_audit/DEV_LOG_2026-10-27_customer-ready-release-3-109-0.md](_audit/DEV_LOG_2026-10-27_customer-ready-release-3-109-0.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-26_RELEASE_CLOSURE.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-26_RELEASE_CLOSURE.md)
- 范围：live 供应商真实并行、真实性能采样、13 个历史脚本对账、R5 无工具直写链负向门禁、3.109.0 封装核验、台账/经验/索引/仓库收口。
- 验证：live 并行 PASS（9 run、17 application calls、15 physical requests、max concurrency 2、取消 103ms）；性能账本 PASS（freeze/slowClick/longTask 全 0，供应商等待 1,735,168ms，本地开销 3,559ms）；13 脚本 PASS 或预期负向；`type-check`、213 files / 2338 tests 全部通过。
- 封装：3.109.0；安装包 `dist/神意助手-Setup-3.109.0.exe`，231,611,286 bytes，SHA256 `3BEFB473CF9DE943DBCA07BAF6DF523CFFE2375BE3601BE22553FA0E3A38FD55`。
- 诚实边界：本轮不重跑完整打包与人工安装路径；供应商额度/503/用户取消属于外部边界。经验回写 v9.6.1。

# 2026-10-28 生成流水线分层供应商通道收口

- 文件：[_audit/DEV_LOG_2026-10-28_PIPELINE_LAYER_PROVIDER_CHANNELS.md](_audit/DEV_LOG_2026-10-28_PIPELINE_LAYER_PROVIDER_CHANNELS.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-27_PIPELINE_LAYER_PROVIDER_CHANNELS.md](_audit/TASK_LEDGERS/2026-10-27_PIPELINE_LAYER_PROVIDER_CHANNELS.md)
- 范围：四层供应商通道配置与持久化、Agent > 层 > 全局单源路由、显式绑定失效请求前失败、run 级快照冻结、trace/DiagLogger 来源观测、设置页真实 UI、mock 四供应商与 live 单供应商双验证。
- 验证：`npx vitest run` 218 files / 2361 tests 全部通过；`npx vue-tsc --noEmit` exit 0；mock 四供应商矩阵 PASS（三层请求分别携带 `local-volumes / local-chapters / local-body`）；live 真实供应商 PASS（三层 run succeeded，`successfulRequests:3`，正文 2642 字首轮低于 2800 字后按失败指标重试成功，key 仅记录长度不落明文）。
- 诚实边界：live 环境仅有一个 generate 供应商，四层分流由 mock 四供应商矩阵证明；风格分析为 step 0 辅助路径，不属于四层通道目标；V3.3 并行骨架未改动。
- 封装与经验：版本 3.110.0；经验文件 v9.6.2，G1.5 新增供应商通道验证判则。安装包与哈希见 DEV_LOG 第 8 节。

# 2026-10-28 分层供应商通道 3.110.1 模型轴收口

- 文件：[_audit/DEV_LOG_2026-10-28_PIPELINE_LAYER_PROVIDER_CHANNELS.md](_audit/DEV_LOG_2026-10-28_PIPELINE_LAYER_PROVIDER_CHANNELS.md) 第 9 节
- 台账：[_audit/TASK_LEDGERS/2026-10-27_PIPELINE_LAYER_PROVIDER_CHANNELS.md](_audit/TASK_LEDGERS/2026-10-27_PIPELINE_LAYER_PROVIDER_CHANNELS.md)
- 范围：`resolvePipelineRequestProfile` 统一 provider/model 轴、Agent 模型回退与不支持显式失败、四条流水线消费线迁移、设置页 generate 用途约束、导出/导入层绑定、验证器三面同源 model 断言。
- 验证：`pipelineProviderChannels.spec.ts + realSkillExecutor.spec.ts` 70/70；`ApiSettings.spec.ts` 3/3；`type-check` exit 0；`test:services` 219 files / 2370 tests 全部通过；`build:vue` 成功；`verify:provider-channel-electron` PASS，`requests=3`，trace / apiCall / 物理请求体三层 model 断言同源。
- 诚实边界：live 单供应商矩阵本轮未重跑，3.110.0 live PASS 继续证明 providerId 路由，本轮 model 轴由 mock 四供应商矩阵证明；风格分析 step 0 仍走全局供应商，属设计内；3.110.1 安装包未重新封装。
- 版本与经验：package/package-lock 均为 3.110.1；经验文件 v9.6.3，G1.5 追加 providerId+model 三面同源与“断言先红后绿”判则。

## 3.110.1 边界闭环补充

- live 单供应商矩阵：PASS，`requests=3`，三层 model 断言 `deepseek-v4-pro`，三面 `trace-event / apiCall / provider-request` 同源；key 只记录长度与加密状态。
- 封装：`npm run build` exit 0；安装包 `dist/神意助手-Setup-3.110.1.exe`，231,613,224 bytes，SHA256 `BAACBA570B1C5BF14EAC893265500179CDDAC5993E34FFE785B4F54598EB06D2`；latest.yml 与 exe FileVersion/ProductVersion 均为 3.110.1。
- 收尾：带路径守卫删除旧 3.110.0 安装包与 blockmap，dist 仅保留当前版本一套。剩余边界仅“本机 live 单一 generate 供应商”与“风格分析 step 0 全局供应商为设计内”。

# 2026-10-28 默认数据存储 C 盘迁移 D 盘收口

- 文件：[_audit/DEV_LOG_2026-10-28_DATA_MIGRATION_C_TO_D.md](_audit/DEV_LOG_2026-10-28_DATA_MIGRATION_C_TO_D.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-28_DATA_MIGRATION_C_TO_D.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-28_DATA_MIGRATION_C_TO_D.md)
- 范围：`electron/defaultPaths.js` 默认数据根单源化，主数据 / Electron userData / legacy 默认迁移至 `D:\神意助手数据`；主进程启动早期设置 userData；修复 `app.getPath('userData')` 读取副作用导致的 `%APPDATA%` 空目录重建；storage 迁移测试隔离；diag、installer、6 个验证脚本路径迁移；新增三组 C->D 哈希对账脚本与定向测试。
- 验证：`node --check` 全过；定向 2 files / 8 tests 全过；`npm run build` exit 0；安装器 `/S` 真实安装 3.110.2；安装版启动 15 秒 C 盘四个旧位置未重建，日志证明 `dataDir/userData/legacyDir` 全落 D 盘，退出无残留进程；迁移终态对账 `ok:true`，目标文件 1886 / 12 / 471，差异 0。
- 封装：3.110.2；安装包 `dist/神意助手-Setup-3.110.2.exe`，231,612,595 bytes，SHA256 `687F85DB5BF9B17DE1C86C4697B49C56285B7E530189AC04F996566B76DAF3FC`。
- 诚实边界：本轮未重跑 live 供应商 API 链路；业务数据零差异由删除 C 盘源前的哈希对账证明；证据目录内第一次打包 blockmap 与最终 blockmap 不一致，已登记为非主证据。
- 经验回写：经验文件升级 v9.6.4，新增 G2.14 默认存储与跨盘迁移门禁，并补使用路由入口。

# 2026-10-28 供应商用途栏生成流水线下拉收口

- 文件：[_audit/DEV_LOG_2026-10-28_PROVIDER_PURPOSE_PIPELINE_DROPDOWN.md](_audit/DEV_LOG_2026-10-28_PROVIDER_PURPOSE_PIPELINE_DROPDOWN.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-28_PROVIDER_PURPOSE_PIPELINE_DROPDOWN.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-28_PROVIDER_PURPOSE_PIPELINE_DROPDOWN.md)
- 范围：生成流水线入口并入供应商卡片用途栏；按钮展开同卡片层下拉；首次点击不默认绑定，选择层才绑定；已绑定再点解绑；删除旧独立层通道区块；验证器改真实卡片 UI 操作并清理隔离 profile。
- 验证：定向 2 files / 6 tests、`vue-tsc`、`build:vue` 全部通过；真实 Electron UI 验证 PASS，`mode=mock-four-layer-providers`，`requests=3`，覆盖持久化、缺失警告、恢复与三层路由。
- 封装：3.110.2 → 3.110.3；安装包 `dist/神意助手-Setup-3.110.3.exe`，231,603,405 bytes；旧 3.110.2 安装包与 blockmap 已清理。
- 诚实边界：live 单供应商矩阵本轮未重跑，路由语义未改动，沿用 3.110.1 live PASS；未做 NSIS 人工安装路径核验。
- 经验回写：v9.6.5，G1.5 新增用途栏单源入口与验证器隔离 profile 每轮清理判则。

# 2026-10-28 供应商用途栏多绑定与孤儿绑定修复

- 日期：2026-10-28；功能：层选择控件从单选 select 改为多层按钮面板，同一供应商可绑定多个流水线层；generate 资格在 UI、导入/保存、执行前三面统一守门；`providerUnsupported` 进入通道解析与 run 快照。
- 用途：修复上一轮用途栏形态迁移造成的多绑定回退与孤儿绑定缺陷，避免配置看似有效但执行前失败，也让单供应商服务多层和多层各绑供应商两种用法都成立。
- 验证：定向 4 files / 25 tests；全量 220 files / 2379 tests；type-check exit 0；mock Electron PASS；live Electron PASS（single-supplier，requests=3）。live 第一次复跑正文层供应商流式停摆超时，复跑通过并登记为供应商边界。
- 封装：3.110.3 → 3.110.4；安装包 `dist/神意助手-Setup-3.110.4.exe`，231,615,334 bytes，SHA256 `DF7E5E1455EE287509321E23A810B6F693BF43EE473281C87125870F395352CA`；旧 3.110.3 产物已清理。
- 经验回写：v9.6.6，G1.5 新增控件形态对账数据模型语义、用途资格三面守门判则。

# 2026-10-28 健康检查缺陷与风险闭环

- 文件：[_audit/DEV_LOG_2026-10-28_HEALTH_CHECK_DEFECT_CLOSURE.md](_audit/DEV_LOG_2026-10-28_HEALTH_CHECK_DEFECT_CLOSURE.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-28_HEALTH_CHECK_DEFECT_CLOSURE.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-28_HEALTH_CHECK_DEFECT_CLOSURE.md)
- 范围：outline journal IPC reactive proxy 根因修复、cloneable snapshot 单源接线、用途取消 null 哨兵清理、验证器证据归档、dompurify/vue 依赖升级、定向/全量/Electron/生产接线验证。
- 验证：定向 5 files / 37 tests；全量 221 files / 2384 tests；type-check exit 0；build:vue 成功；直写四供应商矩阵 PASS 且 clone 错误 0；provider-channel mock PASS；production wiring 无违规；证据归档双证生效。
- 封装：3.110.4 → 3.110.5；安装包 `dist/神意助手-Setup-3.110.5.exe`，231,643,280 bytes，SHA256 `054883A592791119247A957240C68903B1D2017F81131E52B0867E36FF710333`；旧 3.110.4 产物已清理。
- 诚实边界：本轮未新增 live API 请求；sharp 2 个 high（传递依赖 breaking）、Electron no-sandbox、stylelint/Biome 门禁接入登记未修。
- 经验回写：v9.6.7，G1.5 新增 IPC cloneable snapshot 单源与 clone 报错真实调用链定位判则。

# 2026-10-28 流水线流式归属与 3.110.6 收口

- 文件：[_audit/DEV_LOG_2026-10-28_PIPELINE_STREAM_OWNERSHIP.md](_audit/DEV_LOG_2026-10-28_PIPELINE_STREAM_OWNERSHIP.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-28_PIPELINE_STREAM_OWNERSHIP.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-28_PIPELINE_STREAM_OWNERSHIP.md)
- 范围：修复运行中反馈可被隐藏导致进度条、取消按钮与流式输出消失的产品缺陷；拆分 pipeline runId 与 trace runId 双域，恢复供应商实时流式归属；修正验证器面板打开、稳定 selector、终态可选控件与遮挡点击假设；正文 bypass 路径补供应商排队事件。
- 验证：真实 Electron 并行验证 PASS（取消 124ms；卷纲流式 252 chars；正文流式 4777 chars；provider 7 请求 max concurrency 2；四格再入全通过；9 run 终态符合预期）；`test:services` 221 files / 2387 tests 全过；`type-check` exit 0；`build` exit 0。
- 封装：3.110.5 → 3.110.6；安装包 `dist/神意助手-Setup-3.110.6.exe`（231,644,128 bytes，latest.yml 3.110.6）；旧 3.110.5 产物、81 个失败导出现场与临时诊断文件已清理。
- 经验回写：v9.6.8，G1.5 新增运行中反馈不可隐藏与验证器面板/selector/终态控件假设判则。

# 2026-10-29 脚本质量全量复盘与 G1.21

- 文档：[_audit/SCRIPT_QUALITY_LESSONS_2026-10-29.md](_audit/SCRIPT_QUALITY_LESSONS_2026-10-29.md)
- DEV_LOG：[_audit/DEV_LOG_2026-10-29_script-quality-lessons.md](_audit/DEV_LOG_2026-10-29_script-quality-lessons.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-29_script-quality-lessons.md](_audit/TASK_LEDGERS/2026-10-29_script-quality-lessons.md)
- 范围：479 个物理会话文件 / 231 个唯一会话 / 235 个已统计文件、449,106 次工具调用、46,679 条脚本命令、16,526 条可疑脚本事件、704 个仓库脚本全量复盘；确认旧审计脚本吞错、版本化脚本堆积、危险脚本无恢复链、审计仪器自身逃逸查账四类系统性根因。
- 经验回写：v9.7.0，新增 G1.21 脚本质量与生命周期门禁；使用路由追加脚本类任务入口。
- 边界：本轮不改产品源码、不提交 git、不封装、不做 live API；证据目录保留，3 个本轮临时审计脚本删除。

# 2026-10-29 正文层内嵌降AI GitHub 基准审查

- 报告：[_audit/DEAI_GITHUB_BENCHMARK_REVIEW_2026-10-29.md](_audit/DEAI_GITHUB_BENCHMARK_REVIEW_2026-10-29.md)
- DEV_LOG：[_audit/DEV_LOG_2026-10-29_deai-github-benchmark-review.md](_audit/DEV_LOG_2026-10-29_deai-github-benchmark-review.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-29_deai-github-benchmark-review.md](_audit/TASK_LEDGERS/2026-10-29_deai-github-benchmark-review.md)
- 范围：9 个 GitHub 去 AI 味项目/SKILL 精华对账本仓正文层内嵌降AI；确认架构方向领先，但存在 retentionRatio 假指标、异常静默吞掉、缺变更率门禁、缺 n-gram 指纹与自适应阈值四个 P0 缺陷，并登记作者声纹、长文漂移、hedging 豁免、整体评分、提示词堆叠五类 P1 缺口。
- 边界：只读审查，不改产品源码，不提交 git，不封装，不做 live API；外部词表与阈值需中文样本重新校准。

# 2026-10-29 正文层内嵌降AI V3 落地

- 文件：[_audit/DEV_LOG_2026-10-29_body-embedded-deai-v3.md](_audit/DEV_LOG_2026-10-29_body-embedded-deai-v3.md)
- 方案：[_audit/PROPOSAL_2026-10-29_BODY_EMBEDDED_DEAI_V3.md](_audit/PROPOSAL_2026-10-29_BODY_EMBEDDED_DEAI_V3.md)
- 手册：[_audit/FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md](_audit/FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md)
- 范围：观测诚信、变更率门禁、检测内核 V2、作者声纹、提示词压缩、legacy-auto 降级、trace/UI 汇总、`skillDeaiContract` 契约、双路径接线、folder SKILL 手册、真实 Electron 三场景验证器。
- 验证：`node --check`、`npm run build:vue`、`node scripts/verify-deai-body-electron.mjs` PASS；全量 Vitest 与 `vue-tsc` 见本日志收尾记录。
- 边界：该阶段收尾时 Phase 10 尚未执行，阈值/评分保持 provisional；同日 Phase 10 校准结果见下一条。不做 git 提交，不重复封装，安装包保持 3.110.7。

# 2026-10-29 正文层内嵌降AI Phase 10 样本校准

- 报告：[_audit/DEAI_SAMPLE_CALIBRATION_2026-10-29.md](_audit/DEAI_SAMPLE_CALIBRATION_2026-10-29.md)
- 数据：[_audit/verification-deai-calibration/deai-v2-calibration-2026-10-29.json](_audit/verification-deai-calibration/deai-v2-calibration-2026-10-29.json)
- 范围：《踏星》200 章真实人写负样本 + 两类合成正样本各 80 章；修复 V2 报告层全量禁用词误伤（新增 `DEAI_V2_BLOCKING_VOCAB` 高置信子集，硬规则层不变）。
- 验证：对白 hedging 误伤 0%；合成正样本 n-gram 命中 100%；变更率门禁三态单测 PASS；20,000 字检测 26.01ms；定向 16 tests 与全量 2431 tests PASS。
- 边界：四条放行标准 PASS，但整体判定 NOT CALIBRATED（suspicious+ 误伤 56%、单一作者、合成正样本），`provisional` 保留；不做 git 提交，不重复封装。

# 2026-10-29 降AI Phase 8.5 防漂移补闭环

- 清单：[_audit/RELEASE_CHECKLIST.md](_audit/RELEASE_CHECKLIST.md)
- 范围：新增契约/测试/手册三处一致性断言；新增发布收尾清单，把降AI手册版本同步纳入发布硬门禁。
- 验证：`npx vitest run src/components/pipeline/__tests__/deai-injection-policy.spec.ts` PASS。
- 边界：只补文档防漂移与测试门禁，不改运行时代码；provisional 与 live 边界不变。

# 2026-10-29 降AI校准语料 Track A Phase A1-A2

- 文件：[_audit/DEV_LOG_2026-10-29_deai-corpus-a1-a2.md](_audit/DEV_LOG_2026-10-29_deai-corpus-a1-a2.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-29_deai-corpus-a1-a2.md](_audit/TASK_LEDGERS/2026-10-29_deai-corpus-a1-a2.md)
- 交接：[_audit/HANDOFF_2026-10-29_DEAI_CORPUS_AND_LIBRARY.md](_audit/HANDOFF_2026-10-29_DEAI_CORPUS_AND_LIBRARY.md)
- 范围：建立 `D:/codex/deai-corpus/` 离线校准语料库；收割 12 条历史正文层真实模型响应，索引 5594 章《踏星》人写负样本。
- 验证：A1/A2 脚本 dry-run 与正式执行均 exit 0；正负标签行数分别为 12/5594；样本去重 `total=12, unique=12`；临时探针已删除。
- 边界：仅一位作者、一个模型，不满足多作者多题材校准门禁；`provisional` 继续保留，不改运行时代码、不提交、不封装。

# 2026-10-29 降AI多作者原著接入与 A2-A4 校准

- 文件：[_audit/DEV_LOG_2026-10-29_deai-raw-novels-a2-a4.md](_audit/DEV_LOG_2026-10-29_deai-raw-novels-a2-a4.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-29_deai-raw-novels-a2-a4.md](_audit/TASK_LEDGERS/2026-10-29_deai-raw-novels-a2-a4.md)
- 范围：9 部用户原著 raw txt 接入离线语料库（900 章、7 题材、8 个作者身份），校准器升级分层/held-out/敏感度，完成 A4 多作者判定。
- 验证：摄入幂等 `duplicates=900, newEntries=0`；多作者校准 train suspicious+ 41.39%、held-out 47.78%、作者区间 9%-70%；真实正样本 ngram 命中 91.67%；节点测试 9/9、定向 Vitest 16/16、`git diff --check` PASS。
- 结论：`provisional` 保留，注释升级为多作者边界；阈值、词库、评分权重未改动。剩余缺口为 2 部作者未核验、正样本单一 provider/model、评分体系需重设计。

# 2026-10-29 DEAI 多供应商正样本定向生成

- 文件：[_audit/DEV_LOG_2026-10-29_deai-directed-model-positives.md](_audit/DEV_LOG_2026-10-29_deai-directed-model-positives.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-29_deai-directed-model-positives.md](_audit/TASK_LEDGERS/2026-10-29_deai-directed-model-positives.md)
- 范围：修复定向脚本 Electron userData 错配与写死 endpoint；DeepSeek 官网 402 如实登记为失败；改用流水线供应商真实生成 S2 模型正样本，补齐 `deepseek-v4-pro` 4 条与 `glm-5` 4 条，语料 label 12 → 20，manifest 登记第二 provider 与第二个真实模型；校准脚本 `provenance` 改为动态生成分组。
- 验证：decrypt-only 3 个供应商通过；DeepSeek 定向 4/3 合格、glm-5 定向 4/3 合格；label/source 对账 missingSource 0；校准复跑出现三个 provider/model 正样本分组；脚本语法检查通过。
- 边界：不改运行时、不提交 git、不重新封装；样本深度仍不足，校准保持 provisional。

# 2026-10-29 降AI校准发布门禁固化

- 文件：[_audit/DEV_LOG_2026-10-29_deai-calibration-release-gate.md](_audit/DEV_LOG_2026-10-29_deai-calibration-release-gate.md)
- 门禁说明：[_audit/DEAI_CALIBRATION_RELEASE_GATE_2026-10-29.md](_audit/DEAI_CALIBRATION_RELEASE_GATE_2026-10-29.md)
- 范围：新增 `scripts/verify-deai-calibration-release-gate.mjs`，把解除 provisional 的条件固化为 14 项硬标准；修正召回口径后当前真实模型正样本 suspicious+ 召回为 45%，人写 held-out suspicious+ 误伤 47.78%，判定 NOT READY。
- 验证：门禁脚本 exit 1 并输出 NOT_READY；9 项失败、5 项通过；`node --test` 9 passed；定向 Vitest 通过；`git diff --check` PASS。
- 边界：不改运行时阈值与评分，不解除 provisional，不提交 git，不封装。下一阶段先做评分与阻断策略重设计，再扩正样本。

# 2026-10-30 降AI校准语料作者匿名身份收口

- 文件：[_audit/DEV_LOG_2026-10-30_deai-author-anonymization.md](_audit/DEV_LOG_2026-10-30_deai-author-anonymization.md)
- 范围：按用户裁决把两部未核验作品落为稳定匿名来源 `作者A`、`作者B`；labels 200 条、两个 source 目录/JSONL、manifest、门禁文案四处同步；迁移脚本与 before 快照留档。
- 验证：校准复跑 `humanLabels=6494`，`作者A/作者B` 各 100 条进入作者分组；门禁 `verifiedAuthorCount=10`、`unverifiedAuthorLabels=0` 均转 PASS，仍为 NOT_READY。
- 边界：匿名身份是稳定语料 ID，不冒充实名核验；阈值、词库、评分权重未改，provisional 保留，正样本深度缺口另行处理。

# 2026-10-30 降AI V2 评分重设计与校准仪器修正

- 文件：[_audit/DEV_LOG_2026-10-30_deai-scoring-redesign.md](_audit/DEV_LOG_2026-10-30_deai-scoring-redesign.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-30_deai-scoring-redesign.md](_audit/TASK_LEDGERS/2026-10-30_deai-scoring-redesign.md)
- 范围：修正校准器分数刻度、blocking 口径与输出通道；新增句长 CV 守卫式评分信号与 6 候选比选；复跑校准、门禁、单测与 Vitest。
- 验证：`node scripts/tests/deai-v2.test.mjs` 10 passed；`npx vitest run src/services/de-ai-v2.spec.ts` 14 passed；校准 `sampleCount=1000 heldOut=200 modelPositive=20`；发布门禁 NOT_READY（正样本每组 4 条、人写 suspicious+ 0.43、最差作者 0.7、召回 0.85、CI 半宽 0.1565）。
- 边界：不提交 git、不封装、不做 live API、不解除 provisional；真实正样本扩样是下一阶段硬前置；0 字节 `deai-v2-calibration-2026-10-30.json` 已删除。

# 2026-10-30 folder SKILL 降AI契约质疑对账与补漏

- 文件：[_audit/DEV_LOG_2026-10-30_deai-contract-audit-fix.md](_audit/DEV_LOG_2026-10-30_deai-contract-audit-fix.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-30_deai-contract-audit-fix.md](_audit/TASK_LEDGERS/2026-10-30_deai-contract-audit-fix.md)
- 范围：对 SKILL 方 8 条 `meta.deai` 手册质疑逐项对账；补主进程共享 CJS 预检、compose `meta` 接线、`finalStepDetection: off` / `suffix-only` / agent 真实 meta 三类测试；经验文件新增 G1.23 契约开关四件套并升级 v9.8.2。
- 验证：`realSkillExecutor` 定向 59/59；契约相关 4 files / 28 tests；`vue-tsc --noEmit` 通过；`git diff --check` 无 whitespace 错误。
- 边界：不提交 git、不重新封装、版本保持 3.110.7；真实 Electron 预检 UI 保持 `untested`；冲突检测词表边界是 v1 声明语义，不伪装成缺陷修复。

# 2026-10-30 正文层内嵌降AI V3 总方案逐条对账

- 文件：[_audit/DEV_LOG_2026-10-30_deai-v3-proposal-recheck.md](_audit/DEV_LOG_2026-10-30_deai-v3-proposal-recheck.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-30_deai-v3-proposal-recheck.md](_audit/TASK_LEDGERS/2026-10-30_deai-v3-proposal-recheck.md)
- 范围：以 V3 方案为唯一事实源，逐条对账 Phase 1-10 与验收矩阵；反推 UI 双状态、Electron 场景、声纹一致性断言、Playwright 替代验证与校准门禁。
- 验证：定向 5 files / 92 tests passed；`vue-tsc --noEmit` exit 0；`git diff --check` PASS。
- 边界：只读对账加审计文档落盘，不修运行时、不提交、不封装，版本保持 3.110.7；V3 判定为“核心已落实但非 100% 闭环”。

# 2026-10-30 正文层内嵌降AI V3 剩余缺口收口

- 文件：[_audit/DEV_LOG_2026-10-30_deai-v3-gap-closure.md](_audit/DEV_LOG_2026-10-30_deai-v3-gap-closure.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-30_deai-v3-gap-closure.md](_audit/TASK_LEDGERS/2026-10-30_deai-v3-gap-closure.md)
- 交付：Electron 验证器补齐六场景（default / skill-disabled / invalid-fallback / final-step-off-deep-fix / skill-wins / app-wins），修复 mock 响应队列跨场景残留，回退基于误判的两处产品条件；真实 UI 双状态、conflictPolicy 链路与声纹采样全部进入报告。
- 验证：Electron 六场景 PASS；`chainExecution` 24/24；type-check、build:vue 通过。
- 边界：mock provider 不声明 live 结论；Phase 10 校准保持 NOT_READY 与 provisional；不提交 git、不重新封装，版本保持 3.110.7；临时声纹探针已删除。

# 2026-10-30 3.110.8 可交付封装收尾

- 文件：[_audit/DEV_LOG_2026-10-30_packaging-3-110-8.md](_audit/DEV_LOG_2026-10-30_packaging-3-110-8.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-30_packaging-3-110-8.md](_audit/TASK_LEDGERS/2026-10-30_packaging-3-110-8.md)
- 交付：版本对齐 3.110.8；修正终步元数据测试锚点；全量 Vitest 228 files / 2446 tests；重新封装并新增安装包核验脚本，验证 asar 版本、validator 打包、真实启动、electronAPI 与渲染文本；清理 3.110.7、3.110.6 blockmap 与临时 CDP 探针。
- 验证：`node scripts/verify-packaging-3-110-8.mjs` PASS；安装包 SHA256 `c56a4d229beba39d9553350a0313fcdfe97317042bee764a3720a7f0dffa086c`；证据 `_audit/verification-packaging-3-110-8/packaging-evidence.json`。
- 边界：`神意助手-Setup-3.110.6.exe` 因安全描述符损坏无法删除，登记为需用户管理员手工处理；Phase 10 校准保持 provisional；业务链路证据仍为 mock provider 边界。

# 2026-10-30 正文层受保护契约与候选账本接线

- 文件：[_audit/DEV_LOG_2026-10-30_body-protected-contract-wiring.md](_audit/DEV_LOG_2026-10-30_body-protected-contract-wiring.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-30_body-protected-contract-wiring.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-30_body-protected-contract-wiring.md)
- 交付：正文契约改为 preProcess 后受保护注入并硬性校验最终请求；三次候选逐次测量净字数/交接/契约距离并落 run trace；重试耗尽按契约感知比选保留候选；字数不足反馈改 word-gap，不回传候选全文；统一 compose 与链式入口语义；新增真实 kaixuan-s2 集成测试；SKILL 适配手册见 [FOLDER_SKILL_BODY_PROTECTED_CONTRACT_GUIDE_2026-10-30.md](FOLDER_SKILL_BODY_PROTECTED_CONTRACT_GUIDE_2026-10-30.md)。
- 验证：定向 6 files / 198 tests passed；`vue-tsc --noEmit` exit 0；`git diff --check` exit 0；真实 S2 集成验证契约在折叠后 prompt 末尾且 postProcess 通过。
- 边界：不改 folder SKILL；不回滚降AI校准既有脏文件；不升版、不封装、不提交，等待用户确认。

# 2026-10-31 3.110.9 版本封装与提交

- 文件：[_audit/DEV_LOG_2026-10-31_release-3-110-9.md](_audit/DEV_LOG_2026-10-31_release-3-110-9.md)
- 交付：版本升级 3.110.9；正文受保护契约接线进入产品；降AI校准仪器升级独立提交；重跑封装与安装包核验。
- 验证：见封装开发日志与 `_audit/verification-packaging-3-110-9/packaging-evidence.json`。
- 边界：live 供应商生成与降AI校准 `provisional` 状态不在本轮解除。

# 2026-10-31 正文受保护契约字数口径与应用侧执法

- 文件：[_audit/DEV_LOG_2026-10-31_body-contract-caliber-enforcement.md](_audit/DEV_LOG_2026-10-31_body-contract-caliber-enforcement.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-31_body-contract-caliber-enforcement.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-31_body-contract-caliber-enforcement.md)
- 交付：候选账本与 word-gap 反馈统一剥离【正文交接】后计算净字数；postProcess 后新增应用侧 80%/200% 契约执法门；补齐 aiService mock import 链与真实 S2 集成回归。
- 验证：定向 12 files / 303 tests passed；`vue-tsc --noEmit` exit 0；`git diff --check` exit 0。
- 边界：不改 folder SKILL；不升版、不封装、不提交 git；live 供应商生成未测。

# 2026-10-31 3.110.10 版本封装与提交

- 文件：[_audit/DEV_LOG_2026-10-31_release-3-110-10.md](_audit/DEV_LOG_2026-10-31_release-3-110-10.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-31_packaging-3-110-10.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-31_packaging-3-110-10.md)
- 交付：版本升级 3.110.10；全量回归 230 files / 2462 tests；重新封装并新增安装包核验脚本；清理 3.110.8、3.110.9 旧产物；完成审计登记与 git 提交。
- 验证：`node scripts/verify-packaging-3-110-10.mjs` PASS；安装包 SHA256 `8fd8bb399b194441cc5b57d0e38bbda0bfff4ca008fd9d3eead83faae0123a4b`；证据 `_audit/verification-packaging-3-110-10/packaging-evidence.json`。
- 边界：live 供应商生成未测；`神意助手-Setup-3.110.6.exe` 维持 ACL 损坏边界。

# 2026-10-31 降AI Kimi 正样本收割与用户导出溯源

- 文件：[_audit/DEV_LOG_2026-10-31_deai-kimi-positive-harvest.md](_audit/DEV_LOG_2026-10-31_deai-kimi-positive-harvest.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-31_deai-kimi-positive-harvest.md](_audit/TASK_LEDGERS/2026-10-31_deai-kimi-positive-harvest.md)
- 交付：真实正文层正样本扩到 52 条，新增 Kimi 32 条；新增用户导出正文只读映射脚本，证明两个导出文件是已入库 payload 的整理拼接而非独立样本；外部 manifest 登记衍生证据。
- 验证：映射覆盖率 99.45% / 99.78%；校准 `modelPositive=52`；发布门禁仍 NOT_READY；Node 测试 10 passed；定向 Vitest 2 files / 17 tests passed。
- 边界：不改检测内核、阈值、词库、评分权重与 provisional；不提交 git、不封装、不做 live API；用户导出文件不进入 labels。

# 2026-10-31 word-gap 上游事实链骨架

- 文件：[_audit/DEV_LOG_2026-10-31_word-gap-upstream-scaffold.md](_audit/DEV_LOG_2026-10-31_word-gap-upstream-scaffold.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-31_word-gap-upstream-scaffold.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-31_word-gap-upstream-scaffold.md)
- 交付：word-gap 骨架改为 `candidate -> upstream -> none` 三级优先级；候选缺【正文交接】时优先用 `[上一章事实]`、场景事实与 `FACT_LOCK` 重建账本，只补缺口不做全链重写；执行器两处反馈调用接入 `chainUpstreamContext`；trace 新增骨架来源、容量与字段数；更新 SKILL 适配手册。
- 验证：定向 3 files / 71 tests passed；`vue-tsc --noEmit` exit 0；`git diff --check` exit 0；042804 trace 对账确认旧断链与数据可用性。
- 边界：不做 live 供应商验证；不升版、不封装、不提交 git；不回滚降AI校准相关脏文件。

# 2026-10-31 章级事件增量硬闸应用侧适配

- 文件：[_audit/DEV_LOG_2026-10-31_chapter-event-density-gate.md](_audit/DEV_LOG_2026-10-31_chapter-event-density-gate.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-31_chapter-event-density-gate.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-31_chapter-event-density-gate.md)
- 交付：识别 `NOT-READY + 章级事件密度不足` 为上游材料缺口，第一次物理返回后立即 blocked，不进入正文层第 2/3 次重试；catch 路径写专项 trace、步骤日志与上游指引；`事件增量` 进入 advisory 观测，只读交接 metadata；更新 SKILL 适配手册。
- 验证：定向 6 files / 107 tests passed；`vue-tsc --noEmit` exit 0。
- 边界：不做 live 供应商验证；不升版、不封装、不提交 git；不回滚降AI校准相关脏文件。

# 2026-10-31 降AI V2 候选参数生成器

- 文件：[_audit/DEV_LOG_2026-10-31_deai-v2-candidate-generator.md](_audit/DEV_LOG_2026-10-31_deai-v2-candidate-generator.md)
- 台账：[_audit/TASK_LEDGERS/2026-10-31_deai-v2-candidate-generator.md](_audit/TASK_LEDGERS/2026-10-31_deai-v2-candidate-generator.md)
- 交付：候选评分代理与运行时同刻度重建 base score；full 模式改为确定性 beam 搜索并如实报告非 exhaustive；minimal 强制精确枚举；held-out 仅做一次复验；输出推荐候选、默认参数 diff、dev 分组表现与 held-out 复验。
- 验证：候选器/语料/V2 Node 测试 10+4+10 passed；定向 Vitest 2 files / 17 tests passed；minimal `exact-enumeration evaluated=512`；full `deterministic-beam combinations=3,675,000 evaluated=1,956`；既有校准器复跑 `modelPositive=52`；release gate 仍 NOT_READY。
- 边界：不改检测内核、阈值、词库、评分权重与 provisional；不提交 git、不封装、不做 live API；候选仅进入人工审核，不作为校准通过依据。

# 2026-10-31 3.110.11 版本封装与提交

- 文件：[_audit/DEV_LOG_2026-10-31_release-3-110-11.md](_audit/DEV_LOG_2026-10-31_release-3-110-11.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-31_packaging-3-110-11.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-31_packaging-3-110-11.md)
- 交付：版本升级 3.110.11；全量回归 231 files / 2478 tests；封装并真实启动核验安装包；清理 3.110.10 旧产物；release 与降AI校准资产分两次提交。
- 验证：`node scripts/verify-packaging-3-110-11.mjs` PASS；安装包 SHA256 `e0c7084c841a87d7a60238e6c6106db8a15ef0d23d9b1a4dd1f9ce5448f8887d`；证据 `_audit/verification-packaging-3-110-11/packaging-evidence.json`。
- 边界：live 供应商生成未测；降AI release gate 仍 NOT_READY；`神意助手-Setup-3.110.6.exe` 维持 ACL 损坏边界。

# 2026-10-31 技能/智能导入链路八步收口

- 文件：[_audit/DEV_LOG_2026-10-31_skill-import-chain-overhaul.md](_audit/DEV_LOG_2026-10-31_skill-import-chain-overhaul.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-31_skill-import-chain-overhaul.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-31_skill-import-chain-overhaul.md)
- 交付：统一 folder 记录构造器；Electron 技能库版本定位闭环；配置协议 v3；运行时三面共享磁盘元数据水合器；ZIP 二进制保真；删除技能 store 旧语义；健康检查补元数据维度；测试矩阵补齐。
- V2.1 追加：`chatHistory: latest/all` 旧语义全链路退役；真实 Electron UI 验证导入、覆盖导入、缓存失效与两次物理请求；验证器补模型列表/非流式 chat/mock 协议分流。
- 验证：定向 6 files / 91 tests passed；`vue-tsc --noEmit` exit 0；全量 Vitest 234 files / 2500 tests passed（首跑 de-ai-v2 性能阈值并发波动，单文件与全量复跑均通过）；UI 验证输出 `SKILL CONTEXT POLICY V2.1 ELECTRON PASSED`。
- 边界：live 外部供应商不适用，本轮使用本地真实 HTTP provider；未升版、未封装、未提交 git。

# 2026-10-31 双层验收边界收口

- 文件：[_audit/DEV_LOG_2026-10-31_narrative-verdict-ownership.md](_audit/DEV_LOG_2026-10-31_narrative-verdict-ownership.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-31_narrative-verdict-ownership.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-31_narrative-verdict-ownership.md)
- 交付：应用侧事件增量收益分类与豁免判定退役；新增 `narrativeStatus / narrativeReason / stateChangingScenes` 单通道 verdict 消费；`not_ready` 第一次物理返回即 blocked 并路由回上游；`ready` 只透传 trace；链式与 compose 双路径接入；更新 SKILL 适配手册与经验门禁 G2.9。
- 验证：旧语义 `rg` 0 matches；定向 4 files / 106 tests passed；`vue-tsc --noEmit` exit 0。
- 边界：不做 live 供应商验证；未升版、未封装、未提交 git；不回滚技能/智能导入链路 V2.1 未提交改动。

# 2026-10-31 全层单一裁判权审计与闭环

- 文件：[_audit/AUDIT_2026-10-31_single-owner-verdict-full-scope.md](_audit/AUDIT_2026-10-31_single-owner-verdict-full-scope.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-31_single-owner-audit-closure.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-31_single-owner-audit-closure.md)
- 交付：全层只读审计后闭环三个残留项：`contractReview` 退役揭示词表与本地三态，改为底牌提及观测 + SKILL `contractStatus/contractReason` verdict；`narrativeValidation` 更名 Structure 并删除 `selectCompleteChapters` 死语义；更新经验 G2.9、SKILL handoff、审计报告与开发日志。
- 验证：定向 3 files / 18 tests passed；`npm run type-check` exit 0；旧语义 `rg` 清零（卷纲 `contractRisk` 平台合同保留）。
- 边界：待 SKILL 真实输出 `contractStatus` 后做一次 trace 回放；未升版、未封装、未提交 git。

# 2026-10-31 3.110.12 版本封装与提交

- 文件：[_audit/DEV_LOG_2026-10-31_release-3-110-12.md](_audit/DEV_LOG_2026-10-31_release-3-110-12.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-31_packaging-3-110-12.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-31_packaging-3-110-12.md)
- 交付：版本升级 3.110.12；合流单一裁判权审计闭环、技能/智能导入链路 V2.1 与叙事 verdict 单通道；封装并真实启动核验安装包；替换核验脚本并保留 3.110.6 ACL 边界件；完成审计登记与 git 提交。
- 验证：全量回归 234 files / 2512 tests passed；`npm run type-check` exit 0；技能导入 V2.1 Electron UI 验证 PASS；`node scripts/verify-packaging-3-110-12.mjs` PASS；安装包 SHA256 `83465391a78cf3da4e32a3cec029643a116a944eabd2c72b4f9740f05728527d`。
- 边界：live 供应商生成未测；降AI release gate 仍 NOT_READY；`神意助手-Setup-3.110.6.exe` 维持 ACL 损坏边界。

# 2026-11-01 folder SKILL meta.json 声明规范与 SKILL handoff

- 文件：[_audit/DEV_LOG_2026-11-01_folder-skill-meta-declaration-handoff.md](_audit/DEV_LOG_2026-11-01_folder-skill-meta-declaration-handoff.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_folder-skill-meta-declaration-handoff.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_folder-skill-meta-declaration-handoff.md)
- 交付：判定“文件夹磁盘声明缺失”为权威源迁移后应用侧手册断链；新增 `meta.json` 磁盘声明规范与 SKILL 补齐 handoff；既有 SKILL 手册补交叉引用；G1.23 回写权威源迁移条款，经验文件升级 v9.8.8。
- 验证：定向语义测试与类型检查通过；规范字段与运行时/体检实现锚点逐项对账；全层 meta.json 扫描确认缺口清单。
- 边界：SKILL 层磁盘包待其按 handoff 补齐；不升版、不封装、不提交 git。

# 2026-11-01 内嵌降AI诊断-路由-回归方案

- 文件：[_audit/DEV_LOG_2026-11-01_deai-diagnose-route-return-proposal.md](_audit/DEV_LOG_2026-11-01_deai-diagnose-route-return-proposal.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-diagnose-route-return-proposal.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-diagnose-route-return-proposal.md)
- 交付：产出内嵌降AI V1 方案：降AI降权为只读诊断器、findings 位置化、退化指纹独立、修复按 owner 路由、skill-wins 默认化、legacy-auto/deep-fix 分阶段退役；包含20轮推演、三阶段实施、七面影响圈与验收门禁。
- 验证：只读对账 `de-ai.js`、`skillDeaiContract.ts`、`PipelinePanel.vue` 与 story-deslop 检测脚本锚点；方案按 G0.6 给出成熟结论；无生产代码改动。
- 边界：待用户审核；不改生产代码、不升版、不封装、不提交 git；folder SKILL 适配说明待批准后输出。

# 2026-11-01 内嵌降AI指导者方案 V2

- 文件：[_audit/DEV_LOG_2026-11-01_deai-mentor-guidance-proposal.md](_audit/DEV_LOG_2026-11-01_deai-mentor-guidance-proposal.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-proposal.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-proposal.md)
- 交付：在 V1 编译器方案基础上升级为“方法论指导者 + 确定性门禁”：生成前分步指导包、生成后位置化教学反馈、`meta.deai` contractVersion 2 与 `guidanceOwnership`、旧三段提示词七层退役；明确资料支撑方法论指导者但不支撑自动语义/评分/改稿导师。
- 验证：只读对账 story-deslop 方法论锚点与应用注入/契约/流水线消费点；方案包含20轮推演、三阶段实施、七面影响圈、G0.6 成熟度结论与 6 个决策点；无生产代码改动。
- 边界：待用户审核；不改生产代码、不升版、不封装、不提交 git；教学有效性待影子观察（20章、2题材、2模型）达标后才能宣称验证。

# 2026-11-01 内嵌降AI方法指导者方案 V3

- 文件：[_audit/DEV_LOG_2026-11-01_deai-mentor-guidance-v3.md](_audit/DEV_LOG_2026-11-01_deai-mentor-guidance-v3.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-v3.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-v3.md)
- 交付：按用户五条裁决升级 V3：严格区分流水线内嵌降AI与手动去AI味并切断流水线读取 `deAiStore` 的状态纠缠；补齐旧三段提示词与 `legacy-auto/deep-fix` 的 G0.10 七层清零与五证退场；角色唯一化为方法指导者；新增 6条/1200字符/5ms 耗时预算与 20章影子对比；明确徽章、日志、可折叠教学反馈的 UI 体现。
- 验证：只读对账 `PipelinePanel.vue` 注入/后处理/跨 store 读取、`de-ai.js` 三段提示词、`runTrace.ts` 字段与 6 类守护测试；无生产代码改动。
- 边界：待用户审核；不改生产代码、不升版、不封装、不提交 git；教学有效性待影子观察达标。

# 2026-11-01 内嵌降AI方法指导者方案 V4

- 文件：[_audit/DEV_LOG_2026-11-01_deai-mentor-guidance-v4.md](_audit/DEV_LOG_2026-11-01_deai-mentor-guidance-v4.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-v4.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-v4.md)
- 交付：把 V3 的 21 项风险全部升级为“机制、证据、断言、停机条件”四件套；修正纠缠面为 4 读 1 写并纳入 `runBodyMinimalEdit` 退场；承认 overlap 为 keyword-lite 并设计 declared overlaps；先修 `finalStepDetection` 正常终步接线；限定零 diff 为确定性构造物比较；补齐 `suffix-only` 分叉迁移门禁与文档-测试-实现三方绑定。
- 验证：只读源码复核 `PipelinePanel.vue:6091-6176,6223,6369-6500`、`skillDeaiContract.ts:118-146`、`skillDeaiContractValidation.ts:30`、`realSkillExecutor.ts:526-528`、`runTrace.ts:197-384,2269-2357`；确认 `deai-injection-policy.spec.ts:22-30` 三方绑定与 `proseHardSignalWiring.spec.ts:9` 位置耦合；无生产代码改动。
- 边界：待用户审核；不改生产代码、不升版、不封装、不提交 git；教学有效性与校准状态保持 provisional。

# 2026-11-01 内嵌降AI方法指导者方案 V4.1

- 文件：[_audit/DEV_LOG_2026-11-01_deai-mentor-guidance-v4-1.md](_audit/DEV_LOG_2026-11-01_deai-mentor-guidance-v4-1.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-v4-1.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-v4-1.md)
- 交付：补入 V4 审计出的 10 个漏项（混源隔离、blocking 第二裁判、声纹预算、step 4 耦合、HelpGuide、预检 warning、finalStepRetry 透传、keyword-lite 双实现、voice profile 快照、脆弱断言）；新增执行条例：Task 单元、预写验证、五列执行对账表、中断恢复协议、回头看清单、违例即停。
- 验证：只读复核全部漏项当前源码锚点；无生产代码改动。
- 边界：待用户审核；不改生产代码、不升版、不封装、不提交 git；教学有效性与校准状态保持 provisional。

# 2026-11-01 内嵌降AI方法指导者最终执行方案 V5 FINAL

- 文件：[_audit/DEV_LOG_2026-11-01_deai-mentor-guidance-v5-final.md](_audit/DEV_LOG_2026-11-01_deai-mentor-guidance-v5-final.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-v5-final.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-v5-final.md)
- 交付：完成 V1-V4.1 跨版本审计；显式裁决三处被后续版本覆盖的早期承诺（手动入口不改造、blocking 退场、skill-wins 默认化保留）；合并 14 项锁定决策；V4.1 的 10 漏项全部映射到 Phase Task；执行条例与预写验证命令并入最终方案。
- 验证：V1/V2/V3 全文复读，V4/V4.1 复用前轮源码锚点复核；无生产代码改动。
- 边界：待用户确认执行；不改生产代码、不升版、不封装、不提交 git；教学有效性与校准状态保持 provisional。

# 2026-11-01 3.110.13 降AI方法指导者执行与封装

- 文件：[_audit/DEV_LOG_2026-11-01_deai-mentor-guidance-v5-final.md](_audit/DEV_LOG_2026-11-01_deai-mentor-guidance-v5-final.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-v5-final.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-v5-final.md)
- 交付：V5 FINAL Phase A/B/C 全部落地：切断手动 DEAI store 纠缠、run 级声纹快照、确定性指导包、`meta.deai` v2 契约、UI trace 实值显示、旧三段提示词与流水线改稿语义七层清零；版本升级 3.110.13 并封装。
- 验证：type-check exit 0；全量 238 files / 2539 tests passed；两组真实 Electron UI 验证 PASS；app.asar 旧语义 0 命中；安装包 231,646,326 字节。
- 边界：B6 保持 provisional，配对影子数据为 0；手动去AI味功能本体不变；教学反馈不携带候选全文。

# 2026-11-01 V5 FINAL 降AI残余倒查与死接口清理

- 文件：[_audit/DEV_LOG_2026-11-01_deai-mentor-guidance-v5-final.md](_audit/DEV_LOG_2026-11-01_deai-mentor-guidance-v5-final.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-v5-final.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-v5-final.md)
- 交付：完成 V5 FINAL 残余倒查（旧三段提示词、跨 store 读写、旧处理器接线、trace 白名单、多 run 快照、守卫意图）；清理未接线的 `resetTerminalRun` 并新增接口负向守护，终态释放唯一权威保持为 `activeRunIds` watch。
- 验证：type-check exit 0；全量 238 files / 2540 tests passed；降AI定向 22 tests、快照与 Phase0 定向 35 tests 全部通过。
- 边界：不接回逐 run 释放入口；若 run registry 出现滞留 running 缺陷，修 registry 终态推进而非快照旁路。

# 2026-11-01 3.110.14 降AI倒查清理封装

- 文件：[_audit/DEV_LOG_2026-11-01_deai-mentor-guidance-v5-final.md](_audit/DEV_LOG_2026-11-01_deai-mentor-guidance-v5-final.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-v5-final.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-v5-final.md)
- 交付：版本升级 3.110.14 并重新封装；安装包覆盖 `resetTerminalRun` 死接口清理、接口负向守护、两份 folder SKILL 降AI手册。
- 验证：`npm run build` exit 0；安装包 231,648,526 字节；app.asar 中旧三段提示词、`runBodyMinimalEdit`、`resetTerminalRun` 全部 0 命中。
- 边界：无行为变更，仅为接口清理与交付封装；B6 教学有效性仍保持 provisional。

# 2026-11-01 降AI可视闭环 V6.2 与 3.110.15

- 文件：[_audit/DEV_LOG_2026-11-01_deai-guidance-visible-closure-v6-2.md](_audit/DEV_LOG_2026-11-01_deai-guidance-visible-closure-v6-2.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-guidance-visible-closure-v6-2.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-guidance-visible-closure-v6-2.md)
- 交付：正文层降AI观测面从单一 `deai-guidance-pack` 升级为 `deai-injection-policy` 判 owner、`deai-guidance-pack` 判 app 注入量；每 SKILL 独立投影 + 链级 mixed 聚合；app/skill/off/mixed/unknown 五态真实 UI 常显；手册升级 v2；版本 3.110.15。
- 验证：定向 37 tests passed；type-check exit 0；全量 239 files / 2552 tests passed；五态真实 Electron 验证 A/B/C/D/E 全 PASS；`npm run build:vue` 与 `npm run build` exit 0；安装包 231,644,738 字节，asar 版本标记 3.110.15。
- 边界：不回滚 `guidanceOwnership=skill`；不伪造 pack；`callApiWithAgentVariant` 死接口清理登记为独立后续项；B6 教学有效性保持 provisional。

# 2026-11-02 callApiWithAgentVariant 死接口闭环与 3.110.16

- 文件：[_audit/DEV_LOG_2026-11-02_callapi-agent-variant-dead-interface-closure.md](_audit/DEV_LOG_2026-11-02_callapi-agent-variant-dead-interface-closure.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-02_callapi-agent-variant-dead-interface-closure.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-02_callapi-agent-variant-dead-interface-closure.md)
- 交付：删除无调用方的 `callApiWithAgentVariant` 三行转发包装，保留唯一生产入口 `callApiWithAgentVariantOwned`；新增死接口负向守护；手册登记 agent 唯一生产入口；版本 3.110.16。
- 验证：RED→GREEN 守护闭环；定向 38 tests、type-check、`build:vue`、五态真实 Electron A-E、全量 239 files / 2553 tests 全部通过；生产裸名引用清零。
- 边界：不扩展全仓死代码扫描；B6 教学有效性保持 provisional。

# 2026-11-02 Pipeline Context Cache V2.1 观测底座

- 文件：[_audit/DEV_LOG_2026-11-02_pipeline-context-cache-v2-1.md](_audit/DEV_LOG_2026-11-02_pipeline-context-cache-v2-1.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-02_pipeline-context-cache-v2-1.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-02_pipeline-context-cache-v2-1.md)
- 交付：默认请求行为不变的上下文组成与 provider cache 观测底座：cache family/前缀指纹/稳定占比、OpenAI-compatible 与 Anthropic cache usage 归一、物理请求 trace 持久化、JSON/文本导出、folder 主链 `contextLayer` 接线；修复 ratio 越界与 layer 单复数漂移。
- 验证：RED→GREEN（cache ratio 1.2→1）；定向 6 files / 382 tests passed；type-check exit 0；负向断言覆盖 prompt 全文不落账、未知身份不合并、缺 usage 不发明命中；G0.5 回头看补修测量口径（system/user 长度改从 wire 消息推导，覆盖表格指引与 Anthropic 多 system 合并），全量 240 files / 2572 tests passed。
- 边界：真实供应商 cache 矩阵、20 章 shadow A/B、安装包级真实运行保持 `untested`；agent 变体与辅助调用只有 cache usage 观测、无 request composition，登记为非阻塞缺口。
- 回头看补充：外部 S2 活体契约新增 `场景类型`、`对白排布` 并收紧 `stateChangingScenes` 格式，按 G1.26 判定为外部契约演进；集成夹具同步，生产断言未放松。

# 2026-11-02 Pipeline Context Cache 观测闭环与 3.110.17

- 文件：[_audit/DEV_LOG_2026-11-02_pipeline-context-cache-v2-1.md](_audit/DEV_LOG_2026-11-02_pipeline-context-cache-v2-1.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-02_pipeline-context-cache-v2-1.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-02_pipeline-context-cache-v2-1.md)
- 交付：反向扫描补齐 4 条直连流水线 AI 路径（风格分析、agent 变体、硬信号修复、记忆抽取）的 `contextComposition`；5 个物理调用观测点全部持久化 cache usage 与上下文组成；版本升级并封装 3.110.17；恢复被误写的 3.110.12 历史 evidence；清理 3.110.12-3.110.16 旧安装产物。
- 验证：type-check exit 0；定向 3 files / 20 tests passed；全量 240 files / 2575 tests passed；`node scripts/verify-packaging-3-110-17.mjs` 三次 PASS（真实 Electron 启动、87 renderer files、94 electronAPI methods）；安装包 231,651,182 字节，SHA-256 `4a29f1a8bcb561ba2176584184c749dabec47c50cfe275b2a69a1e70485a6c4b`。
- 边界：真实供应商 cache 矩阵、20 章 shadow A/B 保持 `untested`；`dist\神意助手-Setup-3.110.6.exe` 被 360 锁定为环境边界；S2 新增 handoff 字段需转达 SKILL 层。

# 2026-11-02 Run Trace 归因审计与 3.111.0

- 文件：[_audit/DEV_LOG_2026-11-02_run-trace-audit-attribution.md](_audit/DEV_LOG_2026-11-02_run-trace-audit-attribution.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-02_run-trace-audit-attribution.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-02_run-trace-audit-attribution.md)
- 交付：候选保留归因、验收终态原因与决策路径、`exportSchemaVersion` 版本域拆分、验证器按 `data-run-id` 精确导出并校验当前 run 身份；版本升级 3.111.0；附 SKILL 适配说明。
- 验证：`node --check` exit 0；定向 3 files / 130 tests passed；真实 Electron UI PASS（`run-1793576618331-1`）；独立 trace 审计 PASS（payloads=14、attempts=1）；全量 240 files / 2586 tests passed；最终发布构建在当前 HEAD 重跑全量 240 files / 2586 tests passed，安装包 231,649,652 bytes，SHA-256 `C37E5B23857CFC8FDCEB0152568936B7E47AB551BF4F53ACC1892C76FC96E03F`，asar 内 version=3.111.0、构建指纹 `99e8981e04cc`。
- 边界：本轮 provider 为 mock，不声明真实供应商内容质量；独立审计 `retained=0` 仅统计 degraded 调用；B6 教学有效性保持 provisional；3.110.17 旧产物已清理，3.110.6 为 360 锁定环境边界。

# 2026-11-03 正文层内嵌降AI协同 V6.1 Phase B/C

- 文件：[_audit/DEV_LOG_2026-11-03_body-deai-v6-1-phase-bc.md](_audit/DEV_LOG_2026-11-03_body-deai-v6-1-phase-bc.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-02_body-deai-v6-1-phase-bc.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-02_body-deai-v6-1-phase-bc.md)
- 交付：provider/model 画像读取与 run 内 immutable 快照；UI 三线显示（方法论/诊断/校准）；终稿 findings 落校准账本；SKILL 迭代报告导出；per-run UI 状态结构化与终态有界化；S2 诊断存续修复；报告变体从真实 apiCalls 派生。
- 验证：RED→GREEN；定向 6 files / 47 tests passed；type-check exit 0；`build:vue` exit 0；真实 Electron E2E PASS（`run-1793645741138-1`，3 物理请求，报告导出 615 bytes），报告断言 `S2诊断：3条`、`变体: methodology, creative, polish`、`误伤候选 - 无`；全量 245 files / 2623 tests passed。
- 边界：mock Electron E2E 已验证真实 UI/trace/物理请求组装；后续真实供应商 observational live 已在五个证据目录留证。本轮当时不升版、不封装、不提交 git，3.112.0 发布证据由发布台账接续。

# 2026-11-03 正文层内嵌降AI协同 V6.1 真实供应商 Live 观测修正

- 文件：[_audit/DEV_LOG_2026-11-03_body-deai-v6-1-live.md](_audit/DEV_LOG_2026-11-03_body-deai-v6-1-live.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-03_body-deai-v6-1-live.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-03_body-deai-v6-1-live.md)
- 交付：真实供应商 observational live：Electron safeStorage 密钥解密桥（明文不落盘）、超时与失败留证脚本补丁、`verify:deai-stage-guidance-live` 入口；五个证据目录保留真实失败/running/success 状态，成功章节 variant/诊断/校准/UI 与 trace 一致。
- 验证：summary/trace 对账一致；早期三个无证据 runId 与“3/3 success”声明已撤回；观测产物密钥形状反查 0 命中。
- SKILL 交接：[_audit/SKILL_ADAPTATION_2026-11-03_body-deai-v6-1-live.md](_audit/SKILL_ADAPTATION_2026-11-03_body-deai-v6-1-live.md)
- 边界：observational 不证明写作质量、不是发布门禁；S3 postProcess 阈值与 S2 施工净字数缺口交 SKILL 作者迭代；发布交付由 3.112.0 发布台账接续。

# 2026-11-03 正文层内嵌降AI协同 V6.1 缺口闭环

- 文件：[_audit/DEV_LOG_2026-11-03_body-deai-v6-1-gap-closure.md](_audit/DEV_LOG_2026-11-03_body-deai-v6-1-gap-closure.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-03_body-deai-v6-1-gap-closure.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-03_body-deai-v6-1-gap-closure.md)
- SKILL 交接：[_audit/SKILL_ADAPTATION_2026-11-03_body-deai-v6-1-gap-closure.md](_audit/SKILL_ADAPTATION_2026-11-03_body-deai-v6-1-gap-closure.md)
- 交付：校准账本 500 条上限与裁剪 trace；误伤候选 UI 登记入口并随报告导出；模型画像与 S2→S3 诊断入口均改为 `pipelineLayerForStep(step) === 'body'` 语义入口并加负向守护；诊断/报告 per-run 并发守护测试补齐；`releaseGate` 冻结观测、单条 sample 120 字符截断、0 finding 观测事件、停滞检测时间戳污染修复。
- 验证：画像调用点 RED→GREEN（先 1 failed 后 14 passed）；定向 3 files / 34 tests passed；`npm run type-check` exit 0；`npm run build:vue` exit 0；真实 Electron E2E PASS（3 逻辑 call、3 物理 call）；`npm run test:services` 245 files / 2638 tests passed。
- 边界：真实供应商 live 为五个 observational 证据目录（含失败与 running）；误伤登记只进报告、不进校准与终态；3.112.0 发布交付由发布台账接续。

# 2026-11-03 正文层内嵌降AI V6.1 过度设计冻结与死项清理

- 文件：[_audit/DEV_LOG_2026-11-03_body-deai-v6-1-overdesign-freeze.md](_audit/DEV_LOG_2026-11-03_body-deai-v6-1-overdesign-freeze.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-03_body-deai-v6-1-overdesign-freeze.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-03_body-deai-v6-1-overdesign-freeze.md)
- 交付：模型画像 prompt 注入在校准 NOT READY 期间冻结，trace 保留冻结原因；清理 `deai-skill-report` 无发射点的 trace whitelist 死项，报告导出与误伤登记功能本体保留。
- 验证：冻结定向 2 files / 21 tests passed；死项清理后 2 files / 19 tests passed；`npm run type-check` exit 0；`npm run test:services` 245 files / 2631 tests passed。
- 边界：冻结后的 Electron E2E 已重跑通过；真实供应商 observational live 已在五个证据目录留证，含失败与 running 状态。observational 结果不证明写作质量；3.112.0 发布证据由发布台账接续。

# 2026-11-03 3.112.0 正文层内嵌降AI协同交付

- 文件：[_audit/DEV_LOG_2026-11-03_release-3.112.0.md](_audit/DEV_LOG_2026-11-03_release-3.112.0.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-03_release-3.112.0.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-03_release-3.112.0.md)
- 交付：撤回无证据 live 3/3 成功声明并保留五个真实 observational 目录；多 run 报告绑定修复；V6.1 降AI协同、冻结画像观测、诊断/校准/报告链路随 3.112.0 发布。
- 门禁：`git diff --check`、`type-check`、`test:services`、`build`、`verify:packaging`、敏感扫描、显式 staging、git commit、提交后复查；全部通过后才允许完成声明。
- 边界：live observational 不证明写作质量；folder SKILL 生产目录不由应用侧修改；发布完成证据以发布台账第 6 节为准。

# 2026-11-03 经验文件 v10.0.0 重整

- 文件：[_audit/DEV_LOG_2026-11-03_experience-v10-rebaseline.md](_audit/DEV_LOG_2026-11-03_experience-v10-rebaseline.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-03_experience-v10-rebaseline.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-03_experience-v10-rebaseline.md)
- 交付：唯一经验文件升级 v10.0.0；新增 G0.13 最小必要性与过度设计禁令；压缩 G1.5、G1.17、G2.9 流水账；修正 G2.13/G2.14 展示顺序；使用路由与 STACK 规则源同步。
- 验证：54 条门禁全量读证；当前规则源与 STACK 为 v10.0.0，总索引历史标题保留为追溯记录；`git diff --check` 通过。
- 边界：不改生产代码、不封装、不提交 git；L3 归档保留为追溯材料，不作为执行规则源。

# 2026-11-03 正文层 S1 供应商 401 失败诊断

- 文件：[_audit/DEV_LOG_2026-11-03_body-s1-provider-401-diagnosis.md](_audit/DEV_LOG_2026-11-03_body-s1-provider-401-diagnosis.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-03_body-s1-provider-401-diagnosis.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-03_body-s1-provider-401-diagnosis.md)
- 交付：诊断两次 3.112.0 正文层失败；主根因为供应商 `chat/completions` 401；SKILL 层无责任证据；V6.1 方法论真实注入；登记 run trace 供应商诊断字段观测缺口与最小修复方向。
- 验证：两份深 trace、渲染日志、请求 payload、源码接线、安装包哈希与构建 manifest 已对账；本轮只读诊断，不改生产代码。
- 边界：不证明该供应商后续状态或其他供应商可用性；不新增 preflight、自动切换或健康系统；trace 字段修复待用户批准后执行。

# 2026-11-04 物理请求供应商诊断观察闭环

- 文件：[_audit/DEV_LOG_2026-11-04_physical-call-provider-diagnostics.md](_audit/DEV_LOG_2026-11-04_physical-call-provider-diagnostics.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-04_physical-call-provider-diagnostics.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-04_physical-call-provider-diagnostics.md)
- 交付：`statusCode/providerErrorSummary/finalUrl/transport` 从 `aiService` 穿透共享投影、8 个生产入口、run trace 存储/更新、详情 UI、diff、JSON/text 导出；schema 升级 21；HTTP 200 软错误不再丢诊断，网络失败不伪造 HTTP 状态。
- 验证：定向 6 files / 324 tests passed；全量 247 files / 2649 tests passed；type-check、build:vue、git diff --check 通过；旧 schema 20 残留 0 匹配。
- 边界：真实外部供应商错误形态保持 `untested`；不升版、不封装、不提交 git；不做供应商 preflight、健康系统、自动切换或重试策略变更。

# 2026-11-04 生成流水线分层供应商语义修复 3.114.0

- 文件：[_audit/DEV_LOG_2026-11-04_pipeline-layer-provider-semantics-repair.md](_audit/DEV_LOG_2026-11-04_pipeline-layer-provider-semantics-repair.md)
- 台账：[_audit/TASK_LEDGERS/2026-11-04_PIPELINE_LAYER_PROVIDER_SEMANTICS_REPAIR.md](_audit/TASK_LEDGERS/2026-11-04_PIPELINE_LAYER_PROVIDER_SEMANTICS_REPAIR.md)
- 交付：流水线层绑定供应商裁决固定为 `layer > agent > global`；Agent 不再覆盖层绑定；辅助记忆外呼声明 `providerSource: auxiliary`；trace、api call、物理请求三面同源；HEAD 回归修因与三条真实 UI 溯源断言后版本升级 3.114.0。
- 验证：`build:vue` exit 0；真实 Electron 分层通道验证 `[PASS] ... requests=6`；type-check exit 0；全量回归 `247 files / 2653 tests` 通过；`verify:packaging` 与安装包哈希见台账 3.114.0 封装章节。
- 边界：真实 UI/Electron 使用 mock 四层供应商；不声明真实供应商内容质量；不做负载均衡、健康切换、自动回退或额外 preflight。

# 2026-11-04 正文链旧信封退役 A 路线

- 文件：[_audit/DEV_LOG_2026-11-04_body-step-envelope-retirement.md](_audit/DEV_LOG_2026-11-04_body-step-envelope-retirement.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-04_body-step-envelope-retirement.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-04_body-step-envelope-retirement.md)
- 交付：`__shenyiStepArtifact` 兼容构造/解析执行面退役；caller 状态与错误改为 `StructuredSkillStepOutput` 内存直传；主链/echo/escalation/compose 四调用点迁移；断点旧信封只做显式 trace 的内存净化；测试改为负向断言旧信封不得拆包或携带状态。
- 验证：定向五文件 `72 tests` 通过；全量 `247 files / 2655 tests` 通过；type-check 与 `git diff --check` 通过；现役信封构造/解析执行面 0 命中。
- 边界：真实 folder SKILL、真实供应商、真实 Electron 正文链与 echo/escalation 直入统一验收均 `untested`；本轮不升版、不封装。
- 盲区补验：真实 Electron 三场景 PASS，A 前拒绝、B 提取后 S3 成功、C 无账本终步阻断且不覆盖旧正文；修复 `closePerRunFeedback` 终态立即清 UI 导致关闭失效。echo/escalation 统一验收仍 `untested`。
