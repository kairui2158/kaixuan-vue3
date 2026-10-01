import type { ChainIntent } from './chainIntentRouter'

export type ChainIntentEvalExpectation =
  | Exclude<ChainIntent, 'auto'>
  | 'no_match'
  | 'ambiguous'

export type ChainIntentEvalSample = {
  input: string
  expected: ChainIntentEvalExpectation
  source: string
  note?: string
}

export type ChainIntentEvalSplit = 'train' | 'dev' | 'test'

// Phase 1 holdout set. Inputs come from real user traces; expectations are
// labeled from user intent, not from the router's historical output.
export const HOLDOUT_REAL_TRACE_SAMPLES: readonly ChainIntentEvalSample[] = [
  { input: '大纲里的第一卷钩子需要重新设定', expected: 'edit', source: 'trace-2026-09-19-042658', note: 'historical router returned no_match/no-keyword-overlap' },
  { input: '钩子二沈萤的脚踝我设计的是一次性伤害，不是永久残疾，这点要先说清楚', expected: 'discuss', source: 'trace-2026-09-19-042658', note: 'author explains existing design; historical router returned no_match' },
  { input: '你把大纲内编辑器叙事里第一卷的补充钩子和我讨论一下', expected: 'discuss', source: 'trace-2026-09-19-042658', note: 'historical router returned edit' },
  { input: '你不要按钩子已有的思路走啊，可以打破重组，或者整体替换', expected: 'discuss', source: 'trace-2026-09-19-042658', note: 'discussion framing; historical router returned edit' },
  { input: '我们现在来讨论一下钩子的问题', expected: 'discuss', source: 'trace-2026-09-19-042658' },
  { input: '统一大纲时间线', expected: 'edit', source: 'trace-2026-09-16-204057', note: 'long-document tool-loop scenario' },
  { input: '我们现在需要把整个大纲的时间线统一梳理一遍', expected: 'edit', source: 'trace-2026-09-16-204057' },
  { input: '把沈萤脚踝这条伏笔的后续影响补进第二卷', expected: 'edit', source: 'trace-2026-09-17-200242' },
  { input: '第一卷开篇的吸引力我不太满意', expected: 'edit', source: 'trace-2026-09-19-220827' },
  { input: '开篇那个抓人的地方要再强化', expected: 'edit', source: 'trace-2026-09-19-220827' },
  { input: '这段设定应该放在哪个节点？', expected: 'discuss', source: 'trace-2026-09-17-200242' },
  { input: '插入点在哪里？', expected: 'discuss', source: 'trace-2026-09-17-200242' },
  { input: '你现在有写入权限么？', expected: 'discuss', source: 'trace-2026-09-17-200242' },
  { input: '你写入编辑器了么？', expected: 'discuss', source: 'trace-2026-09-17-200242' },
  { input: '同意你的修改，你按实际位置写入', expected: 'edit', source: 'trace-2026-09-17-200242' },
  { input: '那你试着把修改一下大纲编辑器里的内容来验证你有没有写入权限', expected: 'edit', source: 'trace-2026-09-17-200242' },
  { input: '先把这个设定录入编辑器', expected: 'edit', source: 'trace-2026-09-17-200242' },
  { input: '把已经确定的修改同步到编辑器', expected: 'edit', source: 'trace-2026-09-17-200242' },
  { input: '你出#3的替换给我参考', expected: 'discuss', source: 'trace-2026-09-17-200242' },
  { input: '好的，按你的方案来出修改文案', expected: 'discuss', source: 'trace-2026-09-17-200242' },
  { input: '审核一下这份大纲还缺什么', expected: 'analyze', source: 'trace-2026-09-09-051203' },
  { input: '从长篇小说的角度检查这个大纲', expected: 'analyze', source: 'trace-2026-09-09-051203' },
  { input: '给第一卷生成三个备选钩子', expected: 'generate', source: 'trace-2026-09-19-042658' },
  { input: '帮我把这一卷的节奏重新排一下', expected: 'edit', source: 'trace-2026-09-18-224640' },
  { input: '这一卷的节奏你觉得有问题么', expected: 'discuss', source: 'trace-2026-09-18-224640' },
  { input: '人物弧光现在有点平，我们聊聊怎么加层次', expected: 'discuss', source: 'trace-2026-09-19-102919' },
  { input: '把人物弧光的层次落实到沈萤的成长线', expected: 'edit', source: 'trace-2026-09-19-102919' },
  { input: '继续', expected: 'ambiguous', source: 'trace-2026-09-16-204057', note: 'without context this must ask the user' },
]

// Adversarial set: paraphrases, typos, domain nouns, and mixed requests.
// These are not generated from the production phrase table.
export const ADVERSARIAL_INTENT_SAMPLES: readonly ChainIntentEvalSample[] = [
  { input: '开篇那个吸引点我不太满意', expected: 'edit', source: 'adversarial-paraphrase' },
  { input: '开头抓人的地方要再弄一下', expected: 'edit', source: 'adversarial-paraphrase' },
  { input: '第一卷钩子得重新弄', expected: 'edit', source: 'adversarial-paraphrase' },
  { input: '把开头那个亮点再打磨打磨', expected: 'edit', source: 'adversarial-paraphrase' },
  { input: '开篇钩子这块我想调整', expected: 'edit', source: 'adversarial-paraphrase' },
  { input: '第一卷新引子要重做', expected: 'edit', source: 'adversarial-paraphrase' },
  { input: '开头那个勾子不太行，改一下', expected: 'edit', source: 'adversarial-typo' },
  { input: '把开篇吸引点再强化下', expected: 'edit', source: 'adversarial-typo' },
  { input: '第一卷钩子需要重新设订', expected: 'edit', source: 'adversarial-typo' },
  { input: '沈萤的脚裸伏笔要补到第二卷', expected: 'edit', source: 'adversarial-typo' },
  { input: '时间线有点乱，先帮我捋顺', expected: 'edit', source: 'adversarial-domain' },
  { input: '伏笔清单里漏了灯塔旧信，补进去', expected: 'edit', source: 'adversarial-domain' },
  { input: '卷纲里人物弧光的衔接断了一截，修一下', expected: 'edit', source: 'adversarial-domain' },
  { input: '把第二卷的节奏点重新排', expected: 'edit', source: 'adversarial-domain' },
  { input: '这份大纲缺什么，你先审一遍', expected: 'analyze', source: 'adversarial-paraphrase' },
  { input: '帮我看看这个大纲哪里不稳', expected: 'analyze', source: 'adversarial-paraphrase' },
  { input: '从商业长篇角度挑挑毛病', expected: 'analyze', source: 'adversarial-paraphrase' },
  { input: '检查一下伏笔有没有断', expected: 'analyze', source: 'adversarial-paraphrase' },
  { input: '评估第一卷钩子的留存效果', expected: 'analyze', source: 'adversarial-paraphrase' },
  { input: '诊断一下时间线哪里冲突', expected: 'analyze', source: 'adversarial-domain' },
  { input: '给第三卷想三个可选钩子', expected: 'generate', source: 'adversarial-paraphrase' },
  { input: '帮我想一个更抓人的开篇', expected: 'generate', source: 'adversarial-paraphrase' },
  { input: '为沈萤补一段前史', expected: 'generate', source: 'adversarial-paraphrase' },
  { input: '起草第二卷的三个节点', expected: 'generate', source: 'adversarial-paraphrase' },
  { input: '扩写灯塔旧信这个设定', expected: 'generate', source: 'adversarial-domain' },
  { input: '构思一个卷末反转', expected: 'generate', source: 'adversarial-paraphrase' },
  { input: '我讲一下沈萤脚踝钩子的设计意图', expected: 'discuss', source: 'adversarial-paraphrase' },
  { input: '这个伏笔我不是要永久残疾，先说清楚', expected: 'discuss', source: 'adversarial-paraphrase' },
  { input: '你觉得第一卷钩子的问题在哪', expected: 'discuss', source: 'adversarial-paraphrase' },
  { input: '我们商量一下时间线怎么收', expected: 'discuss', source: 'adversarial-paraphrase' },
  { input: '聊聊人物弧光会不会太急', expected: 'discuss', source: 'adversarial-domain' },
  { input: '我不同意这个判断，理由是...', expected: 'discuss', source: 'adversarial-paraphrase' },
  { input: '先分析哪里有问题，然后直接把确定的错字改掉', expected: 'edit', source: 'adversarial-mixed', note: 'write action dominates the final request' },
  { input: '先审一遍，再给我一版修改后的钩子', expected: 'generate', source: 'adversarial-mixed', note: 'final deliverable is generated content' },
  { input: '聊聊这个方案，暂定不要动编辑器', expected: 'discuss', source: 'adversarial-mixed' },
  { input: '给我看看第 3 个替换方案', expected: 'discuss', source: 'adversarial-mixed' },
  { input: '能不能只讨论，不写入', expected: 'discuss', source: 'adversarial-safety' },
]

// Negative set: unrelated chat must be rejected rather than forced into a
// workspace intent, especially edit/generate.
export const NEGATIVE_INTENT_SAMPLES: readonly ChainIntentEvalSample[] = [
  { input: '今天天气怎么样', expected: 'no_match', source: 'negative-chat' },
  { input: '推荐一部电影', expected: 'no_match', source: 'negative-chat' },
  { input: '现在几点了', expected: 'no_match', source: 'negative-chat' },
  { input: '讲个笑话', expected: 'no_match', source: 'negative-chat' },
  { input: '你是谁', expected: 'no_match', source: 'negative-chat' },
  { input: '帮我订一张明天的机票', expected: 'no_match', source: 'negative-task' },
  { input: '这道数学题怎么解', expected: 'no_match', source: 'negative-task' },
  { input: '帮我写一份辞职信', expected: 'no_match', source: 'negative-task', note: 'outside novel-workshop workspace scope' },
  { input: '查一下今天的股价', expected: 'no_match', source: 'negative-task' },
  { input: '翻译一句英文', expected: 'no_match', source: 'negative-task' },
  { input: '你好', expected: 'no_match', source: 'negative-greeting' },
  { input: '在吗', expected: 'no_match', source: 'negative-greeting' },
  { input: '哈哈哈', expected: 'no_match', source: 'negative-greeting' },
  { input: '这里的电话是多少？', expected: 'discuss', source: 'GEM/RiSAWOZ:dev:Request', note: 'Bronze community sample; read-only general-domain request, safe discuss fallback' },
  { input: '这个地方的特点是什么？', expected: 'discuss', source: 'GEM/RiSAWOZ:dev:Request', note: 'Bronze community sample; read-only general-domain request, safe discuss fallback' },
  { input: '这个地方是不是坐地铁就可以到的？', expected: 'discuss', source: 'GEM/RiSAWOZ:dev:Request', note: 'Bronze community sample; read-only general-domain request, safe discuss fallback' },
  { input: '地址在什么地方？', expected: 'discuss', source: 'GEM/RiSAWOZ:dev:Request', note: 'Bronze community sample; read-only general-domain request, safe discuss fallback' },
  { input: '', expected: 'no_match', source: 'negative-empty' },
]

// Convergence-round corpus accretion. These factory-only seeds stay outside
// CHAIN_INTENT_EVAL_SPLITS and therefore never select production thresholds.
export const INTENT_FACTORY_ACCRETION_SAMPLES: readonly ChainIntentEvalSample[] = [
  { input: '把灯塔旧信的伏笔状态改成已回收', expected: 'edit', source: 'factory-accretion-r12' },
  { input: '删除第二卷里重复的旧灯塔描写', expected: 'edit', source: 'factory-accretion-r12' },
  { input: '盘点第一卷还有哪些伏笔没有回收', expected: 'analyze', source: 'factory-accretion-r12' },
  { input: '评估沈萤的人物弧光是否支撑主题', expected: 'analyze', source: 'factory-accretion-r12' },
  { input: '为灯塔旧信写三条不同走向的扩展方向', expected: 'generate', source: 'factory-accretion-r12' },
  { input: '续写沈萤在灯塔门口的第一段', expected: 'generate', source: 'factory-accretion-r12' },
  { input: '灯塔旧信这个伏笔我更倾向开放式处理，你怎么看', expected: 'discuss', source: 'factory-accretion-r12' },
  { input: '为什么你觉得第二卷中段会拖节奏', expected: 'discuss', source: 'factory-accretion-r12' },
  { input: '统一把第二卷的旧灯塔时间线改到第三章前', expected: 'edit', source: 'factory-accretion-r14' },
  { input: '把沈萤在灯塔门口的动作细节补到现有正文', expected: 'edit', source: 'factory-accretion-r14' },
  { input: '盘一盘沈萤每次离开灯塔的情绪变化', expected: 'analyze', source: 'factory-accretion-r14' },
  { input: '评估旧灯塔伏笔的回收节奏是否过密', expected: 'analyze', source: 'factory-accretion-r14' },
  { input: '写出三个沈萤重返灯塔的场景方案', expected: 'generate', source: 'factory-accretion-r14' },
  { input: '为旧灯塔结局写一段高潮前的过渡', expected: 'generate', source: 'factory-accretion-r14' },
  { input: '我怀疑旧灯塔线索提前暴露了，我们聊聊', expected: 'discuss', source: 'factory-accretion-r14' },
  { input: '你觉得沈萤对灯塔的执念是不是太重了', expected: 'discuss', source: 'factory-accretion-r14' },
  { input: '把沈萤的对外身份设定替换成灯塔管理员后代', expected: 'edit', source: 'factory-accretion-r15' },
  { input: '删掉正文里重复出现的浪声描写', expected: 'edit', source: 'factory-accretion-r15' },
  { input: '盘点第二卷到第四卷之间丢失的因果链', expected: 'analyze', source: 'factory-accretion-r15' },
  { input: '评估灯塔旧信揭露时读者的信息差是否成立', expected: 'analyze', source: 'factory-accretion-r15' },
  { input: '写两版沈萤在结局前的抉择对话', expected: 'generate', source: 'factory-accretion-r15' },
  { input: '为旧灯塔设定撰写一段前史短稿', expected: 'generate', source: 'factory-accretion-r15' },
  { input: '在第二卷结尾补一段灯塔前史短稿', expected: 'edit', source: 'factory-accretion-r15' },
  { input: '旧信晚点揭露可能更好，我拿不准，你怎么判断', expected: 'discuss', source: 'factory-accretion-r15' },
  { input: '你觉得第二卷结尾的钩子会不会太满', expected: 'discuss', source: 'factory-accretion-r15' },
  { input: '把灯塔守夜人的名字统一改成老周', expected: 'edit', source: 'factory-accretion-r17' },
  { input: '在第三章末尾追加一段沈萤收到旧信的动作', expected: 'edit', source: 'factory-accretion-r17' },
  { input: '盘一盘旧信、灯塔、沈萤三条线索的交汇点', expected: 'analyze', source: 'factory-accretion-r17' },
  { input: '评估沈萤发现旧信时的情绪是否符合前文', expected: 'analyze', source: 'factory-accretion-r17' },
  { input: '写出旧灯塔在暴风雨夜的三个场景片段', expected: 'generate', source: 'factory-accretion-r17' },
  { input: '为沈萤和守夜人的第一次对话起草两个版本', expected: 'generate', source: 'factory-accretion-r17' },
  { input: '我觉得守夜人过早暴露身份了，想听听你的判断', expected: 'discuss', source: 'factory-accretion-r17' },
  { input: '你怎么看旧信在高潮前揭露这个安排', expected: 'discuss', source: 'factory-accretion-r17' },
  { input: '把旧信的落款日期改成三年前', expected: 'edit', source: 'factory-accretion-r19' },
  { input: '删除沈萤父亲那段重复的告别描写', expected: 'edit', source: 'factory-accretion-r19' },
  { input: '盘点守夜人每次出现时的信息释放量', expected: 'analyze', source: 'factory-accretion-r19' },
  { input: '评估旧信揭露前后的情绪落差是否成立', expected: 'analyze', source: 'factory-accretion-r19' },
  { input: '写出守夜人拒绝开门时的两版心理活动', expected: 'generate', source: 'factory-accretion-r19' },
  { input: '为灯塔断裂的楼梯写一段危险场景', expected: 'generate', source: 'factory-accretion-r19' },
  { input: '我怕旧信变成万能解释，你觉得呢', expected: 'discuss', source: 'factory-accretion-r19' },
  { input: '你认为守夜人应该主动说破还是被动暴露', expected: 'discuss', source: 'factory-accretion-r19' },
  { input: '把第三章沈萤的对话顺序调整为先质问后沉默', expected: 'edit', source: 'factory-accretion-r20' },
  { input: '在守夜人首次登场处补充一盏风灯的环境细节', expected: 'edit', source: 'factory-accretion-r20' },
  { input: '复盘沈萤三次拒绝守夜人的动机是否递进', expected: 'analyze', source: 'factory-accretion-r20' },
  { input: '检查旧信、灯塔、守夜人三条线索是否有断点', expected: 'analyze', source: 'factory-accretion-r20' },
  { input: '草拟沈萤读完旧信后独白的两版措辞', expected: 'generate', source: 'factory-accretion-r20' },
  { input: '为旧灯塔停电夜写一段封闭空间冲突', expected: 'generate', source: 'factory-accretion-r20' },
  { input: '第三章把沉默用得太密了，这个度怎么把握', expected: 'discuss', source: 'factory-accretion-r20' },
  { input: '你觉得守夜人的第一句话应该主动还是回避', expected: 'discuss', source: 'factory-accretion-r20' },
]

// Deterministic split used by calibration. Train examples may seed intent
// example expansion. Dev chooses thresholds. Test is never used for selection.
export const CHAIN_INTENT_EVAL_SPLITS: Record<ChainIntentEvalSplit, readonly ChainIntentEvalSample[]> = {
  train: HOLDOUT_REAL_TRACE_SAMPLES.filter((_, index) => index % 3 === 0),
  dev: HOLDOUT_REAL_TRACE_SAMPLES.filter((_, index) => index % 3 === 1),
  test: HOLDOUT_REAL_TRACE_SAMPLES.filter((_, index) => index % 3 === 2),
}
