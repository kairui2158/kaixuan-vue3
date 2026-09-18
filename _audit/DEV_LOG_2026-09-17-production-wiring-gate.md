# 2026-09-17 生产接线门禁与社区深度调研

## 背景

客户指出两个问题：

1. “修 A 时 B 还在用旧假设、旧链路、旧测试、旧规格没有一次性清干净”必须升格为每次必用的门禁。
2. 生产接线缺失方案必须基于真实社区源码多轮调研，方案要达到成熟和最优，先审核后执行。

## 本轮动作

1. 经验文件新增 M26 旧假设清零门禁。
2. 真实克隆并读取四个项目源码：
   - semantic-router：每路由阈值、空 RouteChoice、fit/evaluate。
   - Roo Code：显式工具权限策略、写入前 diff、拒绝后 revert。
   - knip：unused/orphan/duplicates 机器报告，连失效 ignore 也报告。
   - dependency-cruiser：forbidden/reachable/orphan 依赖规则。
3. 对账本仓现状，确认第二接线：
   - `src/components/chat/ChatPanel.vue:2508` 直接调用 `createEditorTools()`
   - `src/components/chat/ChatPanel.vue:2557` 直接调用 `resolveDialogueToolSurface()`
   - `src/components/common/OutlineWorkspace.vue:1181/2326/2352` 另有三处入口
4. 用户追问话术语料后补做第二轮真实调研：
   - RiSAWOZ：克隆并解包 NLU/DST 数据，确认约 1 万组中文用户原话与 Request/Inform/Select/Greeting/Bye 行为标注。
   - Roo Code：读取 read_file / edit / tool-use-guidelines / rules 源码，提取读后写、精确匹配、工具选择、完成收口话术范式。
   - COIG-CQIA：仓库真实，但主 LFS 文件 404，判定为不可复现来源，不纳入主语料。
5. 方案新增 Phase 2.1 中文话术语料补强，等待用户审核，未改生产代码。
6. 用户继续追问意图路由与位置咨询词库后，第三次补齐词表方案：
   - 对账现有 `EXPLICIT_WRITE_ACTIONS` 16 词、`READ_ONLY_LOCATION_PATTERN` 9 词、状态询问仅 1 条复合正则。
   - 方案新增 Phase 2.2，补写入授权、位置咨询、状态权限、参考索取四张词表与冲突优先级。
   - 明确“告诉我插入点在哪里 -> 只读，把这段插入第三段 -> 写入”这类同词冲突的判定顺序。

## 证据

- 调研报告：`_audit/RESEARCH_2026-09-17_PRODUCTION_WIRING_MATURITY.md`
- 执行方案：`_audit/PROPOSAL_2026-09-17_PRODUCTION_WIRING_MATURITY_V2.md`
- 经验门禁：`_audit/神意开发经验总结_v5.md` M26

## 后续

用户审核通过后按方案 Phase 0-4 执行；执行前必须复读 M17、M18、M21、M26。

## 第四轮补齐：词库饱和矩阵

用户判定第三轮词表仍未补够，要求继续补到不能再补。本轮完成以下动作：

1. 对 RiSAWOZ 训练集做全量统计：10000 组对话、67290 条用户话轮；Request 44965、Inform 26509、General 9768、Bye 9439、Greeting 8173。
2. 新增只读提取脚本 `_audit/research-cache/risawoz/extract-phrase-skeletons.cjs`，输出 45 类句式骨架、问句尾缀与短承接到 `phrase-skeleton-summary.json`。
3. 将 RiSAWOZ 行为句式、Roo Code 工具话术、本仓 trace、写作领域枚举四面交叉，生成 `_audit/phrase-corpus-saturated.json`。
4. 最终矩阵：994 个词/短语、22 个分组、170 条验收样本。
5. 新增机器审计 `scripts/audit-phrase-corpus-saturation.cjs`：检查空词、重复词、跨类别重复、样本重复、词数与分组统计；当前输出 `problems: []`。
6. 方案文档新增 Phase 2.3：词库饱和矩阵、七层判定优先级、饱和判定门、生产接入边界。
7. 本轮仅更新方案、调研报告与开发日志，未修改生产代码。

### 证据

- 方案：`_audit/PROPOSAL_2026-09-17_PRODUCTION_WIRING_MATURITY_V2.md` Phase 2.3
- 调研：`_audit/RESEARCH_2026-09-17_PRODUCTION_WIRING_MATURITY.md` 第四轮词库饱和统计
- 词库：`_audit/phrase-corpus-saturated.json`
- 审计脚本：`scripts/audit-phrase-corpus-saturation.cjs`

## 第五轮补齐：追加 CrossWOZ 与 COIG-CQIA

用户判定第四轮词库仍未达到“补到不能再补”。本轮继续补齐：

1. 解包并全量读取 CrossWOZ `train.json`：5012 组对话、42346 条用户话轮。
2. 读取 COIG-CQIA `zhihu_score9.0-10_clean_v10.jsonl`：2561 条高质量中文 instruction。
3. 新增只读提取脚本 `scripts/extract-phrase-corpus-fifth-round.cjs`，按 53 类中文行为标记输出句式骨架到 `_audit/research-cache/phrase-corpus-fifth-round-summary.json`。
4. 只迁移行为句式：礼貌请求、比较选择、状态确认、位置归属、解释说明、条件约束；不迁移酒店、景点、平台领域实体。
5. 词库矩阵从 994 词/170 样本扩展到 **1540 词/22 分组/246 样本**：
   - 位置咨询 153 -> 272
   - 状态/权限/禁写 131 -> 311
   - 参考索取 130 -> 249
   - 澄清请求 99 -> 227
   - 写入授权 148 保持不变
6. 审计脚本补上“权限层串词”和“长短语式包含”两类检查后，把同类别包含改为饱和度观测而非错误；当前输出 `problems: []`、`containmentObservationCount: 175`。
7. 方案与调研报告同步更新为第五轮统计。
8. 本轮仍未修改生产代码；接入生产必须等待用户审核。

### 第五轮证据

- 词库：`_audit/phrase-corpus-saturated.json` version `2026-09-17.2`
- 提取脚本：`scripts/extract-phrase-corpus-fifth-round.cjs`
- 统计输出：`_audit/research-cache/phrase-corpus-fifth-round-summary.json`
- 审计命令：`node scripts/audit-phrase-corpus-saturation.cjs`
- 审计结果：1540 词、22 分组、246 样本、175 条长短语式共存观测、`problems: []`
- 方案：`_audit/PROPOSAL_2026-09-17_PRODUCTION_WIRING_MATURITY_V2.md` Phase 2.3
- 调研：`_audit/RESEARCH_2026-09-17_PRODUCTION_WIRING_MATURITY.md` 第五轮词库追加统计

## 第六轮收尾：新旧并存清零

用户要求全链路检查“新实现落地、旧实现未删”的并存现象。本轮按 M26 七面矩阵清零：

1. **de-ai 旧链**：删除零调用的 `fixParagraphStartPeriods`、`SUMMARY_PATTERNS`、`PARAGRAPH_STARTER_ROTATION`、`INTRA_CONNECTORS`、`EMPTY_OPENINGS`、`CONNECTOR_SEQUENCE`、`GENERIC_OPINIONS`、`FORMAL_PATTERNS`、`SENSORY_WORDS_N`、`TEMPLATE_OPENING_RE` 与 V52 空注释块；旧 `process()` 根因注释改为当前 `processBody` 事实。文件从约 926 行收敛到约 812 行，`processBody` 为唯一生产入口。
2. **UI 单一事实源**：`DeAiSettings.vue` 的硬规则清单从旧 20 条改为现行 `HARD_RULES` 7 条，删除 13 个无效开关，补齐 `bannedVocab`、`bannedPhrases` 两个真实规则。
3. **测试夹具**：6 个 spec 文件共 70 处 `fromCache: false` 全部替换为 `folderPackageCache: false`，与生产字段改名对齐。
4. **临时脚本**：删除 `scripts/tmp-remove-deai-legacy.cjs` 与 `scripts/tmp-clean-deai-legacy-blocks.cjs`。
5. **经验升级**：经验文件升级 v5.14，新增 M27 清单单一事实源门禁。

### 清零证据

- `rg "fromCache" src scripts tests electron`：0 命中。
- `rg "SUMMARY_PATTERNS|PARAGRAPH_STARTER_ROTATION|INTRA_CONNECTORS|EMPTY_OPENINGS|CONNECTOR_SEQUENCE|GENERIC_OPINIONS|FORMAL_PATTERNS|SENSORY_WORDS_N|TEMPLATE_OPENING_RE|fixParagraphStartPeriods|V52|process\(\) 里的" src/services/de-ai.js src/components/settings/DeAiSettings.vue`：0 命中。
- `node scripts/tests/deai-v2.test.mjs`：9/9 通过。
- `npm run type-check`：通过。
- `npm run test:services`：71 文件 / 635 测试通过。
- `npm run evaluate:chain-intent`：classification 17/17，routing 17/17。
- `npm run verify:production-wiring`：267 模块、881 依赖无违规。

## 第七轮最终对账：Phase 1-4 闭环

用户追加门禁：全链路检查新实现与旧实现、旧文档、旧统计不得并存。本轮完成最终对账：

1. **Phase 1 生产接线闭环**：`ChatPanel.vue`、`OutlineWorkspace.vue`、`workspaceSkillEngine.ts` 全部通过 `dialogueToolSurface` 的 `buildDialogueToolSurface()` / `authorizeDialogueTools()` 取得工具面；`rg "editorTools" src/components` 为 0 命中，组件无第三入口。
2. **Phase 2 路由成熟化闭环**：`main.ts` 初始化 `initIntentRouter()`；生产路由 `chainIntentRouter.ts` 已接入 `chainIntentPhraseCorpus.ts` 饱和词库，实现七层判定与最长命中优先；旧散落正则不参与路由。
3. **Phase 3 依赖门禁闭环**：`.dependency-cruiser.cjs` 生效，`npm run verify:production-wiring` 通过，评估脚本被门禁强制消费 `chainIntentCorpus`。
4. **Phase 4 验证矩阵闭环**：type-check、服务测试、路由评估、依赖门禁、E2E、构建、安装包与 asar 检查均通过；E2E 覆盖主页/大纲写入、discuss 只读、权限拒绝、写入上限、锁定态、工具循环收敛。
5. **本轮清掉三处新旧并存**：方案与词库 JSON 的“尚未接入生产”旧状态改为“已接入”事实；第五轮提取脚本硬编码的 994 词/170 样本旧统计改为从词库动态计算；`api-start` 事件补记 `actualToolSurface`，E2E 增加 event 层与 turn/API 层一致性断言，补齐方案矩阵的第三层对账。

### 第七轮证据

- `node scripts/audit-phrase-corpus-saturation.cjs`：1540 词、22 分组、246 样本、175 条长短语式共存观测、`problems: []`。
- `npm run evaluate:chain-intent`：classification 17/17，routing 17/17；饱和样本 246/246，生产常量 1540 词，与词库审计单源对齐。
- `rg "pending_user_confirmation|editor\.propose_edits" src scripts`：生产无旧字符串残留，仅 spec 断言旧工具不存在。
- `rg "尚未接入生产|本阶段不修改.*chainIntentRouter|phrases: 994" _audit scripts src`：0 命中。

## 第八轮收尾：旧构建产物门禁与新旧并存复扫

用户追加要求：全链路检查“新实现落地、旧实现未删”的并存现象，覆盖构建产物层，不允许新旧同时存在。本轮完成：

1. **E2E 假失败根因闭环**：`verify-api-direct-write-v2-e2e.mjs` 曾读取旧 `dist-renderer` bundle，旧 bundle 的 `api-start` detail 仍为旧文本格式，导致 event 层断言失败。执行 `npm run build:vue` 重建后，14 场景 E2E 全部通过。
2. **新增构建新鲜度门禁**：E2E 源码模式启动前执行 `assertFreshRendererBuild()`，校验 `dist-renderer/index.html` 引用的全部 JS bundle mtime 均新于 `src` 全部源文件、`package.json`、lockfile 与 Vite 配置；任一旧 bundle 直接拒绝启动并提示重建。已做反向验证：临时调新源文件 mtime 后门禁正确拒绝，时间戳已恢复。
3. **新旧并存复扫**：
   - 旧 16 词/9 词路由矩阵：`EXPLICIT_WRITE_ACTIONS` / `READ_ONLY_LOCATION_PATTERN` 在 `src`、`scripts`、`electron` 生产代码 0 命中。
   - 旧确认预览链路：`pending_user_confirmation` / `editor.propose_edits` 仅剩 spec 中“断言不存在”的负向测试，生产 0 残留。
   - `awaiting_confirmation` 保留为 chain 歧义时等待用户澄清的合法状态，不属于旧确认预览链路。
   - `ChatPanel.vue` 的 `handleDiffApplied` / `pendingEditorTarget` 是“用户手动插入到光标位置”的独立功能，与 API 直写链路并存且各有用途，不删除。
   - `actualToolSurface` 在 turn、API call、event、工具面授权层全部单源传递。
4. **当前态文档纠偏**：`UNIFIED_REVIEW_2026-09-17_PRODUCTION_WIRING_FINAL.md` 中旧的“未执行”清单与 1540 词统计更新为当前事实：1642 词、22 分组、246 样本、204 条长短语式共存观测；生产接线与依赖门禁均已接入。历史轮次记录中的 1540 词保留为当时事实，不篡改时间线证据。

### 第八轮证据

- `npm run test:services`：71 文件 / 636 测试全部通过。
- `node scripts/audit-phrase-corpus-saturation.cjs`：1642 词、22 分组、246 样本、204 条长短语式共存观测、`problems: []`。
- `node scripts/verify-api-direct-write-v2-e2e.mjs`：14 场景全部通过，输出 `===== API DIRECT WRITE V2 E2E PASSED =====`。
- 构建门禁反向验证：临时调新源文件 mtime 后输出 `AssertionError: renderer build is stale`，拒绝启动旧构建。

## 第九轮收尾：package.json 覆盖事故恢复与 3.53.1 交付

本轮执行 3.53.1 重新封装时发现 `package.json` 被一次错误的 `asar extract-file` 操作覆盖为精简内容。处理过程如下：

1. **恢复方式**：以 git HEAD 中的 `package.json` 为基线，仅保留本轮应有三类变更：版本号 `3.53.1`、`test:services` 恢复为 `vitest run`、新增 `sync:phrase-corpus` / `verify:phrase-corpus-sync` / `evaluate:chain-intent` / `verify:production-wiring` 四条脚本。逐项 diff 对账，无历史脏改混入。
2. **事故门禁**：严禁在仓库根目录执行 `asar extract-file` 类命令；后续交付产物核验必须在独立临时目录执行 `asar extract`，读取临时目录内文件，结束后删除临时目录。该约束已由经验文件 v5.15 的 M28 构建产物门禁覆盖，本轮作为实操事故记录在案。
3. **恢复后全量验证**：
   - `node -e JSON.parse(...)`：package.json 语法合法，脚本值为仓库真实命令。
   - `npm run verify:phrase-corpus-sync`：1642 词、22 分组、246 样本对齐，`problems: []`。
   - `node scripts/audit-phrase-corpus-saturation.cjs`：1642 词、22 分组、246 样本、204 条长短语式共存观测，`problems: []`。
   - `npm run evaluate:chain-intent`：classification 17/17，routing 17/17。
   - `npm run verify:production-wiring`：267 模块、881 依赖无违规。
   - `npm run type-check`：通过。
   - `npm run test:services`：71 文件 / 636 测试全部通过。
   - `npm run build:vue`：通过。
   - `node scripts/verify-api-direct-write-v2-e2e.mjs`：14 场景全部通过，含权限拒绝、锁定态、回滚阻断等负向路径。
4. **新旧并存终扫**：`EXPLICIT_WRITE_ACTIONS`、`READ_ONLY_LOCATION_PATTERN`、`fromCache`、de-ai 旧常量、组件直连 `editorTools` 均为生产 0 命中；`pending_user_confirmation` / `editor.propose_edits` 仅保留 spec 负向断言。

## 第十轮修复：大纲 turn intent 迟到路由回写

回头看发现大纲 skill 链路存在观测层断点：`OutlineWorkspace.askAi()` 在 `startOutlineRun()` 时只能传 fallback 按钮的 `forcedIntent`；真实意图是在 `runWorkspaceSkills()` 内部 `resolveWorkspaceIntentRouting()` 才确定。结果是 turn 层 intent 仍是 `undefined`，而 API call 层 `actualToolSurface` 与 event 层 routing reason 已按真实意图执行，三层记录不一致。

本轮修复：

1. `runTrace` 新增 `updateTurnIntent(runId, turnId, input)`：只允许修改 running turn；同步更新 intent、toolSurface、actualToolSurface，追加 `turn-intent-updated` 事件并落盘。
2. `recordOutlineRoutingEvent()` 收到 `routing_result.matched` 且当前 run/turn 均存活时，用真实匹配意图重建大纲工具面并回写 turn，保证 turn/API/event 三层一致。
3. 新增单测覆盖：迟到路由回写、事件归属、turn 完成后禁止 stale 覆盖。

### 第十轮证据

- `npm run type-check`：通过。
- `npx vitest run src/stores/runTrace.spec.ts`：37/37 通过。
- `npm run test:services`：71 文件 / 637 测试全部通过。
- `npm run verify:production-wiring`：267 模块、881 依赖无违规。
- `rg "recordOutlineRoutingEvent|onRoutingEvent|routing_result" scripts src`：大纲与主页各一条生产监听入口，无第三入口；主页入口为提前分类后的记录层，不消费迟到 intent，无需同款回写。

## 第十一轮补交：SKILL 层工具面交接文档

用户追问“给 SKILL 层的详细说明（工具、调用方式、函数、其他维度）”是否完成。核对 `_audit` 后确认：此前的 chain handoff、卷纲状态、folder 规范均为专题文档，没有一份把 API 直写工具面按 SKILL 制作方视角系统交付，本轮补齐。

1. 新增 `_audit/SKILL_HANDOFF_API_DIRECT_WRITE_TOOLS.md`：覆盖工具清单（12 个读工具 + `editor.write`）、意图权限矩阵、原生 tool loop、JSON 协议降级、写入后的 reveal 形态、folder SKILL 与工具边界、run trace 三层读法、失败码速查、发布前自检清单与证据索引。
2. 修正 `_audit/FOLDER_SKILL_SPEC_V1.md` 两处事实错误：`editor.write` 成功状态从虚构的 `status: applied` 改为源码真实的 `status: written`；删除不存在的 `write-missing` trace 事件，改为“turn `actualToolSurface` 有 `editor.write` 而 API call `toolCalls` 为空”的判断方法。
3. 本轮仅文档改动，不改生产代码。

### 第十一轮证据

- `rg "name: 'editor\.|name: 'outline\.|name: 'task\." src\services\editorTools.ts src\services\outlineTools.ts`：12 个读工具 + 1 个写工具全部对齐。
- `rg "status: 'written'|rollbackAvailable" src\services\editorTools.ts src\services\editorTools.spec.ts`：真实返回 `status: 'written'`。
- `rg "DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS|DIRECT_TOOL_RUN_HARD_DEADLINE_MS" src\services\toolRunSupervisor.ts`：150 秒无进展、300 秒总上限。
- `rg "status: applied" _audit`：SKILL 交接文档 0 残留；源码中的 `applied` 是批次记录事件状态，与 `editor.write` 返回值不同，不混写。
