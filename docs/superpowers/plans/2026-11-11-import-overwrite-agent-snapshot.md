# 导入覆盖与 Agent 快照残留根治计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让“覆盖导入”成为可对账的全字段替换，让 Agent systemPrompt 快照残留可查看、可清除、可刷新，并根治同版本 ZIP 技能包覆盖安装的磁盘残留。

**Architecture:** Agent 记录层已用 `Object.assign` 做字段替换，本次不重建导入架构；先以红测试钉住“缺失字段必须清空、`createdAt` 必须保留、systemPrompt 必须刷新”语义，再修 import plan 的对账数据和最小 UI。ZIP 安装改为同版本安装目录的确定性替换，不改加载器语义。所有新诊断字段只复用现有 `ImportPlanItem` 和 UI 行，不新增独立快照缓存或第二同步系统。

**Tech Stack:** Vue 3 + Pinia + TypeScript；Vitest；Electron 主进程 CJS `fs`/`path`；现有 config exchange 和 skill-package IPC。

**Spec:** 用户 2026-11-11 转达要求：1. 排查覆盖导入为什么没有刷新已存在的 agent systemPrompt 快照，修复导入语义为“覆盖即全字段刷新”；2. 提供查看/清除/刷新 Agent systemPrompt 快照的对账入口；3. 确认导入包是否内嵌旧 Agent 提示词。本计划是该三点的实施规范；方案文档与执行台账在 `_audit/TASK_LEDGERS/` 链接。

## Global Constraints

- 遵守 `_audit/神意开发经验总结_v9.md`（正文标题为 v10.3.0）的 L0-L2 相关门禁，重点 G0.5、G0.6、G0.9、G0.10、G0.12、G0.13、G1.1、G1.3、G1.4、G1.5、G1.14、G1.25。
- 禁止新增 Agent systemPrompt 快照缓存、自动同步器、SKILL 仓库扫描器、批量重建工具或第二导入协议。
- Agent `overwrite` 必须全字段替换：JSON 缺失可选字段写入应用时按 `undefined` 语义清空；`createdAt` 在 incoming 缺失时保留本地值；`updatedAt` 由应用写入。
- Agent 查看/清除/刷新只做最小 UI：查看用 len/hash，清除只影响当前 Agent 的 systemPrompt，刷新复用“重新选择同一文件并覆盖导入”，不做专用刷新服务。
- ZIP 同版本覆盖安装必须不保留旧文件；安装失败不得破坏现有版本目录；真实文件系统测试使用 `setSkillLibraryRoot`，不 mock 主进程 CJS。
- folder 技能导入保持现有指针语义：只替换 store 记录，不删除旧磁盘目录；UI 明示该语义。
- 本轮不修改 SKILL 仓库；旧提示词内嵌确认用 store、SKILL 仓库 JSON、`.agent.md` 三方对账行和一次性报告回答。
- 所有新增字段必须有 Vitest 或 Electron 主进程测试；禁止源码字符串断言冒充行为验证。

## 根因声明

1. **Agent 记录层不是 merge 残留**：`src/stores/agent.ts:55-76` 的 overwrite 使用 `Object.assign(existingAgent, a, { updatedAt: now })`；`src/services/configExchange/index.ts:108-122` 和 `validation.ts:249-261` 返回全部 11 个字段，包括显式 `undefined`。因此“旧 systemPrompt 快照未被记录层刷新”不是普遍事实。唯一记录层丢失面是 incoming 缺失 `createdAt` 时会被 `undefined` 覆盖。
2. **消费层没有快照缓存**：`workspaceSkillEngine.ts:1140`、`realSkillExecutor.ts:413-433`、`PipelinePanel.vue:3337`、`ChatPanel.vue:3247` 均实时读取 Pinia store。流水线断点也只持久化 `agentId`（`src/services/chainBreakpoint.ts:36`），恢复时实时重查 store，不持久化提示词。若 UI 显示旧提示词，优先怀疑导入未覆盖目标 ID、导入包本身是旧内容、或 store 记录与磁盘源分裂，而不是运行时缓存或断点快照。
3. **导入包确实可能内嵌旧提示词**：实测三方对账已见分歧：`D:\神意助手数据\wa_agents.json` 与 `D:\codex\玄武规划SKILL\agents\玄武凯旋-Agent配置.json` 的同一 ID len 不同；SKILL 仓库配置 JSON 不含 `updatedAt`；`l3_fill` 的 store len 181、配置包 len 113、`.agent.md` len 673。这必须靠导入对账行和一次性报告回答，不猜测修复。
4. **ZIP 覆盖残留成立**：`electron/ipc/skill-package.js:391-431` 只创建和写入文件，从不清空 `installRoot`；`skill-package.spec.js:87-90` 在重装前手动 `rmSync` 掩盖了该缺陷。

## 方案成熟度

**结论：成熟，允许执行。**

1. 执行器/工具层：Agent overwrite、导入对账、zip 清理全部落在现有 Pinia store、config exchange 和 skill-package IPC；无新执行器。
2. 应用方案/交互闭环：预览行显示当前/导入 len/hash，卡片显示提示词规模，编辑表单提供清除；用户可重复导入刷新，闭环成立。
3. 实现接线：新增字段从 `buildImportPlan` 可选第五参 `existingPrompts` 到 `AgentSettings.vue` 单入口消费，保持旧调用点向后兼容；zip 使用主进程真实文件系统。
4. 验证标准：Agent store 红测试、config exchange 对账测试、zip 同版本重装残留测试、Electron 主进程构建与真实供应商手工烟测。无不可接受断点。

## 影响圈矩阵

| 层面 | 打算改的 | 可能碰到的 | 防越界边界 |
|---|---|---|---|
| 源码 | `agent.ts`、`configExchange/index.ts`、`types.ts`、`AgentSettings.vue`、`SkillSettings.vue`、`skill-package.js` | `useConfigExchange.ts` 只读现有接口；不碰 pipeline 运行链路 | 不改执行器、不做 SKILL 扫描、不加缓存 |
| 测试 | `agent.spec.ts`、`configExchange.spec.ts`、`skill-package.spec.js` | 可能新增类型测试 | 红测试先跑，真实临时目录 |
| UI | Agent 卡片/导入预览、技能 folder 提示文案 | 全局 CSS 类名冲突 | 最小样式；不新增独立面板 |
| 文档 | 本方案、DEV_LOG、DEV_LOG_MASTER_INDEX、TASK_LEDGER | 版本号、package-lock | 不改 SKILL 手册；不改用户数据 |
| 构建 | `package.json` 3.123.0 → 3.124.0；构建封装 | 安装包产物 | G0.8 清理 |
| 日志 | 新 DEV_LOG | master index | 不重写历史 |
| 运行状态 | 真实 store 不由验证器直写 | 隔离 root 仅用于主进程 zip 测试 | 禁碰 `D:\神意助手数据` |

## Review Focus

1. **旧提示词被误认为“跳过导入”**：用户期望“覆盖”后看到新 len/hash；测试绑定 `AgentSettings` 消费对账行，见 Task 2。
2. **可选字段清空误伤正常字段**：温度/maxTokens 等必填字段不能变 undefined；测试缺失字段清空 + 必填字段保留，见 Task 1。
3. **`createdAt` 历史不丢失**：incoming 缺失时保留；测试钉住，见 Task 1。
4. **ZIP 覆盖残留**：同版本重装后旧文件必须不存在；真实临时目录测试钉住，见 Task 3。
5. **UI 语义误导**：folder 覆盖不能暗示删除磁盘目录；文案测试/代码审读在 Task 4 登记为源码级接线守护，live UI 未测时显式登记 `untested`。

---

### Task 0: 先证明当前语义，再修正说法

**Files:**
- Modify: `src/stores/agent.spec.ts`

**Interfaces:**
- Consumes: 现有 `useAgentStore.importAgents(list, strategy)`。
- Produces: 后续任务依赖的事实基线：overwrite 会替换可选字段、清空缺失可选字段、把缺失 `createdAt` 覆盖为 undefined。

- [ ] **Step 1: 补三个当前行为测试**

  - `overwrite replaces optional fields and clears missing optional fields`：已有 Agent 的 `description/provider/tools/systemPrompt` 分别为旧值；incoming 只给 `id/name/model/temperature/maxTokens/systemPrompt` 新值且 `systemPrompt` 不同。断言 overwrite 后 systemPrompt 为新值，description/provider/tools 为 `undefined`。
  - `overwrite loses createdAt when incoming record omits it`：已有 Agent `createdAt = '2026-01-01T00:00:00.000Z'`；incoming 缺 `createdAt`。当前断言 `createdAt` 为 `undefined`，测试通过即证明缺陷。
  - `overwrite refreshes systemPrompt when incoming supplies it`：断言 `systemPrompt === 'incoming-prompt'`。

- [ ] **Step 2: 运行并记录当前结果**

Run: `npx vitest run src/stores/agent.spec.ts`
Expected: 全部 PASS。`createdAt` 用例 PASS 就是当前丢失面的证明，不是业务绿灯。

- [ ] **Step 3: 在方案执行台账登记事实**

台账写明：记录层全字段替换成立；消费层无缓存；当前唯一记录层缺陷是 `createdAt`。禁止把本测试写成“修复完成”。

### Task 1: Agent overwrite 语义收口

**Files:**
- Modify: `src/stores/agent.ts:55-76`
- Test: `src/stores/agent.spec.ts`

**Interfaces:**
- Consumes: Task 0 事实。
- Produces: `importAgents` overwrite 语义：可选字段显式替换；缺失可选字段按 undefined 清空；缺失 `createdAt` 保留；`updatedAt` 恒为本次 ISO 时间。

- [ ] **Step 1: 修改 Task 0 的 `createdAt` 红测试为业务目标**

断言 incoming 缺 `createdAt` 时保留旧 `createdAt`。

- [ ] **Step 2: 跑单测确认红**

Run: `npx vitest run src/stores/agent.spec.ts`
Expected: FAIL，仅 `createdAt` 用例失败，旧值 `2026-01-01T00:00:00.000Z` vs undefined。

- [ ] **Step 3: 最小实现 `createdAt` 保留**

在 `importAgents` overwrite 分支构造 `Object.assign` 覆盖对象：先 `Object.assign({}, a)`，若 `a.createdAt` 非字符串则使用 `existingAgent.createdAt`，再叠加 `updatedAt: now`。不改 `updateAgent`、不引入 clone 库。

- [ ] **Step 4: 跑单测确认绿**

Run: `npx vitest run src/stores/agent.spec.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/stores/agent.spec.ts src/stores/agent.ts
git commit -m "fix: preserve agent createdAt on overwrite import"
```

### Task 2: Agent 导入对账与最小管理入口

**Files:**
- Modify: `src/services/configExchange/types.ts`
- Modify: `src/services/configExchange/index.ts`
- Modify: `src/components/settings/AgentSettings.vue`
- Test: `src/services/configExchange.spec.ts`

**Interfaces:**
- Consumes: 现有 `AgentRecord`、`buildImportPlan`。当前签名是 `(existingIds, incoming, strategy?, format?)`，拿不到本地 systemPrompt；本任务新增可选第五参 `existingPrompts?: Map<string, string>`（agent id → 本地 systemPrompt），不改变前四参语义。四个现有调用点逐一登记：`useConfigExchange.ts:147` 与 `AgentSettings.vue:254` 是 agent 路径的两条独立 plan 构造线（文件解析初始 plan 与策略切换刷新 plan），两处都传入新 Map；`useConfigExchange.ts:253` 与 `SkillSettings.vue:1112` 是 skill 路径，不传，行为保持不变。禁止只改其中一条 agent 线。
- Produces: `ImportPlanItem` 新增可选 `currentSystemPromptChars?: number`、`currentSystemPromptHash?: string`、`incomingSystemPromptChars?: number`、`incomingSystemPromptHash?: string`、`incomingSystemPromptMissing?: boolean`；`AgentSettings.vue` 卡片显示 `提示词 len/hash`，预览行显示当前 → 导入对账，textarea 旁新增“清除提示词”。

- [ ] **Step 1: 写 config exchange 对账红测试**

在 `src/services/configExchange.spec.ts` 的 `import planning` 块新增用例：本地 `systemPrompt = 'local'`，incoming `systemPrompt = 'incoming'`；strategy overwrite 且传入 `existingPrompts` 时断言四个 len/hash 字段；local 30 chars, incoming 8 chars；hash 为字符串且不同。同时补一个不传 `existingPrompts` 的旧签名用例：对账字段保持 `undefined`，防止破坏 skill 路径和旧调用点。skip 用例同字段保留，供 UI 对账。

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/services/configExchange.spec.ts`
Expected: FAIL，undefined。

- [ ] **Step 3: 实现最小对账**

在 `buildImportPlan` 中复用 `src/services/settingsProjection.ts:59` 的 `fnv1a32Hash` 对 `systemPrompt` 计算对账 hash，不引入 SHA-256 双源。仅当第五参 `existingPrompts` 存在时填写本地字段；incoming 字段始终可算。skill/folder 等旧调用路径不传第五参，输出结构不得新增其他行为。

- [ ] **Step 4: UI 最小接线**

- 卡片 summary：`提示词: {len} chars · {hash}`；空为 `0 · empty`。卡片 hash 同样复用 `fnv1a32Hash`，与 plan 对账 hash 同源；空字符串 hash 显示 `empty`。
- 预览 plan item：`当前 {len}/{hash} → 导入 {len}/{hash}`；incoming missing 时显示 `导入 缺失/empty`。
- 编辑表单 textarea 旁：按钮 `清除提示词`，确认后置 `a.systemPrompt = ''`；立即 `agentStore.saveAgents()`。不加批量按钮。
- 导入预览覆盖文案加一句：`覆盖导入按当前界面字段执行全字段替换；缺失字段按空/默认语义刷新。`

- [ ] **Step 5: 手动组件接线验证**

Run: `npx vitest run src/services/configExchange.spec.ts src/stores/agent.spec.ts`
Expected: PASS。

同时跑一次 `npm run dev`，真实 UI 导入临时 JSON：覆盖前后读取卡片 len/hash，确认变更有对账。失败即禁止进入下一 Task。

- [ ] **Step 6: Commit**

```bash
git add src/services/configExchange/types.ts src/services/configExchange/index.ts src/services/configExchange.spec.ts src/components/settings/AgentSettings.vue
git commit -m "feat: expose agent prompt import diff and clear control"
```

### Task 3: ZIP 同版本覆盖安装残留根治

**Files:**
- Modify: `electron/ipc/skill-package.js:391-431`
- Test: `electron/ipc/skill-package.spec.js`

**Interfaces:**
- Consumes: 现有 `copyZipToSkillLibrary(zipPath, skillId, version)`、`setSkillLibraryRoot`。
- Produces: 同版本安装目录确定性替换；返回/成功加载语义不变。

- [ ] **Step 1: 写真实文件系统红测试**

首次安装 1.0.0 含 `template.md` 与 `assets/keep.bin`。不删版本目录，二次安装不含 `assets/keep.bin` 且 `template.md` 内容不同。断言旧 `assets/keep.bin` 不存在，新 `template.md` 内容正确。

- [ ] **Step 2: 跑主进程测试确认红**

Run: `npx vitest run electron/ipc/skill-package.spec.js`
Expected: FAIL，旧文件仍存在。

- [ ] **Step 3: 修改现有掩盖用例**

删除 `skill-package.spec.js:87-90` 附近重装前的手动 `rmSync`；保留等价性断言。

- [ ] **Step 4: 实现确定性替换**

在 `readZipEntries` 成功后、写入前执行：
1. `installParent = path.join(libraryRoot, safeId)`；确保父目录存在。
2. 创建唯一临时目录 `installRoot + '.tmp-' + process.pid + '-' + Date.now()`。
3. 校验临时目录和最终 `installRoot` 都在 `path.join(libraryRoot, safeId)` 内。
4. 写入全部条目并 `loadSkillFolder(tempRoot)`。
5. 成功后替换：`installRoot` 存在则 `fs.renameSync(installRoot, backup)`；`fs.renameSync(tempRoot, installRoot)`；成功后删除 backup；失败恢复。
6. 失败清理 temp/backup；现有版本不得损坏。

不引入新依赖，不处理跨盘 rename，因为 install root 与 temp 同父目录。

- [ ] **Step 5: 测试与失败路径**

Run: `npx vitest run electron/ipc/skill-package.spec.js`
Expected: PASS。

新增失败路径用例：注入非法 zip 或让 `loadSkillFolder` 失败后，确认旧版本文件仍存在，temp 被清理。优先真实坏包，不做 ESM mock。

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/skill-package.js electron/ipc/skill-package.spec.js
git commit -m "fix: replace installed skill zip version atomically"
```

### Task 4: folder 导入语义文案

**Files:**
- Modify: `src/components/settings/SkillSettings.vue:912-918`

**Interfaces:**
- Consumes: 现有 folder preview 语义。
- Produces: 覆盖确认文案明确“记录替换，旧磁盘目录不删除”。

- [ ] **Step 1: 改文案**

在 folder 覆盖选择附近增加/修改提示：`覆盖导入只替换技能记录并指向新路径；不会删除旧磁盘目录。`

- [ ] **Step 2: 验证**

Run: `rg -n "旧磁盘目录不删除" src/components/settings/SkillSettings.vue`
Expected: 1+ 命中。

真实 Electron UI 手工冒烟：打开设置 → 技能导入 folder → 选择覆盖 → 确认文案可见、导入成功、旧目录仍存在。若 live UI 未能本轮执行，台账登记 `untested`，不得写 PASS。

### Task 5: 旧 Agent 提示词内嵌一次性对账

**Files:**
- Create: `_audit/AGENT_PROMPT_IMPORT_RECONCILIATION_2026-11-11.md`

**Interfaces:**
- Consumes: `D:\神意助手数据\wa_agents.json`；`D:\codex\玄武规划SKILL\agents\玄武凯旋-Agent配置.json`；SKILL 仓库非备份 `.agent.md`。
- Produces: 只读对账报告，回答“导入包是否内嵌旧提示词”。

- [ ] **Step 1: 生成只读对账表**

PowerShell 脚本只读取三个来源，输出 Markdown 表：agent ID、name、store len/hash、SKILL JSON len/hash、`.agent.md` len/hash、是否一致。hash 复用项目 `fnv1a32Hash` 的 8 位 hex 口径（`src/services/settingsProjection.ts:59`），与 UI/trace 对账同源；不修改源文件。

Store 中存在但 SKILL 配置 JSON 无对应条目的 agent（如用户手动创建），SKILL JSON 列显示 `N/A`，不视为分歧；`.agent.md` 同理。只有三方都有值的行才做"是否一致"判定。

- [ ] **Step 2: 人工抽查 3 条分歧**

至少包含 kai_xuan_s1、kai_xuan_s2、l3_fill。记录哪个来源更新（有 `updatedAt` 用时间，否则按文件 mtime 且显式标注为弱证据）。

- [ ] **Step 3: 结论写入报告**

结论必须区分：应用记录、SKILL 配置 JSON、folder `.agent.md` 是三个独立事实源；当前导入包内嵌旧/不同提示词成立；修复路径是重新导出 SKILL 配置或用新 UI 对账覆盖，不建自动检测器。

### Task 6: 台账、日志、版本与交付

**Files:**
- Create: `_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-11_import-overwrite-agent-snapshot-v1.md`
- Create: `_audit/DEV_LOG_2026-11-11-import-overwrite-agent-snapshot.md`
- Modify: `_audit/DEV_LOG_MASTER_INDEX.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 0-5 证据。
- Produces: 3.124.0 可交付验证版本。

- [ ] **Step 1: 台账七节**

台账七节完整覆盖 G0.12 标准结构：目标与原话、门禁读证（G0.5/G0.6/G0.7/G0.9/G0.10/G0.12/G0.13/G1.1/G1.3/G1.4/G1.5/G1.14/G1.25 逐条引经验文件行号）、路由判定（排除项写不适用理由）、影响圈与作者反证（至少三条最可能错误假设）、停止条件（机器可判定）、执行证据、G1.14 缺陷面枚举和缺口清单。`[DEFECT-SWEEP]` 不能只写“无”。

缺陷面枚举至少覆盖：
1. Agent 卡片旧快照仍显示；
2. 导入 skip 误显示成更新；
3. hash 错误或 undefined UI；
4. `createdAt` 在旧数据丢失后重新导入无法找回；
5. ZIP 替换中中断导致半成品；
6. temp/backup 清理失败；
7. folder 覆盖用户误删磁盘目录；
8. `.agent.md` 与配置 JSON 分裂；
9. UI 文案与真实覆盖语义不符；
10. 版本号/构建产物陈旧。

- [ ] **Step 2: DEV_LOG 和索引**

DEV_LOG 写根因、修复、验证、未验证边界；master index 追加一行。禁止重写历史行。

- [ ] **Step 3: 版本与验证**

`package.json` 从 3.123.0 升到 3.124.0。

Run: `npx vitest run src/stores/agent.spec.ts src/services/configExchange.spec.ts electron/ipc/skill-package.spec.js`
Expected: PASS。

Run: `npm run type-check`
Expected: exit 0。

Run: `npm run build`
Expected: exit 0。

Run: `npm run verify:packaging`
Expected: exit 0。

真实供应商手工烟测：设置导入一个旧 Agent JSON → 覆盖导入 → 卡片 len/hash 变化；打开一次流水线或聊天链路确认新 prompt 生效。live 未执行时登记 `untested`。

- [ ] **Step 4: 封装**

构建 NSIS。安装包名含 `3.124.0`，记录 SHA256 与产物路径。交付前按 G0.8 清理临时测试产物；保留验证报告。

- [ ] **Step 5: Git 提交**

```bash
git add docs/superpowers/plans/2026-11-11-import-overwrite-agent-snapshot.md _audit/TASK_LEDGERS/TASK_LEDGER_2026-11-11_import-overwrite-agent-snapshot-v1.md _audit/DEV_LOG_2026-11-11-import-overwrite-agent-snapshot.md _audit/DEV_LOG_MASTER_INDEX.md _audit/AGENT_PROMPT_IMPORT_RECONCILIATION_2026-11-11.md package.json src electron
git commit -m "fix: import overwrite agent snapshot reconciliation"
```

提交前 `git status --short` 分拣本轮文件与既有用户脏文件；不添加既有脏文件。

## Self-Review

1. **Spec coverage:** 三条转达分别由 Task 1/2、Task 2、Task 3/4/5 覆盖。Task 0 先修正“快照缓存”误判。Task 5 回答导入包旧提示词。
2. **Step scan:** 每个 Task 有红测试/明确验证/最小实现/提交；UI 有手动 dev 冒烟；live 缺席时强制登记。
3. **Type consistency:** `ImportPlanItem` 新字段名在 Task 2 定义并被 UI 消费；`buildImportPlan` 新增参数向后兼容，四个现有调用点逐一登记；Task 6 引用同一台账。
4. **Review Focus:** 五项输入均绑定测试或 live 手工验证；无静默项。
5. **Proportion:** 代码块只锁语义、签名和测试口径，未预先写实现正文。
