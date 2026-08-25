import { ref } from 'vue'
import { useProviderStore } from '../stores/provider'
import { useAgentStore } from '../stores/agent'
import { useSkillStore } from '../stores/skill'
import { getAiService } from '../services/aiService'

/**
 * 技能测试 — 从旧架构_runSkillTest迁移
  * 模拟selectedText注入，测试技能输出
  */
 export function useSkillTest() {
   const testResult = ref('')
   const isTesting = ref(false)
   const testError = ref('')
   
   async function runSkillTest(skillId: string, testText: string = '这是一段测试文本，用于验证技能的输出效果。风吹过山岗，树叶沙沙作响，远处的山峰在夕阳下泛着金光。') {
     const skillStore = useSkillStore()
     const providerStore = useProviderStore()
     const agentStore = useAgentStore()
     
     const skill = skillStore.getSkill(skillId)
     if (!skill) {
       testError.value = '技能不存在'
       return
     }
     
     const provider = providerStore.activeGenerateProvider
     if (!provider || !provider.apiKey) {
       testError.value = '未配置API供应商'
       return
     }
     
     const agent = agentStore.activeAgent
     const model = agent?.model || provider.models?.[0] || provider.selectedModel || ''
     const temperature = agent?.temperature ?? 0.7
     const maxTokens = agent?.maxTokens || 8192
     
    isTesting.value = true
    testResult.value = ''
    testError.value = ''

   try {
     let systemContent = skill.template || '你是专业的文本处理专家。'
     const engine = (window as any).SkillExecutionEngine
     if (engine && typeof engine.resolveTemplate === 'function') {
       const ctx: Record<string, any> = {
         selectedText: testText,
         userPrompt: testText,
         outlineContent: '',
         novelTitle: '',
         prevResponse: '',
         chapterTitle: '',
         chapterSummary: '',
         prevChapterSummary: '',
         characters: '',
         chapterPlot: '',
         ...(skill.customVars || {})
       }
       try { systemContent = engine.resolveTemplate(systemContent, ctx, { keepMissing: false }) } catch (e) { /* keep raw */ }
     }
     const messages = [
       { role: 'system', content: systemContent },
       { role: 'user', content: testText }
     ]
      const aiService = await getAiService()
      const result = await aiService.callAi({
        purpose: 'generate',
        messages,
        model,
        temperature,
        maxTokens,
        stream: false,
        retry: true,
        meta: { source: 'useSkillTest.runSkillTest', skillId: skillId }
      })
      testResult.value = result.text || ''
    } catch (e: any) {
      testError.value = e.message || '测试失败'
    } finally {
       isTesting.value = false
     }
   }
   
   /** 智能体测试 — 从旧架构runAgentTest迁移 */
   async function runAgentTest(agentId: string, testText: string = '你好，请做一下自我介绍。') {
     const agentStore = useAgentStore()
     const providerStore = useProviderStore()
     
     const agent = agentStore.agents.find(a => a.id === agentId)
     if (!agent) {
       testError.value = '智能体不存在'
       return
     }
     
     const provider = providerStore.activeGenerateProvider
     if (!provider || !provider.apiKey) {
       testError.value = '未配置API供应商'
       return
     }
     
     const model = agent.model || provider.models?.[0] || provider.selectedModel || ''
     
    isTesting.value = true
    testResult.value = ''
    testError.value = ''

    try {
      const messages = [
        { role: 'system', content: agent.systemPrompt || '你是助手。' },
        { role: 'user', content: testText }
      ]
      const aiService = await getAiService()
      const result = await aiService.callAi({
        purpose: 'generate',
        messages,
        model,
        temperature: agent.temperature ?? 0.7,
        maxTokens: agent.maxTokens || 8192,
        stream: false,
        retry: true,
        meta: { source: 'useSkillTest.runAgentTest', agentId: agentId }
      })
      testResult.value = result.text || ''
    } catch (e: any) {
      testError.value = e.message || '测试失败'
    } finally {
       isTesting.value = false
     }
   }
   
   return { testResult, isTesting, testError, runSkillTest, runAgentTest }
 }
