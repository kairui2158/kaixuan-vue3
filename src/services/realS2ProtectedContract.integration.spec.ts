import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeRealSkill } from './realSkillExecutor'
import { loadRealSkill } from './realSkillLoader'
import { getAiService } from './aiService'
import type { CallAiParams } from './aiService'
import { bodyGeneratorContractSentence } from './chainExecution'
import { countBodyWords } from './bodyArtifactContract'
import type { RealSkillLoadResult } from './realSkillTypes'

vi.mock('./realSkillLoader', () => ({
  loadRealSkill: vi.fn()
}))
vi.mock('./aiService', () => ({
  getAiService: vi.fn(),
  filterThinkingTags: vi.fn((text: string) => text)
}))

const loadRealSkillMock = vi.mocked(loadRealSkill)
const getAiServiceMock = vi.mocked(getAiService)

beforeAll(() => {
  const skillExecuteScript = vi.fn(async (script: string, request: { hook: 'preProcess' | 'postProcess'; payload: unknown }) => {
      const module = { exports: {} as Record<string, unknown> }
      const runScript = new Function('module', 'exports', script)
      runScript(module, module.exports)
      const hook = (module.exports as Record<string, unknown>)[request.hook]
      if (typeof hook !== 'function') return { ok: true }
      const result = (hook as (payload: unknown) => unknown)(request.payload)
      return {
        ok: true,
        results: {
          [request.hook]: result
        }
      }
    })
  const electronAPI = { skillExecuteScript }
  vi.stubGlobal('window', { electronAPI, dispatchEvent: vi.fn() })
  vi.stubGlobal('electronAPI', electronAPI)
})

afterAll(() => {
  vi.unstubAllGlobals()
})

const s2Folder = 'D:/codex/玄武规划SKILL/凯旋-正文层/kaixuan-s2'
const s2Script = readFileSync(
  fileURLToPath(new URL('../../../玄武规划SKILL/凯旋-正文层/kaixuan-s2/script.js', import.meta.url)),
  'utf8'
)

describe('real kaixuan S2 protected body contract', () => {
  beforeEach(() => {
    loadRealSkillMock.mockReset()
    getAiServiceMock.mockReset()
  })

  it('keeps the protected contract after S2 folds duplicated handoff blocks', async () => {
    const contractText = bodyGeneratorContractSentence(3500)
    // Vivid-SKILL 0.4.1 now enforces paragraph medians below 52 CJK chars.
    // Build deterministic prose with 3200 unique Han characters so the legacy
    // duplicated-upstream-handoff scenario remains the target under test.
    const proseSource = Array.from(
      { length: 3200 },
      (_, index) => String.fromCharCode(0x4e00 + (index % 20000))
    ).join('')
    const body = Array.from(
      { length: 80 },
      (_, index) => proseSource.slice(index * 40, (index + 1) * 40)
    ).join('\n')
    const handoff = [
      '【正文交接】',
      '章节：第1章',
      'FACT_LOCK：人物状态：王芳警觉；位置：仓库；伤势：无；持有物：旧钥匙；时间点：深夜；关键数字：账册1本；新增事实：王芳发现旧账册；钩子兑现状态：未兑现。',
      'NEXT_HOOK：账册指向北仓。'
    ].join('\n')
    const input = [
      '【上游执行包】',
      body,
      handoff,
      handoff
    ].join('\n\n')

    loadRealSkillMock.mockResolvedValueOnce({
      package: {
        id: 'kaixuan-s2',
        name: 'kaixuan-s2',
        description: '',
        template: '请输出本章节正文。',
        meta: {},
        script: s2Script,
        samples: '',
        schema: null,
        folderPath: s2Folder,
        resources: []
      },
      error: null,
      folderPackageCache: false
    } satisfies RealSkillLoadResult)

    const candidateProseSource = Array.from(
      { length: 3500 },
      (_, index) => String.fromCharCode(0x4e00 + (index % 20000))
    ).join('')
    const candidateBody = Array.from(
      { length: 88 },
      (_, index) => candidateProseSource.slice(index * 40, index * 40 + 38) +
        (index % 2 === 0 ? '手' : '眼') + '。'
    ).join('\n')
    const validOutput = [
      candidateBody,
      '【正文交接】',
      '章节：第1章',
      'POV：王芳',
      'chapterIntent：王芳在仓库发现旧账册并确认北仓线索',
      '场景类型：场景1：动作；场景2：动作；场景3：动作；场景4：动作',
      '对白排布：场景1：王芳独自在场；压低声音提醒自己下一步；出声；场景2：王芳独自在场；压低声音提醒自己下一步；出声；场景3：王芳独自在场；压低声音提醒自己下一步；出声；场景4：王芳独自在场；压低声音提醒自己下一步；出声',
      '已完成场景：场景1、场景2、场景3、场景4',
      '未完成场景：无',
      '来源覆盖状态：全部场景已覆盖',
      '场景分段：场景1：入场发现；场景2：核对账册；场景3：追踪北仓；场景4：锁门收束',
      '场景字数：场景1：880；场景2：880；场景3：880；场景4：860',
      '场景施工卡：场景1：完整；场景2：完整；场景3：完整；场景4：完整',
      '角色状态变化：王芳找到账册',
      '章末状态：王芳准备去北仓',
      '下一章必须使用：旧账册线索',
      '事件增量：王芳发现旧账册并确认北仓线索',
      'narrativeStatus：ready',
      'narrativeReason：王芳发现旧账册并确认北仓线索，状态发生改变',
      'stateChangingScenes：场景1（信息：未知→已知）；场景2（资源：无→有）',
      '目标字数：3500',
      '生成下限：2800',
      '场景总数：4',
      'FACT_LOCK：',
      '人物状态：王芳警觉；位置：仓库；伤势：无；持有物：旧钥匙；时间点：深夜；关键数字：账册1本；新增事实：王芳发现旧账册；钩子兑现状态：未兑现。',
      'NEW_FACT：发现旧账册。',
      'NEXT_HOOK：账册指向北仓。'
    ].join('\n')
    const callAi = vi.fn(async (_params: CallAiParams) => ({ text: validOutput }))
    getAiServiceMock.mockResolvedValue({ callAi } as any)

    const result = await executeRealSkill({
      folderPath: s2Folder,
      input,
      budget: {
        tryConsume: () => ({ status: 'allowed' as const, used: 1, limit: 8 })
      },
      // In production, Electron owns this bridge. The integration target is the
      // executor request, not the Electron script sandbox, so we mount the same
      // script content directly here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...((globalThis as any).electronAPI ? {} : {}),
      protectedContract: {
        kind: 'body',
        targetWords: 3500
      }
    })

    expect(result.status).toBe('success')
    expect(result.errors).toEqual([])
    expect(result.diagnostics.some(item =>
      item.code === 'protected-contract-missing' ||
      item.code === 'script-hook-exception'
    )).toBe(false)
    expect(result.diagnostics.filter(item =>
      item.type === 'error' || item.type === 'warning'
    )).toEqual([])

    const userPrompt = (callAi.mock.calls[0]?.[0] as CallAiParams | undefined)?.messages
      .find((message: { role: string }) => message.role === 'user')?.content || ''
    // The protected contract sentence itself names the handoff marker. Count
    // only markers that precede it, where upstream handoff folding happened.
    const foldedInput = userPrompt.slice(0, userPrompt.lastIndexOf(contractText))
    expect(foldedInput.split('\n【正文交接】\n').length - 1).toBe(1)
    expect(userPrompt.endsWith(contractText)).toBe(true)
    expect(userPrompt.lastIndexOf(contractText)).toBeGreaterThan(
      foldedInput.lastIndexOf('【正文交接】')
    )
    expect(countBodyWords(body)).toBe(3200)
  })
})
