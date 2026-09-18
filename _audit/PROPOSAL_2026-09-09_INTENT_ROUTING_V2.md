# 意图路由 V2 方案：基于语义指纹的智能技能路由

## 一、社区调研结论

### 1. LangChain/LangGraph — Tool Selection via Semantic Routing
LangChain 的 `RouteQuery` 和 `MultiPromptChain` 使用 embedding 向量余弦相似度做意图分类。每个工具/技能预先计算 embedding 向量，用户请求实时 embedding 后取余弦相似度最高的。优点是语义级匹配，不依赖关键词命中。缺点是需要 embedding 模型，依赖外部 API 调用。

### 2. Semantic Router (社区开源库)
`semantic-router` 是专门做意图路由的开源 Python 库。核心设计：
- 每个意图定义一组 "utterances"（示例语句），不是关键词
- 用 embedding 向量计算用户请求和每条示例的余弦相似度
- 取最高分意图，低于阈值则 fallback
- 支持 ACCELERATE 模式：默认 fast（关键词），高价值决策用 embed

### 3. OpenAI Function Calling / Tool Use
OpenAI 的 tool_use 协议让模型自己决定调哪个函数。模型看到函数描述后自主选择，不需要应用层做意图分类。但要求 API 支持 function calling，且用户无法干预路由结果。

### 4. Dify / Coze 等工作流平台
Dify 的意图识别节点用小模型做分类（GPT-3.5-turbo 级别），先分类再路由。Coze 用类似方案。优点是准确率高，缺点是额外 API 调用开销。

### 5. Cline / Aider 等 Agent 工具
不做意图分类，依赖用户显式选择工具。所有工具调用都需要用户确认，所以不需要自动路由。

## 二、对我们应用的适配分析

### 约束条件
1. 评估风险后经用户确认可加装依赖
2. 不能依赖 embedding API（用户可能用本地模型，无 embedding 端点）
3. 不能做额外 API 调用做意图分类（增加延迟和成本）
4. 必须在应用层完成，零外部服务依赖
5. 必须支持第三方 SKILL 不写 intents 的情况

### 可行路径
采用 Semantic Router 的简化版——"语义指纹"方案：
- 每个意图定义一组"示例语句"（而非关键词），覆盖多种表达方式
- 用 TF-IDF + Jaccard 相似度做语义匹配（不需要 embedding）
- 从 SKILL template 内容提取意图特征词，构建 SKILL 能力指纹
- 匹配时用 n-gram 而非单字命中，提高泛化能力

## 三、技术方案

### 核心改进

#### 改进1：关键词 → 语义示例语句库
原方案：每个意图配 20 个关键词，精确匹配
新方案：每个意图配 30-50 条示例语句，用 Jaccard + n-gram 相似度匹配

示例：
```typescript
const INTENT_EXAMPLES = {
  analyze: [
    '审核大纲看看缺什么',
    '从长篇小说角度检查这个大纲',
    '诊断一下当前设定有没有漏洞',
    '帮我评估一下角色弧光完整不完整',
    '审视一下这个故事引擎能不能撑住长篇',
    '找找这个大纲的问题',
    '看看我的伏笔有没有回收方向',
    '评价一下我的叙事框架',
    '这个设定有没有硬伤',
    '帮我体检一下世界观设定',
    // ... 更多
  ],
  edit: [
    '修改大纲的第三卷结构',
    '把主角的幽灵创伤补上',
    '调整一下催化事件',
    '重写角色弧光的内在需求部分',
    '帮我把叙事框架改一下',
    '补充圣萌会的道德模糊性设计',
    '精简一下第一卷的低能段',
    '修订核心张力的描述',
    '把钩子系统改强一点',
    '去掉那个多余的设定',
    // ... 更多
  ],
  generate: [
    '生成一个完整大纲',
    '写一个新的大纲',
    '创作一个废土末日故事的大纲',
    '帮我起草卷纲',
    '新建一个大纲',
    '输出一份完整的叙事框架',
    '编写第一卷的详细纲要',
    '生成全书的角色设定',
    '给我写一个新的故事引擎',
    '构思一个全新的核心张力',
    // ... 更多
  ],
  discuss: [
    '讨论一下主角应该用什么视角',
    '你觉得这个设定合理吗',
    '聊聊圣萌会作为反派的动机',
    '探讨一下叙事节奏怎么安排',
    '我对核心张力有个想法',
    '你觉得方案二好不好',
    '有什么建议可以改进这个大纲',
    '我们商量一下第二卷的走向',
    '怎么看这个角色的动机',
    '交流一下世界观的设定逻辑',
    // ... 更多
  ],
}
```

#### 改进2：精确匹配 → n-gram Jaccard 相似度
原方案：用户输入包含关键词就命中
新方案：
1. 把用户输入和示例语句都切成 bigram（2字组合）
2. 计算用户输入与每个意图示例集的 Jaccard 相似度
3. 取所有示例中最高的相似度作为该意图的得分
4. 得分最高的意图胜出，低于阈值则 fallback auto

```typescript
function bigrams(text: string): Set<string> {
  const chars = [...text]
  const grams = new Set<string>()
  for (let i = 0; i < chars.length - 1; i++) {
    grams.add(chars[i] + chars[i + 1])
  }
  return grams
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  let intersection = 0
  for (const g of a) if (b.has(g)) intersection++
  return intersection / (a.size + b.size - intersection)
}
```

#### 改进3：inferIntentsFromName → inferIntentsFromContent
原方案：只从 SKILL 名称推断意图
新方案：从 SKILL template 内容提取能力特征
1. 提取 template 前 500 字作为能力描述
2. 计算 template 内容与每个意图示例集的相似度
3. 取相似度最高的 2 个意图作为该 SKILL 的推断结果
4. 如果最高分低于阈值，fallback 为 ['generate']

```typescript
function inferIntentsFromContent(template: string, name: string): string[] {
  const templateBigrams = bigrams(template.slice(0, 500))
  const nameBigrams = bigrams(name)
  // 合并 template 和 name 的 bigram
  const combined = new Set([...templateBigrams, ...nameBigrams])

  const scores: Array<[ChainIntent, number]> = []
  for (const [intent, examples] of Object.entries(INTENT_EXAMPLES)) {
    let maxScore = 0
    for (const example of examples) {
      const score = jaccardSimilarity(combined, bigrams(example))
      if (score > maxScore) maxScore = score
    }
    scores.push([intent as ChainIntent, maxScore])
  }
  scores.sort((a, b) => b[1] - a[1])

  const result: string[] = []
  for (const [intent, score] of scores) {
    if (score > 0.15) result.push(intent)
  }
  return result.length > 0 ? result : ['generate']
}
```

#### 改进4：意图分类器升级
用户请求分类也改用 n-gram Jaccard：
1. 用户输入切 bigram
2. 对每个意图的所有示例算 Jaccard
3. 取每个意图的最高分
4. 最高分意图胜出
5. 置信度 = 最高分 / (最高分 + 次高分)，防止低质量匹配

## 四、与当前方案的对比

| 维度 | V1（当前） | V2（新方案） |
|------|------------|-------------|
| 匹配方式 | 精确关键词命中 | n-gram 语义相似度 |
| SKILL 推断 | 只看名称 | 看 template 内容 + 名称 |
| 泛化能力 | 遇到近义词失效 | bigram 级别泛化 |
| 外部依赖 | 零 | 零 |
| 准确率 | 低（精确匹配） | 中高（语义级匹配） |
| 示例库 | 每意图 20 关键词 | 每意图 30-50 条示例语句 |
| 推理成本 | O(n×k) | O(n×m×g)，n=意图数 m=示例数 g=bigram数 |

## 五、验证标准

1. **意图分类准确率**：用运行记录里的真实请求测试
   - "审核大纲缺失什么" → analyze（V1 和 V2 都通过）
   - "讨论一下主角应该用什么视角" → discuss（V1 可能命中，V2 更稳定）
   - "帮我把叙事框架改一下" → edit（V1 可能命中"改"，V2 更准确）
   - "这个故事引擎能不能撑住长篇" → analyze（V1 可能命中"检查"不命中，V2 通过语义匹配）

2. **SKILL 推断准确率**：用真实 SKILL 测试
   - S0-构思共创师（无 intents 声明）→ 推断为 discuss + generate
   - S1-大纲诊断师 → 推断为 analyze
   - S2-大纲编辑指令师 → 推断为 edit
   - S3-主编落地 → 推断为 generate

3. **fallback 行为**：
   - 无法分类时 → auto，全部 SKILL 参与运行
   - 所有 SKILL 都被过滤时 → 全部放行（安全兜底）

4. **性能**：分类耗时 < 5ms（纯内存计算，无 IO）

5. **compose 不受影响**：compose 模式不走意图过滤

## 六、不修改清单

- workspaceSkillEngine.ts 的 chain 循环结构不变
- compose 模式所有代码路径不变
- 生成流水线四层的 chain/compose 逻辑不变
- 回调系统（5个回调）不变
- chainBreakpoint / chainExecution / skillValidation / apiCallBudget 不变

## 七、实施步骤

| 步骤 | 文件 | 内容 | 验证方式 |
|------|------|------|----------|
| 1 | chainIntentRouter.ts | 重写分类器：关键词 → n-gram Jaccard 语义匹配 | 单元测试 |
| 2 | chainIntentRouter.ts | 新增 inferIntentsFromContent：从 template 内容推断意图 | 用真实 SKILL template 测试 |
| 3 | chainIntentRouter.ts | 扩充示例语句库至每意图 30+ 条 | 代码审查 |
| 4 | workspaceSkillEngine.ts | filterTemplatesByIntent 调用 inferIntentsFromContent 替代 inferIntentsFromName | 构建通过 |
| 5 | 全项目 | npm run build | 无编译错误 |
| 6 | 源应用启动 | npx electron . | 实际运行验证 |

## 八、风险评估

| 风险 | 级别 | 缓解 |
|------|------|------|
| Jaccard 阈值过高导致 fallback 过多 | 中 | 阈值设 0.15，偏低，优先召回率 |
| 示例语句覆盖不足 | 中 | 每意图 30+ 条，持续扩充 |
| template 前 500 字不代表全貌 | 低 | 后续可扩展为采样多个位置 |
| 性能 | 低 | 纯内存计算，bigram 集合大小有界 |
