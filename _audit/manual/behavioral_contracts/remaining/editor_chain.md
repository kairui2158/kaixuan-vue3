 # EditorPanel.vue 行为契约
 
 组件路径: src/components/editor/EditorPanel.vue
 组件职责: 正文编辑器核心面板，提供文本编辑、撤销/重做、查找替换、导出、去AI味触发、内联AI菜单等功能
 
 ## 依赖关系
 - useEditorStore: 标签页管理、查找替换状态
 - useProjectStore: 章节数据持久化
 - useDeAiStore: 去AI味处理状态
 - useSettingsStore: 自动保存间隔、外观配置
 - useUndoRedo: 撤销/重做历史栈
 - useDeAi: 去AI味处理composable
 
 ## 函数契约
 
 ### F01: onInput(e: Event)
 | Layer | Content |
 |---|---|
 | L1 Structure | 事件处理器，绑定于textarea的@input事件 |
 | L2 Input Source | DOM Event（textarea.value） |
 | L3 Output Destination | undoRedo.pushState + editorStore.updateContent |
 | L4 Side Effects | 主行为：更新编辑器内容；副作用：pushState可能触发内存增长，风险低 |
 | L5 Communication Paradigm | store写操作 |
 | L6 Verification Case | 在编辑器输入文字 -> 检查activeTab.content已更新且wordCount增加 |
 | L7 Cross-component Dependency | 无直接依赖，editorStore更新后其他组件通过computed响应 |
 
 ### F02: onKeydown(e: KeyboardEvent)
 | Layer | Content |
 |---|---|
 | L1 Structure | 事件处理器，绑定于textarea的@keydown事件 |
 | L2 Input Source | KeyboardEvent（ctrlKey, key） |
 | L3 Output Destination | save()或editorStore.toggleFind() |
 | L4 Side Effects | 主行为：快捷键分发；preventDefault阻止默认行为 |
 | L5 Communication Paradigm | 函数调用 |
 | L6 Verification Case | Ctrl+S -> 检查保存触发；Ctrl+F -> 检查查找栏显示 |
 | L7 Cross-component Dependency | 依赖save()和editorStore.toggleFind() |
 
 ### F03: save()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于保存按钮@click和Ctrl+S快捷键 |
 | L2 Input Source | activeTab.value（editorStore.activeTabId对应的tab） |
 | L3 Output Destination | projectStore.chapters[volId][ch].body更新 + projectStore.saveProject() + editorStore.markSaved() |
 | L4 Side Effects | 主行为：持久化章节正文；副作用：无风险 |
 | L5 Communication Paradigm | store写操作 + IPC持久化 |
 | L6 Verification Case | 编辑文本后点击保存 -> 检查projectStore中对应chapter.body已更新 |
 | L7 Cross-component Dependency | projectStore.saveProject触发IPC写盘 |
 
 ### F04: undo()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于撤销按钮@click和window事件editor-undo |
 | L2 Input Source | undoRedo.undo()返回的历史状态 |
 | L3 Output Destination | editorStore.updateContent + textarea.value恢复 |
 | L4 Side Effects | 主行为：恢复上一个编辑状态 |
 | L5 Communication Paradigm | store写操作 + DOM直接操作 |
 | L6 Verification Case | 编辑后点撤销 -> 检查文本恢复到上一步状态 |
 | L7 Cross-component Dependency | 依赖useUndoRedo composable |
 
 ### F05: redo()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于重做按钮@click和window事件editor-redo |
 | L2 Input Source | undoRedo.redo()返回的历史状态 |
 | L3 Output Destination | editorStore.updateContent + textarea.value恢复 |
 | L4 Side Effects | 主行为：恢复下一个编辑状态 |
 | L5 Communication Paradigm | store写操作 + DOM直接操作 |
 | L6 Verification Case | 撤销后点重做 -> 检查文本恢复到撤销前状态 |
 | L7 Cross-component Dependency | 依赖useUndoRedo composable |
 
 ### F06: generateContent()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于生成按钮@click |
 | L2 Input Source | activeTab.chapterId |
 | L3 Output Destination | window.dispatchEvent('generate-body') |
 | L4 Side Effects | 主行为：通知父组件打开流水线body步骤；副作用：无直接数据修改 |
 | L5 Communication Paradigm | window事件广播 |
 | L6 Verification Case | 点击生成按钮 -> 检查window收到generate-body事件且detail.chapterId正确 |
 | L7 Cross-component Dependency | 父组件App.vue监听此事件，触发PipelinePanel打开 |
 
 ### F07: triggerDeAi()
 | Layer | Content |
 |---|---|
 | L1 Structure | async函数，绑定于去AI味按钮@click |
 | L2 Input Source | activeTab.content, deAiStore.skillIds |
 | L3 Output Destination | editorStore.updateContent（写入处理后的文本） |
 | L4 Side Effects | 主行为：执行去AI味处理流程；副作用：长时间异步操作，deAiStore.isProcessing变化 |
 | L5 Communication Paradigm | store写操作 + composable调用 |
 | L6 Verification Case | 配置技能后点击去AI味 -> 检查处理完成后编辑器内容已更新 |
 | L7 Cross-component Dependency | 依赖useDeAi.process()，deAiStore状态 |
 
 ### F08: exportChapter(format: string)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于导出下拉菜单按钮@click |
 | L2 Input Source | activeTab.content, activeTab.title, format参数 |
 | L3 Output Destination | Blob + a.click()触发下载 |
 | L4 Side Effects | 主行为：文件下载；副作用：DOM动态创建a元素 |
 | L5 Communication Paradigm | DOM操作 + 文件系统交互 |
 | L6 Verification Case | 点击导出md -> 检查浏览器下载了.md文件且内容正确 |
 | L7 Cross-component Dependency | 依赖buildEpubZip()处理epub格式 |
 
 ### F09: startAutoSave()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，onMounted时调用 |
 | L2 Input Source | settingsStore.autoSaveInterval |
 | L3 Output Destination | setInterval定时器 -> save() |
 | L4 Side Effects | 主行为：定时保存；副作用：定时器资源需在onUnmounted清理 |
 | L5 Communication Paradigm | 定时器 + 函数调用 |
 | L6 Verification Case | 设置自动保存间隔为5秒 -> 等待5秒后检查save被调用 |
 | L7 Cross-component Dependency | 依赖settingsStore和save() |
 
 ### F10: findNext()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于查找下一个按钮@click |
 | L2 Input Source | editorTextarea.value, editorStore.findQuery |
 | L3 Output Destination | textarea.setSelectionRange（高亮匹配文本） |
 | L4 Side Effects | 主行为：查找并选中下一个匹配项；含wrap-around逻辑 |
 | L5 Communication Paradigm | DOM直接操作 |
 | L6 Verification Case | 输入查找词后点下一个 -> 检查textarea选中区域为匹配文本 |
 | L7 Cross-component Dependency | 依赖editorStore.findQuery |
 
 ### F11: findPrev()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于上一个按钮@click |
 | L2 Input Source | editorTextarea.value, editorStore.findQuery |
 | L3 Output Destination | textarea.setSelectionRange |
 | L4 Side Effects | 主行为：查找并选中上一个匹配项 |
 | L5 Communication Paradigm | DOM直接操作 |
 | L6 Verification Case | 输入查找词后点上一个 -> 检查textarea选中前一个匹配 |
 | L7 Cross-component Dependency | 依赖editorStore.findQuery |
 
 ### F12: replaceOne()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于替换按钮@click |
 | L2 Input Source | activeTab.content, editorStore.findQuery, editorStore.replaceQuery, textarea选区 |
 | L3 Output Destination | editorStore.updateContent + textarea.setSelectionRange |
 | L4 Side Effects | 主行为：替换当前选中的匹配文本；如未选中匹配则先findNext |
 | L5 Communication Paradigm | store写操作 + DOM操作 |
 | L6 Verification Case | 选中匹配文本后点替换 -> 检查文本已替换且光标移到替换文本末尾 |
 | L7 Cross-component Dependency | 依赖editorStore |
 
 ### F13: replaceAll()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于全部替换按钮@click |
 | L2 Input Source | activeTab.content, editorStore.findQuery, editorStore.replaceQuery |
 | L3 Output Destination | editorStore.updateContent |
 | L4 Side Effects | 主行为：替换全文所有匹配项 |
 | L5 Communication Paradigm | store写操作 |
 | L6 Verification Case | 输入查找词和替换词后点全部替换 -> 检查所有匹配已替换 |
 | L7 Cross-component Dependency | 依赖editorStore |
 
 ### F14: checkInlineMenu()
 | Layer | Content |
 |---|---|
 | L1 Structure | 事件处理器，绑定于textarea的@mouseup事件 |
 | L2 Input Source | textarea.selectionStart, textarea.selectionEnd, textarea.value |
 | L3 Output Destination | inlineMenuVisible和inlineMenuPos更新 |
 | L4 Side Effects | 主行为：选中文本后显示内联AI菜单；选中文本<2字符则隐藏 |
 | L5 Communication Paradigm | 响应式ref更新 |
 | L6 Verification Case | 选中编辑器文本 -> 检查内联菜单出现在编辑器附近 |
 | L7 Cross-component Dependency | 内联菜单触发applyInlineAction |
 
 ### F15: hideInlineMenu()
 | Layer | Content |
 |---|---|
 | L1 Structure | 事件处理器，绑定于textarea的@blur事件 |
 | L2 Input Source | 无 |
 | L3 Output Destination | inlineMenuVisible = false（延迟200ms） |
 | L4 Side Effects | 主行为：隐藏内联菜单；延迟是为了允许点击菜单按钮 |
 | L5 Communication Paradigm | 响应式ref更新 |
 | L6 Verification Case | 编辑器失焦 -> 检查内联菜单在200ms后消失 |
 | L7 Cross-component Dependency | 无 |
 
 ### F16: applyInlineAction(action: string, label: string)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于内联菜单按钮@mousedown.prevent |
 | L2 Input Source | action参数, label参数, textarea选中文本 |
 | L3 Output Destination | window.dispatchEvent('editor-action')，detail含action和prompt |
 | L4 Side Effects | 主行为：派发内联AI操作事件；副作用：隐藏内联菜单 |
 | L5 Communication Paradigm | window事件广播 |
 | L6 Verification Case | 选中文本后点击改写 -> 检查window收到editor-action事件且action为inline-ai |
 | L7 Cross-component Dependency | 父组件App.vue监听此事件，触发ChatPanel发送AI请求 |
 
 ### F17: aiNames()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于AI命名按钮@click |
 | L2 Input Source | activeTab.chapterId |
 | L3 Output Destination | window.dispatchEvent('editor-action')，action='ai-names' |
 | L4 Side Effects | 主行为：触发AI命名功能 |
 | L5 Communication Paradigm | window事件广播 |
 | L6 Verification Case | 点击AI命名 -> 检查window收到editor-action事件且action正确 |
 | L7 Cross-component Dependency | 父组件处理此事件 |
 
 ### F18: writingRules()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于写作规则按钮@click |
 | L2 Input Source | activeTab存在性检查 |
 | L3 Output Destination | window.dispatchEvent('editor-action')，action='writing-rules' |
 | L4 Side Effects | 主行为：触发写作规则功能 |
 | L5 Communication Paradigm | window事件广播 |
 | L6 Verification Case | 点击写作规则 -> 检查window收到editor-action事件 |
 | L7 Cross-component Dependency | 父组件处理此事件 |
 
 ### F19: timeline()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于时间线按钮@click |
 | L2 Input Source | activeTab.chapterId |
 | L3 Output Destination | window.dispatchEvent('editor-action')，action='timeline' |
 | L4 Side Effects | 主行为：触发时间线功能 |
 | L5 Communication Paradigm | window事件广播 |
 | L6 Verification Case | 点击时间线 -> 检查window收到editor-action事件 |
 | L7 Cross-component Dependency | 父组件处理此事件 |
 
 ### F20: batchReview()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于批量审阅按钮@click |
 | L2 Input Source | activeTab.chapterId |
 | L3 Output Destination | window.dispatchEvent('editor-action')，action='batch-review' |
 | L4 Side Effects | 主行为：触发批量审阅功能 |
 | L5 Communication Paradigm | window事件广播 |
 | L6 Verification Case | 点击批量审阅 -> 检查window收到editor-action事件 |
 | L7 Cross-component Dependency | 父组件处理此事件 |
 
 ### F21: revise()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于修订按钮@click |
 | L2 Input Source | activeTab.chapterId |
 | L3 Output Destination | window.dispatchEvent('editor-action')，action='revise' |
 | L4 Side Effects | 主行为：触发修订功能 |
 | L5 Communication Paradigm | window事件广播 |
 | L6 Verification Case | 点击修订 -> 检查window收到editor-action事件 |
 | L7 Cross-component Dependency | 父组件处理此事件 |
 
 ### F22: insertVar()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于变量按钮@click |
 | L2 Input Source | editorTextarea.selectionStart/End, activeTab.content, prompt()用户输入 |
 | L3 Output Destination | editorStore.updateContent（插入{{varName}}到光标位置）+ textarea.setSelectionRange |
 | L4 Side Effects | 主行为：在光标位置插入模板变量；副作用：prompt弹窗 |
 | L5 Communication Paradigm | store写操作 + DOM操作 |
 | L6 Verification Case | 点击变量 -> 输入变量名 -> 检查编辑器中插入了{{变量名}} |
 | L7 Cross-component Dependency | 依赖editorStore |
 
 ### F23: buildEpubZip(files: any[])
 | Layer | Content |
 |---|---|
 | L1 Structure | 纯函数，被exportChapter调用 |
 | L2 Input Source | files数组（name, content, store标志） |
 | L3 Output Destination | 返回Uint8Array（ZIP二进制数据） |
 | L4 Side Effects | 无副作用，纯计算函数 |
 | L5 Communication Paradigm | 返回值 |
 | L6 Verification Case | 传入测试文件数组 -> 检查返回的Uint8Array以PK签名开头（0x504B0304） |
 | L7 Cross-component Dependency | 仅被exportChapter('epub')调用 |
 
 ### F24: handleUndoEvent() / handleRedoEvent() / handleSaveEvent()
 | Layer | Content |
 |---|---|
 | L1 Structure | window事件监听器，onMounted注册 |
 | L2 Input Source | window事件editor-undo / editor-redo / editor-save |
 | L3 Output Destination | 分别调用undo() / redo() / save() |
 | L4 Side Effects | 主行为：转发window事件到组件方法 |
 | L5 Communication Paradigm | window事件监听 |
 | L6 Verification Case | dispatchEvent('editor-save') -> 检查save()被调用 |
 | L7 Cross-component Dependency | 依赖undo/redo/save函数 |
 
 ## Computed 属性
 
 ### C01: activeTab
 | Layer | Content |
 |---|---|
 | L1 Structure | computed，从editorStore.activeTab获取 |
 | L2 Input Source | editorStore.tabs + editorStore.activeTabId |
 | L3 Output Destination | 模板渲染 |
 | L4 Side Effects | 无副作用，纯读操作 |
 | L6 Verification Case | 切换标签页 -> 检查编辑器内容更新为新tab内容 |
 
 ### C02: wordCount
 | Layer | Content |
 |---|---|
 | L1 Structure | computed，从activeTab.content.length计算 |
 | L2 Input Source | activeTab.content |
 | L3 Output Destination | 模板渲染（字数显示） |
 | L4 Side Effects | 无副作用 |
 | L6 Verification Case | 输入文字 -> 检查字数计数实时更新 |
 
 ## 副作用风险表
 
 | 函数 | 风险等级 | 风险描述 |
 |---|---|---|
 | onInput | 低 | pushState频繁调用可能内存增长，但有50步上限 |
 | save | 中 | 触发IPC写盘，可能阻塞 |
 | triggerDeAi | 高 | 长时间异步操作，可能失败或超时 |
 | startAutoSave | 低 | 定时器需正确清理 |
 | exportChapter | 低 | DOM动态创建元素 |
 
 ## 通信范式汇总
 
 | 范式 | 使用位置 |
 |---|---|
 | store写操作 | onInput, save, undo, redo, triggerDeAi, replaceOne, replaceAll, insertVar |
 | window事件广播 | generateContent, applyInlineAction, aiNames, writingRules, timeline, batchReview, revise, handleUndoEvent/handleRedoEvent/handleSaveEvent |
 | DOM直接操作 | undo, redo, findNext, findPrev, replaceOne, insertVar, exportChapter |
 | 定时器 | startAutoSave |
 
 ## L6 测试映射表
 
 | 测试ID | 函数 | 测试描述 |
 |---|---|---|
 | T-editor-01 | onInput | 输入文字 -> content更新 -> wordCount增加 |
 | T-editor-02 | save | 编辑后保存 -> projectStore持久化 |
 | T-editor-03 | undo/redo | 撤销 -> 恢复；重做 -> 再恢复 |
 | T-editor-04 | findNext | 输入查找词 -> 高亮匹配 |
 | T-editor-05 | replaceAll | 全部替换 -> 所有匹配已替换 |
 | T-editor-06 | checkInlineMenu | 选中文本 -> 内联菜单显示 |
 | T-editor-07 | applyInlineAction | 点改写 -> editor-action事件派发 |
 | T-editor-08 | exportChapter | 导出md -> 下载文件 |
 | T-editor-09 | triggerDeAi | 配置技能后触发 -> 处理后内容更新 |
 | T-editor-10 | onKeydown | Ctrl+S -> 保存；Ctrl+F -> 查找栏 |
