 # Settings组件行为契约
 
 涵盖: SettingsModal, ApiSettings, AgentSettings, SkillSettings, AppearanceSettings, DiagLogPanel
 
 ## SettingsModal.vue
 
 组件路径: src/components/settings/SettingsModal.vue
 组件职责: 设置面板容器，tab切换，包含6个tab（API/技能/智能体/外观/去AI味/诊断日志）
 
 ### F01: handleClose()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于关闭按钮@click和backdrop点击 |
 | L2 Input Source | 无 |
 | L3 Output Destination | emit('close') |
 | L4 Side Effects | 主行为：关闭设置面板 |
 | L5 Communication Paradigm | Vue emit |
 | L6 Verification Case | 点击关闭 -> 检查设置面板消失 |
 | L7 Cross-component Dependency | App.vue监听close事件 |
 
 ### F02: handleSave()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于保存按钮@click |
 | L2 Input Source | 各子组件store状态 |
 | L3 Output Destination | 各store.saveXXX() + emit('close') |
 | L4 Side Effects | 主行为：保存所有设置并关闭 |
 | L5 Communication Paradigm | store操作 + Vue emit |
 | L6 Verification Case | 点击保存 -> 检查各store持久化且面板关闭 |
 | L7 Cross-component Dependency | 依赖所有子组件store |
 
 ### tabs数组
 | Layer | Content |
 |---|---|
 | L1 Structure | 静态数组，定义6个tab的id和label |
 | L6 Verification Case | 检查6个tab全部渲染且可切换 |
 
 ## ApiSettings.vue
 
 组件路径: src/components/settings/ApiSettings.vue
 组件职责: API供应商配置，列表视图+编辑视图，获取模型/测试连接/导入导出配置
 
 ### F01: isProviderActive(id: string)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，模板中用于卡片状态渲染 |
 | L2 Input Source | providerStore.generateProvider, providerStore.verifyProvider |
 | L3 Output Destination | 返回boolean |
 | L4 Side Effects | 无副作用 |
 | L5 Communication Paradigm | 返回值 |
 | L6 Verification Case | 设置供应商为generate -> 检查该供应商显示ON状态 |
 | L7 Cross-component Dependency | 依赖providerStore |
 
 ### F02: getPurpose(id: string)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，返回供应商用途 |
 | L2 Input Source | providerStore.generateProvider, providerStore.verifyProvider |
 | L3 Output Destination | 返回'generate'或'verify' |
 | L6 Verification Case | 设置供应商用途 -> 检查下拉显示正确选项 |
 
 ### F03: setPurpose(id: string, purpose: string)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于用途下拉@change |
 | L2 Input Source | id, purpose参数 |
 | L3 Output Destination | providerStore.setGenerateProvider/setVerifyProvider |
 | L4 Side Effects | 主行为：设置供应商用途，含role-swap逻辑（切换时保留旧角色分配） |
 | L5 Communication Paradigm | store写操作 |
 | L6 Verification Case | 切换供应商用途 -> 检查旧generate变为verify或反之 |
 | L7 Cross-component Dependency | providerStore状态变更影响去AI味面板和聊天面板 |
 
 ### F04: enterProviderEdit(id: string | null)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于卡片@click和添加按钮 |
 | L2 Input Source | id参数（null=新建）或providerStore.providers |
 | L3 Output Destination | editingProvider ref赋值 |
 | L4 Side Effects | 主行为：进入编辑视图 |
 | L5 Communication Paradigm | 响应式ref更新 |
 | L6 Verification Case | 点击供应商卡片 -> 检查进入编辑视图且表单预填 |
 
 ### F05: exitProviderEdit()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于返回按钮@click |
 | L3 Output Destination | editingProvider = null |
 | L6 Verification Case | 点击返回 -> 检查回到列表视图 |
 
 ### F06: saveAndExit()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于保存按钮@click |
 | L2 Input Source | editingProvider ref |
 | L3 Output Destination | providerStore.updateProvider/addProvider + saveProviders + exitProviderEdit |
 | L4 Side Effects | 主行为：保存供应商配置并持久化 |
 | L5 Communication Paradigm | store写操作 + IPC持久化 |
 | L6 Verification Case | 编辑后保存 -> 检查provider列表更新且持久化 |
 
 ### F07: fetchModels()
 | Layer | Content |
 |---|---|
 | L1 Structure | async函数，绑定于获取模型按钮@click |
 | L2 Input Source | editingProvider.baseUrl, editingProvider.apiKey |
 | L3 Output Destination | window.electronAPI.fetchModels -> editingProvider.models更新 |
 | L4 Side Effects | 主行为：通过IPC获取API模型列表；副作用：网络请求，fetchingModels状态变化 |
 | L5 Communication Paradigm | IPC调用 + 响应式ref更新 |
 | L6 Verification Case | 填写URL和Key后点获取 -> 检查模型列表出现 |
 | L7 Cross-component Dependency | 依赖electronAPI IPC通道 |
 
 ### F08: testConnection()
 | Layer | Content |
 |---|---|
 | L1 Structure | async函数，绑定于测试连接按钮@click |
 | L2 Input Source | editingProvider.baseUrl, editingProvider.apiKey |
 | L3 Output Destination | window.electronAPI.providerTestConnection -> connStatus更新 |
 | L4 Side Effects | 主行为：测试API连接是否可用 |
 | L5 Communication Paradigm | IPC调用 + 响应式ref更新 |
 | L6 Verification Case | 点测试连接 -> 检查显示连接成功或失败状态 |
 
 ### F09: exportConfig() / importConfig()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于导出/导入按钮@click |
 | L2 Input Source | providerStore.providers（导出）/ File API（导入） |
 | L3 Output Destination | Blob下载 / providerStore.addProvider |
 | L4 Side Effects | 导出：文件下载；导入：文件读取 + store更新 |
 | L5 Communication Paradigm | DOM操作 + store写操作 |
 | L6 Verification Case | 点导出 -> 下载json文件；点导入 -> 选择文件后供应商列表更新 |
 
 ## AgentSettings.vue
 
 组件路径: src/components/settings/AgentSettings.vue
 组件职责: 智能体CRUD管理，含名称/模型/温度/maxTokens/系统提示词配置
 
 ### F01: toggleEdit(id: string)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于编辑按钮@click |
 | L2 Input Source | id参数 |
 | L3 Output Destination | editingId ref更新 |
 | L6 Verification Case | 点编辑 -> 检查展开编辑表单 |
 
 ### F02: saveAgent(id: string)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于保存按钮@click |
 | L3 Output Destination | agentStore.saveAgents + editingId清空 |
 | L5 Communication Paradigm | store写操作 |
 | L6 Verification Case | 编辑后保存 -> 检查agent配置持久化 |
 
 ### F03: addAgent()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于添加按钮@click |
 | L3 Output Destination | agentStore.addAgent（新默认配置） |
 | L6 Verification Case | 点添加 -> 检查列表新增agent卡片 |
 
 ## SkillSettings.vue
 
 组件路径: src/components/settings/SkillSettings.vue
 组件职责: 技能CRUD管理，含流水线排序、Markdown双栏编辑器、执行模式/输出格式配置、联动技能、变量插入
 
 ### F01: addToPipeline(id: string)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于加入流水线按钮@click |
 | L3 Output Destination | skillStore.pipelineSkills.push + saveSkills |
 | L6 Verification Case | 点加入流水线 -> 检查流水线列表新增技能 |
 
 ### F02: removeFromPipeline(index: number)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于移除按钮@click |
 | L3 Output Destination | skillStore.pipelineSkills.splice + saveSkills |
 | L6 Verification Case | 点移除 -> 检查流水线列表减少 |
 
 ### F03: editSkill(id: string)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于编辑按钮@click |
 | L2 Input Source | skillStore.skills |
 | L3 Output Destination | 多个editing ref赋值（name/template/category等） |
 | L6 Verification Case | 点编辑 -> 检查编辑弹窗出现且表单预填 |
 
 ### F04: saveEdit()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于保存按钮@click |
 | L3 Output Destination | skillStore.updateSkill + editingSkillId清空 |
 | L6 Verification Case | 编辑后保存 -> 检查技能配置更新 |
 
 ### F05: insertVar(varName: string)
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于变量按钮@click.prevent |
 | L3 Output Destination | editingTemplate += '{{varName}}' |
 | L6 Verification Case | 点变量按钮 -> 检查模板末尾插入{{变量名}} |
 
 ### F06: renderMarkdown(text: string)
 | Layer | Content |
 |---|---|
 | L1 Structure | 纯函数，用于模板预览区v-html |
 | L2 Input Source | editingTemplate |
 | L3 Output Destination | 返回HTML字符串 |
 | L4 Side Effects | 无副作用，含HTML转义 |
 | L6 Verification Case | 输入Markdown -> 检查预览区正确渲染HTML |
 
 ## AppearanceSettings.vue
 
 组件路径: src/components/settings/AppearanceSettings.vue
 组件职责: 外观配置（字体/主题/自动保存/快捷键展示）、数据导入导出、GitHub备份Token
 
 ### F01: toggleTheme()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于主题切换按钮@click |
 | L3 Output Destination | document.body.classList + electronAPI.storageWrite |
 | L4 Side Effects | 主行为：切换深色/浅色主题 |
 | L5 Communication Paradigm | DOM操作 + IPC存储 |
 | L6 Verification Case | 点切换 -> 检查body class变化 |
 
 ### F02: exportData() / importData()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数 |
 | L2 Input Source | electronAPI.storageList（导出）/ File API（导入） |
 | L3 Output Destination | Blob下载 / electronAPI.storageWrite |
 | L6 Verification Case | 点导出 -> 下载json；点导入 -> 数据恢复 |
 
 ### F03: saveGithubToken()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于保存按钮@click |
 | L3 Output Destination | electronAPI.storageWrite('github_token') |
 | L6 Verification Case | 输入Token后保存 -> 检查alert提示已保存 |
 
 ### F04: saveAll()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于保存按钮@click |
 | L3 Output Destination | settingsStore.saveSettings + alert |
 | L6 Verification Case | 点save appearance -> 检查设置持久化 |
 
 ## DiagLogPanel.vue
 
 组件路径: src/components/settings/DiagLogPanel.vue
 组件职责: 诊断日志查看器，支持日期筛选、刷新、导出、清空
 
 ### F01: loadLogs()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，onMounted调用 + 刷新按钮@click + 日期下拉@change |
 | L2 Input Source | electronAPI.diagRead(selectedDate) |
 | L3 Output Destination | logs ref更新 |
 | L5 Communication Paradigm | IPC调用 + 响应式ref更新 |
 | L6 Verification Case | 点刷新 -> 检查日志列表加载 |
 
 ### F02: exportLogs()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于导出按钮@click |
 | L3 Output Destination | electronAPI.diagExport() |
 | L6 Verification Case | 点导出 -> 检查IPC调用触发 |
 
 ### F03: clearLogs()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于清空按钮@click |
 | L3 Output Destination | electronAPI.diagClear() + logs清空 |
 | L6 Verification Case | 点清空 -> 检查日志列表为空 |
 
 ## 副作用风险表
 
 | 函数 | 风险等级 | 风险描述 |
 |---|---|---|
 | fetchModels | 中 | IPC网络请求可能失败 |
 | testConnection | 中 | IPC网络请求可能失败 |
 | toggleTheme | 低 | DOM操作 + IPC存储 |
 | exportData/importData | 中 | 文件系统操作 |
 
 ## 通信范式汇总
 
 | 范式 | 使用位置 |
 |---|---|
 | Vue emit | SettingsModal close/save |
 | store写操作 | saveAndExit, saveAgent, saveEdit, saveAll |
 | IPC调用 | fetchModels, testConnection, storageRead/Write, diagRead/Export/Clear |
 | DOM操作 | toggleTheme, exportConfig, exportData |
 
 ## L6 测试映射表
 
 | 测试ID | 函数 | 测试描述 |
 |---|---|---|
 | T-settings-01 | handleClose | 点关闭 -> 面板消失 |
 | T-settings-02 | tab切换 | 点击各tab -> 对应内容显示 |
 | T-settings-03 | setPurpose | 切换用途 -> 旧角色保留swap |
 | T-settings-04 | enterProviderEdit | 点卡片 -> 编辑视图预填 |
 | T-settings-05 | saveAndExit | 保存 -> 持久化 + 回列表 |
 | T-settings-06 | fetchModels | 获取模型 -> 列表出现 |
 | T-settings-07 | testConnection | 测试 -> 状态显示 |
 | T-settings-08 | addAgent | 添加 -> 新卡片出现 |
 | T-settings-09 | editSkill/saveEdit | 编辑技能 -> 保存 -> 更新 |
 | T-settings-10 | renderMarkdown | Markdown预览 -> 正确渲染 |
 | T-settings-11 | toggleTheme | 切换 -> body class变化 |
 | T-settings-12 | loadLogs | 刷新 -> 日志加载 |
