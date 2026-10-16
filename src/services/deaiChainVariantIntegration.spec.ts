import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./realSkillLoader', () => ({
  loadRealSkill: vi.fn()
}))
vi.mock('./aiService', () => ({
  getAiService: vi.fn()
}))

const skillExecuteScriptMock = vi.fn(async () => ({
  ok: true,
  availableHooks: [],
  exports: {},
  results: {},
  templateOverride: '',
  logs: []
}))
vi.stubGlobal('electronAPI', { skillExecuteScript: skillExecuteScriptMock })
vi.stubGlobal('window', {
  electronAPI: {
    skillExecuteScript: skillExecuteScriptMock,
    skillLoadFolder: undefined
  },
  dispatchEvent: vi.fn()
})

import {
  DEAI_CREATIVE_PROMPT,
  DEAI_METHODOLOGY_PROMPT,
  DEAI_POLISH_PROMPT,
  resolveDeaiPromptForChainStep
} from './de-ai'
import { getAiService } from './aiService'
import { routeSkill } from './skillRouter'
import { loadRealSkill } from './realSkillLoader'

const loadRealSkillMock = vi.mocked(loadRealSkill)
const getAiServiceMock = vi.mocked(getAiService)

function createBudget() {
  return {
    tryConsume: vi.fn(() => ({ status: 'allowed' as const, used: 1, limit: 8 }))
  }
}

describe('DEAI chain variant integration', () => {
  beforeEach(() => {
    loadRealSkillMock.mockReset()
    getAiServiceMock.mockReset()
    loadRealSkillMock.mockResolvedValue({
      package: {
        id: 'body-chain-skill',
        name: '正文链路技能',
        description: '',
        body: '',
        template: '请根据输入生成本步骤正文产物。',
        meta: {},
        script: '',
        samples: '',
        schema: null,
        folderPath: 'D:/skills/body-chain',
        resources: [],
        warnings: []
      },
      error: null,
      folderPackageCache: false
    })
    getAiServiceMock.mockResolvedValue({
      callAi: vi.fn(async () => ({ text: '正文输出', finishReason: 'stop', providerId: 'provider-1' }))
    } as any)
  })

  it('keeps each routed body-chain request on its own DEAI variant', async () => {
    const variants = [
      DEAI_METHODOLOGY_PROMPT,
      DEAI_CREATIVE_PROMPT,
      DEAI_POLISH_PROMPT
    ]

    for (let chainSkillIndex = 0; chainSkillIndex < variants.length; chainSkillIndex += 1) {
      const result = await routeSkill(
        { id: 'body-chain-skill', format: 'folder', folderPath: 'D:/skills/body-chain' },
        {
          input: '本章大纲',
          budget: createBudget(),
          systemPromptSuffix: resolveDeaiPromptForChainStep(4, chainSkillIndex, 3)
        }
      )

      const systemMessage = result.folderResult?.apiMeta?.requestMessages.find(message => message.role === 'system')
      expect(systemMessage?.content).toContain(variants[chainSkillIndex])
      for (const unexpected of variants.filter(variant => variant !== variants[chainSkillIndex])) {
        expect(systemMessage?.content).not.toContain(unexpected)
      }
    }
  })
})
