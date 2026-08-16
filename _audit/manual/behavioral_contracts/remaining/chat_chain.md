 # ChatPanel.vue + ChatMessage.vue 行为契约
 
 ## ChatPanel.vue
 
 组件路径: src/components/chat/ChatPanel.vue
 组件职责: AI对话面板，提供消息发送、流式输出、消息复制/重生成/应用到编辑器、智能体和模型选择
 
 ### 依赖关系
 - useProjectStore: 项目数据
 - useProviderStore: 供应商和模型配置
 - useAgentStore: 智能体配置
 - useSkillStore: 技能配置
 - useSettingsStore: 设置数据
 
 ### F01: sendMessage()
 | Layer | Content |
 |---|---|
 | L1 Structure | async函数，绑定于发送按钮@click和输入框keydown.enter |
 | L2 Input Source | inputText ref, selectedChatAgent, selectedChatModel |
 | L3 Output Destination | messages数组push, callApi() |
 | L4 Side Effects | 主行为：发送用户消息并触发AI回复；清空输入框 |
 | L5 Communication Paradigm | 响应式ref + 函数调用 |
 | L6 Verification Case | 输入文本后回车 -> 检查messages新增user消息且触发AI调用 |
 | L7 Cross-component Dependency | 依赖callApi()和selectedChatAgent/Model |
 
 ### F02: callApi(userMessage: string)
 | Layer | Content |
 |---|---|
 | L1 Structure | async函数，被sendMessage调用 |
 | L2 Input Source | userMessage, providerStore.activeGenerateProvider, selectedChatAgent, selectedChatModel, activeSkillNames |
 | L3 Output Destination | messages数组push（assistant消息），流式更新message.content |
 | L4 Side Effects | 主行为：调用API并流式接收回复；副作用：网络请求，可能429超限 |
 | L5 Communication Paradigm | fetch API + 响应式ref更新 |
 | L6 Verification Case | 发送消息后 -> 检查assistant消息逐步出现流式文本 |
 | L7 Cross-component Dependency | 依赖providerStore获取API配置 |
 
 ### F03: copyMessage(content: string)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，通过ChatMessage的@copy事件接收 |
 | L2 Input Source | message.content字符串 |
 | L3 Output Destination | navigator.clipboard.writeText |
 | L4 Side Effects | 主行为：复制消息到剪贴板 |
 | L5 Communication Paradigm | 浏览器API调用 |
 | L6 Verification Case | 点击复制 -> 检查剪贴板包含消息内容 |
 | L7 Cross-component Dependency | 无 |
 
 ### F04: regenerateMessage()
 | Layer | Content |
 |---|---|
 | L1 Structure | async函数，通过ChatMessage的@regenerate事件接收 |
 | L2 Input Source | messages数组最后一条user消息 |
 | L3 Output Destination | 移除最后一条assistant消息，重新callApi |
 | L4 Side Effects | 主行为：删除旧回复并重新生成；副作用：API调用 |
 | L5 Communication Paradigm | 响应式数组操作 + 函数调用 |
 | L6 Verification Case | 点击重生成 -> 检查旧回复被删除且新回复开始流式出现 |
 | L7 Cross-component Dependency | 依赖callApi() |
 
 ### F05: applyToEditor(content: string)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，通过ChatMessage的@apply事件接收 |
 | L2 Input Source | message.content字符串 |
 | L3 Output Destination | window.dispatchEvent('chat-apply-to-editor')，detail含content |
 | L4 Side Effects | 主行为：通知编辑器面板插入AI回复内容 |
 | L5 Communication Paradigm | window事件广播 |
 | L6 Verification Case | 点击应用 -> 检查window收到chat-apply-to-editor事件 |
 | L7 Cross-component Dependency | EditorPanel或App.vue监听此事件 |
 
 ### F06: clearMessages()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于清空按钮（Ctrl+K快捷键） |
 | L2 Input Source | 无 |
 | L3 Output Destination | messages数组清空 |
 | L4 Side Effects | 主行为：清空所有对话消息 |
 | L5 Communication Paradigm | 响应式数组操作 |
 | L6 Verification Case | 点击清空 -> 检查messages为空数组 |
 | L7 Cross-component Dependency | 无 |
 
 ### F07: scrollToBottom()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，在消息更新后调用 |
 | L2 Input Source | 消息容器DOM引用 |
 | L3 Output Destination | container.scrollTop = scrollHeight |
 | L4 Side Effects | 主行为：滚动到消息列表底部 |
 | L5 Communication Paradigm | DOM操作 |
 | L6 Verification Case | 发送消息后 -> 检查滚动条自动到底部 |
 | L7 Cross-component Dependency | 无 |
 
 ### Computed属性
 
 ### C01: selectedChatAgent
 | Layer | Content |
 |---|---|
 | L1 Structure | computed，从agentStore获取当前选中的agent |
 | L2 Input Source | agentStore.agents, chatAgentId ref |
 | L3 Output Destination | 模板渲染 + callApi参数 |
 | L6 Verification Case | 切换智能体 -> 检查系统提示词变化 |
 
 ### C02: selectedChatModel
 | Layer | Content |
 |---|---|
 | L1 Structure | computed，从providerStore获取当前模型 |
 | L2 Input Source | providerStore.activeGenerateProvider.selectedModel |
 | L3 Output Destination | 模板渲染 + callApi参数 |
 | L6 Verification Case | 切换供应商模型 -> 检查下拉显示更新 |
 
 ### C03: activeSkillNames
 | Layer | Content |
 |---|---|
 | L1 Structure | computed，从skillStore获取已激活技能名称列表 |
 | L2 Input Source | skillStore.pipelineSkills, skillStore.skills |
 | L3 Output Destination | 模板渲染 |
 | L6 Verification Case | 添加技能到流水线 -> 检查聊天面板显示技能名称 |
 
 ### C04: configStatus
 | Layer | Content |
 |---|---|
 | L1 Structure | computed，检查API配置是否完整 |
 | L2 Input Source | providerStore.activeGenerateProvider |
 | L3 Output Destination | 模板渲染（状态提示） |
 | L6 Verification Case | 未配置API -> 检查显示警告提示 |
 
 ## ChatMessage.vue
 
 组件路径: src/components/chat/ChatMessage.vue
 组件职责: 单条聊天消息渲染，支持Markdown渲染、操作按钮
 
 ### F01: renderedContent (computed)
 | Layer | Content |
 |---|---|
 | L1 Structure | computed，使用marked解析Markdown |
 | L2 Input Source | props.message.content |
 | L3 Output Destination | 模板v-html渲染 |
 | L4 Side Effects | 主行为：Markdown转HTML；含XSS清理（移除script标签、on*事件、javascript:协议） |
 | L5 Communication Paradigm | computed属性 |
 | L6 Verification Case | 发送含Markdown语法的消息 -> 检查正确渲染为HTML |
 | L7 Cross-component Dependency | 依赖marked库 |
 
 ### F02: emit copy / regenerate / apply
 | Layer | Content |
 |---|---|
 | L1 Structure | defineEmits，通过按钮@click触发 |
 | L2 Input Source | message.content |
 | L3 Output Destination | 父组件ChatPanel接收事件 |
 | L4 Side Effects | 主行为：通知父组件执行操作 |
 | L5 Communication Paradigm | Vue emit |
 | L6 Verification Case | 点击复制/重生成/应用 -> 检查父组件收到对应事件 |
 | L7 Cross-component Dependency | ChatPanel处理这些事件 |
 
 ## 副作用风险表
 
 | 函数 | 风险等级 | 风险描述 |
 |---|---|---|
 | callApi | 高 | 网络请求，可能429/超时/断网 |
 | regenerateMessage | 高 | 重新API调用 |
 | copyMessage | 低 | 剪贴板API可能被浏览器限制 |
 | renderedContent | 中 | v-html渲染需XSS防护（已实现script/on*清理） |
 
 ## 通信范式汇总
 
 | 范式 | 使用位置 |
 |---|---|
 | 响应式ref | sendMessage, callApi, clearMessages |
 | Vue emit | ChatMessage copy/regenerate/apply |
 | window事件广播 | applyToEditor |
 | 浏览器API | copyMessage(clipboard), callApi(fetch) |
 | DOM操作 | scrollToBottom |
 
 ## L6 测试映射表
 
 | 测试ID | 函数 | 测试描述 |
 |---|---|---|
 | T-chat-01 | sendMessage | 输入文本回车 -> user消息出现 |
 | T-chat-02 | callApi | 发送后 -> assistant消息流式出现 |
 | T-chat-03 | copyMessage | 点复制 -> 剪贴板有内容 |
 | T-chat-04 | regenerateMessage | 点重生成 -> 旧回复删除+新回复出现 |
 | T-chat-05 | applyToEditor | 点应用 -> window事件派发 |
 | T-chat-06 | clearMessages | Ctrl+K -> messages清空 |
 | T-chat-07 | renderedContent | Markdown消息 -> 正确渲染HTML |
 | T-chat-08 | configStatus | 未配置API -> 显示警告 |
