# OutlineWorkspace.vue 行为契约

源文件: src/components/common/OutlineWorkspace.vue (13019 bytes)
组件类型: 模态覆盖层 (overlay modal)
函数总数: 12 (10 methods + 2 computed/ref)

## 组件职责
大纲工作台模态框。左侧大纲编辑器(textarea双向绑定), 右侧AI共创对话面板, 侧栏Skill绑定管理, 底部导入/保存/锁定操作。

## 状态字段

| 字段 | 类型 | 用途 |
|------|------|------|
| messages | ref<any[]> | AI对话消息列表 |
| inputText | ref<string> | 对话输入框文本 |
| msgContainer | ref<HTMLElement|null> | 消息容器DOM引用 |
| fileInput | ref<HTMLElement|null> | 文件输入DOM引用 |
| saveFeedback | ref<string> | 保存反馈文本 |
| skillSuggestionsList | ref<any[]> | Skill建议列表 |

## 函数契约

### F01: boundSkills (computed get/set)
| Layer | Content |
|---|---|
| L1 Structure | computed, get返回skillStore.pipelineSkills, set写skillStore.pipelineSkills并saveSkills() |
| L2 Input Source | 读/写 skillStore.pipelineSkills |
| L3 Output Destination | get返回string[], set写skillStore |
| L4 Side Effects | set时触发skillStore持久化, 风险: 低 |
| L5 Communication Paradigm | store双向绑定, computed作为v-model目标 |
| L6 Verification Case | test_pipeline_v2.js T4-bound-skills: 绑定5个skill后检查pipelineSkills长度===5 |
| L7 Cross-component Dependency | PipelinePanel.vue getStepSkillTemplate读取pipelineSkills |

### F02: generateOutlineSkills()
| Layer | Content |
|---|---|
| L1 Structure | function, 从skillStore.skills过滤category==='outline'或'大纲'的skill, 映射为{id,name}列表 |
| L2 Input Source | 读 skillStore.skills |
| L3 Output Destination | 写 skillSuggestionsList ref |
| L4 Side Effects | 无持久化, 仅更新建议列表UI, 风险: 低 |
| L5 Communication Paradigm | 组件内部method, @click触发 |
| L6 Verification Case | test_pipeline_v2.js: 点击自动生成大纲Skill按钮, 检查skillSuggestionsList显示 |
| L7 Cross-component Dependency | 无外部依赖 |

### F03: bindSkill(skill: any)
| Layer | Content |
|---|---|
| L1 Structure | function, 若skill.id存在且不在boundSkills中, push到boundSkills |
| L2 Input Source | 参数skill: {id, name}, 读boundSkills |
| L3 Output Destination | 写 boundSkills (触发skillStore持久化) |
| L4 Side Effects | 添加skill绑定+持久化, 风险: 低 |
| L5 Communication Paradigm | 组件method, @click触发 |
| L6 Verification Case | test_pipeline_v2.js T4-bound-skills: 点击skill建议项, 检查bound列表增加 |
| L7 Cross-component Dependency | PipelinePanel.vue getStepSkillTemplate读取绑定结果 |

### F04: unbindSkill(index: number)
| Layer | Content |
|---|---|
| L1 Structure | function, 复制boundSkills数组, splice删除index, 赋值回boundSkills |
| L2 Input Source | 参数index: number, 读boundSkills |
| L3 Output Destination | 写 boundSkills (触发skillStore持久化) |
| L4 Side Effects | 移除skill绑定+持久化, 风险: 低 |
| L5 Communication Paradigm | 组件method, @click触发 |
| L6 Verification Case | test_pipeline_v2.js: 点击已绑定skill的x按钮, 检查bound列表减少 |
| L7 Cross-component Dependency | 同F03 |

### F05: getSkillName(id: string): string
| Layer | Content |
|---|---|
| L1 Structure | function, 在skillStore.skills中查找id匹配的skill, 返回name或id |
| L2 Input Source | 参数id: string, 读skillStore.skills |
| L3 Output Destination | 返回string, 用于已绑定skill列表显示 |
| L4 Side Effects | 纯查找无副作用, 风险: 低 |
| L5 Communication Paradigm | 组件method, 模板内调用 |
| L6 Verification Case | test_pipeline_v2.js: 绑定skill后检查显示名称正确 |
| L7 Cross-component Dependency | 无 |

### F06: triggerImport()
| Layer | Content |
|---|---|
| L1 Structure | function, 调用fileInput.value?.click()触发文件选择对话框 |
| L2 Input Source | 读fileInput ref |
| L3 Output Destination | DOM操作: 触发input[type=file]点击 |
| L4 Side Effects | 打开文件选择器, 风险: 低 |
| L5 Communication Paradigm | 组件method, @click触发 |
| L6 Verification Case | test_pipeline_v2.js: 点击导入文件按钮, 检查文件选择器触发 |
| L7 Cross-component Dependency | handleImport接收文件 |

### F07: handleImport(e: Event)
| Layer | Content |
|---|---|
| L1 Structure | async function, 读取File对象, 调用importFile()解析, 设置outlineText+setOutline, 异常时alert |
| L2 Input Source | 参数e: Event, target.files[0], importFile服务 |
| L3 Output Destination | 写 projectStore.outlineText + projectStore.setOutline() |
| L4 Side Effects | 导入文件内容到大纲+持久化, 风险: 中(文件解析可能失败) |
| L5 Communication Paradigm | 组件method, @change事件触发 |
| L6 Verification Case | test_pipeline_v2.js: 导入.txt文件后检查outlineText包含文件内容 |
| L7 Cross-component Dependency | importFile服务 (services/file-import.ts) |

### F08: renderMarkdown(text: string): string
| Layer | Content |
|---|---|
| L1 Structure | function, 调用marked.parse(text, {breaks:true}), 返回HTML字符串 |
| L2 Input Source | 参数text: string |
| L3 Output Destination | 返回string, v-html渲染到ow-msg-bubble |
| L4 Side Effects | 无持久化, v-html存在XSS风险(教训#37需sanitize), 风险: 中 |
| L5 Communication Paradigm | 组件method, 模板内调用 |
| L6 Verification Case | test_pipeline_v2.js: 发送消息后检查AI回复以HTML渲染显示 |
| L7 Cross-component Dependency | marked库 |

### F09: saveOutline()
| Layer | Content |
|---|---|
| L1 Structure | function, 调用projectStore.setOutline(outlineText), 显示saveFeedback='[OK] 已保存', 2秒后清除 |
| L2 Input Source | 读 projectStore.outlineText |
| L3 Output Destination | 调用projectStore.setOutline + 写saveFeedback |
| L4 Side Effects | 持久化大纲+显示反馈, 风险: 低 |
| L5 Communication Paradigm | 组件method, @click触发 |
| L6 Verification Case | test_pipeline_v2.js T1: 点击保存大纲, 检查saveFeedback显示, 刷新后数据仍在 |
| L7 Cross-component Dependency | projectStore.setOutline |

### F10: exportMd()
| Layer | Content |
|---|---|
| L1 Structure | function, 创建Blob(text/markdown), 生成下载链接, 文件名=projectName+'.md' |
| L2 Input Source | 读 projectStore.outlineText, projectStore.projectName |
| L3 Output Destination | DOM操作: 触发a.click()下载文件 |
| L4 Side Effects | 下载文件, 风险: 低 |
| L5 Communication Paradigm | 组件method, @click触发 |
| L6 Verification Case | test_pipeline_v2.js: 点击.md按钮, 检查下载触发 |
| L7 Cross-component Dependency | 无 |

### F11: exportTxt()
| Layer | Content |
|---|---|
| L1 Structure | function, 创建Blob(text/plain), 生成下载链接, 文件名=projectName+'.txt' |
| L2 Input Source | 读 projectStore.outlineText, projectStore.projectName |
| L3 Output Destination | DOM操作: 触发下载 |
| L4 Side Effects | 下载文件, 风险: 低 |
| L5 Communication Paradigm | 组件method, @click触发 |
| L6 Verification Case | test_pipeline_v2.js: 点击.txt按钮, 检查下载触发 |
| L7 Cross-component Dependency | 无 |

### F12: sendMessage()
| Layer | Content |
|---|---|
| L1 Structure | async function, push用户消息, 调用providerStore.activeGenerateProvider发fetch到chat/completions, pushAI回复. 429时8次递增重试(30s-240s) |
| L2 Input Source | 读inputText, projectStore.outlineText, providerStore.activeGenerateProvider |
| L3 Output Destination | 写 messages ref + 滚动msgContainer到底部 |
| L4 Side Effects | 网络请求API, 风险: 中(网络失败/429限流) |
| L5 Communication Paradigm | 组件method, @click/@keydown.enter触发 |
| L6 Verification Case | test_pipeline_v2.js: 发送消息, 检查messages增加user+assistant条目 |
| L7 Cross-component Dependency | providerStore.activeGenerateProvider, fetch API |

## 副作用风险表

| 函数 | 主行为 | 副作用 | 风险等级 |
|------|--------|--------|----------|
| bindSkill | 绑定skill | skillStore持久化 | 低 |
| unbindSkill | 解绑skill | skillStore持久化 | 低 |
| triggerImport | 触发文件选择 | 打开文件选择器 | 低 |
| handleImport | 导入文件 | 持久化大纲+可能解析失败 | 中 |
| renderMarkdown | 渲染markdown | v-html XSS风险 | 中 |
| saveOutline | 保存大纲 | 持久化 | 低 |
| exportMd | 导出md | 下载文件 | 低 |
| exportTxt | 导出txt | 下载文件 | 低 |
| sendMessage | AI对话 | 网络请求+429风险 | 中 |

## 通信范式总结

| 范式 | 使用位置 | 说明 |
|------|----------|------|
| store (Pinia) | boundSkills, saveOutline, sendMessage | 读写projectStore和skillStore |
| emit | $emit('close') | 子->父关闭模态框 |
| DOM操作 | triggerImport, exportMd, exportTxt, msgContainer.scrollTop | 直接操作DOM |
| fetch | sendMessage | 直接调用chat/completions API |

## L6验证用例映射

| 测试脚本 | 覆盖函数 | PASS/FAIL |
|-----------|----------|-----------|
| test_pipeline_v2.js (37 tests) | F01-F12全部 | 37/37 PASS |

验证证据: D:/codex/novel-workshop-vue3/_audit/pipeline_v2_report.json
