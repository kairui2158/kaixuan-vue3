import { ref } from 'vue'
import { useProviderStore } from '../stores/provider'
import { useAgentStore } from '../stores/agent'
import { useSkillStore } from '../stores/skill'
import { getAiService } from '../services/aiService'
import { classifyGenerationValidity, GENERATION_VALIDITY_MESSAGES } from '../services/generationValidity'
import { runFolderSkillTest, type FolderSkillTestResult } from '../services/folderSkillTest'
import { runFolderSkillEval, type FolderSkillEvalReport } from '../services/folderSkillEval'
import { useRunTraceStore } from '../stores/runTrace'
import { useAiCallTrace } from './useAiCallTrace'

/**
 * 技能测试 — 从旧架构_runSkillTest迁移
  * 模拟selectedText注入，测试技能输出
  */
 export function useSkillTest() {
   const testResult = ref('')
   const isTesting = ref(false)
   const testError = ref('')
   const folderTestReport = ref<FolderSkillTestResult | null>(null)
   const evalReport = ref<FolderSkillEvalReport | null>(null)
   const isEvaluating = ref(false)
   const evalError = ref('')
   
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
    const maxTokens = agent?.maxTokens || null
    const trace = useAiCallTrace({
      source: 'eval',
      stepName: '技能测试',
      mode: 'skill-test',
      providerId: provider.id,
      providerName: provider.name,
      model,
      skillNames: [skillStore.displaySkillName(skill)],
      skillMode: skill.format,
      target: { type: 'skill', id: skill.id, name: skillStore.displaySkillName(skill) }
    })
     
    isTesting.value = true
    testResult.value = ''
    testError.value = ''
    folderTestReport.value = null

    if (skill.format === 'folder' && skill.folderPath) {
      const folderAgent = agent
        ? {
            id: agent.id,
            systemPrompt: agent.systemPrompt,
            model: agent.model || model,
            temperature,
            maxTokens
          }
        : null
      let report: FolderSkillTestResult | null = null
      try {
        trace.begin()
        const aiService = await getAiService()
        const tracedAiService = {
          callAi: async (params: any) => {
            const callId = trace.beginApiCall({
              skillId: skill.id,
              skillName: skillStore.displaySkillName(skill),
              agentId: folderAgent?.id,
              providerId: provider.id,
              providerName: provider.name,
              model: params?.model || model,
              temperature: params?.temperature ?? temperature,
              maxTokens: params?.maxTokens ?? maxTokens,
              requestMessages: params?.messages || []
            })
            const startedAt = Date.now()
            try {
              const result = await aiService.callAi(params)
              trace.finishApiCall(callId, {
                status: result.text ? 'success' : 'degraded',
                responseText: result.text || '',
                reasoningText: result.reasoning || '',
                finishReason: result.finishReason,
                usage: result.usage
              }, startedAt)
              return result
            } catch (error) {
              trace.finishApiCall(callId, {
                status: 'failed',
                error: error instanceof Error ? error.message : String(error)
              }, startedAt)
              throw error
            }
          }
        }
        report = await runFolderSkillTest({
        skillId: skill.id,
        folderPath: skill.folderPath,
        input: testText,
        agent: folderAgent,
        aiService: tracedAiService
        })
      } catch (error: any) {
        testError.value = error?.message || '文件夹技能测试失败'
      } finally {
        if (trace.isRunning()) {
          if (report) {
            trace.finish(
              report.status === 'success' ? 'success' : report.status === 'degraded' ? 'degraded' : 'failed',
              report.errors[0] || undefined
            )
          } else {
            trace.fail(testError.value || '文件夹技能测试失败')
          }
        }
        isTesting.value = false
      }
      if (report) {
        folderTestReport.value = report
        if (report.status === 'success' || report.status === 'degraded') {
          testResult.value = report.output
        }
        if (report.status !== 'success' || report.errors.length > 0) {
          testError.value = report.errors[0] || `文件夹技能测试状态：${report.status}`
        }
      }
      return
    }

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
      trace.begin()
      const callId = trace.beginApiCall({
        skillId: skill.id,
        skillName: skillStore.displaySkillName(skill),
        agentId: agent?.id,
        providerId: provider.id,
        providerName: provider.name,
        model,
        temperature,
        maxTokens,
        requestMessages: messages
      })
      try {
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
        trace.finishApiCall(callId, {
          status: result.text ? 'success' : 'degraded',
          responseText: result.text || '',
          reasoningText: result.reasoning || '',
          finishReason: result.finishReason,
          usage: result.usage
        })
        testResult.value = result.text || ''
        trace.finish(result.text ? 'success' : 'degraded')
      } catch (error: any) {
        trace.finishApiCall(callId, {
          status: 'failed',
          error: error?.message || String(error)
        })
        trace.fail(error)
        throw error
      }
    } catch (e: any) {
      testError.value = e.message || '测试失败'
    } finally {
      if (!trace.isRunning() && !testError.value && !testResult.value) {
        trace.finish('failed', '技能测试未产生结果')
      }
      if (trace.isRunning()) trace.finish(testError.value ? 'failed' : 'success', testError.value || undefined)
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
    const trace = useAiCallTrace({
      source: 'eval',
      stepName: '智能体测试',
      mode: 'agent-test',
      providerId: provider.id,
      providerName: provider.name,
      model,
      target: { type: 'agent', id: agent.id, name: agent.name }
    })
     
    isTesting.value = true
    testResult.value = ''
    testError.value = ''

    try {
      const messages = [
        { role: 'system', content: agent.systemPrompt || '你是助手。' },
        { role: 'user', content: testText }
      ]
      const aiService = await getAiService()
      trace.begin()
      const callId = trace.beginApiCall({
        agentId: agent.id,
        agentName: agent.name,
        providerId: provider.id,
        providerName: provider.name,
        model,
        temperature: agent.temperature ?? 0.7,
        maxTokens: agent.maxTokens || null,
        requestMessages: messages
      })
      try {
        const result = await aiService.callAi({
          purpose: 'generate',
          messages,
          model,
          temperature: agent.temperature ?? 0.7,
          maxTokens: agent.maxTokens || null,
          stream: false,
          retry: true,
          meta: { source: 'useSkillTest.runAgentTest', agentId: agentId }
        })
        trace.finishApiCall(callId, {
          status: result.text ? 'success' : 'degraded',
          responseText: result.text || '',
          reasoningText: result.reasoning || '',
          finishReason: result.finishReason,
          usage: result.usage
        })
        testResult.value = result.text || ''
        trace.finish(result.text ? 'success' : 'degraded')
      } catch (error: any) {
        trace.finishApiCall(callId, {
          status: 'failed',
          error: error?.message || String(error)
        })
        trace.fail(error)
        throw error
      }
    } catch (e: any) {
      testError.value = e.message || '测试失败'
    } finally {
      if (trace.isRunning()) trace.finish(testError.value ? 'failed' : 'success', testError.value || undefined)
      isTesting.value = false
     }
   }

   async function runSkillEval(skillId: string) {
     const skillStore = useSkillStore()
     const providerStore = useProviderStore()
     const agentStore = useAgentStore()
     const skill = skillStore.getSkill(skillId)
     if (!skill || skill.format !== 'folder' || !skill.folderPath) {
       evalError.value = '只有 folder 技能支持评测'
       return
     }
     const provider = providerStore.activeGenerateProvider
     if (!provider || !provider.apiKey) {
       evalError.value = '未配置API供应商'
       return
     }

     const agent = agentStore.activeAgent
     const model = agent?.model || provider.models?.[0] || provider.selectedModel || ''
     const temperature = agent?.temperature ?? 0.7
    const maxTokens = agent?.maxTokens || null
     const evalAgent = agent
       ? {
           id: agent.id,
           systemPrompt: agent.systemPrompt,
           model: agent.model || model,
           temperature,
           maxTokens
         }
       : null

     isEvaluating.value = true
     evalReport.value = null
     evalError.value = ''
     const trace = useAiCallTrace({
       source: 'eval',
       stepName: '技能评测',
       mode: 'with-baseline',
       skillNames: [skillStore.displaySkillName(skill)],
       skillMode: 'folder eval',
       providerId: provider.id,
       providerName: provider.name,
       model,
       target: { type: 'skill', id: skill.id, name: skillStore.displaySkillName(skill) }
     })
     try {
       const aiService = await getAiService()
       trace.begin()
       trace.addEvent({
         type: 'eval-started',
         level: 'info',
         label: '开始 with/baseline 对照评测'
       })

       const tracedAiService = {
         callAi: async (params: any) => {
           const isBaseline = params?.meta?.source === 'folderSkillEval.baseline'
           const caseId = String(params?.meta?.caseId || '')
           const callId = trace.beginApiCall({
             skillId: isBaseline ? undefined : skill.id,
             skillName: isBaseline ? `baseline${caseId ? ` / ${caseId}` : ''}` : skillStore.displaySkillName(skill),
             agentId: evalAgent?.id,
             agentName: isBaseline ? undefined : agentStore.agents.find(item => item.id === agent?.id)?.name,
             providerId: provider.id,
             providerName: provider.name,
             model: params?.model || model,
             temperature: params?.temperature ?? temperature,
             maxTokens: params?.maxTokens ?? maxTokens,
             requestMessages: params?.messages || []
           })
           const startedAt = Date.now()
           try {
             const result = await aiService.callAi(params)
             const validity = classifyGenerationValidity({
               text: result.text,
               reasoning: result.reasoning,
               finishReason: result.finishReason,
               usage: result.usage,
               maxTokens: params?.maxTokens ?? maxTokens
             })
            trace.finishApiCall(callId, {
              status: validity.kind === 'truncated' ? 'degraded' : validity.usable ? 'success' : 'failed',
              responseText: result.text || '',
              reasoningText: result.reasoning || '',
              finishReason: result.finishReason,
              usage: result.usage,
              error: validity.usable ? undefined : GENERATION_VALIDITY_MESSAGES[validity.kind]
            }, startedAt)
             return result
           } catch (error) {
            trace.finishApiCall(callId, {
              status: 'failed',
              error: error instanceof Error ? error.message : String(error),
            }, startedAt)
             throw error
           }
         }
       }

       const report = await runFolderSkillEval({
         skillId: skill.id,
         folderPath: skill.folderPath,
         agent: evalAgent,
         aiService: tracedAiService
       })
      evalReport.value = report
      if (trace.runId) useRunTraceStore().setEvalReport(trace.runId, report)
       if (report.status !== 'success') {
         evalError.value = report.errors[0] || `技能评测状态：${report.status}`
       }
     } catch (error) {
       evalError.value = error instanceof Error ? error.message : '技能评测失败'
     } finally {
      trace.finish(evalError.value ? 'failed' : 'success', evalError.value || undefined)
       isEvaluating.value = false
     }
   }
   
   return { testResult, isTesting, testError, folderTestReport, runSkillTest, runAgentTest, evalReport, isEvaluating, evalError, runSkillEval }
 }
