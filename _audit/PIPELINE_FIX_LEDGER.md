# 生成流水线（PipelinePanel.vue）修复对账表单

日期：2026-08-16
目标：修复生成流水线功能闭环，按行为等价原则先出清单再逐项修复

| # | 问题 | 位置 | 旧架构行为 | 新架构预期 | 修复方式 | 状态 |
|---|------|------|-----------|-----------|---------|------|
| 1 | addStepSkill 结构损坏，arr.push(sid) 悬空在 removeStepSkill 外 | 原行817-843 | 选择Skill后添加到该步骤的技能列表，渲染为chip，可移除 | 选择Skill后立即添加，列表渲染chip，可移除 | 重写完整 addStepSkill/removeStepSkill | ✅ 已修复 + CDP验证 |
| 2 | confirmStep(0) 不锁定大纲 | 原行511-528 | 确认大纲后大纲锁定，防止编辑 | 确认大纲后调用 projectStore.lockOutline() + 触发 outline-locked 事件 | confirmStep(0) 中联动 lockOutline() | ✅ 已修复 + CDP验证 |
| 3 | lockOutline 直接写 pipelineStore.currentStep = 1 | 原行547-555 | 锁定大纲后进入设定步骤 | 使用 pipelineStore.setStep(1) 保持状态单一来源 | lockOutline 改用 setStep(1) | ✅ 已修复 + CDP验证 |
| 4 | insertBody 使用未定义 generatedBody | 原行848-853 | 生成正文后有插入编辑器入口 | 用已存在的 bodyResult 替代 generatedBody，插入text到编辑器 | 重写 insertBody 使用 bodyResult + CustomEvent | ✅ 已修复 |
| 5 | loadOutline 调用不存在的 projectStore.loadOutline() | 原行668-670 | 旧架构有加载大纲API | 新架构 projectStore 无此方法，应合并到 saveOutline | 改为 projectStore.setOutline + saveProject() | ✅ 已修复 |
| 6 | onMounted 中 steps.value[0] 重复设置 completed | 原行801-808 | 从持久化状态恢复步骤完成度 | 只设置一次，currentStep 用 setStep | 去重并合并分支，setStep(1) 切换 | ✅ 已修复 |
| 7 | steps 局部 ref 不持久化 | 原行291-297 | 步骤完成度从项目状态恢复 | steps.completed 从 projectStore 恢复 | onMounted 恢复逻辑已确认 + CDP 验证重开后 completed 正确 | ✅ 已验证完整 |
| 8 | getStepAgentId 函数缺失 | 原行404引用 | 每个步骤绑定Agent | 从 stepAgents 或全局选中的 agent 获取 | 已存在（原行373），无需修复 | ✅ 已存在 |
| 9 | clearChapterGenerationFlags 函数缺失 | 原行478引用 | 确认前置步骤后清空下游章节生成标志 | 遍历 chapters 清空 bodyGenerated/confirmed | 已存在（原行447），无需修复 | ✅ 已存在 |
| 10 | syncChapterManager 函数缺失 | 原行767引用 | 正文生成后同步旧架构的 ChapterManager | 调用 window.ChapterManager 兼容 | 已存在（原行459），无需修复 | ✅ 已存在 |
| 11 | 大纲锁定后 ensureVolumesFromOutline 未显式调用 | lockOutline | 锁定大纲后自动初始化卷结构 | projectStore.lockOutline() 内部已调用 | 已确认，无需显式调用 | ✅ 已存在 + CDP验证卷生成 |
| 12 | bodyVolumeChapters computed 检查 | script 中 | 正文步骤可选择卷/章 | 从 projectStore.chapters 计算 | 已存在（原行321），无需修复 | ✅ 已存在 |
| 13 | storageWrite 传 Vue ref Proxy 导致 IPC 序列化失败（An object could not be cloned） | PipelinePanel.vue 原行329-332 | 步骤Skill/Agent配置持久化到 Electron 存储 | storageWrite 前用 JSON.parse(JSON.stringify()) 深拷贝 | saveStepConfig 加 JSON 深拷贝 | ✅ 已修复 + CDP验证无报错 |

## CDP 端到端验证结果（2026-08-16）

1. 生成流水线面板打开：✅ 5层步骤全部渲染（大纲/设定/卷纲/章节/正文）
2. 填入大纲（137字符）：✅ textarea 可编辑
3. 锁定大纲按钮：✅ 可用 → 点击后 outlineLocked=true、大纲readOnly、自动生成第一卷、跳到设定步骤
4. Skill 添加/移除（Step2）：✅ 添加黄瓜chip出现，移除消失，无 IPC 克隆错误
5. 确认设定：✅ settingsGenerated=true → 跳到卷纲
6. 确认卷纲（已有自动生成卷）：✅ volumesConfirmed=true → 跳到章节
7. 确认章节：✅ chaptersConfirmed=true → 跳到正文
8. Step2 新增设定按钮：✅ 创建设定项后确认按钮可用
9. Step4 章节面板：✅ 生成按钮可用、章节卡片显示
10. Step5 正文面板：✅ 卷/章选择器可见、AI生成按钮可用（需API key才能真生成）
11. onMounted 恢复：✅ 面板重开后大纲锁定状态、completed 正确恢复