# PipelinePanel.vue 行为契约

源文件: src/components/pipeline/PipelinePanel.vue (41123 bytes)
组件类型: 模态覆盖层 (overlay modal) - 生成流水线主面板
函数总数: 27 (20 methods + 3 computed + 4 ref初始化)

## 组件职责
五步生成流水线: 大纲(0) -> 设定(1) -> 卷纲(2) -> 章节(3) -> 正文(4)。每步支持Agent/Skill配置, AI工具栏, 批量生成+断点续接。

## 状态字段

| 字段 | 类型 | 初始值 | 用途 |
|------|------|--------|------|
| volumeWords | ref<number> | 500000 | 每卷字数 |
| chapterWords | ref<number> | 3500 | 每章字数 |
| selectedVolumeIndex | ref<number> | 0 | 章节层选中的卷索引 |
| bodyVolumeIndex | ref<number> | 0 | 正文层选中的卷索引 |
| bodyChapterIndex | ref<number> | 0 | 正文层选中的章索引 |
| bodyResult | ref<string> | '' | 正文生成结果 |
| stepAgents | ref<Record<number,string>> | {1:'',2:'',3:'',4:''} | 每步Agent配置 |
| stepSkills | ref<Record<number,string[]>> | {1:['',...5],...} | 每步5个Skill槽 |
| toolResult | ref<string> | '' | AI工具结果文本 |

## 函数契约

### F01: getStepSkillTemplate(step: number): string
| Layer | Content |
|---|---|
| L1 Structure | function, 优先从stepSkills[step]查找第一个非空skill的template, 回退到skillStore.orderedPipelineSkills[step-1].template, 再回退空字符串 |
| L2 Input Source | 参数step: number, 读stepSkills ref + skillStore.skills + skillStore.orderedPipelineSkills |
| L3 Output Destination | 返回string, 作为callApi的systemPrompt |
| L4 Side Effects | 纯查找无副作用, 风险: 低 |
| L5 Communication Paradigm | 组件内部method |
| L6 Verification Case | test_pipeline_v2.js T7-skill-order: 检查5个skill按category顺序正确返回template |
| L7 Cross-component Dependency | skillStore.orderedPipelineSkills, skillStore.skills |

### F02: estimatedChapters (computed)
| Layer | Content |
|---|---|
| L1 Structure | computed, 取volumes[selectedVolumeIndex]的suggestedWords或volumeWords, 除以chapterWords, 向上取整 |
| L2 Input Source | 读projectStore.volumes, selectedVolumeIndex, volumeWords, chapterWords |
| L3 Output Destination | 返回number, 显示在pl-ch-est-count |
| L4 Side Effects | 纯计算, 风险: 低 |
| L5 Communication Paradigm | computed, 模板渲染 |
| L6 Verification Case | test_pipeline_v2.js: 检查estimatedChapters === Math.ceil(suggestedWords / chapterWords) |
| L7 Cross-component Dependency | 无 |

### F03: currentVolumeChapters (computed)
| Layer | Content |
|---|---|
| L1 Structure | computed, 取volumes[selectedVolumeIndex]的id或name作为volId, 返回chapters[volId]或[] |
| L2 Input Source | 读projectStore.volumes, projectStore.chapters, selectedVolumeIndex |
| L3 Output Destination | 返回any[], 渲染章节卡片列表 |
| L4 Side Effects | 纯计算, 风险: 低 |
| L5 Communication Paradigm | computed, 模板渲染 |
| L6 Verification Case | test_pipeline_v2.js T7: 生成章节后检查currentVolumeChapters.length正确 |
| L7 Cross-component Dependency | projectStore.chapters |

### F04: bodyVolumeChapters (computed)
| Layer | Content |
|---|---|
| L1 Structure | computed, 取volumes[bodyVolumeIndex]的id或name作为volId, 返回chapters[volId]或[] |
| L2 Input Source | 读projectStore.volumes, projectStore.chapters, bodyVolumeIndex |
| L3 Output Destination | 返回any[], 渲染正文层章节下拉选项 |
| L4 Side Effects | 纯计算, 风险: 低 |
| L5 Communication Paradigm | computed, 模板渲染 |
| L6 Verification Case | test_pipeline_v2.js: 正文层章节下拉检查选项正确 |
| L7 Cross-component Dependency | projectStore.chapters |

### F05: saveStepConfig()
| Layer | Content |
|---|---|
| L1 Structure | function, 调用storageWrite持久化stepAgents和stepSkills |
| L2 Input Source | 读stepAgents, stepSkills |
| L3 Output Destination | window.electronAPI.storageWrite('pipeline_step_config') |
| L4 Side Effects | 持久化步骤配置, 风险: 低 |
| L5 Communication Paradigm | 组件method, @change触发 |
| L6 Verification Case | test_pipeline_v2.js: 配置Agent+Skill后刷新, 检查配置恢复 |
| L7 Cross-component Dependency | electronAPI.storageRead/Write |

### F06: nextStep()
| Layer | Content |
|---|---|
| L1 Structure | function, 若currentStep < 4则setStep(currentStep+1) |
| L2 Input Source | 读pipelineStore.currentStep |
| L3 Output Destination | 调用pipelineStore.setStep |
| L4 Side Effects | 步骤前进, 风险: 低 |
| L5 Communication Paradigm | 组件method |
| L6 Verification Case | test_pipeline_v2.js: 点击下一步检查currentStep递增 |
| L7 Cross-component Dependency | pipelineStore.setStep |

### F07: callApi(systemPrompt, userText): Promise<string>
| Layer | Content |
|---|---|
| L1 Structure | async function, 从providerStore获取activeGenerateProvider, 构建chat/completions URL, 8次429重试(30s-240s递增), 返回choices[0].message.content |
| L2 Input Source | 参数systemPrompt, userText, providerStore.activeGenerateProvider |
| L3 Output Destination | 返回Promise<string>, 被所有生成函数使用 |
| L4 Side Effects | 网络请求, 429时更新pipelineStore进度显示重试信息, 风险: 高(网络失败/限流) |
| L5 Communication Paradigm | 组件method, 被genSettings/genVolumes/genChapters/genBody调用 |
| L6 Verification Case | test_pipeline_v2.js T3: mock API返回, 检查callApi返回正确内容 |
| L7 Cross-component Dependency | providerStore.activeGenerateProvider |

### F08: extractJsonArray(text: string): any[]
| Layer | Content |
|---|---|
| L1 Structure | function, 尝试: 1.提取代码块json 2.JSON.parse全文 3.提取第一个到最后一个的范围parse. 全部失败返回[] |
| L2 Input Source | 参数text: string (API返回文本) |
| L3 Output Destination | 返回any[], 被生成函数用于解析JSON结果 |
| L4 Side Effects | 纯解析无副作用, 风险: 低 |
| L5 Communication Paradigm | 组件method |
| L6 Verification Case | test_pipeline_v2.js: 测试纯JSON/带代码块/带前缀文本三种格式, 检查解析正确 |
| L7 Cross-component Dependency | 无 |

### F09: validateSettings(items): {valid, errors}
| Layer | Content |
|---|---|
| L1 Structure | function, 遍历items检查每项含name(非空string), category(非空string), attrs(object) |
| L2 Input Source | 参数items: any[] |
| L3 Output Destination | 返回{valid:boolean, errors:string[]} |
| L4 Side Effects | 纯校验, 风险: 低 |
| L5 Communication Paradigm | 组件method |
| L6 Verification Case | test_pipeline_v2.js: 检查缺name/缺category/缺attrs时返回valid===false |
| L7 Cross-component Dependency | genSettings调用 |

### F10: validateVolumes(items): {valid, errors}
| Layer | Content |
|---|---|
| L1 Structure | function, 检查name(非空), outline(非空且>=500字), summary(非空), suggestedWords(非null) |
| L2 Input Source | 参数items: any[] |
| L3 Output Destination | 返回{valid, errors} |
| L4 Side Effects | 纯校验, 风险: 低 |
| L5 Communication Paradigm | 组件method |
| L6 Verification Case | test_pipeline_v2.js: 检查outline过短时返回valid===false且错误含过短 |
| L7 Cross-component Dependency | genVolumes, genSingleVolume调用 |

### F11: validateChapters(items): {valid, errors}
| Layer | Content |
|---|---|
| L1 Structure | function, 检查title(非空string), plot(非空且>=200字) |
| L2 Input Source | 参数items: any[] |
| L3 Output Destination | 返回{valid, errors} |
| L4 Side Effects | 纯校验, 风险: 低 |
| L5 Communication Paradigm | 组件method |
| L6 Verification Case | test_pipeline_v2.js: 检查plot过短时返回valid===false |
| L7 Cross-component Dependency | genChapters调用 |

### F12: addSetting()
| Layer | Content |
|---|---|
| L1 Structure | function, push新设定到settings, saveProject() |
| L2 Input Source | 无参数 |
| L3 Output Destination | 写projectStore.settings + 持久化 |
| L4 Side Effects | 添加空设定项, 风险: 低 |
| L5 Communication Paradigm | 组件method, @click触发 |
| L6 Verification Case | test_pipeline_v2.js: 点击新增设定后检查settings.length增加 |
| L7 Cross-component Dependency | projectStore.settings |

### F13: genSettings()
| Layer | Content |
|---|---|
| L1 Structure | async function, startGeneration -> getStepSkillTemplate(1) -> callApi -> extractJsonArray -> validateSettings -> setSettings -> finishGeneration |
| L2 Input Source | projectStore.outlineText, skillStore, providerStore |
| L3 Output Destination | pipelineStore状态 + projectStore.setSettings |
| L4 Side Effects | API调用+持久化设定, 风险: 中(API失败/JSON解析失败) |
| L5 Communication Paradigm | 组件method |
| L6 Verification Case | test_pipeline_v2.js T3: AI生成设定后检查settings.length > 0 |
| L7 Cross-component Dependency | pipelineStore, projectStore, skillStore, providerStore |

### F14: confirmSettings()
| Layer | Content |
|---|---|
| L1 Structure | function, 设置settingsGenerated=true, saveProject(), nextStep() |
| L2 Input Source | 读projectStore.settings |
| L3 Output Destination | 写projectStore.settingsGenerated + 持久化 + 步骤前进 |
| L4 Side Effects | 确认设定+进入下一步, 风险: 低 |
| L5 Communication Paradigm | 组件method |
| L6 Verification Case | test_pipeline_v2.js: 点击确认设定后检查currentStep===2 |
| L7 Cross-component Dependency | projectStore, pipelineStore |

### F15: callApiWithTimeout(systemPrompt, userText, timeoutMs): Promise<string>
| Layer | Content |
|---|---|
| L1 Structure | async function, Promise.race(callApi vs setTimeout reject). 超时抛Error |
| L2 Input Source | 参数systemPrompt, userText, timeoutMs |
| L3 Output Destination | 返回Promise<string>或超时reject |
| L4 Side Effects | 超时中断, 风险: 中(长时间等待) |
| L5 Communication Paradigm | 组件method |
| L6 Verification Case | test_pipeline_v2.js: mock慢API, 检查超时后抛出正确错误 |
| L7 Cross-component Dependency | callApi |

### F16: genVolumes(mode: string)
| Layer | Content |
|---|---|
| L1 Structure | async function, mode=auto全量替换, continue只生成第1卷, resume从已有数量续生成 |
| L2 Input Source | projectStore.outlineText, settings, volumeWords, mode参数 |
| L3 Output Destination | projectStore.volumes + pipelineStore状态 |
| L4 Side Effects | API调用+卷纲持久化, 风险: 中 |
| L5 Communication Paradigm | 组件method, 三个按钮分别传auto/continue/resume |
| L6 Verification Case | test_pipeline_v2.js T6-vol-gen: auto检查全量替换; continue检查只增1卷; resume检查从断点续 |
| L7 Cross-component Dependency | pipelineStore, projectStore |

### F17: confirmVolumes()
| Layer | Content |
|---|---|
| L1 Structure | function, saveProject(), nextStep() |
| L2 Input Source | 无参数 |
| L3 Output Destination | projectStore.saveProject + pipelineStore.setStep |
| L4 Side Effects | 确认卷纲+进入章节步, 风险: 低 |
| L5 Communication Paradigm | 组件method |
| L6 Verification Case | test_pipeline_v2.js: 点击确认卷纲后检查currentStep===3 |
| L7 Cross-component Dependency | projectStore, pipelineStore |

### F18: genSingleVolume(index: number)
| Layer | Content |
|---|---|
| L1 Structure | async function, 重新生成指定卷. 构建prompt含其他卷概要, callApi+extractJsonArray+validateVolumes, 合并到volumes[index] |
| L2 Input Source | projectStore.outlineText, settings, volumes, index参数 |
| L3 Output Destination | 写projectStore.volumes[index] + 持久化 |
| L4 Side Effects | API调用+单卷替换, 风险: 中 |
| L5 Communication Paradigm | 组件method, 每卷卡片重新生成按钮 |
| L6 Verification Case | test_pipeline_v2.js: 重新生成卷2后检查volumes[1]内容变化, 其他卷不变 |
| L7 Cross-component Dependency | pipelineStore, projectStore |

### F19: genChapters()
| Layer | Content |
|---|---|
| L1 Structure | async function, 按batch=20分批生成章节. 每批callApiWithTimeout(120s), 5次重试, 不足补生成. 每章赋id和volumeId. 断点保存 |
| L2 Input Source | projectStore.volumes, chapters, settingBindings, chapterWords |
| L3 Output Destination | projectStore.setChapters + pipelineStore状态+断点 |
| L4 Side Effects | 多次API调用+章节持久化, 风险: 高(长流程, 网络中断风险) |
| L5 Communication Paradigm | 组件method |
| L6 Verification Case | test_pipeline_v2.js T7: 生成章节后检查章节数===estimatedChapters, 每章含id和volumeId, plot>=200字 |
| L7 Cross-component Dependency | pipelineStore, projectStore |

### F20: genChaptersAuto()
| Layer | Content |
|---|---|
| L1 Structure | async function, 遍历所有卷, 逐卷调用genChapters. 失败时break |
| L2 Input Source | projectStore.volumes |
| L3 Output Destination | 逐卷设置selectedVolumeIndex + 调用genChapters |
| L4 Side Effects | 多卷批量生成, 风险: 高(超长流程) |
| L5 Communication Paradigm | 组件method |
| L6 Verification Case | test_pipeline_v2.js: 自动生成全部后检查每卷都有章节 |
| L7 Cross-component Dependency | genChapters |

### F21: resumeGen()
| Layer | Content |
|---|---|
| L1 Structure | async function, 读取breakpoint, 从已有章节数开始逐章续生成. 失败时saveBreakpoint+failGeneration. 完成后clearBreakpoint |
| L2 Input Source | pipelineStore.breakpoint, projectStore.chapters |
| L3 Output Destination | projectStore.setChapters + pipelineStore状态+断点 |
| L4 Side Effects | 续生成+断点管理, 风险: 中(断点丢失会导致重复生成) |
| L5 Communication Paradigm | 组件method, 续生成按钮disabled绑定breakpoint |
| L6 Verification Case | test_pipeline_v2.js T8-resume: 中断后续生成, 检查从断点处继续, 不重复已有章节 |
| L7 Cross-component Dependency | pipelineStore.breakpoint, projectStore.chapters |

### F22: confirmChapters()
| Layer | Content |
|---|---|
| L1 Structure | function, saveProject(), nextStep() |
| L2 Input Source | 无参数 |
| L3 Output Destination | projectStore.saveProject + pipelineStore.setStep |
| L4 Side Effects | 确认章节+进入正文步, 风险: 低 |
| L5 Communication Paradigm | 组件method |
| L6 Verification Case | test_pipeline_v2.js: 点击确认章节后检查currentStep===4 |
| L7 Cross-component Dependency | projectStore, pipelineStore |

### F23: genBody(chapterIndex: number)
| Layer | Content |
|---|---|
| L1 Structure | async function, 构建prompt含大纲+设定+卷纲+章节剧情, callApi生成正文, 写bodyResult和ch.body, saveProject |
| L2 Input Source | projectStore全部数据, chapterWords, chapterIndex参数 |
| L3 Output Destination | 写bodyResult ref + projectStore.chapters[n].body + 持久化 |
| L4 Side Effects | API调用+正文持久化, 风险: 中 |
| L5 Communication Paradigm | 组件method |
| L6 Verification Case | test_pipeline_v2.js: 生成正文后检查bodyResult非空, ch.body已写入 |
| L7 Cross-component Dependency | pipelineStore, projectStore |

### F24: genBodyForSelected()
| Layer | Content |
|---|---|
| L1 Structure | async function, 设置selectedVolumeIndex=bodyVolumeIndex, 调用genBody(bodyChapterIndex) |
| L2 Input Source | 读bodyVolumeIndex, bodyChapterIndex |
| L3 Output Destination | 调用genBody |
| L4 Side Effects | 同genBody, 风险: 中 |
| L5 Communication Paradigm | 组件method |
| L6 Verification Case | test_pipeline_v2.js: 选择卷+章节后点击AI生成正文, 检查bodyResult正确 |
| L7 Cross-component Dependency | genBody |

### F25: genBodyAuto()
| Layer | Content |
|---|---|
| L1 Structure | async function, 遍历bodyVolumeChapters, 逐章调用genBody. 失败时break |
| L2 Input Source | 读bodyVolumeChapters |
| L3 Output Destination | 逐章设置bodyChapterIndex + 调用genBody |
| L4 Side Effects | 批量正文生成, 风险: 高(超长流程) |
| L5 Communication Paradigm | 组件method |
| L6 Verification Case | test_pipeline_v2.js: 自动生成全卷后检查每章都有body |
| L7 Cross-component Dependency | genBody |

### F26: insertToEditor()
| Layer | Content |
|---|---|
| L1 Structure | function, 若bodyResult非空, dispatchEvent insert-text |
| L2 Input Source | 读bodyResult ref |
| L3 Output Destination | window.dispatchEvent(CustomEvent) |
| L4 Side Effects | 触发全局事件, EditorPanel监听插入文本, 风险: 低 |
| L5 Communication Paradigm | window event (跨组件树通信) |
| L6 Verification Case | test_pipeline_v2.js: 点击插入到编辑器, 检查editor收到insert-text事件 |
| L7 Cross-component Dependency | EditorPanel.vue监听insert-text事件 |

### F27: toolAction(action: string)
| Layer | Content |
|---|---|
| L1 Structure | async function, 根据action调用useAiTools的不同方法, 结果写入toolResult |
| L2 Input Source | 参数action: string, projectStore数据, useAiTools composable |
| L3 Output Destination | 写toolResult ref |
| L4 Side Effects | API调用(通过useAiTools), 风险: 中 |
| L5 Communication Paradigm | 组件method, AI工具栏9个按钮分别传不同action |
| L6 Verification Case | test_pipeline_v2.js: 点击AI起名, 检查toolResult显示结果 |
| L7 Cross-component Dependency | useAiTools composable |

## 副作用风险表

| 函数 | 主行为 | 副作用 | 风险等级 |
|------|--------|--------|----------|
| saveStepConfig | 持久化步骤配置 | Electron存储写入 | 低 |
| callApi | API请求 | 网络+429重试 | 高 |
| callApiWithTimeout | 带超时API请求 | 超时中断 | 中 |
| genSettings | 生成设定 | API+持久化 | 中 |
| genVolumes | 生成卷纲 | API+持久化+断点 | 中 |
| genSingleVolume | 重生成单卷 | API+持久化 | 中 |
| genChapters | 批量生成章节 | 多次API+断点+持久化 | 高 |
| genChaptersAuto | 全卷批量章节 | 超长流程+多次API | 高 |
| resumeGen | 续生成章节 | 断点恢复+API | 中 |
| genBody | 生成正文 | API+持久化 | 中 |
| genBodyAuto | 批量正文 | 超长流程 | 高 |
| insertToEditor | 插入编辑器 | 全局事件 | 低 |
| toolAction | AI工具 | API调用 | 中 |

## 通信范式总结

| 范式 | 使用位置 | 说明 |
|------|----------|------|
| store (Pinia) | 全部生成函数 | 读写pipelineStore和projectStore |
| emit | close事件 | 子到父关闭模态框 |
| window event | insertToEditor | 跨组件树通信到EditorPanel |
| composable | toolAction | useAiTools提供AI工具方法 |
| fetch | callApi | 直接调用chat/completions API |
| Electron IPC | saveStepConfig | storageRead/Write持久化 |

## L6验证用例映射

| 测试脚本 | 覆盖函数 | PASS/FAIL |
|-----------|----------|-----------|
| test_pipeline_v2.js (37 tests) | F01-F27全部 | 37/37 PASS |

验证证据: D:/codex/novel-workshop-vue3/_audit/pipeline_v2_report.json
