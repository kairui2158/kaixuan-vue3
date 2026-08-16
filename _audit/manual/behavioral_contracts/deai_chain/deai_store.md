# DeAi Store (deai.ts) 行为契约

> 源文件: `src/stores/deai.ts`
> 职责: 去AI味功能的全局状态管理——模式/技能链/硬规则/供应商/进度/流程预览
> 函数总数: 14（5 ref状态 + 1 computed + 8方法）

---

## F01: enabled (ref)

| 层 | 内容 |
|---|---|
| L1 结构 | ref<boolean>，初始值 false。控制去AI味功能是否启用 |
| L2 输入来源 | loadConfig 从 storage 读取；UI 可赋值 |
| L3 输出目的地 | 被 DeAiButton 等组件消费判断是否显示处理状态 |
| L4 副作用 | 无。风险等级: 无 |
| L5 通信范式 | Pinia store ref，组件响应式读取 |
| L6 验证用例 | Playwright: loadConfig 后检查 enabled 值与存储一致；UI 切换后 saveConfig 写入存储 |
| L7 跨组件依赖 | DeAiButton、DeAiSettings 消费 |

## F02: mode (ref)

| 层 | 内容 |
|---|---|
| L1 结构 | ref<'chain'|'split-merge'|'multi-step'>，初始值 'chain'。当前处理模式 |
| L2 输入来源 | loadConfig 读取（兼容旧 agentMode 字段）；setMode 赋值；UI 卡片点击赋值 |
| L3 输出目的地 | useDeAi.process() 分支判断；updateFlowPreview 分支；DeAiSettings 卡片高亮 |
| L4 副作用 | 变更触发 updateFlowPreview + saveConfig。风险等级: 低 |
| L5 通信范式 | Pinia store ref |
| L6 验证用例 | Playwright: 点击模式卡片2 → mode === 'split-merge'；流程预览更新为 split 流程 |
| L7 跨组件依赖 | useDeAi、DeAiSettings、DeAiFlowPreview 消费 |

## F03: skillIds (ref)

| 层 | 内容 |
|---|---|
| L1 结构 | ref<string[]>，初始值 []。去AI味技能链的技能ID有序数组 |
| L2 输入来源 | loadConfig 读取（兼容旧 skills 字段）；addDeAiSkill push；removeDeAiSkill splice |
| L3 输出目的地 | useDeAi.processChain/processSplitMerge/processMultiStep 读取技能模板；DeAiSettings 渲染 chip 列表 |
| L4 副作用 | 变更触发 saveConfig。风险等级: 低 |
| L5 通信范式 | Pinia store ref |
| L6 验证用例 | Playwright: 添加2个技能 → skillIds.length === 2；删除第1个 → skillIds[0] === 原第2个 |
| L7 跨组件依赖 | useDeAi、DeAiSettings、DeAiSkillSelector 消费 |

## F04: hardruleEnabled (ref)

| 层 | 内容 |
|---|---|
| L1 结构 | ref<boolean>，初始值 true。硬规则总开关 |
| L2 输入来源 | loadConfig 读取（兼容旧 hardRulesEnabled 字段）；UI toggle 赋值 |
| L3 输出目的地 | useDeAi 各 process 函数判断是否运行硬规则；DeAiSettings 显示/隐藏硬规则细项 |
| L4 副作用 | 变更触发 saveConfig。风险等级: 低 |
| L5 通信范式 | Pinia store ref |
| L6 验证用例 | Playwright: 关闭硬规则开关 → processChain 不执行 DeAiProcessor；硬规则细项区域隐藏 |
| L7 跨组件依赖 | useDeAi、DeAiSettings 消费 |

## F05: isProcessing / progress / currentStep (refs)

| 层 | 内容 |
|---|---|
| L1 结构 | ref<boolean> + ref<number> + ref<string>。处理状态/进度百分比/当前步骤描述 |
| L2 输入来源 | startProcessing/updateProgress/finishProcessing 赋值 |
| L3 输出目的地 | DeAiProgress 进度条/步骤列表；DeAiButton 按钮状态；DeAiFlowPreview 步骤高亮 |
| L4 副作用 | 纯状态更新，无外部副作用。风险等级: 无 |
| L5 通信范式 | Pinia store ref |
| L6 验证用例 | Playwright: 处理中 → isProcessing=true, progress>0; 完成后 → isProcessing=false, progress=100 |
| L7 跨组件依赖 | DeAiProgress、DeAiButton、DeAiFlowPreview 消费 |

## F06: loadConfig()

| 层 | 内容 |
|---|---|
| L1 结构 | 方法。从 electron storage 读取去AI味配置并赋值到各 ref |
| L2 输入来源 | `window.electronAPI.storageRead(storageKey('deAiConfig'))`，fallback 读 `storageKey('app-deai-config')` |
| L3 输出目的地 | 赋值到 enabled/mode/skillIds/agentId/hardruleEnabled/hardRules/version/level/textType/splitSize |
| L4 副作用 | 修改 store 状态 + 调用 updateFlowPreview。风险等级: 中 — 全量覆盖 store 状态 |
| L5 通信范式 | electronAPI 读取 → store ref 赋值 |
| L6 验证用例 | Playwright: 先 saveConfig 写入 {mode:'multi-step'} → loadConfig → mode === 'multi-step' |
| L7 跨组件依赖 | DeAiSettings.resetConfig 调用；应用启动时调用 |

## F07: saveConfig()

| 层 | 内容 |
|---|---|
| L1 结构 | 方法。将当前 store 状态持久化到 electron storage |
| L2 输入来源 | 所有 store ref 当前值（深拷贝 skillIds 和 hardRules） |
| L3 输出目的地 | `window.electronAPI.storageWrite(storageKey('deAiConfig'), {...})` |
| L4 副作用 | electron storage 写入。风险等级: 中 — 覆盖之前的配置 |
| L5 通信范式 | store ref → electronAPI 写入 |
| L6 验证用例 | Playwright: 设置 mode='split-merge' → saveConfig → 重新 loadConfig → mode 仍为 'split-merge' |
| L7 跨组件依赖 | 被 setMode/addDeAiSkill/removeDeAiSkill/toggleHardRule/DeAiSettings.saveAllConfig 调用 |

## F08: setMode(m)

| 层 | 内容 |
|---|---|
| L1 结构 | 方法。设置处理模式并更新流程预览和持久化 |
| L2 输入来源 | 参数 m: 'chain'|'split-merge'|'multi-step' |
| L3 输出目的地 | mode ref 赋值，updateFlowPreview()，saveConfig() |
| L4 副作用 | 触发流程预览更新 + 持久化。风险等级: 低 |
| L5 通信范式 | store ref + 方法链调用 |
| L6 验证用例 | Playwright: setMode('multi-step') → mode==='multi-step', flowPreview 含 'extract event core' |
| L7 跨组件依赖 | DeAiSettings.selectMode 调用 |

## F09: updateFlowPreview()

| 层 | 内容 |
|---|---|
| L1 结构 | 方法。根据当前 mode 更新 flowPreview 数组 |
| L2 输入来源 | mode ref 当前值 |
| L3 输出目的地 | flowPreview ref 赋值 |
| L4 副作用 | 触发 DeAiFlowPreview 组件重渲染。风险等级: 无 |
| L5 通信范式 | store ref 赋值 |
| L6 验证用例 | Playwright: mode='chain' → flowPreview 含 'S1 rewrite','hardrule pre','S2 verify'；mode='split-merge' → 含 'split','parallel rewrite' |
| L7 跨组件依赖 | DeAiFlowPreview、DeAiProgress 消费 flowPreview |

## F10: startProcessing()

| 层 | 内容 |
|---|---|
| L1 结构 | 方法。标记处理开始 |
| L2 输入来源 | 无参数 |
| L3 输出目的地 | isProcessing=true, progress=0 |
| L4 副作用 | 触发 DeAiButton 禁用 + DeAiProgress 显示。风险等级: 低 |
| L5 通信范式 | store ref 赋值 |
| L6 验证用例 | Playwright: startProcessing → isProcessing===true, progress===0 |
| L7 跨组件依赖 | useDeAi.process 调用 |

## F11: updateProgress(percent, step)

| 层 | 内容 |
|---|---|
| L1 结构 | 方法。更新处理进度和当前步骤描述 |
| L2 输入来源 | 参数 percent: number, step: string |
| L3 输出目的地 | progress ref, currentStep ref |
| L4 副作用 | 触发 DeAiProgress 进度条/步骤列表更新。风险等级: 无 |
| L5 通信范式 | store ref 赋值 |
| L6 验证用例 | Playwright: updateProgress(50, 'S1 rewrite') → progress===50, currentStep==='S1 rewrite' |
| L7 跨组件依赖 | useDeAi 各 process 函数调用；DeAiProgress 消费 |

## F12: finishProcessing()

| 层 | 内容 |
|---|---|
| L1 结构 | 方法。标记处理完成 |
| L2 输入来源 | 无参数 |
| L3 输出目的地 | isProcessing=false, progress=100, currentStep='done' |
| L4 副作用 | 触发 DeAiProgress 隐藏/完成态。风险等级: 低 |
| L5 通信范式 | store ref 赋值 |
| L6 验证用例 | Playwright: finishProcessing → isProcessing===false, progress===100 |
| L7 跨组件依赖 | useDeAi.process 调用 |

---

## 副作用风险表

| 风险等级 | 函数 | 说明 |
|---|---|---|
| 中 | F06 loadConfig | 全量覆盖 store 状态 |
| 中 | F07 saveConfig | 覆盖 electron storage 中的配置 |
| 低 | F02 mode 变更 | 触发流程预览更新+持久化 |
| 低 | F04 hardruleEnabled 变更 | 触发持久化 |
| 低 | F08 setMode | 触发流程预览更新+持久化 |
| 低 | F10 startProcessing | 触发 UI 状态变更 |
| 低 | F12 finishProcessing | 触发 UI 完成态 |
| 无 | F01 enabled | 纯 ref |
| 无 | F03 skillIds | 纯 ref |
| 无 | F05 isProcessing/progress/currentStep | 纯 ref |
| 无 | F09 updateFlowPreview | 纯 ref 赋值 |
| 无 | F11 updateProgress | 纯 ref 赋值 |

---

## 通信范式汇总

| 范式 | 函数 | 说明 |
|---|---|---|
| electronAPI 读取 | F06 | storageRead 加载配置 |
| electronAPI 写入 | F07 | storageWrite 持久化配置 |
| store ref 状态 | F01-F05, F09-F12 | 响应式状态管理 |
| 方法链调用 | F08 | setMode → updateFlowPreview → saveConfig |

---

## L6 Playwright 验证用例映射

| 用例编号 | 对应函数 | 测试脚本 | 状态 |
|---|---|---|---|
| T-deai-store-01 | F06/F07 loadConfig/saveConfig | test_p8_deai.js | 已有（23/23 PASS） |
| T-deai-store-02 | F08 setMode | test_p8_deai.js | 已有 |
| T-deai-store-03 | F09 updateFlowPreview | test_p8_deai.js | 已有 |
| T-deai-store-04 | F04 hardruleEnabled toggle | test_p8_deai.js | 已有 |
| T-deai-store-05 | F03 skillIds add/remove | test_p8_deai.js | 已有 |
| T-deai-store-06 | F10/F11/F12 processing lifecycle | 需补全 | 进度状态生命周期验证 |

---

## 关键行为契约备注

1. **向后兼容字段**: loadConfig 同时读取新旧字段名（mode/agentMode, skillIds/skills, hardruleEnabled/hardRulesEnabled），确保旧版配置不丢失。
2. **深拷贝**: saveConfig 对 skillIds 和 hardRules 使用 JSON.parse(JSON.stringify()) 深拷贝，避免引用泄漏到存储。
3. **storageKey 隔离**: 使用 storageKey('deAiConfig') 生成存储键，确保多项目配置隔离。
4. **flowPreview 与 mode 同步**: 任何 mode 变更都必须通过 setMode 或 updateFlowPreview 更新 flowPreview，否则流程预览与实际处理不一致。
