 # 通用组件行为契约
 
 涵盖: BreadcrumbBar, ContextMenu(common), DiffModal, ExitConfirmModal, InlineMenu, MemoryPanel, PanelResizer, PluginMarket
 
 ## BreadcrumbBar.vue
 
 组件路径: src/components/common/BreadcrumbBar.vue
 组件职责: 面包屑导航，显示当前层级路径，支持点击导航和关闭标签页
 
 ### F01: emit home
 | Layer | Content |
 |---|---|
 | L1 Structure | defineEmits，绑定于首页文字@click |
 | L2 Input Source | 无 |
 | L3 Output Destination | emit('home') |
 | L5 Communication Paradigm | Vue emit |
 | L6 Verification Case | 点击"小说工坊" -> 检查父组件收到home事件 |
 
 ### F02: emit navigate(index: number)
 | Layer | Content |
 |---|---|
 | L1 Structure | defineEmits，绑定于面包屑项@click |
 | L2 Input Source | items数组索引 |
 | L3 Output Destination | emit('navigate', i) |
 | L6 Verification Case | 点击某个面包屑项 -> 检查父组件收到navigate事件且index正确 |
 
 ### F03: emit close(index: number)
 | Layer | Content |
 |---|---|
 | L1 Structure | defineEmits，绑定于关闭x@click.stop |
 | L2 Input Source | items数组索引 |
 | L3 Output Destination | emit('close', i) |
 | L6 Verification Case | 点击x -> 检查父组件收到close事件 |
 
 ## ContextMenu.vue (common)
 
 组件路径: src/components/common/ContextMenu.vue
 组件职责: 通用右键上下文菜单，提供绑定技能/生成章节/生成正文/编辑/删除/重命名操作
 
 ### F01: handleClick(action: string)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于菜单项@click |
 | L2 Input Source | item.action, props.nodeId, props.volumeId |
 | L3 Output Destination | emit('action', action, nodeId, volumeId) + emit('close') |
 | L4 Side Effects | 主行为：派发操作事件并关闭菜单 |
 | L5 Communication Paradigm | Vue emit |
 | L6 Verification Case | 点击生成章节 -> 检查emit('action', 'ctx-gen-chapters', nodeId, volumeId) |
 | L7 Cross-component Dependency | 父组件ChapterTree处理action事件 |
 
 ## DiffModal.vue
 
 组件路径: src/components/common/DiffModal.vue
 组件职责: AI修改对比弹窗，双栏显示原文和AI修改，支持导航/全部接受/全部拒绝/应用结果
 
 ### F01: navDiff(dir: number)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于上一处/下一处按钮@click |
 | L2 Input Source | currentIdx ref, diffCount computed |
 | L3 Output Destination | currentIdx更新（含边界检查） |
 | L6 Verification Case | 点下一处 -> 检查currentIdx递增 |
 
 ### F02: acceptAll()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于全部接受按钮@click |
 | L3 Output Destination | emit('apply', props.modified) + emit('close') |
 | L5 Communication Paradigm | Vue emit |
 | L6 Verification Case | 点全部接受 -> 检查emit('apply', modified) |
 
 ### F03: rejectAll()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于全部拒绝按钮@click |
 | L3 Output Destination | emit('close') |
 | L6 Verification Case | 点全部拒绝 -> 检查弹窗关闭且未apply |
 
 ### F04: applyResult()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于应用结果按钮@click |
 | L3 Output Destination | emit('apply', props.modified) + emit('close') |
 | L6 Verification Case | 点应用结果 -> 检查emit('apply', modified) + 弹窗关闭 |
 
 ## ExitConfirmModal.vue
 
 组件路径: src/components/common/ExitConfirmModal.vue
 组件职责: 退出确认弹窗，监听Electron关闭请求，提供取消/直接退出/保存并退出选项
 
 ### F01: show() / hide()
 | Layer | Content |
 |---|---|
 | L1 Structure | defineExpose方法 |
 | L3 Output Destination | visible ref更新 |
 | L6 Verification Case | 调用show() -> 检查弹窗显示 |
 
 ### F02: cancel()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于取消按钮@click |
 | L3 Output Destination | visible = false + electronAPI.respondCloseChoice('cancel') |
 | L5 Communication Paradigm | IPC调用 |
 | L6 Verification Case | 点取消 -> 检查electronAPI.respondCloseChoice收到'cancel' |
 
 ### F03: directExit()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于直接退出按钮@click |
 | L3 Output Destination | visible = false + electronAPI.respondCloseChoice('quit') |
 | L6 Verification Case | 点直接退出 -> 检查IPC收到'quit' |
 
 ### F04: saveAndExit()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于保存并退出按钮@click |
 | L3 Output Destination | projectStore.saveProject + providerStore.saveProviders + electronAPI.respondCloseChoice('quit') |
 | L4 Side Effects | 主行为：保存数据后退出 |
 | L5 Communication Paradigm | store操作 + IPC调用 |
 | L6 Verification Case | 点保存并退出 -> 检查store持久化 + IPC收到'quit' |
 
 ### F05: electronAPI事件监听 (onMounted)
 | Layer | Content |
 |---|---|
 | L1 Structure | window事件监听器，onMounted注册 |
 | L2 Input Source | electronAPI.onCloseRequest / onFinalSave |
 | L3 Output Destination | show() / projectStore.saveProject |
 | L6 Verification Case | Electron发送关闭请求 -> 检查弹窗显示 |
 
 ## InlineMenu.vue
 
 组件路径: src/components/common/InlineMenu.vue
 组件职责: 编辑器内联AI操作菜单，提供20种文本操作（改写/扩写/润色/续写/精简等）
 
 ### F01: handleAction(action: string)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于菜单按钮@click |
 | L2 Input Source | action.key, props.selectedText |
 | L3 Output Destination | emit('action', action, selectedText) + emit('close') |
 | L4 Side Effects | 主行为：派发AI操作事件并关闭菜单 |
 | L5 Communication Paradigm | Vue emit |
 | L6 Verification Case | 点击改写 -> 检查emit('action', 'rewrite', selectedText) |
 | L7 Cross-component Dependency | EditorPanel处理此事件 |
 
 ## MemoryPanel.vue
 
 组件路径: src/components/common/MemoryPanel.vue
 组件职责: 记忆管理面板，CRUD记忆条目，分类管理，表单编辑
 
 ### F01: filteredItems (computed)
 | Layer | Content |
 |---|---|
 | L1 Structure | computed，按selectedCat过滤 |
 | L2 Input Source | projectStore.memories.items, selectedCat ref |
 | L3 Output Destination | 模板渲染 |
 | L6 Verification Case | 选择分类 -> 检查列表只显示该分类的记忆 |
 
 ### F02: getRealIndex(filteredIdx: number)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，过滤后索引转真实索引 |
 | L2 Input Source | filteredItems, projectStore.memories.items |
 | L3 Output Destination | 返回number |
 | L6 Verification Case | 在过滤模式下编辑 -> 检查操作正确索引 |
 
 ### F03: showForm(idx: number)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于添加/编辑按钮@click |
 | L3 Output Destination | editingIdx + formData + showingForm更新 |
 | L6 Verification Case | 点添加记忆 -> 检查表单显示 |
 
 ### F04: saveForm()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于保存按钮@click |
 | L2 Input Source | formData ref（key, category, content） |
 | L3 Output Destination | projectStore.updateMemory/addMemory |
 | L4 Side Effects | 含空值验证（alert提示） |
 | L5 Communication Paradigm | store写操作 |
 | L6 Verification Case | 填写表单后保存 -> 检查projectStore.memories更新 |
 
 ### F05: deleteItem(idx: number)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于删除按钮@click |
 | L3 Output Destination | confirm() + projectStore.deleteMemory |
 | L6 Verification Case | 点删除确认 -> 检查记忆被删除 |
 
 ### F06: addCategory()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于新增分类按钮@click |
 | L3 Output Destination | prompt() + projectStore.addMemoryCategory |
 | L6 Verification Case | 输入分类名 -> 检查分类列表新增 |
 
 ## PanelResizer.vue
 
 组件路径: src/components/common/PanelResizer.vue
 组件职责: 面板拖拽分隔条，支持垂直/水平方向拖拽调整面板大小
 
 ### F01: onMouseDown(e: MouseEvent)
 | Layer | Content |
 |---|---|
 | L1 Structure | 事件处理器，绑定于@mousedown |
 | L2 Input Source | MouseEvent, props.direction |
 | L3 Output Destination | isDragging=true, startPos赋值, document注册mousemove/mouseup, body.cursor修改 |
 | L4 Side Effects | 主行为：开始拖拽；副作用：修改body样式，注册全局事件 |
 | L5 Communication Paradigm | DOM事件 + 响应式变量 |
 | L6 Verification Case | mousedown -> 检查cursor变为col-resize/row-resize |
 
 ### F02: onMouseMove(e: MouseEvent)
 | Layer | Content |
 |---|---|
 | L1 Structure | document事件处理器，mousedown时注册 |
 | L2 Input Source | MouseEvent.clientX/Y, startPos |
 | L3 Output Destination | emit('resize', delta) |
 | L4 Side Effects | 主行为：拖拽时持续派发resize事件 |
 | L5 Communication Paradigm | Vue emit |
 | L6 Verification Case | 拖拽分隔条 -> 检查父组件收到resize事件且delta正确 |
 
 ### F03: onMouseUp()
 | Layer | Content |
 |---|---|
 | L1 Structure | document事件处理器 |
 | L3 Output Destination | isDragging=false, 移除document事件, 恢复body.cursor |
 | L4 Side Effects | 主行为：结束拖拽，清理事件监听和样式 |
 | L6 Verification Case | mouseup -> 检查cursor恢复且resize事件停止 |
 
 ## PluginMarket.vue
 
 组件路径: src/components/common/PluginMarket.vue
 组件职责: GitHub插件市场，搜索Agent/Skill仓库，Token管理，安装插件
 
 ### F01: saveToken()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于保存Token按钮@click |
 | L2 Input Source | tokenInput ref |
 | L3 Output Destination | settingsStore.updateSettings({githubToken}) + hasToken更新 |
 | L5 Communication Paradigm | store写操作 |
 | L6 Verification Case | 输入Token保存 -> 检查状态显示"已登录" |
 
 ### F02: searchGitHub()
 | Layer | Content |
 |---|---|
 | L1 Structure | async函数，绑定于搜索按钮@click和输入框keydown.enter |
 | L2 Input Source | searchQuery, searchCategory, searchSort, githubToken |
 | L3 Output Destination | fetch GitHub API -> results ref更新 |
 | L4 Side Effects | 主行为：搜索GitHub仓库；副作用：网络请求，可能429限流 |
 | L5 Communication Paradigm | fetch API + 响应式ref更新 |
 | L6 Verification Case | 输入关键词搜索 -> 检查结果列表显示仓库项 |
 
 ### F03: goToPage(page: number)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于分页按钮@click |
 | L3 Output Destination | currentPage更新 + searchGitHub() |
 | L6 Verification Case | 点下一页 -> 检查currentPage递增且重新搜索 |
 
 ### F04: installFromMarket(item: any)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于安装按钮@click |
 | L2 Input Source | item.html_url, item.full_name |
 | L3 Output Destination | window.dispatchEvent('plugin-install') + statusText更新 |
 | L5 Communication Paradigm | window事件广播 |
 | L6 Verification Case | 点安装 -> 检查window收到plugin-install事件 |
 
 ### F05: formatDate(dateStr: string)
 | Layer | Content |
 |---|---|
 | L1 Structure | 纯函数 |
 | L2 Input Source | ISO日期字符串 |
 | L3 Output Destination | 返回YYYY-MM-DD格式 |
 | L6 Verification Case | 传入ISO日期 -> 检查返回格式正确 |
 
 ## 副作用风险表
 
 | 函数 | 风险等级 | 风险描述 |
 |---|---|---|
 | PanelResizer.onMouseDown | 中 | 全局事件注册，需正确清理 |
 | searchGitHub | 高 | 网络请求，可能429/超时 |
 | saveAndExit | 中 | store持久化 + IPC |
 
 ## 通信范式汇总
 
 | 范式 | 使用位置 |
 |---|---|
 | Vue emit | BreadcrumbBar, ContextMenu, DiffModal, InlineMenu, PanelResizer |
 | window事件 | PluginMarket(install), ExitConfirmModal(electron事件) |
 | store操作 | MemoryPanel, PluginMarket(saveToken) |
 | DOM操作 | PanelResizer(全局事件+body样式) |
 
 ## L6 测试映射表
 
 | 测试ID | 函数 | 测试描述 |
 |---|---|---|
 | T-common-01 | BreadcrumbBar home | 点首页 -> emit('home') |
 | T-common-02 | BreadcrumbBar navigate | 点面包屑项 -> emit('navigate', i) |
 | T-common-03 | ContextMenu handleClick | 点菜单项 -> emit('action') |
 | T-common-04 | DiffModal acceptAll | 点全部接受 -> emit('apply', modified) |
 | T-common-05 | DiffModal navDiff | 点下一处 -> currentIdx递增 |
 | T-common-06 | ExitConfirmModal cancel | 点取消 -> IPC收到'cancel' |
 | T-common-07 | ExitConfirmModal saveAndExit | 点保存退出 -> store持久化+IPC |
 | T-common-08 | InlineMenu handleAction | 点改写 -> emit('action', 'rewrite') |
 | T-common-09 | MemoryPanel saveForm | 保存记忆 -> store更新 |
 | T-common-10 | MemoryPanel addCategory | 新增分类 -> 列表更新 |
 | T-common-11 | PanelResizer拖拽 | mousedown->move->up -> emit resize delta |
 | T-common-12 | PluginMarket saveToken | 保存Token -> 状态"已登录" |
 | T-common-13 | PluginMarket searchGitHub | 搜索 -> 结果列表显示 |
 | T-common-14 | PluginMarket installFromMarket | 点安装 -> window事件派发 |
