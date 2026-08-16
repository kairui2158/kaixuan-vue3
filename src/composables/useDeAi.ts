import { useDeAiStore } from '../stores/deai'
import { useProviderStore } from '../stores/provider'
import { useSkillStore } from '../stores/skill'
import { useAgentStore } from '../stores/agent'
import { DeAiProcessor } from '../services/de-ai.js'
import { DeAiSamples } from '../services/deai-samples.js'

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
      ? (providerStore.activeVerifyProvider || providerStore.activeGenerateProvider)
      : providerStore.activeGenerateProvider
    if (!provider) throw new Error('未配置供应商，请在设置中添加API供应商')
    const baseUrl = provider.baseUrl.replace(/\/$/, '')
    const url = baseUrl.match(/\/v\d+$/) ? baseUrl + '/chat/completions' : baseUrl + '/v1/chat/completions'
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
    let resp: Response
    for (let attempt = 0; attempt < 8; attempt++) {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + provider.apiKey
        },
        body: JSON.stringify(body)
      })
      if (resp.ok) break
      if (resp.status === 429) {
        deAiStore.updateProgress(0, 'API限流，第' + (attempt + 1) + '次重试...')
        const waitMs = [30000, 60000, 90000, 120000, 150000, 180000, 210000, 240000][attempt]
        await new Promise(r => setTimeout(r, waitMs))
        continue
      }
      const errText = await resp.text().catch(() => '')
      throw new Error('API ' + resp.status + ': ' + errText.slice(0, 200))
    }
    if (!resp!.ok) throw new Error('API限流，8次重试后仍失败')
    const data = await resp!.json()
    const content = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || ''
    return content
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

  function extractFirstSubject(text: string): string {
    if (!text) return ''
    const firstSentence = text.split(/[。！？\n]/)[0] || text.slice(0, 50)
    const match = firstSentence.match(/^(他|她|它|我|你|这|那|门|窗|风|雨|光|声音|脚步)/)
    return match ? match[1] : firstSentence.slice(0, 5)
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
        if (typeof DeAiSamples !== 'undefined') {
          const allSamples = DeAiSamples.getAll()
          const selectedSamples = allSamples.slice(0, 3)
          s1Input = '[style reference]\n' + selectedSamples.join('\n') + '\n\n--- text ---\n' + current
        }
      } catch {}
      const s1Result = await callAiApi(s1Template, s1Input)
      // first_subject_different validator: if S1 first subject matches original, retry once
      const origSubj = extractFirstSubject(text)
      const s1Subj = extractFirstSubject(s1Result)
      if (origSubj && s1Subj && origSubj === s1Subj) {
        const retryResult = await callAiApi(s1Template, s1Input)
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
      deAiStore.updateProgress(Math.round((stepIdx / totalSteps) * 100), 'hardrule pre')
      try {
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
                const result = DeAiProcessor.process(current, cfg.level || 'medium', 'post')
        if (result && result.text) current = result.text
      } catch {}
      stepIdx++
    }

    deAiStore.updateProgress(88, 'chain complete')
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
      deAiStore.updateProgress(87, 'hardrule post')
      try {
                const result = DeAiProcessor.process(finalText, cfg.level || 'medium', 'post')
        if (result && result.text) finalText = result.text
      } catch {}
    }

    deAiStore.updateProgress(88, 'split-merge complete')
    return finalText
  }

  async function processMultiStep(text: string, cfg: any): Promise<string> {
    const skills = cfg.skillIds || []
    const s1Template = skills.length > 0 ? getSkillTemplate(skills[0]) : '你是文本分析专家。提取以下文本的事件核心。'
    const verifyTemplate = skills.length > 1 ? getSkillTemplate(skills[1]) : '你是文本校验专家。对以下文本做最小修正。'

    deAiStore.updateProgress(15, 'extract event core')
    let s1Input = text
    try {
      if (typeof DeAiSamples !== 'undefined') {
        const allSamples = DeAiSamples.getAll()
        const selectedSamples = allSamples.slice(0, 3)
        s1Input = '[style reference]\n' + selectedSamples.join('\n') + '\n\n--- text ---\n' + text
      }
    } catch {}
    const eventCore = await callAiApi(
      s1Template + '\n\n提取事件核心，输出结构化的事件列表。',
      s1Input
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
                const result = DeAiProcessor.process(reconstructed, cfg.level || 'medium', 'post')
        if (result && result.text) reconstructed = result.text
      } catch {}
    }

    deAiStore.updateProgress(86, 'S2 verify')
    const verified = await callAiApi(verifyTemplate, reconstructed, true)

    deAiStore.updateProgress(88, 'multi-step complete')
    return verified
  }

   async function crossModelCheck(originalText: string, processedText: string, cfg: any): Promise<string> {
     const verifyProvider = providerStore.activeVerifyProvider
     if (!verifyProvider) return processedText
     try {
       deAiStore.updateProgress(92, 'cross-model verify')
       const verifyPrompt = '你是文本校验专家。比较以下两段文本，第二段是对第一段去AI味处理后的结果。判断第二段是否保持了原文的核心情节、人物设定和关键信息。如果第二段有信息丢失或情节偏离，请修正。只输出修正后的文本。'
       const verifyInput = '[原文]\n' + originalText.slice(0, 2000) + '\n\n[处理后]\n' + processedText
       const verifyResult = await callAiApi(verifyPrompt, verifyInput, true)
       if (verifyResult && verifyResult.length > processedText.length * 0.5) {
         return verifyResult
       }
       return processedText
     } catch { return processedText }
   }

   async function zhuqueCheck(text: string, cfg: any): Promise<string> {
     const verifyProvider = providerStore.activeVerifyProvider
     if (!verifyProvider) return text
     try {
       deAiStore.updateProgress(95, 'AI detection verify')
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
     } catch { return text }
   }

function applyTextFilter(text        )         {
    if (!text || typeof text !== 'string' || text.length === 0) return text
    const aiWords = ['\u503c\u5f97\u6ce8\u610f\u7684\u662f','\u6b64\u5916','\u4e0e\u6b64\u540c\u65f6','\u7531\u6b64\u53ef\u89c1','\u7efc\u4e0a\u6240\u8ff0','\u603b\u4f53\u800c\u8a00','\u4ece\u67d0\u79cd\u7a0b\u5ea6\u6765\u8bf4','\u8fdb\u884c\u4e86','\u505a\u51fa\u4e86','\u5b58\u5728\u7740','\u53d1\u751f\u4e86','\u4ea7\u751f\u4e86','\u5f62\u6210\u4e86','\u6781\u5927\u7684','\u663e\u8457\u7684','\u6df1\u523b\u7684','\u5145\u5206\u7684','\u6709\u6548\u7684']
    let result = text
    for (const w of aiWords) {
      while (result.indexOf(w) >= 0) { result = result.replace(w, '') }
    }
    const lines = result.split('\n')
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]
      const trimmed = line.trim()
      if (trimmed.length === 0) continue
      if (/^[=\u2500\u2501\u2550\-]{3,}$/.test(trimmed)) continue
      let firstPeriodIdx = -1
      for (let ci = 0; ci < line.length; ci++) {
        if (line.charAt(ci) === '\u3002' || line.charAt(ci) === '.') { firstPeriodIdx = ci; break }
      }
      if (firstPeriodIdx === -1) continue
      const beforePeriod = line.substring(0, firstPeriodIdx).trim()
      if (beforePeriod.length > 0 && beforePeriod.length <= 30) {
        lines[li] = line.substring(0, firstPeriodIdx) + '\uff0c' + line.substring(firstPeriodIdx + 1)
      }
    }
    result = lines.join('\n')
    const periods           = []
    for (let pi = 0; pi < result.length; pi++) {
      if (result.charAt(pi) === '\u3002' || result.charAt(pi) === '.') { periods.push(pi) }
    }
    if (periods.length >= 3) {
      let merged = result
      let offset = 0
      for (let pi2 = 0; pi2 < periods.length - 2; pi2++) {
        const p1 = periods[pi2] + offset
        const p2 = periods[pi2 + 1] + offset
        const p3 = periods[pi2 + 2] + offset
        if (p3 - p1 <= 50) {
          const seg1 = merged.substring(p1 + 1, p2).trim()
          const seg2 = merged.substring(p2 + 1, p3).trim()
          if (seg1.length <= 15 && seg2.length <= 15) {
            let seg0Start = 0
            if (pi2 > 0) { seg0Start = periods[pi2 - 1] + offset + 1 }
            const lineStart = merged.lastIndexOf('\n', p1)
            if (lineStart >= 0 && lineStart + 1 > seg0Start) { seg0Start = lineStart + 1 }
            const seg0 = merged.substring(seg0Start, p1).trim()
            if (seg0.length <= 15) {
              merged = merged.substring(0, p1) + '\uff0c' + merged.substring(p1 + 1)
            }
          }
        }
      }
      result = merged
    }
    return result
  }  async function process(text: string): Promise<string> {
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
  const cancelController = new AbortController()
  const cancelHandler = () => { cancelController.abort() }
  window.addEventListener('deai-cancel', cancelHandler)
  try {
    let result: string
    if (cfg.mode === 'chain') {
       result = await processChain(text, cfg)
       result = await crossModelCheck(text, result, cfg)
       result = await zhuqueCheck(result, cfg)
     } else if (cfg.mode === 'split-merge') {
       result = await processSplitMerge(text, cfg)
       result = await crossModelCheck(text, result, cfg)
       result = await zhuqueCheck(result, cfg)
     } else {
       result = await processMultiStep(text, cfg)
       result = await crossModelCheck(text, result, cfg)
       result = await zhuqueCheck(result, cfg)
     }
    result = applyTextFilter(result)
    deAiStore.finishProcessing()
    return result
  } catch (e: any) {
    deAiStore.finishProcessing()
    throw e
  } finally {
    window.removeEventListener('deai-cancel', cancelHandler)
  }
  }

  return { process, callAiApi }
}
