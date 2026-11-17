import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { buildRunWithPayloadRefs, deduplicatePayloads, listRunDirectories, readRunDirectory, setDataDir, uniqueExportFile, verifyApiResponseIndex } = await import('./runTrace')

describe('run trace payload deduplication', () => {
  it('marks payload roles for multi-call and multi-physical-request traces', () => {
    const run = {
      status: 'success',
      apiCalls: [
        {
          requestMessages: [{ role: 'user', content: 'S1 请求' }],
          responseText: 'S1 输出',
          physicalCalls: [
            { requestMessages: [{ role: 'user', content: 'S1 物理请求' }] },
            { requestMessages: [{ role: 'user', content: 'S1 重试物理请求' }] }
          ]
        },
        {
          requestMessages: [{ role: 'user', content: 'S2 请求' }],
          responseText: 'S2 输出'
        }
      ]
    }

    const built = buildRunWithPayloadRefs(run)
    const roles = built.payloads.map(item => ({ kind: item.kind, role: item.artifactRole }))

    expect(roles).toContainEqual({ kind: 'request', role: 'intermediate' })
    expect(roles).toContainEqual({ kind: 'response', role: 'intermediate' })
    expect(roles).toContainEqual({ kind: 'request', role: 'final' })
    expect(roles).toContainEqual({ kind: 'response', role: 'final' })
    expect(built.payloads.filter(item => item.kind === 'request' && item.artifactRole === 'final')).toHaveLength(1)
    expect(built.payloads.filter(item => item.kind === 'response' && item.artifactRole === 'final')).toHaveLength(1)
    expect(built.payloads.every(item => item.artifactRole === 'final' || item.artifactRole === 'intermediate')).toBe(true)
    expect(built.refs.every(ref => ref.artifactRole === 'final' || ref.artifactRole === 'intermediate')).toBe(true)
  })

  it('marks duplicated payloads as final when any owner is final', () => {
    const run = {
      status: 'success',
      apiCalls: [
        {
          requestMessages: [{ role: 'user', content: 'same request' }],
          responseText: 'first response'
        },
        {
          requestMessages: [{ role: 'user', content: 'same request' }],
          responseText: 'final response'
        }
      ]
    }

    const built = buildRunWithPayloadRefs(run)
    const requestRef = built.refs.find(ref => ref.kind === 'request')

    expect(requestRef.duplicateCount).toBe(2)
    expect(requestRef.artifactRole).toBe('final')
    expect(built.payloads.find(item => item.kind === 'request').artifactRole).toBe('final')
  })

  it('records first seen attempt ownership without reordering payload ids', () => {
    const sharedRequest = [{ role: 'user', content: 'S1 重试请求' }]
    const run = {
      status: 'success',
      apiCalls: [
        {
          id: 'api-001',
          seq: 1,
          requestMessages: [{ role: 'user', content: 'S1 请求' }],
          responseText: 'S1 输出',
          physicalCalls: [
            {
              id: 'physical-001',
              physicalCallId: 'physical-attempt-1',
              seq: 1,
              requestMessages: sharedRequest,
              responseText: '第一次尝试输出',
              temperature: 0.2,
              maxTokens: 2048,
              thinkingDisableParam: 'thinking',
              thinkingDisableValue: '{"type":"disabled"}'
            },
            {
              id: 'physical-002',
              physicalCallId: 'physical-attempt-2',
              seq: 2,
              requestMessages: sharedRequest,
              responseText: '最终尝试输出'
            }
          ]
        },
        {
          id: 'api-002',
          seq: 2,
          requestMessages: [{ role: 'user', content: 'S2 请求' }],
          responseText: 'S2 输出'
        }
      ],
      promptSnapshots: [{ id: 'prompt-001', apiCallId: 'api-001', systemPrompt: 'S1' }],
      processingReports: [{ id: 'report-001', inputPreview: '处理输入', outputPreview: '处理输出' }],
      folderDiagnostics: [{ status: 'success', output: 'S2 输出' }]
    }

    const built = buildRunWithPayloadRefs(run)
    const requestRef = built.refs.find(ref => ref.kind === 'request' && ref.sha256 ===
      built.refs.find(item => item.kind === 'request' && item.firstSeen?.physicalCallId === 'physical-attempt-1')?.sha256)

    expect(built.refs.filter(ref => ref.kind === 'request')).toHaveLength(3)
    expect(requestRef.duplicateCount).toBe(2)
    expect(requestRef.id).toBe('payload-003')
    expect(requestRef.firstSeen).toEqual({
      apiCallId: 'api-001',
      apiCallSeq: 1,
      physicalCallId: 'physical-attempt-1',
      physicalCallSeq: 1,
      requestTemperature: 0.2,
      requestMaxTokens: 2048,
      requestThinkingDisableParam: 'thinking',
      requestThinkingDisableValue: '{"type":"disabled"}',
      firstSeenSource: 'physicalRequest'
    })

    const indexByRef = new Map(built.run.payloadToAttemptIndex.map(entry => [entry.payloadRef, entry]))
    expect(indexByRef.get('payload-003')).toEqual({
      payloadRef: 'payload-003',
      apiCallId: 'api-001',
      apiCallSeq: 1,
      physicalCallId: 'physical-attempt-1',
      physicalCallSeq: 1,
      requestTemperature: 0.2,
      requestMaxTokens: 2048,
      requestThinkingDisableParam: 'thinking',
      requestThinkingDisableValue: '{"type":"disabled"}',
      firstSeenSource: 'physicalRequest'
    })
    expect(indexByRef.get('payload-001').firstSeenSource).toBe('logicalRequest')
    expect(indexByRef.get('payload-008').firstSeenSource).toBe('promptSnapshots')
    expect(indexByRef.get('payload-009').firstSeenSource).toBe('processingReports')
    expect(indexByRef.get('payload-010').firstSeenSource).toBe('processingReports')
    expect(indexByRef.get('payload-011').firstSeenSource).toBe('folderDiagnostics')
  })

  it('keeps running chain requests intermediate even when diagnostics repeat the last request', () => {
    const request = [
      { role: 'system', content: 'S'.repeat(1200) },
      { role: 'user', content: 'U'.repeat(1200) }
    ]
    const run = {
      status: 'running',
      apiCalls: [
        { requestMessages: [{ role: 'user', content: 'S1 请求' }] },
        { requestMessages: [{ role: 'user', content: 'S2 请求' }] },
        { requestMessages: request }
      ],
      folderDiagnostics: [
        { status: 'success', output: 'S3 输出', apiMeta: { requestMessages: request } }
      ]
    }

    const built = buildRunWithPayloadRefs(run)
    const requestRefs = built.refs.filter(ref => ref.kind === 'request')

    expect(requestRefs.every(ref => ref.artifactRole === 'intermediate')).toBe(true)
    expect(requestRefs.find(ref => ref.chars === JSON.stringify(request, null, 2).length)?.duplicateCount).toBe(2)
  })

  it('does not promote every single-physical-call request to final', () => {
    const run = {
      status: 'success',
      apiCalls: [
        {
          requestMessages: [{ role: 'user', content: 'B1 S1 请求' }],
          responseText: 'B1 S1 输出',
          physicalCalls: [
            { requestMessages: [{ role: 'user', content: 'B1 S1 请求' }], responseText: 'B1 S1 输出' }
          ]
        },
        {
          requestMessages: [{ role: 'user', content: 'B3 S4 请求' }],
          responseText: 'B3 S4 输出',
          physicalCalls: [
            { requestMessages: [{ role: 'user', content: 'B3 S4 请求' }], responseText: 'B3 S4 输出' }
          ]
        }
      ]
    }

    const built = buildRunWithPayloadRefs(run)
    const requestRefs = built.refs.filter(ref => ref.kind === 'request')
    const responseRefs = built.refs.filter(ref => ref.kind === 'response')

    expect(requestRefs).toHaveLength(2)
    expect(responseRefs).toHaveLength(2)
    expect(requestRefs.filter(ref => ref.artifactRole === 'intermediate')).toHaveLength(1)
    expect(requestRefs.filter(ref => ref.artifactRole === 'final')).toHaveLength(1)
    expect(responseRefs.filter(ref => ref.artifactRole === 'intermediate')).toHaveLength(1)
    expect(responseRefs.filter(ref => ref.artifactRole === 'final')).toHaveLength(1)
    expect(requestRefs.every(ref => ref.duplicateCount === 2)).toBe(true)
  })

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

  it('keeps high-frequency agent diagnostics inline and out of payload files', () => {
    const payload = {
      taskId: 'final-draft-1',
      streamingChars: 42,
      throughputStatus: 'streaming_active'
    }
    const run = {
      events: [
        { id: 'event-1', type: 'final-draft-throughput-streaming_active', payload },
        { id: 'event-2', type: 'final-draft-throughput-streaming_active', payload }
      ]
    }

    const built = buildRunWithPayloadRefs(run)
    expect(built.payloads).toHaveLength(0)
    expect(built.run.payloads).toHaveLength(0)
    built.run.events.forEach(event => {
      expect(event.payload).toEqual(payload)
      expect(event.payloadRefs).toBeUndefined()
    })
    expect(JSON.stringify(built.run)).toContain('streaming_active')
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

    const ownerByRef = new Map(built.run.payloadToAttemptIndex.map(entry => [entry.payloadRef, entry]))
    const streamOwner = ownerByRef.get(indexEntry.stream.ref)
    expect(streamOwner.apiCallId).toBe(indexEntry.apiCallId)
    expect(streamOwner.apiCallSeq).toBe(indexEntry.seq)

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

describe('run trace history restore', () => {
  it('lists and reads persisted runs with external payloads rehydrated', async () => {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'run-trace-history-'))
    setDataDir(dataRoot)
    try {
      const run = {
        id: 'run-restore-001',
        source: 'pipeline',
        status: 'success',
        startedAt: 1770000000000,
        apiCalls: [{
          id: 'call-001',
          seq: 1,
          requestMessages: [{ role: 'user', content: '生成卷纲' }],
          responseText: '完整响应',
          streamText: '完整流式',
          reasoningText: '思考'
        }],
        payloads: []
      }
      const built = buildRunWithPayloadRefs(run)
      const dirName = 'run-trace-卷纲层-1770000000000'
      const runDir = path.join(dataRoot, 'run-trace', 'pipeline', dirName)
      fs.mkdirSync(path.join(runDir, 'payloads'), { recursive: true })
      built.refs.forEach((ref, index) => {
        const item = built.payloads[index]
        const content = typeof item.value === 'string' ? item.value : JSON.stringify(item.value, null, 2)
        fs.writeFileSync(path.join(runDir, 'payloads', ref.file), content, 'utf8')
      })
      fs.writeFileSync(path.join(runDir, 'run-trace.json'), JSON.stringify(built.run, null, 2), 'utf8')

      const listed = await listRunDirectories('pipeline')
      expect(listed.success).toBe(true)
      expect(listed.runs).toHaveLength(1)
      expect(listed.runs[0]).toMatchObject({ dirName, id: run.id, status: 'success', apiCallCount: 1 })

      const read = await readRunDirectory('pipeline', dirName)
      expect(read.success).toBe(true)
      expect(read.run.id).toBe(run.id)
      expect(read.run.apiCalls[0].requestMessages).toEqual([{ role: 'user', content: '生成卷纲' }])
      expect(read.run.apiCalls[0].responseText).toBe('完整响应')
      expect(read.run.apiCalls[0].streamText).toBe('完整流式')
      expect(read.run.apiCalls[0].reasoningText).toBe('思考')
    } finally {
      setDataDir('')
      fs.rmSync(dataRoot, { recursive: true, force: true })
    }
  })

  it('rejects invalid directories and reports missing traces without reading outside the source root', async () => {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'run-trace-history-invalid-'))
    setDataDir(dataRoot)
    try {
      await expect(readRunDirectory('pipeline', '../escape')).resolves.toMatchObject({ success: false, reason: '无效目录' })
      await expect(readRunDirectory('pipeline', 'missing-run')).resolves.toMatchObject({ success: false, reason: '运行记录不存在' })
      const empty = await listRunDirectories('pipeline')
      expect(empty.success).toBe(true)
      expect(empty.runs).toEqual([])
    } finally {
      setDataDir('')
      fs.rmSync(dataRoot, { recursive: true, force: true })
    }
  })
})
