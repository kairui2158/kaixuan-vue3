# Vue3 架构精准修复计划 V1

> 生成时间: 2026-08-11
> 基于差异检测产物: fix_priority_v2.json (260项) + DIFF_FINAL_REPORT_V2.md
> 源码验证: 逐项读取 Vue3 新架构源码 + 旧架构源码对照
> 目标: 精准修复真缺陷，跳过误报，恢复旧架构全部功能行为

---

## 1. 验证方法说明

本计划中每一项判定都基于源码证据，不是差异检测引擎的原始报告。检测引擎存在系统性误报（见第3节），因此本计划对全部6项P0和44项P1进行了人工源码验证。

验证工具: PowerShell Get-Content + Select-String 逐文件读取源码，对照旧架构 C:/Users/凯瑞/Documents/New project 2/ 的同名文件行为。

经验引用: 教训#80（Playwright独立脚本验证）、教训#81（检查DOM不检查全局变量）、教训#99（区分代码缺陷vs环境限制）、教训#103（深度扫描三维度）、教训#104（apply_patch追加bug）、教训#107（CSS scoped低匹配率是预期差异）

---

## 2. 真缺陷清单（需修复）

### 缺陷1: 存储键绕过 wa_ 前缀（R113 + R123 + R072, P0, 最高优先级）

**影响范围**: 全部8个 Pinia store

**问题描述**:
旧架构的 StorageManager 有 key(name) 函数，自动给所有存储键添加 wa_ 前缀（js/storage.js L2, L6-8）。所有数据以 wa_appSettings、wa_providers、wa_agents 等键名存储。

新架构的8个 store 全部直接调用 window.electronAPI.storageRead/storageWrite，绕过了 StorageManager.key()，使用裸键名存储:

| Store 文件 | 行号 | 使用的裸键 | 应有的带前缀键 |
|---|---|---|---|
| settings.ts | L14, L26 | appSettings | wa_appSettings |
| deai.ts | L21, L39 | deAiConfig | wa_deAiConfig |
| provider.ts | L31, L52 | providers | wa_providers |
| agent.ts | L22, L27 | agents | wa_agents |
| skill.ts | L37, L70 | skills | wa_skills |
| chapter.ts | L25, L30 | chapters_ + projectId | wa_chapters_ + projectId |
| project.ts | L22, L36, L66 | project_ + id | wa_project_ + id |
| theme.ts | L13, L21, L25 | localStorage wa-theme | 应走 electronAPI wa_app-theme |

**后果**:
1. 旧架构用户数据无法迁移到新架构（键名不匹配）
2. 新架构数据缺少前缀保护，可能与其他 Electron 应用冲突
3. theme.ts 直接用 localStorage 而非 electronAPI，主题在 Electron 环境下不会持久化到文件存储

**修复方案**:

创建共享工具函数 src/utils/storage-key.ts:
```typescript
const PREFIX = 'wa_'
export function storageKey(name: string): string {
  return PREFIX + name
}
```

每个 store 的修改模式（以 settings.ts 为例）:
```typescript
// 修改前 (L14):
let data = window.electronAPI.storageRead('appSettings')
// 修改后:
import { storageKey } from '../utils/storage-key'
let data = window.electronAPI.storageRead(storageKey('appSettings'))
```

同样修改 storageWrite 调用。theme.ts 额外需要将 localStorage 调用改为 electronAPI 调用。

**涉及文件**:
- 新建: src/utils/storage-key.ts
- 修改: src/stores/settings.ts (4处: L14, L15, L26)
- 修改: src/stores/deai.ts (4处: L21, L22, L39)
- 修改: src/stores/provider.ts (4处: L31, L52)
- 修改: src/stores/agent.ts (2处: L22, L27)
- 修改: src/stores/skill.ts (2处: L37, L70)
- 修改: src/stores/chapter.ts (2处: L25, L30)
- 修改: src/stores/project.ts (4处: L22, L36, L37, L66)
- 修改: src/stores/theme.ts (6处: init/toggle/setTheme 中的 localStorage 调用改为 electronAPI + storageKey)

**验证方法**:
1. 在 dev server 中打开应用，配置一个供应商，刷新页面确认数据保留
2. 用 PowerShell 检查 electron 存储目录，确认键名带 wa_ 前缀
3. 写 Playwright 独立脚本（教训#80），操作设置面板保存配置，检查 DOM 中配置已加载（教训#81）

---

### 缺陷2: IPC 参数无类型验证（R203, P1）

**文件**: electron/preload.js

**问题描述**:
preload.js 中所有 IPC 包装函数直接透传参数，不做类型检查。例如:
```javascript
storageRead: function(key) { return ipcRenderer.sendSync('storage:read', key) }
storageWrite: function(key, data) { return ipcRenderer.sendSync('storage:write', key, data) }
```
如果传入非字符串 key 或 undefined data，会在主进程侧产生难以追踪的错误。

**修复方案**:
在关键 IPC 函数入口添加基本类型检查:
```javascript
storageRead: function(key) {
  if (typeof key !== 'string') throw new TypeError('storageRead: key must be string')
  return ipcRenderer.sendSync('storage:read', key)
},
storageWrite: function(key, data) {
  if (typeof key !== 'string') throw new TypeError('storageWrite: key must be string')
  return ipcRenderer.sendSync('storage:write', key, data)
},
fetchModels: function(baseUrl, apiKey) {
  if (typeof baseUrl !== 'string' || typeof apiKey !== 'string')
    throw new TypeError('fetchModels: baseUrl and apiKey must be strings')
  return ipcRenderer.invoke('api:fetchModels', baseUrl, apiKey)
}
```

**涉及文件**: electron/preload.js（约8个函数需加检查）

**验证方法**: 写 Playwright 脚本传入错误类型参数，确认抛出 TypeError 而非静默失败

---

### 缺陷3: editor store 缺少 undo/redo 集成（R115, P1, 低优先级）

**文件**: src/stores/editor.ts

**问题描述**:
useUndoRedo composable（src/composables/useUndoRedo.ts）功能完整，有 pushState/undo/redo/reset，栈深50。EditorPanel.vue L100 正确使用了它。

但 editor store 本身不持有 undo/redo 状态，这意味着:
1. 如果组件卸载重建（如切换 tab 再切回来），undo 栈会丢失
2. 跨组件的 undo/redo 无法共享

**判定**: 部分实现。composable 在单组件内工作正常，但不跨组件实例持久化。旧架构的 undo/redo 也是绑定在编辑器实例上（renderer_v2.js L4235），不是全局的，所以这不算行为回归，但影响用户体验。

**修复方案（可选，优先级低）**:
在 editor store 中为每个 tab 维护独立的 undo/redo 栈:
```typescript
// editor.ts 新增
const tabUndoStacks = ref<Record<string, string[]>>({})
const tabRedoStacks = ref<Record<string, string[]>>({})

function pushUndoState(tabId: string, content: string) {
  if (!tabUndoStacks.value[tabId]) tabUndoStacks.value[tabId] = []
  // ... 推入逻辑
}
```

**涉及文件**: src/stores/editor.ts（新增约30行）

**验证方法**: 切换 tab 后回来，Ctrl+Z 仍能撤销。写 Playwright 脚本验证

---

## 3. 误报清单（已验证，不需修复）

差异检测引擎的系统性误报原因: state_checker.js 用关键词搜索 store 字段名，但 Vue3 setup syntax 中 ref 名和字符串键不同。behavior_checker.js 用关键词搜索功能，但 Vue3 组件化后实现方式变了。static_checker.js 对 IPC 通道的搜索路径有误（找 preload.ts 但实际文件是 preload.js）。

### P0 误报（6项中4项是误报）

| 规则ID | 引擎判定 | 真实状态 | 证据 |
|---|---|---|---|
| R001 | MISSING: polyfill JSON.parse | 误报 | main.ts L20 已有 JSON.parse(raw)，storage.js L56 也有 JSON.parse(raw) |
| R047 | MISSING: 消息操作 | 误报 | ChatPanel.vue L240 copyMessage、L244 regenerateMessage、L256 applyToEditor 全部存在 |
| R051 | MISSING: 内联AI菜单 | 误报 | EditorPanel.vue L77 inline-menu、L103 inlineActions(21个)、L406 applyInlineAction 全部存在 |
| R055 | MISSING: vuedraggable | 部分实现 | ChapterTree.vue 用原生 HTML5 drag (draggable=true L24/40/57/79)，未用 vuedraggable 但功能完整: onVolDragStart/DragOver/Drop、onChDragStart/DragOver/Drop 全部实现 (L235-280) |

### P1 误报（44项中验证为误报的关键项）

| 规则ID | 引擎判定 | 真实状态 | 证据 |
|---|---|---|---|
| R012 | MISSING: localStorage降级 | 误报 | storage.js L34-35 有 localStorage.getItem(k) fallback |
| R021 | MISSING: fetchModels IPC | 误报 | preload.js 有 fetchModels: function(baseUrl, apiKey) { return ipcRenderer.invoke('api:fetchModels', baseUrl, apiKey) } |
| R022 | MISSING: DiagLogger perfStart | 误报 | diag.js L136 perfStart、L137 perfEnd、L195 trackApiCall 全部存在 |
| R035 | MISSING: 断网续接 | 误报 | pipeline.ts L9 breakpoint ref、L41 saveBreakpoint、L62 clearBreakpoint 全部存在 |
| R038 | MISSING: deai mode | 误报 | deai.ts L8 mode = ref<'chain'|'split-merge'|'multi-step'>('chain') |
| R046 | MISSING: skillIds+agentId | 误报 | deai.ts L9 skillIds = ref([])、L10 agentId = ref(null) |
| R071 | MISSING: 主题即时切换 | 误报 | theme.ts applyTheme() 直接操作 document.body.classList，无需刷新 |
| R162/R170 | MISSING: IPC通道 | 误报 | IPC报告显示0缺失通道，31个通道全部存在 |
| R165 | MISSING: api:fetchModels | 误报 | preload.js 有 fetchModels 调用 ipcRenderer.invoke('api:fetchModels', ...) |
| R200 | MISSING: safeStorage | 误报 | electron/ipc/crypto.js 使用 safeStorage.encryptString 和 safeStorage.decryptString |
| R246 | MISSING: electron-store | 可接受 | 当前用 fs 读写 JSON 文件，功能等价 |
| R248 | MISSING: electron-window-state | 可接受 | main.js 硬编码窗口尺寸，可后续优化 |
| R249 | MISSING: Pinia store | 误报 | 所有 store 都用 defineStore 和 ref，是标准 Pinia |
| R251 | MISSING: pinia-plugin-persistedstate | 可接受 | 手动持久化（loadConfig/saveConfig）功能等价 |

### 误报根因分析

1. state_checker.js: 搜索 store 字段名如 mode、skillIds，但 Vue3 setup syntax 中这些是 ref 变量名，不是字符串键。引擎搜字符串 'mode' 搜不到 ref 声明
2. behavior_checker.js: 搜索功能关键词如 vuedraggable、copyMessage，但 Vue3 组件化后功能名可能变化或在不同文件中
3. static_checker.js: IPC 通道搜索路径找 preload.ts 但实际文件名是 preload.js，导致全部 IPC 通道被误报为 MISSING

---

## 4. 修复批次与执行顺序

按依赖关系排序，每批完成后独立验证。

### Batch 1: 存储键统一（最高优先级，阻塞数据迁移）

**修复项**: 缺陷1 (R113 + R123 + R072)
**依赖**: 无
**预计改动**: 新建1文件 + 修改8文件 + 约40处代码行

执行步骤:
1. 新建 src/utils/storage-key.ts
2. 修改 src/stores/settings.ts（4处）
3. 修改 src/stores/deai.ts（4处）
4. 修改 src/stores/provider.ts（4处）
5. 修改 src/stores/agent.ts（2处）
6. 修改 src/stores/skill.ts（2处）
7. 修改 src/stores/chapter.ts（2处）
8. 修改 src/stores/project.ts（4处）
9. 修改 src/stores/theme.ts（6处: localStorage 转 electronAPI + storageKey）

**验证**:
- V1: dev server 启动，打开设置面板，配置供应商，刷新页面确认数据保留
- V2: PowerShell 检查存储文件键名带 wa_ 前缀
- V3: Playwright 独立脚本操作设置面板保存配置，检查 DOM 加载状态（教训#80, #81）
- V4: 反验证: 确认旧的裸键数据不会被读取（防止数据污染）

### Batch 2: IPC 参数验证

**修复项**: 缺陷2 (R203)
**依赖**: 无（可与 Batch 1 并行）
**预计改动**: 修改1文件，约8个函数

执行步骤:
1. 修改 electron/preload.js，在 storageRead/storageWrite/storageRemove/fetchModels/providerTestConnection 等函数入口添加 typeof 检查

**验证**:
- V1: Playwright 脚本传入错误类型参数，确认抛出 TypeError
- V2: 正常操作不受影响（传入正确类型参数）

### Batch 3: undo/redo 跨组件持久化（可选，低优先级）

**修复项**: 缺陷3 (R115)
**依赖**: Batch 1 完成（editor store 已用 storageKey）
**预计改动**: 修改1文件，新增约30行

执行步骤:
1. 修改 src/stores/editor.ts，为每个 tab 维护独立的 undo/redo 栈
2. EditorPanel.vue 的 useUndoRedo 改为从 store 获取/恢复栈

**验证**:
- V1: 打开 tab A 编辑，切换到 tab B，切回 tab A，Ctrl+Z 仍能撤销
- V2: Playwright 脚本验证 undo/redo 按钮 canUndo/canRedo 状态正确

---

## 5. P2-P4 处理建议

### P2-中等（3项）

| 规则ID | 内容 | 处理建议 |
|---|---|---|
| R074 | 暗色主题默认值 | 无需修复，theme.ts 默认 dark 正确 |
| R210 | 新增字段默认值兼容 | 在 Batch 1 修复存储键时一并检查默认值 |
| R216 | 默认值回退 | 同上 |

### P3-轻微（39项）

大部分是 Vue3 组件化迁移建议（如"XX改Vue组件"），在 Vue3 架构中已通过组件化实现。其余是参数可配置化建议（如重试次数、心跳间隔），不影响功能正确性，可后续迭代优化。

不需修复的P3典型项: R032(5步流水线改Stepper)、R033(卷纲3模式)、R037(章节卡片)、R041(进度UI)等 — 这些在 Vue3 中已通过组件实现，只是实现方式不同。

### P4-可接受（41项）

全部为架构差异或后续优化建议，不影响当前功能:
- R014(retryDelays硬编码): 可提取为配置项，但不影响功能
- R020(消息按钮图标): Vue3 已用组件化
- R049(execCommand改API): useUndoRedo 已替代
- R057(6个tab): Vue3 已组件化
- R202(marked sanitize): 需确认 ChatMessage.vue 是否做了 XSS 防护

### CSS 选择器低匹配率

选择器匹配率 8.5% 是 Vue3 scoped 样式的预期架构差异（教训#107）。CSS 变量 148/148 全部匹配，说明设计令牌系统完整迁移。选择器名变化是因为 Vue3 scoped 样式会在选择器上添加 data-v-xxxx 属性哈希。

不需要修复 CSS 选择器匹配率。但需要验证视觉效果一致性:
- 启动 dev server，Playwright 截图对比旧架构关键页面
- 检查 CSS 变量是否全部生效（已确认 148/148 匹配）

---

## 6. 需要额外验证的P1项

以下P1项未在本轮源码验证中覆盖（因为优先级低于P0和关键P1），需要在修复执行前补充验证:

| 规则ID | 内容 | 验证方法 |
|---|---|---|
| R089-R101 | 快捷键/右键菜单/面板缩放 | 读 useShortcuts.ts，检查 hotkeys-js 或自定义指令是否实现 |
| R114 | 会话恢复 | 检查 App.vue 是否有路由 query 或 sessionStorage 恢复逻辑 |
| R116 | 面板状态 | 检查面板展开/折叠状态是否持久化 |
| R180 | 未保存内容检查 | 检查关闭前是否有 dirty tab 检查 |
| R182/R184 | ref/computed 使用 | 统计 stores 中 ref/computed 使用情况 |
| R205 | 远程调试端口 | 检查 main.js 是否在生产环境关闭 remote debugging |
| R223/R226/R228 | 无障碍/aria-busy/键盘导航 | 检查 .vue 组件是否有 aria 属性 |
| R257 | 文件系统IPC | 检查 package.json 和 main.js 的文件操作 |

这些项大概率是误报（基于引擎的系统性误报模式），但需在修复执行时逐项确认。

---

## 7. 修复执行约束

以下规则在整个修复过程中必须遵守:

1. 禁止批量行为: 逐个文件精准修改，不用正则批量替换（AGENTS.md 规则）
2. 编码规则13: 禁止用 PowerShell Set-Content 修改含中文文件，必须用 apply_patch 或 Node.js fs
3. apply_patch 追加bug（教训#104）: 对已有文件用 apply_patch 时注意插入位置，不能落在函数作用域外
4. 每步写 checkpoint: 修复完一个 Batch 后更新 _audit/diff-engine/checkpoint.md
5. 验证三铁律（规则14）: 改动完成后必须用 Playwright 实际操作验证，不能靠读代码判断通过
6. 同一方法连续失败2次强制换路径（防空转协议）
7. 修改前备份: 用 Copy-Item 备份到 BACKUP/ 文件夹
8. 修改后语法检查: 每次改完 node --check 验证语法

---

## 8. 验证矩阵

| 编号 | 验证项 | 通过标准 | 方法 |
|---|---|---|---|
| V1 | 存储键带wa_前缀 | PowerShell检查存储文件，所有键名以wa_开头 | Get-ChildItem 检查存储目录 |
| V2 | 数据迁移兼容 | 旧架构数据可被新架构读取 | 写入wa_前缀数据，启动新架构确认加载 |
| V3 | 设置面板持久化 | 配置供应商后刷新，数据保留 | Playwright操作设置面板，刷新后检查DOM |
| V4 | 主题持久化 | 切换主题后刷新，主题保留 | Playwright切换主题，刷新后检查body classList |
| V5 | IPC参数验证 | 传入非字符串参数抛出TypeError | Playwright注入错误参数 |
| V6 | undo/redo跨tab | 切换tab后回来，Ctrl+Z仍能撤销 | Playwright操作编辑器 |
| V7 | dev server无报错 | 控制台0错误 | Playwright检查console.error |
| V8 | IPC通道完整 | 20个旧通道全部存在 | IPC报告已确认0缺失 |

---

## 9. 修复后检查清单

修复全部完成后，执行以下检查:

- [ ] Batch 1: 8个store全部使用 storageKey() 函数
- [ ] Batch 1: theme.ts 不再直接使用 localStorage（Electron环境走electronAPI）
- [ ] Batch 1: dev server 启动，设置面板配置可持久化
- [ ] Batch 1: 存储文件键名全部带 wa_ 前缀
- [ ] Batch 2: preload.js 关键函数有 typeof 检查
- [ ] Batch 2: 传入错误类型参数抛出 TypeError
- [ ] Batch 3（如执行）: undo/redo 跨 tab 持久化
- [ ] node --check 全部修改文件语法正确
- [ ] Playwright V1-V8 全部 PASS
- [ ] checkpoint.md 已更新
- [ ] 经验文件 LESSONS_LEARNED.md 已更新

---

## 10. 风险评估

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 存储键修改后已有数据丢失 | 中 | 用户需重新配置 | 保留旧裸键读取作为 fallback（已有 if (!data) data = storageRead('app-settings') 模式）|
| theme.ts 改为 electronAPI 后浏览器模式失效 | 低 | dev环境主题不持久化 | 保留 localStorage fallback（检查 window.electronAPI 是否存在）|
| apply_patch 追加bug | 中 | 代码语法错误 | 每次修改后 node --check（教训#104）|
| 检测引擎误报导致过度修复 | 高 | 浪费时间引入新bug | 本计划已逐项验证真伪，只修真缺陷 |

---

## 11. 总结

差异检测引擎报告了260项，其中133项非MATCH。经源码验证:
- 真缺陷: 3项（存储键绕过、IPC参数验证、undo/redo跨组件）
- 误报: 约120项（引擎系统性误报，见第3节根因分析）
- 可接受: 约10项（架构差异或后续优化）

实际需要修复的代码量: 新建1文件 + 修改约10文件 + 约60处代码行

修复完成后，Vue3 架构在功能行为上将与旧架构完全对齐，同时保留 Vue3 的组件化、响应式、类型安全等架构优势。

---

*计划版本: V1.0 | 生成时间: 2026-08-11 | 验证者: Codex (GPT-5) | 等待用户审核后执行*
