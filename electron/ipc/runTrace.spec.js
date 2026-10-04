import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { buildRunWithPayloadRefs, deduplicatePayloads, uniqueExportFile, verifyApiResponseIndex } = await import('./runTrace')

describe('run trace payload deduplication', () => {
  it('deduplicates identical logical and physical payloads', () => {
    const request = [{ role: 'user', content: '卷纲执行包' }]
    const response = 'S1 输出'
    const stream = 'S1 输出'
    const run = {
      apiCalls: [
        {
          requestMessages: request,
          responseText: response,
          streamText: stream,
          physicalCalls: [
            { requestMessages: request, responseText: response, streamText: stream }
          ]
        }
      ],
      folderDiagnostics: [{ status: 'success', output: response }]
    }

    const built = buildRunWithPayloadRefs(run)
    expect(built.payloads).toHaveLength(4)
    expect(built.refs).toHaveLength(4)
    expect(built.refs.find(ref => ref.kind === 'request')?.duplicateCount).toBe(2)
    expect(built.refs.find(ref => ref.kind === 'response')?.duplicateCount).toBe(2)
    expect(built.refs.find(ref => ref.kind === 'stream')?.duplicateCount).toBe(2)

    const diagnostic = built.run.folderDiagnostics[0]
    expect(diagnostic.output).toBeUndefined()
    expect(diagnostic.outputLength).toBe(response.length)
    expect(diagnostic.outputPreview).toBe(response)
    expect(diagnostic.outputPayloadRef).toBeTruthy()
    expect(built.payloads.some(item => item.kind === 'folder-output')).toBe(true)

    const logicalRequest = built.run.apiCalls[0].requestMessages
    const physicalRequest = built.run.apiCalls[0].physicalCalls[0].requestMessages
    expect(logicalRequest.__payload.id).toBe(physicalRequest.__payload.id)
    expect(logicalRequest.__payload.value).toBeUndefined()

    const duplicates = deduplicatePayloads([
      { kind: 'request', value: request },
      { kind: 'request', value: request }
    ])
    expect(duplicates.unique).toHaveLength(1)
    expect(duplicates.unique[0].duplicateCount).toBe(2)
  })

  it('externally stores folder apiMeta requests instead of duplicating them in the main trace', () => {
    const request = [
      { role: 'system', content: 'S'.repeat(1200) },
      { role: 'user', content: 'U'.repeat(1200) }
    ]
    const response = 'S1 输出'
    const stream = 'S1 输出'
    const run = {
      apiCalls: [
        { requestMessages: request, responseText: response, streamText: stream }
      ],
      folderDiagnostics: [
        { status: 'success', output: response, apiMeta: { requestMessages: request } }
      ]
    }

    const built = buildRunWithPayloadRefs(run)
    const diagnostic = built.run.folderDiagnostics[0]
    expect(built.payloads.filter(item => item.kind === 'request')).toHaveLength(1)
    expect(built.refs.find(ref => ref.kind === 'request')?.duplicateCount).toBe(2)
    expect(diagnostic.apiMeta.requestMessages).toEqual([
      { role: 'system', content: 'S'.repeat(500), length: 1200 },
      { role: 'user', content: 'U'.repeat(500), length: 1200 }
    ])
    expect(diagnostic.apiMeta.requestPayloadRef).toBe(
      built.run.apiCalls[0].requestMessages.__payload.id
    )
  })

  it('externally stores tool request deltas separately from logical requests', () => {
    const request = [
      { role: 'system', content: '初始系统提示' },
      { role: 'user', content: '初始用户请求' }
    ]
    const deltas = [
      ...request,
      { role: 'assistant', content: '' },
      { role: 'tool', content: '{"ok":true}' }
    ]
    const run = {
      apiCalls: [
        { requestMessages: request, toolRequestDeltas: deltas }
      ]
    }

    const built = buildRunWithPayloadRefs(run)
    const call = built.run.apiCalls[0]
    expect(built.payloads.filter(item => item.kind === 'request')).toHaveLength(1)
    expect(built.payloads.filter(item => item.kind === 'tool-delta')).toHaveLength(1)
    expect(built.refs.find(ref => ref.kind === 'tool-delta')?.duplicateCount).toBe(1)
    expect(call.requestMessages.__payload.id).not.toBe(call.toolRequestDeltas.__payload.id)
  })

  it('unwraps legacy inlined response payloads when re-exporting old traces', () => {
    const response = '旧版本导出的完整响应'
    const run = {
      apiCalls: [
        {
          requestMessages: [{ role: 'user', content: '旧请求' }],
          responseText: { __payload: { kind: 'response', value: response } },
          streamText: { __payload: { kind: 'stream', value: response } },
          physicalCalls: [
            { responseText: { __payload: { kind: 'response', value: response } } }
          ]
        }
      ]
    }

    const built = buildRunWithPayloadRefs(run)
    const call = built.run.apiCalls[0]
    expect(call.responseText).toBeUndefined()
    expect(call.responseTextPreview).toBe(response)
    expect(call.responseTextPayloadRef).toBe('payload-002')
    expect(call.legacyPayloadKind).toBe('response')
    expect(call.physicalCalls[0].responseText).toBeUndefined()
    expect(call.physicalCalls[0].responseTextPayloadRef).toBe('payload-002')

    const serialized = JSON.stringify(built.run)
    expect(serialized).not.toContain('"value":"旧版本导出的完整响应"')
  })

  it('indexes every exported API response so consumers can locate full replies after responseText is externalized', () => {
    const request = [{ role: 'user', content: '整理大纲' }]
    const response = '整理后的完整大纲响应'
    const reasoning = '模型思考内容'
    const run = {
      apiCalls: [
        {
          id: 'call-001',
          turnId: 'turn-001',
          seq: 1,
          status: 'success',
          requestMessages: request,
          responseText: response,
          streamText: response,
          reasoningText: reasoning,
          physicalCalls: [
            {
              id: 'physical-001',
              physicalCallId: 'physical-call-001',
              seq: 1,
              phase: 'normal',
              status: 'success',
              requestMessages: request,
              responseText: response,
              streamText: response,
              reasoningText: reasoning
            }
          ]
        }
      ]
    }

    const built = buildRunWithPayloadRefs(run)
    const indexEntry = built.run.apiResponseIndex[0]
    expect(indexEntry.apiCallId).toBe('call-001')
    expect(indexEntry.turnId).toBe('turn-001')
    expect(indexEntry.response.ref).toBe(built.run.apiCalls[0].responseTextPayloadRef)
    expect(indexEntry.response.chars).toBe(response.length)
    expect(indexEntry.response.preview).toBe(response)
    expect(indexEntry.stream.sha256).toBe(indexEntry.response.sha256)
    expect(indexEntry.reasoning.ref).toBeTruthy()
    expect(indexEntry.physicalCalls[0].physicalCallId).toBe('physical-call-001')
    expect(indexEntry.physicalCalls[0].response.ref).toBe(built.run.apiCalls[0].physicalCalls[0].responseTextPayloadRef)

    const responseRef = built.refs.find(ref => ref.id === indexEntry.response.ref)
    const responsePayload = built.payloads.find(item => item.kind === 'response').value
    expect(indexEntry.response.file).toBe(responseRef.file)
    expect(responseRef.sha256).toBe(
      crypto.createHash('sha256').update(responsePayload, 'utf8').digest('hex')
    )
    expect(indexEntry.response.bytes).toBe(Buffer.byteLength(responsePayload, 'utf8'))
  })

  it('reports an invalid apiResponseIndex instead of silently trusting broken refs', () => {
    const built = buildRunWithPayloadRefs({
      apiCalls: [{
        id: 'call-001',
        seq: 1,
        status: 'success',
        requestMessages: [{ role: 'user', content: '读取大纲' }],
        responseText: '完整响应'
      }]
    })
    const run = JSON.parse(JSON.stringify(built.run))
    run.apiResponseIndex[0].response.file = '999-response.json'
    const broken = verifyApiResponseIndex(run)
    expect(broken.ok).toBe(false)
    expect(broken.brokenRefs).toEqual([run.apiResponseIndex[0].response.ref])

    const intact = verifyApiResponseIndex(built.run)
    expect(intact.ok).toBe(true)
    expect(intact.total).toBe(1)
  })

  it('keeps folder fingerprints and deduplicates prompt snapshots by content', () => {
    const makeSnapshot = (id, apiCallId) => ({
      id,
      apiCallId,
      skillId: 'folder-outline',
      skillName: '大纲技能',
      mode: 'compose',
      builtAt: 1770000000000,
      folderFingerprint: [
        { file: 'SKILL.md', hash: 'a'.repeat(64), mtime: 1770000000000, bytes: 120 }
      ],
      contextBlocks: [
        { source: 'outline', version: 'v1', coverage: 'structure_map', content: '结构地图' }
      ],
      systemPrompt: '系统提示',
      userPrompt: '用户请求',
      finalMessages: [
        { role: 'system', content: '系统提示' },
        { role: 'user', content: '用户请求' }
      ]
    })
    const run = {
      promptSnapshots: [
        makeSnapshot('prompt-001', 'call-001'),
        makeSnapshot('prompt-002', 'call-002')
      ]
    }

    const built = buildRunWithPayloadRefs(run)
    expect(built.refs.filter(ref => ref.kind === 'prompt')).toHaveLength(1)
    expect(built.refs[0].duplicateCount).toBe(2)
    const snapshot = built.run.promptSnapshots[0]
    expect(snapshot.systemPrompt).toBeUndefined()
    expect(snapshot.payloadRef).toBe('payload-001')
    const payload = JSON.stringify(built.payloads.find(item => item.kind === 'prompt').value)
    expect(payload).toContain('"file":"SKILL.md"')
    expect(payload).toContain('"source":"outline"')
  })

  it('writes prompt payload bytes that match the declared sha256', () => {
    const run = {
      promptSnapshots: [{
        id: 'prompt-001',
        apiCallId: 'call-001',
        turnId: 'turn-001',
        builtAt: 1770000000000,
        skillId: 'folder-outline',
        skillName: '大纲技能',
        mode: 'compose',
        folderFingerprint: [
          { file: 'SKILL.md', hash: 'a'.repeat(64), mtime: 1770000000000, bytes: 120 }
        ],
        contextBlocks: [
          { source: 'outline', version: 'v1', coverage: 'structure_map', content: '结构地图' }
        ],
        systemPrompt: '系统提示',
        userPrompt: '用户请求',
        finalMessages: [
          { role: 'system', content: '系统提示' },
          { role: 'user', content: '用户请求' }
        ]
      }]
    }

    const built = buildRunWithPayloadRefs(run)
    const ref = built.refs[0]
    const payload = built.payloads[0].value
    const text = JSON.stringify(payload, null, 2)
    const bytes = Buffer.from(text, 'utf8')
    const digest = crypto.createHash('sha256').update(bytes).digest('hex')

    expect(ref.sha256).toBe(digest)
    expect(text).not.toContain('prompt-001')
    expect(text).not.toContain('call-001')
    expect(text).not.toContain('turn-001')
  })
})

describe('run trace diff export file naming', () => {
  it('keeps the .json extension and avoids overwriting an existing export', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-trace-diff-'))
    try {
      const first = path.join(dir, 'run-trace-diff.json')
      fs.writeFileSync(first, '{}', 'utf8')
      const second = uniqueExportFile(first)
      expect(second).toBe(path.join(dir, 'run-trace-diff-2.json'))
      expect(path.extname(second)).toBe('.json')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
