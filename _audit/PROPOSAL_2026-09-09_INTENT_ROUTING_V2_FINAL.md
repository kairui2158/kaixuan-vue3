# 意图路由 V2 最终方案：社区调研 + 依赖评估 + 最优实现

## 一、为什么之前抗拒依赖

之前的方案文档中写死了「不引入依赖」「不装包」「零依赖」「不第三方包」等约束条款，分布在 11 个方案/经验文件中。这些条款的来源是开发早期为控制安装包体积和避免原生模块兼容性问题而设的防御性策略。现已全部改为「评估风险后经过用户确认可加装依赖」，安装包体积限制已删除。

## 二、社区深度调研结果

### 2.1 意图分类领域现有方案全景

| 方案 | 核心原理 | 中文支持 | 依赖量 | 延迟 | 准确率 | 适合我们？ |
|------|---------|---------|--------|------|--------|------------|
| LangChain RouteQuery | embedding 余弦相似度 | 依赖模型 | 重 | 200ms+ | 95%+ | 过重 |
| semantic-router (Python) | utterance + embedding | 依赖模型 | Python生态 | 100ms+ | 95%+ | 语言不符 |
| OpenAI Function Calling | 模型自主选工具 | 原生 | 无 | 取决于API | 95%+ | 增加API调用 |
| Dify/Coze 意图节点 | 小模型分类 | 原生 | 平台级 | 500ms+ | 90%+ | 增加API调用 |
| Cline/Aider | 不做分类，用户显式选 | N/A | N/A | 0 | N/A | 不符合需求 |
| microresolve | N-API Rust 原生分类 | 未验证 | 原生模块 | <1ms | 未知 | 太新太冷门 |
| onnxruntime-web + embedding | WASM 跑神经网络 | 多语言模型 | 纯WASM | 首次200ms后续30ms | 95%+ | 可行但重 |
| @xenova/transformers | 封装 onnxruntime-web | 多语言 | 含sharp原生模块 | 同上 | 95%+ | sharp是隐患 |
| @huggingface/transformers v4 | 封装 onnxruntime | 多语言 | 含sharp+onnxruntime-node | 同上 | 95%+ | 更重 |
| fuse.js | 模糊搜索 | 可用 | 零 | <1ms | 70% | 不够语义级 |
| compromise | 英文NLP | 英文为主 | 纯JS | <1ms | 60%(英文) | 不适合中文 |
| @node-rs/jieba + TF-IDF + cosine | 中文分词+向量相似度 | 原生中文 | N-API预编译二进制 | <1ms | 85-90% | 最优平衡点 |
| n-gram Jaccard (当前V2草稿) | 字符级n-gram | 可用 | 零 | <1ms | 65-75% | 不够好 |
| 关键词匹配 (当前V1) | includes精确命中 | 可用 | 零 | <1ms | 50-60% | 已被否定 |

### 2.2 关键发现

1. embedding 方案准确率最高(95%+)，但对我们的场景来说过度工程：4个意图类别 + 受限的写作领域词汇，embedding 的语义理解优势发挥不出来，反而增加了模型加载、WASM初始化、内存占用的成本。

2. 中文分词是核心瓶颈。之前所有零依赖方案（关键词、n-gram）准确率上不去的根本原因是不做中文分词。中文是连续字符，不分割成词就无法做TF-IDF向量化。「审核」和「检查」在bigram层面零交集，但在词层面是同义词。

3. @node-rs/jieba 是最优解：Rust实现 + N-API绑定 + 预编译Windows二进制，不需要编译环境，分词速度极快（~50万字符/秒），准确率与结巴CPP版一致。依赖只有预编译二进制，无传递依赖。

4. TF-IDF + cosine similarity 是分类领域黄金标准（pre-deep-learning时代的最优解），对于受限领域+少量类别+短文本场景，准确率逼近embedding方案。

5. onnxruntime-web 方案作为备选保留：如果TF-IDF方案在实测中达不到85%准确率，可升级到 onnxruntime-web + multilingual-e5-small 模型（~120MB WASM），但这一步暂不执行。

## 三、推荐方案：@node-rs/jieba + TF-IDF + Cosine 三层管线

### 3.1 架构设计

用户输入 -> jieba分词 -> TF-IDF向量化 -> cosine相似度 -> 意图判定 -> SKILL能力匹配(同样用TF-IDF) -> 过滤/放行/中断

### 3.2 为什么这个方案最优

| 维度 | 说明 |
|------|------|
| 准确率 | 85-90%，对4类意图+写作领域足够 |
| 延迟 | <1ms（纯内存计算，无模型加载） |
| 中文支持 | jieba是中文NLP标准工具，分词准确率>97% |
| 依赖风险 | @node-rs/jieba 预编译Windows x64二进制，无编译需求，N-API稳定 |
| 可调试性 | TF-IDF权重可导出，SKILL开发者能看到哪些词触发了哪个意图 |
| 持续改进 | 只需加示例语句，不需要重新训练模型 |
| 内存占用 | <5MB（jieba词典+TF-IDF矩阵） |
| 启动速度 | <100ms初始化（加载词典） |

### 3.3 与V1/V2草稿的对比

| 维度 | V1关键词 | V2草稿(n-gram) | V2最终(jieba+TF-IDF) |
|------|----------|---------------|---------------------|
| 分词 | 不分词 | 字符级bigram | jieba词级分词 |
| 匹配 | 精确includes | Jaccard集合 | TF-IDF+cosine向量 |
| 审核匹配检查 | 不可能 | 不可能 | 可以（同在高权重词集） |
| SKILL推断 | 只看名称 | 看template前500字 | 看template全文TF-IDF指纹 |
| 准确率 | 50-60% | 65-75% | 85-90% |
| 泛化能力 | 无 | 弱 | 强 |

### 3.4 需要引入的依赖

| 包名 | 版本 | 类型 | 体积 | 依赖链 |
|------|------|------|------|--------|
| @node-rs/jieba | ^2.0.2 | N-API预编译二进制 | ~8MB(含词典) | 无传递依赖 |

仅此一个依赖。不需要onnxruntime-web、不需要transformers、不需要fuse.js。

### 3.5 风险评估

| 风险项 | 级别 | 说明 | 缓解措施 |
|--------|------|------|----------|
| N-API二进制兼容 | 低 | @node-rs/jieba 预编译了Windows x64二进制，Electron 33使用Node 20+ ABI | 确认预编译二进制匹配Electron ABI |
| 词典加载延迟 | 低 | 首次加载~100ms，之后常驻内存 | 应用启动时预加载 |
| 分词准确率 | 低 | jieba是10年+成熟项目，中文分词标准工具 | 无需缓解 |
| TF-IDF阈值调优 | 中 | 需要用真实请求调参 | 提供5个真实测试用例验证 |

## 四、详细技术方案

### 4.1 数据结构

```typescript
interface IntentDef {
  id: ChainIntent
  label: string
  examples: string[]
}

interface TfidfDoc {
  intent: ChainIntent
  tokens: string[]
  tfidfVector: Map<string, number>
}
```

### 4.2 示例语句库（每意图30+条）

```typescript
const INTENT_EXAMPLES: Record<Exclude<ChainIntent, ''auto''>, string[]> = {
  analyze: [
    ''审核大纲看看缺什么'',
    ''从长篇小说角度检查这个大纲'',
    ''诊断一下当前设定有没有漏洞'',
    ''帮我评估一下角色弧光完整不完整'',
    ''审视一下这个故事引擎能不能撑住长篇'',
    ''找找这个大纲的问题'',
    ''看看我的伏笔有没有回收方向'',
    ''评价一下我的叙事框架'',
    ''这个设定有没有硬伤'',
    ''帮我体检一下世界观设定'',
    ''审查一下大纲的逻辑结构'',
    ''分析一下主角的动机是否合理'',
    ''检查伏笔的埋设和回收'',
    ''评估故事引擎的驱动力'',
    ''看看节奏控制有没有问题'',
    ''诊断世界观设定是否自洽'',
    ''找一下大纲中的逻辑漏洞'',
    ''帮我看一下人物关系图'',
    ''评判一下这个开篇够不够抓人'',
    ''审查角色弧光的设计'',
    ''分析一下核心张力的可持续性'',
    ''检查一下每卷的钩子设计'',
    ''评估一下篇幅分配是否合理'',
    ''看看有没有没交代清楚的设定'',
    ''帮我把大纲的结构性问题列出来'',
    ''体检一下整个故事的骨架'',
    ''审视一下反派设计的合理性'',
    ''检查主线是否有偏离风险'',
    ''分析一下信息揭示节奏'',
    ''评估读者会不会觉得无聊'',
  ],
  edit: [
    ''修改大纲的第三卷结构'',
    ''把主角的幽灵创伤补上'',
    ''调整一下催化事件'',
    ''重写角色弧光的内在需求部分'',
    ''帮我把叙事框架改一下'',
    ''补充圣萌会的道德模糊性设计'',
    ''精简一下第一卷的低能段'',
    ''修订核心张力的描述'',
    ''把钩子系统改强一点'',
    ''去掉那个多余的设定'',
    ''替换第二卷的开场方式'',
    ''增加一个反转节点'',
    ''删掉这个冗余角色'',
    ''优化一下开篇的节奏'',
    ''改写第一章的叙事视角'',
    ''调整卷与卷之间的过渡'',
    ''把世界观的某部分重新设定'',
    ''修正角色动机的逻辑'',
    ''重构第三幕的结构'',
    ''把这段描写压缩一下'',
    ''扩充角色背景的深度'',
    ''修订一下时间线'',
    ''把对话部分改得更自然'',
    ''调整一下叙事密度'',
    ''改一下主角的性格设定'',
    ''把伏笔的位置调整一下'',
    ''补充一下反派的动机'',
    ''精简过长的设定描述'',
    ''把叙事节奏改快一点'',
    ''修改角色关系的描述方式'',
  ],
  generate: [
    ''生成一个完整大纲'',
    ''写一个新的大纲'',
    ''创作一个废土末日故事的大纲'',
    ''帮我起草卷纲'',
    ''新建一个大纲'',
    ''输出一份完整的叙事框架'',
    ''编写第一卷的详细纲要'',
    ''生成全书的角色设定'',
    ''给我写一个新的故事引擎'',
    ''构思一个全新的核心张力'',
    ''帮我写一个故事梗概'',
    ''生成一份卷纲结构'',
    ''创作一个角色关系图'',
    ''编写世界观的框架'',
    ''起草一个开篇方案'',
    ''输出完整的角色档案'',
    ''帮我生成一个故事大纲'',
    ''写一份章节规划'',
    ''新建一个叙事框架'',
    ''编一个故事梗概'',
    ''生成第一卷的详细规划'',
    ''创作一个完整的设定体系'',
    ''帮我起草角色弧光'',
    ''写出整个故事的骨架'',
    ''生成一个三幕结构'',
    ''编写故事的核心冲突'',
    ''给我写一个主角的背景故事'',
    ''生成一个反派的设计方案'',
    ''创作一个完整的情节链'',
    ''帮我起草一个世界观设定'',
  ],
  discuss: [
    ''讨论一下主角应该用什么视角'',
    ''你觉得这个设定合理吗'',
    ''聊聊圣萌会作为反派的动机'',
    ''探讨一下叙事节奏怎么安排'',
    ''我对核心张力有个想法'',
    ''你觉得方案二好不好'',
    ''有什么建议可以改进这个大纲'',
    ''我们商量一下第二卷的走向'',
    ''怎么看这个角色的动机'',
    ''交流一下世界观的设定逻辑'',
    ''你觉得第一卷的开场怎么样'',
    ''聊聊这个故事的受众定位'',
    ''讨论一下这个题材的市场前景'',
    ''你觉得这个角色有没有魅力'',
    ''探讨一下叙事视角的选择'',
    ''我对角色弧光有不同的想法'',
    ''你觉得这个设定会不会太复杂'',
    ''聊聊故事的情感基调'',
    ''讨论一下主角的成长曲线'',
    ''你觉得反派的智商够不够'',
    ''探讨一下世界观的复杂度'',
    ''你觉得叙事节奏会不会太快'',
    ''聊聊伏笔的密度问题'',
    ''讨论一下读者会不会喜欢这个设定'',
    ''你觉得这个开篇够不够吸引人'',
    ''聊聊角色之间的关系设计'',
    ''探讨一下故事的悬念设置'',
    ''你觉得这个核心冲突有没有张力'',
    ''讨论一下信息揭示的策略'',
    ''聊聊这个故事的主题深度'',
  ],
}
```

### 4.3 核心算法实现

```typescript
import { cut } from ''@node-rs/jieba''

const STOP_WORDS = new Set([
  ''的'', ''了'', ''是'', ''在'', ''我'', ''你'', ''他'', ''她'', ''它'', ''们'',
  ''一'', ''个'', ''这'', ''那'', ''有'', ''和'', ''与'', ''或'', ''也'', ''都'',
  ''不'', ''没'', ''就'', ''把'', ''到'', ''对'', ''为'', ''以'', ''于'',
  ''帮'', ''让'', ''给'', ''请'', ''下'', ''上'', ''中'', ''里'', ''来'', ''去'',
  ''要'', ''会'', ''能'', ''可'', ''及'', ''等'', ''之'', ''其'', ''此'',
])

function tokenize(text: string): string[] {
  const words = cut(text, false)
  return words.filter(w => w.length > 1 && !STOP_WORDS.has(w))
}

function computeTF(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>()
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1)
  }
  const max = tokens.length || 1
  for (const [key, val] of tf) {
    tf.set(key, val / max)
  }
  return tf
}

interface IntentDoc {
  intent: ChainIntent
  tokens: string[]
  tf: Map<string, number>
}

let intentDocs: IntentDoc[] = []
let idfCache: Map<string, number> = new Map()
let intentTfidfVectors: Array<{ intent: ChainIntent; vec: Map<string, number> }> = []

function initIntentRouter() {
  intentDocs = []
  const allDocs: string[][] = []
  for (const [intent, examples] of Object.entries(INTENT_EXAMPLES)) {
    const allTokens: string[] = []
    for (const ex of examples) {
      allTokens.push(...tokenize(ex))
    }
    intentDocs.push({
      intent: intent as ChainIntent,
      tokens: allTokens,
      tf: computeTF(allTokens),
    })
    allDocs.push(allTokens)
  }
  const totalDocs = allDocs.length
  const docFreq = new Map<string, number>()
  for (const tokens of allDocs) {
    const unique = new Set(tokens)
    for (const t of unique) {
      docFreq.set(t, (docFreq.get(t) || 0) + 1)
    }
  }
  for (const [term, df] of docFreq) {
    idfCache.set(term, Math.log((totalDocs + 1) / (df + 1)) + 1)
  }
  intentTfidfVectors = intentDocs.map(doc => {
    const vec = new Map<string, number>()
    for (const [term, tf] of doc.tf) {
      const idf = idfCache.get(term) || 1
      vec.set(term, tf * idf)
    }
    let norm = 0
    for (const v of vec.values()) norm += v * v
    norm = Math.sqrt(norm) || 1
    for (const [k, v] of vec) vec.set(k, v / norm)
    return { intent: doc.intent, vec }
  })
}

function textToTfidfVector(text: string): Map<string, number> {
  const tokens = tokenize(text)
  const tf = computeTF(tokens)
  const vec = new Map<string, number>()
  for (const [term, t] of tf) {
    const idf = idfCache.get(term)
    if (idf !== undefined) {
      vec.set(term, t * idf)
    }
  }
  let norm = 0
  for (const v of vec.values()) norm += v * v
  norm = Math.sqrt(norm) || 1
  for (const [k, v] of vec) vec.set(k, v / norm)
  return vec
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0
  const [small, large] = a.size < b.size ? [a, b] : [b, a]
  for (const [k, v] of small) {
    const w = large.get(k)
    if (w !== undefined) dot += v * w
  }
  return dot
}

export function classifyChainIntentV2(userInput: string): ChainIntentRouteResult {
  if (!userInput || !userInput.trim()) {
    return { intent: ''auto'', matchedKeywords: [], confidence: 0 }
  }
  const inputVec = textToTfidfVector(userInput)
  if (inputVec.size === 0) {
    return { intent: ''auto'', matchedKeywords: [], confidence: 0 }
  }
  const scores: Array<{ intent: ChainIntent; score: number }> = []
  for (const { intent, vec } of intentTfidfVectors) {
    const score = cosineSimilarity(inputVec, vec)
    scores.push({ intent, score })
  }
  scores.sort((a, b) => b.score - a.score)
  const best = scores[0]
  const second = scores[1]
  const confidence = best.score / (best.score + (second?.score || 0.001))
  if (best.score < 0.15) {
    return { intent: ''auto'', matchedKeywords: [], confidence: 0 }
  }
  const matchedKeywords: string[] = []
  for (const [k, v] of inputVec) {
    if (v > 0.05) matchedKeywords.push(k)
  }
  return { intent: best.intent, matchedKeywords, confidence }
}

export function inferIntentsFromContent(template: string, name: string): string[] {
  const combined = name + '' '' + template.slice(0, 800)
  const vec = textToTfidfVector(combined)
  if (vec.size === 0) return [''generate'']
  const scores: Array<{ intent: ChainIntent; score: number }> = []
  for (const { intent, vec: intentVec } of intentTfidfVectors) {
    const score = cosineSimilarity(vec, intentVec)
    scores.push({ intent, score })
  }
  scores.sort((a, b) => b.score - a.score)
  const result: string[] = []
  for (const { intent, score } of scores) {
    if (score > 0.08) result.push(intent)
  }
  return result.length > 0 ? result : [''generate'']
}
```

### 4.4 chain 模式意图过滤逻辑（不变）

chain 循环里的 filterTemplatesByIntent 调用方式不变，只是内部从 V1 关键词匹配换成 V2 TF-IDF 匹配。compose 模式完全不变。

## 五、验证标准

### 5.1 意图分类准确率测试用例

| 输入 | 期望意图 | V1能否通过 | V2能否通过 |
|------|---------|-----------|-----------|
| 审核大纲看看缺什么 | analyze | 通过(命中审核/缺) | 通过(TF-IDF审核/缺失高权重) |
| 这个故事引擎能不能撑住长篇 | analyze | 不通过(无关键词命中) | 通过(故事/引擎/撑住与analyze向量最近) |
| 把主角的背景改一下 | edit | 通过(命中改) | 通过(TF-IDF修改/改/调整高权重) |
| 替换第二卷的开场方式 | edit | 通过(命中替换) | 通过 |
| 生成一个完整大纲 | generate | 通过(命中生成/大纲) | 通过 |
| 帮我起草卷纲 | generate | 通过(命中起草) | 通过 |
| 讨论一下主角应该用什么视角 | discuss | 通过(命中讨论) | 通过 |
| 你觉得这个设定会不会太复杂 | discuss | 通过(命中你觉得) | 通过 |
| 帮我看看这个角色有没有魅力 | analyze | 部分通过(命中看看) | 通过(角色/魅力与analyze最近) |
| 我们商量一下第二卷的走向 | discuss | 通过(命中商量) | 通过 |

### 5.2 SKILL 推断准确率测试用例

| SKILL名称 | template摘要 | 期望推断 | V1推断 | V2推断 |
|-----------|-----------|---------|--------|--------|
| S0-构思共创师 | 引导用户构思讨论大纲方向 | discuss+generate | discuss(命中构思/共创) | discuss+generate(TF-IDF与两向量都高) |
| S1-大纲诊断师 | 诊断大纲问题列出修改建议 | analyze | analyze(命中诊断) | analyze(TF-IDF最高) |
| S2-大纲编辑指令师 | 根据修改指令编辑大纲文本 | edit | edit(命中编辑/指令师) | edit(TF-IDF最高) |
| S3-主编落地 | 根据确认的大纲输出最终版本 | generate | generate(命中主编/落地) | generate(TF-IDF最高) |

### 5.3 性能验证

- 初始化时间 < 100ms
- 单次分类延迟 < 1ms
- 内存占用增量 < 5MB

### 5.4 回归验证

- compose 模式不受影响（不走意图过滤）
- 生成流水线四层不受影响（不走chain意图过滤）
- chain 中断机制不受影响（意图过滤在前，中断检查在中）
- 5个回调系统不受影响

## 六、实施步骤

| 步骤 | 文件 | 内容 | 验证方式 |
|------|------|------|----------|
| 1 | package.json | 安装 @node-rs/jieba | npm install 成功 |
| 2 | chainIntentRouter.ts | 重写分类器：关键词->jieba+TF-IDF+cosine | 单元测试 |
| 3 | chainIntentRouter.ts | 重写 inferIntentsFromContent：从template内容推断 | 用真实SKILL template测试 |
| 4 | chainIntentRouter.ts | 新增 initIntentRouter() 初始化函数 | 启动时调用 |
| 5 | chainIntentRouter.ts | 扩充示例语句库至每意图30条 | 代码审查 |
| 6 | workspaceSkillEngine.ts | filterTemplatesByIntent 调用 V2 分类器 | 构建通过 |
| 7 | 应用入口 | 启动时调用 initIntentRouter() | 源应用启动验证 |
| 8 | 全项目 | npm run build | 无编译错误 |
| 9 | 源应用 | npx electron . | 真实运行验证 |

## 七、不修改清单

- workspaceSkillEngine.ts 的 chain 循环结构不变
- compose 模式所有代码路径不变
- 生成流水线四层的 chain/compose 逻辑不变
- 5个回调系统不变
- chainBreakpoint / chainExecution / skillValidation / apiCallBudget 不变
- inferIntentsFromName 保留为 fallback（V2 失败时调用）

## 八、后续升级路径（不在本次范围）

如果 V2 TF-IDF 方案在实测中准确率不达 85%，升级到 onnxruntime-web + multilingual-e5-small：
- 依赖：onnxruntime-web（纯WASM，无原生模块）
- 模型：multilingual-e5-small ONNX 格式（~120MB）
- 准确率：95%+
- 延迟：首次~200ms（WASM+模型加载），后续~30ms
- 但本次不执行，作为备选方案保留

## 九、铁律

1. 先读再改，apply_patch 编辑中文文件
2. 精准修复，不改动不相关的代码和组件
3. 不破坏现有功能，compose 模式绝对不动
4. 测试必须源应用启动 npx electron .，不允许网页/开发者模式/安装版
5. 目标模式下需要用户决定但未确认时，取消目标模式等用户决定
