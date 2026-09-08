# UI 交互模式升级方案

> 日期: 2026-09-05
> 版本: v3.23.1 → v3.24.0
> 改动范围: PipelinePanel.vue (主) + ChapterTree.vue (次) + 新建 composable/组件
> 依据: WRITERHELPER_COMPARISON_REPORT 交互模式分析 + 神意开发经验总结 v2 §5 规则 12/66/71

---

## 一、背景

当前流水线四层生成弹窗是各自独立的 `position: fixed; inset: 0` 全屏遮罩，存在三个问题:
1. 生成时全屏遮挡，用户看不到上方内容（经验文件 §5 规则 12/66）
2. 弹窗各自管各自的状态，可能出现叠加和状态残留（经验文件 §5 规则 12）
3. SKILL 排序只有 × 按钮移除，没有拖拽排序

本方案将四个独立全屏弹窗改为「内联进度条 + 统一弹窗队列 + 拖拽排序 + 顶部滑出面板」四项改造。

---

## 二、设计定稿

### 2.1 内联进度条（替代全屏弹窗）

**位置**: 复用每层底部现有的 `.pl-actions` 按钮行，不额外占空间。

**生成前**: 按钮行正常显示 `[AI生成设定] [确认该类]`

**生成中**: 按钮行原地变为 `[====进度条 45%====] 阶段文字… [取消]`
- 进度条用 `pipelineStore.generationProgress` 驱动宽度
- 阶段文字用 `pipelineStore.generationStatus` 驱动
- 取消按钮调 `pipelineStore.cancelGeneration()`
- API 流式输出折叠为一行 `API实时输出：…`，点击展开为底部折叠面板（`max-height: 120px; overflow-y: auto`），展开时往下推内容而非浮层遮挡

**生成完成**: 按钮行变为 `[完成: XXXX字] [关闭]`，3秒后自动恢复原始按钮

**视觉**: 进度条用 `--accent` 色填充，背景 `--bg-input`，高度 6px，圆角 `--radius-xs`

### 2.2 统一弹窗队列管理器

**新建**: `src/composables/useModalQueue.ts`

**职责**:
- 维护一个 `ModalEntry[]` 栈，每个 entry 含 `{ id, z-index, canClose }`
- `open(id)` push 入栈，`close(id)` 移除
- 栈顶 z-index 最高，下方递减
- ESC 只关栈顶
- `isGenerating` 时阻止打开非生成类弹窗

**PipelinePanel 改动**:
- 四个生成弹窗的 `v-if` 条件不变（仍由 `xxxGenerationFeedbackVisible` 驱动）
- 但 `v-if` 内部不再直接渲染 overlay，改为渲染一个 `<GenerationProgressBar>` 内联组件
- 全屏 overlay 只在「用户手动展开流式日志」时出现，且走队列管理器
- 新增设定弹窗、记忆弹窗纳入队列

**注意**: 弹窗内的功能（进度条、日志区、取消按钮、关闭按钮）全部保留，只是渲染位置从全屏 overlay 改为内联进度条。不丢失任何功能。

### 2.3 拖拽排序

**新建**: `src/composables/useDragSort.ts`

**接口**:
```ts
function useDragSort<T>(list: Ref<T[]>, onReorder: () => void) {
  const dragIndex = ref(-1)
  const overIndex = ref(-1)
  function onDragStart(e: DragEvent, index: number) { ... }
  function onDragOver(e: DragEvent, index: number) { ... }
  function onDrop(e: DragEvent, index: number) { ... }
  function onDragEnd() { ... }
  return { dragIndex, overIndex, onDragStart, onDragOver, onDrop, onDragEnd }
}
```

**PipelinePanel SKILL 排序**:
- 每个 `.pl-skill-chip` 加 `draggable="true"`
- 拖拽时显示蓝色指示线（`::after` 伪元素 2px 高 `--accent` 色）
- 松手后 `stepSkills[step]` 数组重新排列，触发 `saveStepConfig()`
- 删掉现有的 `×` 按钮旁的移除方式改为长按拖出区域删除（保留 `×` 按钮作为备选）

**ChapterTree 章节排序**:
- 章节列表项加 `draggable="true"`
- 拖拽重新排序后更新 `projectStore.chapters[volId]`

**不引入第三方包**，纯 HTML5 Drag and Drop API。

### 2.4 顶部滑出面板（TopSheet）

**新建**: `src/components/common/TopSheet.vue`

**设计**:
- 从顶部滑入，`transform: translateY(-100%) → 0`
- 高度占视口 30%-40%，`max-height: 40vh`
- 半透明遮罩在面板下方，不完全遮挡（`background: transparent`，面板外区域可点击但不关闭）
- 用 Vue `<Transition>` 做滑入滑出动画
- 面板内有标题栏 + 内容区 + 底部操作区

**使用场景**:
- ChapterTree 右键菜单：从 `position: fixed` 浮动菜单改为 TopSheet
- 设定层新增设定弹窗：从居中弹窗改为 TopSheet
- 卷纲层卷操作菜单：从按钮行改为 TopSheet

**为什么从顶部而不是底部**: 底部有内联进度条，顶部滑出不冲突。一上一下互不干扰。

---

## 三、详细执行计划

### P0: useModalQueue composable

**文件**: `src/composables/useModalQueue.ts` (新建)

**内容**:
- `ModalEntry` 类型: `{ id: string; zIndex: number; canClose: boolean }`
- `modalStack` ref 数组
- `open(id, canClose = true)`: push 入栈，z-index = base + stack.length
- `close(id)`: 从栈中移除
- `closeTop()`: 弹出栈顶
- `isOpen(id)`: 查询
- `topId`: computed 栈顶 id
- ESC 键监听: `window.addEventListener('keydown', e => { if (e.key === 'Escape') closeTop() })`
- `isGenerating` 守卫: 生成中调用 `open()` 非生成类弹窗时直接 return

**验证**: vue-tsc 编译通过

### P1: GenerationProgressBar 内联组件

**文件**: `src/components/pipeline/GenerationProgressBar.vue` (新建)

**Props**:
```ts
interface Props {
  step: number          // 1-4
  visible: boolean      // 是否显示
  progress: number      // 0-100
  status: string        // 阶段文字
  logs: string[]        // 日志数组
  isGenerating: boolean // 是否生成中
}
```

**模板结构**:
```
<div class="pl-gen-bar" v-if="visible">
  <div class="pl-gen-bar-track">
    <div class="pl-gen-bar-fill" :style="{ width: progress + '%' }"></div>
  </div>
  <span class="pl-gen-bar-status">{{ status }}</span>
  <button v-if="isGenerating" @click="$emit('cancel')">取消</button>
  <button v-else @click="$emit('close')">关闭</button>
  <div class="pl-gen-bar-stream" v-if="logs.length > 0">
    <div class="pl-gen-bar-stream-toggle" @click="streamExpanded = !streamExpanded">
      {{ streamExpanded ? '收起' : '展开' }} API 输出 ({{ logs.length }} 行)
    </div>
    <div v-if="streamExpanded" class="pl-gen-bar-stream-body">
      <div v-for="(line, i) in logs" :key="i">{{ line }}</div>
    </div>
  </div>
</div>
```

**CSS**:
- `.pl-gen-bar`: `display: flex; align-items: center; gap: 8px; padding: 8px 0;`
- `.pl-gen-bar-track`: `flex: 1; height: 6px; border-radius: 3px; background: var(--bg-input); overflow: hidden;`
- `.pl-gen-bar-fill`: `height: 100%; background: var(--accent); transition: width 180ms ease;`
- `.pl-gen-bar-stream-body`: `max-height: 120px; overflow-y: auto; margin-top: 4px;`

**验证**: build:vue 编译通过，组件可独立渲染

### P2: PipelinePanel 集成内联进度条

**文件**: `src/components/pipeline/PipelinePanel.vue`

**改动**:
1. import GenerationProgressBar 和 useModalQueue
2. 四个全屏 overlay (`pl-settings-generation-overlay` 等) 的 `v-if` 改为只控制「展开式全屏日志查看」
3. 在每个 `.pl-actions` 按钮行下方插入 `<GenerationProgressBar>`
4. 生成时 `.pl-actions` 按钮行 `v-if="!isCurrentStepGenerating"` 隐藏，进度条显示
5. 生成完成后 3 秒计时器恢复按钮行
6. 删掉四个全屏 overlay 的模板（日志内容移入 GenerationProgressBar）
7. `closeXxxGenerationFeedback` 改为调 `modalQueue.close(id)` + 清 logs

**不丢失的功能清单**（逐项核对）:
- ✅ 进度条百分比 → `pipelineStore.generationProgress`
- ✅ 阶段状态文字 → `pipelineStore.generationStatus`
- ✅ API 流式日志 → `xxxGenerationLogs` 数组
- ✅ 取消生成按钮 → `pipelineStore.cancelGeneration()`
- ✅ 关闭按钮 → `closeXxxGenerationFeedback()`
- ✅ autoScrollLog → 保留，滚动目标改为 `.pl-gen-bar-stream-body`

**验证**:
- vue-tsc 0 错误
- build:vue 通过
- CDP 启动源 Electron，打开流水线，每层点 AI 生成，确认进度条在按钮行位置显示
- 确认生成中上方内容区可见可操作

### P3: useDragSort composable + SKILL 拖拽

**文件**: `src/composables/useDragSort.ts` (新建) + PipelinePanel.vue

**useDragSort 实现**:
```ts
export function useDragSort<T>(
  list: Ref<T[]>,
  onReorder: () => void
) {
  const dragIndex = ref(-1)
  const overIndex = ref(-1)

  function onDragStart(e: DragEvent, index: number) {
    dragIndex.value = index
    e.dataTransfer!.effectAllowed = 'move'
  }
  function onDragOver(e: DragEvent, index: number) {
    e.preventDefault()
    if (dragIndex.value !== index) overIndex.value = index
  }
  function onDrop(e: DragEvent, index: number) {
    e.preventDefault()
    const from = dragIndex.value
    const to = index
    if (from < 0 || from === to) { reset(); return }
    const arr = [...list.value]
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    list.value = arr
    onReorder()
    reset()
  }
  function onDragEnd() { reset() }
  function reset() { dragIndex.value = -1; overIndex.value = -1 }

  return { dragIndex, overIndex, onDragStart, onDragOver, onDrop, onDragEnd }
}
```

**PipelinePanel SKILL chip 改动**:
- 每个 `.pl-skill-chip` 加 `draggable="true"` + `@dragstart` / `@dragover.prevent` / `@drop` / `@dragend`
- 拖拽指示线: `.pl-skill-chip.drag-over::before { content: ''; position: absolute; left: 0; top: -2px; width: 100%; height: 2px; background: var(--accent); }`
- 四层 SKILL 列表都接入
- `onReorder` 回调调 `saveStepConfig()`

**验证**: build:vue 通过，CDP 拖拽 SKILL chip 重新排序，确认 `stepSkills` 数组顺序变化且持久化

### P4: TopSheet 通用组件

**文件**: `src/components/common/TopSheet.vue` (新建)

**Props**:
```ts
interface Props {
  visible: boolean
  title?: string
  height?: string  // 默认 '40vh'
}
```

**模板**:
```
<Transition name="topsheet">
  <div v-if="visible" class="topsheet-overlay" @click.self="$emit('close')">
    <div class="topsheet-panel" :style="{ maxHeight: height }">
      <div class="topsheet-header">
        <span>{{ title }}</span>
        <button @click="$emit('close')">×</button>
      </div>
      <div class="topsheet-body">
        <slot />
      </div>
    </div>
  </div>
</Transition>
```

**CSS**:
- `.topsheet-overlay`: `position: fixed; inset: 0; z-index: var(--z-modal); background: var(--bg-overlay);`
- `.topsheet-panel`: `position: absolute; top: 0; left: 0; right: 0; transform: translateY(0); background: var(--bg-elevated); border-bottom: 1px solid var(--border-color); box-shadow: var(--shadow-lg); overflow-y: auto;`
- `.topsheet-enter-from { transform: translateY(-100%); }` / `.topsheet-leave-to { transform: translateY(-100%); }`

**验证**: build:vue 通过

### P5: ChapterTree 右键菜单改为 TopSheet

**文件**: `src/components/sidebar/ChapterTree.vue`

**改动**:
- import TopSheet
- `ctxMenu.visible` 从 `position: fixed` 浮动菜单改为 `<TopSheet :visible="ctxMenu.visible" :title="ctxMenuTitle">`
- 菜单项从 `.ctx-item` 按钮改为 TopSheet slot 内容
- 右键事件 `@contextmenu.prevent` 仍然触发，但打开的是 TopSheet 而非浮动菜单
- 删掉 `.ctx-menu` 的 `position: fixed` CSS

**验证**: CDP 右键章节，确认面板从顶部滑出，操作完后滑回

### P6: 清理 + 验证 + 封装

**清理**:
- 删掉 PipelinePanel.vue 中四个全屏 overlay 模板（`pl-settings-generation-overlay` 等）
- 删掉对应的 `.pl-generation-feedback-overlay` / `.pl-generation-feedback-modal` CSS
- 确认无未使用变量（`settingsGenerationFeedbackVisible` 等 computed 保留但改为驱动 GenerationProgressBar）
- 清理临时文件

**验证清单**:
1. vue-tsc 0 错误
2. build:vue 通过
3. 源 Electron + CDP 验证:
   - 设定层: 点 AI 生成，进度条在按钮行显示，上方设定区可见
   - 卷纲层: 点 AI 生成全卷，进度条显示，卷列表可见
   - 章节层: 点生成章节，进度条显示，章节列表可见
   - 正文层: 点生成正文，进度条显示，已内嵌降AI badge 可见
   - 流式输出折叠/展开正常
   - 取消按钮可点击
   - 生成完成后按钮行 3 秒恢复
   - SKILL chip 拖拽排序正常
   - 章节右键 TopSheet 从顶部滑出
   - 不会出现两个弹窗叠加
4. 确认弹窗功能无丢失: 进度条、阶段文字、流式日志、取消、关闭

**版本号**: 3.23.1 → 3.24.0

**经验文件更新**: 新增条目
- §5 规则 72: 全屏 overlay 弹窗改为内联进度条后，生成时上方内容区可见可操作。进度条复用按钮行位置，不额外占空间。流式日志默认折叠，点击展开为底部面板。autoScrollLog 滚动目标改为 `.pl-gen-bar-stream-body`。
- §5 规则 73: 弹窗队列管理器 useModalQueue 统一管理 z-index 和 ESC 关闭。isGenerating 时阻止打开非生成类弹窗。closeXxxFeedback 改为调 modalQueue.close(id) + 清 logs + 清 activeGenerationFeedbackStep。
- §5 规则 74: SKILL 拖拽排序用 HTML5 原生 Drag and Drop API，不引入第三方包。拖拽指示线用 ::before 伪元素。onReorder 回调必须触发 saveStepConfig 持久化。
- §5 规则 75: TopSheet 从顶部滑出，和底部进度条一上一下互不干扰。ChapterTree 右键菜单从浮动菜单改为 TopSheet。

**开发日志**: 新增 `DEV_LOG_2026-09-05-ui-interaction-upgrade.md`

---

## 四、风险与边界

### 4.1 不丢失功能
- 进度条、阶段文字、流式日志、取消、关闭全部保留，只是渲染位置从全屏 overlay 改为内联进度条
- `appendPipelineStream` / `autoScrollLog` / `pipelineStore.updateProgress` 等逻辑不动
- `xxxGenerationLogs` 数组不动，只是渲染容器变了

### 4.2 不破坏现有链路
- `callApiWithAgent` / `runStepSkills` / `genBody` / `genSettings` / `genVolumes` / `genChapters` 等函数不动
- `activeGenerationFeedbackStep` 保留，改为驱动 GenerationProgressBar 的 visible
- `closeXxxGenerationFeedback` 保留函数名，内部改为调队列管理器

### 4.3 不动其他组件
- ChatPanel.vue 不动（主页 API 对话框已经是内联状态栏模式）
- DeAiProgress.vue 不动（独立使用场景）
- OutlineWorkspace.vue 不动（大纲工作台已经是内联流式模式）
- EditorPanel.vue 不动

### 4.4 经验文件引用
- §5 规则 12: 进度弹窗必须绑定当前活跃层 → GenerationProgressBar 的 `step` prop 绑定
- §5 规则 66: genBody 必须设置 activeGenerationFeedbackStep = 4 → 保留不动
- §5 规则 71: 弹窗关闭函数必须重置 loading 状态 → closeXxxFeedback 保留重置逻辑

---

## 五、文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/composables/useModalQueue.ts` | 新建 | 弹窗队列管理器 |
| `src/composables/useDragSort.ts` | 新建 | 拖拽排序 composable |
| `src/components/pipeline/GenerationProgressBar.vue` | 新建 | 内联进度条组件 |
| `src/components/common/TopSheet.vue` | 新建 | 顶部滑出面板 |
| `src/components/pipeline/PipelinePanel.vue` | 改动 | 集成进度条 + 拖拽 + 清理 overlay |
| `src/components/sidebar/ChapterTree.vue` | 改动 | 右键菜单改 TopSheet |
| `package.json` | 改动 | 版本号 3.24.0 |
| `_audit/神意开发经验总结_v2.md` | 更新 | 新增 4 条规则 |
| `_audit/DEV_LOG_2026-09-05-ui-interaction-upgrade.md` | 新建 | 开发日志 |
