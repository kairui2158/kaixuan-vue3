# 2026-09-17 生产接线成熟化 V2 执行方案

## 方案成熟度

**方案成熟度：成熟。**

依据：

1. 工具层：`dialogueFoundation.ts:153-178` 已有权限与工具面单源；`editorTools.ts:286` 已有统一执行器。
2. 应用方案：调研报告给出 semantic-router、Roo Code、knip、dependency-cruiser 四个源码级成熟范式。
3. 实现接线：本方案明确列出当前全部生产调用点，`ChatPanel.vue:2508/2557`、`OutlineWorkspace.vue:1181/2326/2352`。
4. 验证标准：每阶段都有命令、预期和失败处置，不依赖 mock 声明。

断点说明：本方案是“门禁与接线成熟化”，不改变 discuss 只读 / edit 直写的产品语义。

补充成熟度（生产接入后）：方案为 **成熟，已执行**。Phase 2.3 词库已通过 `src/services/chainIntentPhraseCorpus.ts` 接入生产路由，`chainIntentRouter.ts` 只消费该单源词库；`phrase-corpus-saturated.json` 保留为生成与审核依据。

## 目标

1. 把“修 A 时 B 仍用旧假设”变成机器红灯。
2. 意图路由达到 semantic-router 的成熟形态：单源语料、每路由阈值、独立评估脚本、no-match 显式化。
3. 工具面权限达到 Roo Code 形态：组件只能消费统一服务，不能自建工具面。
4. 旧链路清理达到 knip / dependency-cruiser 形态：unused、orphan、forbidden、reachable 全部机器化。

## Phase 0：门禁先行

1. 经验文件新增 M26 旧假设清零门禁（已完成）。
2. 新增 `scripts/evaluate-chain-intent-router.mjs`：
   - 直接 import `src/services/chainIntentCorpus.ts` 的单源语料。
   - 分别评估 `classifyChainIntent()` 与 `routeChainIntent()`。
   - 输出 total、correct、accuracy、误判样本、no-match/ambiguous 样本。
   - 准确率低于 100% 时 exit 1。
3. `package.json` 新增：
   - `"evaluate:chain-intent": "node scripts/evaluate-chain-intent-router.mjs"`
   - `"verify:production-wiring": "depcruise src --config .dependency-cruiser.cjs"`

验收：

```powershell
npm run evaluate:chain-intent
npm run verify:production-wiring
```

## Phase 1：工具面生产接线单源化

现状问题：`ChatPanel.vue:2508` 直接调用 `createEditorTools()`，`ChatPanel.vue:2557` 直接调用 `resolveDialogueToolSurface()`。这说明组件层仍然可以绕开统一入口自建工具面。

改造：

1. 新增 `src/services/dialogueToolSurface.ts`：
   - `buildDialogueToolSurface(entry: DialogueSurfaceEntry)` 作为唯一入口。
   - 内部统一调用 `createEditorTools()` 与 `resolveDialogueToolSurface()`。
   - 返回 `{ tools, actualToolSurface, permission }`，供请求与 trace 共享。
2. `OutlineWorkspace.vue` 与 `ChatPanel.vue` 全部改走 `buildDialogueToolSurface()`。
3. `workspaceSkillEngine.ts` 的 SKILL 路径同步复用同一入口。
4. 旧组件直接 import `createEditorTools` / `resolveDialogueToolSurface` 的代码全部删除。

验收：

```powershell
rg -n "createEditorTools\\(|resolveDialogueToolSurface\\(" src/components src/services/workspaceSkillEngine.ts
```

预期：生产组件命中 0；仅 `dialogueToolSurface.ts` 与服务层 spec 允许命中。

## Phase 2：意图路由成熟化

1. `chainIntentRouter.ts` 引入每路由阈值：
   - `ROUTE_THRESHOLDS: Record<ChainIntent, number>`。
   - 显式写入规则命中优先于阈值；阈值只管 TF-IDF 语义层。
2. 路由结果显式化：
   - `matched`、`no_match`、`ambiguous` 三态。
   - `no_match` 不再静默落 `discuss`，而是在 UI 显示“未能识别意图，请补充写入或讨论说明”。
3. 评估脚本纳入语料来源：
   - 语料集支持从 runTrace 导出的真实用户话术批量导入。
   - 每次新增语料必须同步负样本，防止“只加正样本”。
4. `plainDialogueIntent.ts`、`workspaceSkillEngine.ts` 全部消费同一路由结果结构。

验收：

```powershell
npm run evaluate:chain-intent
npx vitest run src/services/chainIntentRouter.spec.ts src/services/plainDialogueIntent.spec.ts src/services/dialogueFoundation.spec.ts
```

### Phase 2.1：中文话术语料补强

补充原因：路由机制调研不等于话术语料调研。当前单源语料只有 17 条回归样本，主要是 09-17 一次 trace 和少量位置咨询负样本，不足以支撑“最优”目标。

真实社区语料来源：

1. RiSAWOZ（terryqj0107/RiSAWOZ，EMNLP 2020）
   - 已浅克隆到 `_audit/research-cache/risawoz`，解包 `task1-data-NLU` 与 `task2-data-DST`。
   - `task2-data-DST/dst_all_train10000.json` 含约 1 万组中文对话、`transcript` 用户原话、`user_acts` 标注（Request / Inform / Select / Greeting / Bye）。
   - 可迁移的不是旅游领域词，而是用户行为句式：请求、补充条件、确认、比较、追问、感谢、结束、短承接。
2. Roo Code
   - `src/core/prompts/tools/native-tools/read_file.ts`：读工具必须说明单次范围、offset/limit、目标行锚点，避免模型乱读或重复读。
   - `src/core/prompts/tools/native-tools/edit.ts`：写前必须读、必须精确匹配 `old_string/new_string`、非唯一匹配必须扩大上下文或显式 `replace_all`。
   - `src/core/prompts/sections/tool-use-guidelines.ts`：先评估已有信息，再选工具；每一步必须消费上一步结果，不假设工具结果。
   - `src/core/prompts/sections/rules.ts`：少问用户，优先用工具自取信息；必须追问时给 2-4 个完整可执行选项；完成必须走 `attempt_completion`。
3. COIG-CQIA
   - 仓库真实存在，但 `COIG-CQIA-full.jsonl` 的 GitHub LFS 对象已 404；仅 `coig_pc/coig_pc_core_sample.jsonl` 可用。
   - 结论：不纳入本阶段主语料，避免把不可复现来源写进交付依据。

语料入库设计：

1. 新增 `src/services/chainIntentPhraseCorpus.ts`，按四类分层：
   - `editDirectives`：写入/插入/替换/同步/定稿类正样本。
   - `readOnlyQuestions`：位置咨询、状态询问、权限询问、索取参考类负样本。
   - `contextualReplies`：好的/继续/按刚才说的/谢谢你/再见等短承接。
   - `clarificationRequests`：希望、能不能、有没有、帮我看看等补充条件句式。
2. 每条语料必须带 `source`：`trace:<日期>` / `risawoz:<行为类型>` / `roo:<工具域>` / `manual:<原因>`，禁止无源语料。
3. 语料不是直接全量塞进正则，而是进入 `INTENT_CORPUS_SAMPLES` 评估集与 `INTENT_EXAMPLES` 示例库，用来调每路由阈值与负样本覆盖。
4. 从 RiSAWOZ 抽取不超过 200 条行为句式，人工清洗成写作场景后再入库；原数据不进入运行时，避免旅游领域词污染。
5. 从 Roo Code 迁移工具边界话术到工具描述层：读后写、精确匹配、非唯一失败、完成收口、追问选项化。

验收：

```powershell
npx vitest run src/services/chainIntentCorpus.spec.ts src/services/chainIntentRouter.spec.ts
rg -n "source: ''" src/services/chainIntentPhraseCorpus.ts
```

预期：语料样本不少于 120 条，其中负样本不少于 40 条；全部有 source；RiSAWOZ 派生语料不保留旅游领域实体词。

### Phase 2.2：意图路由与位置咨询词库补强

现状对账：

1. `EXPLICIT_WRITE_ACTIONS` 仅 16 个写入动词。
2. `READ_ONLY_LOCATION_PATTERN` 仅 9 个位置表达。
3. 写入状态/权限询问只有 1 条复合正则。
4. `REFERENCE_REQUEST_PATTERN` 只覆盖“给我参考/出方案/怎么写/怎么改”。
5. 没有“位置词 + 写入词”的冲突优先级表，例如“告诉我插入点在哪里”必须只读，“把这段插入第三段”必须写入。

#### 写入授权词表（editDirectives）

保留现有：写入、写进、输入进、录入、填入、填进、更新到、同步到、落实到、插入、追加、替换、重写、修改、改完、删除、删掉。

新增：

- 保存类：保存、保存到、存进、存到、落盘、落进。
- 改写类：改成、改为、改一下、调整、修订、修正、润色、精简、扩充、扩写、补上、补充到、补进去。
- 结构类：合并、拆分、移动到、上移、下移、移除、去掉、置顶、归档到。
- 收尾类：定稿、执行修改、执行方案、按方案执行、直接应用、应用到编辑器、写回、回填。

#### 位置咨询词表（readOnlyQuestions）

保留现有：在哪里、在哪儿、哪段、哪个位置、什么位置、放在哪、插入点、定位到、帮我定位。

新增：

- 泛位置：在哪个、哪一部分、哪一块、哪一处、哪个地方、哪个章节、哪一节、哪个节点、哪个段落、第几段、第几行、第几节。
- 目标询问：应该放哪、该放哪、适合放在、适合插在、要放在、要插在、归到哪个、挂到哪个。
- 展示请求：标出位置、高亮位置、显示位置、展示位置、指出位置、找一下位置、看一下上下文、看前后文、跳到那里、滚动到那里、光标放到。
- 工具语义：锚点、目标片段、目标节点、候选位置、上下文窗口。

#### 状态与权限词表（readOnlyStatus）

- 权限询问：有没有写入权限、有权限吗、能不能写、可以直接写吗、允许修改吗、编辑器可写吗。
- 状态询问：写了吗、写入了吗、改好了吗、保存了吗、有没有写进去、为什么没写入、为什么没改、什么时候写、什么时候改、现在到哪一步了。
- 禁写声明：先不写、先别写、先别改、只讨论、只看不改、先不要动、先给方案。

#### 参考索取词表（readOnlyReference）

保留现有：给我参考、给我看看、出修改文案、出替换、出方案、怎么写、如何写、怎么改。

新增：给我建议、给个思路、给几个选项、给我示范、给我示例、给我草稿、先出文案、先列方案、比较一下、帮我选、哪个更合适、给我看一版。

#### 意图关键词表补强

- analyze：排查、复核、审视、找问题、挑毛病、找漏洞、找矛盾、检查一致性、校验时间线、逻辑自洽吗、有没有断层、风险点。
- generate：起草、写一版、出一版、生成一版、续写、扩写、整理成、输出成、成稿。
- discuss：你觉得、怎么看、要不要、是否、有没有可能、我们商量、我有个想法、我不确定、你怎么看这个。

#### 冲突优先级（必须按序判定）

1. 状态/权限询问：`你写入了吗`、`有写入权限吗` -> discuss。
2. 禁写声明：`先别写`、`只讨论` -> discuss。
3. 位置咨询：`插入点在哪里`、`应该放哪` -> discuss + editor.reveal_location。
4. 参考索取：`先出方案`、`给我建议` -> discuss。
5. 显式写入指令：`把这段插入第三段`、`保存到编辑器` -> edit + editor.write。
6. 关键词/TF-IDF 兜底。

验收反例：

```text
告诉我插入点在哪里 -> discuss
把这段插入第三段 -> edit
你写入了吗 -> discuss
直接写入编辑器 -> edit
帮我定位这句话 -> discuss
定位到第三段后插入这段 -> edit
先不要写，只给我方案 -> discuss
把方案直接应用到编辑器 -> edit
```

### Phase 2.3：词库饱和矩阵（第五轮补齐）

背景：前三轮补词仍以“已有思路扩写”为主，未达到用户要求的“补到不能再补”。第四轮已把 RiSAWOZ 全量数据、Roo Code 工具话术、本仓 trace、写作领域枚举四面交叉。第五轮继续追加 CrossWOZ 与 COIG-CQIA 两个真实中文语料源，补足位置归属、权限状态、礼貌请求、对比选择、解释说明、条件约束六类缺口。

#### 数据来源与证据

1. RiSAWOZ `dst_all_train10000.json`：10000 组对话、67290 条用户话轮，行为分布 Request 44965 / Inform 26509 / General 9768 / Bye 9439 / Greeting 8173。已抽取 45 类句式骨架、问句尾缀和短承接。提取脚本与统计输出见 `_audit/research-cache/risawoz/extract-phrase-skeletons.cjs` 和 `phrase-skeleton-summary.json`。
2. Roo Code：读后写、精确匹配、非唯一失败、完成收口、追问选项化，用于工具边界和状态话术。
3. 本仓 trace 与既有语料：2026-09-17 直写失效原话、chainIntentCorpus 17 条回归样本。
4. 写作领域枚举：长篇小说结构位置、状态权限、参考索取、澄清条件、短承接。
5. CrossWOZ `train.json`：5012 组对话、42346 条用户话轮。只迁移 Request/Inform/Select 的中文行为句式，不迁移酒店、景点、餐馆等旅游领域实体。
6. COIG-CQIA `zhihu_score9.0-10_clean_v10.jsonl`：2561 条高质量中文 instruction。只迁移通用解释、比较、追问、说明句式，不迁移平台领域内容。

#### 饱和词库矩阵

完整矩阵见 `_audit/phrase-corpus-saturated.json`。生产常量已生成到 `src/services/chainIntentPhraseCorpus.ts`；后续扩词必须先更新矩阵并通过饱和审计，再同步生成运行时常量，禁止在组件或路由内手抄词表。

| 类别 | 词数 | 分组 |
|---|---:|---|
| editDirectives | 148 | strong-write-actions 50、weak-write-actions 49、write-intensifiers 19、write-targets 30 |
| readOnlyLocation | 272 | interrogative-location 118、structural-anchors 61、location-request-verbs 93 |
| readOnlyStatusPermission | 311 | permission-questions 72、status-questions 119、prohibition-rollback 120 |
| readOnlyReference | 249 | request-reference 119、how-to-questions 49、preview-and-explain 81 |
| contextualReplies | 87 | affirmative 37、continuation 30、closing 20 |
| clarificationRequests | 227 | desire-and-preference 86、interrogative-modal 70、discourse-continuation 71 |
| intentKeywords | 246 | analyze 81、generate 78、discuss 87 |

总计：**1540 个词/短语、22 个分组、246 条验收样本**。相比现有生产实现，写入动作从 16 扩到 148，位置表达从 9 扩到 272，状态/权限从 1 条复合正则扩到 311。

审计同时记录 **175 条同类别长短语式共存**（如“写入/确认写入”、“在哪里/放在哪里合适”）。这不是缺陷：匹配器必须先按最长命中归类，再用短语式兜底；审计只把它作为饱和度观测输出，不作为 `problems` 阻断项。真正的阻断项是跨类别重复和权限层串词。

#### 判定规则升级

Phase 2.2 的六层优先级升级为七层，且每层有明确护栏：

1. 状态/权限询问 -> discuss。
2. 禁写/撤销/回滚 -> discuss。
3. 位置咨询 -> discuss + `editor.reveal_location`。
4. 参考索取 -> discuss。
5. 显式写入 -> edit + `editor.write`；强写入动词直接命中，弱写入动词必须同时命中目标对象或强化修饰语。
6. 意图关键词 -> analyze/generate/discuss/edit。
7. TF-IDF 兜底 -> matched/no_match/ambiguous，无信号时显式 no_match。

同词冲突必须通过“层级优先”而不是删除词解决：

```text
告诉我插入点在哪里 -> discuss + reveal_location
把这段插入第三段 -> edit + write
你写入了吗 -> discuss
现在把这段写入编辑器 -> edit
先不要写 -> discuss
把方案直接应用到编辑器 -> edit
```

#### 饱和判定门

1. 机器审计脚本 `scripts/audit-phrase-corpus-saturation.cjs` 必须输出 `problems: []`，否则词库不允许接入生产。
2. 审计必须同步输出 `containmentObservationCount`，用于观察长短语式覆盖；同类别包含不等于错误，生产匹配器必须实现最长命中优先。
3. 六源交叉完成后，新增词必须先回答“来自哪一源、为什么现有词无法覆盖”，否则禁止加入。
4. 每个分组必须有 source；无 source 视为无效词。
5. 跨类别同词必须消除或明确降级为受控歧义词；当前矩阵已消除全部跨类别重复。
6. 验收样本必须覆盖：显式写入 50、位置咨询 59、状态/权限/禁写 49、参考索取 49、澄清/短承接 39，共 246 条。

#### 生产接入状态与边界

1. 已接入：`src/services/chainIntentRouter.ts` 通过 `chainIntentPhraseCorpus.ts` 消费饱和词库；`chainIntentCorpus.ts` 只保留验收样本与评估器，不再承担生产词表职责。
2. `classifyChainIntent()` 与 `routeChainIntent()` 共享 `findSaturatedPhrases()` 单源，最长命中优先。
3. 每次扩词必须同步扩充验收样本，并保持 `scripts/audit-phrase-corpus-saturation.cjs` 输出 `problems: []`。
4. RiSAWOZ 派生词只保留句式骨架，不保留旅游领域实体词。

## Phase 3：依赖图门禁

新增 `.dependency-cruiser.cjs`，规则：

1. `ui-no-direct-tool-executor`：`src/components/**` 禁止依赖 `src/services/editorTools`，必须走 `dialogueToolSurface`。
2. `ui-no-direct-surface`：`src/components/**` 禁止直接 import `resolveDialogueToolSurface`。
3. `eval-must-use-corpus`：`scripts/evaluate-chain-intent-router.mjs` 必须依赖 `chainIntentCorpus`。
4. `legacy-tool-forbidden`：生产代码禁止 `editor.propose_edits`、`pending_user_confirmation` 字符串 reachable。
5. `orphan-error`：`src/services` 孤儿模块报 error。

验收：

```powershell
npm run verify:production-wiring
```

## Phase 4：验证矩阵

| 层 | 验证 |
|---|---|
| 类型 | `npm run type-check` |
| 单测 | `npm run test:services` |
| 路由评估 | `npm run evaluate:chain-intent` |
| 依赖门禁 | `npm run verify:production-wiring` |
| 构建 | `npm run build:vue` |
| E2E | 大纲明确写入、主页明确写入、discuss 只读、no-match 提示、工具循环收敛 |
| Trace | turn/API/event 三层 `actualToolSurface` 一致 |
| 交付 | asar 内版本号、脚本、依赖图配置均存在 |

## 风险与防护

| 风险 | 防护 |
|---|---|
| 统一入口改变现有行为 | 先跑全部服务测试，再跑三入口 E2E |
| no-match 影响旧用户习惯 | 显式规则命中优先，只有完全无信号才提示 |
| 依赖图规则误报 | 规则只限制生产组件，spec 允许直接测服务 |
| 评估集过拟合 | 语料必须包含负样本、位置咨询样本、短答复样本 |
| 社区语料领域污染 | RiSAWOZ 只抽行为句式并人工清洗，不直接导入领域词 |
| 语料来源不可复现 | COIG-CQIA LFS 失效文件不纳入，来源必须可克隆可解包 |

## 执行顺序

1. 评估脚本。
2. `dialogueToolSurface` 单源入口。
3. 两个组件与 SKILL 引擎改接线。
4. 每路由阈值与 no-match 语义。
5. dependency-cruiser 规则。
6. 全量验证矩阵。
7. 回头看：重新执行 `rg` 调用点盘点，确认无第三入口。
