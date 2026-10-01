import { describe, expect, it, vi } from 'vitest'
import {
  applyFinalDraftEvent,
  buildFinalDraftMessages,
  buildFinalDraftSegmentMessages,
  continueFinalDraft,
  createFinalDraftTask,
  generateFinalDraft,
  hashContent,
  retryFinalDraftSegment,
  validateFinalDraft,
  normalizeFinalDraftParagraphSeparators,
  FINAL_DRAFT_SKILL_GUIDANCE_CHAR_LIMIT,
} from './finalDraftService'
import type { AiService, CallAiResult } from './aiService'

function aiResult(overrides: Partial<CallAiResult> = {}): CallAiResult {
  return {
    text: '整理后的终稿正文。',
    reasoning: '',
    finishReason: 'stop',
    ...overrides,
  }
}

function createAdapter(content = '原文内容') {
  let current = content
  const version = { value: 7 }
  const targetId = 'home-tab-1'
  const restoreDocument = vi.fn(async (next: string) => {
    current = next
    version.value += 1
    return { targetId, documentVersion: version.value, contentHash: hashContent(current) }
  })
  return {
    adapter: {
      getDocumentState: async () => ({
        targetId,
        content: current,
        documentVersion: version.value,
        contentHash: hashContent(current),
      }),
      writeDocument: async (next: string) => {
        current = next
        version.value += 1
        return { targetId, documentVersion: version.value, contentHash: hashContent(current) }
      },
      restoreDocument,
    },
    getContent: () => current,
    getVersion: () => version.value,
    restoreDocument,
  }
}

function createAi(results: CallAiResult[]) {
  let index = 0
  const callAi = vi.fn<(request: unknown) => Promise<CallAiResult>>(async () => {
    const result = results[index]
    index += 1
    return result
  })
  return { aiService: { callAi } as Pick<AiService, 'callAi'>, callAi }
}

describe('finalDraftService state machine', () => {
  it('creates a planning task with a source hash', () => {
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档',
      instruction: '全文整理',
      now: 1000,
    })
    expect(task.status).toBe('planning')
    expect(task.sourceContentHash).toBe(hashContent('源文档'))
    expect(task.taskId).toBe('final-draft-1000-1')
  })

  it('generates, validates, and writes a completed final draft', async () => {
    const { adapter, getContent, getVersion } = createAdapter('源文档')
    const { aiService, callAi } = createAi([aiResult({ text: '完整终稿正文。' })])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档',
      instruction: '全文整理',
      now: 1000,
    })
    const statuses: string[] = []
    const finished = await generateFinalDraft(
      { aiService, adapter, task, sourceContent: '源文档' },
      { onTaskChange: next => statuses.push(next.status) },
    )
    expect(finished.status).toBe('completed')
    expect(getContent()).toBe('完整终稿正文。')
    expect(getVersion()).toBe(8)
    expect(finished.documentVersionBeforeWrite).toBe(7)
    expect(callAi).toHaveBeenCalledTimes(1)
    const request = callAi.mock.calls[0]?.[0] as { tools: unknown[]; timeoutMs: unknown }
    expect(request.tools).toEqual([])
    expect(request.timeoutMs).toBeNull()
    expect(statuses).toContain('generating')
    expect(statuses).toContain('writing')
  })

  it('stops at awaiting continuation on length truncation and does not write', async () => {
    const { adapter, getContent } = createAdapter('源文档')
    const { aiService } = createAi([aiResult({ text: '第一段终稿', finishReason: 'length' })])
    const task = createFinalDraftTask({
      destination: 'outline-editor',
      targetId: 'outline-tab-1',
      sourceContent: '源文档',
      instruction: '全文重排',
      now: 1000,
    })
    const finished = await generateFinalDraft({ aiService, adapter, task, sourceContent: '源文档' })
    expect(finished.status).toBe('awaiting_continuation')
    expect(finished.finishReason).toBe('length')
    expect(finished.accumulatedText).toBe('第一段终稿')
    expect(getContent()).toBe('源文档')
  })

  it('continues a truncated draft, merges the seam, and writes once', async () => {
    const { adapter, getContent } = createAdapter('源文档')
    const { aiService } = createAi([
      aiResult({ text: '第一段终稿', finishReason: 'length' }),
      aiResult({ text: '第一段终稿第二段终稿', finishReason: 'stop' }),
    ])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档',
      instruction: '全文重排',
      now: 1000,
    })
    const truncated = await generateFinalDraft({ aiService, adapter, task, sourceContent: '源文档' })
    const finished = await continueFinalDraft({ aiService, adapter, task: truncated })
    expect(finished.status).toBe('completed')
    expect(finished.continuationCount).toBe(1)
    expect(finished.completedText).toBe('第一段终稿第二段终稿')
    expect(finished.accumulatedText).toBe('')
    expect(getContent()).toBe('第一段终稿第二段终稿')
  })

  it('generates a planned segmented draft in order and writes it once', async () => {
    const sourceContent = '第一段源文\n\n第二段源文'
    const { adapter, getContent, getVersion } = createAdapter(sourceContent)
    const { aiService, callAi } = createAi([
      aiResult({ text: 'segment-2\nsegment-1' }),
      aiResult({ text: '第一段终稿' }),
      aiResult({ text: '第二段终稿' }),
    ])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文重排',
      sourceSegments: [
        { segmentId: 'segment-1', start: 0, end: 6 },
        { segmentId: 'segment-2', start: 6, end: sourceContent.length },
      ],
      now: 1000,
    })
    const finished = await generateFinalDraft({ aiService, adapter, task, sourceContent })
    expect(finished.status).toBe('completed')
    expect(finished.segmentOrder).toEqual(['segment-2', 'segment-1'])
    const generationRequests = callAi.mock.calls.slice(1).map(call => call[0] as {
      messages: Array<{ role: string; content: string }>
    })
    expect(generationRequests.map(request => request.messages.at(-1)?.content)).toEqual([
      expect.stringContaining('第二段源文'),
      expect.stringContaining('第一段源文'),
    ])
    expect(finished.completedText).toBe('第一段终稿\n\n第二段终稿')
    expect(finished.activeSegmentIndex).toBe(2)
    expect(getContent()).toBe('第一段终稿\n\n第二段终稿')
    expect(getVersion()).toBe(8)
    expect(callAi).toHaveBeenCalledTimes(3)
  })

  it('deduplicates a repeated tail when joining the next segment', async () => {
    const sourceContent = '第一段源文\n\n第二段源文'
    const { adapter, getContent } = createAdapter(sourceContent)
    const sharedTail = '独立终稿节点内容，用于验证分段衔接去重。'.repeat(10)
    const { aiService } = createAi([
      aiResult({ text: 'segment-1\nsegment-2' }),
      aiResult({ text: `第一段终稿\n\n${sharedTail}` }),
      aiResult({ text: `${sharedTail}\n\n第三段终稿` }),
    ])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文重排',
      sourceSegments: [
        { segmentId: 'segment-1', start: 0, end: 6 },
        { segmentId: 'segment-2', start: 6, end: sourceContent.length },
      ],
      now: 1000,
    })
    const finished = await generateFinalDraft({ aiService, adapter, task, sourceContent })
    expect(finished.status).toBe('completed')
    expect(finished.completedText).toBe(`第一段终稿\n\n${sharedTail}\n\n第三段终稿`)
    expect(getContent()).toBe(`第一段终稿\n\n${sharedTail.replace(/\n/g, '\n\n')}\n\n第三段终稿`)
  })

  it('deduplicates a large seam replay and preserves the complete draft', async () => {
    const sourceContent = '第一段源文\n\n第二段源文'
    const { adapter, getContent } = createAdapter(sourceContent)
    const sharedTail = Array.from({ length: 70 }, (_, index) =>
      `独立终稿节点${index + 1}：大接缝重放校验，每一段内容唯一。`
    ).join('\n')
    const { aiService } = createAi([
      aiResult({ text: 'segment-1\nsegment-2' }),
      aiResult({ text: `第一段终稿\n\n${sharedTail}` }),
      aiResult({ text: `${sharedTail}\n\n第三段终稿` }),
    ])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文重排',
      sourceSegments: [
        { segmentId: 'segment-1', start: 0, end: 6 },
        { segmentId: 'segment-2', start: 6, end: sourceContent.length },
      ],
      now: 1000,
    })
    const finished = await generateFinalDraft({ aiService, adapter, task, sourceContent })
    expect(finished.status).toBe('completed')
    expect(finished.completedText).toBe(`第一段终稿\n\n${sharedTail}\n\n第三段终稿`)
    expect(getContent()).toBe(`第一段终稿\n\n${sharedTail.replace(/\n/g, '\n\n')}\n\n第三段终稿`)
  })

  it('fails a continuation that merges into a duplicated block and does not write', async () => {
    const { adapter, getContent } = createAdapter('源文档')
    const block = Array.from({ length: 20 }, (_, index) =>
      `续写重复块节点${index + 1}：这一块整体在续写后重放，必须被中部重复校验阻断。`
    ).join('')
    const { aiService } = createAi([
      aiResult({
        text: `开头正文。\n\n${block}\n\n${
          Array.from({ length: 10 }, (_, index) =>
            `第一段独有收束句${index + 1}：这一段只出现一次，用于避免把正常截断误判成接缝重复。`
          ).join('')
        }`,
        finishReason: 'length',
      }),
      aiResult({ text: `续写衔接。\n\n${block}\n\n续写结尾`, finishReason: 'stop' }),
    ])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档',
      instruction: '全文重排',
      now: 1000,
    })
    const truncated = await generateFinalDraft({ aiService, adapter, task, sourceContent: '源文档' })
    expect(truncated.status).toBe('awaiting_continuation')
    const finished = await continueFinalDraft({ aiService, adapter, task: truncated })
    expect(finished.status).toBe('failed')
    expect(finished.error).toContain('终稿中部存在大段重复')
    expect(getContent()).toBe('源文档')
  })

  it('fails a segment whose own output contains a duplicated block and does not write', async () => {
    const sourceContent = '第一段源文\n\n第二段源文'
    const { adapter, getContent } = createAdapter(sourceContent)
    const block = '独立终稿节点内容，用于验证分段输出自重复必须阻断写入。'.repeat(30)
    const { aiService } = createAi([
      aiResult({ text: 'segment-1\nsegment-2' }),
      aiResult({ text: `开头正文。\n\n${block}\n\n衔接正文。\n\n${block}\n\n结尾正文。` }),
    ])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文重排',
      sourceSegments: [
        { segmentId: 'segment-1', start: 0, end: 6 },
        { segmentId: 'segment-2', start: 6, end: sourceContent.length },
      ],
      now: 1000,
    })
    const finished = await generateFinalDraft({ aiService, adapter, task, sourceContent })
    expect(finished.status).toBe('failed')
    expect(finished.error).toContain('终稿中部存在大段重复')
    expect(getContent()).toBe(sourceContent)
  })

  it('joins non-overlapping segments without changing them', async () => {
    const sourceContent = '第一段源文\n\n第二段源文'
    const { adapter, getContent } = createAdapter(sourceContent)
    const { aiService } = createAi([
      aiResult({ text: 'segment-1\nsegment-2' }),
      aiResult({ text: '第一段终稿' }),
      aiResult({ text: '第二段终稿' }),
    ])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文重排',
      sourceSegments: [
        { segmentId: 'segment-1', start: 0, end: 6 },
        { segmentId: 'segment-2', start: 6, end: sourceContent.length },
      ],
      now: 1000,
    })
    const finished = await generateFinalDraft({ aiService, adapter, task, sourceContent })
    expect(finished.completedText).toBe('第一段终稿\n\n第二段终稿')
    expect(getContent()).toBe('第一段终稿\n\n第二段终稿')
  })

  it('rejects a large duplicated block in the middle of a draft', () => {
    const block = '独立终稿节点内容，用于验证中部大段重复必须阻断写入。'.repeat(30)
    const result = validateFinalDraft(`开头正文。\n\n${block}\n\n衔接正文。\n\n${block}\n\n结尾正文。`)
    expect(result.valid).toBe(false)
    expect(result.issues.map(issue => issue.code)).toContain('duplicate_block')
  })

  it('detects a repeated block after normalized whitespace', () => {
    const block = '独立终稿节点110正文，包含中文标点与少量英文 token，用于验证实测重复形态。'.repeat(8)
    const first = block.replace(/(?<=。)/g, '\n\n')
    const second = block.replace(/(?<=。)/g, ' ')
    const result = validateFinalDraft(`开头正文。\n\n${first}\n\n衔接正文。\n\n${second}\n\n结尾正文。`)
    expect(result.issues.map(issue => issue.code)).toContain('duplicate_block')
  })

  it('does not flag normal long prose for duplicate blocks', () => {
    const text = Array.from({ length: 120 }, (_, index) => `第${index + 1}段：独立正文内容各不相同。`).join('\n\n')
    expect(validateFinalDraft(text).issues.map(issue => issue.code)).not.toContain('duplicate_block')
  })

  it('continues the active segment with source and constraints in the messages', async () => {
    const { adapter } = createAdapter('源文档全文内容')
    const { aiService, callAi } = createAi([
      aiResult({ text: '第一段终稿', finishReason: 'length' }),
      aiResult({ text: '第一段终稿续写正文', finishReason: 'stop' }),
    ])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档全文内容',
      instruction: '全文整理',
      constraints: ['统一中文标点'],
      now: 1000,
    })
    const truncated = await generateFinalDraft({ aiService, adapter, task, sourceContent: '源文档全文内容' })
    const finished = await continueFinalDraft({ aiService, adapter, task: truncated })
    const request = callAi.mock.calls[1]?.[0] as { messages: Array<{ role: string; content: string }> }
    const text = request.messages.map(message => String(message.content)).join('\n')
    expect(finished.status).toBe('completed')
    expect(text).toContain('源文档全文内容')
    expect(text).toContain('统一中文标点')
    expect(text).toContain('第一段终稿')
    expect(text).toContain('请从上次输出中断的位置继续生成终稿正文')
  })

  it('falls back to source order when segment planning returns an invalid order', async () => {
    const sourceContent = '第一段源文\n\n第二段源文'
    const { adapter } = createAdapter(sourceContent)
    const { aiService, callAi } = createAi([
      aiResult({ text: '无效输出' }),
      aiResult({ text: '第一段终稿' }),
      aiResult({ text: '第二段终稿' }),
    ])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文重排',
      sourceSegments: [
        { segmentId: 'segment-1', start: 0, end: 6 },
        { segmentId: 'segment-2', start: 6, end: sourceContent.length },
      ],
      now: 1000,
    })
    const finished = await generateFinalDraft({ aiService, adapter, task, sourceContent })
    expect(finished.segmentOrder).toEqual(['segment-1', 'segment-2'])
    expect(finished.completedText).toBe('第一段终稿\n\n第二段终稿')
    expect(finished.status).toBe('completed')
    expect(callAi).toHaveBeenCalledTimes(3)
  })

  it('rejects writing when validation fails', async () => {
    const { adapter, getContent } = createAdapter('源文档')
    const { aiService } = createAi([aiResult({ text: '我无法完成这个任务。' })])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档',
      instruction: '全文重写',
      now: 1000,
    })
    const finished = await generateFinalDraft({ aiService, adapter, task, sourceContent: '源文档' })
    expect(finished.status).toBe('failed')
    expect(getContent()).toBe('源文档')
  })

  it('does not write when the source document changed', async () => {
    const harness = createAdapter('源文档')
    const { aiService } = createAi([aiResult({ text: '完整终稿正文。' })])
    let changed = false
    const adapter = {
      getDocumentState: async () => {
        if (changed) return harness.adapter.getDocumentState()
        changed = true
        return { targetId: 'home-tab-1', content: '新源文档', documentVersion: 8, contentHash: hashContent('新源文档') }
      },
      writeDocument: harness.adapter.writeDocument,
      restoreDocument: harness.adapter.restoreDocument,
    }
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档',
      instruction: '全文整理',
      now: 1000,
    })
    const finished = await generateFinalDraft({ aiService, adapter, task, sourceContent: '源文档' })
    expect(finished.status).toBe('rolled_back')
    expect(harness.getContent()).toBe('源文档')
  })

  it('marks write failure as rolled back', async () => {
    const { adapter, getContent, restoreDocument } = createAdapter('源文档')
    const failingAdapter = {
      ...adapter,
      writeDocument: vi.fn(async () => {
        throw new Error('write failed')
      }),
    }
    const { aiService } = createAi([aiResult({ text: '完整终稿正文。' })])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档',
      instruction: '全文整理',
      now: 1000,
    })
    const finished = await generateFinalDraft({ aiService, adapter: failingAdapter, task, sourceContent: '源文档' })
    expect(finished.status).toBe('rolled_back')
    expect(getContent()).toBe('源文档')
    expect(restoreDocument).toHaveBeenCalledWith('源文档')
  })

  it('restores the source after a partially applied write throws', async () => {
    const { adapter, getContent, restoreDocument } = createAdapter('源文档')
    const failingAdapter = {
      ...adapter,
      writeDocument: vi.fn(async (next: string) => {
        await adapter.writeDocument(next.slice(0, 2))
        throw new Error('write interrupted')
      }),
    }
    const { aiService } = createAi([aiResult({ text: '完整终稿正文。' })])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档',
      instruction: '全文整理',
      now: 1000,
    })
    const finished = await generateFinalDraft({ aiService, adapter: failingAdapter, task, sourceContent: '源文档' })
    expect(finished.status).toBe('rolled_back')
    expect(getContent()).toBe('源文档')
    expect(restoreDocument).toHaveBeenCalledWith('源文档')
  })

  it('marks the task failed when write and restore both fail', async () => {
    const { adapter } = createAdapter('源文档')
    const failingAdapter = {
      ...adapter,
      writeDocument: vi.fn(async () => {
        throw new Error('write failed')
      }),
      restoreDocument: vi.fn(async () => {
        throw new Error('restore failed')
      }),
    }
    const { aiService } = createAi([aiResult({ text: '完整终稿正文。' })])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档',
      instruction: '全文整理',
      now: 1000,
    })
    const finished = await generateFinalDraft({ aiService, adapter: failingAdapter, task, sourceContent: '源文档' })
    expect(finished.status).toBe('failed')
    expect(finished.error).toContain('write_failed_restore_failed')
  })

  it('refuses to write after the pinned target changes', async () => {
    const harness = createAdapter('源文档')
    const { aiService } = createAi([aiResult({ text: '完整终稿正文。' })])
    const adapter = {
      ...harness.adapter,
      getDocumentState: async () => ({
        targetId: 'another-tab',
        content: '源文档',
        documentVersion: 7,
        contentHash: hashContent('源文档'),
      }),
    }
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档',
      instruction: '全文整理',
      now: 1000,
    })
    const finished = await generateFinalDraft({ aiService, adapter, task, sourceContent: '源文档' })
    expect(finished.status).toBe('rolled_back')
    expect(finished.error).toContain('target_changed_before_write')
    expect(harness.getContent()).toBe('源文档')
  })

  it('marks provider failures as failed without writing', async () => {
    const { adapter, getContent } = createAdapter('源文档')
    const callAi = vi.fn<() => Promise<CallAiResult>>(async () => {
      throw new Error('provider unavailable')
    })
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档',
      instruction: '全文整理',
      now: 1000,
    })
    const finished = await generateFinalDraft(
      { aiService: { callAi } as Pick<AiService, 'callAi'>, adapter, task, sourceContent: '源文档' },
    )
    expect(finished.status).toBe('failed')
    expect(getContent()).toBe('源文档')
  })

  it('marks a slow-stream interruption as interrupted instead of failed', async () => {
    const { adapter, getContent } = createAdapter('源文档')
    const callAi = vi.fn<() => Promise<CallAiResult>>(async () => {
      const error = new Error('慢流请求传输中断') as Error & { code?: string }
      error.code = 'slow_stream_interrupted'
      throw error
    })
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档',
      instruction: '全文整理',
      now: 1000,
    })
    const statuses: string[] = []
    const finished = await generateFinalDraft(
      { aiService: { callAi } as Pick<AiService, 'callAi'>, adapter, task, sourceContent: '源文档' },
      { onTaskChange: next => statuses.push(next.status) },
    )
    expect(finished.status).toBe('interrupted')
    expect(statuses).toContain('interrupted')
    expect(getContent()).toBe('源文档')
  })

  it('retries an interrupted task and completes its segment', async () => {
    const sourceContent = '第一段源文\n\n第二段源文'
    const { adapter, getContent } = createAdapter(sourceContent)
    const { aiService, callAi } = createAi([
      aiResult({ text: 'segment-1\nsegment-2' }),
      aiResult({ text: '第一段终稿' }),
      aiResult({ text: '第二段终稿' }),
    ])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文重排',
      sourceSegments: [
        { segmentId: 'segment-1', start: 0, end: 6 },
        { segmentId: 'segment-2', start: 6, end: sourceContent.length },
      ],
      now: 1000,
    })
    const planning = applyFinalDraftEvent(task, { type: 'generation_started', now: 1001 })
    const interrupted = applyFinalDraftEvent(planning, {
      type: 'task_interrupted',
      error: '慢流请求传输中断',
      now: 1002,
    })
    const statuses: string[] = []
    const events: string[] = []
    const finished = await retryFinalDraftSegment(
      { aiService, adapter, task: interrupted },
      {
        onTaskChange: next => statuses.push(next.status),
        onTaskEvent: (_next, event) => events.push(event.type),
        onProgress: () => {},
      },
    )
    expect(finished.status).toBe('completed')
    expect(finished.completedText).toBe('第一段终稿\n\n第二段终稿')
    expect(events).toContain('segment_user_retry_started')
    expect(statuses).toContain('generating')
    expect(getContent()).toBe('第一段终稿\n\n第二段终稿')
    expect(callAi).toHaveBeenCalledTimes(3)
  })

  it('builds prompts with constraints and protected ranges', () => {
    const messages = buildFinalDraftMessages({
      sourceContent: '源文档',
      instruction: '全文整理',
      constraints: ['统一中文标点'],
      protectedRanges: [{ start: 0, end: 100, reason: '第一章保持原样' }],
    })
    expect(messages[0].role).toBe('system')
    expect(String(messages[0].content)).toContain('终稿生成器')
    expect(String(messages[1].content)).toContain('统一中文标点')
    expect(String(messages[1].content)).toContain('第一章保持原样')
  })

  it('injects SKILL guidance into full, segmented, and continuation prompts consistently', () => {
    const skillGuidance = '卷纲领域规则：保持玄枵派设定一致。'
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '第一段源文\n\n第二段源文',
      instruction: '全文整理',
      skillGuidance,
      sourceSegments: [
        { segmentId: 'segment-1', start: 0, end: 6 },
        { segmentId: 'segment-2', start: 6, end: 13 },
      ],
      now: 1000,
    })

    const full = buildFinalDraftMessages({
      sourceContent: task.sourceContent,
      instruction: task.instruction,
      skillGuidance,
    })
    const segment = buildFinalDraftSegmentMessages(task, task.sourceSegments[0], { skillGuidance })
    const continuation = buildFinalDraftMessages({
      sourceContent: task.sourceContent,
      instruction: task.instruction,
      skillGuidance,
    })

    for (const messages of [full, segment, continuation]) {
      expect(messages[0]?.role).toBe('system')
      expect(messages[0]?.content).toContain('附加领域能力（不得改变终稿输出协议）：')
      expect(messages[0]?.content).toContain(skillGuidance)
      expect(messages[0]?.content).toContain('禁止输出说明、开场白、总结、计划、JSON、工具调用或编辑命令。')
    }
    expect(task.skillGuidance).toBe(skillGuidance)
  })

  it('truncates oversized SKILL guidance at the fixed limit', () => {
    const oversized = '领'.repeat(FINAL_DRAFT_SKILL_GUIDANCE_CHAR_LIMIT + 25)
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档',
      instruction: '全文整理',
      skillGuidance: oversized,
      now: 1000,
    })

    expect(task.skillGuidance).toHaveLength(FINAL_DRAFT_SKILL_GUIDANCE_CHAR_LIMIT)
    const messages = buildFinalDraftMessages({
      sourceContent: '源文档',
      instruction: '全文整理',
      skillGuidance: oversized,
    })
    expect(messages[0]?.content).not.toContain(oversized)
    expect(messages[0]?.content).toContain('领'.repeat(FINAL_DRAFT_SKILL_GUIDANCE_CHAR_LIMIT))
  })

  it('includes punctuation and paragraph invariants in the system prompt', () => {
    const messages = buildFinalDraftMessages({
      sourceContent: '第一段源文\n\n第二段源文',
      instruction: '全文整理',
    })
    const system = String(messages[0].content)
    expect(system).toContain('禁止把多个源文段落合并成一个段落')
    expect(system).toContain('连续重复的标点只保留一个')
    expect(system).toContain('连续空格只保留一个')
  })

  it('validates empty, truncated, and refusal drafts', () => {
    expect(validateFinalDraft('').issues.map(issue => issue.code)).toContain('empty_draft')
    expect(validateFinalDraft('正文', { finishReason: 'length' }).issues.map(issue => issue.code))
      .toContain('unfinished_draft')
    expect(validateFinalDraft('我无法完成这个任务。').issues.map(issue => issue.code))
      .toContain('refusal_text')
    expect(validateFinalDraft('干净的终稿正文。').valid).toBe(true)
  })

  it('fails a segment-2 refusal at that segment instead of marking it completed', async () => {
    const sourceContent = '第一段源文。\n\n第二段源文。'
    const { adapter, getContent } = createAdapter(sourceContent)
    const { aiService } = createAi([
      aiResult({ text: 'segment-1\nsegment-2' }),
      aiResult({ text: '第一段终稿正文。' }),
      aiResult({ text: '我没有收到需要整理的源文内容，因此无法生成终稿。' }),
    ])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文重排',
      sourceSegments: [
        { segmentId: 'segment-1', start: 0, end: 8 },
        { segmentId: 'segment-2', start: 8, end: sourceContent.length },
      ],
      now: 1000,
    })
    const finished = await generateFinalDraft({ aiService, adapter, task, sourceContent })
    expect(finished.status).toBe('failed')
    expect(finished.activeSegmentIndex).toBe(1)
    expect(finished.error).toMatch(/段落|拒绝/)
    expect(finished.completedText).toBe('第一段终稿正文。')
    expect(getContent()).toBe(sourceContent)
  })

  it('fails a long draft that appends a refusal block at the end', async () => {
    const sourceContent = '第一段源文。\n\n第二段源文。'
    const { adapter, getContent } = createAdapter(sourceContent)
    const { aiService } = createAi([
      aiResult({
        text: '第一段终稿正文。\n\n第二段终稿正文。\n\n我没有收到需要整理的源文内容，因此无法生成终稿。',
      }),
    ])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文重排',
      now: 1000,
    })
    const finished = await generateFinalDraft({ aiService, adapter, task, sourceContent })
    expect(finished.status).toBe('failed')
    expect(finished.error).toContain('拒绝')
    expect(getContent()).toBe(sourceContent)
  })

  it('fails a segment output that loses the segment paragraph structure', async () => {
    const sourceContent = '第一段源文。\n\n第二段源文。\n\n第三段源文。'
    const { adapter, getContent } = createAdapter(sourceContent)
    const { aiService } = createAi([
      aiResult({ text: 'segment-1\nsegment-2' }),
      aiResult({ text: '第一段源文。第二段源文。第三段源文。' }),
    ])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文整理',
      sourceSegments: [
        { segmentId: 'segment-1', start: 0, end: sourceContent.length },
      ],
      now: 1000,
    })
    const finished = await generateFinalDraft({ aiService, adapter, task, sourceContent })
    expect(finished.status).toBe('failed')
    expect(finished.error).toContain('段落')
    expect(getContent()).toBe(sourceContent)
  })

  it('retries once when a segment loses its heading and paragraph structure', async () => {
    const sourceContent = '## 第一节\n\n1-1：第一段源文。\n\n1-2：第二段源文。'
    const { adapter, getContent } = createAdapter(sourceContent)
    const { aiService, callAi } = createAi([
      aiResult({ text: '1-1：第一段源文。1-2：第二段源文。' }),
      aiResult({ text: '## 第一节\n\n1-1：第一段源文。\n\n1-2：第二段源文。' }),
    ])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文整理',
      sourceSegments: [{ segmentId: 'segment-1', start: 0, end: sourceContent.length }],
      now: 1000,
    })
    const events: string[] = []
    const finished = await generateFinalDraft(
      { aiService, adapter, task, sourceContent },
      { onTaskEvent: (_task, event) => events.push(event.type) },
    )
    expect(finished.status).toBe('completed')
    expect(events).toContain('segment_retry_started')
    expect(events.filter(type => type === 'segment_retry_started')).toHaveLength(1)
    expect(getContent()).toBe('## 第一节\n\n1-1：第一段源文。\n\n1-2：第二段源文。')
    const retryRequest = callAi.mock.calls[1]?.[0] as { messages: Array<{ role: string; content: string }> }
    expect(String(retryRequest.messages.at(-1)?.content)).toContain('结构重试')
    expect(String(retryRequest.messages.at(-1)?.content)).toContain('标题行必须逐字保留')
  })

  it('does not run whole-document validation after a failed segment validation', async () => {
    const sourceContent = '## 第一节\n\n1-1：第一段源文。'
    const { adapter, getContent } = createAdapter(sourceContent)
    const { aiService, callAi } = createAi([
      aiResult({ text: '1-1：第一段源文。' }),
      aiResult({ text: '1-1：第一段源文。' }),
    ])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文整理',
      sourceSegments: [{ segmentId: 'segment-1', start: 0, end: sourceContent.length }],
      now: 1000,
    })
    const events: string[] = []
    const finished = await generateFinalDraft(
      { aiService, adapter, task, sourceContent },
      { onTaskEvent: (_task, event) => events.push(event.type) },
    )
    expect(finished.status).toBe('failed')
    expect(finished.error).toContain('终稿段落数量少于源文，疑似发生段落合并，未执行写入。（终稿 1 段 / 源文 2 段）')
    expect(events.filter(type => type === 'task_failed')).toHaveLength(1)
    expect(callAi).toHaveBeenCalledTimes(2)
    expect(getContent()).toBe(sourceContent)
  })

  it('embeds the source block count invariant in segment prompts', () => {
    const sourceContent = '第一段源文。\n\n第二段源文。\n\n第三段源文。'
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文整理',
      sourceSegments: [{ segmentId: 'segment-1', start: 0, end: sourceContent.length }],
      now: 1000,
    })
    const messages = buildFinalDraftSegmentMessages(task, task.sourceSegments[0])
    const prompt = String(messages[1].content)
    expect(prompt).toContain('本段源文共有 3 个段落')
    expect(prompt).toContain('终稿至少输出 3 个段落')
    expect(prompt).toContain('禁止把多个源文段落合并成一个段落')
  })

  it('embeds the segment heading boundary in segment prompts', () => {
    const sourceContent = '# 文档\n\n## 第一段\n\n第一段源文。\n\n## 第二段\n\n第二段源文。'
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文整理',
      sourceSegments: [
        { segmentId: 'segment-1', start: 0, end: sourceContent.indexOf('## 第二段') },
        { segmentId: 'segment-2', start: sourceContent.indexOf('## 第二段'), end: sourceContent.length },
      ],
      now: 1000,
    })
    const firstPrompt = String(buildFinalDraftSegmentMessages(task, task.sourceSegments[0])[1].content)
    const secondPrompt = String(buildFinalDraftSegmentMessages(task, task.sourceSegments[1])[1].content)
    expect(firstPrompt).toContain('本段标题边界')
    expect(firstPrompt).toContain('只允许输出本段源文包含的标题')
    expect(firstPrompt).toContain('## 第一段')
    expect(secondPrompt).toContain('从“## 第二段”开始')
    expect(secondPrompt).toContain('到“## 第二段”结束')
  })

  it('blocks a replayed heading with a truncated duplicate leaf body', async () => {
    const sourceContent = [
      '## 第110节',
      '',
      '110：完整正文。',
      '',
      '## 第212节',
      '',
      '212-1：完整正文。',
      '',
      '212-2：完整正文二。',
      '',
      '212-3：完整正文三。',
    ].join('\n')
    const draft = [
      '## 第110节',
      '',
      '110：完整正文。',
      '',
      '## 第212节',
      '',
      '212-1：完整正文。',
      '',
      '212-2：完整正文二。',
      '',
      '212-3：完整正文三。',
      '',
      '## 第110节',
      '',
      '110：完整正文。',
      '',
      '## 第212节',
      '',
      '212-2：完整正文二。',
      '',
      '212-3：完整正文三。',
    ].join('\n')
    const { adapter, getContent } = createAdapter(sourceContent)
    const { aiService } = createAi([
      aiResult({ text: draft }),
      aiResult({ text: draft }),
    ])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文整理',
      sourceSegments: [{ segmentId: 'segment-1', start: 0, end: sourceContent.length }],
      now: 1000,
    })
    const finished = await generateFinalDraft({ aiService, adapter, task, sourceContent })
    expect(finished.status).toBe('failed')
    expect(finished.error).toContain('叶子正文完整性校验失败')
    expect(finished.error).toContain('新增 3')
    expect(getContent()).toBe(sourceContent)
  })

  it('allows normalized punctuation in leaf body integrity checks', () => {
    const sourceContent = '## 第212节\n\n212-1：潮汐计偏移了5度,船坞正常。\n\n212-2：完整正文二。'
    const draft = '## 第212节\n\n212-1：潮汐计偏移了5度，船坞正常。\n\n212-2：完整正文二。'
    expect(validateFinalDraft(draft, { sourceContent }).valid).toBe(true)
  })

  it('requires heading lines and paragraph identifiers to survive final drafts', () => {
    const sourceContent = '## 第一节\n\n1-1：第一段源文。\n\n1-2：第二段源文。'
    const messages = buildFinalDraftSegmentMessages(
      createFinalDraftTask({
        destination: 'home-editor',
        targetId: 'home-tab-1',
        sourceContent,
        instruction: '全文整理',
        sourceSegments: [{ segmentId: 'segment-1', start: 0, end: sourceContent.length }],
        now: 1000,
      }),
      { segmentId: 'segment-1', start: 0, end: sourceContent.length },
    )
    expect(String(messages[0].content)).toContain('以 # 开头的标题行必须逐字保留')
    expect(String(messages[1].content)).toContain('段落开头的编号、标识和冒号前缀必须保留')
  })

  it('reports source and draft block counts when paragraph structure is lost', () => {
    const sourceContent = '第一段源文。\n\n第二段源文。\n\n第三段源文。'
    const result = validateFinalDraft('第一段源文。第二段源文。第三段源文。', { sourceContent })
    const issue = result.issues.find(item => item.code === 'paragraph_structure_lost')
    expect(issue?.message).toContain('终稿 1 段 / 源文 3 段')
  })

  it('fails a continuation refusal against the active segment source', async () => {
    const sourceContent = '第一段源文。\n\n第二段源文。'
    const { adapter, getContent } = createAdapter(sourceContent)
    const { aiService } = createAi([
      aiResult({
        text: Array.from({ length: 20 }, (_, index) => `终稿第${index + 1}段。`).join('\n\n'),
        finishReason: 'length',
      }),
      aiResult({ text: '第二段终稿正文。\n\n我没有收到需要整理的源文内容，因此无法生成终稿。', finishReason: 'stop' }),
    ])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文重排',
      now: 1000,
    })
    const truncated = await generateFinalDraft({ aiService, adapter, task, sourceContent })
    expect(truncated.status).toBe('awaiting_continuation')
    const finished = await continueFinalDraft({ aiService, adapter, task: truncated })
    expect(finished.status).toBe('failed')
    expect(finished.error).toContain('拒绝')
    expect(getContent()).toBe(sourceContent)
  })

  it('blocks merged paragraphs before write and keeps the editor unchanged', async () => {
    const sourceContent = '第一段源文。\n\n第二段源文。\n\n第三段源文。'
    const { adapter, getContent } = createAdapter(sourceContent)
    const { aiService, callAi } = createAi([
      aiResult({ text: '第一段源文。第二段源文。第三段源文。' }),
      aiResult({ text: '第一段源文。第二段源文。第三段源文。' }),
    ])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文整理',
      now: 1000,
    })
    const finished = await generateFinalDraft({ aiService, adapter, task, sourceContent })
    expect(finished.status).toBe('failed')
    expect(finished.error).toContain('段落')
    expect(getContent()).toBe(sourceContent)
    expect(callAi).toHaveBeenCalledTimes(2)
  })

  it('allows paragraph splitting but not merging during validation', () => {
    const sourceContent = '第一段源文。\n\n第二段源文。'
    expect(validateFinalDraft('第一段源文。\n\n第二段源文。', { sourceContent }).valid).toBe(true)
    expect(validateFinalDraft('第一段源文。\n\n第一段源文后半。\n\n第二段源文。', { sourceContent }).valid).toBe(true)
    expect(
      validateFinalDraft('第一段源文。第二段源文。', { sourceContent }).issues.map(issue => issue.code),
    ).toContain('paragraph_structure_lost')
  })

  it('normalizes single-newline paragraph separators without merging prose blocks', () => {
    const sourceContent = '第一段源文。\n\n第二段源文。\n\n第三段源文。'
    const draft = '第一段源文。\n第二段源文。\n第三段源文。'
    const normalized = normalizeFinalDraftParagraphSeparators(draft)
    expect(normalized).toBe('第一段源文。\n\n第二段源文。\n\n第三段源文。')
    expect(validateFinalDraft(normalized, { sourceContent }).valid).toBe(true)
  })

  it('normalizes model paragraph separators at write time while preserving task text', async () => {
    const sourceContent = '第一段源文。\n\n第二段源文。\n\n第三段源文。'
    const { adapter, getContent } = createAdapter(sourceContent)
    const { aiService } = createAi([aiResult({ text: '第一段源文。\n第二段源文。\n第三段源文。' })])
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文整理',
      now: 1000,
    })
    const finished = await generateFinalDraft({ aiService, adapter, task, sourceContent })
    expect(finished.status).toBe('completed')
    expect(finished.completedText).toBe('第一段源文。\n第二段源文。\n第三段源文。')
    expect(getContent()).toBe('第一段源文。\n\n第二段源文。\n\n第三段源文。')
  })

  it('applies explicit cancellation events', () => {
    const task = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档',
      instruction: '全文整理',
      now: 1000,
    })
    const started = applyFinalDraftEvent(task, { type: 'generation_started', now: 1001 })
    const canceled = applyFinalDraftEvent(started, { type: 'task_canceled', reason: '用户取消', now: 1002 })
    expect(canceled.status).toBe('canceled')
  })
})
