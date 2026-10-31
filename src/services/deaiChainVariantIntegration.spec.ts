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
  buildDeaiGuidancePack
} from './deaiGuidancePack'
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

  it('keeps each routed body-chain request on its own DEAI guidance pack', async () => {
    const variants = ['methodology', 'creative', 'polish'] as const

    for (let chainSkillIndex = 0; chainSkillIndex < variants.length; chainSkillIndex += 1) {
      const guidancePack = buildDeaiGuidancePack({ role: variants[chainSkillIndex]!, voiceProfile: null })
      const result = await routeSkill(
        { id: 'body-chain-skill', format: 'folder', folderPath: 'D:/skills/body-chain' },
        {
          input: '本章大纲',
          budget: createBudget(),
          systemPromptSuffix: guidancePack.text
        }
      )

      const systemMessage = result.folderResult?.apiMeta?.requestMessages.find(message => message.role === 'system')
      expect(systemMessage?.content).toContain(guidancePack.text)
      expect(systemMessage?.content).not.toContain('【降AI创作约束 - 生成阶段执行】')
      expect(systemMessage?.content).not.toContain('【降AI创作风格 - 创作执行阶段】')
      expect(systemMessage?.content).not.toContain('【降AI创作约束 - 打磨阶段】')
    }
  })
})
