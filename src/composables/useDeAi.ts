import { useDeAiStore } from '../stores/deai'
import { useProviderStore } from '../stores/provider'
import { useSkillStore } from '../stores/skill'
import { useAgentStore } from '../stores/agent'

/**
 * Renderer-process bridge for DeAI processing.
 * Calls DeAiProcessor and service layer directly, no IPC roundtrip.
 */
export function useDeAi() {
  const deAiStore = useDeAiStore()
  const providerStore = useProviderStore()
  const skillStore = useSkillStore()
  const agentStore = useAgentStore()

  async function callAiApi(systemPrompt: string, userText: string, useVerify?: boolean): Promise<string> {
    const provider = useVerify
      ? providerStore.activeVerifyProvider
      : providerStore.activeGenerateProvider
    if (!provider) throw new Error('未配置' + (useVerify ? '验证' : '生成') + '供应商')
    const url = provider.baseUrl.replace(/\/$/, '') + '/v1/chat/completions'
    const model = provider.selectedModel || 'gpt-4o'
    const temperature = useVerify ? 0.3 : (provider.temperature ?? 0.7)
    const body: any = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText }
      ],
      stream: false,
      temperature
    }
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + provider.apiKey
      },
      body: JSON.stringify(body)
    })
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new Error('API ' + resp.status + ': ' + errText.slice(0, 200))
    }
    const data = await resp.json()
    const content = data.choices?.[0]?.message?.content || ''
    const reasoning = data.choices?.[0]?.message?.reasoning_content || ''
    return content || reasoning
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

  async function processChain(text: string, cfg: any): Promise<string> {
    const skills = cfg.skillIds || []
    const hardruleEnabled = cfg.hardruleEnabled !== false
    let current = text
    const totalSteps = skills.length + (hardruleEnabled ? 2 : 0)
    let stepIdx = 0

    // GATE-10: S1 runs first on original text, then hardrule, then S2
    if (skills.length > 0) {
      deAiStore.updateProgress(Math.round((stepIdx / totalSteps) * 100), 'S1 rewrite')
      const s1Template = getSkillTemplate(skills[0])
      let s1Input = current
      // GATE-11: style samples injected to S1 (rewrite main), not S2
      try {
        const { DeAiSamples } = require('../services/deai-samples.js')
        if (typeof DeAiSamples !== 'undefined') {
          const samples = DeAiSamples.getSampleText()
          s1Input = '[style reference]\n' + samples + '\n\n--- text ---\n' + current
        }
      } catch {}
      const s1Result = await callAiApi(s1Template, s1Input)
      current = s1Result
      stepIdx++
    }

    if (hardruleEnabled) {
      deAiStore.updateProgress(Math.round((stepIdx / totalSteps) * 100), 'hardrule pre')
      try {
        const { DeAiProcessor } = require('../services/de-ai.js')
        const result = DeAiProcessor.process(current, cfg.level || 'medium', 'pre')
        if (result && result.text) current = result.text
      } catch {}
      stepIdx++
    }

    if (skills.length > 1) {
      deAiStore.updateProgress(Math.round((stepIdx / totalSteps) * 100), 'S2 verify')
      const s2Template = getSkillTemplate(skills[1])
      const s2Result = await callAiApi(s2Template, current, true)
      current = s2Result
      stepIdx++
    }

    if (hardruleEnabled) {
      deAiStore.updateProgress(Math.round((stepIdx / totalSteps) * 100), 'hardrule post')
      try {
        const { DeAiProcessor } = require('../services/de-ai.js')
        const result = DeAiProcessor.process(current, cfg.level || 'medium', 'post')
        if (result && result.text) current = result.text
      } catch {}
      stepIdx++
    }

    deAiStore.updateProgress(100, 'done')
    return current
  }

  async function processSplitMerge(text: string, cfg: any): Promise<string> {
    const splitSize = cfg.splitSize || 1000
    const skills = cfg.skillIds || []
    const outputTemplate = skills.length > 0 ? getSkillTemplate(skills[0]) : '你是文本重写专家。重写以下文本，保持原意不变。'

    deAiStore.updateProgress(5, 'splitting')
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
          if (text[i] === '.' || text[i] === '!' || text[i] === '?') {
            breakPoint = i + 1
            break
          }
        }
      }
      if (breakPoint < 0) breakPoint = end
      segments.push(text.slice(pos, breakPoint))
      pos = breakPoint
    }

    deAiStore.updateProgress(10, 'parallel rewrite ' + segments.length + ' segments')

    const promises = segments.map((seg, i) => {
      return callAiApi(outputTemplate, seg).then(result => {
        deAiStore.updateProgress(
          Math.round(10 + (i + 1) / segments.length * 80),
          'rewrite segment ' + (i + 1) + '/' + segments.length
        )
        return result
      }).catch(() => seg)
    })
    const results = await Promise.all(promises)

    let finalText = results.join('\n\n')

    if (cfg.hardruleEnabled !== false) {
      deAiStore.updateProgress(90, 'hardrule post')
      try {
        const { DeAiProcessor } = require('../services/de-ai.js')
        const result = DeAiProcessor.process(finalText, cfg.level || 'medium', 'post')
        if (result && result.text) finalText = result.text
      } catch {}
    }

    deAiStore.updateProgress(100, 'done')
    return finalText
  }

  async function processMultiStep(text: string, cfg: any): Promise<string> {
    const skills = cfg.skillIds || []
    const s1Template = skills.length > 0 ? getSkillTemplate(skills[0]) : '你是文本分析专家。提取以下文本的事件核心。'
    const verifyTemplate = skills.length > 1 ? getSkillTemplate(skills[1]) : '你是文本校验专家。对以下文本做最小修正。'

    deAiStore.updateProgress(15, 'extract event core')
    const eventCore = await callAiApi(
      s1Template + '\n\n提取事件核心，输出结构化的事件列表。',
      text
    )

    deAiStore.updateProgress(35, 'select perspective')
    const perspectiveResult = await callAiApi(
      '你是叙事视角专家。基于以下事件核心，为每个事件选择偏转视角，确保视角轮换，不连续3个用同一种。输出事件核心+偏转标注。',
      eventCore
    )

    deAiStore.updateProgress(60, 'reconstruct output')
    let reconstructed = await callAiApi(
      '你是小说写作专家。基于以下事件核心和偏转视角标注，从零重写完整文章。保持人物、设定、关键情节不变，但用全新的表达方式。',
      perspectiveResult
    )

    if (cfg.hardruleEnabled !== false) {
      deAiStore.updateProgress(80, 'hardrule post')
      try {
        const { DeAiProcessor } = require('../services/de-ai.js')
        const result = DeAiProcessor.process(reconstructed, cfg.level || 'medium', 'post')
        if (result && result.text) reconstructed = result.text
      } catch {}
    }

    deAiStore.updateProgress(90, 'S2 verify')
    const verified = await callAiApi(verifyTemplate, reconstructed, true)

    deAiStore.updateProgress(100, 'done')
    return verified
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
    deAiStore.startProcessing()
    deAiStore.updateFlowPreview()
    try {
      let result: string
      if (cfg.mode === 'chain') {
        result = await processChain(text, cfg)
      } else if (cfg.mode === 'split-merge') {
        result = await processSplitMerge(text, cfg)
      } else {
        result = await processMultiStep(text, cfg)
      }
      deAiStore.finishProcessing()
      return result
    } catch (e: any) {
      deAiStore.finishProcessing()
      throw e
    }
  }

  return { process, callAiApi }
}
