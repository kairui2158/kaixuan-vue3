# 大纲工作台空等与运行记录失真 · 防踩坑修复方案

> 状态：待审核。审核通过前不改任何业务代码。
> 制定依据：`_audit/神意开发经验总结_v5.md`、`_audit/DEV_LOG.md`、本轮源码侦察与 20260913-221943 trace。
> 核心铁律：先定位，再改码；每次改动只碰本轮需求；每个修复项独立回归；修一个必须验三个入口中相邻的两个。

## 一、这次到底坏在哪里

### 根因 A：工具活动"隐身"（用户空等的直接原因）

大纲工作台有两条对话路径：

| 路径 | 工具过程写气泡吗 | 证据 |
|------|----------------|------|
| `askPlainAi()` 直接对话 | 写（局部数组 `latestOutlineToolCallStream`） | OutlineWorkspace.vue L2433 / L2530 / L2553 |
| `askAi()` SKILL 路径 | **不写**。只 dispatch `tool-activity` 给主编辑器闪烁 | OutlineWorkspace.vue L1069-1090 |

当模型连续多轮只发 tool_calls 零正文时（deepseek-v4-pro 在 100k 上下文下的已知行为），
`askAi` 路径的用户在气泡里什么都看不见。

### 根因 B：进度条在工具轮次冻结

引擎的 `onProgress` 回调只在 `onChunk`（文本增量）里触发
（workspaceSkillEngine.ts L607-611 / L766-770）。
工具调用轮次没有文本 chunk，进度条就不动，看起来像死机。

### 根因 C：没有"太久了"护栏

`aiService.ts` L1089 `maxIterations = Math.max(1, params.toolPolicy?.maxToolIterations ?? 6)`。
工具错误会回喂模型让它继续尝试，最多跑满 6 轮。
100k 上下文每轮 40-90 秒，最坏约 9 分钟全程静默。
跑满后 finishReason 是 `tool_loop_limit`，但 UI 没有把它翻译成人话。

### 根因 D：trace 失真让 SKILL 调试方误判

1. 用户取消被写成 `failed` 而不是 `canceled`（违反经验规则 87：降级终态不得折叠）。
2. 失败调用缺 finishReason（realSkillExecutor.ts catch 块 L810-855，异常发生在 callAi 内部时外层变量 undefined）。
3. 物理请求空壳：payload 外置化时空对象 `{}` 被当成完整内容写入 `001-request.json`（2 字节）。
4. 第 3 次 API 调用失败太快（11 秒），onPhysicalCall 未触发，物理请求记录缺失。
5. 导出包 payload 数组与 payloads 目录文件数不一致（1 vs 19），`payloadVerification` 却显示 ok。

## 二、M1 影响圈声明（改前必读）

### 我打算改的

| 文件 | 函数/区域 | 改什么 |
|------|----------|--------|
| OutlineWorkspace.vue | `askAi()` 工具回调区 L1069-1090 | 把 onToolStart/onToolCall 写入组件级 `outlineToolCallStream` ref |
| OutlineWorkspace.vue | 模板聊天区 L177-185 | 工具过程标签绑定组件级 ref（已存在，只改数据源） |
| OutlineWorkspace.vue | `askPlainAi()` L2433 / L2530-2560 | 改为写同一个组件级 ref，不再用局部数组 |
| OutlineWorkspace.vue | `finishOutlineRun()` / finally 块 L572-593 / L2248-2260 | 取消时传 `canceled`，失败时保留 `failed` |
| OutlineWorkspace.vue | 新增 `startToolStreamForMessage()` / `clearToolStream()` 辅助 | 管理组件级数组的开合，不改模板 DOM |
| workspaceSkillEngine.ts | `onProgress` 回调 L607-611 / L766-770 | 新增 `onToolActivity` 可选回调，不删原有 onChunk 路径 |
| aiService.ts | `callAiWithTools()` L1081-1237 | 连续 2 轮零正文纯 tool_calls 时触发 `onToolActivity('warning')`；跑满上限时 finishReason 已有，补 UI 翻译 |
| aiService.ts | 新增（或复用） `toolPolicy.zeroTextWarnThreshold` | 默认 2，调用方可覆盖 |
| realSkillExecutor.ts | catch 块 L810-855 | 失败路径补 `finishReason: finishReason \|\| 'error'` |
| runTrace.ts | `finishApiCall()` L912 | 不改动 status 守卫（当前逻辑正确），只确认 canceled 不被覆盖 |
| runTrace.ts | `appendPhysicalCall()` L669 | 空对象 payload 不落盘，记录 `payloadEmpty: true` 标记 |
| runTrace.ts | 导出汇总 L1285 / payload 收集 L1206 | 修复 payload 数组与目录文件数对账 |

### 这个改动可能碰到的（但不打算改的）

| 组件 | 为什么可能碰到 | 为什么不改 |
|------|--------------|-----------|
| ChatPanel.vue | 也调用 aiService 工具协议 | 只加可选回调，ChatPanel 不传就不受影响 |
| PipelinePanel.vue | 也调用 workspaceSkillEngine | onToolActivity 可选，不传走原逻辑 |
| App.vue | 监听 `tool-activity` 事件 | 不改 dispatch，只加写入气泡 |
| useDeAi.ts | 独立功能，不涉及工具循环 | 不碰 |
| 主页编辑器 API 路径 | 共享 aiService | 可选参数向后兼容 |

## 三、分阶段修复项

### P0：治空等（用户能看见 AI 在干什么）

#### P0-1 工具流气泡机制上移到组件级

**改什么：**
OutlineWorkspace.vue 新增组件级 ref：

```ts
const outlineToolCallStream = ref<Array<ToolStreamEvent>>([])
```

`askAi()` 的 buildTools onToolStart/onToolCall 从只 dispatch 事件改为同时 `outlineToolCallStream.value.push(...)`。
`askPlainAi()` 删除局部数组 `latestOutlineToolCallStream`，改为写同一个 ref。
每轮新请求开始时 `outlineToolCallStream.value = []`；请求结束（finally 前）把数组快照追加到最终消息对象。

**为什么安全：**
- 模板 L177-185 已有渲染逻辑，只改数据源不碰 DOM 结构（M2）。
- `askAi` 和 `askPlainAi` 各自独立 appendOutlineChat 调用点不变（规则 52）。
- 不改 `tool-activity` dispatch，主编辑器闪烁不受影响（M1 影响圈）。

**回归验证点：**
- `askAi` 路径发一条会触发工具调用的消息 → 气泡内"工具过程 (N)"出现且展开可见。
- `askPlainAi` 路径同上。
- 主页编辑器工具闪烁不受影响。
- 续生成路径 `continueOutlineGeneration()` 不受影响（它没有工具回调）。

#### P0-2 状态条在工具轮次更新

**改什么：**
workspaceSkillEngine 新增可选 `onToolActivity(step, toolName, description)` 回调。
buildTools onToolStart/onToolCall 调用它。
OutlineWorkspace 把它接到 `generationStatus` 或进度条文本。

**为什么安全：**
- 可选回调，不传等于原逻辑。
- 不改 onChunk 路径，流式文本显示不受影响。

**回归验证点：**
- SKILL 模式选 folder skill → 点生成 → 状态条从"正在调用工具..."更新为具体工具名。
- 流式文本 chunk 到来时正常覆盖状态条（原逻辑不变）。

#### P0-3 连续零正文警示与可读上限错误

**改什么：**
aiService `callAiWithTools()` 新增计数器：连续两轮 assistant 消息只有 tool_calls 零 text_content 时，
通过 `onToolActivity('warning', 'tool-loop', '模型连续 N 轮未输出正文，正在通过工具调用查找信息...')` 通知 UI。
跑满 `maxIterations` 时把 finishReason `tool_loop_limit` 翻译为：
"AI 连续尝试工具调用但未能产出回答，已中止。请简化问题或更换模型。"

**为什么安全：**
- 只加警示和翻译，不改工具执行逻辑、不改重试策略。
- `zeroTextWarnThreshold` 可选参数，默认 2，向后兼容。

**回归验证点：**
- mock 连续 3 轮纯 tool_calls → 第 2 轮气泡出现警示文本。
- mock 跑满 6 轮 → 错误消息可读，不是原始英文 finishReason。
- 正常工具调用（1 轮 tool_calls + 1 轮正文）不触发警示。

### P1：治 trace 失真

#### P1-1 取消终态不折叠为失败

**改什么：**
OutlineWorkspace `finishOutlineRun()` / finally 块：abort 触发后 status 传 `canceled`，不是 `failed`。
runTrace `finishApiCall` 已有 `if (call.status !== 'running') return` 守卫，canceled 不会被覆盖，不改。

**为什么安全：**
- 只改调用方传参，不改 runTrace 内部状态机。
- 经验规则 87：降级终态不得折叠为失败。

**回归验证点：**
- 生成中点取消 → trace 里 run.status = canceled、apiCall.status = canceled。
- 不再出现"取消后显示失败"。

#### P1-2 失败路径补 finishReason

**改什么：**
realSkillExecutor catch 块：`apiMeta.finishReason = finishReason || 'error'`。

**为什么安全：**
- 只补字段，不改异常处理逻辑。

**回归验证点：**
- mock 网络错误 → trace 里 apiCall.finishReason = 'error' 而不是 undefined。

#### P1-3 空壳物理请求修复

**改什么：**
runTrace `appendPhysicalCall()`：如果 input 里 payload 序列化后是空对象 `{}`（2 字节），
不创建完整物理记录，改为在 API call 上追加 `physicalSkipped: true` + `physicalSkipReason: 'empty-payload'`。
已有正常物理请求不受影响。

**为什么安全：**
- 只影响空 payload 分支，正常请求走原逻辑。

**回归验证点：**
- 导出包不再有 2 字节 request.json。
- 正常请求的 physicalCalls 数组不变。

#### P1-4 物理请求缺失时补标记

**改什么：**
`finishApiCall()` 如果 status 是 failed 且 `physicalCalls` 为空，
在 call 上追加 `physicalMissing: true` + `physicalMissingReason: 'failure-before-physical-request'`。
这不是补假数据，是给调试方一个"为什么没有物理记录"的解释。

**为什么安全：**
- 只加标记字段，不改现有字段。

#### P1-5 导出 payload 对账修复

**改什么：**
导出函数在构建 `payloads` 数组时，确保 `payloads.length === payloadDir 文件数`。
修复当前"目录有 19 个文件但 payloads 数组只有 1 项"的不一致。

**为什么安全：**
- 只改导出汇总逻辑，不改 payload 收集和存储。

**回归验证点：**
- 导出后读 JSON，`payloads.length` 等于 `payloads/` 目录文件数。
- `payloadVerification.ok === true` 时两端数量一致。

### P2：待用户拍板后执行

#### P2-1 no_match 默认续聊（不再阻断等确认）

**当前行为：** 意图路由 no_match 且有上一轮对话时阻断等确认。
**建议：** 默认按"继续上一话题"处理，不再阻断。如果用户想换话题会自然重新表述。
**等你确认后执行。**

#### P2-2 调试包导出修复

**已在 P1-5 覆盖，如果 P1 执行完即可关闭。**

## 四、防踩坑门禁（每个修复项必须过）

| 门禁 | 内容 |
|------|------|
| G1 定位 | 改前 rg 列出目标函数所有调用方，确认影响圈与 M1 清单一致 |
| G2 diff 自审 | `git diff` 逐行过，每行归入本次需求，多余行回退 |
| G3 构建 | `npm run type-check && npm run build:vue` 零 error |
| G4 单元 | `npm run test:services` 通过（如果本次涉及服务层） |
| G5 真实 UI | 源 Electron + CDP，模拟工具循环场景，断言气泡 / 状态条 / trace 三处 |
| G6 相邻入口 | 每次改动至少验两个相邻入口（大纲工作台 + 主页编辑器或流水线），确保没有修一个坏另一个 |
| G7 清理 | 临时 profile / 探针键 / 临时脚本 try-finally 清理，`Test-Path` 复核 |
| G8 对账 | 完成后写 DEV_LOG + 经验文件（如有新规则） |

## 五、验证计划

### 单元/服务层

- `npm run type-check` 零 error。
- `npm run test:services` 通过。
- aiService 工具循环单测：mock 连续纯 tool_calls → 警示触发 + 跑满上限可读错误。

### 真实 Electron CDP

前置：干净 profile（`SHENYI_TEST_USER_DATA_DIR`），`npm run build:vue` 后源 Electron 启动。

| 场景 | 验证什么 |
|------|---------|
| 正常 askAi + folder skill | 工具过程在气泡内展开可见；状态条更新 |
| 正常 askPlainAi | 同上，不回归 |
| mock 连续零正文 | 警示文本出现；不再全程静默 |
| mock 跑满上限 | 可读错误消息，不是原始 finishReason |
| 生成中取消 | run.status=canceled；气泡中断提示 |
| 导出 trace | payload 数组 = 目录文件数；无 2 字节空壳 |

### 相邻入口回归

- 主页编辑器 API 对话：工具过程正常显示，无回归。
- 流水线卷纲生成：进度条正常，无回归。

## 六、执行顺序与依赖

```
P0-1 组件级工具流
  ↓
P0-2 状态条更新（依赖 P0-1 的 onToolActivity）
  ↓
P0-3 警示与可读上限
  ↓
P1-1 取消终态
  ↓
P1-2 finishReason 补齐
  ↓
P1-3 空壳物理请求
  ↓
P1-4 缺失标记
  ↓
P1-5 导出对账
  ↓
P2（等用户拍板）
```

每一步走完 G1-G8 门禁后才进下一步。任何一步失败：停止，汇报，等用户决策，不自行跳步或绕路。

## 七、不改清单（本轮铁律）

1. 不碰 useDeAi.ts / de-ai.js（上一轮已闭环）。
2. 不碰主页编辑器上下文优先级（规则 37/38 已闭环）。
3. 不碰 PipelinePanel.vue 的正文/卷纲逻辑（已闭环）。
4. 不碰 runTrace 状态机内部逻辑（只改调用方传参和导出汇总）。
5. 不碰意图路由阈值（P2 等确认后才动）。
6. 不碰 folder SKILL 加载/解析/注入（已闭环）。
7. 不碰主题/间距/密度系统（已闭环）。
8. 不新增依赖。
9. 不写版本号，不改 package.json（收尾封装时再升版）。

## 八、风险声明

1. **最大风险：OutlineWorkspace.vue 是 2800+ 行大文件**，P0-1 改 askAi + askPlainAi 两个函数。
   防护：apply_patch 逐行，改后 `rg` 确认 latestOutlineToolCallStream 零残留，G2 diff 自审。
2. **模型行为不可控**：deepseek-v4-pro 连续 tool_calls 是模型行为，我们做的是"让它可见 + 给护栏"，
   不是强制模型输出正文。P0-3 警示能缓解但不能消除该模型行为。
3. **trace 导出对账**：payloads 目录与数组不一致可能是历史文件残留，修复后旧 trace 的导出仍可能有差异，
   只对新导出生效。

---

**审核确认点：**
1. P0-1/P0-2/P0-3 方向是否正确？
2. P1-1 到 P1-5 是否遗漏？
3. P2-1 no_match 默认续聊是否同意执行？
4. 相邻入口回归选"大纲工作台 + 主页编辑器"是否够，还是也要加流水线？
