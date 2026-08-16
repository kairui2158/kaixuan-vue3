# DeAI 子组件行为契约

> 源文件: `src/components/deai/` 目录下5个组件
> 职责: 去AI味UI交互——按钮、进度弹窗、流程预览、模式卡片、技能选择器
> 函数总数: 18（跨5个组件）

---

# DeAiButton.vue (3函数)

## F01: triggerDeAi()

| 层 | 内容 |
|---|---|
| L1 结构 | async 事件处理函数。按钮 @click 绑定。触发去AI味处理 |
| L2 输入来源 | editorStore.activeTab（当前编辑器内容）；deAiStore.skillIds（检查是否配置）；useDeAi.process |
| L3 输出目的地 | editorStore.updateContent（写回处理结果）；alert（错误提示） |
| L4 副作用 | 调用 deAiProcess（完整处理流水线）；editorStore 写入。风险等级: 高 |
| L5 通信范式 | editorStore 读取/写入 + useDeAi 调用 |
| L6 验证用例 | Playwright: 无技能配置 → alert 提示；有技能 → 处理中按钮禁用+显示进度%；完成后内容更新 |
| L7 跨组件依赖 | editorStore、deAiStore、useDeAi |

## F02: deAiStore.isProcessing (响应式消费)

| 层 | 内容 |
|---|---|
| L1 结构 | 模板响应式绑定。按钮 disabled + 文本切换 |
| L2 输入来源 | deAiStore.isProcessing, deAiStore.progress |
| L3 输出目的地 | DOM 按钮状态 |
| L4 副作用 | 无。风险等级: 无 |
| L5 通信范式 | store 响应式读取 |
| L6 验证用例 | Playwright: isProcessing=true → 按钮禁用+显示'处理中... N%' |
| L7 跨组件依赖 | deAiStore |

## F03: deAiStore.skillIds.length === 0 检查

| 层 | 内容 |
|---|---|
| L1 结构 | triggerDeAi 内前置检查。无技能配置时阻止处理 |
| L2 输入来源 | deAiStore.skillIds |
| L3 输出目的地 | alert('请先在设置中去AI味页面配置技能') |
| L4 副作用 | 阻断处理流程。风险等级: 低 |
| L5 通信范式 | store 读取 |
| L6 验证用例 | Playwright: skillIds 为空 → alert 弹出，deAiProcess 不被调用 |
| L7 跨组件依赖 | deAiStore |

---

# DeAiProgress.vue (3函数)

## F04: cancelDeAi()

| 层 | 内容 |
|---|---|
| L1 结构 | 事件处理函数。取消按钮 @click 绑定。发送取消信号 |
| L2 输入来源 | 无参数 |
| L3 输出目的地 | window.dispatchEvent(new CustomEvent('deai-cancel')) |
| L4 副作用 | window 全局事件分发。风险等级: 中 — 触发 useDeAi.process 的 AbortController.abort() |
| L5 通信范式 | window.dispatchEvent（跨组件树通信） |
| L6 验证用例 | Playwright: 点击取消 → window 收到 'deai-cancel' 事件；处理中断 |
| L7 跨组件依赖 | useDeAi.process 监听 'deai-cancel' |

## F05: getStepClass(index)

| 层 | 内容 |
|---|---|
| L1 结构 | 普通函数。根据进度计算步骤项的 CSS class |
| L2 输入来源 | 参数 index；deAiStore.progress, deAiStore.isProcessing, deAiStore.flowPreview.length |
| L3 输出目的地 | 返回 'done'|'active'|'pending' |
| L4 副作用 | 无。风险等级: 无 |
| L5 通信范式 | store 读取 |
| L6 验证用例 | Playwright: progress=50, 6步 → index 0-2 为 'done', index 3 为 'active', index 4-5 为 'pending' |
| L7 跨组件依赖 | deAiStore |

## F06: getStepStatusText(index)

| 层 | 内容 |
|---|---|
| L1 结构 | 普通函数。返回步骤状态文案 |
| L2 输入来源 | 参数 index；getStepClass 返回值 |
| L3 输出目的地 | 返回 '完成'|'处理中...'|'等待' |
| L4 副作用 | 无。风险等级: 无 |
| L5 通信范式 | 纯函数（依赖 getStepClass） |
| L6 验证用例 | Playwright: done → '完成'；active → '处理中...'；pending → '等待' |
| L7 跨组件依赖 | getStepClass |

---

# DeAiFlowPreview.vue (4函数)

## F07: steps (computed)

| 层 | 内容 |
|---|---|
| L1 结构 | computed。从 deAiStore.flowPreview 获取当前流程步骤列表 |
| L2 输入来源 | deAiStore.flowPreview |
| L3 输出目的地 | 模板渲染流程步骤标签 |
| L4 副作用 | 无。风险等级: 无 |
| L5 通信范式 | store 响应式读取 |
| L6 验证用例 | Playwright: mode='chain' → steps 含 'S1 rewrite','hardrule pre','S2 verify' 等 |
| L7 跨组件依赖 | deAiStore.flowPreview |

## F08: estimatedTime (computed)

| 层 | 内容 |
|---|---|
| L1 结构 | computed。根据模式和步骤数估算耗时 |
| L2 输入来源 | steps.value.length, deAiStore.mode |
| L3 输出目的地 | 返回格式化时间字符串（如 '2分30秒'） |
| L4 副作用 | 无。风险等级: 无 |
| L5 通信范式 | store 读取 |
| L6 验证用例 | Playwright: chain 6步 → 120秒='2分钟'；split-merge 6步 → 60秒='1分钟'；multi-step 7步 → 105秒='1分45秒' |
| L7 跨组件依赖 | deAiStore.mode |

## F09: isCurrent(index)

| 层 | 内容 |
|---|---|
| L1 结构 | 普通函数。判断某步骤是否为当前执行步骤 |
| L2 输入来源 | 参数 index；deAiStore.progress, steps.value.length, deAiStore.isProcessing |
| L3 输出目的地 | 返回 boolean |
| L4 副作用 | 无。风险等级: 无 |
| L5 通信范式 | store 读取 |
| L6 验证用例 | Playwright: progress=50, 6步, isProcessing=true → index 3 为 current |
| L7 跨组件依赖 | deAiStore |

## F10: isDone(index)

| 层 | 内容 |
|---|---|
| L1 结构 | 普通函数。判断某步骤是否已完成 |
| L2 输入来源 | 参数 index；deAiStore.progress, steps.value.length |
| L3 输出目的地 | 返回 boolean |
| L4 副作用 | 无。风险等级: 无 |
| L5 通信范式 | store 读取 |
| L6 验证用例 | Playwright: progress=50, 6步 → index 0-2 为 done |
| L7 跨组件依赖 | deAiStore |

---

# DeAiModeCard.vue (1函数)

## F11: select()

| 层 | 内容 |
|---|---|
| L1 结构 | 事件处理函数。卡片 @click 绑定。emit select 事件 |
| L2 输入来源 | props.mode.id |
| L3 输出目的地 | emit('select', props.mode.id) |
| L4 副作用 | 父组件接收事件。风险等级: 无 |
| L5 通信范式 | emit（父子组件通信） |
| L6 验证用例 | Playwright: 点击卡片 → 父组件收到 select 事件 + mode.id |
| L7 跨组件依赖 | 父组件（DeAiSettings）处理 select 事件 |

---

# DeAiSkillSelector.vue (5函数)

## F12: getSkillName(id)

| 层 | 内容 |
|---|---|
| L1 结构 | 普通函数。通过技能ID查找名称 |
| L2 输入来源 | 参数 id；skillStore.skills |
| L3 输出目的地 | 返回 string |
| L4 副作用 | 无。风险等级: 无 |
| L5 通信范式 | skillStore 读取 |
| L6 验证用例 | Playwright: 有效 ID → 返回名称；无效 → 返回原 ID |
| L7 跨组件依赖 | skillStore |

## F13: add()

| 层 | 内容 |
|---|---|
| L1 结构 | 事件处理函数。下拉 @change 绑定。添加技能 |
| L2 输入来源 | newSkillId ref；deAiStore.skillIds |
| L3 输出目的地 | deAiStore.skillIds.push；deAiStore.saveConfig()；清空 newSkillId |
| L4 副作用 | store 写入。风险等级: 低 |
| L5 通信范式 | 本地 ref + store 写入 |
| L6 验证用例 | Playwright: 选择技能 → 添加到列表；重复 → 不添加；添加后下拉清空 |
| L7 跨组件依赖 | deAiStore |

## F14: remove(index)

| 层 | 内容 |
|---|---|
| L1 结构 | 事件处理函数。移除按钮 @click 绑定 |
| L2 输入来源 | 参数 index；deAiStore.skillIds |
| L3 输出目的地 | deAiStore.skillIds.splice(index, 1)；deAiStore.saveConfig() |
| L4 副作用 | store 写入。风险等级: 低 |
| L5 通信范式 | store 写入 |
| L6 验证用例 | Playwright: 添加3个 → 删除第2个 → 剩余2个 |
| L7 跨组件依赖 | deAiStore |

## F15: moveUp(index)

| 层 | 内容 |
|---|---|
| L1 结构 | 事件处理函数。上移按钮 @click 绑定。交换技能顺序 |
| L2 输入来源 | 参数 index；deAiStore.skillIds |
| L3 输出目的地 | 数组解构交换 [arr[index-1], arr[index]]；deAiStore.saveConfig() |
| L4 副作用 | store 写入（顺序变更+持久化）。风险等级: 低 |
| L5 通信范式 | store 写入 |
| L6 验证用例 | Playwright: 3个技能 → 点第3个上移 → 第2和第3交换位置；第1个上移按钮禁用 |
| L7 跨组件依赖 | deAiStore |

## F16: moveDown(index)

| 层 | 内容 |
|---|---|
| L1 结构 | 事件处理函数。下移按钮 @click 绑定。交换技能顺序 |
| L2 输入来源 | 参数 index；deAiStore.skillIds |
| L3 输出目的地 | 数组解构交换 [arr[index], arr[index+1]]；deAiStore.saveConfig() |
| L4 副作用 | store 写入。风险等级: 低 |
| L5 通信范式 | store 写入 |
| L6 验证用例 | Playwright: 3个技能 → 点第1个下移 → 第1和第2交换；最后1个下移按钮禁用 |
| L7 跨组件依赖 | deAiStore |

---

# DeAiSamples (deai-samples.js) (2函数)

## F17: getAll()

| 层 | 内容 |
|---|---|
| L1 结构 | 方法。返回全部38个风格样本的副本 |
| L2 输入来源 | 内部 SAMPLES 数组 |
| L3 输出目的地 | 返回 SAMPLES.slice()（浅拷贝） |
| L4 副作用 | 无。风险等级: 无 |
| L5 通信范式 | 模块级单例 |
| L6 验证用例 | Playwright: getAll().length === 38；返回值 !== SAMPLES（不同引用） |
| L7 跨组件依赖 | useDeAi.processChain/processMultiStep 调用 |

## F18: getSampleText()

| 层 | 内容 |
|---|---|
| L1 结构 | 方法。返回全部样本拼接的文本 |
| L2 输入来源 | 内部 SAMPLES 数组 |
| L3 输出目的地 | 返回 SAMPLES.join('\n') |
| L4 副作用 | 无。风险等级: 无 |
| L5 通信范式 | 模块级单例 |
| L6 验证用例 | Playwright: getSampleText() 包含所有38个样本，以\n分隔 |
| L7 跨组件依赖 | 旧架构 renderer_v2.js L699 调用（新架构 useDeAi 改用 getAll().slice(0,3)） |

---

## 副作用风险表

| 风险等级 | 函数 | 说明 |
|---|---|---|
| 高 | F01 triggerDeAi | 完整处理流水线 + editorStore 写入 |
| 中 | F04 cancelDeAi | window 事件触发 AbortController.abort |
| 低 | F03 skillIds 检查 | 阻断处理 + alert |
| 低 | F13 add | skillIds push + saveConfig |
| 低 | F14 remove | skillIds splice + saveConfig |
| 低 | F15 moveUp | 数组交换 + saveConfig |
| 低 | F16 moveDown | 数组交换 + saveConfig |
| 无 | F02 isProcessing 消费 | 响应式读取 |
| 无 | F05 getStepClass | 纯计算 |
| 无 | F06 getStepStatusText | 纯计算 |
| 无 | F07 steps | computed |
| 无 | F08 estimatedTime | computed |
| 无 | F09 isCurrent | 纯计算 |
| 无 | F10 isDone | 纯计算 |
| 无 | F11 select | emit |
| 无 | F12 getSkillName | 纯读取 |
| 无 | F17 getAll | 纯读取+拷贝 |
| 无 | F18 getSampleText | 纯读取 |

---

## 通信范式汇总

| 范式 | 函数 | 说明 |
|---|---|---|
| editorStore 读写 | F01 | activeTab 读取 + updateContent 写入 |
| deAiStore 读写 | F01, F02, F03, F13-F16 | process/skillIds/isProcessing |
| window.dispatchEvent | F04 | deai-cancel 跨组件树 |
| emit | F11 | 父子组件 select 事件 |
| skillStore 读取 | F12 | skills 数组 |
| 模块单例 | F17, F18 | DeAiSamples IIFE |

---

## L6 Playwright 验证用例映射

| 用例编号 | 对应函数 | 测试脚本 | 状态 |
|---|---|---|---|
| T-deai-comp-01 | F01 triggerDeAi 无技能 | test_p8_deai.js | 已有（23/23 PASS） |
| T-deai-comp-02 | F01 triggerDeAi 有技能 | test_p8_deai.js | 已有 |
| T-deai-comp-03 | F02 按钮禁用态 | test_p8_deai.js | 已有 |
| T-deai-comp-04 | F04 cancelDeAi | 需补全 | 取消按钮行为验证 |
| T-deai-comp-05 | F05/F06 步骤状态 | test_p8_deai.js | 已有 |
| T-deai-comp-06 | F07-F10 流程预览 | test_p8_deai.js | 已有 |
| T-deai-comp-07 | F15/F16 技能排序 | 需补全 | moveUp/moveDown 验证 |
| T-deai-comp-08 | F17 getAll 38样本 | 需补全 | 样本数量+内容验证 |

---

## 关键行为契约备注

1. **DeAiButton 是入口**: 用户点击'去AI味'按钮触发整个处理流程，结果写回编辑器。按钮在处理期间禁用。
2. **cancelDeAi 使用 window 事件**: 而非 emit/store，因为取消信号需要穿透多个组件层到达 useDeAi.process 的 AbortController。
3. **DeAiFlowPreview 耗时估算**: chain=20s/步, split-merge=10s/步, multi-step=15s/步。这是粗略估算，实际时间取决于API响应速度和文本长度。
4. **DeAiSkillSelector vs DeAiSettings 内联选择器**: DeAiSkillSelector 是独立组件（带上移/下移），DeAiSettings 内联了简化版选择器（无排序）。两者操作同一个 deAiStore.skillIds。
5. **DeAiSamples 是 IIFE 单例**: 38个样本在模块加载时初始化，getAll 返回浅拷贝防止外部修改。新架构 useDeAi 只取前3个样本注入 S1。
6. **进度计算一致性**: DeAiProgress 和 DeAiFlowPreview 都使用 `Math.floor((progress / 100) * total)` 计算当前步骤索引，必须保持一致。
