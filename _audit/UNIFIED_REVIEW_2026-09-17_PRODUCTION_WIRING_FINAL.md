# 2026-09-17 生产接线成熟化统一审核稿

## 方案成熟度

**方案成熟度：成熟，可执行。**

按 M18 分层评估：

| 层 | 结论 | 依据 |
|---|---|---|
| 执行器/工具层 | 成熟 | `editorTools.ts:286` 已有统一执行器；`dialogueFoundation.ts:153` 已有权限面函数；相关 spec 已存在 |
| 应用方案/交互闭环 | 成熟 | 七层判定、discuss 只读、edit 直写、no_match 显式提示、工具循环收敛均已有明确语义 |
| 实现接线 | 已接入生产 | 主页、大纲工作台、workspace SKILL 引擎统一经 `dialogueToolSurface` 授权；依赖门禁已启用 |
| 验证标准 | 成熟 | 词库审计、路由评估、依赖门禁、服务测试、E2E、trace 对账均给出命令与通过标准 |

生产状态声明：饱和词库与意图路由已接入生产，组件层旧直连入口由 `.dependency-cruiser.cjs` 阻断。

## 统一结论

本方案合并以下已确认内容：

1. 生产接线成熟化 V2 方案：`_audit/PROPOSAL_2026-09-17_PRODUCTION_WIRING_MATURITY_V2.md`
2. 社区调研结论：`_audit/RESEARCH_2026-09-17_PRODUCTION_WIRING_MATURITY.md`
3. 第五轮饱和词库：`_audit/phrase-corpus-saturated.json`
4. 审计门禁：`scripts/audit-phrase-corpus-saturation.cjs`
5. 经验门禁：M17 回头看、M18 方案成熟度、M21 意图语料单源、M26 旧假设清零

统一后的目标只有一个：把“修 A 时 B 还在用旧假设”从人工记忆变成机器红灯，同时把 API 直写的意图识别从 16 个写入词、9 个位置词的初级形态，升级为 1642 词、七层优先级、独立评估门禁的成熟形态。

## 当前状态对账

### 已闭环

1. 饱和词库：1642 词、22 分组、246 验收样本。
2. 审计结果：`problems: []`，`containmentObservationCount: 204`。
3. 数据来源：RiSAWOZ 67290 用户话轮、CrossWOZ 42346 用户话轮、COIG-CQIA 2561 条 instruction、Roo Code 工具话术、本仓 trace、写作领域枚举。
4. 审计语义：同类别长短语式共存是设计要求，匹配器必须最长命中优先；这不是错误。

### 当前执行状态

以下为当前仓库真实状态，均已用机器命令对账：

1. `ChatPanel.vue`、`OutlineWorkspace.vue`、`workspaceSkillEngine.ts` 均已通过 `dialogueToolSurface` 单源入口取得工具面；组件直接 import `editorTools` 为 0 命中。
2. `chainIntentRouter.ts` 已接入 `chainIntentPhraseCorpus.ts` 饱和词库，旧 `EXPLICIT_WRITE_ACTIONS` / `READ_ONLY_LOCATION_PATTERN` 生产矩阵为 0 残留。
3. `package.json` 已有 `sync:phrase-corpus`、`verify:phrase-corpus-sync`、`evaluate:chain-intent`、`verify:production-wiring` 四条脚本。
4. `.dependency-cruiser.cjs` 已存在并生效，`npm run verify:production-wiring` 通过。
5. `scripts/evaluate-chain-intent-router.mjs` 已存在；classification 17/17，routing 17/17。
6. E2E 已内置 `assertFreshRendererBuild()`：源码模式启动前校验 `dist-renderer` bundle 均新于全部 `src` 源文件、`package.json`、lockfile 与 Vite 配置，旧构建直接拒绝执行，防止拿旧 bundle 制造假验证。

## Phase 0：门禁先行

### 0.1 意图路由评估脚本

新增 `scripts/evaluate-chain-intent-router.mjs`：

1. 直接 import `src/services/chainIntentCorpus.ts` 单源语料。
2. 分别评估 `classifyChainIntent()` 与 `routeChainIntent()`。
3. 输出 total、correct、accuracy、误判样本、no_match 样本、ambiguous 样本。
4. 准确率低于 100% 时 exit 1。
5. 禁止 mock 中间态；评估对象必须是真实导出函数。

### 0.2 package 脚本

`package.json` 新增：

```json
{
  "sync:phrase-corpus": "node scripts/sync-chain-intent-phrase-corpus.cjs",
  "verify:phrase-corpus-sync": "node scripts/verify-phrase-corpus-sync.cjs",
  "evaluate:chain-intent": "node scripts/evaluate-chain-intent-router.mjs",
  "verify:production-wiring": "depcruise src --config .dependency-cruiser.cjs"
}
```

验收命令：

```powershell
npm run evaluate:chain-intent
npm run verify:production-wiring
```

## Phase 1：工具面生产接线单源化

新增 `src/services/dialogueToolSurface.ts`：

1. `buildDialogueToolSurface(entry: DialogueSurfaceEntry)` 作为唯一入口。
2. 内部统一调用 `createEditorTools()` 与 `resolveDialogueToolSurface()`。
3. 返回 `{ tools, actualToolSurface, permission }`。
4. 真实 API 请求与 runTrace 共用同一份返回值，满足 M19。

改造调用点：

1. `ChatPanel.vue:2508`
2. `ChatPanel.vue:2557`
3. `OutlineWorkspace.vue:1181`
4. `OutlineWorkspace.vue:2326`
5. `OutlineWorkspace.vue:2352`
6. `workspaceSkillEngine.ts` 的 SKILL 路径同步复用同一入口。

清理规则：

1. 生产组件禁止直接 import `createEditorTools`。
2. 生产组件禁止直接 import `resolveDialogueToolSurface`。
3. spec 允许直接测服务层，不受该规则限制。

验收命令：

```powershell
rg -n "createEditorTools\(|resolveDialogueToolSurface\(" src/components src/services/workspaceSkillEngine.ts
```

通过标准：生产组件命中 0；仅 `dialogueToolSurface.ts` 与服务层 spec 允许命中。

## Phase 2：意图路由成熟化

### 2.1 单源词库接入

新增 `src/services/chainIntentPhraseCorpus.ts`：

1. 从 `_audit/phrase-corpus-saturated.json` 生成运行时常量。
2. `classifyChainIntent()` 与 `routeChainIntent()` 必须共享同一词库单源。
3. 禁止组件复制词表。
4. 保留每条词的 source 标签，供评估与 trace 诊断。
5. 长短语式必须最长命中优先，短语式只做兜底。

### 2.2 七层判定优先级

按以下顺序执行，禁止调换：

1. 状态/权限询问 -> discuss。
2. 禁写/撤销/回滚 -> discuss。
3. 位置咨询 -> discuss + `editor.reveal_location`。
4. 参考索取 -> discuss。
5. 显式写入 -> edit + `editor.write`；强写入动词直接命中，弱写入动词必须同时命中目标对象或强化修饰语。
6. 意图关键词 -> analyze/generate/discuss/edit。
7. TF-IDF 兜底 -> matched/no_match/ambiguous。

验收反例：

```text
告诉我插入点在哪里 -> discuss + reveal_location
把这段插入第三段 -> edit + write
你写入了吗 -> discuss
现在把这段写入编辑器 -> edit
先不要写 -> discuss
把方案直接应用到编辑器 -> edit
```

### 2.3 每路由阈值

1. 新增 `ROUTE_THRESHOLDS: Record<ChainIntent, number>`。
2. 显式规则命中优先于阈值；阈值只管 TF-IDF 语义层。
3. 无信号时显式 `no_match`，不静默落 discuss。
4. UI 显示“未能识别意图，请补充写入或讨论说明”。

### 2.4 语料与负样本

1. `INTENT_CORPUS_SAMPLES` 扩展到 246 条验收样本。
2. 显式写入 50、位置咨询 59、状态/权限/禁写 49、参考索取 49、澄清/短承接 39。
3. 新增词必须带 source，并回答“现有词为何不能覆盖”。
4. RiSAWOZ/CrossWOZ 派生词只保留行为句式，不保留旅游领域实体。

## Phase 3：依赖图门禁

新增 `.dependency-cruiser.cjs`，规则：

1. `ui-no-direct-tool-executor`：`src/components/**` 禁止依赖 `src/services/editorTools`。
2. `ui-no-direct-surface`：`src/components/**` 禁止直接 import `resolveDialogueToolSurface`。
3. `eval-must-use-corpus`：评估脚本必须依赖 `chainIntentCorpus`。
4. `legacy-tool-forbidden`：生产代码禁止 `editor.propose_edits`、`pending_user_confirmation` reachable。
5. `orphan-error`：`src/services` 孤儿模块报 error。

验收命令：

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
| E2E | 大纲明确写入、主页明确写入、discuss 只读、no_match 提示、工具循环收敛 |
| Trace | turn/API/event 三层 `actualToolSurface` 一致 |
| 交付 | asar 内版本号、脚本、依赖图配置均存在 |

E2E 硬门禁：

1. 不得用 mock 强制返回工具调用。
2. 必须验证“入口 -> API 请求 -> 工具面 -> 执行器 -> UI 可感知结果”。
3. 必须同时断言 turn 与 API call 的 `actualToolSurface`。
4. 必须覆盖拒绝路径：discuss 不暴露写工具、no_match 不静默写、ambiguous 不写入。
5. 必须先 `npm run build:vue`，禁止读取旧 dist 制造假验证。

## 风险与防护

| 风险 | 防护 |
|---|---|
| 统一入口改变现有行为 | 先跑全部服务测试，再跑三入口 E2E |
| no_match 影响旧用户习惯 | 显式规则命中优先，只有完全无信号才提示 |
| 1642 词拖慢路由 | 词表按类别预编译，最长命中优先，输入只做一次归一化 |
| 依赖图规则误报 | 规则只限制生产组件，spec 允许直接测服务 |
| 评估集过拟合 | 语料必须包含负样本、位置咨询样本、短答复样本 |
| 社区语料领域污染 | 只迁移行为句式，不导入酒店/景点/平台实体 |
| 语料来源不可复现 | COIG-CQIA LFS 失效文件不纳入，来源必须可克隆可解包 |
| 修 A 坏 B | M26 七面矩阵 + dependency-cruiser 机器红灯 |

## 执行顺序

1. Phase 0：评估脚本与 package 脚本。
2. Phase 1：`dialogueToolSurface` 单源入口与 5 个调用点改造。
3. Phase 2：`chainIntentPhraseCorpus` 单源接入、七层判定、每路由阈值、no_match 语义。
4. Phase 3：dependency-cruiser 规则。
5. Phase 4：全量验证矩阵。
6. 回头看：重新执行 `rg` 调用点盘点，确认无第三入口。
7. 日志与文档：同步 DEV_LOG、经验文件、runTrace/DiagLogger 覆盖对账。

## 回滚边界

1. 每个 Phase 独立验证，失败只回滚当前 Phase。
2. 词库文件 `_audit/phrase-corpus-saturated.json` 是事实来源，生产常量由它生成，不手写。
3. 若 E2E 失败，禁止改测试契约迁就实现；先定位产品语义，再同步测试。
4. 禁止回滚已通过且与本 Phase 无关的既有能力。

## 用户审核点

1. 是否确认按 Phase 0 -> 4 顺序执行。
2. 是否确认 no_match 显式提示文案：“未能识别意图，请补充写入或讨论说明”。
3. 是否确认本轮执行后升级版本号并封装交付。

除以上 3 点外，方案无待定参数，无隐藏分支。
