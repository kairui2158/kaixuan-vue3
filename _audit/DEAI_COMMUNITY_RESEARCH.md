 # 降AI方法论社区深度调研报告
 
 > 调研日期: 2026-09-05
 > 调研范围: GitHub 高星项目 + 社区研究文档
 > 目的: 对比我们当前12条降AI规则与社区前沿实践，找出差距和可借鉴方案
 
 ---
 
 ## 一、调研覆盖的高价值项目
 
 | 项目 | 星标 | 核心价值 |
 |------|------|----------|
 | anti-ai-prose SKILL (majiayu000/claude-skill-registry) | - | 完整的AI文本特征审计框架，P1-P3严重度分级，密度启发式 |
 | humanize SKILL (tqnonline/agent-forge) | - | 四阶段变换系统：检测→校准→减法→验证，不是简单词表替换 |
 | unmachined text-tells (0xNyk/unmachined) | - | AI文本信号清单，含OVERCORRECTION反向检测 |
 | PortOS creative-writing-quality-engine (atomantic) | - | 对抗性质量循环，24条硬反模式，Stability Trap，伏笔台账 |
 | unslop research (MohamedAbdallah-14) | - | 深度学术研究：perplexity/burstiness/stylometric fingerprint三信号体系 |
 | shattered-sea-wiki (Thedougler) | - | 负面提示词悖论，肯定式格式约束，数学化句式约束 |
 | avoid-ai-writing (多仓库复用) | - | 社区通用AI写作特征清单，密度判据，朗读测试 |
 
 ---
 
 ## 二、社区前沿的核心认知（我们缺失的）
 
 ### 1. 三信号体系：perplexity / burstiness / stylometric fingerprint
 
 社区已形成共识：AI检测器实际依赖三个统计信号——
 - **Perplexity（困惑度）**: AI文本选词可预测性高，困惑度低；人类写作选词不可预测，困惑度高
 - **Burstiness（爆发性）**: 人类写作句长方差大（长句+短句交替），AI文本句长均匀
 - **Stylometric fingerprint（文体指纹）**: 用词频率分布、句式结构分布构成可识别指纹
 
 **我们的差距**: 我们规则2提到句长变化，但没有把burstiness作为可度量指标。社区把它当作核心度量。
 
 ### 2. 结构胜过词汇
 
 unslop研究明确结论：「机器人写作的问题在于均匀句长、干净过渡、章节收束太整齐——不在于delve这个词」。
 
 **我们的差距**: 我们的核心认知写了「同义词替换无效」，方向对。但后续规则没有充分体现这个认知——我们还是在说「不要用XX词」「不要用XX句式」。
 
 ### 3. 负面提示词悖论
 
 shattered-sea-wiki 的关键发现：负面提示词（「不要写紫色散文」）会**悖论性地增加**目标行为的出现率，因为模型在embedding空间搜索相关token。
 
 正确做法：**肯定式格式约束**（「第一句必须是具体动作」）比否定式约束（「不要以随着开头」）更有效。
 
 **我们的差距**: 我们12条全是「不要XX」「不要XX」——这本身可能正在制造问题。
 
 ### 4. OVERCORRECTION 是另一种AI信号
 
 unmachined 发现：去AI味过度后产生的「反AI腔」本身也是可检测信号——
 - 连续短句碎片（「不是X。是Y。」）= anti-slop register，本身是tell
 - 超过35%的段落以punch-line结尾 = 信号
 
 **我们的差距**: 我们的规则2说「适当插入短句」，但没有警告短句过度使用本身也是AI信号。
 
 ### 5. 密度判据，不是有无判据
 
 anti-ai-prose SKILL 的核心方法论：
 - 不是「出现delve就是AI」
 - 而是「500字内出现3次notably = AI风格堆叠」
 - 短文本（<100字）：一段内2+特征 = P1级
 
 **我们的差距**: 我们只说「不要XX」，没有量化密度阈值。
 
 ### 6. 描述-对话-描述循环
 
 HawThorne Directives 发现：AI生成的叙事有一个最差结构特征——描述→对话→描述的循环。
 每个对话回合都配等量微表情描写，形成可预测的节奏。
 
 **我们的差距**: 我们规则11提到对话不要太完整，但没提到这个结构循环问题。
 
 ### 7. Stability Trap（稳定性陷阱）
 
 PortOS 发现的一种AI叙事缺陷：AI倾向于维持情绪和节奏的稳定，不制造波动。
 对策：在draft prompt中嵌入24条硬反模式规则 + Stability Trap反制措施。
 
 **我们的差距**: 我们没有提及稳定性陷阱。
 
 ### 8. 伏笔台账：plant→payoff distance ≥ 3章
 
 PortOS 的做法：维护伏笔台账，记录埋设→回收距离，最小3章。
 
 **我们的差距**: 我们规则10提到保护伏笔，但没有量化管理机制。
 
 ### 9. 场景级未解决张力
 
 unslop/creative-writing研究：AI倾向于把每章/每场景收束得太平整。
 人类写作在场景切换时留下未解决的张力。
 
 **我们的差距**: 我们规则4说「允许段落没有结论」，但没有上升到场景级。
 
 ### 10. Voice DNA 方法
 
 unslop社区共识（Steph Pajonas等）：粘贴5篇用户作品 → 模型模仿出Claude腔；
 让模型采访用户30-50分钟 → 生成Voice DNA .md文件 → 声音跨工具存活。
 核心洞察：「品味由你拒绝什么定义，不是由你喜欢什么定义」。
 
 **我们的差距**: 我们没有声音校准机制。
 
 ### 11. 四阶段变换系统（不是一步到位）
 
 humanize SKILL 的方法论：
 - Phase 1: Detect（检测AI模式）
 - Phase 2: Calibrate（校准目标声音）
 - Phase 3a: Subtract（移除AI模式，不是简单删除而是重写上下文）
 - Phase 3b: Rewrite（用目标声音重写）
 - Phase 4: Verify（多轮验证）
 
 **我们的差距**: 我们的方法论是静态规则列表，不是动态变换流程。
 
 ### 12. 对抗性质量循环
 
 PortOS 的autonovel验证生产方法：
 - 独立judge模型评分
 - 机械式anti-slop指标惩罚分数
 - 基于删减的编辑（「编辑会删什么 = 修订计划」）
 - 比较排名替代绝对评分
 - 迭代到质量收敛，不是固定轮次
 
 **我们的差距**: 我们没有迭代验证机制。
 
 ---
 
 ## 三、逐条对比：我们的12条 vs 社区前沿
 
 | 我们的规则 | 社区对照 | 差距 |
 |-----------|---------|------|
 | 1. 直接进入主题 | avoid-ai-writing: 「In today's...」是AI词汇 |
 | 2. 句长快慢 | burstiness概念 | 缺度量；缺OVERCORRECTION警告 |
 | 3. 用具体替代抽象 | speculative gap-filling |
 | 4. 段落无结论 | 场景级未解决张力 | 停留在段落级，没上升到场景级 |
 | 5. 打破信息均匀 | 结构胜过词汇 | 语境错误：「没测过的可以不提」是技术写作语言 |
 | 6. 连接词不固定 | avoid-ai-writing: 「Furthermore」等 |
 | 7. 观点有个人判断 | Voice DNA, 第一人称视角 | 语境完全错误：小说叙述者不是博主 |
 | 8. 段落结构不统一 | 描述-对话-描述循环 | 没提到结构循环问题 |
 | 9. 不制造错误 | unmachined: 过度纠错本身是tell | 缺少过度纠错警告 |
 | 10. 小说特殊保护 | PortOS: 伏笔台账plant→payoff≥3章 | 缺量化管理 |
 | 11. 对话不完整 | HawThorne: 描述-对话-描述循环 | 缺结构循环检测 |
 | 12. 解释性从句 | avoid-ai-writing: 对话中的因果推理 | 方向正确 |
 
 ---
 
 ## 四、我们12条的具体问题诊断
 
 ### 规则3：语境错位
 
 当前示例：「AI能够有效提高内容创作效率」——这是技术评论场景。
 小说正文场景应该是：AI写「他感受到了强大的力量」时，应该改成具体动作——「他的手指不受控制地颤抖，指甲嵌入掌心，血珠从指缝渗出」。
 
 社区对照：speculative gap-filling——AI用「maintains a relatively low public profile」填充信息缺口。小说中等价物是「他似乎有些不安」「空气仿佛凝固了」这类模糊填充。
 
 ### 规则5：语境完全错误
 
 当前：「熟悉的一笔带过，有经验的多讲几段，没测过的可以不提」——这是技术评测的取舍逻辑。
 小说场景应该是：有戏剧张力的场景多写，过渡性场景可以一笔带过，但每一个场景都要有存在理由。不是「没测过就不提」，而是「没有戏剧价值的场景就不该存在」。
 
 ### 规则7：语境完全错误
 
 当前：「加入明确态度和个人经验。哪些用过？哪些没效？明确说出来」——这是评测文章的写法。
 小说叙述者不需要像博主一样表达「个人态度」。小说的「个人判断」体现为：叙述视角的选择性（什么看、什么不看）、叙述者的语气倾向（冷峻、温情、讽刺）、信息节奏的控制（什么先说、什么后说）。
 
 ---
 
 ## 五、社区揭示的我们完全缺失的规则
 
 1. **OVERCORRECTION检测**：过度去AI味本身是信号——短句碎片链、「不是X。是Y。」句式、超过35%段落以punch-line结尾
 2. **肯定式约束优于否定式**：把「不要以随着开头」改成「第一句必须是具体动作或感官细节」
 3. **密度阈值**：不是「不要用notably」而是「500字内不超过1次notably」
 4. **描述-对话-描述循环检测**：AI最差结构特征
 5. **Stability Trap**：AI维持情绪节奏稳定，不制造波动
 6. **场景级未解决张力**：段落级「无结论」要上升到场景级
 7. **节奏与情绪的关联**：紧张场景→短句密集；舒缓场景→长句铺陈
 8. **叙事视角一致性**：同一段内不该在有限/全知视角间跳转
 9. **伏笔量化管理**：plant→payoff distance ≥ 3章
 10. **朗读测试**：如果TTS能无障碍朗读，说明文本太均匀
 11. **Chatbot痕迹清除**：对话中不该出现「确实」「当然」「没问题」等助手腔
 12. **speculative gap-filling检测**：AI用模糊表述填充信息缺口（「似乎」「仿佛」「给人一种...的感觉」）
 
 ---
 
 ## 六、社区方法论层级对比
 
 | 层级 | 社区前沿 | 我们当前 |
 |------|---------|---------|
 | 信号检测 | 三信号体系（perplexity/burstiness/stylometric） | 词表+句式经验 |
 | 约束方式 | 肯定式格式约束 + 数学化句式约束 | 否定式规则列表 |
 | 判据类型 | 密度阈值（per 500 words） | 有无判据 |
 | 过度纠错 | OVERCORRECTION反向检测 | 无 |
 | 声音校准 | Voice DNA采访法 | 无 |
 | 变换流程 | 四阶段（检测→校准→减法→验证） | 单步规则注入 |
 | 质量循环 | 对抗性judge + 迭代收敛 | 无迭代验证 |
 | 伏笔管理 | 量化台账（plant→payoff ≥ 3章） | 定性保护 |
 | 结构循环 | 描述-对话-描述检测 | 无 |
 
 ---
 
 ## 七、结论与建议方向
 
 我们的12条规则在「方向」上基本正确（核心认知、句长变化、对话不完整等），但在以下三个层面有明显差距：
 
 1. **语境错位**：规则3、5、7带着技术评论/评测文章的语气，直接注入小说正文层会让模型困惑
 2. **缺失关键规则**：OVERCORRECTION检测、肯定式约束、密度阈值、描述-对话-描述循环、Stability Trap、场景级张力、节奏控制、叙事视角一致性——社区已验证这些是高ROI规则
 3. **缺少度量手段**：社区用密度阈值和burstiness方差做量化判据，我们只有「不要XX」的定性描述
 
 下一步需要讨论的是：
 - 规则3、5、7如何改成小说语境
 - 要不要新增社区已验证的缺失规则
 - 要不要把否定式约束改成肯定式约束
 - 要不要引入密度阈值
 - 方法论是保持静态规则列表还是升级为多阶段变换流程
 
 ---
 
 ## 附：调研引用源
 
 - anti-ai-prose SKILL: majiayu000/claude-skill-registry/blob/main/skills/other/anti-ai-prose/SKILL.md
 - humanize SKILL: tqnonline/agent-forge/blob/main/plugins/writing/skills/humanize/SKILL.md
 - text-tells: 0xNyk/unmachined/blob/main/references/text-tells.md
 - PortOS quality engine: atomantic/PortOS/blob/main/docs/plans/2026-07-04-creative-writing-quality-engine.md
 - unslop research: MohamedAbdallah-14/unslop/blob/main/docs/research/
 - shattered-sea-wiki: Thedougler/shattered-sea-wiki/blob/main/Enhancing AI TTRPG Adventure Writing.md
 - avoid-ai-writing: agisota/old-one, SabariKumar/claude_skills, xuweizhzhengo/skills-hub (多仓库复用)
 - HawThorne Directives: Coneja-Chibi/The-HawThorne-Directives
 - passedpost humanizer research: synysterkay/passedpost
