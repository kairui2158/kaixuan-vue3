import type { ChainIntent } from './chainIntentRouter'

export type PhraseCorpusCategory =
  | 'editDirectives'
  | 'strongWriteActions'
  | 'weakWriteActions'
  | 'writeIntensifiers'
  | 'writeTargets'
  | 'readOnlyLocationQuestion'
  | 'readOnlyLocationRequest'
  | 'readOnlyPermissionQuestion'
  | 'readOnlyStatusQuestion'
  | 'readOnlyProhibition'
  | 'readOnlyReference'
  | 'contextualReplies'
  | 'clarificationRequests'
  | 'analyzeKeywords'
  | 'generateKeywords'
  | 'discussKeywords'

export type PhraseCorpusGroup = {
  category: PhraseCorpusCategory
  name: string
  source: string
  phrases: string[]
}

export type SaturatedPhraseEntry = {
  phrase: string
  category: PhraseCorpusCategory
  group: string
  source: string
}

export type SaturatedIntentSample = {
  input: string
  expectedIntent: Exclude<ChainIntent, 'auto'>
  source: string
  groupName: string
}

export const PHRASE_CORPUS_GROUPS: PhraseCorpusGroup[] = [
  {
    category: 'strongWriteActions',
    name: 'strong-write-actions',
    source: 'manual+roo+trace',
    phrases: ['写入', '写进', '写进去', '输入进', '输入到', '录入', '录入到', '填入', '填进', '填写到', '更新到', '同步到', '同步进', '落实到', '落进', '落盘', '保存到', '存进', '存到', '存入', '写回', '回填', '回写到', '直写', '直接写', '应用于目标', '直接应用', '执行修改', '执行方案', '按方案执行', '按刚才说的执行', '照此执行', '定稿', '敲定', '确认修改', '确认写入', '插入', '插到', '插进', '追加', '附加', '添加到', '补进', '补进去', '替换', '替换成', '重写', '删除', '删掉', '移除', '去掉', '清除掉', '誊进'],
  },
  {
    category: 'weakWriteActions',
    name: 'weak-write-actions',
    source: 'manual+writing-domain',
    phrases: ['修改', '修改一下', '改完', '改成', '改为', '改写', '调整', '修订', '修正', '润色', '精简', '压缩', '扩充', '补充', '补上', '合并', '合并成', '拆分', '拆成', '移动到', '挪到', '挪进', '上移', '下移', '置顶', '置底', '归档到', '归到', '归入', '整理到', '整理进', '誊写', '誊进去', '誊到', '接在', '接到', '接上', '缀在', '挂到', '挂在', '统一', '对齐', '校正', '理顺', '捋顺', '规范化', '标准化', '清理', '清空', '重排', '重组', '重构', '重新设定', '重新设置', '重新设计', '改强', '改弱', '加重', '减轻', '强化', '弱化'],
  },
  {
    category: 'writeIntensifiers',
    name: 'write-intensifiers',
    source: 'manual+trace',
    phrases: ['直接写入', '直接修改', '直接替换', '直接追加', '立刻写入', '立即写入', '现在写入', '马上写入', '务必写入', '必须写入', '一次性写入', '全部写入', '全都写进', '帮我写入', '请写入', '麻烦写入', '让你写入', '你来写入', '你负责写入'],
  },
  {
    category: 'writeTargets',
    name: 'write-targets',
    source: 'manual+writing-domain',
    phrases: ['编辑器', '正文', '大纲', '卷纲', '章节', '节点', '设定', '段落', '这一段', '那一段', '当前节点', '目标节点', '文档', '文稿', '稿子', '文本', '内容', '工作台', '项目', '文件', '世界观', '人物', '角色', '场景', '对话', '情节', '故事', '标题', '简介', '时间线结构', '钩子', '伏笔', '反转', '悬念', '冲突', '张力', '节奏', '人物弧光', '角色弧光', '主线', '支线'],
  },
  {
    category: 'readOnlyLocationQuestion',
    name: 'interrogative-location',
    source: 'risawoz+manual+crosswoz',
    phrases: ['在哪里', '在哪儿', '在哪', '什么地方', '什么位置', '哪个位置', '哪个地方', '哪个点', '哪一处', '哪一块', '哪部分', '哪一部分', '哪个部分', '哪个章节', '哪一章节', '哪个节', '哪一节', '哪卷', '哪一卷', '哪章', '哪一章', '哪个段落', '哪段', '哪几段', '第几段', '第几行', '第几节', '第几章', '第几卷', '第几个节点', '第几个', '哪一层', '哪一级', '哪个层级', '哪个分支', '哪个目录', '哪个板块', '哪个模块', '哪个区域', '哪个范围', '哪个区间', '哪个位置上', '哪里合适', '哪里比较合适', '哪里最合适', '哪里更好', '哪里合适一点', '放在哪里合适', '插在哪里合适', '写在哪里合适', '在哪一卷', '在哪个卷', '在哪章', '在哪个章节', '在哪个段落', '在哪一节', '在哪个位置上', '在哪一段', '在哪个范围内', '在哪个部分', '属于哪一卷', '归属于哪', '归在哪', '位置是哪', '位置在哪', '位置定在哪', '位置放哪', '位置怎么定', '落在哪', '落在哪里', '落点在哪', '坐标在哪', '层级在哪', '入口在哪', '路径在哪', '起点在哪', '终点在哪', '停在哪', '停在哪个位置', '分支在哪', '分支挂在哪', '节点归属哪', '节点位置在哪', '插到哪个位置', '插在哪个位置', '插在哪一段', '插进哪一段', '放到哪一段', '放到哪一段里', '放在哪个位置', '放在哪部分', '放进哪一段', '放进哪个节点', '塞到哪', '塞在哪', '加在哪', '加到哪', '加在哪个位置', '接在哪', '接在哪个位置', '排在哪', '排在哪个位置', '放在第几段', '放在第几节', '放在第几章', '放在第几卷', '放到第几段', '放到第几行', '归到哪一卷', '归到哪一章', '挂到哪个节点', '挂到哪一段', '挂到哪个分支', '放在上文哪里', '放在前文哪里', '放在下文哪里', '放到上下文哪里', '放在前后文哪里'],
  },
  {
    category: 'readOnlyLocationQuestion',
    name: 'structural-anchors',
    source: 'manual+writing-domain',
    phrases: ['开头', '结尾', '末尾', '前言', '引言', '序章', '楔子', '尾声', '后记', '附录', '正文开头', '正文结尾', '正文中段', '中段', '上半部分', '下半部分', '前半部分', '后半部分', '第一部分', '第二部分', '最后部分', '最前面', '最后面', '最上方', '最下方', '上方', '下方', '上面', '下面', '前面', '后面', '中间', '段落之间', '节点之间', '章节之间', '行间', '段间', '当前段落', '上一段', '下一段', '前一段', '后一段', '上文', '下文', '前文', '后文', '上下文', '前后文', '当前节点位置', '父节点', '子节点', '兄弟节点', '同级节点', '上级节点', '下级节点', '候选节点', '锚点', '插入点', '插入位置', '落点', '时间线位置'],
  },
  {
    category: 'readOnlyLocationRequest',
    name: 'location-request-verbs',
    source: 'manual+roo+crosswoz',
    phrases: ['告诉我位置', '告诉我插入点', '指出位置', '指出在哪里', '标出位置', '标记位置', '高亮位置', '高亮那段', '显示位置', '展示位置', '给我看位置', '给我看那段', '帮我找位置', '帮我定位', '帮我定位到', '帮我找一下位置', '找一下位置', '找位置', '定位到哪', '放到哪', '插到哪', '写在哪', '写在哪个', '归到哪个', '挂到哪个', '适合放在', '适合插在', '要放在', '要插在', '应该放在', '应该插在', '该放在', '该插在', '滚动到那里', '跳转到那里', '跳到那里', '光标移到', '光标放到', '光标定位', '选中那段', '展开那个节点', '打开那个节点', '帮我看看放哪', '帮我看看放哪合适', '帮我看一下放哪', '帮我看看插哪', '帮我看一下插哪', '帮我看看位置', '帮我看一下位置', '帮我找找位置', '帮我找下位置', '帮我确认位置', '帮我确认插入点', '帮我确认放哪', '麻烦你告诉我位置', '麻烦你指出位置', '麻烦你定位一下', '麻烦定位到那段', '麻烦给我看一下位置', '麻烦你看看放哪', '麻烦你看一下位置', '麻烦你标出位置', '麻烦再定位一次', '麻烦再看一下位置', '请你告诉我位置', '请你指出位置', '请帮我定位', '请定位到那段', '给我找一下位置', '给我定位一下', '给我指出位置', '给我标出位置', '帮我圈出来', '圈出那段', '圈出位置', '划到那段', '滚到那段', '滚到位置', '定位到对应位置', '定位到相关位置', '定位到那段', '定位到那个节点', '定位到目标段落', '定位到目标节点', '定位到附近上下文', '带我看那段', '带我看位置', '看一下那一段', '看看那段', '看看当前位置', '看一下上下文', '看看前后文', '看一眼位置', '告诉我插入点在哪里', '指出这段应该放的位置', '指出候选位置', '标出目标段落', '标出目标位置', '高亮建议插入的位置', '显示这段应该放的地方', '展示目标节点', '帮我找一下这句话的位置', '应该放的位置', '滚动到建议位置', '跳转到目标节点', '光标放到建议插入点', '选中建议修改的那段', '展开目标节点', '打开章节节点', '打开那个章节节点', '帮我看看这段放哪合适', '帮我看一下插入点', '麻烦你告诉我这段该放哪', '请定位到相关段落', '给我指出候选位置', '帮我圈出建议插入的那段', '给我看这段的上下文', '看看这段的前后文', '放在开头还是', '放在结尾还是', '放在引言还是', '放在正文还是', '放在第几段最合适', '放在哪合适'],
  },
  {
    category: 'readOnlyPermissionQuestion',
    name: 'permission-questions',
    source: 'trace+manual+crosswoz',
    phrases: ['有没有写入权限', '有没有权限', '有权限吗', '有写入权限吗', '能不能写', '可不可以写', '可以写吗', '允许写吗', '允许修改吗', '被授权了吗', '你有权限吗', '你能写吗', '你可以写进编辑器吗', '编辑器可写吗', '现在能不能写入', '是否可写', '是否允许写入', '有没有编辑权', '有没有修改权', '能直接写吗', '可以直写吗', '允许直写吗', '支持直写吗', '能不能直写', '可不可以直写', '你有写入能力吗', '你能改编辑器吗', '你可以修改吗', '你被允许写入吗', '写入被允许吗', '修改被允许吗', '现在能写吗', '现在可以写吗', '现在能不能改', '现在可以改吗', '你有写入功能吗', '你能改文档吗', '你能改正文吗', '你能改大纲吗', '你可以改编辑器吗', '你可以写正文吗', '你可以写大纲吗', '你会写入吗', '你支持写入吗', '你支持修改吗', '你具备写入能力吗', '你具备修改能力吗', '是否具备写入权限', '是否具备修改权限', '是否支持写入', '是否支持修改', '有没有直写权限', '有没有编辑权限', '有没有文档权限', '有没有修改资格', '能不能编辑', '可不可以编辑', '允许编辑吗', '可以编辑吗', '支持编辑吗', '能不能改内容', '可不可以改内容', '能不能动正文', '可不可以动正文', '能不能动大纲', '可不可以动大纲', '能不能落盘', '可不可以落盘', '能不能回填', '可不可以回填', '能不能同步', '可不可以同步', '你有写入权限啊', '你有写入权限么', '你有写入权限吗', '你有直写权限吗', '你能直接写编辑器吗'],
  },
  {
    category: 'readOnlyStatusQuestion',
    name: 'status-questions',
    source: 'trace+manual+crosswoz',
    phrases: ['写了吗', '写入了没', '写入了吗', '写进去没', '写进去了吗', '改好了吗', '改完了吗', '保存了吗', '保存了没', '生效了吗', '完成了吗', '好了吗', '搞定了吗', '处理了吗', '执行了吗', '落盘了吗', '同步了吗', '更新了吗', '应用了吗', '回填了吗', '有没有写进去', '写没写', '改没改', '改了没有', '现在到哪一步', '现在什么状态', '进行到哪了', '还差什么', '卡住了吗', '还在跑吗', '还在写吗', '还在生成吗', '为什么没写入', '为什么没改', '为什么失败', '为什么没生效', '为什么不动', '出错了吗', '报错了吗', '失败了吗', '什么时候写', '什么时候改', '什么时候能好', '什么时候能写完', '还要多久', '多久能完成', '写入了啊', '写入了呀', '写入了么', '写进去啊', '写进去呀', '写进去么', '改完啊', '改完呀', '改完么', '改好了没', '改好了啊', '改好了呀', '保存了啊', '保存了呀', '保存了么', '落盘了没', '落盘了啊', '落盘了呀', '同步了没', '同步了啊', '同步了呀', '更新了没', '更新了啊', '更新了呀', '应用了没', '应用了啊', '应用了呀', '回填了没', '回填了啊', '回填了呀', '生效了没', '生效了啊', '生效了呀', '执行了没', '执行了啊', '执行了呀', '处理了没', '处理了啊', '处理了呀', '到第几步了', '走到哪一步了', '走到哪了', '推进到哪了', '进行到哪一步', '进度到哪了', '进度怎么样', '当前状态是什么', '当前到哪了', '现在跑到哪', '现在处理到哪', '还没写吗', '还没改吗', '还没保存吗', '还没生效吗', '是不是没写入', '是不是没改', '是不是失败了', '是不是卡住了', '是不是还在跑', '是不是出错了', '有没有报错', '有没有异常', '结果出来了吗', '结果有了吗', '正文出来了吗', '大纲出来了吗', '修改出来了吗', '还需要多久', '还剩多久', '什么时候保存', '什么时候同步', '什么时候落盘', '什么时候回填', '什么时候生效'],
  },
  {
    category: 'readOnlyProhibition',
    name: 'prohibition-rollback',
    source: 'manual+risawoz+crosswoz',
    phrases: ['先不写', '先别写', '先不要写', '先别改', '先不要改', '先不动', '先别动', '暂时不写', '暂时别写', '现在先不写', '先别保存', '先别提交', '先别应用', '先别执行', '先放着', '先保留', '不要动', '别动', '别改', '不要改', '不用改', '不用写', '无需写入', '保持原样', '保持不变', '维持现状', '只讨论', '只聊', '只分析', '只看不改', '只看方案', '只给方案', '先给方案', '先给建议', '先别直接写', '先不要直接写', '等确认再写', '等我确认', '让我看看再写', '我先想想', '我先考虑一下', '撤回', '撤销', '回滚', '恢复原样', '还原', '退回上一版', '恢复到之前', '取消刚才的修改', '取消写入', '不要这次修改', '作废刚才的方案', '先不用了', '先不需要', '暂时不需要', '暂时先不用', '这轮不用写', '这次不用写', '这次先不改', '本轮不改', '本轮不写', '现在不要动', '先不要动正文', '先不要动大纲', '先不要动编辑器', '先放着不动', '先放着不改', '先保留原文', '先保留原样', '先保持现状', '先维持现状', '先不落盘', '先不保存', '先不同步', '先不回填', '先不应用', '先不执行', '先不直接写', '先不直写', '暂时不要写', '暂时不要改', '暂时别动', '暂时保持', '暂时维持', '等一下再写', '等一下再改', '等我看过再写', '等我看清再改', '等我确认再说', '等我确认后再写', '先讨论完再写', '先讨论完再改', '先聊清楚再写', '先想清楚再写', '先别急着写', '先别急着改', '别急着写', '别急着改', '不用急着写', '不用急着改', '别自动写', '不要自动写', '不要自作主张写', '别擅自写', '不要擅自写', '别擅自改', '不要擅自改', '撤销写入', '撤销修改', '撤销刚才的修改', '回滚刚才的修改', '回滚这次写入', '恢复到上一版', '恢复到修改前', '还原到之前', '退回上一版本', '取消刚才的写入', '取消刚才的改动', '这次写入作废', '这次修改作废', '不要这次写入'],
  },
  {
    category: 'readOnlyReference',
    name: 'request-reference',
    source: 'risawoz+manual+crosswoz',
    phrases: ['给我参考', '给我建议', '给个建议', '给点建议', '给我思路', '给个思路', '给几个选项', '给我几个方案', '给我几个选择', '给我示范', '给我示例', '给我例子', '给我模板', '给我样例', '给我草稿', '给我初稿', '给我一版', '给我看一版', '先出一版', '先出文案', '先出方案', '先列方案', '先列选项', '先列出来', '列个清单', '列出来给我看', '比较一下', '对比一下', '帮我比较', '帮我对比', '哪个更好', '哪个更合适', '哪个合适', '哪个比较好', '你推荐哪个', '你倾向哪个', '给我意见', '给点意见', '有什么建议', '有什么想法', '你觉得呢', '你的观点是什么', '你的判断是什么', '你认为呢', '说说你的看法', '推荐一下', '推荐一个', '推荐一款', '推荐几个', '推荐个', '推荐下', '给我推荐', '帮我推荐', '麻烦推荐', '麻烦给我推荐', '请你推荐', '再推荐一下', '再给我推荐', '再帮我推荐', '再推荐几个', '多推荐几个', '推荐几个选项', '推荐几个方案', '推荐一版', '推荐成稿', '推荐写法', '帮我梳理一下', '帮我梳理下', '帮我整理一下', '帮我整理下', '帮我归纳一下', '帮我归纳下', '帮我总结一下', '帮我总结下', '帮我们梳理一下', '帮我们整理一下', '帮我们看看', '帮我分析分析', '帮我评估一下', '帮我看看哪个好', '帮我选一下', '帮我挑一下', '帮我选一个写法', '哪一版更适合这一卷', '哪个写法更贴近主线', '帮我取舍一下', '帮我看看怎么处理', '帮我看看怎么改', '麻烦你分析一下', '麻烦你评估一下', '麻烦你给建议', '麻烦再给几个选项', '请给我建议', '请你给个判断', '麻烦给个结论', '给我一个结论', '给个结论', '给我一个选择', '给个选择', '给我一个判断', '给个判断', '给我一个推荐', '给个推荐', '给我一份清单', '给一份对比', '给我一张对比表', '给我一份对比表', '做个对比', '做一下对比', '横向比较', '纵向比较', '两边对比', '几个方案对比', '方案A和方案B哪个好', '哪一版更好', '哪一版更合适', '哪个版本更好', '哪个写法更好', '哪个更适合这个故事', '更适合哪一卷', '更适合哪个节点', '哪个更贴近主线', '哪个风险更低', '给我一点建议', '给我几个选项', '再推荐一版', '再出一版', '再来一版', '先出两版文案', '先列三个方案', '推荐几个可选方案', '给我理由', '说明理由', '解释理由', '说明思路', '给我演示一下', '演示一下', '看看效果', '看效果', '改完后什么样', '怎么埋', '如何埋'],
  },
  {
    category: 'readOnlyReference',
    name: 'how-to-questions',
    source: 'manual+writing-domain',
    phrases: ['怎么写', '如何写', '怎么改', '如何改', '怎么处理', '如何处理', '怎么安排', '如何安排', '怎么设计', '如何设计', '怎么说', '如何表达', '怎么表述', '怎么组织', '如何组织', '怎么展开', '如何展开', '怎么衔接', '如何衔接', '怎么过渡', '如何过渡', '怎么铺垫', '如何铺垫', '怎么收尾', '如何收尾', '怎么埋伏笔', '如何埋伏笔', '怎么回收伏笔', '如何回收伏笔', '怎么塑造', '如何塑造', '怎么刻画', '如何刻画', '怎么命名', '如何命名', '怎么取舍', '如何取舍', '怎么平衡', '如何平衡', '怎么控制节奏', '如何控制节奏', '怎么分配篇幅', '如何分配篇幅', '怎么设置悬念', '如何设置悬念', '怎么写对话', '如何写对话', '怎么写场景', '如何写场景', '怎么写这段过渡', '如何埋这个伏笔', '怎么改这段对话', '怎么安排这一卷的节奏', '如何设计这个反转', '这段怎么收尾', '如何衔接前后文', '怎么处理这个设定', '怎么组织信息', '如何组织信息', '怎么控制', '如何控制', '怎么分配', '如何分配', '怎么开头', '如何开头', '怎么结尾', '如何结尾', '怎么压缩', '如何压缩', '怎么扩写', '如何扩写'],
  },
  {
    category: 'readOnlyReference',
    name: 'preview-and-explain',
    source: 'manual+roo+coig-cqia-zhihu',
    phrases: ['解释一下', '说明一下', '讲一下', '给我讲讲', '给我说说', '给我解释', '展开讲讲', '具体说说', '详细说说', '举个例子', '举个例', '给我演示', '给我模拟', '预览一下', '给我预览', '展示一下', '给我展示', '给我看看效果', '给我看效果', '给我看成稿', '给我看正文', '给我看修改后的样子', '修改后会怎样', '改完是什么样', '写出来是什么样', '效果如何', '效果怎么样', '会变成什么样', '会是什么效果', '改成什么样', '写出来大概什么样', '给我看最终版', '给我看定稿', '给我看结果', '给我看输出', '给我看成文', '说明一下原因', '说明一下理由', '解释一下原因', '解释一下理由', '解释一下区别', '说明一下区别', '解释一下逻辑', '解释一下判断依据', '讲讲依据', '讲讲理由', '说说理由', '说说依据', '说说原因', '说一下思路', '说一下理由', '讲清楚一点', '说清楚一点', '再解释一下', '再说明一下', '再讲讲', '再说说', '详细解释', '详细说明', '具体解释', '具体说明', '展开解释', '展开说明', '通俗解释', '用大白话解释', '举个例子说明', '举例说明', '给个例子说明', '给我看一下理由', '给我看判断依据', '给我看对比理由', '演示一下效果', '模拟一下结果', '预演一下', '先看效果', '先看结果', '先看成稿', '展示修改后效果', '展示改写效果', '展示最终效果', '展示输出结果', '解释一下这个设定', '说明一下你的思路', '解释一下你的理由', '先看修改后的效果', '演示一下改写效果', '展示最终输出', '给我看正文结果', '预览一下修改后的效果', '给我看看成稿'],
  },
  {
    category: 'contextualReplies',
    name: 'affirmative',
    source: 'risawoz+manual',
    phrases: ['好', '好的', '好啊', '好呀', '行', '行啊', '行吧', '可以', '可以啊', '嗯', '嗯嗯', '对', '对啊', '是', '是的', '没错', '同意', '同意了', '可以了', '没问题', 'OK', 'ok', '嗯呢', '哦哦', '噢噢', '明白了', '知道了', '懂了', '了解了', '收到', '辛苦了', '谢谢', '谢谢你', '感谢', '非常感谢', '明白了，谢谢', '清楚了'],
  },
  {
    category: 'contextualReplies',
    name: 'continuation',
    source: 'manual+trace',
    phrases: ['继续', '继续吧', '接着', '接着来', '接着写', '接着改', '按刚才说的', '照刚才说的', '就按这个', '就这样', '按你说的', '照你说的', '听你的', '先这样', '就这样吧', '先到这', '今天先这样', '再来一次', '再试一次', '重新来', '重来', '再继续', '继续执行', '接着执行', '继续写', '继续改', '继续生成', '接着生成', '继续讨论', '接着聊'],
  },
  {
    category: 'contextualReplies',
    name: 'closing',
    source: 'risawoz',
    phrases: ['再见', '拜拜', '下次见', '回见', '先这样吧', '今天到这里', '今天先到这里', '先聊到这', '先谈到这', '没有了', '暂时没有了', '没有其他问题了', '没别的了', '就这些', '先这样，谢谢', '好的再见', '谢谢再见', '感谢，再见', '辛苦了，再见', '先不聊了'],
  },
  {
    category: 'clarificationRequests',
    name: 'desire-and-preference',
    source: 'risawoz+manual',
    phrases: ['我希望', '我希望是', '我想要', '我想', '我打算', '我准备', '最好是', '最好能', '最好有', '优先', '倾向于', '更喜欢', '希望可以', '希望是', '要求是', '需求是', '目标是', '必须是', '一定要', '务必', '尽量', '尽可能', '大概', '大约', '左右', '例如', '比如', '像是', '如果', '假如', '要是', '万一', '除非', '不过', '但是', '我更倾向', '我更倾向于', '我偏向', '我偏向于', '我更喜欢这个', '我更想', '我比较想', '我比较倾向', '我个人倾向', '我个人更喜欢', '我想的是', '我要的是', '我需要的是', '我希望得到', '我希望看到', '我希望先', '我希望后', '我希望保持', '我希望避免', '我希望突出', '我希望弱化', '我期待', '我偏好', '我偏好是', '我打算先', '我准备先', '我倾向于先', '最好先', '最好后', '最好放在', '最好插在', '最好是保留', '最好别动', '优先保留', '优先突出', '优先处理', '优先级是', '侧重点是', '重点是', '核心是', '主线是', '前提条件是', '限制条件是', '硬性要求是', '硬约束是', '风格要求是', '字数要求是', '结构要求是', '人物要求是', '设定要求是', '时间线要求是'],
  },
  {
    category: 'clarificationRequests',
    name: 'interrogative-modal',
    source: 'risawoz+manual',
    phrases: ['能不能', '可不可以', '可否', '能否', '可以吗', '行吗', '好吗', '有没有', '是不是', '对不对', '要不要', '需不需要', '用不用', '该不该', '应不应该', '会不会', '行不行', '成不成', '够不够', '值不值', '合不合适', '适不适合', '有没有必要', '有必要吗', '能行吗', '成吗', '中不中', '中吗', '好不好的', '行不行的', '能不能够', '可不可以啊', '能不能呀', '可以不可以', '是否', '能否直接写', '能否直接改', '能否先给方案', '能否先别写', '能不能先别写', '能不能先别改', '可不可以先别写', '可不可以先别改', '能不能只讨论', '可不可以只讨论', '能不能只分析', '可不可以只分析', '能不能只看', '可不可以只看', '能不能先说明', '可不可以先说明', '能不能先解释', '可不可以先解释', '能不能先展示', '可不可以先展示', '能不能给理由', '能不能给依据', '能不能举个例子', '能不能说明白', '能不能讲清楚', '能不能确认', '能不能定位', '能不能指出位置', '能不能标出位置', '能不能滚动到那段', '能不能跳到那段', '能否定位到那段', '能否标出位置', '能否展示上下文', '能否先展示效果'],
  },
  {
    category: 'clarificationRequests',
    name: 'discourse-continuation',
    source: 'risawoz+manual+coig-cqia-zhihu',
    phrases: ['另外', '还有', '顺便', '对了', '然后', '下一步', '接下来', '这次', '这轮', '上一轮', '刚才', '前面说的', '之前说的', '上次说的', '再问一下', '再确认一下', '补充一下', '补充一点', '我想补充', '我想确认', '确认一下', '明确一下', '说明一下背景', '背景是', '前提是', '约束是', '限制是', '范围是', '场景是', '还有一点', '还有个问题', '还有一个疑问', '还有一件事', '补充个条件', '补充个约束', '补充背景', '再补充一下', '再说明一点', '再确认一件事', '再问个问题', '再请教一下', '接着刚才说', '接着上面说', '接着这个话题', '延续刚才的讨论', '延续上一轮', '沿着刚才的思路', '在这个基础上', '基于刚才的结论', '根据前面说的', '结合上文', '结合刚才的讨论', '回到刚才的问题', '回到上一轮', '回到主线', '回到正题', '换个角度问', '换个说法', '反过来说', '换个问法', '继续这个话题', '继续这个思路', '下一步该做什么', '接下来怎么处理', '接下来怎么办', '然后呢', '之后呢', '后续呢', '后续怎么处理', '这个问题之后', '刚才那点说完后', '补充一个前提'],
  },
  {
    category: 'analyzeKeywords',
    name: 'analyze',
    source: 'manual+trace',
    phrases: ['排查', '复核', '审视', '审查', '检查', '体检', '诊断', '评估', '评审', '找问题', '挑毛病', '找漏洞', '找矛盾', '找冲突', '找断层', '找断点', '查漏', '查重', '校验', '核对', '对账', '一致性', '时间线', '逻辑', '自洽', '合理吗', '合理不', '可信吗', '成立吗', '站得住吗', '有没有问题', '有什么问题', '哪里有问题', '哪里不对', '哪里怪', '违和', '生硬', '突兀', '重复', '冗余', '啰嗦', '节奏问题', '结构问题', '人设崩', '动机不足', '逻辑硬伤', '前后矛盾', '设定冲突', '伏笔未回收', '坑没填', '填坑', '查坑', '审读', '通读', '过一遍', '把关', '挑刺', '找茬', '找bug', '找Bug', '找缺陷', '找风险', '找隐患', '评估风险', '风险评估', '检查逻辑', '检查一致性', '检查时间线', '检查设定', '检查人物', '检查结构', '检查节奏', '检查伏笔', '检查冲突', '检查重复', '检查冗余', '检查合理性', '检查完整性', '检查连贯性', '检查因果', '检查动机'],
  },
  {
    category: 'generateKeywords',
    name: 'generate',
    source: 'manual+writing-domain',
    phrases: ['起草', '写一版', '生成一版', '给一版', '来一版', '编一版', '拟一版', '撰写', '写出来', '输出', '整理成', '归纳成', '总结成', '成稿', '续写', '扩写', '展开写', '写细', '细化', '丰富', '充实', '写成正文', '写大纲', '写卷纲', '写章节', '写设定', '写人物', '写场景', '写对话', '写开头', '写结尾', '写过渡', '写桥段', '写爽点', '写伏笔', '写反转', '写高潮', '写结局', '写番外', '写简介', '写书名', '起名', '命名', '取标题', '起标题', '生成', '创作', '产出', '创建', '新建', '构思', '编写', '编一个', '写一个', '来一个', '生成一个', '创建一个', '新建一个', '写份', '写个', '出个', '来个', '拟个', '编个', '生成份', '输出一版', '输出一份', '给我写', '帮我写', '替我写', '写完整', '完整写', '全部写', '写全', '写一份', '写一篇', '出一篇', '生成一份'],
  },
  {
    category: 'discussKeywords',
    name: 'discuss',
    source: 'manual+risawoz',
    phrases: ['你觉得', '你怎么看', '怎么看', '你认为', '你的看法', '你的意见', '你的建议', '商量', '商讨', '讨论', '聊聊', '聊一聊', '探讨', '交流', '沟通', '切磋', '头脑风暴', '碰撞', '想听听', '想听你说', '我想知道你的', '我有个想法', '我有个疑问', '我有个问题', '问一下', '请教一下', '咨询一下', '说说', '谈谈', '讲讲', '你怎么理解', '你怎么认为', '有没有可能', '可不可能', '是否应该', '你觉得合适吗', '你觉得好吗', '你觉得怎么样', '你觉得如何', '你怎么考虑', '你怎么想', '你的观点', '你的思路', '你的判断', '你的评价', '你的倾向', '你更倾向', '你更喜欢', '你推荐', '你建议', '你倾向', '我们一起', '咱们一起', '我们共同', '共同讨论', '一起商量', '一起想想', '一起琢磨', '一起探讨', '我琢磨', '我思考', '我想想', '让我想想', '我考虑', '我犹豫', '我纠结', '我拿不准', '我不确定', '我怀疑', '我担心', '我怕', '我感觉', '我觉得', '你觉得对吗', '你觉得行吗', '你感觉', '你感觉呢', '你的想法', '你的见解', '你的视角', '你的角度', '从你的角度', '依你看', '依你看来', '你怎么评判', '你怎么评价', '你怎么判断', '我们来捋清楚', '捋清楚一下', '捋一捋'],
  },
]

export const SATURATED_PHRASE_ENTRIES: readonly SaturatedPhraseEntry[] =
  PHRASE_CORPUS_GROUPS.flatMap(group =>
    group.phrases.map(phrase => ({
      phrase,
      category: group.category,
      group: group.name,
      source: group.source,
    })),
  )

function buildLongestPhraseIndex(entries: readonly SaturatedPhraseEntry[]) {
  return [...entries].sort((a, b) => b.phrase.length - a.phrase.length)
}

export const SATURATED_PHRASE_INDEX: readonly SaturatedPhraseEntry[] =
  buildLongestPhraseIndex(SATURATED_PHRASE_ENTRIES)

const EXACT_MATCH_CONTEXTUAL_GROUPS = new Set([
  'affirmative',
  'continuation',
  'closing',
])

function matchesContextualReply(text: string, phrase: string): boolean {
  return text
    .split(/[,，。！!？?；;\s]+/)
    .map(segment => segment.trim())
    .some(segment => segment === phrase)
}

export function findSaturatedPhrases(
  input: string,
  categories?: readonly PhraseCorpusCategory[],
): SaturatedPhraseEntry[] {
  const text = input || ''
  const allowed = categories ? new Set(categories) : null
  const matches = new Map<string, SaturatedPhraseEntry>()
  for (const entry of SATURATED_PHRASE_INDEX) {
    if (allowed && !allowed.has(entry.category)) continue
    const requiresExactMatch =
      entry.category === 'contextualReplies' &&
      EXACT_MATCH_CONTEXTUAL_GROUPS.has(entry.group)
    if (requiresExactMatch ? !matchesContextualReply(text, entry.phrase) : !text.includes(entry.phrase))
      continue
    const existing = matches.get(entry.phrase)
    if (!existing || entry.phrase.length >= existing.phrase.length) {
      matches.set(entry.phrase, entry)
    }
  }
  return [...matches.values()]
}

export const SATURATED_INTENT_SAMPLES: readonly SaturatedIntentSample[] = [
  { groupName: 'trace-2026-09-19-routing-regression', source: 'trace:2026-09-19', expectedIntent: 'edit', input: '把钩子改强一点' },
  { groupName: 'trace-2026-09-19-routing-regression', source: 'trace:2026-09-19', expectedIntent: 'edit', input: '第一卷的钩子需要重新设定' },
  { groupName: 'trace-2026-09-19-routing-regression', source: 'trace:2026-09-19', expectedIntent: 'discuss', input: '解释一下第一卷钩子的设计目的' },
  { groupName: 'trace-2026-09-19-routing-regression', source: 'trace:2026-09-19', expectedIntent: 'discuss', input: '大纲里的第一卷钩子需要重新设定吗' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把这段设定插入第三段' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把讨论结果写进编辑器' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '现在把前面两轮确定的内容输入进编辑器' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '帮我把这段大纲同步到当前节点' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '将方案A落实到正文' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把这段补充到角色设定里' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把时间线统一一下并写回大纲' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把这两段合并成一段' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把多余的支线删掉' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把开头重写得更抓人' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把这段对话替换成更自然的版本' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把这个设定移动到世界观节点下' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把这段挪到下一章' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把伏笔位置上移两段' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把这条设定归档到附录' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把刚才的方案直接应用到编辑器' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '按刚才讨论的内容更新到编辑器' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把确定的部分先保存到文档' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把这版定稿' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把方案B敲定并写入' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把修改确认并回填' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把这段追加到结尾' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把新设定添加到设定库' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把这段删掉' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把重复的设定去掉' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把这段压缩到三百字以内并写回' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把这段扩充后再同步' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把这段润色后保存' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把这两节合并' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把这一卷拆成三卷' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把节点重构成三幕结构' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把这段整理到设定卡' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把草稿誊进正文' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把这句话接在上一段后面' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把新设定缀在结尾' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把这条线索挂在第二卷下' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把时间线对齐后写回' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把人物关系理顺并保存' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把术语统一成中文' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '把格式标准化后落盘' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '直接写入编辑器' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '直接修改第三段' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '直接替换这段对话' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '直接追加一段过渡' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '立刻把结果写入正文' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '马上把这段保存到节点' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '务必把修改写入文档' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '一次性把三段全部写入' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '请把这段插入当前光标位置' },
  { groupName: 'explicit-write', source: 'manual:write-matrix + trace:2026-09-17', expectedIntent: 'edit', input: '麻烦把结果回填到大纲' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '这段设定写在哪里合适' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '插入点在哪里' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '这个内容应该放在哪个节点' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '这段应该插在第几段' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '这段放在开头还是结尾' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '这条设定归到哪个章节' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '这个伏笔挂在哪一卷' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '这段对话放在什么位置' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '这个人物介绍放在哪一部分' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '这段背景放在引言还是正文' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '帮我定位这句话' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '告诉我插入点在哪里' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '指出这段应该放的位置' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '标出目标段落' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '高亮建议插入的位置' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '显示这段应该放的地方' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '展示目标节点' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '给我看那段上下文' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '帮我找一下这句话的位置' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '找一下这段在哪个节点' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '定位到哪一段' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '这句应该放到哪' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '这段要插在哪' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '这段写在哪一节' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '这个设定归到哪一块' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '这段挂在哪个分支' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '适合放在哪里' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '适合插在哪里' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '应该放在第几章' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '应该插在第几节' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '该放在开头吗' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '该插在结尾吗' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '滚动到建议位置' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '跳转到目标节点' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '光标放到建议插入点' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '选中建议修改的那段' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '展开目标节点看看' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '打开那个章节节点' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '上一段说了什么' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '下一段要接什么' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '这段设定放在哪一卷更合适' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '这条线索应该挂到哪个节点' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '帮我看看这段放哪合适' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '帮我看一下插入点' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '麻烦你告诉我这段该放哪' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '麻烦你标出目标位置' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '请定位到相关段落' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '给我指出候选位置' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '帮我圈出建议插入的那段' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '能不能标出这段的位置' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '可不可以滚动到目标段落' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '能否定位到那个节点' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '给我看这段的上下文' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '看看这段的前后文' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '这段落在哪一节' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '这个伏笔的锚点在哪' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '这条设定归在哪一卷' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '放在第几段最合适' },
  { groupName: 'location-consult', source: 'manual:location-matrix + risawoz:Request', expectedIntent: 'discuss', input: '插在哪个位置最好' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '你写入编辑器了么' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '你有写入权限啊，为什么说没有呢' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '有没有写入权限' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '你能直接写编辑器吗' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '现在能不能写入' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '编辑器可写吗' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '允许修改吗' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '你被授权了吗' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '写入了吗' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '写进去没' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '改好了吗' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '保存了吗' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '生效了吗' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '完成了吗' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '还在写吗' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '为什么没写入' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '为什么没生效' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '什么时候能写完' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '现在到哪一步了' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '卡住了吗' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '先不写，只给方案' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '先别改，我想再看看' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '暂时不要动这段' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '保持原样' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '只讨论，不要写' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '只看不改' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '等我确认再写' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '让我先想想' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '撤销刚才的修改' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '回滚到上一版' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '你有直写权限吗' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '能不能动正文' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '可不可以编辑大纲' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '是否支持写入' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '写入了吗，我看不到变化' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '同步了吗' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '落盘了吗' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '结果出来了吗' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '是不是卡住了' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '先不用写了' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '暂时不需要改' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '这次先不要写入' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '先别急着写' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '别自动写' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '不要擅自改' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '先保留原文' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '等我看清再改' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '撤销这次写入' },
  { groupName: 'status-permission-prohibition', source: 'trace:2026-09-17 + manual:status-matrix', expectedIntent: 'discuss', input: '恢复到修改前' },
  { groupName: 'permission-write-composite', source: 'trace:2026-09-17 direct-write regression', expectedIntent: 'edit', input: '那你试着把修改一下大纲编辑器里的内容来验证你有没有写入权限， 你现在在第一行大纲总纲后面随意加几个字' },
  { groupName: 'permission-write-composite', source: 'trace:2026-09-17 direct-write regression', expectedIntent: 'edit', input: '那你试着改一下来验证你有没有写入权限' },
  { groupName: 'permission-write-composite', source: 'trace:2026-09-17 direct-write regression', expectedIntent: 'edit', input: '在第一行后面随意加几个字' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '给我几个选项' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '先出两版文案' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '给我一点建议' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '给个思路' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '给我看一版' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '出一版给我参考' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '先列三个方案' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '比较一下这两种写法' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '哪个更合适' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '你推荐哪个' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '怎么写这段过渡' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '如何埋这个伏笔' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '怎么改这段对话' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '怎么安排这一卷的节奏' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '如何设计这个反转' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '这段怎么收尾' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '如何衔接前后文' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '解释一下这个设定' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '说明一下你的思路' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '举个例子' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '给我演示一下' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '预览一下修改后的效果' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '给我看看成稿' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '修改后会怎样' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '改完是什么样' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '效果怎么样' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '给我看最终版' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '给我看结果' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '你怎么看这个设定' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '你觉得哪个更好' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '推荐几个可选方案' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '再推荐一版' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '帮我梳理一下时间线' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '帮我对比这两个版本' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '帮我选一个写法' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '麻烦给个结论' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '给我一份对比表' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '哪一版更适合这一卷' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '哪个写法更贴近主线' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '解释一下你的理由' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '说明一下判断依据' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '用大白话解释' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '详细说明区别' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '再讲讲理由' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '举例说明一下' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '先看修改后的效果' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '演示一下改写效果' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '展示最终输出' },
  { groupName: 'reference-request', source: 'manual:reference-matrix + risawoz:Request', expectedIntent: 'discuss', input: '给我看正文结果' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '我希望这段更克制一点' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '我想要更强的悬念' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '最好能保留原句的味道' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '能不能先不改动主线' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '可不可以给我两个方案' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '有没有更稳的写法' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '是不是应该放在第二卷' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '要不要加一个过渡段' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '会不会破坏时间线' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '行不行这样处理' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '另外还有一个小问题' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '对了，顺便问一下' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '接着刚才的话题' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '然后我们聊下一卷' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '好的，按你说的继续' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '继续，先不改' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '嗯，就这样' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '清楚了，谢谢' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '再见' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '先这样，今天到这' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '我更倾向于保留原句' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '我要的是更克制的写法' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '重点是主线不要跑偏' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '硬约束是时间线不能变' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '能不能只分析不写入' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '可不可以先说明理由' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '能否先展示上下文' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '还有个疑问' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '补充一个前提' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '再确认一件事' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '接着上一轮说' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '在这个基础上继续' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '回到刚才的问题' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '然后呢' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '后续怎么处理' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '好的，先不改' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '行，只看方案' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '明白了，谢谢' },
  { groupName: 'clarification-contextual', source: 'risawoz:Inform/General + manual', expectedIntent: 'discuss', input: '辛苦了，先到这里' },
]
