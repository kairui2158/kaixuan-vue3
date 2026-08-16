# project_store.ts 行为契约

源文件: src/stores/project.ts (4498 bytes)
Store ID: project (Pinia defineStore)
函数总数: 20 (15 methods + 3 computed + state refs)

## 状态字段

| 字段 | 类型 | 初始值 | 用途 |
|------|------|--------|------|
| currentProjectId | ref<string|null> | null | 当前项目ID |
| projectName | ref<string> | '' | 项目名称 |
| outlineText | ref<string> | '' | 大纲文本 |
| outlineLocked | ref<boolean> | false | 大纲是否锁定 |
| settingsGenerated | ref<boolean> | false | 设定是否已生成 |
| settings | ref<any[]> | [] | 设定列表 |
| volumes | ref<any[]> | [] | 卷纲列表 |
| chapters | ref<Record<string,any[]>> | {} | 按卷ID分组的章节 |
| projectList | ref<any[]> | [] | 项目列表 |
| settingBindings | ref<Record<string,string[]>> | {} | 设定绑定关系 |
| memories | ref<{categories:string[],items:any[]}> | {categories:['情节','人物','世界观','伏笔'],items:[]} | 记忆库 |

## computed

### F01: hasOutline (computed)
| Layer | Content |
|---|---|
| L1 Structure | computed, 返回 outlineText.value.trim().length > 0 |
| L2 Input Source | 读 outlineText ref |
| L3 Output Destination | 返回boolean, 被OutlineWorkspace锁定按钮disabled和PipelinePanel下一步按钮disabled使用 |
| L4 Side Effects | 纯计算无副作用, 风险: 低 |
| L5 Communication Paradigm | store computed, 组件通过projectStore.hasOutline读取 |
| L6 Verification Case | test_pipeline_v2.js T1: 输入大纲前检查hasOutline===false, 输入后===true |
| L7 Cross-component Dependency | OutlineWorkspace.vue锁定按钮, PipelinePanel.vue下一步按钮 |

### F02: volumeCount (computed)
| Layer | Content |
|---|---|
| L1 Structure | computed, 返回 volumes.value.length |
| L2 Input Source | 读 volumes ref |
| L3 Output Destination | 返回number, 被PipelinePanel卷数显示使用 |
| L4 Side Effects | 纯计算无副作用, 风险: 低 |
| L5 Communication Paradigm | store computed |
| L6 Verification Case | test_pipeline_v2.js T6-vol-gen: 生成卷纲后检查volumeCount===预期数量 |
| L7 Cross-component Dependency | PipelinePanel.vue卷数input显示 |

### F03: totalChapters (computed)
| Layer | Content |
|---|---|
| L1 Structure | computed, 遍历chapters.value的所有值累加length |
| L2 Input Source | 读 chapters ref |
| L3 Output Destination | 返回number, 被章节树显示使用 |
| L4 Side Effects | 纯计算无副作用, 风险: 低 |
| L5 Communication Paradigm | store computed |
| L6 Verification Case | test_p9_chapter_tree.js: 生成章节后检查totalChapters===预期章节数 |
| L7 Cross-component Dependency | ChapterTree.vue显示 |

## 方法

### F04: loadProjectList()
| Layer | Content |
|---|---|
| L1 Structure | function, 调用electronAPI.storageList获取所有key, 过滤project_前缀, 逐个读取项目数据映射为{id,name} |
| L2 Input Source | window.electronAPI.storageList() + storageRead(key) |
| L3 Output Destination | 写 projectList ref |
| L4 Side Effects | 读取Electron存储, 风险: 低 |
| L5 Communication Paradigm | store method, ChapterTree openProjectList调用 |
| L6 Verification Case | test_p9_chapter_tree.js: 点击项目按钮, 检查projectList.length > 0 |
| L7 Cross-component Dependency | ChapterTree.vue openProjectList |

### F05: loadProject(id: string)
| Layer | Content |
|---|---|
| L1 Structure | function, 读取storageKey('project_'+id), 兼容旧key格式project_-id, 将数据映射到各ref |
| L2 Input Source | 参数id: string, electronAPI.storageRead |
| L3 Output Destination | 写 currentProjectId, projectName, outlineText, outlineLocked, settingsGenerated, settings, volumes, chapters, settingBindings, memories |
| L4 Side Effects | 全状态替换, 风险: 中(数据不完整会导致后续生成异常) |
| L5 Communication Paradigm | store method, ChapterTree selectProject调用 |
| L6 Verification Case | test_p9_chapter_tree.js: 选择项目后检查projectName正确, volumes/chapters加载 |
| L7 Cross-component Dependency | ChapterTree.vue selectProject |

### F06: saveProject()
| Layer | Content |
|---|---|
| L1 Structure | function, 组装所有状态为data对象, 调用electronAPI.storageWrite持久化. 若currentProjectId为空则设为'default' |
| L2 Input Source | 读所有ref |
| L3 Output Destination | window.electronAPI.storageWrite |
| L4 Side Effects | 持久化到Electron存储, 风险: 中(数据丢失风险) |
| L5 Communication Paradigm | store method, 被所有修改状态的函数内部调用 |
| L6 Verification Case | test_pipeline_v2.js: 修改大纲后刷新页面, 检查数据持久化 |
| L7 Cross-component Dependency | 几乎所有组件的修改操作都会间接触发saveProject |

### F07: setOutline(text: string)
| Layer | Content |
|---|---|
| L1 Structure | function, 设置outlineText=text, 调用saveProject() |
| L2 Input Source | 参数text: string |
| L3 Output Destination | 写 outlineText ref + 持久化 |
| L4 Side Effects | 更新大纲文本+持久化, 风险: 低 |
| L5 Communication Paradigm | store method |
| L6 Verification Case | test_pipeline_v2.js T1: 保存大纲后检查outlineText正确, 页面刷新后仍在 |
| L7 Cross-component Dependency | OutlineWorkspace.vue saveOutline, PipelinePanel.vue大纲保存按钮 |

### F08: lockOutline()
| Layer | Content |
|---|---|
| L1 Structure | function, 设置outlineLocked=true, 调用saveProject(). 不创建卷(教训#83) |
| L2 Input Source | 无参数 |
| L3 Output Destination | 写 outlineLocked ref + 持久化 |
| L4 Side Effects | 锁定大纲禁止编辑, 风险: 低. 教训#83: 不自动创建卷 |
| L5 Communication Paradigm | store method |
| L6 Verification Case | test_pipeline_v2.js T4-no-auto-vol: lockOutline前后检查volumes.length不变 |
| L7 Cross-component Dependency | OutlineWorkspace.vue锁定按钮, PipelinePanel.vue锁定按钮 |

### F09: setSettings(newSettings: any[])
| Layer | Content |
|---|---|
| L1 Structure | function, 设置settings=newSettings, settingsGenerated=true, saveProject() |
| L2 Input Source | 参数newSettings: any[] |
| L3 Output Destination | 写 settings ref + settingsGenerated ref + 持久化 |
| L4 Side Effects | 更新设定列表, 风险: 低 |
| L5 Communication Paradigm | store method |
| L6 Verification Case | test_pipeline_v2.js T3: AI生成设定后检查settings.length > 0, settingsGenerated===true |
| L7 Cross-component Dependency | PipelinePanel.vue genSettings |

### F10: setVolumes(newVolumes: any[])
| Layer | Content |
|---|---|
| L1 Structure | function, 设置volumes=newVolumes, saveProject() |
| L2 Input Source | 参数newVolumes: any[] |
| L3 Output Destination | 写 volumes ref + 持久化 |
| L4 Side Effects | 更新卷纲列表, 风险: 低 |
| L5 Communication Paradigm | store method |
| L6 Verification Case | test_pipeline_v2.js T6-vol-gen: AI生成卷纲后检查volumes.length正确 |
| L7 Cross-component Dependency | PipelinePanel.vue genVolumes |

### F11: setChapters(volumeId: string, newChapters: any[])
| Layer | Content |
|---|---|
| L1 Structure | function, 设置chapters[volumeId]=newChapters, saveProject() |
| L2 Input Source | 参数volumeId: string, newChapters: any[] |
| L3 Output Destination | 写 chapters ref的对应key + 持久化 |
| L4 Side Effects | 更新章节列表, 风险: 低 |
| L5 Communication Paradigm | store method |
| L6 Verification Case | test_pipeline_v2.js T7: 生成章节后检查chapters[volId].length正确 |
| L7 Cross-component Dependency | PipelinePanel.vue genChapters, ChapterTree.vue addChapter/deleteChapter |

### F12: updateVolume(index: number, data: Partial<any>)
| Layer | Content |
|---|---|
| L1 Structure | function, 若volumes[index]存在则合并data, saveProject() |
| L2 Input Source | 参数index: number, data: Partial<any> |
| L3 Output Destination | 写 volumes[index] + 持久化 |
| L4 Side Effects | 部分更新卷纲, 风险: 低 |
| L5 Communication Paradigm | store method |
| L6 Verification Case | test_p9_chapter_tree.js: 编辑卷后检查数据更新 |
| L7 Cross-component Dependency | ChapterTree.vue saveVolume |

### F13: addMemoryCategory(name: string)
| Layer | Content |
|---|---|
| L1 Structure | function, push到memories.categories, saveProject() |
| L2 Input Source | 参数name: string |
| L3 Output Destination | 写 memories.value.categories + 持久化 |
| L4 Side Effects | 添加记忆分类, 风险: 低 |
| L5 Communication Paradigm | store method |
| L6 Verification Case | 暂无直接测试, 间接通过P4设置面板测试覆盖 |
| L7 Cross-component Dependency | SettingsModal记忆分类管理 |

### F14: addMemory(item: any)
| Layer | Content |
|---|---|
| L1 Structure | function, push到memories.items附带created时间戳, saveProject() |
| L2 Input Source | 参数item: any |
| L3 Output Destination | 写 memories.value.items + 持久化 |
| L4 Side Effects | 添加记忆条目, 风险: 低 |
| L5 Communication Paradigm | store method |
| L6 Verification Case | 暂无直接测试, 间接通过P4设置面板测试覆盖 |
| L7 Cross-component Dependency | SettingsModal记忆管理 |

### F15: updateMemory(index: number, item: any)
| Layer | Content |
|---|---|
| L1 Structure | function, 若items[index]存在则替换并保留created时间戳, saveProject() |
| L2 Input Source | 参数index: number, item: any |
| L3 Output Destination | 写 memories.value.items[index] + 持久化 |
| L4 Side Effects | 更新记忆条目, 风险: 低 |
| L5 Communication Paradigm | store method |
| L6 Verification Case | 暂无直接测试 |
| L7 Cross-component Dependency | SettingsModal记忆管理 |

### F16: deleteMemory(index: number)
| Layer | Content |
|---|---|
| L1 Structure | function, splice删除items[index], saveProject() |
| L2 Input Source | 参数index: number |
| L3 Output Destination | 写 memories.value.items + 持久化 |
| L4 Side Effects | 删除记忆条目, 风险: 中(不可逆) |
| L5 Communication Paradigm | store method |
| L6 Verification Case | 暂无直接测试 |
| L7 Cross-component Dependency | SettingsModal记忆管理 |

## 副作用风险表

| 函数 | 主行为 | 副作用 | 风险等级 |
|------|--------|--------|----------|
| loadProjectList | 读取项目列表 | Electron存储读取 | 低 |
| loadProject | 加载项目 | 全状态替换 | 中 |
| saveProject | 持久化项目 | Electron存储写入 | 中 |
| setOutline | 设置大纲 | 持久化 | 低 |
| lockOutline | 锁定大纲 | 持久化+禁止编辑 | 低 |
| setSettings | 设置设定列表 | 持久化 | 低 |
| setVolumes | 设置卷纲列表 | 持久化 | 低 |
| setChapters | 设置章节列表 | 持久化 | 低 |
| updateVolume | 更新卷纲 | 持久化 | 低 |
| addMemoryCategory | 添加分类 | 持久化 | 低 |
| addMemory | 添加记忆 | 持久化 | 低 |
| updateMemory | 更新记忆 | 持久化 | 低 |
| deleteMemory | 删除记忆 | 不可逆删除+持久化 | 中 |

## 通信范式总结

| 范式 | 使用位置 | 说明 |
|------|----------|------|
| store (Pinia) | 全部函数 | 组件通过projectStore.xxx()调用 |
| computed | hasOutline, volumeCount, totalChapters | 派生状态自动更新 |
| Electron IPC | loadProjectList, loadProject, saveProject | 通过window.electronAPI.storageXXX读写持久化存储 |

## L6验证用例映射

| 测试脚本 | 覆盖函数 | PASS/FAIL |
|-----------|----------|-----------|
| test_pipeline_v2.js (37 tests) | F01-F11 | 37/37 PASS |
| test_p9_chapter_tree.js (48 tests) | F04,F05,F06,F11,F12 | 48/48 PASS |
| test_p5_settings.js (64 tests) | F13-F16 (间接覆盖) | 64/64 PASS |

验证证据: D:/codex/novel-workshop-vue3/_audit/pipeline_v2_report.json, D:/codex/novel-workshop-vue3/_audit/p9_chapter_tree_report.json
