# 去AI味 Agent调度模式 升级方案

## 一、需求来源

第三方反馈：当前去AI味的 Agent 只是一个配置容器（存 model/temperature/systemPrompt），没有任何调度逻辑。链式执行是固定 for 循环，3 个 SKILL 串行走到底，速度慢。

第三方提出：加一个"切分+并行+拼接"模式，用 Agent 负责调度，让去AI味从串行变并行。

## 二、讨论中确认的设计决策

### 决策1：切分由本地代码做，不调 API
- 第三方原方案第一步调 API 让模型切分文章
- 我们改为本地代码切分：省一次 API 调用、零延迟、零格式解析失败风险
- 段落本身就是天然语义边界，不需要 AI 来判断在哪切

### 决策2：Agent 的价值在于"每段怎么处理"而非"怎么切"
- 切分大小：用户在 UI 填数字，本地代码执行
- Agent：控制系统提示、模型、温度——每段重述的核心引擎
- SKILL：输出约束——每段重述的方法论
- 并行调度：应用代码 Promise.all 并发，限流3个

### 决策3：切分用语义边界，不硬切字数
- 三层切分逻辑：
  1. 段落优先：按双换行符分隔段落，累积到目标字数后在段落边界断开
  2. 句号兜底：长段落内部从目标字数往后找最近的句号（。！？…）断开
  3. 容错回退：找不到句号则往前找，再找不到直接断（极端情况）

### 决策4：浮动窗口机制
- 用户填的字数是"期望值"不是"硬限制"
- 实际切分范围 = 期望值上下浮动 30%（如填1000字 → 可切区域 700-1300字）
- 在可切区域内找最近的段落边界或句号
- 找到就切，实际切口可能落在 800 字或 1100 字，由语义决定

### 决策5：并行容错
- 限制并发数最多3个（防止429）
- 每段独立 catch，失败的段落保留原文，不中断整体流程
- 不用 Promise.all（一个失败全崩），改用 Promise.allSettled 或手动实现

### 决策6：拼接还原原始排版
- 切分时记录每段之间的原始连接符（\n、\n\n、\n\n\n）
- 拼接时用原始连接符还原，不强行加 \n\n

## 三、改动范围

### 不改的部分
- 现有串行链式完全不动（用户选"串行链式"时行为跟现在一模一样）
- AgentManager 和 SkillManager 存储逻辑不动
- 硬规则处理不动
- 写作流水线（apiGenerate）不动

### 改动1：UI 加模式选择 + 切分字数输入框
位置：renderDeAiSettings（renderer_v2.js 第755行附近）

在去AI味设置面板中，硬规则开关上方新增：

```
处理模式：[串行链式 ▼]  ← 下拉选择
         选项1：串行链式（默认，现有行为）
         选项2：Agent调度（切分+并行+拼接）

切分字数：[1000]  ← 数字输入框，范围 500-3000，仅 Agent调度模式显示
```

- 选"串行链式"时：隐藏切分字数输入框，SKILL列表可配多个
- 选"Agent调度"时：显示切分字数输入框，SKILL列表只需配1个输出SKILL
- 模式选择存入 _deAiConfig.agentMode（值："chain" 或 "split-merge"）
- 切分字数存入 _deAiConfig.splitSize（值：数字，默认1000）

### 改动2：deAiProcess 加 if 分支
位置：renderer_v2.js 第548行 deAiProcess 方法开头

```javascript
async deAiProcess() {
  // ... 现有的编辑器检查、文本获取 ...

  var cfg = this._deAiConfig || { ... };

  // 分支判断
  if (cfg.agentMode === "split-merge" && cfg.skills && cfg.skills.length > 0) {
    await this._deAiSplitMerge(text, cfg, cancelController);
    return;
  }

  // ... 现有串行链式逻辑完全不动 ...
}
```

### 改动3：新增 _deAiSplitMerge 方法
位置：renderer_v2.js，deAiProcess 方法后面

核心流程：

```
async _deAiSplitMerge(text, cfg, cancelController):
    1. 获取 Agent 和 SKILL 配置
    2. 本地切分文章
    3. 并行重述（限流3个）
    4. 拼接还原
    5. 写回编辑器
```

#### 步骤1：本地切分 _splitText(text, targetSize)

输入：完整正文 + 目标字数
输出：段落数组 [{text: "段落文本", connector: "前一段和这一段之间的连接符"}]

逻辑：
```
segments = []
currentChunk = ""
currentConnector = ""
minSize = targetSize * 0.7   // 700字（目标1000时）
maxSize = targetSize * 1.3   // 1300字（目标1000时）

按 \n 分割成段落
for each 段落:
    if currentChunk字数 + 段落字数 > maxSize 且 currentChunk字数 >= minSize:
        // 达到可切区域且超上限，断开
        segments.push({text: currentChunk, connector: currentConnector})
        currentChunk = 段落
        currentConnector = "\n"
    else if currentChunk字数 >= minSize 且 段落是独立段落边界:
        // 在可切区域内遇到段落边界，主动断开
        segments.push({text: currentChunk, connector: currentConnector})
        currentChunk = 段落
        currentConnector = "\n"
    else:
        currentChunk += currentConnector + 段落
        currentConnector = "\n"

    // 长段落内部句号兜底
    if currentChunk字数 > maxSize:
        在 maxSize 后方 200 字内找最近的 。！？…\n
        找到则在此处切断，前半段加入segments
        后半段成为新的 currentChunk

// 最后一段
if currentChunk: segments.push({text: currentChunk, connector: currentConnector})
```

#### 步骤2：并行重述（限流3个）

```
maxConcurrent = 3
results = new Array(segments.length)
running = 0
completed = 0

for i in 0..segments.length:
    // 等待有空闲并发位
    while running >= maxConcurrent:
        await 等待任一完成

    running++
    // 异步发请求，不 await
    _processSegment(i)

async _processSegment(i):
    seg = segments[i]
    prompt = seg.text + "---技能约束---" + outputSkill.template
    try:
        result = await _aiRequest({
            messages: [system: agent.systemPrompt, user: prompt],
            model: agent.model,
            temperature: agent.temperature,
            maxTokens: _getAgentMaxTokens(),
            stream: true,
            signal: cancelController.signal,
            onChunk: (partial) => { 更新进度 },
            onReasoning: (rt) => { 更新进度+显示思考中 }
        })
        results[i] = result.text
    catch(e):
        results[i] = seg.text   // 失败保留原文
    finally:
        running--
        completed++
        更新进度条 = completed / segments.length
```

#### 步骤3：拼接还原

```
finalText = results[0]
for i in 1..results.length:
    finalText += segments[i].connector + results[i]
```

#### 步骤4：写回编辑器 + 关闭进度条

## 四、进度条适配

Agent调度模式的进度计算方式与串行链式不同：

- 串行链式：按步骤数均分（已实现）
- Agent调度：按已完成段数/总段数计算
  - 切分阶段：显示"正在切分文章..."，进度 0%
  - 并行阶段：每完成1段，进度 += 1/总段数 * 100%
  - 全部完成：进度 100%

进度弹窗复用现有的 deai-progress-modal，步骤列表改为显示段落数：
```
段落 1/4  ✓ 完成
段落 2/4  ◉ 执行中
段落 3/4  ○ 等待
段落 4/4  ○ 等待
```

## 五、用户体验流程

### 串行链式模式（现有，不变）
1. 设置里选"串行链式"
2. 添加多个SKILL（如白虎S1-S2-S3）
3. 点去AI味
4. 串行执行3次API调用
5. 结果写回编辑器

### Agent调度模式（新增）
1. 设置里选"Agent调度"
2. 填切分字数（如1000）
3. 添加1个输出SKILL（如白虎重述师）
4. 选Agent（控制模型/温度/系统提示）
5. 点去AI味
6. 应用自动：本地切分 → 并行重述（限流3个）→ 拼接还原
7. 结果写回编辑器
8. 进度条显示段落数完成进度

## 六、代码量估算

| 改动 | 位置 | 行数 |
|------|------|------|
| UI 模式选择+切分字数输入框 | renderer.html + renderer_v2.js renderDeAiSettings | ~30行 |
| deAiProcess if 分支 | renderer_v2.js L548 | ~5行 |
| _deAiSplitMerge 方法 | renderer_v2.js 新增 | ~80行 |
| _splitText 本地切分函数 | renderer_v2.js 新增 | ~50行 |
| 进度条适配 | renderer_v2.js _showDeAiProgress/_updateDeAiProgress | ~15行 |
| CSS（模式切换显示/隐藏） | style.css | ~10行 |
| **总计** | | **约190行** |

## 七、风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 并发触发429 | 限流3个，每段独立catch |
| 跨段上下文断裂 | 接受此代价（Agent调度模式的本质是分段独立处理） |
| 切分不均匀 | 浮动窗口30%，由语义边界决定实际切口 |
| API返回空 | 保留原文，不中断 |
| 取消操作 | AbortController 传给每个请求 |

## 八、验证计划

1. 语法检查：node --check renderer_v2.js
2. CSS花括号平衡检查
3. CDP行为验证：
   - 模式切换时UI正确显示/隐藏切分字数输入框
   - 串行链式模式行为不变
   - Agent调度模式：切分逻辑正确（分段数、段长在浮动范围内）
   - 并行执行：进度条按段落数更新
   - 失败容错：某段失败保留原文
   - 取消按钮有效
   - 拼接结果排版正确
4. 模拟真实用户测试：3500字正文 → Agent调度模式 → 验证输出完整性和排版
