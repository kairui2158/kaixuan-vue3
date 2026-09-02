# 记忆板块第一版「可靠基础闭环」施工计划

**交付对象**：新对话框（无上下文，需完整自包含）
**施工目标**：D:\codex\novel-workshop-vue3
**范围**：第一版 A/B/C/D 四块，共 12 个任务
**铁律**：只改记忆板块相关文件，不碰流水线/去AI味/聊天/设置其他功能

---

## 零、施工前必读

### 0.1 项目位置与启动方式

- 源码根目录：D:\codex\novel-workshop-vue3
- 启动器：根目录下 start-electron.bat（先 npm run build:vue 再启动 Electron）
- 经验文件：_audit/神意开发经验总结.md（221KB，含全部教训）
- 规则文件：memory/rules.md（规则1-23）
- 错误日志：lessons/ERROR_LOG.md
- 审计报告：_audit/MEMORY_DEEP_AUDIT_AND_PLAN_REVIEW_2026-08-27.md
- 开发日志：_audit/DEV_LOG_2026-08-*.md（按日期命名）

### 0.2 技术栈约束

- Vue 3.5 + Pinia + Vite 5 + Electron 30 + TypeScript
- 禁止引入新 npm 依赖
- 禁止用 PowerShell Set-Content 修改含中文源文件（规则13）
- 含中文文件用 apply_patch 或 Node.js fs 写入
- 每次改完立即 node --check 验证语法
- CSS 先搜后改，禁止叠加（规则19）

### 0.3 验证三铁律（规则14）

1. 外部裁判：改完不能靠读代码判断通过。必须用 Playwright/CDP 实际操作应用，截图+JSON日志+时间戳三者缺一视为未验证
2. 行为验证：不验证「元素存在」，验证「功能能用」。必须验证 操作->预期行为->实际结果 三元组
3. 强制执行：每个阶段有验证清单，任何一项 FAIL 禁止进入下一阶段

### 0.4 防空转协议

- 每步写 _audit/checkpoint.md + update_plan
- 同一方法连续失败2次，强制换路径
- 子Agent必须真正spawn，不能只说「我去派」
- 每30秒给用户一条进度更新，连续两条说同样话=空转信号
- 工具调用前先确认工具在可用列表中，连续两次失败立刻换替代方案

### 0.5 本计划引用的核心经验教训

| 编号 | 教训摘要 | 来源 |
|------|---------|------|
| 教训#77 | Array分支读purpose必须覆盖verify/detect | 经验文件 ~L74 |
| 教训#78 | baseUrl含/vN后缀会导致路由失败 | 经验文件 ~L74 |
| 教训#80 | CDP脚本写成独立.cjs文件执行 | 经验文件 ~L488 |
| 教训#81 | 检查DOM不检查全局变量 | 经验文件 ~L488 |
| 记忆异步落盘 | recordMemoryChange后必须await saveProject | 经验文件 ~L1832 |
| normalizeMemories风险 | 只保留已知字段，新字段静默丢失 | project.ts:47-55 |
| Object.assign覆盖 | 合并器直接覆盖未比较字段 | memoryMerger.ts 事件/世界观/伏笔 |
| 导入覆盖风险 | 覆盖导入无备份不可撤销 | memoryIO.ts + MemoryPanel.vue:266 |
| 关闭只等500ms | lifecycle.js固定setTimeout 500ms不够 | lifecycle.js:11-29 |
| EditorPanel两套路径 | EditorPanel走getAiService，PipelinePanel走callMemoryApi | 经验文件 ~L514 |
| 空状态冒充 | 空状态不能冒充真实数据验证 | 经验文件 ~L1712 |

---

## A. 来源与版本基础（任务 A1-A3）

### A1: 扩展记忆数据模型，增加来源与版本字段

**目标**：每个记忆条目可追溯到正文版本、章节范围和来源片段。

**改动文件**：
1. src/types/memory.ts（现有 139 行）
2. src/stores/project.ts 的 normalizeMemories() 函数（现有 L47-55）

**具体改动**：

在 src/types/memory.ts 中新增以下接口：

```typescript
export interface SourceVersion {
  id: string
  chapterId: string
  chapterIndex: number
  contentHash: string
  savedAt: string
  wordCount: number
}

export interface FactSource {
  sourceVersionId: string
  chapterId: string
  chapterIndex: number
  snippet: string
  rangeStart?: number
  rangeEnd?: number
  verified: boolean
}

export type FactStatus = "confirmed" | "pending" | "stale" | "conflicted" | "rejected"
```

在 MemoryEntity、MemoryRelation、MemoryEvent、WorldEntry、Foreshadowing 五个接口中各增加：

```typescript
  factStatus?: FactStatus
  supersedesId?: string
  conflictsWithIds?: string[]
  factSource?: FactSource
```

在 MemoryData 顶层增加：

```typescript
  sourceVersions?: SourceVersion[]
```

在 normalizeMemories()（project.ts L47-55）中增加对新字段的安全处理：

```typescript
sourceVersions: Array.isArray(raw.sourceVersions) ? raw.sourceVersions : [],
// 五类数组中无 factStatus 的条目补 confirmed
for (const arr of [out.entities, out.relations, out.events, out.world, out.foreshadowing]) {
  for (const item of arr) {
    if (!item.factStatus) item.factStatus = "confirmed"
  }
}
```

**输入输出契约**：
- 输入：旧 MemoryData（version=1，无 sourceVersions/factStatus）
- 输出：新 MemoryData（version=1，有 sourceVersions=[]，每条事实有 factStatus="confirmed"）
- 不破坏旧数据：旧项目加载后所有字段保留，新字段有默认值

**错误路径**：
- raw 为 null/undefined -> 返回 createDefaultMemories()
- raw.sourceVersions 不是数组 -> 默认空数组
- 某条目无 factStatus -> 补 "confirmed"

**验证方法**：
1. 写一个 Vitest 单元测试，加载一个旧格式 MemoryData JSON，断言新字段存在且有默认值
2. 用 CDP 启动应用，打开一个已有项目，检查记忆面板能正常加载旧数据
3. 关闭重启后检查 sourceVersions 和 factStatus 仍然存在

**引用经验**：normalizeMemories 只保留已知字段，新字段会静默丢失（project.ts:47-55 实证）

---

### A2: 正文保存时记录版本

**目标**：编辑器保存正文和流水线正文确认时，都产生同一格式的正文版本记录。

**改动文件**：
1. src/stores/project.ts 新增 recordSourceVersion() 方法
2. src/components/pipeline/PipelinePanel.vue 的 confirmBodyWithMemory() 函数（现有 L2743）
3. src/components/editor/EditorPanel.vue 的保存路径

**具体改动**：

在 project.ts 新增方法：

```typescript
function recordSourceVersion(chapterId, chapterIndex, content) {
  const hash = simpleHash(content)
  const existing = (memories.value.sourceVersions || []).find(v => v.chapterId === chapterId && v.contentHash === hash)
  if (existing) return existing.id
  const version = { id: "sv_"+Date.now()+"_"+Math.random().toString(36).slice(2,8), chapterId, chapterIndex, contentHash: hash, savedAt: new Date().toISOString(), wordCount: content.length }
  if (!memories.value.sourceVersions) memories.value.sourceVersions = []
  memories.value.sourceVersions.push(version)
  saveProject()
  return version.id
}

function simpleHash(text) {
  let hash = 0
  for (let i = 0; i < text.length; i++) { hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0 }
  return "h" + (hash >>> 0).toString(36)
}
```

在 PipelinePanel.vue confirmBodyWithMemory() 中（L2743 附近），正文保存成功后调用：

```typescript
const versionId = projectStore.recordSourceVersion(chapter.id, chapter.index, chapter.content)
```

在 EditorPanel.vue 保存路径中同样调用 recordSourceVersion。

**输入输出契约**：
- 输入：chapterId, chapterIndex, content
- 输出：sourceVersionId（写入 sourceVersions 数组并持久化）
- 同一内容不重复记录

**错误路径**：
- content 为空 -> 不记录，返回空字符串
- saveProject 失败 -> versionId 仍返回，但不持久化（下次保存会重新记录）

**验证方法**：
1. 单元测试：调用 recordSourceVersion 两次相同内容，断言只产生一条记录
2. CDP：流水线正文确认后，读取 projectStore.memories.sourceVersions，断言有一条记录
3. CDP：编辑器保存正文后，同样断言有记录

**引用经验**：EditorPanel 与 PipelinePanel 存在两套 AI 调用路径（经验文件 ~L514），版本记录必须两边都接入

---

### A3: 抽取时为每条记忆绑定来源版本

**目标**：AI 抽取返回的记忆条目，每条都带 factSource，包含 sourceVersionId。

**改动文件**：
1. src/services/memoryExtractor.ts 的 ExtractionInput 接口（现有 L8-14）
2. src/composables/useMemoryExtraction.ts 的 start() 函数（现有 L62-87）
3. src/components/pipeline/PipelinePanel.vue 的抽取调用（L2763 附近）

**具体改动**：

在 ExtractionInput 中增加 sourceVersionId 字段。

在 useMemoryExtraction.ts 的 start() 中，抽取成功后为每条结果补 factSource：

```typescript
const sourceVersionId = input.sourceVersionId || ""
const injectSource = (items) => items.map((item) => ({
  ...item,
  factSource: item.factSource || {
    sourceVersionId,
    chapterId: input.chapterId,
    chapterIndex: input.chapterIndex || 0,
    snippet: item.evidence?.[0]?.snippet || "",
    verified: false
  },
  factStatus: item.factStatus || "pending"
}))
```

在 PipelinePanel.vue 和 EditorPanel.vue 的抽取调用中传入 sourceVersionId。

**验证方法**：
1. 单元测试：模拟抽取结果，断言每条都有 factSource 和 factStatus
2. CDP：流水线正文确认后抽取，读取预览中的变更项，检查 factSource 存在
3. 确认写入后，读取 projectStore.memories.entities，检查 factStatus 从 pending 变为 confirmed

**引用经验**：evidence 必须对应真实正文（经验文件 ~L1830），snippet 在正文中真实存在校验在 B2 实现

---

## B. 抽取与证据（任务 B1-B3）

### B1: 统一 EditorPanel 与 PipelinePanel 的抽取调用入口

**目标**：两个面板调用记忆抽取时使用同一个服务入口，统一 purpose、超时、重试、取消和日志。

**改动文件**：
1. src/services/memoryExtractor.ts（现有 155 行）
2. src/composables/useMemoryExtraction.ts（现有 132 行）
3. src/components/editor/EditorPanel.vue（现有抽取入口 ~L119-124）
4. src/components/pipeline/PipelinePanel.vue（现有抽取入口 ~L2763）

**现状**（审计实证）：
- EditorPanel L119: const service = await getAiService() 然后 service.callAi({purpose: "generate", ...})
- PipelinePanel: 使用自身的 callMemoryApi/callApiWithAgent 路径
- 两套路径的 purpose、超时、重试策略不一致

**具体改动**：

在 memoryExtractor.ts 中新增统一调用封装 extractMemoryUnified()。
在 EditorPanel.vue 和 PipelinePanel.vue 中，都改为调用 extractMemoryUnified。

**不改的部分**：
- PipelinePanel 的 callApiWithAgent 用于生成流水线的正文/大纲/卷纲等，不动
- EditorPanel 的其他 AI 调用（内联AI菜单等），不动
- 只统一记忆抽取这一个调用点

**验证方法**：
1. 单元测试：mock getAiService，验证 extractMemoryUnified 调用 service.callAi 时的 purpose="generate"
2. CDP：EditorPanel 抽取和 PipelinePanel 抽取各跑一次，检查诊断日志中 purpose 字段一致
3. 对比两次调用的 timeoutMs 和 retry 字段是否一致

**引用经验**：EditorPanel 与 PipelinePanel 存在两套 AI 调用路径（经验文件 ~L514），统一入口不等于改其他调用

---

### B2: snippet 在正文中的真实存在校验

**目标**：AI 返回的 evidence snippet 必须在对应正文中真实出现，否则标记 verified=false 并进入待审核。

**改动文件**：
1. src/services/memoryExtractor.ts 的 parseJson() 函数（现有 L35-51）
2. src/composables/useMemoryExtraction.ts 的 start() 函数
3. src/components/pipeline/PipelinePanel.vue 的抽取流程（L2773 附近）

**现状**（审计实证）：
- memoryExtractor.ts L35-51 的 hasEvidence() 只检查 chapterId 和 snippet 非空
- 不验证 snippet 是否真实出现在正文中
- memoryMerger.ts L31 的 emptyEvidence() 甚至可以生成空 snippet

**具体改动**：

在 memoryExtractor.ts 中新增校验函数 verifySnippet(snippet, content)。
在 parseJson() 返回结果前，对每条 evidence 调用 verifySnippet。
parseJson 需要额外接收 originalContent 参数。

**验证方法**：
1. 单元测试：构造包含和不包含 snippet 的正文，验证 verifySnippet 返回值
2. CDP：抽取后检查预览中有「未验证」标记的条目
3. 确认写入后，projectStore 中对应条目的 evidence 有 verified 字段

**引用经验**：evidence 必须对应真实正文，空状态不能冒充真实数据验证（经验文件 ~L1712, ~L1830）

---

### B3: 抽取失败不阻塞正文保存 + 结构化日志

**目标**：正文保存和记忆抽取解耦。抽取失败时正文已保存，用户可重试抽取。

**改动文件**：
1. src/composables/useMemoryExtraction.ts 的 start() 函数
2. src/components/pipeline/PipelinePanel.vue 的 confirmBodyWithMemory() 函数（L2743-2783）
3. src/components/editor/EditorPanel.vue 的抽取流程

**具体改动**：

新增 ExtractionLog 接口，在 start() 各阶段记录结构化日志。
在 confirmBodyWithMemory() 中，确保正文保存发生在抽取之前：
1. 先保存正文
2. 记录版本
3. 再抽取（失败不回滚正文）

**验证方法**：
1. CDP：模拟 AI 超时，检查正文已保存且 UI 显示重试
2. CDP：模拟 JSON 解析失败，检查正文已保存且 UI 显示重试
3. 读取诊断日志，检查结构化日志记录了 phase/error/duration

**引用经验**：抽取失败不阻塞正文保存，断网/超时不丢正文（经验文件 ~L1839, ~L1851）

---

## C. 合并、审核与不覆盖（任务 C1-C3）

### C1: 禁止 Object.assign 直接覆盖，改为字段级更新

**目标**：合并器不能用 Object.assign 覆盖未比较的字段。

**改动文件**：src/services/memoryMerger.ts（现有 235 行）

**现状**（审计实证）：
- mergeEvents() L120: Object.assign(target, incoming, { updatedAt: now }) 直接覆盖
- mergeWorld() L137: Object.assign(target, incoming, { updatedAt: now }) 直接覆盖
- mergeForeshadowing() L155: Object.assign(target, incoming, { updatedAt: now }) 直接覆盖

**具体改动**：

对 mergeEvents()、mergeWorld()、mergeForeshadowing() 三个函数的更新分支，替换 Object.assign 为字段级更新。只更新有新值的字段，数组字段用追加。

**不改的部分**：
- mergeEntity() 已经是字段级更新（不用 Object.assign），不动
- mergeRelations() 已经是字段级更新，不动
- 新增条目的分支不动

**验证方法**：
1. 单元测试：已有事件 summary="旧", 抽取返回 summary="新", 断言旧被新替换
2. 单元测试：已有事件 characters=["A"], 抽取返回 characters=["B"], 断言结果为 ["A","B"]
3. 单元测试：锁定的事件不被更新

**引用经验**：Object.assign 直接覆盖未比较字段是已审计的根因（memoryMerger.ts 实证）

---

### C2: 引入事实状态生命周期

**目标**：新抽取的条目默认 pending，用户确认后变 confirmed；冲突条目标记 conflicted。

**改动文件**：
1. src/services/memoryMerger.ts
2. src/composables/useMemoryExtraction.ts 的 confirm() 函数（现有 L99-119）
3. src/components/pipeline/PipelinePanel.vue 的 confirmMemoryPreview() 函数（L2796-2824）

**具体改动**：

在 memoryMerger.ts 合并逻辑中，处理 factStatus：
- target.factStatus="confirmed" 且 incoming.factStatus="pending" -> 标记 conflicted
- 用户确认后 factStatus 从 pending 改为 confirmed

在 confirm() 中，确认写入时把 factStatus 从 pending 改为 confirmed。
在 PipelinePanel.vue 的 confirmMemoryPreview() 中做同样处理。

**验证方法**：
1. 单元测试：confirmed + pending 同一实体 -> 断言 conflicted
2. CDP：抽取后确认写入，读取 projectStore，检查 factStatus=confirmed
3. CDP：拒绝一条，检查对应条目不在 memories 中或标记为 rejected

**引用经验**：引入 confirmed/pending/stale/conflicted/rejected 状态（审计报告第4节C项）

---

### C3: 导入默认合并，覆盖需二次确认+备份

**目标**：导入记忆 JSON 时默认合并，覆盖导入必须先备份再覆盖，且支持撤销。

**改动文件**：
1. src/components/common/MemoryPanel.vue 的 importMemory() 函数（现有 L266-282 附近）
2. src/services/memoryIO.ts（现有 183 行）

**现状**（审计实证）：
- MemoryPanel.vue L266-282: 导入成功后直接 projectStore.memories = result.memory
- 覆盖导入提示「将覆盖当前记忆数据」，但无备份、无撤销
- memoryIO.ts 有 mergeImportedMemory() 函数（正确），但覆盖路径不用它

**具体改动**：

覆盖导入路径增加：二次确认 + 备份到 localStorage + 覆盖 + 撤销提示。
合并导入路径改用 mergeImportedMemory() + recordMemoryChange()。
在 memoryIO.ts 中增加 recoverFromBackup() 函数。

**验证方法**：
1. 单元测试：覆盖导入后检查备份存在，且可恢复
2. CDP：覆盖导入后检查项目存储中有备份 key
3. CDP：合并导入后检查原有数据不丢失
4. CDP：坏 JSON 导入后检查当前数据不变

**引用经验**：导入合并与覆盖必须分开，覆盖导入无备份不可撤销（经验文件 ~L1785, ~L1800）

---

## D. 持久化、并发和 UI（任务 D1-D3）

### D1: saveProject 写入队列 + 关闭流程等待

**目标**：所有 saveProject 调用排队执行，关闭应用时等待最终保存完成。

**改动文件**：
1. src/stores/project.ts 的 saveProject() 函数（现有 L166-183）
2. electron/ipc/lifecycle.js（现有 29 行）
3. src/App.vue 或主进程的关闭处理逻辑

**现状**（审计实证）：
- project.ts 的 saveProject() 是 async，但大量调用点没有 await（经验文件 ~L1832）
- lifecycle.js L21: setTimeout(function() { mainWindow.close() }, 500) 固定等500ms
- 500ms 可能不够等待 saveProject 完成

**具体改动**：

在 project.ts 中增加写入队列：连续多次 saveProject 只执行最后一次。
在 lifecycle.js 中，把固定 500ms 改为等待 finalSave 完成的 Promise（最多5秒超时保底）。
在 App.vue 中，监听 app:finalSave 后调用 projectStore.saveProject()，完成后 ipcRenderer.send("app:saveComplete")。

**验证方法**：
1. 单元测试：连续调用 saveProject 3次，断言只执行1次 storageWrite
2. CDP：打开项目，修改数据，关闭应用，重启后检查数据一致
3. CDP：杀进程后重启，检查数据未丢失

**引用经验**：关闭只等500ms不够（lifecycle.js:11-29 实证），recordMemoryChange后必须await saveProject（经验文件 ~L1832）

---

### D2: 项目切换时取消/隔离旧请求

**目标**：切换项目时，旧项目的 AI 请求不回写到新项目 Store。

**改动文件**：
1. src/stores/project.ts 的 loadProject() 和 clearCurrent() 函数
2. src/composables/useMemoryExtraction.ts
3. src/components/pipeline/PipelinePanel.vue 的抽取流程

**具体改动**：

在 loadProject() 开头记录 projectIdAtCall，异步加载后检查是否仍为当前项目。
在 useMemoryExtraction.ts 的 start() 和 confirm() 中增加项目 ID 检查。
在 PipelinePanel.vue 的抽取流程中做同样检查。

**验证方法**：
1. CDP：在项目A中开始抽取，中途切换到项目B，等待抽取完成，检查项目B的记忆没有被写入
2. CDP：在项目A中抽取完成后但未确认写入时切换到项目B，检查项目B不受影响

**引用经验**：异步保存竞态、切换期间请求回写、跨项目缓存污染（审计报告第2节#26）

---

### D3: MemoryPanel 新模型统一 CRUD + 五视图验证

**目标**：MemoryPanel 不再「新模型只读+旧模型可编辑」，五类记忆都支持统一 CRUD。

**改动文件**：
1. src/components/common/MemoryPanel.vue（现有约300行）
2. 可能涉及 src/components/memory/RelationGraph.vue、TimelineView.vue 等子组件

**现状**（审计实证）：
- MemoryPanel.vue L132-245: 旧 items 有编辑/删除按钮，新模型没有
- legacyIndex 用于旧 items 的索引，新模型用 entity.id 等
- 展示索引与 legacyIndex 可能错位

**具体改动**：

为新模型五类增加 CRUD 按钮，调用 projectStore 的 updateEntity、deleteEntity、lockEntityField 等已有方法。
对关系、事件、世界观、伏笔也增加编辑/删除/锁定按钮。
移除 legacyIndex 的混用。

**验证方法**：
1. CDP：打开记忆面板，编辑一个实体，检查五视图都更新
2. CDP：删除一个实体，检查关联关系也被清理
3. CDP：锁定一个实体字段，重新抽取后检查该字段不被覆盖
4. CDP：用真实非空数据（不是空状态）验证五视图

**引用经验**：MemoryPanel 展示索引与 legacyIndex 可能错位（审计报告第2节#22），空状态不能冒充真实数据验证（经验文件 ~L1712）

---

## 任务依赖与执行顺序

```text
A1 -> A2 -> A3 -> B1 + B2 -> B3 -> C1 -> C2 -> C3 -> D1 -> D2 -> D3
```

A1 必须先做，因为后续所有任务都依赖新字段。D3 最后做，因为它依赖所有数据模型和存储改动完成。B1 和 B2 可以并行，但建议顺序执行避免冲突。C1-C3 有依赖关系，不能并行。D1-D3 有依赖关系，不能并行。

---

## 第一版硬验收门

以下全部通过才算第一版完成。任何一项未通过，不算完成。

| 编号 | 验收项 | 验证方法 | 通过标准 |
|------|--------|---------|--------|
| V1 | 新旧项目加载后字段一致 | Vitest + CDP | 旧项目加载后 sourceVersions=[], factStatus="confirmed" |
| V2 | 正文确认后版本记录存在 | CDP | projectStore.memories.sourceVersions 有记录 |
| V3 | 抽取结果每条有 factSource | Vitest | 断言 factSource.sourceVersionId 非空 |
| V4 | EditorPanel和PipelinePanel统一入口 | CDP | 诊断日志中 purpose/timeoutMs 一致 |
| V5 | snippet 校验功能 | Vitest | verified=true/false 正确 |
| V6 | 抽取失败正文已保存 | CDP | 超时后正文在 projectStore 中 |
| V7 | Object.assign 已替换 | 代码审查 | mergeEvents/World/Foreshadowing 无 Object.assign |
| V8 | 事实状态生命周期 | Vitest + CDP | pending->confirmed, 冲突标记 conflicted |
| V9 | 导入合并不覆盖 | CDP | 合并后原有数据保留 |
| V10 | 覆盖导入有备份 | CDP | 备份 key 存在 |
| V11 | 坏JSON不改变数据 | CDP | 当前数据不变 |
| V12 | saveProject 队列执行 | Vitest | 连续3次只写1次 |
| V13 | 关闭重开数据一致 | CDP | 杀进程重启后记忆数据一致 |
| V14 | 项目切换不串写 | CDP | 切换后旧请求不写入新项目 |
| V15 | MemoryPanel CRUD | CDP | 五类记忆可编辑/删除/锁定，五视图更新 |
| V16 | 五视图真实非空数据 | CDP | 关系图/时间线/图谱/思维导图/画像卡有内容 |

---

## 验证矩阵（每项验证必须产出）

| 验证层 | 必须证明 | 证据形式 |
|--------|---------|---------|
| 静态链路 | UI事件->服务->Store->持久化 | 文件/函数/调用关系/字段读写 |
| 单元契约 | 解析/校验/合并/迁移边界正确 | Vitest 原始输出 |
| 组合链路 | 正文保存->抽取->审核->写入->视图更新 | CDP操作日志+状态前后对照 |
| 错误路径 | 超时/断网/非法JSON/取消/重复不丢正文 | 错误日志+恢复后状态 |
| 持久化 | 关闭重开后数据一致 | 文件快照before/after+重启后读取 |
| 隔离 | 切换项目不串写 | 两个项目的独立ID/请求/文件对照 |
| 视觉交互 | 五视图真实数据+筛选+来源跳转 | 截图+DOM状态+应用日志 |

---

## 禁止事项

1. 禁止把代码存在当作真实行为通过
2. 禁止用空状态冒充真实数据验证
3. 禁止用构建成功覆盖类型检查/测试/CDP/安装包验收
4. 禁止用受控API响应冒充供应商稳定性
5. 禁止跳过验证步骤进入下一步
6. 禁止引入新 npm 依赖
7. 禁止用 PowerShell Set-Content 写含中文源文件
8. 禁止批量正则替换，必须精准修复
9. 禁止 Object.assign 直接覆盖未比较字段
10. 禁止覆盖导入无备份

---

## 施工流程模板（每个任务必须遵循）

```text
1. 读经验文件相关教训
2. 读当前源码（具体文件/函数/行号）
3. 用 apply_patch 或 Node.js fs 修改
4. node --check 验证语法
5. npm run build:vue 验证构建
6. 写 Vitest 单元测试（如适用）
7. start-electron.bat 启动应用
8. CDP/Playwright 行为验证
9. 截图 + JSON日志 + 时间戳
10. 更新 _audit/checkpoint.md
11. 更新 update_plan
12. 验证通过后才进入下一任务
```

---

## 当前已知文件清单（施工前必读）

| 文件 | 行数 | 职责 |
|------|------|------|
| src/types/memory.ts | ~139 | 记忆数据模型定义 |
| src/services/memoryExtractor.ts | ~155 | AI单阶段抽取 |
| src/services/memoryMerger.ts | ~235 | 增量合并（有Object.assign覆盖风险） |
| src/services/memoryVersion.ts | ~95 | 快照式 before/after 版本 |
| src/services/memoryIO.ts | ~183 | 导入导出+合并+覆盖 |
| src/services/memoryRetriever.ts | ~100 | 字符串匹配检索 |
| src/services/memoryExport.ts | ~140 | 角色画像/故事线/时间线/场景导出 |
| src/stores/project.ts | ~730 | 项目Store（memories响应式状态+normalizeMemories） |
| src/composables/useMemoryExtraction.ts | ~132 | 抽取+预览+审核+确认组合式 |
| src/components/common/MemoryPanel.vue | ~300 | 记忆面板UI（新旧混排） |
| src/components/pipeline/PipelinePanel.vue | ~2900 | 流水线（含正文确认+抽取入口） |
| src/components/editor/EditorPanel.vue | ~130 | 编辑器（含记忆抽取入口） |
| src/components/chat/ChatPanel.vue | ~500 | 聊天（retrieveContext注入） |
| electron/ipc/lifecycle.js | ~29 | Electron关闭流程（固定500ms） |
| src/services/aiService.ts | ~340 | 统一AI服务（purpose路由） |

---

## 附录：审计报告关键发现摘要

以下来自 _audit/MEMORY_DEEP_AUDIT_AND_PLAN_REVIEW_2026-08-27.md 的 26 维审计矩阵：

**当前状态**：
- 基础记忆模型：PARTIAL
- 正文抽取审核写入：PARTIAL
- 记忆面板与五视图：PARTIAL
- 生成流水线/聊天读取：PARTIAL
- 保存恢复与多项目隔离：PARTIAL
- 记忆线对齐与修改影响传播：MISSING
- 动画/短剧真实板块：MISSING
- 全量真实行为验收：UNVERIFIED

**第一版只解决 PARTIAL -> PASS 的升级，不解决 MISSING（那是第二版/第三版的范围）。**

**根因总结**：
1. 把记忆对象当成记忆事实（缺来源、版本、状态）
2. 抽取/合并/检索之间缺少同一条来源主键
3. EditorPanel 与 PipelinePanel 存在两套调用路径
4. UI 是「新模型只读+旧模型可编辑」的过渡态
5. 历史验收把静态证据和行为证据混在一起

**第一版的目标就是把根因 1-5 全部从 PARTIAL 升级到 PASS。**


---

# v2经验强制修订章（以本章为准）

本文件前面的12项A1-D3保留为功能范围；如前文与本章冲突，以本章施工纪律和验证门为准。本章依据神意开发经验总结_v2.md（2026-08-31版）及2026-09-01上下文记忆、长文本续生成开发日志整理。

## 1 范围边界

第一版只做来源版本、事实证据、抽取审核、字段级合并、导入不丢失、异步保存与关闭恢复、项目隔离、记忆面板真实CRUD。第二版记忆线对齐/影响传播，第三版动画短剧/MCP/向量索引/动态Agent不得混入本次施工。旧架构只提取行为契约，禁止整文件复制；新架构业务状态进入Pinia，组件用computed，子组件用emits。

## 2 单任务施工闭环

严格执行A1到D3，一次只做一个任务：读经验和代码，声明影响圈，精准修改，立即type-check或node --check和git diff --check，构建，启动源Electron，真实操作逐步断言，截图、JSON台账、时间戳，finally恢复和清理，更新checkpoint、ERROR_LOG、DEV_LOG，通过后再进入下一项。禁止批量修改、整文件复制、整文件重写和批量正则。含中文源码不得用PowerShell写入；CSS先搜后改。

## 3 探针和工具硬规则

复杂探针写独立cjs或mjs；Node侧不访问document，浏览器代码放Runtime.evaluate(async () => ...)；多参数包装成对象；脚本显式process.exit。探针必须有前置快照、逐操作断言、finally恢复和清理三段式。每段写同一JSON文件，包含timestamp、projectId、allStepsOk、runtimeErrors及before/action/expected/actual。截图设置3到15秒超时并可降级视口截图。工具连续失败两次立即换路径，不重复原方法。源Electron必须验证9227端口，PID存在不等于页面可用。

## 4 真实存储和AI边界

验证固定真实projectId，先核对项目再读取对应wa_project_<id>；必须分别证明磁盘来源真实和请求体实际注入，仅读Store不算通过。恢复时等待IPC Promise；recordMemoryChange和recordSourceVersion后的saveProject必须await；关闭不得依赖固定500毫秒，必须等待finalSave Promise，桥接名先核对实际preload API。导入默认合并，覆盖必须二次确认、先备份、可恢复；坏JSON不得改变数据。抽取失败、断网、超时、非法JSON、取消不能回滚正文，也不能写伪造assistant轮次，日志包含phase、status、errorKind、duration、projectId、chapterId。

## 5 v2验收门

V1旧新数据归一化且未知字段不丢；V2两正文入口记录来源版本；V3事实有真实snippet、sourceVersionId和状态；V4两入口抽取参数一致；V5抽取失败正文仍可恢复；V6字段级合并保护锁定字段并保留冲突来源；V7导入合并不覆盖且覆盖可恢复；V8保存队列和关闭重开可靠；V9项目切换不串写；V10五类记忆真实CRUD和视图更新；V11失败取消空输出无伪成功；V12本版无范围污染。

任一门缺少截图、JSON原始字段、时间戳、逐步行为断言或磁盘证据，只能标PARTIAL或UNVERIFIED，不得宣称完成。每次错误立即写ERROR_LOG；每项更新checkpoint和日期DEV_LOG；新经验按v2决策树归位。

## 6 新对话框执行口令

先读取本文件和D:/codex/novel-workshop-vue3/_audit/神意开发经验总结_v2.md，只执行第一版A1-D3，严格一次一个任务。没有证据就标PARTIAL或UNVERIFIED，不得用代码存在、构建成功或空状态冒充通过。