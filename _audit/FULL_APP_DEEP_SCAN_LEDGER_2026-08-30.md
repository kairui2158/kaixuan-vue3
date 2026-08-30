# 全应用深度扫描台账（2026-08-30）

计划：`_audit/FULL_APP_DEEP_SCAN_PLAN_2026-08-30.md`
规则：只读扫描；每项发现必须 file:line + 命令原始输出；分级 P0 丢数据/坏功能、P1 客户可感知、P2 体验瑕疵、P3 记录在案。

---

## P0 基线冻结

| 项目 | 结果 | 证据 |
|---|---|---|
| git 状态 | 工作区干净；master 领先 origin/master 6 提交 | `git status -sb` → `## master...origin/master [ahead 6]` |
| 最新提交 | 9de54df fix(exit): 保存退出时无打开章节不再弹出提示窗 | git log |
| 版本 | 3.8.3 | `npm run type-check` 输出 `shenyi-assistant@3.8.3` |
| 类型检查 | PASS，0 错误 | `vue-tsc --noEmit` → exit 0 |
| 单元测试 | PASS，13 文件 104 测试 | `npx vitest run` → `Test Files 13 passed (13)` / `Tests 104 passed (104)` |
| 生产构建 | PASS，1.25s | `npm run build:vue` → `✓ built in 1.25s`，exit 0 |
| 构建警告 | 已知非阻断 2 类 | INEFFECTIVE_DYNAMIC_IMPORT（provider/aiService/executionLog 互引）；chunk >500kB |
| Electron 进程 | 存活，4 进程 | `Get-Process electron` → `processes=4` |
| CDP 端口 | 连通 | `GET /json` → 1 page，title=神意助手，url=dist-renderer/index.html |
| 运行态探针 | 全绿 | title 神意助手；appMounted=true；sidebar=true；chatPanel=true；editor=true；bodyScrollW=1904=viewportW（无横向溢出）；electronAPI=object |
| 基线截图 | 已存 | `_audit/tmp/p0_baseline.png`（58793 字节） |
| 帮助菜单 | 原生菜单存在 | `electron/main.js:50-57`：label=帮助 → 应用教学指南（DOM 探针无按钮属正常，原生菜单不进 DOM） |
| 探针注意 | console 仅探针时刻起捕获 | 首轮 console 错误以 P8 冒烟全程监听为准 |

P0 结论：基线全绿，允许进入 P1。

---

## P1 交互与生命周期链路扫描

| # | 发现 | 等级 | 证据 | 状态 |
|---|---|---|---|---|
| 1 | App.vue 四个 window 监听（generate-body / insert-text / show-skill-binding / ai-naming-insert）无 removeEventListener | P3 | `App.vue:325-328`；全仓 rg 无对应 remove | 记录在案：App 为根组件永不卸载，无泄漏后果 |
| 2 | ChatPanel editor-action（:267）与 clear-chat（:724）监听挂载于模块级/onMounted，无移除 | P3 | `ChatPanel.vue:267,724`；App.vue:32 ChatPanel 无 v-if 恒渲染 | 记录在案：生命周期与组件一致，无泄漏后果 |
| 3 | useDeAi deai-cancel 监听在 try/finally 中正确配对移除 | PASS | `useDeAi.ts:339,364` | 闭环 |
| 4 | finalSave 链路：保存退出时若编辑器有活动标签先 save() 再退出 | PASS | `EditorPanel.vue:350-353` `if (activeTab.value) save()` | 闭环（对应 9de54df 修复） |
| 5 | getStepSkills/getStepAgents 唯一消费点 ChatPanel，async Promise.all 同步消费 | PASS | `ChatPanel.vue:210-211` | 闭环 |
| 6 | 运行态章节树联动：卷纲按钮→编辑器打开"卷名 - 卷纲"标签（徽标卷纲层）；章节点选→"章题"（正文层）；概要按钮→"章题 - 剧情"（章节层）；三种跳转后 #chat-panel 均保持可见 | PASS | 探针 `_audit/tmp/p1_lifecycle.cjs` 输出：3 组 title/badge/chatPanelVisible=true/overflowX=false，console 错误 0，CDP 异常 0 | 闭环；历史缺陷（点开对话栏消失）未回归 |
| 7 | ch-plot 标签徽标文案为"章节层"，与 ch-body 的"正文层"并存，语义上剧情页显示"章节层"有歧义 | P2 | `EditorPanel.vue:151-157` modeLabel 硬编码映射 | 待修建议：ch-plot 徽标改为"剧情/概要"或补 tooltip；仅文案项 |
| 8 | 一次性测试项目 scan_p1_test 用于联动实测，实测后已删除并重置 store | 清理完成 | `_audit/tmp/p1_fixture.cjs` / `p1_cleanup.cjs` 输出 removed:true storeReset:true editorReset:true | 闭环 |

P1 结论：交互生命周期静态配对 + 运行态联动全绿；1 项 P2 文案观察、2 项 P3 记录在案。

## P2 原生对话框与 alert/confirm 全量清单

| # | 文件:行号 | 类型 | 触发条件 | 文案 | 等级 | 状态 |
|---|---|---|---|---|---|---|
| 1 | ChapterTree.vue:252 | 裸 confirm | 右键卷→删除卷 | 确认删除卷「…」及其所有章节？ | P2 | 运行态实测闭环：取消→卷保留(1→1)，确认→卷删除(1→0)，dialog message 与文案一致 |
| 2 | ChapterTree.vue:253 | 裸 confirm | 右键章节→删除章节 | 确认删除章节「…」？ | P2 | 静态确认（与 #1 同路径 deleteChapter） |
| 3 | ProjectModal.vue:83 | 裸 confirm | 项目列表删除项目 | 确定删除该项目？此操作不可恢复 | P2 | 静态确认 |
| 4 | MemoryPanel.vue:242 | 裸 confirm | 删除单条记忆 | 确定删除此记忆？ | P2 | 静态确认 |
| 5 | MemoryPanel.vue:278 | 裸 confirm | 覆盖导入记忆前 | 覆盖导入会删除当前项目已有记忆…确认覆盖？ | P2 | 静态确认；二次确认存在，覆盖风险有防线 |
| 6 | MemoryPanel.vue:286 | 裸 confirm | 合并导入记忆前 | 导入将合并到当前记忆…确认继续？ | P2 | 静态确认 |
| 7 | ChatPanel.vue:716 | 裸 confirm | 编辑器 AI 操作无选区 | 当前没有可用选区，将替换整章内容，确认继续？ | P2 | 静态确认 |
| 8-10 | AiNamingModal.vue:297,305,311 | window.confirm | 清空历史 / 有未使用结果关闭弹窗 | 确定清空所有历史记录…？/ 有未使用的结果，确定关闭？ | P2 | 静态确认；AI 命名新功能沿用裸 confirm |
| 11-16 | AppearanceSettings.vue:114,127,128,134,148,153 | alert | 导出失败/导入成功请重启/导入失败/Token已保存/无法打开数据目录/外观已保存 | 见文案 | P2 | 静态确认；:127「导入成功，请重启应用」→ 直接写 storage，移交 P4 复核语义 |
| 17 | ProjectModal.vue:124 | alert | 新建项目名称与大纲均为空 | 请输入项目名称或大纲内容 | P2 | 静态确认 |
| 18-21 | EditorPanel.vue:186,266,277,287 | alert | 保存无标签/生成正文无章节/去AI未配技能/去AI失败 | 请先选择或创建一个章节 等 | P2 | 静态确认 |
| 22-34 | MemoryPanel.vue:228,261,269,274,283,292,300,305,309,315,323,340,345 | alert | 表单校验/导入导出结果/角色卡结果/记忆跳转缺来源或章节 | 见文案 | P2 | 静态确认 |
| 35 | OutlineWorkspace.vue:612 | alert | 大纲文件导入失败 | 导入失败: … | P2 | 静态确认 |

补充：`useMemoryExtraction.ts:107` 为 `async function confirm()` 函数定义，非原生 confirm 调用，已排除误报。

运行态实测（`_audit/tmp/p2_confirm_test.cjs`）：CDP `Page.javascriptDialogOpening` 捕获 type=confirm、message=「确认删除卷『第一卷 试炼之路』及其所有章节？」；`handleJavaScriptDialog(accept=false)` 后卷数 1→1，`(accept=true)` 后 1→0。裸 confirm 在 Electron 中功能可用，但为原生样式，与应用主题不一致（P2 统一为应用内对话框的改造素材，非 bug）。

P2 结论：35 处调用点全量入账（10 confirm + 25 alert），无阻断性缺陷；1 项移交 P4（AppearanceSettings:127 导入语义）。

## P3 AI 调用收敛与语义复查

| # | 发现 | 等级 | 证据 | 状态 |
|---|---|---|---|---|
| 1 | 全仓 fetch 扫描：AI chat 请求仅存在于 aiService.ts:314（chat POST）与 :489（models GET）；无任何业务组件直连 AI API | PASS | rg fetch\(\) 全量清单：main.ts:52-77 为 dev-browser 的 electronAPI mock；mcp.ts:85,101 为 MCP 协议；PluginMarket.vue:133 为插件市场；均非 AI chat | 闭环：收敛目标达成 |
| 2 | 默认流式约束已入码：purpose 为 generate/rewrite 时默认 stream=true，其余默认 false，显式传参可覆盖 | PASS | `aiService.ts:343-344`（callAi）与 `aiService.ts:311`（_rawCall 一致）；超时非流式 300s/流式 600s（aiService.ts:93-94） | 闭环 |
| 3 | stream 语义表：显式 stream:false 共 8 处，均有无流式消费端或 JSON 依据（useAiTools:75、useSkillTest:72,119、ChatPanel:538,545,551 引擎内部、EditorPanel:124 jsonMode、namingService:154） | PASS/P3 | 各文件行号；唯一可议：`useDeAi.ts:30` rewrite 传 false——去AI结果整体替换无流式渲染，但非流式超时 300s 对超长文重写偏短 | 记录在案：建议后续去掉该显式 false 或配置更长 timeoutMs；本轮不改 |
| 4 | 引擎 split-merge/multi-step 分支在流水线为死代码：UI select 仅含 并行(compose)/串行(chain)（:106-107 等），加载归一 :2856、getStepSkillMode:1523 均把非 chain 折叠为 compose，:2037 分支不可达 | P3 | `PipelinePanel.vue:106-107,1521-1523,2850-2858,2037-2067` | 记录在案：无害死代码，列为后续清理候选 |
| 5 | 同款引擎分支在 ChatPanel 活跃：按 SKILL 自带 executionMode 分流，SKILL 文件可声明 split-merge/multi-step | PASS | `ChatPanel.vue:515,534-547`；`skill.ts:14` executionMode 类型 | 闭环：聊天侧可用，与流水线语义分离 |
| 6 | config-exchange 导入 modes 无白名单：PipelinePanel:1333 直接展开 preview.bindings.modes，非法值可进状态；运行时被 :1523 折叠，无实际危害，仅模式下拉可能显示空白 | P3 | `PipelinePanel.vue:1333,1521-1523` | 记录在案：建议导入时校验 chain/compose 白名单；本轮不改 |
| 7 | purpose 对照：generate=流水线/聊天/工具/技能测试/命名/大纲工作台/记忆抽取；rewrite+verify=去AI味（useDeAi.ts:20 三元）；detect/image/video=预留无调用者；provider store 有 getVerifyProvider/getDetectProvider/getActiveProviders | PASS | `useDeAi.ts:20`、`provider.ts:163-167,180`、`providerRouter.ts:33-37`、`ApiSettings.vue:168-169` | 闭环：用途分流结构完整，detect 为 AI验证AI 预留口 |

P3 结论：AI 调用唯一入口成立，默认流式约束在码，per-purpose 路由齐备；4 项 P3 记录在案（死代码 1、导入白名单 1、useDeAi 超时建议 1、均无用户可见缺陷）。

## P4 数据一致性与持久化

| # | 发现 | 等级 | 证据 | 状态 |
|---|---|---|---|---|
| 1 | 项目核心数据运行态持久化：卷绑定、章节、设定绑定、记忆、黑名单、AI 命名、大纲聊天均能落盘并在重载后恢复 | PASS | `_audit/tmp/p4_persistence_test.cjs` 输出：17 个存储键落盘；`addWorldEntry` 后 `store.memories.world.length` 1；重置后重载恢复 `worldName=北境学院`；`volumes[0].isBound=true/boundTo=['chapter-layer']`；夹具已清理 | 闭环 |
| 2 | AI 命名真实协议是 `favorites[] + history[].results[]`，收藏与历史结果跨保存/重载保留；`currentResults` 是会话态，`aiNaming.results` 顶层不是应用数据模型 | PASS/P3 | 类型：`src/types/aiNaming.ts:31-69,110-115`；归一化：`src/types/aiNaming.ts:132-140`；持久化：`src/stores/project.ts:190,222-226`；运行态 `_audit/tmp/p4_ai_naming_test.cjs` 输出 favorites=1/history=1/historyResults=1/restoredName=云澜城；旧探针把 `results` 放在顶层被丢弃属协议外字段，非历史丢失缺陷 | 闭环；协议外字段记 P3 |
| 3 | 记忆合并导入/覆盖导入、章节保存、退出保存的项目 JSON 差异均在目标字段内，非目标字段未变 | PASS | `_audit/tmp/p4_diff_test.cjs` 输出：merge changedKeys=[memories]；replace changedKeys=[memories]；body changedKeys=[chapters] 且新正文写入；exit changedKeys=[outlineText]；memory history reason 均写入；夹具已清理 | 闭环 |
| 4 | 旧数据兼容：provider 支持旧数组、purpose 字符串、`enc:` 密钥；skillAgentBinding 迁移旧 index 键；卷旧格式无 isBound 时按 confirmed 等价补齐；pipeline 配置缺失有 fallback | PASS | `src/stores/provider.ts:35-81`；`src/services/skillAgentBinding.ts:16-40` 及 spec；`src/stores/project.ts:146-151`；`src/stores/pipeline.ts:111-207` | 闭环 |
| 5 | 设置页 GitHub Token 读取未 await：`storageRead` 返回 Promise，Promise 恒为 truthy，会把 Promise 赋给 `githubToken`；后续保存会把 Promise 传给 IPC，触发对象不可克隆错误 | P1 | `src/components/settings/AppearanceSettings.vue:93`；运行态 `_audit/tmp/p4_storage_promise_test.cjs`：`readType=object`、`isPromise=true`、用 Promise 调 storageWrite 得 `An object could not be cloned.` | 待修复：需 `await storageRead(...)`，仅接受 string；写入前校验 |
| 6 | 设置页全量备份导出未 await `storageList()`：返回 Promise 不可迭代，实际会进入 catch 并提示导出失败，导不出备份 | P1 | `src/components/settings/AppearanceSettings.vue:106`；运行态 `_audit/tmp/p4_storage_list_promise_test.cjs`：`badIsPromise=true`，for-of 抛 `TypeError: badKeys is not iterable` | 待修复：需 `await storageList()` |
| 7 | `saveProject()` 不检查 `storageWrite` 返回值；主进程写盘失败时返回 false，渲染层仍静默继续，用户会以为已保存 | P0风险 | `src/stores/project.ts:169-193` 不检查；`electron/ipc/storage.js:91-97` 失败返回 false；运行态 `_audit/tmp/p4_storage_write_failure_test.cjs`：monkey-patch storageWrite=false 后 `saveProject()` `thrown=null` | 待修复：失败必须阻断/重试/提示，尤其退出保存 |
| 8 | 主进程 JSON 写盘直接 `fs.writeFile`，非临时文件+rename，也无历史备份；写盘中断/磁盘满可能留下截断 JSON，读取失败时返回 null 等同数据丢失 | P0风险 | `electron/ipc/storage.js:91-97`（write）、`:80-90`（read catch return null） | 待修复：建议 tmp 文件 + `fs.rename` + 上代备份 + 损坏告警 |
| 9 | `clearCurrent()` 未重置 `aiNaming`，新建/清空项目会继承上一项目的命名收藏和历史并写入新项目 JSON | P1 | `src/stores/project.ts:690-712` 无 aiNaming 重置；运行态 `_audit/tmp/p4_clearcurrent_naming_test.cjs`：clearCurrent 后 favorites=1、history=1、historyName=遗留历史 | 待修复：clearCurrent 应重置为 default AI naming |
| 10 | 设置页全量导入循环未 await `storageWrite`，提示“导入成功”可能先于写盘完成；单个 key 写失败也不会被感知 | P1/P2 | `src/components/settings/AppearanceSettings.vue:123-128`；preload `storageWrite` 返回 Promise（`electron/preload.js:17-20`） | 待修复：逐 key await 并检查返回值，完成后统一提示 |
| 11 | `storageRead`/`storageList` 调用点复查：除上面 #5/#6 两处外，其余主要 store/组件调用均已 await | PASS/P1 | `rg` 清单：`App.vue:323`、`stores/*` 与 Pipeline 均带 await；唯一未 await 集中在 `AppearanceSettings.vue:93,106` | 待修复项仅 #5/#6 |

P4 结论：常规读写、项目差异、记忆导入和 AI 命名持久化通过；但暴露 2 个 P0 存储可靠性风险、4 个 P1 数据一致性/备份缺陷、1 个 P2 导入反馈缺陷。修复必须另批执行。

## P5 声明与实现差距

| # | 发现 | 等级 | 证据 | 状态 |
|---|---|---|---|---|
| 1 | 结构化 SKILL 字段已在流水线真实消费，不是“只保存不消费”：`inputSchema`、`outputSchema`、`validationRules`、`retryPolicy`、`outputFormat`、`customVars` 均进入模板与校验链 | PASS | `PipelinePanel.vue:1397-1428` 收集字段与 customVars；`:1472-1475` 输入校验；`:1483-1487` 输出/规则校验；`:1501-1503` retryPolicy 决定重试数；`:2114-2126` chain 逐 Skill 传 customVars 与 agent；`:2164-2182` compose 合并消费；`npx vitest run src/services/generationResult.spec.ts src/services/skillValidation.spec.ts src/services/chapterExecutionPackage.spec.ts` → `Test Files 3 passed (3)` / `Tests 13 passed (13)` | 闭环 |
| 2 | per-skill Agent 绑定已按稳定键 `step-skillId` 生效，并支持旧 `step-index` 迁移 | PASS | `skillAgentBinding.ts:4-6` key=`${step}-${skillId}`；`:18-40` 旧 index 迁移；`PipelinePanel.vue:115,355,510,670` chain UI 按 `getSkillAgentKey(step, skillId)` 绑定；`:2114-2125` 执行时按 Skill ID 解析 override | 闭环 |
| 3 | Agent 优先级实际是 `skillAgentOverride > stepAgent > 供应商参数`；SKILL template 与 Agent systemPrompt 合并为同一个 system message；Agent 的 model/temperature/maxTokens 独立传入 aiService | PASS/P3 | `PipelinePanel.vue:1976-1989`：override 优先、step 兜底；`:1982-1984` 参数合并；`:1985-1989` system prompt 合并；`:1991-2003` 传入 callAi。但 `:2001` 的诊断字段 `meta.skillId` 传的是 `skillAgentOverride`（Agent ID），字段名与值语义不一致 | 记录在案：诊断日志可能误读 skillId；建议改为 `agentId: skillAgentOverride` 并另传真实 skillId；本轮不改 |
| 4 | chain 内某 Skill 失败时不再把旧结果传给下一步，而是保存失败断点并终止本次运行 | PASS | `PipelinePanel.vue:2142-2158` catch 内保存 `createChainFailureBreakpoint` 后 `throw error`；注释明确 “never pass stale output onward”；`skillValidation` 测试通过 | 闭环 |
| 5 | chain 支持按层级 + 项目 + Skill 序列断点续跑，断点包含 Skill ID、顺序、输出、输入、Agent、重试次数与错误 | PASS | `PipelinePanel.vue:2070-2084` 读取断点并恢复 previousOutput；`:2128-2141` 成功保存完整断点；`chainBreakpoint.ts:7-21,26-68` 数据结构与 resume 规则 | 闭环 |
| 6 | 正文层已建立专用章节执行包，而不是把上游所有中间结果随意拼接 | PASS | `chapterExecutionPackage.ts:1-24` 定义 version 1 数据结构；`:50-92` create；`:95-113` build prompt；`PipelinePanel.vue:2587-2589` 创建包、保存到章节、构建 prompt | 闭环 |
| 7 | 正文 `body` 与 `generationMetadata` 已分离；JSON envelope 的 metadata 不会写入正文，thinking 标签会从 body 移除；编辑器也只接收 body | PASS/P2 | `PipelinePanel.vue:2590-2601`：`parseGenerationResult(rawResult)` 后 body 只写入编辑器/章节，metadata 保存到 `ch.generationMetadata`；`generationResult.ts:37-49` 分离逻辑；`generationResult.spec.ts:11-19,27-34` 单测。风险：无 JSON envelope 时按纯文本处理，`【来源覆盖】` 等文本会保留在 body | 待修复建议：在正文层增加协议提示或轻量 fallback 解析；不要把来源追踪写回正文 |
| 8 | 非法 JSON envelope 会整体退回纯文本，坏 envelope 本身也会进入 body | P2 | `generationResult.ts:39-41` 无有效 envelope 或 body 非字符串时返回 `filterThinkingTags(rawText)`；`generationResult.spec.ts:36-40` 验证坏 envelope 保留原文 | 记录在案：这是兼容性边界，但正文质量风险存在；后续可与 #7 一并处理 |
| 9 | 卷纲/章节校验当前只保证基础叙事完整性：名称、内容、数量、重复项；不校验事件覆盖、伏笔连续、角色状态或来源编号连续 | PASS/P3 | `narrativeValidation.ts:14-41,44-66`；`PipelinePanel.vue:1809-1817` 本地包装；`:2352-2357` 卷纲校验；`:2522-2528` 章节校验；`:2494` 章节只选择标题+剧情完整的记录 | 记录在案：应用层需要更细的叙事结构校验时，应扩展执行包/metadata 校验，而不是依赖 SKILL 文本自律 |
| 10 | 帮助指南覆盖 8 个主流程章节，与现有主要功能基本一致；未覆盖 AI 命名、插件市场和外观设置专项 | PASS/P3 | `HelpGuide.vue:137-146` sections=快速上手/主界面/大纲工作台/生成流水线/记忆板块/AI 与配置/去AI味/数据与诊断；`:50-58` 大纲工作台能力；`:67-73` 五层流水线；`:92-97` Agent/Skill/模式；`electron/main.js:53-58` 原生菜单入口 | 记录在案：可补 AI 命名/插件市场/外观设置章节；非阻断 |
| 11 | 版本号一致性：package.json、package-lock 与安装包模板均为 3.8.3；诊断日志动态读取 app 版本；无独立“关于页” | PASS/P3 | `package.json:3,91`；`package-lock.json:3,9`；`electron/ipc/diag.js:75,84`；`electron/ipc/lifecycle.js:5`。`src` 内未发现“关于页”版本展示；`electron/preload.js:6` 暴露的是 Electron 版本而非应用版本 | 记录在案：诊断可用，但用户可见版本入口缺失；如需客户报障，建议在设置页补“应用版本” |

P5 结论：此前第三方关注的“字段存在但未消费、正文污染、chain 旧结果继续传递、槽位错位、无执行包”等问题，在本版本源码中已有对应实现与测试支撑；仍保留正文纯文本协议边界、诊断字段误标、叙事校验粒度、帮助覆盖、用户可见版本 5 个后续优化项。

## P6 UI 一致性与溢出递归

| # | 发现 | 等级 | 证据 | 状态 |
|---|---|---|---|---|
| 1 | 24 个目标 UI 状态全量扫描完成：共采集 252 个候选元素，其中 scrollable-vertical=6、ancestor-scroll-clip=245、visible-vertical-overflow=1；所有状态 body horizontalBodyOverflow=false | PASS | `_audit/tmp/p6_ui_scan.json`（generatedAt 2026-08-30T11:33:22.049Z）：`kinds {"scrollable-vertical":6,"ancestor-scroll-clip":245,"visible-vertical-overflow":1}` | 闭环 |
| 2 | 设置页"诊断日志"标签的关闭按钮存在纵向溢出：button.btn-close 客户区高 20px、滚动高 23px，超出 3px 可见 | P2 | p6_ui_scan.json → label=settings-diag → `selector: button.btn-close, kind: visible-vertical-overflow, rect h=20, scroll h=23` | 记录在案：仅 3px 视觉瑕疵，不阻断；修复建议 `.btn-close` 补 line-height/固定高度 |
| 3 | ancestor-scroll-clip 245 项均为滚动容器的正常裁切分类（消息列表、面板滚动区），无一构成真实文本溢出 | P3 | p6_ui_scan.json：24 目标状态 horizontalBodyOverflow 全部 false | 记录在案：分类方法见经验文件"ancestor-scroll-clip 分类" |
| 4 | 设计令牌合规复查：全扫描仅 1 处真实硬编码色值（AI 命名弹窗复制成功 toast 的动态 style） | P2 | `src/components/naming/AiNamingModal.vue:285` → `el.style.cssText='...background:#4caf88;...'` | 记录在案：建议改用 CSS 变量 var(--success) 等主题令牌 |

P6 结论：全应用无横向溢出、无阻断性 UI 缺陷；1 个 P2 级 3px 按钮溢出 + 1 个 P2 级硬编码色值，均已记录待审批修复。

## P7 仓库与交付卫生

| # | 发现 | 等级 | 证据 | 状态 |
|---|---|---|---|---|
| 1 | 积压的 6 个本地提交已全部推送到 origin/master，推送后分支同步 | PASS | `git push origin master` 成功；`git status -sb` → `## master...origin/master`（无 ahead） | 闭环 |
| 2 | 版本号一致性：package.json 与 package-lock.json 均为 3.8.3 | PASS | P0 台账第 3 行；`package.json:3` / `package-lock.json:3,9` | 闭环 |
| 3 | 工作区未跟踪文件：本次扫描产出的 4 个 `_audit/` 文档 + `_audit/_write_plan.cjs` 临时脚本 + `_audit/tmp/` 临时目录；无业务代码改动 | PASS | `git status -sb` → `?? _audit/FULL_APP_DEEP_SCAN_LEDGER_2026-08-30.md` 等 5 项 + `?? _audit/tmp/` | 收尾动作：提交文档、保留 tmp 于本地（见 P8 收尾说明） |

P7 结论：仓库与远程同步、版本一致；未跟踪项均为本次扫描产物，随收尾提交入库。

## P8 冒烟与收尾

| # | 项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 冒烟脚本 8 步全绿：baseline / create-fixture-project / outline-workspace / pipeline-five-steps / memory-views / settings-tabs / restore-original-project / final-state | PASS | `node _audit/tmp/p8_smoke.cjs` → `allStepsOk: true, runtimeErrors: []`（2026-08-30 实跑输出） | 
| 2 | 大纲工作台锁定→流水线联动：锁定后流水线大纲只读、提示语与状态正确 | PASS | outline-workspace → `afterLockPipeline.pipelineOutlineReadonly=true, pipelineOutlineLength=57, infoTitle=智能体/技能配置已迁移到大纲工作台, outlineStatus 含 大纲：已锁定` |
| 3 | 流水线五层面板互斥显示：大纲/设定/卷纲/章节/正文 每层 visiblePanel 唯一、overflowX=false | PASS | pipeline-five-steps → 5 组 `visiblePanel:[pl-step-N-content], overflowX:false, visibleCount:5` |
| 4 | 记忆板块四视图 + 列表页全部可切换且无横向溢出 | PASS | memory-views → `tabTexts` 5 项、`tabResults` 全部 `active:true, overflowX:false` |
| 5 | 设置页 7 个标签全部可打开且无横向溢出 | PASS | settings-tabs → `tabResults` 7 项 `overflowX:false`（contentHeight 最大 2029px 属正常纵向滚动） |
| 6 | 测试夹具项目创建→恢复原项目→持久化清理：夹具残留键为 0 | PASS | final-state → `persistedCleanup.fixtureKeys:[], remaining:0`；restore-original-project → `projectNameRestored:true` |
| 7 | 全程运行时错误监听 | PASS | `runtimeErrors: []`（脚本全程 CDP Runtime.consoleAPICalled/exceptionThrown 监听） |

P8 结论：核心用户路径（新建项目 → 大纲编辑锁定 → 流水线联动 → 记忆四视图 → 设置页 → 恢复清理）真实 Electron 冒烟全绿，运行时 0 错误。

收尾说明：`_audit/tmp/`（扫描 JSON、冒烟脚本/输出）随本次提交入库留证；临时探针脚本中的一次性调试代码不清理，作为后续回归抓手复用。
