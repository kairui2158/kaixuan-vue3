import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function loadEngine() {
  const source = readFileSync(resolve(process.cwd(), 'public/skill-engine.js'), 'utf8')
  const context = {
    console,
    window: {},
    DeAiSamples: undefined,
    setTimeout,
    clearTimeout
  }
  // eslint-disable-next-line no-new-func
  const run = new Function('context', 'window', `${source}; return window.SkillExecutionEngine`)
  return run(context, context.window)
}

describe('skill engine failure contract', () => {
  it('does not turn a failed chain step into the previous output', async () => {
    const engine = loadEngine()
    const result = await engine.chain('原始请求', [
      { id: 's1', name: '第一步', template: '第一步规则' },
      { id: 's2', name: '第二步', template: '第二步规则' }
    ], {
      aiRequest: async () => { throw new Error('fixture failure') },
      stream: false
    })

    expect(result.text).toBe('')
    expect(result.status).toBe('failed')
    expect(result.reports.map((report: any) => report.status)).toEqual(['failed', 'skipped'])
    expect(result.reports[0].text).toBe('')
    expect(result.reports[0].error).toContain('fixture failure')
  })

  it('does not report success when validation retry still fails', async () => {
    const engine = loadEngine()
    const result = await engine.chain('原始请求', [
      { id: 's1', name: '校验步骤', template: '校验规则' }
    ], {
      aiRequest: async () => ({ text: '仍然不合法' }),
      validators: [() => ({ ok: false, hint: '长度不足' })],
      finalValidators: [() => ({ ok: false, hint: '最终校验失败' })],
      stream: false
    })

    expect(result.text).toBe('')
    expect(result.status).toBe('failed')
    expect(result.reports[0].status).toBe('failed')
    expect(result.reports[0].reason).toContain('validation retry failed')
  })

  it('rejects split-merge when a segment request fails', async () => {
    const engine = loadEngine()
    await expect(engine.splitMerge('第一段。第二段。第三段。第四段。', [
      { id: 's1', name: '分段步骤', template: '分段规则' }
    ], {
      aiRequest: async () => { throw new Error('segment fixture failure') },
      stream: false
    })).rejects.toThrow('segment fixture failure')
  })

  it('rejects multi-step when a phase request fails', async () => {
    const engine = loadEngine()
    await expect(engine.multiStep('第一段。第二段。第三段。第四段。', [
      { id: 's1', name: '阶段一', template: '阶段一规则' },
      { id: 's2', name: '阶段二', template: '阶段二规则' },
      { id: 's3', name: '阶段三', template: '阶段三规则' }
    ], {
      aiRequest: async () => { throw new Error('phase fixture failure') },
      stream: false
    })).rejects.toThrow('phase fixture failure')
  })

  it('propagates parallel worker failures instead of using the input as output', async () => {
    const engine = loadEngine()
    await expect(engine._parallelMap(['a', 'b'], async (item: string) => {
      if (item === 'a') throw new Error('parallel fixture failure')
      return item
    }, 2)).rejects.toThrow('parallel fixture failure')
  })
})
