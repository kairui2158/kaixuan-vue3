# pipeline_store.ts 行为契约

源文件: src/stores/pipeline.ts (2163 bytes)
Store ID: pipeline (Pinia defineStore)
函数总数: 14 (10 methods + 4 computed/state refs)

## 状态字段

| 字段 | 类型 | 初始值 | 用途 |
|------|------|--------|------|
| currentStep | ref<number> | 0 | 当前流水线步骤 (0=outline,1=settings,2=volumes,3=chapters,4=body) |
| isGenerating | ref<boolean> | false | 是否正在生成 |
| generationProgress | ref<number> | 0 | 生成进度百分比 0-100 |
| generationStatus | ref<string> | '' | 生成状态文本 |
| breakpoint | ref<any> | null | 断点续接数据 |
| chapterProgress | ref<{volumeIndex,chapterIndex,total}|null> | null | 章节级进度 |
| stepNames | string[] | ['outline','settings','volumes','chapters','body'] | 步骤名映射表 |

## 函数契约

### F01: currentStepName (computed)
| Layer | Content |
|---|---|
| L1 Structure | computed, 返回 stepNames[currentStep.value] 或空字符串 |
| L2 Input Source | 读 currentStep ref + stepNames 常量数组 |
| L3 Output Destination | 返回string, 被PipelinePanel步骤标题渲染使用 |
| L4 Side Effects | 纯计算无副作用, 风险: 低 |
| L5 Communication Paradigm | store内部computed, 被组件通过pipelineStore.currentStepName读取 |
| L6 Verification Case | test_pipeline_v2.js T1: 打开pipeline, 检查步骤名显示正确; 当前步骤=0时显示'outline' |
| L7 Cross-component Dependency | PipelinePanel.vue步骤栏标题渲染依赖此值 |

### F02: setStep(step: number)
| Layer | Content |
|---|---|
| L1 Structure | function, 直接赋值 currentStep.value = step |
| L2 Input Source | 参数step: number, 由PipelinePanel步骤点击事件传入 |
| L3 Output Destination | 写 currentStep ref |
| L4 Side Effects | 修改响应式状态触发UI重渲染, 风险: 低 |
| L5 Communication Paradigm | store method, 组件调用pipelineStore.setStep(n) |
| L6 Verification Case | test_pipeline_v2.js T2: 点击步骤3, 检查currentStep===3且对应内容区显示 |
| L7 Cross-component Dependency | PipelinePanel.vue pl-step @click 调用 |

### F03: startGeneration()
| Layer | Content |
|---|---|
| L1 Structure | function, 设置isGenerating=true, progress=0, status='generating' |
| L2 Input Source | 无参数, 由genSettings/genVolumes/genChapters等开头调用 |
| L3 Output Destination | 写 isGenerating, generationProgress, generationStatus |
| L4 Side Effects | 触发UI进入生成中状态(按钮禁用), 风险: 低 |
| L5 Communication Paradigm | store method, PipelinePanel调用pipelineStore.startGeneration() |
| L6 Verification Case | test_pipeline_v2.js T3: 点击AI生成设定, 检查isGenerating===true, 进度条显示 |
| L7 Cross-component Dependency | PipelinePanel所有生成函数开头调用 |

### F04: updateProgress(percent: number, status?: string)
| Layer | Content |
|---|---|
| L1 Structure | function, 设置progress=percent, 可选设置status |
| L2 Input Source | 参数percent由生成函数计算传入, status可选文本 |
| L3 Output Destination | 写 generationProgress, 可选写 generationStatus |
| L4 Side Effects | 更新进度条UI, 风险: 低 |
| L5 Communication Paradigm | store method, 生成函数内部调用 |
| L6 Verification Case | test_pipeline_v2.js T4: 生成过程中检查进度从0递增, status文本更新 |
| L7 Cross-component Dependency | PipelinePanel所有生成函数中间调用 |

### F05: finishGeneration()
| Layer | Content |
|---|---|
| L1 Structure | function, 设置isGenerating=false, progress=100, status='done' |
| L2 Input Source | 无参数, 由生成函数结尾调用 |
| L3 Output Destination | 写 isGenerating, generationProgress, generationStatus |
| L4 Side Effects | 解除按钮禁用, 进度条到100%, 风险: 低 |
| L5 Communication Paradigm | store method |
| L6 Verification Case | test_pipeline_v2.js T5: 生成完成后检查isGenerating===false, progress===100 |
| L7 Cross-component Dependency | PipelinePanel所有生成函数结尾调用 |

### F06: failGeneration(error: string)
| Layer | Content |
|---|---|
| L1 Structure | function, 设置isGenerating=false, status='failed: '+error |
| L2 Input Source | 参数error: string, catch块传入异常消息 |
| L3 Output Destination | 写 isGenerating, generationStatus |
| L4 Side Effects | 解除按钮禁用, 显示失败状态, 风险: 中(用户需看到错误信息) |
| L5 Communication Paradigm | store method |
| L6 Verification Case | test_pipeline_v2.js T6: 模拟API失败, 检查status以'failed:'开头, isGenerating===false |
| L7 Cross-component Dependency | PipelinePanel所有生成函数catch块调用 |

### F07: saveBreakpoint(data: any)
| Layer | Content |
|---|---|
| L1 Structure | function, 设置breakpoint=data, 若data含volumeIndex则更新chapterProgress |
| L2 Input Source | 参数data含{volumeIndex, chapterCount, total}等字段 |
| L3 Output Destination | 写 breakpoint ref + 可选写 chapterProgress ref |
| L4 Side Effects | 持久化断点信息供续生成使用, 风险: 中(断点丢失会导致无法续生成) |
| L5 Communication Paradigm | store method |
| L6 Verification Case | test_pipeline_v2.js T7-resume: 生成中断后检查breakpoint非null, chapterProgress.volumeIndex正确 |
| L7 Cross-component Dependency | genChapters和resumeGen调用, resumeGen读取breakpoint决定续生成起点 |

### F08: updateChapterProgress(chapterIndex: number)
| Layer | Content |
|---|---|
| L1 Structure | function, 若chapterProgress存在则更新其chapterIndex字段 |
| L2 Input Source | 参数chapterIndex: number |
| L3 Output Destination | 写 chapterProgress.value.chapterIndex |
| L4 Side Effects | 更新章节级进度显示, 风险: 低 |
| L5 Communication Paradigm | store method |
| L6 Verification Case | test_pipeline_v2.js T8: 章节生成过程中检查chapterProgress.chapterIndex递增 |
| L7 Cross-component Dependency | genChapters循环内调用 |

### F09: clearChapterProgress()
| Layer | Content |
|---|---|
| L1 Structure | function, 设置chapterProgress = null |
| L2 Input Source | 无参数 |
| L3 Output Destination | 写 chapterProgress ref |
| L4 Side Effects | 清除章节进度显示, 风险: 低 |
| L5 Communication Paradigm | store method |
| L6 Verification Case | test_pipeline_v2.js T9: 章节生成完成后检查chapterProgress===null |
| L7 Cross-component Dependency | resumeGen完成后调用 |

### F10: clearBreakpoint()
| Layer | Content |
|---|---|
| L1 Structure | function, 设置breakpoint=null, chapterProgress=null |
| L2 Input Source | 无参数 |
| L3 Output Destination | 写 breakpoint ref + chapterProgress ref |
| L4 Side Effects | 清除断点信息, 续生成按钮变为disabled, 风险: 低 |
| L5 Communication Paradigm | store method |
| L6 Verification Case | test_pipeline_v2.js T10: 续生成完成后检查breakpoint===null |
| L7 Cross-component Dependency | resumeGen完成后调用, PipelinePanel续生成按钮disabled绑定pipelineStore.breakpoint |

## 副作用风险表

| 函数 | 主行为 | 副作用 | 风险等级 |
|------|--------|--------|----------|
| setStep | 修改currentStep | 触发UI步骤切换重渲染 | 低 |
| startGeneration | 设置生成状态 | 按钮禁用+进度条显示 | 低 |
| updateProgress | 更新进度 | UI进度条更新 | 低 |
| finishGeneration | 完成生成状态 | 按钮恢复+进度100% | 低 |
| failGeneration | 失败状态 | 显示错误信息 | 中 |
| saveBreakpoint | 存储断点 | 持久化断点供恢复 | 中 |
| updateChapterProgress | 更新章节进度 | UI章节进度更新 | 低 |
| clearChapterProgress | 清除章节进度 | UI章节进度消失 | 低 |
| clearBreakpoint | 清除断点 | 续生成按钮disabled | 低 |

## 通信范式总结

| 范式 | 使用位置 | 说明 |
|------|----------|------|
| store (Pinia) | 全部函数 | 组件通过pipelineStore.xxx()调用, 响应式状态自动同步 |
| computed | currentStepName | 派生状态, 依赖currentStep自动更新 |

## L6验证用例映射

| 测试脚本 | 覆盖函数 | PASS/FAIL |
|-----------|----------|-----------|
| test_pipeline_v2.js (37 tests) | F01-F10全部 | 37/37 PASS |
| test_p9_chapter_tree.js (48 tests) | F07,F08,F09,F10 (断点续接) | 48/48 PASS |

验证证据: D:/codex/novel-workshop-vue3/_audit/pipeline_v2_report.json
