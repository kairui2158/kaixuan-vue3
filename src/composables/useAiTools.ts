import { ref } from 'vue'
import { useEditorStore } from '../stores/editor'
import { useProjectStore } from '../stores/project'
import { useProviderStore } from '../stores/provider'
import { useSkillStore } from '../stores/skill'
import { useAgentStore } from '../stores/agent'
import { getAiService } from '../services/aiService'
import { repairJsonText } from '../services/jsonExtraction'
import { useAiCallTrace } from './useAiCallTrace'
 
 interface AiRequestConfig {
   baseUrl: string
   apiKey: string
   model: string
   messages: Array<{ role: string; content: string }>
   temperature?: number
   maxTokens?: number | null
   stream?: boolean
   signal?: AbortSignal
   onChunk?: (text: string) => void
 }
 
 interface AiToolResult {
   success: boolean
   data?: any
   error?: string
 }
 
 /**
  * AI辅助工具 — 从旧架构renderer_v2.js迁移
  * 包含: AI起名/写作规则/时间线/批量审阅/章节修订/内联AI操作
  */
 export function useAiTools() {
   const isLoading = ref(false)
   const loadingText = ref('')
   const batchReviewResults = ref<any[]>([])
   const batchReviewAborted = ref(false)
 
  /** 底层AI请求 — 通过统一 aiService 调用；技能链逐个执行并逐条落 trace */
  async function callAi(
    prompt: string,
    systemPrompt: string,
    skillIds: string[] = [],
    options: {
      source?: 'home' | 'outline' | 'pipeline'
      stepName?: string
    } = {}
  ): Promise<string | null> {
    const providerStore = useProviderStore()
    const agentStore = useAgentStore()
    const skillStore = useSkillStore()
    const provider = providerStore.activeGenerateProvider
    if (!provider || !provider.apiKey) {
      return null
    }
    const agent = agentStore.activeAgent
    const model = agent?.model || provider.selectedModel || ''
    const temperature = agent?.temperature ?? 0.7
    const maxTokens = agent?.maxTokens || null

    const trace = useAiCallTrace({
      source: options.source || 'home',
      stepName: options.stepName || 'AI 工具调用',
      mode: skillIds.length ? 'skill-chain' : 'direct',
      projectId: useProjectStore().currentProjectId || undefined,
      projectName: useProjectStore().projectName,
      providerId: provider.id,
      providerName: provider.name,
      model,
      skillNames: skillIds.map(id => skillStore.getSkill(id)?.name).filter(Boolean) as string[]
    })
    const skills = skillIds
      .map(id => skillStore.getSkill(id))
      .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill))
    const runSkills = skills.length > 0 ? skills : [null]

    try {
      const aiService = await getAiService()
      trace.begin()
      let lastText: string | null = null
      let anySuccess = false
      for (let index = 0; index < runSkills.length; index++) {
        const skill = runSkills[index]
        const messages: Array<{ role: string; content: string }> = [
          { role: 'system', content: skill?.template || systemPrompt },
          { role: 'user', content: prompt }
        ]
        const callId = trace.beginApiCall({
          skillId: skill?.id,
          skillName: skill?.name,
          providerId: provider.id,
          providerName: provider.name,
          model,
          temperature,
          maxTokens,
          requestMessages: messages
        })
        const result = await aiService.callAi({
          purpose: 'generate',
          messages,
          model,
          temperature,
          maxTokens,
          stream: false,
          retry: true,
          meta: { source: 'useAiTools.callAi', skillId: skill?.id || 'base' }
        })
        trace.finishApiCall(callId, {
          status: result.text ? 'success' : 'degraded',
          responseText: result.text || '',
          reasoningText: result.reasoning || '',
          usage: result.usage,
          finishReason: result.finishReason
        })
        lastText = result.text || null
        if (result.text) anySuccess = true
        if (index < runSkills.length - 1) {
          trace.addEvent({
            type: 'skill-chain-step',
            level: 'info',
            label: `技能链步骤 ${index + 1}/${runSkills.length} 完成`,
            detail: `${skill?.name || '基础调用'}：${result.text ? '已返回内容' : '返回为空'}`
          })
        }
      }
      trace.finish(anySuccess ? 'success' : 'degraded')
      return lastText
    } catch (e) {
      console.error('[AiTools] callAi error:', e)
      trace.fail(e)
      return null
    }
  }
 
  /** JSON修复 — 统一走 jsonExtraction，避免各组件贪婪正则互相漂移 */
  function repairJson(text: string): any | null {
    return repairJsonText(text) as any | null
  }
 
   /** 2. 写作规则 — 从旧架构generateWritingRules迁移 (L5083) */
   async function generateWritingRules(outline: string): Promise<AiToolResult> {
     if (!outline || !outline.trim()) return { success: false, error: '请先填写大纲' }
     isLoading.value = true
     loadingText.value = '正在生成写作规则...'
     const prompt = '请分析以下小说大纲，生成一套写作规则（包括文风、节奏、视角、描写原则等）。\n' +
       '返回JSON格式: {"rules":[{"category":"分类","rule":"规则内容"}]}\n' +
       '只返回JSON。\n\n大纲：\n' + outline
     const result = await callAi(prompt, '你是专业小说编辑，擅长制定写作规范。')
     isLoading.value = false
     if (!result) return { success: false, error: '生成失败' }
     const parsed = repairJson(result)
     if (!parsed || !parsed.rules || !Array.isArray(parsed.rules)) return { success: false, error: '解析失败' }
     return { success: true, data: parsed.rules }
   }
 
   /** 3. 时间线提取 — 从旧架构extractTimeline迁移 (L5124) */
   async function extractTimeline(outline: string): Promise<AiToolResult> {
     if (!outline || !outline.trim()) return { success: false, error: '请先填写大纲' }
     isLoading.value = true
     loadingText.value = '正在提取时间线...'
     const prompt = '请从以下小说大纲中提取时间线，列出关键事件按时间顺序排列。\n' +
       '返回JSON格式: [{"time":"时间点","event":"事件描述","characters":["涉及角色"]}]\n' +
       '只返回JSON。\n\n大纲：\n' + outline
     const result = await callAi(prompt, '你是专业小说编辑，擅长时间线分析。')
     isLoading.value = false
     if (!result) return { success: false, error: '生成失败' }
     const parsed = repairJson(result)
     if (!parsed || !Array.isArray(parsed)) return { success: false, error: '解析失败' }
     return { success: true, data: parsed }
   }
 
   /** 4. 批量审阅 — 从旧架构batchReviewChapters迁移 (L5326) */
   async function batchReviewChapters(volumes: any[]): Promise<AiToolResult> {
     batchReviewAborted.value = false
     batchReviewResults.value = []
     const results: any[] = []
     let total = 0
     volumes.forEach(v => { total += (v.chapters || []).length })
     let reviewed = 0
     isLoading.value = true
     loadingText.value = '批量审阅 0/' + total + ' ...'
     for (const vol of volumes) {
       const chs = vol.chapters || []
       for (const ch of chs) {
         if (batchReviewAborted.value) {
           isLoading.value = false
           return { success: false, error: '审阅已中断' }
         }
         if (ch.body && ch.body.length > 50) {
           const prompt = '请审阅以下章节内容，指出问题（逻辑、节奏、人物一致性等），给出改进建议。\n' +
             '返回JSON: {"score":8,"issues":["问题1"],"suggestions":["建议1"]}\n' +
             '只返回JSON。\n\n标题：' + ch.title + '\n内容（前2000字）：\n' + ch.body.substring(0, 2000)
           const result = await callAi(prompt, '你是专业小说审阅编辑。')
           if (result) {
             const review = repairJson(result)
             if (review) {
               results.push({ volumeId: vol.id, chapterId: ch.id, title: ch.title, review })
             }
           }
         }
         reviewed++
         loadingText.value = '批量审阅 ' + reviewed + '/' + total + ' ...'
       }
     }
     isLoading.value = false
     batchReviewResults.value = results
     return { success: true, data: results }
   }
 
   /** 中断批量审阅 */
   function abortBatchReview() {
     batchReviewAborted.value = true
   }
 
   /** 5. 章节修订 — 从旧架构reviseChapter迁移 (L5392) */
   async function reviseChapter(title: string, content: string): Promise<AiToolResult> {
     if (!content || content.length < 50) return { success: false, error: '章节内容太短' }
     isLoading.value = true
     loadingText.value = '正在修订章节...'
     const prompt = '请修订以下章节内容，改善文笔、修正逻辑问题、增强描写。保持原有情节方向。\n' +
       '直接输出修订后的完整正文，不要输出任何说明。\n\n标题：' + title + '\n\n' + content
     const result = await callAi(prompt, '你是专业小说编辑，擅长章节修订。')
     isLoading.value = false
     if (!result) return { success: false, error: '修订失败' }
     return { success: true, data: result }
   }
 
   /** 6. 内联AI操作 — 从旧架构_aiInlineAction迁移 (L4215) */
   const inlinePrompts: Record<string, string> = {
     rewrite: '请改写以下内容，保持原意但用不同的表达方式：\n\n',
     expand: '请扩写以下内容，增加细节和描写，保持原有方向：\n\n',
     polish: '请润色以下内容，提升文笔和文学性，保持原意：\n\n',
     continue: '请续写以下内容，保持风格和方向一致：\n\n',
     condense: '请精简以下内容，去除冗余，保持核心信息：\n\n'
   }
   
   const inlineLabels: Record<string, string> = {
     rewrite: '改写', expand: '扩写', polish: '润色', continue: '续写', condense: '精简'
   }
   
   function getInlinePrompt(action: string, selectedText: string): string {
     return (inlinePrompts[action] || '请处理以下内容：\n\n') + selectedText
   }
   
  function getInlineLabel(action: string): string {
    return inlineLabels[action] || action
  }

  /** 7. 翻译 — 从旧架构apiGenerate("translate")迁移 */
  async function translateText(text: string, targetLang: string = '英文'): Promise<AiToolResult> {
    if (!text || !text.trim()) return { success: false, error: '请先选择要翻译的文本' }
    isLoading.value = true
    loadingText.value = '正在翻译为' + targetLang + '...'
    const prompt = '请将以下中文内容翻译为' + targetLang + '，保持文学风格和语气：\n\n' + text
    const result = await callAi(prompt, '你是专业文学翻译。')
    isLoading.value = false
    if (!result) return { success: false, error: '翻译失败' }
    return { success: true, data: result }
  }

  /** 8. 风格转换 — 从旧架构apiGenerate("style")迁移 */
  async function convertStyle(text: string, targetStyle: string = '古风'): Promise<AiToolResult> {
    if (!text || !text.trim()) return { success: false, error: '请先选择要转换的文本' }
    isLoading.value = true
    loadingText.value = '正在转换为' + targetStyle + '风格...'
    const prompt = '请将以下内容改写为' + targetStyle + '风格，保持情节和信息不变，只改变语言风格：\n\n' + text
    const result = await callAi(prompt, '你是专业文学创作专家，擅长多种文风。')
    isLoading.value = false
    if (!result) return { success: false, error: '风格转换失败' }
    return { success: true, data: result }
  }

  /** 9. 重新生成 — 从旧架构apiGenerate("regenerate")迁移 */
  async function regenerateContent(prompt: string, systemPrompt: string = '你是专业小说创作助手。'): Promise<AiToolResult> {
    if (!prompt || !prompt.trim()) return { success: false, error: '提示词不能为空' }
    isLoading.value = true
    loadingText.value = '正在重新生成...'
    const result = await callAi(prompt, systemPrompt)
    isLoading.value = false
    if (!result) return { success: false, error: '重新生成失败' }
    return { success: true, data: result }
  }

  /** 10. 修改 — 从旧架构apiGenerate("modify")迁移 */
  async function modifyContent(text: string, instruction: string): Promise<AiToolResult> {
    if (!text || !text.trim()) return { success: false, error: '请先选择要修改的文本' }
    if (!instruction || !instruction.trim()) return { success: false, error: '请输入修改指令' }
    isLoading.value = true
    loadingText.value = '正在按指令修改...'
    const prompt = '请按照以下指令修改文本，直接输出修改后的完整内容：\n\n修改指令：' + instruction + '\n\n原文：\n' + text
    const result = await callAi(prompt, '你是专业文本编辑。')
    isLoading.value = false
    if (!result) return { success: false, error: '修改失败' }
    return { success: true, data: result }
  }

  return {
    isLoading,
    loadingText,
    batchReviewResults,
     callAi,
     generateWritingRules,
     extractTimeline,
     batchReviewChapters,
     abortBatchReview,
     reviseChapter,
    getInlinePrompt,
    getInlineLabel,
    repairJson,
    translateText,
    convertStyle,
    regenerateContent,
    modifyContent
  }
 }
