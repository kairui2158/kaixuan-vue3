# ChapterTree.vue 行为契约

> 源文件: `src/components/sidebar/ChapterTree.vue`
> 组件职责: 卷/章节树的展示、交互（展开/折叠/拖拽排序/右键菜单/重命名/增删），项目列表管理
> 函数总数: 30（18方法 + 1计算属性 + 11事件处理）

---

## F01: flatItems (computed)

| 层 | 内容 |
|---|---|
| L1 结构 | computed，返回扁平化的 volume/chapter 数组用于虚拟滚动。绑定模板 `v-if="flatItems.length > 50"` 切换 RecycleScroller 与普通 v-for |
| L2 输入来源 | `volumes.value`（projectStore.volumes），`expandedVolumes`（本地 ref Set），`getVolChapters()` 返回值 |
| L3 输出目的地 | 模板渲染（RecycleScroller 的 items prop） |
| L4 副作用 | 纯计算无副作用。风险等级: 无 |
| L5 通信范式 | computed 响应式，依赖 store + 本地 ref |
| L6 验证用例 | Playwright: 创建3卷各30章 → 检查 flatItems.length === 3+90=93（全部展开时）；折叠1卷 → 检查减少对应章节数 |
| L7 跨组件依赖 | 被 RecycleScroller 和 v-for 两种渲染模式共同消费 |

## F02: getVolChapters(vol)

| 层 | 内容 |
|---|---|
| L1 结构 | 普通函数，返回指定卷的章节数组。源码 L120-123 |
| L2 输入来源 | 参数 `vol`（含 id 或 name），`projectStore.chapters[volId]` |
| L3 输出目的地 | 返回值，被 flatItems/toggleVolume/模板渲染消费 |
| L4 副作用 | 无。风险等级: 无 |
| L5 通信范式 | 直接读 store，返回引用 |
| L6 验证用例 | Playwright: 创建卷A添加3章 → 调用 getVolChapters(volA) → 返回长度3；卷B无章 → 返回 [] |
| L7 跨组件依赖 | flatItems、模板 vol-count、chapter-list 均依赖此函数 |

## F03: toggleVolume(vol)

| 层 | 内容 |
|---|---|
| L1 结构 | 事件处理函数，@click 绑定。展开/折叠卷。源码 L125-129 |
| L2 输入来源 | DOM click 事件，`expandedVolumes`（本地 ref Set），`vol.id || vol.name` |
| L3 输出目的地 | 修改 `expandedVolumes` Set（add/delete） |
| L4 副作用 | 触发 flatItems 重算 → DOM 重渲染。风险等级: 低 |
| L5 通信范式 | 本地 ref 状态变更，无 emit/store 写入 |
| L6 验证用例 | Playwright: 点击卷标题 → vol-arrow 添加 expanded class → 章节列表显示；再点击 → 折叠 |
| L7 跨组件依赖 | 影响 flatItems computed |

## F04: selectChapter(ch)

| 层 | 内容 |
|---|---|
| L1 结构 | 事件处理函数，@click 绑定。选中章节并打开编辑器标签页。源码 L131-136 |
| L2 输入来源 | DOM click 事件，`ch` 对象（含 id/title/body） |
| L3 输出目的地 | `editorStore.openTab()` 写入，`activeChapterId` 本地 ref |
| L4 副作用 | 调用 editorStore.openTab（store 写入）。风险等级: 中 |
| L5 通信范式 | store 写入（editorStore） + 本地 ref |
| L6 验证用例 | Playwright: 点击章节 → 检查 editorStore.activeTabId === 'tab-' + ch.id；编辑器内容 === ch.body |
| L7 跨组件依赖 | EditorPanel 通过 editorStore.openTab 间接触发 |

## F05: openVolumeOutline(vol)

| 层 | 内容 |
|---|---|
| L1 结构 | 普通函数，被 ctxAction('view-outline') 调用。打开卷纲到编辑器。源码 L138-143 |
| L2 输入来源 | `vol` 对象（含 id/name/outline） |
| L3 输出目的地 | `editorStore.openTab()` 写入 |
| L4 副作用 | store 写入。风险等级: 中 |
| L5 通信范式 | store 写入（editorStore） |
| L6 验证用例 | Playwright: 右键卷 → 点击'查看卷纲' → 编辑器 tab title 含 '卷纲'，content === vol.outline |
| L7 跨组件依赖 | EditorPanel |

## F06: openChapterPlot(ch)

| 层 | 内容 |
|---|---|
| L1 结构 | 普通函数，被 ctxAction('view-plot') 调用。打开章节剧情到编辑器。源码 L145-150 |
| L2 输入来源 | `ch` 对象（含 id/title/plot） |
| L3 输出目的地 | `editorStore.openTab()` 写入 |
| L4 副作用 | store 写入。风险等级: 中 |
| L5 通信范式 | store 写入（editorStore） |
| L6 验证用例 | Playwright: 右键章节 → 点击'查看章节剧情' → 编辑器 tab title 含 '剧情'，content === ch.plot |
| L7 跨组件依赖 | EditorPanel |

## F07: onVolDragStart(e, vol)

| 层 | 内容 |
|---|---|
| L1 结构 | HTML5 dragstart 事件处理。记录拖拽源卷ID。源码 L152-155 |
| L2 输入来源 | DragEvent，`vol.id || vol.name` |
| L3 输出目的地 | `dragVolId` 本地 ref，`e.dataTransfer.setData` |
| L4 副作用 | 设置 dataTransfer。风险等级: 无 |
| L5 通信范式 | 本地 ref + DOM API |
| L6 验证用例 | Playwright: 模拟 dragstart 卷A → 检查 dragVolId === volA.id；dataTransfer 含 'vol:...' |
| L7 跨组件依赖 | onVolDrop 消费 dragVolId |

## F08: onVolDragOver(e, vol)

| 层 | 内容 |
|---|---|
| L1 结构 | dragover 事件处理（prevent）。高亮目标卷。源码 L156-158 |
| L2 输入来源 | DragEvent，`vol.id || vol.name` |
| L3 输出目的地 | `dragOverVolId` 本地 ref |
| L4 副作用 | 触发 drag-over CSS class。风险等级: 无 |
| L5 通信范式 | 本地 ref |
| L6 验证用例 | Playwright: 拖拽卷A到卷B上方 → 卷B添加 .drag-over class |
| L7 跨组件依赖 | 无 |

## F09: onVolDrop(e, targetVol)

| 层 | 内容 |
|---|---|
| L1 结构 | drop 事件处理。重排卷顺序。源码 L159-170 |
| L2 输入来源 | `dragVolId`（源），`targetVol.id || targetVol.name`（目标），`volumes.value`（数组） |
| L3 输出目的地 | `volumes.value` 数组 splice 重排，`projectStore.saveProject()` |
| L4 副作用 | store 写入（saveProject 持久化）。风险等级: 高 — 直接修改 volumes 数组顺序 |
| L5 通信范式 | store 写入（projectStore） |
| L6 验证用例 | Playwright: 拖拽卷A(索引0)到卷B(索引1) → 检查 volumes[0] === 原卷B, volumes[1] === 原卷A；saveProject 被调用 |
| L7 跨组件依赖 | projectStore.volumes 数组被直接修改 |

## F10: onChDragStart(e, ch)

| 层 | 内容 |
|---|---|
| L1 结构 | dragstart 事件处理。记录拖拽源章节ID。源码 L172-175 |
| L2 输入来源 | DragEvent，`ch.id` |
| L3 输出目的地 | `dragChId` 本地 ref，`e.dataTransfer.setData` |
| L4 副作用 | 设置 dataTransfer。风险等级: 无 |
| L5 通信范式 | 本地 ref + DOM API |
| L6 验证用例 | Playwright: 模拟 dragstart 章节 → dragChId === ch.id |
| L7 跨组件依赖 | onChDrop 消费 dragChId |

## F11: onChDragOver(e, ch)

| 层 | 内容 |
|---|---|
| L1 结构 | dragover 事件处理（prevent）。高亮目标章节。源码 L176-178 |
| L2 输入来源 | DragEvent，`ch.id` |
| L3 输出目的地 | `dragOverChId` 本地 ref |
| L4 副作用 | 触发 drag-over CSS class。风险等级: 无 |
| L5 通信范式 | 本地 ref |
| L6 验证用例 | Playwright: 拖拽章节A到章节B上方 → 章节B添加 .drag-over class |
| L7 跨组件依赖 | 无 |

## F12: onChDrop(e, targetCh)

| 层 | 内容 |
|---|---|
| L1 结构 | drop 事件处理。重排章节顺序（同卷内）。源码 L179-192 |
| L2 输入来源 | `dragChId`（源），`targetCh.id`（目标），`projectStore.chapters`（遍历所有卷找匹配） |
| L3 输出目的地 | `projectStore.chapters[volId]` 数组 splice 重排，`projectStore.saveProject()` |
| L4 副作用 | store 写入（saveProject 持久化）。风险等级: 高 — 遍历所有卷查找，找到后 splice |
| L5 通信范式 | store 写入（projectStore） |
| L6 验证用例 | Playwright: 拖拽章A到章C → 在同一卷内检查顺序变化；跨卷拖拽 → 当前实现不移动到目标卷（仅同卷内排序） |
| L7 跨组件依赖 | projectStore.chapters 被直接修改 |

## F13: startRenameVol(vol)

| 层 | 内容 |
|---|---|
| L1 结构 | dblclick 事件处理。进入卷重命名模式。源码 L194-200 |
| L2 输入来源 | `vol.id || vol.name`，`vol.name` |
| L3 输出目的地 | `renamingVolId` ref，`renameValue` ref，DOM focus |
| L4 副作用 | nextTick 后 querySelector focus input。风险等级: 低 — 使用全局 querySelector 而非 ref |
| L5 通信范式 | 本地 ref |
| L6 验证用例 | Playwright: 双击卷名 → 出现 input.rename-input，值为当前卷名，input 获得焦点 |
| L7 跨组件依赖 | 无 |

## F14: commitRenameVol(vol)

| 层 | 内容 |
|---|---|
| L1 结构 | blur/keydown.enter 事件处理。提交卷重命名。源码 L201-205 |
| L2 输入来源 | `renameValue.value`（用户输入），`vol` 对象 |
| L3 输出目的地 | `vol.name` 赋值，`projectStore.saveProject()`，`renamingVolId` 清空 |
| L4 副作用 | store 写入（saveProject）。风险等级: 中 — 直接修改 vol 对象属性 |
| L5 通信范式 | store 写入（projectStore） |
| L6 验证用例 | Playwright: 双击卷名 → 输入'新卷名' → 按Enter → 卷名显示为'新卷名'；saveProject 被调用 |
| L7 跨组件依赖 | projectStore.volumes 中 vol 对象被修改 |

## F15: startRenameCh(ch)

| 层 | 内容 |
|---|---|
| L1 结构 | dblclick 事件处理。进入章节重命名模式。源码 L206-212 |
| L2 输入来源 | `ch.id`，`ch.title` |
| L3 输出目的地 | `renamingChId` ref，`renameValue` ref，DOM focus |
| L4 副作用 | nextTick 后 querySelector focus input。风险等级: 低 |
| L5 通信范式 | 本地 ref |
| L6 验证用例 | Playwright: 双击章节标题 → 出现 input，值为当前标题，获得焦点 |
| L7 跨组件依赖 | 无 |

## F16: commitRenameCh(ch)

| 层 | 内容 |
|---|---|
| L1 结构 | blur/keydown.enter 事件处理。提交章节重命名。源码 L213-217 |
| L2 输入来源 | `renameValue.value`，`ch` 对象 |
| L3 输出目的地 | `ch.title` 赋值，`projectStore.saveProject()`，`renamingChId` 清空 |
| L4 副作用 | store 写入（saveProject）。风险等级: 中 |
| L5 通信范式 | store 写入（projectStore） |
| L6 验证用例 | Playwright: 双击章节 → 输入'新标题' → 按Enter → 标题更新；saveProject 被调用 |
| L7 跨组件依赖 | projectStore.chapters 中 ch 对象被修改 |

## F17: cancelRename()

| 层 | 内容 |
|---|---|
| L1 结构 | keydown.esc 事件处理。取消重命名。源码 L218 |
| L2 输入来源 | 无参数 |
| L3 输出目的地 | `renamingVolId` 和 `renamingChId` 清空为 null |
| L4 副作用 | 无。风险等级: 无 |
| L5 通信范式 | 本地 ref |
| L6 验证用例 | Playwright: 双击卷名进入重命名 → 按Esc → input 消失，卷名不变 |
| L7 跨组件依赖 | 无 |

## F18: showCtxMenu(e, type, item)

| 层 | 内容 |
|---|---|
| L1 结构 | contextmenu.prevent 事件处理。显示右键菜单。源码 L220-224 |
| L2 输入来源 | MouseEvent（clientX/clientY），type（'volume'/'chapter'），item 对象 |
| L3 输出目的地 | `ctxMenu` ref（visible/x/y/type/vol/ch） |
| L4 副作用 | 修改 ctxMenu 状态触发菜单渲染。风险等级: 低 |
| L5 通信范式 | 本地 ref |
| L6 验证用例 | Playwright: 右键卷 → ctx-menu 显示在 clientX/clientY 位置，含5个菜单项；右键章节 → 含6个菜单项 |
| L7 跨组件依赖 | ctxAction 消费 ctxMenu.value |

## F19: closeCtxMenu()

| 层 | 内容 |
|---|---|
| L1 结构 | click 事件处理（绑定在 tree-body）。关闭右键菜单。源码 L225 |
| L2 输入来源 | DOM click 事件（tree-body 区域） |
| L3 输出目的地 | `ctxMenu.value.visible = false` |
| L4 副作用 | 隐藏菜单。风险等级: 无 |
| L5 通信范式 | 本地 ref |
| L6 验证用例 | Playwright: 右键显示菜单 → 点击树体空白区域 → 菜单消失 |
| L7 跨组件依赖 | 无 |

## F20: ctxAction(action)

| 层 | 内容 |
|---|---|
| L1 结构 | 右键菜单项 click 事件处理。分发9种操作。源码 L226-249 |
| L2 输入来源 | `action` 字符串（gen-chapters/gen-body/view-outline/view-plot/view-body/rename/edit-vol/bind-skill/del-vol/del-ch），`ctxMenu.value.vol/ch` |
| L3 输出目的地 | 9种分支: window.dispatchEvent(CustomEvent) × 3, openVolumeOutline/openChapterPlot/selectChapter 调用, showVolumeForm 调用, startRenameCh/startRenameVol 调用, deleteVolume/deleteChapter 调用 |
| L4 副作用 | 多种: window 事件分发、store 写入、DOM 模态框、confirm 对话框。风险等级: 高 — 分发点多 |
| L5 通信范式 | 混合: window.dispatchEvent（跨组件树） + emit/直接调用 + store 写入 |
| L6 验证用例 | Playwright: 右键卷 → 点'AI生成章节' → window 收到 'tree-gen-chapters' 事件 + detail.volumeId；右键章节 → 点'删除' → confirm → 章节从树中消失 |
| L7 跨组件依赖 | PipelinePanel 监听 tree-gen-chapters/tree-gen-body；SkillBinding 面板监听 show-skill-binding |

## F21: addChapter(vol)

| 层 | 内容 |
|---|---|
| L1 结构 | click 事件处理（+ 添加章节按钮）。添加新章节到卷。源码 L251-258 |
| L2 输入来源 | `vol.id || vol.name`，`projectStore.chapters[volId]`（现有数组） |
| L3 输出目的地 | `projectStore.chapters[volId].push(newCh)`，`projectStore.saveProject()`，`expandedVolumes.add(volId)` |
| L4 副作用 | store 写入 + 自动展开卷。风险等级: 中 |
| L5 通信范式 | store 写入（projectStore） |
| L6 验证用例 | Playwright: 展开卷A → 点击'+ 添加章节' → 新章节出现在列表末尾，标题为'第N章'；volA 自动展开 |
| L7 跨组件依赖 | projectStore.chapters 数组被修改 |

## F22: deleteChapter(ch)

| 层 | 内容 |
|---|---|
| L1 结构 | 被 ctxAction('del-ch') 调用。删除章节。源码 L260-266 |
| L2 输入来源 | `ch.id`，遍历 `projectStore.chapters` 所有卷 |
| L3 输出目的地 | `chs.splice(idx, 1)`，`projectStore.saveProject()` |
| L4 副作用 | store 写入（删除+持久化）。风险等级: 高 — 不可逆删除 |
| L5 通信范式 | store 写入（projectStore） |
| L6 验证用例 | Playwright: 右键章节 → 删除 → confirm → 章节从树中消失；遍历 chapters 确认不存在该 id |
| L7 跨组件依赖 | projectStore.chapters 被修改 |

## F23: deleteVolume(vol)

| 层 | 内容 |
|---|---|
| L1 结构 | 被 ctxAction('del-vol') 调用。删除卷及其所有章节。源码 L268-273 |
| L2 输入来源 | `vol.id || vol.name`，`volumes.value` |
| L3 输出目的地 | `volumes.value.splice(idx, 1)`，`delete projectStore.chapters[volId]`，`projectStore.saveProject()` |
| L4 副作用 | store 写入（删除卷+章节+持久化）。风险等级: 高 — 不可逆级联删除 |
| L5 通信范式 | store 写入（projectStore） |
| L6 验证用例 | Playwright: 右键卷 → 删除 → confirm → 卷及子章节从树中消失；chapters[volId] 不存在 |
| L7 跨组件依赖 | projectStore.volumes 和 chapters 均被修改 |

## F24: showVolumeForm(vol?)

| 层 | 内容 |
|---|---|
| L1 结构 | 普通函数/事件处理。显示卷编辑/新建模态框。源码 L275-290 |
| L2 输入来源 | 可选 `vol` 对象；`volumes.value`（查找索引）；无参数时为新建模式 |
| L3 输出目的地 | `editingVolIdx`、`volFormName`、`volFormOutline`、`volFormWords`、`showVolModal` refs |
| L4 副作用 | 修改模态框状态 refs → 触发模态框渲染。风险等级: 低 |
| L5 通信范式 | 本地 ref |
| L6 验证用例 | Playwright: 点击'+卷'按钮 → showVolModal=true，表单为空默认值；右键卷→编辑 → 表单预填当前值 |
| L7 跨组件依赖 | saveVolume 消费表单状态 |

## F25: saveVolume()

| 层 | 内容 |
|---|---|
| L1 结构 | click 事件处理（保存按钮）。保存卷表单。源码 L292-304 |
| L2 输入来源 | `volFormName`、`volFormOutline`、`volFormWords`（表单值），`editingVolIdx`（-1=新建） |
| L3 输出目的地 | 新建: `volumes.value.push(newVol)`；编辑: 修改现有 vol 属性。`projectStore.saveProject()`，`showVolModal = false` |
| L4 副作用 | store 写入（新增/修改+持久化）。风险等级: 高 |
| L5 通信范式 | store 写入（projectStore） |
| L6 验证用例 | Playwright: 新建模式 → 输入卷名 → 保存 → 卷出现在树中，含 id/outline/suggestedWords；编辑模式 → 修改名称 → 保存 → 名称更新 |
| L7 跨组件依赖 | projectStore.volumes 被修改 |

## F26: treeGen()

| 层 | 内容 |
|---|---|
| L1 结构 | click 事件处理（树生成按钮）。触发树生成请求。源码 L306-311 |
| L2 输入来源 | `projectStore.volumes.length`（检查是否有卷） |
 L3 输出目的地 | `emit('navigate', 'pipeline')`，`window.dispatchEvent(CustomEvent('tree-gen-request'))` |
| L4 副作用 | emit 导航事件 + window 全局事件分发。风险等级: 中 — 若无卷则 alert 弹窗 |
| L5 通信范式 | emit（父组件导航） + window.dispatchEvent（跨组件树通信） |
| L6 验证用例 | Playwright: 有卷时点击 → emit navigate 'pipeline' + window 收到 'tree-gen-request'；无卷时 → alert '请先生成卷纲' |
| L7 跨组件依赖 | 父组件监听 navigate；PipelinePanel 监听 tree-gen-request |

## F27: openProjectList()

| 层 | 内容 |
|---|---|
| L1 结构 | click 事件处理（项目按钮）。打开项目列表。源码 L313 |
| L2 输入来源 | 无参数 |
| L3 输出目的地 | `showProjectList = true`，`projectStore.loadProjectList()` |
| L4 副作用 | store 读取（loadProjectList） + 本地 ref。风险等级: 低 |
| L5 通信范式 | 本地 ref + store 读取 |
| L6 验证用例 | Playwright: 点击'项目'按钮 → 项目列表模态框显示，列表含已保存项目 |
| L7 跨组件依赖 | projectStore.loadProjectList / projectList |

## F28: selectProject(id)

| 层 | 内容 |
|---|---|
| L1 结构 | click 事件处理（项目列表项）。加载选中项目。源码 L314-319 |
| L2 输入来源 | `id` 参数（项目ID） |
| L3 输出目的地 | `projectStore.loadProject(id)`，`window.electronAPI.storageWrite`（记住 lastProjectId），`showProjectList = false` |
| L4 副作用 | store 写入（loadProject 全量加载） + electron storage 写入。风险等级: 高 — 替换整个项目状态 |
| L5 通信范式 | store 写入（projectStore） + electronAPI（持久化偏好） |
| L6 验证用例 | Playwright: 项目列表 → 点击项目B → 树标题显示项目B名称，volumes/chapters 切换为项目B数据 |
| L7 跨组件依赖 | projectStore 全状态变更，影响所有消费 projectStore 的组件 |

## F29: deleteProject(id)

| 层 | 内容 |
|---|---|
| L1 结构 | click 事件处理（项目列表删除按钮）。删除项目。源码 L320-325 |
| L2 输入来源 | `id` 参数，confirm 对话框 |
| L3 输出目的地 | `window.electronAPI.storageRemove`（删除项目存储），`projectStore.loadProjectList()`（刷新列表） |
| L4 副作用 | electron storage 删除 + store 读取刷新。风险等级: 高 — 不可逆删除项目数据 |
| L5 通信范式 | electronAPI（持久化删除） + store 读取 |
| L6 验证用例 | Playwright: 点击删除 → confirm → 项目从列表消失；loadProjectList 被调用刷新 |
| L7 跨组件依赖 | projectStore.projectList 被刷新 |

## F30: createNewProject()

| 层 | 内容 |
|---|---|
| L1 结构 | click 事件处理（创建按钮）。创建新项目。源码 L326-338 |
| L2 输入来源 | `newProjectName`、`newOutlineText`（表单值） |
| L3 输出目的地 | `projectStore.currentProjectId`、`projectStore.projectName`、`projectStore.outlineText` 赋值，`projectStore.saveProject()`，`window.electronAPI.storageWrite`（lastProjectId），关闭模态框，清空表单 |
| L4 副作用 | store 写入（全量新项目 + 持久化） + electron storage 写入。风险等级: 高 |
| L5 通信范式 | store 写入（projectStore） + electronAPI |
| L6 验证用例 | Playwright: 新建项目模态框 → 输入书名+大纲 → 创建 → 树标题显示新书名，saveProject 被调用，模态框关闭 |
| L7 跨组件依赖 | projectStore 全状态变更 |

---

## 副作用风险表

| 风险等级 | 函数 | 说明 |
|---|---|---|
| 高 | F09 onVolDrop | 直接 splice volumes 数组并持久化 |
| 高 | F12 onChDrop | 遍历所有卷 splice chapters 并持久化 |
| 高 | F20 ctxAction | 9种操作分发，含删除/生成/window事件 |
| 高 | F22 deleteChapter | 不可逆删除章节 |
| 高 | F23 deleteVolume | 不可逆级联删除卷+章节 |
| 高 | F25 saveVolume | 新建/修改卷并持久化 |
| 高 | F28 selectProject | 替换整个项目状态 |
| 高 | F29 deleteProject | 不可逆删除项目数据 |
| 高 | F30 createNewProject | 全量新项目状态替换 |
| 中 | F04 selectChapter | store 写入（openTab） |
| 中 | F05 openVolumeOutline | store 写入（openTab） |
| 中 | F06 openChapterPlot | store 写入（openTab） |
| 中 | F14 commitRenameVol | store 写入（saveProject） |
| 中 | F16 commitRenameCh | store 写入（saveProject） |
| 中 | F21 addChapter | store 写入 + 自动展开卷 |
| 中 | F26 treeGen | emit + window 事件分发 |
| 低 | F13 startRenameVol | nextTick + querySelector focus |
| 低 | F15 startRenameCh | nextTick + querySelector focus |
| 低 | F18 showCtxMenu | 修改 ctxMenu ref |
| 低 | F19 closeCtxMenu | 隐藏菜单 |
| 低 | F24 showVolumeForm | 修改模态框 refs |
| 低 | F27 openProjectList | store 读取 + 本地 ref |
| 无 | F01 flatItems | 纯计算 |
| 无 | F02 getVolChapters | 纯读取 |
| 无 | F03 toggleVolume | 本地 ref add/delete |
| 无 | F07 onVolDragStart | 本地 ref + dataTransfer |
| 无 | F08 onVolDragOver | 本地 ref |
| 无 | F10 onChDragStart | 本地 ref + dataTransfer |
| 无 | F11 onChDragOver | 本地 ref |
| 无 | F17 cancelRename | 本地 ref 清空 |

---

## 通信范式汇总

| 范式 | 函数 | 说明 |
|---|---|---|
| store 写入 (projectStore) | F09, F12, F14, F16, F21, F22, F23, F25, F28, F30 | saveProject/直接数组操作 |
| store 写入 (editorStore) | F04, F05, F06 | openTab 打开编辑器标签 |
| store 读取 (projectStore) | F02, F27, F29 | chapters 读取/loadProjectList |
| emit | F26 | navigate 事件到父组件 |
| window.dispatchEvent | F20, F26 | tree-gen-chapters/tree-gen-body/show-skill-binding/tree-gen-request |
| electronAPI | F28, F29, F30 | storageWrite/storageRemove 持久化偏好 |
| 本地 ref 状态 | F01, F03, F07, F08, F10, F11, F13, F15, F17, F18, F19, F24 | expandedVolumes/drag refs/rename refs/ctxMenu/modal refs |

---

## L6 Playwright 验证用例映射

| 用例编号 | 对应函数 | 测试脚本 | 状态 |
|---|---|---|---|
| T-tree-01 | F03 toggleVolume | test_p9_chapter_tree.js | 已有（48/48 PASS） |
| T-tree-02 | F04 selectChapter | test_p9_chapter_tree.js | 已有 |
| T-tree-03 | F09 onVolDrop | test_p9_chapter_tree.js | 已有 |
| T-tree-04 | F12 onChDrop | test_p9_chapter_tree.js | 已有 |
| T-tree-05 | F13/F14 startRenameVol/commitRenameVol | test_p9_chapter_tree.js | 已有 |
| T-tree-06 | F15/F16 startRenameCh/commitRenameCh | test_p9_chapter_tree.js | 已有 |
| T-tree-07 | F18/F19/F20 ctxMenu | test_p9_chapter_tree.js | 已有 |
| T-tree-08 | F21 addChapter | test_p9_chapter_tree.js | 已有 |
| T-tree-09 | F22 deleteChapter | test_p9_chapter_tree.js | 已有 |
| T-tree-10 | F23 deleteVolume | test_p9_chapter_tree.js | 已有 |
| T-tree-11 | F24/F25 showVolumeForm/saveVolume | test_p9_chapter_tree.js | 已有 |
| T-tree-12 | F26 treeGen | test_pipeline_v2.js | 已有（37/37 PASS） |
| T-tree-13 | F27 openProjectList | test_p9_chapter_tree.js | 已有 |
| T-tree-14 | F28 selectProject | test_p9_chapter_tree.js | 已有 |
| T-tree-15 | F29 deleteProject | test_p9_chapter_tree.js | 已有 |
| T-tree-16 | F30 createNewProject | test_p9_chapter_tree.js | 已有 |
| T-tree-17 | F05 openVolumeOutline | 需补全 | ctxAction('view-outline') 分支 |
| T-tree-18 | F06 openChapterPlot | 需补全 | ctxAction('view-plot') 分支 |
| T-tree-19 | F01 flatItems 虚拟滚动 | 需补全 | >50项时切换 RecycleScroller |

---

## 关键行为契约备注

1. **虚拟滚动阈值**: 当 flatItems.length > 50 时使用 RecycleScroller，否则用普通 v-for。测试需验证两种模式下的交互一致性。
2. **重命名 focus 策略**: 使用 `document.querySelector('.rename-input')` 而非 Vue ref，多个 rename-input 同时存在时可能 focus 错误。
3. **跨卷拖拽限制**: onChDrop 遍历所有卷查找 srcId，但仅在同卷内 splice 重排，不实现跨卷移动。
4. **ctxAction 使用 window.dispatchEvent**: gen-chapters/gen-body/bind-skill 三种操作通过 window CustomEvent 跨组件通信，这是 Vue3 emit 之外的全局事件，需确保监听方正确注册。
5. **confirm 对话框**: del-vol 和 del-ch 使用原生 confirm()，在 Electron 主进程中可能行为不同。
6. **storageKey**: selectProject/deleteProject/createNewProject 使用 `storageKey()` 工具函数生成存储键，确保跨项目隔离。
