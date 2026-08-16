 # 仪表盘与设定合集行为契约
 
 涵盖: DashboardModal, ScPanel
 
 ## DashboardModal.vue
 
 组件路径: src/components/dashboard/DashboardModal.vue
 组件职责: 写作仪表盘弹窗，显示项目统计（项目数/总字数/总章节/总卷数）和各卷字数分布柱状图
 
 ### 依赖关系
 - props.visible: 控制弹窗显示
 - props.stats: 统计数据对象（projects, totalWords, totalChapters, totalVolumes, volumeStats[]）
 
 ### F01: emit close
 | Layer | Content |
 |---|---|
 | L1 Structure | defineEmits，绑定于关闭按钮@click和overlay@click.self |
 | L2 Input Source | 无 |
 | L3 Output Destination | emit('close') |
 | L4 Side Effects | 主行为：关闭仪表盘弹窗 |
 | L5 Communication Paradigm | Vue emit |
 | L6 Verification Case | 点击关闭按钮或遮罩 -> 检查emit('close') |
 | L7 Cross-component Dependency | App.vue监听close事件 |
 
 ### 统计卡片渲染
 | Layer | Content |
 |---|---|
 | L1 Structure | 模板v-for渲染4个dash-card |
 | L2 Input Source | props.stats（projects, totalWords, totalChapters, totalVolumes） |
 | L3 Output Destination | DOM渲染 |
 | L6 Verification Case | 打开仪表盘 -> 检查4个统计卡片显示正确数值 |
 
 ### 柱状图渲染
 | Layer | Content |
 |---|---|
 | L1 Structure | 模板v-for渲染dash-bar-row，条件v-if="stats.volumeStats.length > 0" |
 | L2 Input Source | props.stats.volumeStats[]（id, name, words, percentage） |
 | L3 Output Destination | DOM渲染（dash-bar-fill width = percentage%） |
 | L6 Verification Case | 有卷数据 -> 检查柱状图每行显示卷名、进度条、字数 |
 
 ## ScPanel.vue
 
 组件路径: src/components/settings-collection/ScPanel.vue
 组件职责: 设定合集面板，管理小说设定条目（角色/世界观/道具等），含分类管理、CRUD、章节绑定、AI生成
 
 ### 依赖关系
 - useProjectStore: 设定数据（settings数组, settingBindings, volumes, chapters）
 - useProviderStore: AI生成时获取API配置
 
 ### F01: categories (computed)
 | Layer | Content |
 |---|---|
 | L1 Structure | computed，从projectStore.settings提取唯一分类 |
 | L2 Input Source | projectStore.settings[].category |
 | L3 Output Destination | 模板渲染（分类侧栏） |
 | L6 Verification Case | 有3个不同分类的设定 -> 检查侧栏显示3个分类项 |
 
 ### F02: filteredEntries (computed)
 | Layer | Content |
 |---|---|
 | L1 Structure | computed，按selectedCategory过滤设定条目 |
 | L2 Input Source | projectStore.settings, selectedCategory ref |
 | L3 Output Destination | 模板渲染（条目列表） |
 | L6 Verification Case | 选择分类 -> 检查只显示该分类的条目 |
 
 ### F03: allChapters (computed)
 | Layer | Content |
 |---|---|
 | L1 Structure | computed，遍历所有卷的章节汇总 |
 | L2 Input Source | projectStore.volumes, projectStore.chapters |
 | L3 Output Destination | 绑定模态框的checkbox列表 |
 | L6 Verification Case | 有2卷各3章 -> 检查绑定列表显示6个章节选项 |
 
 ### F04: attrsText (computed get/set)
 | Layer | Content |
 |---|---|
 | L1 Structure | computed双向绑定，JSON序列化/反序列化 |
 | L2 Input Source | selectedEntry.attrs |
 | L3 Output Destination | textarea显示(get) / selectedEntry.attrs更新(set) |
 | L4 Side Effects | set时含try-catch JSON.parse，无效JSON被忽略 |
 | L6 Verification Case | 编辑attrs JSON -> 检查selectedEntry.attrs更新；输入无效JSON -> 不崩溃 |
 
 ### F05: addCategory()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于新建分类按钮@click |
 | L2 Input Source | prompt()用户输入 |
 | L3 Output Destination | projectStore.settings.push + saveProject + selectedCategory更新 |
 | L5 Communication Paradigm | store写操作 |
 | L6 Verification Case | 输入分类名 -> 检查分类列表新增且自动选中 |
 
 ### F06: addEntry()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于添加条目按钮@click |
 | L3 Output Destination | projectStore.settings.push + saveProject |
 | L6 Verification Case | 点添加条目 -> 检查设定列表新增空白条目 |
 
 ### F07: bindEntry()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于绑定章节按钮@click |
 | L2 Input Source | selectedEntry.name, projectStore.settingBindings |
 | L3 Output Destination | showBindModal = true, bindTargets更新 |
 | L6 Verification Case | 点绑定章节 -> 检查绑定模态框显示且已选章节预填 |
 
 ### F08: confirmBind()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于确认绑定按钮@click |
 | L3 Output Destination | projectStore.settingBindings更新 + saveProject + showBindModal关闭 |
 | L5 Communication Paradigm | store写操作 |
 | L6 Verification Case | 选择章节后确认 -> 检查settingBindings更新且持久化 |
 
 ### F09: saveEntry()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于保存按钮@click |
 | L3 Output Destination | projectStore.saveProject() |
 | L6 Verification Case | 编辑条目后保存 -> 检查持久化 |
 
 ### F10: deleteEntry()
 | Layer | Content |
 |---|---|
 | L1 Structure | 普通函数，绑定于删除按钮@click |
 | L3 Output Destination | projectStore.settings.splice + saveProject + selectedEntry清空 |
 | L6 Verification Case | 点删除 -> 检查条目从列表移除 |
 
 ### F11: aiGenerateEntry()
 | Layer | Content |
 |---|---|
 | L1 Structure | async函数，绑定于AI生成按钮@click |
 | L2 Input Source | providerStore.activeGenerateProvider, selectedCategory, projectStore.outlineText |
 | L3 Output Destination | fetch API -> JSON解析 -> projectStore.settings.push + saveProject |
 | L4 Side Effects | 主行为：调用AI生成设定条目；副作用：网络请求，可能失败；含baseUrl格式处理（/vN后缀检查） |
 | L5 Communication Paradigm | fetch API + store写操作 |
 | L6 Verification Case | 配置API后点AI生成 -> 检查新条目添加到列表 |
 | L7 Cross-component Dependency | 依赖providerStore获取API配置 |
 
 ## 副作用风险表
 
 | 函数 | 风险等级 | 风险描述 |
 |---|---|---|
 | aiGenerateEntry | 高 | 网络请求，可能失败/超时/429 |
 | attrsText set | 低 | JSON.parse可能失败（已catch） |
 | confirmBind | 低 | store写操作 |
 
 ## 通信范式汇总
 
 | 范式 | 使用位置 |
 |---|---|
 | Vue emit | DashboardModal(close), ScPanel(close) |
 | store写操作 | addCategory, addEntry, confirmBind, saveEntry, deleteEntry, aiGenerateEntry |
 | fetch API | aiGenerateEntry |
 | computed双向绑定 | attrsText |
 
 ## L6 测试映射表
 
 | 测试ID | 函数 | 测试描述 |
 |---|---|---|
 | T-dash-01 | emit close | 点关闭 -> emit('close') |
 | T-dash-02 | 统计卡片 | 打开 -> 4个卡片显示数值 |
 | T-dash-03 | 柱状图 | 有卷数据 -> 柱状图显示 |
 | T-sc-01 | categories | 有设定 -> 分类列表显示 |
 | T-sc-02 | filteredEntries | 选择分类 -> 只显示该分类条目 |
 | T-sc-03 | addCategory | 新建分类 -> 列表新增+自动选中 |
 | T-sc-04 | addEntry | 添加条目 -> 列表新增 |
 | T-sc-05 | bindEntry/confirmBind | 绑定章节 -> settingBindings更新 |
 | T-sc-06 | deleteEntry | 删除 -> 条目移除 |
 | T-sc-07 | saveEntry | 保存 -> 持久化 |
 | T-sc-08 | attrsText | 编辑JSON -> attrs更新；无效JSON -> 不崩溃 |
 | T-sc-09 | aiGenerateEntry | AI生成 -> 新条目添加 |
 | T-sc-10 | allChapters | 绑定列表显示所有章节 |
