import { useDeAiStore } from '../stores/deai'
import { useProviderStore } from '../stores/provider'
import { useSkillStore } from '../stores/skill'
import { useAgentStore } from '../stores/agent'
import { DeAiProcessor } from '../services/de-ai.js'
import { DeAiSamples } from '../services/deai-samples.js'
import { getAiService } from '../services/aiService'
import { routeSkill } from '../services/skillRouter'
import { createApiCallBudget } from '../services/apiCallBudget'
import { classifyGenerationValidity, GENERATION_VALIDITY_MESSAGES } from '../services/generationValidity'
import type { RealSkillAgentContext } from '../services/realSkillTypes'
import { useRunTraceStore } from '../stores/runTrace'
import { useAiCallTrace } from './useAiCallTrace'

/**
 * Renderer-process bridge for DeAI processing.
 * Calls DeAiProcessor and service layer directly, no IPC roundtrip.
 */
export function useDeAi() {
  const deAiStore = useDeAiStore()
  const providerStore = useProviderStore()
  const skillStore = useSkillStore()
  const agentStore = useAgentStore()
  const runTraceStore = useRunTraceStore()
  let deAiTrace: ReturnType<typeof useAiCallTrace> | null = null

async function callAiApi(
    systemPrompt: string,
    userText: string,
    useVerify?: boolean,
    agent?: RealSkillAgentContext | null,
    traceLabel = '去AI味 API 调用'
  ): Promise<string> {
    const purpose = useVerify ? 'verify' as const : 'rewrite' as const
    const aiService = await getAiService()
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText }
    ]
    const provider = providerStore.activeGenerateProvider
    const model = agent?.model || provider?.selectedModel || provider?.models?.[0]
    const callId = deAiTrace
      ? deAiTrace.beginApiCall({
        skillName: traceLabel,
        providerId: provider?.id,
        providerName: provider?.name,
        model,
        temperature: agent?.temperature,
        maxTokens: agent?.maxTokens,
        requestMessages: messages
      })
      : ''
    try {
      const result = await aiService.callAi({
        purpose,
        messages,
        stream: false,
        retry: true,
        model: agent?.model || undefined,
        temperature: agent?.temperature,
        maxTokens: agent?.maxTokens,
        meta: { source: 'useDeAi.callAiApi' }
      })
      if (deAiTrace && callId) {
        const traceResult = result as any
        const validity = classifyGenerationValidity({
          text: traceResult.text,
          reasoning: traceResult.reasoning,
          finishReason: traceResult.finishReason,
          usage: traceResult.usage,
          maxTokens: agent?.maxTokens
        })
        deAiTrace.finishApiCall(callId, {
          status: validity.kind === 'truncated' ? 'degraded' : validity.usable ? 'success' : 'failed',
          responseText: traceResult.text || '',
          reasoningText: traceResult.reasoning || '',
          finishReason: traceResult.finishReason,
          usage: traceResult.usage,
          error: validity.usable ? undefined : GENERATION_VALIDITY_MESSAGES[validity.kind]
        })
      }
      return result.text || ''
    } catch (e: any) {
      if (deAiTrace && callId) {
        deAiTrace.finishApiCall(callId, {
          status: 'failed',
          responseText: '',
          error: e?.message || String(e)
        })
      }
      if (e.message?.includes('未配置') || e.message?.includes('Provider')) {
        throw new Error('未配置供应商，请在设置中添加API供应商')
      }
      throw e
    }
  }

  function getSkillTemplate(skillId: string): string {
    const skill = skillStore.skills.find(s => s.id === skillId)
    return skill?.template || '你是专业的文本处理专家，请按照技能指令处理文本。只输出处理后的完整正文。'
  }

  function getAgentConfig(agentId: string | null) {
    if (!agentId) return null
    const agent = agentStore.agents.find(a => a.id === agentId)
    return agent || null
  }

  function getSkillAgentConfig(agentId: string | null): RealSkillAgentContext | null {
    const agent = getAgentConfig(agentId)
    if (!agent) return null
    return {
      id: agent.id,
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens
    }
  }

  async function runSkillStep(
    skillId: string,
    text: string,
    agentId: string | null,
    budget: ReturnType<typeof createApiCallBudget>,
    useVerify = false
  ): Promise<string> {
    const skill = skillStore.skills.find(s => s.id === skillId)
    if (!skill) return text
    const agent = getSkillAgentConfig(agentId)

    if (skill.format === 'folder' && skill.folderPath) {
      if (deAiTrace) {
        deAiTrace.addEvent({
          type: 'folder-skill-start',
          level: 'info',
          label: 'folder SKILL 开始执行',
          detail: skill.name || skill.id
        })
      }
      const result = await routeSkill(skill, {
        input: text,
        agent,
        purpose: useVerify ? 'verify' : 'rewrite',
        budget,
        skillId: skill.id
      })
      if (deAiTrace && result.mode === 'folder' && result.folderResult) {
        if (deAiTrace.runId) {
          runTraceStore.appendFolderDiagnostics(
            deAiTrace.runId,
            result.folderResult.diagnostics || []
          )
        }
      }
      if (result.mode === 'folder' && result.folderResult) {
        if (result.folderResult.status === 'degraded') {
          const warning = result.folderResult.diagnostics
            .map(item => item.message)
            .filter(Boolean)
            .join('；')
          deAiStore.updateProgress(
            Math.min(88, Math.max(1, deAiStore.progress)),
            `${skill.name || skill.id} 校验重试后降级${warning ? '：' + warning.slice(0, 120) : ''}`
          )
        }
        return result.folderResult.output
      }
      const folderError = result.folderResult?.errors?.[0] || result.fallbackReason || '文件夹技能执行失败'
      throw new Error(folderError)
    }

    const systemPrompt = [agent?.systemPrompt?.trim(), skill.template.trim()].filter(Boolean).join('\n\n')
    return await callAiApi(systemPrompt || skill.template, text, useVerify, agent, skill.name || skill.id)
  }

  function extractFirstSubject(text: string): string {
    if (!text) return ''
    const firstSentence = text.split(/[。！？\n]/)[0] || text.slice(0, 50)
    const match = firstSentence.match(/^(他|她|它|我|你|这|那|门|窗|风|雨|光|声音|脚步)/)
    return match ? match[1] : firstSentence.slice(0, 5)
  }

  function applyHardRuleMode(text: string): string {
    const startedAt = Date.now()
    if (deAiStore.hardRuleMode === 'legacy-auto') {
      const result = DeAiProcessor.processBody(text, { hardRules: deAiStore.hardRules })
      const rolledBack = result && result.text === result.originalText && result.stats?.details?.includes('完整性保护触发，已回滚原文')
      if (deAiTrace?.runId) {
        runTraceStore.attachProcessingReport(deAiTrace.runId, {
          stage: 'post',
          processor: 'hard-rules',
          status: rolledBack ? 'warning' : 'success',
          inputPreview: text.slice(0, 200),
          outputPreview: (result && result.text ? result.text : text).slice(0, 200),
          ruleHits: Object.entries(result?.stats || {}).map(([rule, count]) => ({
            rule,
            count: typeof count === 'number' ? count : 0
          })),
          issues: rolledBack
            ? [{
                level: 'warning',
                code: 'integrity-rollback',
                message: '正文完整性门禁触发，已保留原始文本',
                blocking: false
              }]
            : undefined,
          integrity: {
            paragraphCountSame: true,
            sentenceCountSame: true,
            lengthRatio: text.length ? Math.round(((result?.text || text).length / text.length) * 100) / 100 : 1,
            rolledBack: Boolean(rolledBack)
          },
          startedAt,
          endedAt: Date.now(),
          durationMs: Date.now() - startedAt
        })
      }
      return result && result.text ? result.text : text
    }

    const report = DeAiProcessor.detectBody(text, { hardRules: deAiStore.hardRules })
    deAiStore.setLastDetectReport(report)
    if (deAiTrace?.runId) {
      const blocking = report.findings.filter((item: any) => item.severity === 'blocking').length
      runTraceStore.attachProcessingReport(deAiTrace.runId, {
        stage: 'post',
        processor: 'deai',
        status: blocking > 0 ? 'warning' : 'success',
        inputPreview: text.slice(0, 200),
        outputPreview: text.slice(0, 200),
        ruleHits: report.findings.map((item: any) => ({
          rule: item.type || item.code || 'unknown',
          count: item.count || 1,
          samples: (item.samples || []).slice(0, 8)
        })),
        issues: report.findings.map((item: any) => ({
          level: item.severity === 'blocking' ? 'error' as const : 'warning' as const,
          code: item.type || item.code || 'unknown',
          message: item.message || item.summary || '',
          blocking: item.severity === 'blocking'
        })),
        integrity: {
          paragraphCountSame: true,
          sentenceCountSame: true,
          lengthRatio: 1,
          rolledBack: false
        },
        startedAt,
        endedAt: Date.now(),
        durationMs: Date.now() - startedAt
      })
    }
    return text
  }

  function recordProcessingStage(stage: string, percent: number, status: 'start' | 'done' | 'warning' = 'start') {
    deAiStore.updateProgress(percent, stage)
    deAiTrace?.addEvent({
      type: 'deai-stage',
      level: status === 'warning' ? 'warn' : 'info',
      label: '降AI阶段',
      detail: JSON.stringify({ stage, percent, status })
    })
  }

  async function runMinimalEdit(text: string): Promise<string> {
    const report = DeAiProcessor.detectBody(text, { hardRules: deAiStore.hardRules })
    deAiStore.setLastDetectReport(report)
    if (report.findings.length === 0) return text

    const spans = DeAiProcessor.extractProtectedSpans(text, {})
    const reportText = report.findings.map((item: any) =>
      `${item.type}（${item.count} 处，每千字 ${item.perKilo}）：${item.samples.join('；')}`
    ).join('\n')
    const prompt = [
      DeAiProcessor.getMinimalEditPrompt(),
      '',
      '【检测报告】',
      reportText,
      '',
      '【必须保留的人名/设定/对白】',
      spans.map((span: any) => span.value).join('\n') || '无'
    ].join('\n')
    const edited = await callAiApi(prompt, text, false, null, '降AI深度修复')
    if (!edited || edited.trim().length === 0) return text

    const spanCheck = DeAiProcessor.verifyProtectedSpans(text, edited, spans)
    if (spanCheck.mustMissing > 0) return text
    if (!DeAiProcessor.passesBodyIntegrityCheck(text, edited)) return text
    return edited
  }

  async function processChain(text: string, cfg: any): Promise<string> {
    const skills = cfg.skillIds || []
    const hardruleEnabled = cfg.hardruleEnabled !== false
    let current = text
    const totalSteps = skills.length + (hardruleEnabled ? 2 : 0)
    let stepIdx = 0

    // GATE-10: S1 runs first on original text, then hardrule, then S2
    const budget = createApiCallBudget(8)
    const agentId = cfg.agentId || null
    if (skills.length > 0) {
      recordProcessingStage('S1 rewrite', Math.round((stepIdx / totalSteps) * 100))
      let s1Input = current
      // GATE-11: style samples injected to S1 (rewrite main), not S2
      try {
        if (typeof DeAiSamples !== 'undefined') {
          const allSamples = DeAiSamples.getAll()
          const selectedSamples = allSamples.slice(0, 3)
          s1Input = '[style reference]\n' + selectedSamples.join('\n') + '\n\n--- text ---\n' + current
        }
      } catch {}
      const s1Result = await runSkillStep(skills[0], s1Input, agentId, budget)
      // first_subject_different validator: if S1 first subject matches original, retry once
      const origSubj = extractFirstSubject(text)
      const s1Subj = extractFirstSubject(s1Result)
      if (origSubj && s1Subj && origSubj === s1Subj) {
        const retryResult = await runSkillStep(skills[0], s1Input, agentId, budget)
        const retrySubj = extractFirstSubject(retryResult)
        if (retrySubj !== origSubj) {
          current = retryResult
        } else {
          current = s1Result
        }
      } else {
        current = s1Result
      }
      stepIdx++
    }

    if (hardruleEnabled) {
      recordProcessingStage('hardrule pre', Math.round((stepIdx / totalSteps) * 100))
      try {
        current = applyHardRuleMode(current)
      } catch {}
      stepIdx++
    }

    if (skills.length > 1) {
      recordProcessingStage('S2 verify', Math.round((stepIdx / totalSteps) * 100))
      const s2Result = await runSkillStep(skills[1], current, agentId, budget, true)
      current = s2Result
      stepIdx++
    }

    if (hardruleEnabled) {
      recordProcessingStage('hardrule post', Math.round((stepIdx / totalSteps) * 100))
      try {
        current = applyHardRuleMode(current)
      } catch {}
      stepIdx++
    }

    recordProcessingStage('chain complete', 88, 'done')
    return current
  }

  async function processSplitMerge(text: string, cfg: any): Promise<string> {
    const splitSize = cfg.splitSize || 1000
    const skills = cfg.skillIds || []
    const budget = createApiCallBudget(8)
    const agentId = cfg.agentId || null

    recordProcessingStage('splitting', 5)
    const segments: string[] = []
    let pos = 0
    while (pos < text.length) {
      let end = pos + splitSize
      if (end >= text.length) {
        segments.push(text.slice(pos))
        break
      }
      let breakPoint = -1
      for (let i = end; i < Math.min(end + 200, text.length); i++) {
        if (text[i] === '\n' && text[i + 1] === '\n') {
          breakPoint = i + 2
          break
        }
      }
      if (breakPoint < 0) {
        for (let i = end; i < Math.min(end + 200, text.length); i++) {
          if (text[i] === '.' || text[i] === '!' || text[i] === '?' || text[i] === '。' || text[i] === '！' || text[i] === '？') {
            breakPoint = i + 1
            break
          }
        }
      }
      if (breakPoint < 0) breakPoint = end
      segments.push(text.slice(pos, breakPoint))
      pos = breakPoint
    }

    recordProcessingStage('parallel rewrite ' + segments.length + ' segments', 10)

    const promises = segments.map((seg, i) => {
      return runSkillStep(skills[0], seg, agentId, budget).then(result => {
        recordProcessingStage(
          'rewrite segment ' + (i + 1) + '/' + segments.length,
          Math.round(10 + (i + 1) / segments.length * 80),
          'done'
        )
        return result
      })
    })
    const results = await Promise.all(promises)

    let finalText = results.join('\n\n')

    if (cfg.hardruleEnabled !== false) {
      recordProcessingStage('hardrule post', 87)
      try {
        finalText = applyHardRuleMode(finalText)
      } catch {}
    }

    recordProcessingStage('split-merge complete', 88, 'done')
    return finalText
  }

  async function processMultiStep(text: string, cfg: any): Promise<string> {
    const skills = cfg.skillIds || []
    const budget = createApiCallBudget(8)
    const agentId = cfg.agentId || null
    const fallbackTemplate = '你是文本分析专家。提取以下文本的事件核心。'
    const fallbackVerifyTemplate = '你是文本校验专家。对以下文本做最小修正。'

    recordProcessingStage('extract event core', 15)
    let s1Input = text
    try {
      if (typeof DeAiSamples !== 'undefined') {
        const allSamples = DeAiSamples.getAll()
        const selectedSamples = allSamples.slice(0, 3)
        s1Input = '[style reference]\n' + selectedSamples.join('\n') + '\n\n--- text ---\n' + text
      }
    } catch {}
    let eventCore: string
    if (skills.length > 0) {
      eventCore = await runSkillStep(skills[0], s1Input, agentId, budget)
    } else {
      eventCore = await callAiApi(fallbackTemplate + '\n\n提取事件核心，输出结构化的事件列表。', s1Input)
    }

    recordProcessingStage('select perspective', 35)
    const perspectiveResult = await callAiApi(
      '你是叙事视角专家。基于以下事件核心，为每个事件选择偏转视角，确保视角轮换，不连续3个用同一种。输出事件核心+偏转标注。',
      eventCore
    )

    recordProcessingStage('reconstruct output', 60)
    let reconstructed = await callAiApi(
      '你是小说写作专家。基于以下事件核心和偏转视角标注，从零重写完整文章。保持人物、设定、关键情节不变，但用全新的表达方式。',
      perspectiveResult
    )

    if (cfg.hardruleEnabled !== false) {
      recordProcessingStage('hardrule post', 80)
      try {
        reconstructed = applyHardRuleMode(reconstructed)
      } catch {}
    }

    recordProcessingStage('S2 verify', 86)
    let verified: string
    if (skills.length > 1) {
      verified = await runSkillStep(skills[1], reconstructed, agentId, budget, true)
    } else {
      verified = await callAiApi(fallbackVerifyTemplate, reconstructed, true)
    }

    recordProcessingStage('multi-step complete', 88, 'done')
    return verified
  }

   async function crossModelCheck(originalText: string, processedText: string, cfg: any): Promise<string> {
     const verifyProvider = providerStore.activeVerifyProvider
     if (!verifyProvider) return processedText
     try {
       recordProcessingStage('cross-model verify', 92)
       const verifyPrompt = '你是文本校验专家。比较以下两段文本，第二段是对第一段去AI味处理后的结果。判断第二段是否保持了原文的核心情节、人物设定和关键信息。如果第二段有信息丢失或情节偏离，请修正。只输出修正后的文本。'
       const verifyInput = '[原文]\n' + originalText.slice(0, 2000) + '\n\n[处理后]\n' + processedText
       const verifyResult = await callAiApi(verifyPrompt, verifyInput, true)
       if (verifyResult && verifyResult.length > processedText.length * 0.5) {
         return verifyResult
       }
       return processedText
     } catch (error) {
       throw new Error(`跨模型验证失败：${error instanceof Error ? error.message : '供应商请求未完成'}`)
     }
   }

   async function zhuqueCheck(text: string, cfg: any): Promise<string> {
     const verifyProvider = providerStore.activeVerifyProvider
     if (!verifyProvider) return text
     try {
       recordProcessingStage('AI detection verify', 95)
       const detectPrompt = '分析以下文本的AI生成特征。只回复JSON: {"ai_score": 0-100, "reasons": ["原因1","原因2"]}。分数越低越像人类写作。'
       const detectResult = await callAiApi(detectPrompt, text.slice(0, 3000), true)
       let score = 50
       try { const m = detectResult.match(/"ai_score"\s*:\s*(\d+)/); if (m) score = parseInt(m[1]) } catch {}
       if (score > 60) {
         const rewritePrompt = '以下文本AI生成特征明显，请重写使其更像人类写作。保持原意不变，改变句式节奏、用词习惯和段落结构。只输出重写后的文本。'
         const rewriteResult = await callAiApi(rewritePrompt, text, false)
         if (rewriteResult && rewriteResult.length > 100) return rewriteResult
       }
       return text
     } catch (error) {
       throw new Error(`AI 检测验证失败：${error instanceof Error ? error.message : '供应商请求未完成'}`)
     }
   }

  async function process(text: string): Promise<string> {
  const cfg = {
    mode: deAiStore.mode,
    skillIds: deAiStore.skillIds,
    agentId: deAiStore.agentId,
    hardruleEnabled: deAiStore.hardruleEnabled,
    level: deAiStore.level,
    splitSize: deAiStore.splitSize
  }
  const provider = providerStore.activeGenerateProvider
  const skillNames = (cfg.skillIds || [])
    .map(id => skillStore.skills.find(skill => skill.id === id))
    .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill))
    .map(skill => skill.name || skill.id)
  deAiTrace = useAiCallTrace({
    source: 'home',
    stepName: '去AI味',
    mode: 'de-ai-' + cfg.mode,
    projectId: 'home-editor',
    projectName: '主页编辑器',
    providerId: provider?.id,
    providerName: provider?.name,
    model: provider?.selectedModel || provider?.models?.[0],
    skillNames,
    skillMode: cfg.mode,
    target: {
      type: 'home-editor',
      id: 'de-ai',
      name: '主页编辑器去AI味'
    },
    context: {
      contextStrategy: [
        `agent:${cfg.agentId || 'none'}`,
        `hardrule:${cfg.hardruleEnabled !== false}`,
        `level:${cfg.level || 'medium'}`,
        `splitSize:${cfg.splitSize || 1000}`
      ].join(' / ')
    }
  })
  deAiTrace.begin()
  deAiStore.startProcessing()
  deAiStore.updateFlowPreview()
  const cancelController = new AbortController()
  const cancelHandler = () => { cancelController.abort() }
  window.addEventListener('deai-cancel', cancelHandler)
  try {
    let result: string
    if (cfg.mode === 'chain') {
       result = await processChain(text, cfg)
       if (deAiStore.hardruleEnabled && deAiStore.hardRuleMode === 'deep-fix') {
         result = await runMinimalEdit(result)
       }
       result = await crossModelCheck(text, result, cfg)
       result = await zhuqueCheck(result, cfg)
     } else if (cfg.mode === 'split-merge') {
       result = await processSplitMerge(text, cfg)
       if (deAiStore.hardruleEnabled && deAiStore.hardRuleMode === 'deep-fix') {
         result = await runMinimalEdit(result)
       }
       result = await crossModelCheck(text, result, cfg)
       result = await zhuqueCheck(result, cfg)
     } else {
       result = await processMultiStep(text, cfg)
       if (deAiStore.hardruleEnabled && deAiStore.hardRuleMode === 'deep-fix') {
         result = await runMinimalEdit(result)
       }
       result = await crossModelCheck(text, result, cfg)
       result = await zhuqueCheck(result, cfg)
    }
    deAiTrace?.finish('success')
    deAiTrace = null
    deAiStore.finishProcessing()
    return result
  } catch (e: any) {
    deAiTrace?.finish('failed', e?.message || '去AI味处理失败')
    deAiTrace = null
    const failedStep = deAiStore.currentStep
    deAiStore.finishProcessing()
    deAiStore.setError(e?.message || '去AI味处理失败', failedStep)
    throw e
  } finally {
    window.removeEventListener('deai-cancel', cancelHandler)
  }
  }

  return { process, callAiApi }
}
