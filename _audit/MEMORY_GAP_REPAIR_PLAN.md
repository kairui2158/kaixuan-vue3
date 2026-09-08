# 记忆板块 12 项缺口升级修复方案

> 审计日期：2026-09-06
> 审计范围：types/memory.ts + types/g6.ts + 7 service + 2 composable + 6 memory component + MemoryPanel + EditorPanel + PipelinePanel + ChatPanel + project store
> 社区调研：GitHub repos（ontosphere/knowledge-graph-editor/SillyTavern character card）+ G6 v5 文档 + Vue3 响应式最佳实践

---

## 缺口总览

| # | 缺口 | 严重度 | 核心问题 |
|---|---|---|---|
| 1 | 专用导出函数是死代码 | 严重 | memoryExport.ts 4 个导出函数无 UI 调用 |
| 2 | 版本历史和回滚没有 UI | 严重 | Store 有 3 个方法但 MemoryPanel 不调用 |
| 3 | 超时时间不一致 | 中等 | 流水线 30s vs 编辑器 300s |
| 4 | factStatus 没有 UI | 中等 | pending/confirmed/conflicted 用户看不到 |
| 5 | 冲突解决没有 UI | 中等 | conflicted 状态无界面处理 |
| 6 | 黑名单没有 UI | 中等 | Store 有方法但面板不暴露 |
| 7 | 记忆统计仪表盘缺失 | 中等 | meta 数据存在但不展示 |
| 8 | 列表视图没有文本搜索 | 低 | 几百条目只能滚动查找 |
| 9 | 关系图不能交互编辑 | 低 | 不能在图上直接创建关系 |
| 10 | 伏笔追踪不完整 | 低 | 缺回收章节字段 + 专项视图 |
| 11 | 自动抽取开关 | 低 | 没有 on/off 设置项 |
| 12 | 实体去重没有手动入口 | 低 | AI 用不同名字时无法手动合并 |

---

## 社区调研结论

### 1. 知识图谱编辑器（缺口 1/2/9）

**ontosphere（221 stars）** 浏览器端 RDF/本体知识图谱编辑器，可借鉴：
- 多场景画布：一个图数据多个聚焦视图，带动画过渡。我们的关系图/图谱分析/思维导图已做到
- 画布上直接编辑：双击节点弹出编辑面板，拖拽两节点创建边。这正是缺口 9 需要的交互
- MCP tool surface：通过 MCP 暴露图操作接口。我们当前不需要但说明图编辑器可以服务化

**knowledge-graph-visualiser（D3.js）** 的做法：
- Wikidata 集成做实体消歧——对应缺口 12 手动合并/消歧
- 实时预览：编辑图时右侧面板同步更新属性——用 G6 的 node:dblclick 事件触发

### 2. SillyTavern 角色卡生态（缺口 1/10）

社区标准格式 V2/V3，我们的 exportCharacterCardV3 已兼容。社区做法：
- character_book 字段：角色卡内嵌关联实体（世界观/物品/关系），不只是单角色导出。exportCharacterProfile 可扩展为带关联实体的完整角色档案包
- alternate_greetings：多个开场白变体。对应我们的多版本正文快照
- 社区有 tavernTranslator（76 stars）做角色卡翻译和字段映射，说明导出格式需要标准化

### 3. 实体消歧/去重（缺口 12）

**Dupli-Hunt** 使用 Union-Find 聚类 + 主动学习审查队列：
- 自动计算相似度后生成待确认合并对
- 用户审核后才执行合并
- 这比我们当前"自动按名称匹配，不匹配就跳过"更可靠

建议：在 MemoryPanel 列表视图增加"合并建议"入口，基于名称相似度（编辑距离）+ 别名交叉匹配生成合并候选对，用户确认后调用一个新的 store.mergeEntities(id1, id2) 方法。

### 4. 版本历史/回滚（缺口 2）

**OfflineNotesEngine** 的做法：
- 版本树而非线性历史：每次编辑创建快照节点，回滚是跳转到某个快照节点
- 当前我们的 memoryVersion.ts 已有 before/after 快照，但只支持线性回滚
- 更优做法：在 MemoryPanel 增加"历史记录"标签页，用时间线视图展示快照节点，点击节点可预览该版本的记忆状态差异

### 5. G6 v5 交互能力（缺口 9）

G6 v5 原生支持：
- drag-element：拖拽节点
- brush-select：框选
- click-select：点选
- 缺少原生的"连边"交互（拖拽节点A到节点B创建边）

社区做法：在 G6 上监听 node:pointerdown + node:pointerup，计算两点距离，如果小于阈值则创建边。我们在 RelationGraph.vue 增加 create-edge 交互模式。

---

## 逐项修复方案

### 缺口 1：专用导出函数接入 UI

**现状**：memoryExport.ts 定义了 exportCharacterProfile / exportStoryline / exportTimeline / exportScene，但没有任何组件导入调用。

**方案**：在 MemoryPanel.vue 的"更多"下拉菜单增加 4 个选项：

```
导出 → 角色档案（shenyi-character-profile）
导出 → 故事线（shenyi-storyline）
导出 → 时间线（shenyi-timeline）
导出 → 场景包（shenyi-scene）
```

每个选项调用对应导出函数，生成 JSON，通过 electronAPI.dialogSaveFile 保存文件。

**改动文件**：
- MemoryPanel.vue（增加 4 个菜单项 + 4 个导出函数）

**社区更优做法**：角色档案导出时自动查找该实体的所有关联实体（关系、共同出场事件），打包成一个完整档案。在 memoryExport.ts 的 exportCharacterProfile 函数中增加 relations 参数：
```ts
export function exportCharacterProfile(memory: MemoryData, entityId: string): string | null
// 改为
export function exportCharacterProfile(
  memory: MemoryData,
  entityId: string,
  options?: { includeRelations?: boolean; includeEvents?: boolean }
): string | null
```

---

### 缺口 2：版本历史和回滚 UI

**现状**：Store 有 rollbackMemoryTo / rollbackMemoryByChapter / getMemoryChangeHistory，MemoryPanel 不调用。

**方案**：在 MemoryPanel.vue 的"更多"下拉菜单增加"版本历史"选项，点击后打开一个模态框：

1. 顶部显示统计：N 次变更，最早 X，最近 Y
2. 列表展示每条 MemoryChangeRecord：时间、原因、章节
3. 每条有"预览"按钮：展示 before/after 的实体数/事件数/关系数差异
4. 每条有"回滚到此版本"按钮：调用 projectStore.rollbackMemoryTo(record.id)
5. 底部有"按章节回滚"入口：选择章节后调用 rollbackMemoryByChapter

**改动文件**：
- MemoryPanel.vue（增加历史模态 + 回滚交互）
- 无需改 Store 或 service（方法已存在）

**社区更优做法**：版本树而非线性列表。但我们的数据量不大（小说最多几百次变更），线性列表 + 筛选足够。如果未来需要版本树，可以在时间线视图上叠加版本节点。

---

### 缺口 3：统一超时时间

**现状**：PipelinePanel 调用 extractMemory(..., 30000) 用 30 秒，EditorPanel 通过 useMemoryExtraction 用默认 300 秒。

**方案**：统一为 300 秒（5 分钟）。长章节 AI 抽取需要时间，30 秒太短。

在 PipelinePanel.vue 第 2859 行：
```ts
// 改前
const result = await extractMemory({...}, callMemoryApi, 30000)
// 改后
const result = await extractMemory({...}, callMemoryApi, 300000)
```

同时增加设置项：在设置面板的"去AI味"或"诊断"tab 增加"记忆抽取超时"配置（默认 300 秒，可调 60-600 秒）。

**改动文件**：
- PipelinePanel.vue（1 行改 30000 → 300000）
- settings store + SettingsModal（增加超时配置项）

---

### 缺口 4：factStatus 展示

**现状**：类型有 FactStatus = confirmed/pending/stale/conflicted/rejected，抽取时自动设 pending，确认时设 confirmed，冲突时设 conflicted。但 MemoryPanel 不显示。

**方案**：在 MemoryPanel 列表视图的每条记录上增加状态徽章：

- pending → 黄色圆点 + "待确认"
- confirmed → 绿色圆点 + "已确认"
- conflicted → 红色圆点 + "有冲突"
- stale → 灰色圆点 + "过期"
- rejected → 灰色圆点 + "已拒绝"

在筛选栏增加状态筛选下拉：全部/待确认/已确认/有冲突。

**改动文件**：
- MemoryPanel.vue（状态徽章 + 筛选下拉）

**社区更优做法**：批量操作栏。选中多个条目后批量确认/拒绝。在列表顶部增加批量操作栏：全选/批量确认/批量拒绝。

---

### 缺口 5：冲突解决 UI

**现状**：新抽取数据和已确认数据冲突时 factStatus 变 conflicted，但无界面处理。

**方案**：在 MemoryPanel 列表视图，点击 conflicted 状态的条目，展开冲突详情面板：

1. 左栏：当前已确认版本（旧值）
2. 右栏：新抽取版本（新值）
3. 差异高亮：字段级别对比，不同值标红
4. 操作按钮：保留旧值 / 采用新值 / 手动编辑 / 标记为已解决

这需要 memoryMerger 在冲突时保存 conflictingData。当前 mergeEntity 只是改 factStatus，没有保存冲突详情。

**改动文件**：
- memoryMerger.ts（冲突时保存 conflictingData 到实体/关系/事件/世界观/伏笔）
- MemoryPanel.vue（冲突详情面板）
- types/memory.ts（增加 conflictsData?: Record<string, { oldValue: any; newValue: any }> 字段）

**社区更优做法**：Dupli-Hunt 的主动学习审查队列模式——把所有 conflicted 条目放入一个审查队列，用户逐条审核。比展开面板更结构化。建议：在 MemoryPanel 增加一个"冲突审查"标签，只展示 conflicted 条目，用户逐条处理。

---

### 缺口 6：黑名单 UI

**现状**：Store 有 addToBlacklist/removeFromBlacklist/isBlacklisted，MemoryPanel 不暴露。

**方案**：

1. 在实体卡片的操作按钮区增加"加入黑名单"按钮（小按钮，红色图标）
2. 在"更多"下拉菜单增加"黑名单管理"选项，打开模态框：
   - 列表展示所有黑名单实体
   - 每条有"移除"按钮（从黑名单移除）
3. 黑名单实体的卡片在列表中显示灰色遮罩 + "已屏蔽"标记

**改动文件**：
- MemoryPanel.vue（黑名单管理模态 + 卡片操作按钮）
- CharacterCard.vue（加入黑名单按钮）

---

### 缺口 7：记忆统计仪表盘

**现状**：MemoryMeta 有 extractionCount/lastExtractedAt/pendingCount/totals，MemoryPanel 不展示。

**方案**：在 MemoryPanel.vue 头部和列表视图之间增加统计栏：

```
[抽取 12 次] [实体 45] [关系 23] [事件 67] [世界观 8] [伏笔 5] [待确认 3] [最近抽取 2小时前]
```

每个数字是可点击的，点击跳转到对应分类 + 状态筛选。

**改动文件**：
- MemoryPanel.vue（统计栏 + 跳转交互）

**社区更优做法**：增加趋势图——最近 10 次抽取的实体/事件增长曲线。用 G6 的 mini chart 或简单 CSS bar。但这是锦上添花，第一版先做数字栏。

---

### 缺口 8：列表视图全文搜索

**现状**：列表视图有分类筛选但无搜索框。

**方案**：在 MemoryPanel 列表视图的内容头部增加搜索输入框：

1. 输入框 placeholder: "搜索记忆..."
2. 实时搜索：输入时筛选 memoryDisplayItems 中 key/content/category/实体name/aliases/description 等字段
3. 搜索结果高亮匹配关键词
4. 搜索框旁显示结果数："找到 N 条"

**改动文件**：
- MemoryPanel.vue（搜索框 + filteredItems 计算属性增加搜索条件）

**社区更优做法**：模糊搜索 + 拼音搜索。使用 fuse.js（轻量模糊搜索库，~6KB）做模糊匹配。但我们的数据量不大（最多几百条），简单的 String.includes 已够用。如果用户需要模糊搜索，未来引入 fuse.js。

---

### 缺口 9：关系图交互编辑

**现状**：关系图只能查看和选中，不能在图上直接创建关系。

**方案**：在 RelationGraph.vue 增加两种交互模式：

1. **查看模式**（默认）：现有行为不变
2. **编辑模式**（切换按钮）：
   - 双击节点：弹出实体编辑对话框（复用 MemoryPanel 的 openEditDialog）
   - 拖拽节点A到节点B（距离 < 50px 时释放）：弹出"创建关系"对话框
   - 点击边：弹出关系编辑对话框

实现：在 G6Canvas.vue 监听 node:dblclick 事件并 emit。在 RelationGraph.vue 增加编辑模式切换按钮和 create-edge 交互。

**改动文件**：
- G6Canvas.vue（增加 node:dblclick emit）
- RelationGraph.vue（编辑模式 + 创建关系对话框）

**社区更优做法**：ontosphere 的画布上直接编辑模式。G6 v5 的 behaviors 配置可以增加自定义交互。使用 G6 v5 的 registerBehavior API 注册 create-edge 行为。

---

### 缺口 10：伏笔追踪完善

**现状**：编辑对话框缺 revealChapterId/revealChapterIndex，没有"未解决伏笔"专项视图。

**方案**：

1. 在 foreshadowingFields 数组增加两个字段：
   - { name: 'revealChapterId', label: '回收章节 ID' }
   - { name: 'revealChapterIndex', label: '回收章节序号' }
2. 在 MemoryPanel 列表视图增加"伏笔追踪"快捷筛选按钮：
   - 只显示 status !== 'resolved' && status !== 'abandoned' 的伏笔
   - 按状态分组：已埋设/推进中/待回收
3. 在伏笔卡片上显示"埋设于第X章"和"计划回收于第Y章"（如果有）

**改动文件**：
- MemoryPanel.vue（编辑字段 + 筛选 + 卡片展示）

---

### 缺口 11：自动抽取开关

**现状**：流水线正文确认时自动触发记忆抽取，没有设置项关闭。

**方案**：

1. 在 settings store 增加 autoExtractMemory: boolean（默认 true）
2. 在设置面板的"诊断"或"外观"tab 增加开关："正文确认后自动抽取记忆"
3. PipelinePanel 的 confirmBodyWithMemory 函数开头加判断：
   ```ts
   if (!settingsStore.autoExtractMemory) {
     // 只保存正文，不抽取记忆
     confirmStep(4)
     return
   }
   ```
4. 编辑器的 extractCurrentMemory 保持手动触发（已经是按钮触发，不需要开关）

**改动文件**：
- settings store（增加 autoExtractMemory 字段）
- SettingsModal.vue（增加开关）
- PipelinePanel.vue（confirmBodyWithMemory 增加判断）

---

### 缺口 12：实体手动合并

**现状**：合并器自动按名称/别名匹配实体，AI 用不同名字时不合并。无手动合并入口。

**方案**：

1. 在 MemoryPanel 列表视图增加"合并建议"入口（在"更多"菜单中）：
   - 自动计算名称相似度（编辑距离 + 别名交叉）生成合并候选对
   - 展示候选对：实体A名称 vs 实体B名称，相似度百分比
   - 每对有"合并"/"跳过"按钮
2. 手动合并入口：在实体卡片操作区增加"合并到..."按钮：
   - 点击后弹出实体选择器（下拉列表）
   - 选择目标实体后弹出确认对话框
   - 确认后调用新的 store.mergeEntities(sourceId, targetId)
3. 在 project store 增加 mergeEntities 方法：
   - 把 source 的 aliases/description/evidence 合并到 target
   - 把指向 source 的关系改为指向 target
   - 删除 source 实体
   - 记录变更历史

**改动文件**：
- project.ts（增加 mergeEntities 方法）
- MemoryPanel.vue（合并建议 + 手动合并入口）
- CharacterCard.vue（"合并到..."按钮）
- memoryMerger.ts（增加 calculateMergeCandidates 工具函数）

**社区更优做法**：Dupli-Hunt 的 Union-Find 聚类 + 主动学习审查队列。比简单编辑距离更可靠，但实现复杂度高。第一版用编辑距离 + 别名交叉足够，未来可以升级。

---

## 实施优先级

| 批次 | 缺口 | 预计改动量 | 改动文件数 |
|---|---|---|---|
| P0 紧急 | 1, 2, 3 | ~200行 | 3 |
| P1 重要 | 4, 5, 6, 7 | ~350行 | 4 |
| P2 增强 | 8, 9, 10 | ~250行 | 4 |
| P3 完善 | 11, 12 | ~150行 | 5 |
| 总计 | 12项 | ~950行 | 最多 8 个文件 |

---

## 验证方案

### 代码验证
- 每项缺口修复后运行 vitest 验证不破坏现有 6 个 spec 文件 11 个测试
- 新增的 store 方法增加 spec 文件
- 新增的导出 UI 增加手动验证

### 行为验证
- Playwright 脚本：点击 MemoryPanel 每个新按钮，验证 DOM 响应
- 真实抽取流程：用短文本正文走一次完整流程，验证新 UI 正确展示
- 导出验证：每个新导出选项生成文件后检查 JSON 格式

### 回归验证
- 现有 5 种视图（列表/关系图/图谱分析/思维导图/时间线）功能不变
- 现有 CRUD 操作不受影响
- 现有导入导出功能不受影响

---

## 风险评估

1. **MemoryPanel.vue 膨胀**：当前已有 ~850 行模板 + ~500 行脚本，增加 12 项功能后可能超 2000 行。建议把历史模态、冲突模态、黑名单模态拆成独立子组件。
2. **types/memory.ts 变更**：缺口 5 需要增加 conflictsData 字段，会影响所有实现 MemoryEntity/Relation/Event 的地方。需要确保 normalizeMemories 兼容。
3. **G6 交互模式**：缺口 9 的自定义交互依赖 G6 v5 API，需要验证 registerBehavior 的稳定性。
4. **性能**：搜索/合并建议/冲突对比都是前端计算，数据量大时可能卡顿。限制搜索范围和合并候选对数量。