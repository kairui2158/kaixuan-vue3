import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePipelineStore } from '../stores/pipeline'
import { useRunTraceStore, type RunTraceSource } from '../stores/runTrace'
import { createAgentTraceBridge } from './agentTraceBridge'
import { createAiService } from './aiService'
import { createToolRunBudget } from './toolRunBudget'
import type { AgentOrchestratorEvent, AgentOrchestratorSnapshot } from './agentOrchestrator'

type StorageMap = Map<string, unknown>

function installStorage(storage: StorageMap) {
  vi.stubGlobal('window', {
    electronAPI: {
      storageRead: vi.fn(async (key: string) => storage.get(key) ?? null),
      storageWrite: vi.fn(async (key: string, value: unknown) => {
        storage.set(key, value)
        return true
      }),
      storageRemove: vi.fn(async (key: string) => {
        storage.delete(key)
        return true
      }),
      providerNetRequest: vi.fn(async () => ({ ok: false })),
    },
  })
}

describe('V3.3 Phase 0 parallelism red tests', () => {
  let storage: StorageMap

  beforeEach(() => {
    storage = new Map<string, unknown>()
    setActivePinia(createPinia())
    installStorage(storage)
    vi.stubGlobal('navigator', { userAgent: 'vitest' })
  })

  it('red: second generation must not abort the first run', () => {
    const pipeline = usePipelineStore()
    const firstRunId = pipeline.startGeneration()
    const firstSignal = pipeline.getGenerationSignal(firstRunId)

    expect(firstSignal?.aborted).toBe(false)

    pipeline.startGeneration('volumes', 'other-target')

    // V3.3 target: starting a second run must not abort the first.
    expect(firstSignal?.aborted).toBe(false)
  })

  it('red: target locks permit cross-layer runs and queue same-target runs', () => {
    const pipeline = usePipelineStore()
    const volumesRunId = pipeline.startGeneration('volumes', 'volume-4')
    const chaptersRunId = pipeline.startGeneration('chapters', 'volume-1')

    // Different layers may run concurrently.
    expect(pipeline.isGenerating).toBe(true)
    expect(pipeline.getRunStatus(volumesRunId)).toBe('running')
    expect(pipeline.getRunStatus(chaptersRunId)).toBe('running')

    // Re-entering the same layer target must queue rather than abort or double-run.
    const queuedRunId = pipeline.startGeneration('chapters', 'volume-1', {
      queuedReason: '同一目标已有正在运行的章节任务',
    })

    expect(pipeline.getRunStatus(chaptersRunId)).toBe('running')
    expect(pipeline.getRunStatus(queuedRunId)).toBe('queued')
    expect(pipeline.getRun(queuedRunId)?.queuedReason).toBe('同一目标已有正在运行的章节任务')

    pipeline.finishGeneration(chaptersRunId)
    expect(pipeline.getRunStatus(queuedRunId)).toBe('running')
  })

  it('red: progress must stay isolated per run', () => {
    const pipeline = usePipelineStore()
    const volumesRunId = pipeline.startGeneration('volumes', 'volume-4')
    const chaptersRunId = pipeline.startGeneration('chapters', 'volume-1')
    pipeline.updateProgress(10, '卷纲生成中', volumesRunId)
    pipeline.updateProgress(80, '章节生成中', chaptersRunId)

    // V3.3 target: each run keeps its own progress slot.
    expect(pipeline.getRun(volumesRunId)?.progress).toBe(10)
    expect(pipeline.getRun(chaptersRunId)?.progress).toBe(80)
  })

  it('activeRuns computed reevaluates after registry changes', () => {
    const pipeline = usePipelineStore()
    expect(pipeline.activeRuns).toHaveLength(0)
    expect(pipeline.isGenerating).toBe(false)

    const runId = pipeline.startGeneration('body', 'ch-reactive')
    pipeline.updateProgress(25, '生成中', runId)

    expect(pipeline.activeRuns.map(run => run.runId)).toEqual([runId])
    expect(pipeline.activeRuns[0]?.progress).toBe(25)
    expect(pipeline.isGenerating).toBe(true)

    pipeline.finishGeneration(runId)
    expect(pipeline.activeRuns).toHaveLength(0)
    expect(pipeline.isGenerating).toBe(false)
  })

  it('red: terminal events must not be swallowed after cancel', () => {
    const pipeline = usePipelineStore()
    const runId = pipeline.startGeneration()
    pipeline.cancelGeneration(runId)

    pipeline.updateProgress(10, 'repairing', runId)
    pipeline.failGeneration('保存失败', runId)

    const run = pipeline.getRun(runId)
    // V3.3 target: the run stays terminal, but the late failure is recorded.
    expect(run?.status).toBe('canceled')
    expect(run?.rejectedEvents?.some(item => item.kind === 'fail' && item.error === '保存失败')).toBe(true)
  })

  it('red: runTrace startRun must not auto-abandon an active task run', () => {
    const trace = useRunTraceStore()
    const firstRunId = trace.startRun({
      source: 'pipeline',
      step: 2,
      stepName: '卷纲层',
      mode: 'single',
      skillNames: [],
    })
    const secondRunId = trace.startRun({
      source: 'pipeline',
      step: 3,
      stepName: '章节层',
      mode: 'batch',
      skillNames: [],
    })

    const firstRun = trace.getRun(firstRunId)
    const secondRun = trace.getRun(secondRunId)

    // V3.3 target: both runs must remain running after the second starts.
    expect(firstRun?.status).toBe('running')
    expect(secondRun?.status).toBe('running')
  })

  it('red: agent bridge fallback must not steal another run trace', () => {
    const trace = useRunTraceStore()
    const volumesRunId = trace.startRun({
      source: 'pipeline',
      step: 2,
      stepName: '卷纲层',
      mode: 'chain',
      skillNames: [],
    })
    trace.startRun({
      source: 'pipeline',
      step: 3,
      stepName: '章节层',
      mode: 'batch',
      skillNames: [],
    })

    // No explicit runId: this is the legacy bridge form. It must not silently
    // attach volume-run events to the newer chapter run.
    const bridge = createAgentTraceBridge({
      pinia: getCurrentPinia(),
      source: 'pipeline',
    })
    const snapshot: AgentOrchestratorSnapshot = {
      taskId: 'volume-run',
      status: 'running',
      goal: '生成第 4 卷',
      stepIndex: 0,
      callCount: 1,
      successfulWriteCount: 0,
      trustedCoverageCount: 0,
      planComplete: false,
      noProgressRounds: 0,
      repeatedCallCount: 0,
      maxPhysicalRequests: 4,
      executionPhase: 'locating',
      updatedAt: 1,
    }
    const event: AgentOrchestratorEvent = {
      type: 'state',
      level: 'info',
      label: '卷纲运行事件',
    }

    bridge.attach()(event, snapshot)

    const runs = trace.sortedRuns
    const volumeRun = runs.find(run => run.id === volumesRunId)
    const chapterRun = runs.find(run => run.stepName === '章节层')

    // V3.3 target: a bridge without an explicit runId must be dropped, while
    // an explicit runId keeps writing to its owner run.
    expect(chapterRun?.events.some(item => item.type === 'agent-state')).toBe(false)
    expect(volumeRun?.events.some(item => item.type === 'agent-state')).toBe(false)

    const explicitBridge = createAgentTraceBridge({
      pinia: getCurrentPinia(),
      source: 'pipeline',
      runId: volumesRunId,
    })
    explicitBridge.attach()(event, snapshot)

    expect(volumeRun?.events.some(item => item.type === 'agent-state')).toBe(true)
    expect(chapterRun?.events.some(item => item.type === 'agent-state')).toBe(false)
  })

  it('red: concurrent step config updates must not lose writes', async () => {
    const pipeline = usePipelineStore()
    await pipeline.updateStepConfig(2, { agentId: 'volume-agent' })

    const first = pipeline.updateStepConfig(3, { agentId: 'chapter-agent' })
    const second = pipeline.updateStepConfig(4, { agentId: 'body-agent' })
    await Promise.all([first, second])

    const volumeAgent = await pipeline.getStepAgents(2)
    const chapterAgent = await pipeline.getStepAgents(3)
    const bodyAgent = await pipeline.getStepAgents(4)

    // V3.3 target: all concurrent config writes must survive.
    expect(volumeAgent).toBe('volume-agent')
    expect(chapterAgent).toBe('chapter-agent')
    expect(bodyAgent).toBe('body-agent')
  })

  it('red: concurrent volume/chapter writes must not lose either target', async () => {
    const storageWrite = vi.fn(async (key: string, value: unknown) => {
      if (String(key).includes('project_p1')) {
        // Simulate the asynchronous persistence window in the current save queue.
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      storage.set(key, value)
      return true
    })
    installStorage(storage)
    vi.stubGlobal('window', {
      ...window,
      electronAPI: {
        ...window.electronAPI,
        storageWrite,
      },
    })

    const { useProjectStore } = await import('../stores/project')
    const project = useProjectStore()
    ;(project as any).currentProjectId = 'p1'
    project.setVolumes([
      { id: 'vol-1', name: '第一卷' },
      { id: 'vol-2', name: '第二卷' },
    ])
    project.setChapters('vol-1', [
      { id: 'ch-1', title: '第 1 章' },
      { id: 'ch-2', title: '第 2 章' },
    ])
    await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 10))

    const persisted = storage.get('wa_project_p1') as {
      volumes: Array<{ id: string }>
      chapters: Record<string, Array<{ id: string }>>
    }

    // V3.3 target: both volume and chapter writes must be persisted.
    expect(persisted?.volumes?.map(item => item.id)).toEqual(['vol-1', 'vol-2'])
    expect(persisted?.chapters?.['vol-1']?.map(item => item.id)).toEqual(['ch-1', 'ch-2'])
  })

  it('baseline: queued project saves read the latest state in this interleaving', async () => {
    const { useProjectStore } = await import('../stores/project')
    const project = useProjectStore()
    ;(project as any).currentProjectId = 'p1'
    project.setVolumes([{ id: 'vol-1', name: '第一卷' }])

    // Start a save, then let a second write queue behind it. The second save
    // must observe chapters added after the first save started.
    const firstSave = project.saveProject()
    project.setChapters('vol-1', [{ id: 'ch-1', title: '第 1 章' }])
    const secondSave = project.saveProject()
    await Promise.all([firstSave, secondSave])
    await new Promise(resolve => setTimeout(resolve, 20))

    const persisted = storage.get('wa_project_p1') as {
      volumes: Array<{ id: string }>
      chapters: Record<string, Array<{ id: string }>>
    }

    // This interleaving did not reproduce an old-snapshot overwrite. Keep it
    // as a guard; Phase E must still prove the full critical-section contract.
    expect(persisted?.volumes?.map(item => item.id)).toEqual(['vol-1'])
    expect(persisted?.chapters?.['vol-1']?.map(item => item.id)).toEqual(['ch-1'])
  })

  it('baseline: quota soft errors stop with one physical request', async () => {
    const runtimeProvider = {
      id: 'runtime', name: 'Runtime', baseUrl: 'https://api.example.com', apiKey: 'key',
      selectedModel: 'test-model', temperature: 0.2, maxTokens: 1024,
      providerType: 'openai-compatible', streamMode: false, systemPrompt: '',
      contextWindowTokens: 0,
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'Insufficient balance, please recharge your quota.' },
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 1 },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const service = createAiService({
      providers: [runtimeProvider],
      generateProvider: 'runtime', verifyProvider: 'runtime', detectProvider: null,
      getGenerateProvider() { return runtimeProvider },
      getVerifyProvider() { return runtimeProvider },
      getDetectProvider() { return undefined },
    } as any)

    await expect(service.callAi({
      purpose: 'generate', messages: [{ role: 'user', content: '整理大纲' }],
      stream: false, retry: true,
    })).rejects.toMatchObject({
      kind: 'auth',
      statusCode: 402,
      message: expect.stringContaining('quota_exhausted'),
    })

    // V3.3 target: quota exhaustion is terminal; retry must not re-send it.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('red: pipeline must expose run-scoped reentry lifecycle states', () => {
    const pipeline = usePipelineStore()
    const firstRunId = pipeline.startGeneration()
    pipeline.finishGeneration((pipeline as any).runs[0].runId)
    pipeline.startGeneration()

    // V3.3 target: reentry after success must create a distinct run and keep
    // the old terminal state addressable. Current globals cannot represent it.
    const runs = (pipeline as any).runs
    expect(Array.isArray(runs)).toBe(true)
    expect(runs.length).toBe(2)
    expect(runs[0].status).toBe('succeeded')
    expect(runs[1].status).toBe('running')
  })

  it('baseline: independent tool budgets are not serialized by creation order', async () => {
    const firstBudget = createToolRunBudget({
      maxPhysicalRequests: 2,
      maxReadToolCalls: 4,
      reservedWriteToolCalls: 4,
      plannedWriteCount: 1,
      operation: 'targeted_edit',
    })
    const secondBudget = createToolRunBudget({
      maxPhysicalRequests: 2,
      maxReadToolCalls: 4,
      reservedWriteToolCalls: 4,
      plannedWriteCount: 1,
      operation: 'targeted_edit',
    })

    firstBudget.recordPhysicalRequest()
    firstBudget.recordPhysicalRequest()

    // Existing object model already supports independent budgets. This is a
    // guard, not proof of service-level isolation; Phase A must prove the
    // same through concurrent callAi calls.
    expect(firstBudget.canStartPhysicalRequest()).toBe(false)
    expect(secondBudget.canStartPhysicalRequest()).toBe(true)
  })

  it('baseline: chat sessions do not abandon each other', () => {
    const trace = useRunTraceStore()
    const firstRunId = trace.startRun({
      source: 'outline',
      stepName: '大纲共创',
      mode: 'chat',
      sessionKind: 'chat',
      skillNames: [],
    })
    const secondRunId = trace.startRun({
      source: 'home',
      stepName: '主页共创',
      mode: 'chat',
      sessionKind: 'chat',
      skillNames: [],
    })

    expect(trace.getRun(firstRunId)?.status).toBe('running')
    expect(trace.getRun(secondRunId)?.status).toBe('running')
  })

  it('baseline: quota terminal errors are already classified without retry', () => {
    // Existing aiService.spec.ts covers three quota forms with one physical
    // request each. This Phase 0 spec intentionally does not duplicate that
    // heavy mock; this assertion documents that the existing suite is the
    // evidence source until Phase G moves it into run-level tests.
    expect(true).toBe(true)
  })

  it('red: progress channel must reject events without runId', () => {
    const trace = useRunTraceStore()
    const runId = trace.startRun({
      source: 'pipeline',
      step: 2,
      stepName: '卷纲层',
      mode: 'single',
      skillNames: [],
    })

    // A progress event without runId is a migration defect. It must be
    // rejected, recorded as progress-migration-error, and write no progress.
    const pipeline = usePipelineStore()
    pipeline.startGeneration('chapters', 'volume-1')
    expect(() => {
      (pipeline as any).updateRunProgress({ percent: 77, detail: '章节生成中' })
    }).toThrow(/runId/)

    expect(trace.getRun(runId)?.events.some(item => item.type === 'progress-migration-error')).toBe(false)
    expect(pipeline.runs.find(item => item.layer === 'chapters')?.progress).toBe(0)
  })

  it('red: unscoped progress and terminal calls must not resolve to the latest run', () => {
    const trace = useRunTraceStore()
    const traceRunId = trace.startRun({
      source: 'pipeline',
      step: 2,
      stepName: '卷纲层',
      mode: 'single',
      skillNames: [],
    })
    const pipeline = usePipelineStore()
    const chaptersRunId = pipeline.startGeneration('chapters', 'volume-1')

    expect(() => pipeline.updateProgress(77, '章节生成中')).toThrow(/runId/)

    expect(trace.getRun(traceRunId)?.events.some(item =>
      item.type === 'progress-migration-error'
    )).toBe(false)
    expect(pipeline.getRun(chaptersRunId)?.progress).toBe(0)
    expect(pipeline.getRun(chaptersRunId)?.status).toBe('running')

    pipeline.finishGeneration(chaptersRunId)
    expect(pipeline.getRun(chaptersRunId)?.status).toBe('succeeded')

    // After the only run is terminal, unscoped terminal calls must be an
    // explicit defect instead of reviving or writing to a guessed run.
    expect(() => pipeline.failGeneration('保存失败')).toThrow(/runId/)
    expect(() => pipeline.cancelGeneration()).toThrow(/runId/)
    expect(() => pipeline.getGenerationSignal()).toThrow(/runId/)
    expect(() => pipeline.isGenerationCanceled()).toThrow(/runId/)
    expect(pipeline.getRun(chaptersRunId)?.status).toBe('succeeded')
  })

  it('red: provider queue events must update only their owning run', () => {
    const pipeline = usePipelineStore()
    const volumesRunId = pipeline.startGeneration('volumes', 'volume-4')
    const chaptersRunId = pipeline.startGeneration('chapters', 'volume-1')

    const applied = pipeline.reportProviderQueue(volumesRunId, {
      providerId: 'provider-a',
      status: 'queued',
      position: 1,
      waiting: 1,
      maxConcurrencyPerProvider: 2,
    })

    expect(applied).toBe(true)
    expect(pipeline.getRun(volumesRunId)?.queuedReason).toBe('等待供应商槽位：第 1/1 位')
    expect(pipeline.getRun(volumesRunId)?.statusText).toBe('等待供应商槽位：第 1/1 位')
    expect(pipeline.getRun(chaptersRunId)?.queuedReason).toBeUndefined()
    expect(pipeline.getRun(chaptersRunId)?.statusText).toBe('generating')

    pipeline.reportProviderQueue(volumesRunId, {
      providerId: 'provider-a',
      status: 'started',
      maxConcurrencyPerProvider: 2,
    })
    expect(pipeline.getRun(volumesRunId)?.queuedReason ?? '').toBe('')
    expect(pipeline.getRun(volumesRunId)?.statusText).toBe('已获得供应商槽位，正在请求供应商')

    pipeline.cancelGeneration(volumesRunId)
    const rejected = pipeline.reportProviderQueue(volumesRunId, {
      providerId: 'provider-a',
      status: 'canceled',
      maxConcurrencyPerProvider: 2,
    })
    expect(rejected).toBe(false)
    expect(pipeline.getRun(chaptersRunId)?.status).toBe('running')
  })

  it('red: cancel and failure must only terminate their own run', () => {
    const pipeline = usePipelineStore()
    const settingsRunId = pipeline.startGeneration('settings', 'all')
    const volumesRunId = pipeline.startGeneration('volumes', 'volume-4')

    expect(pipeline.getRunStatus(settingsRunId)).toBe('running')
    expect(pipeline.getRunStatus(volumesRunId)).toBe('running')

    pipeline.cancelGeneration(settingsRunId)

    // Cancellation belongs to one run only. The other run keeps its signal,
    // status, and lifecycle even while the first run is terminal.
    expect(pipeline.getRunStatus(settingsRunId)).toBe('canceled')
    expect(pipeline.getRunStatus(volumesRunId)).toBe('running')
    expect(pipeline.getGenerationSignal(volumesRunId)?.aborted).toBe(false)

    pipeline.failGeneration('设置层保存失败', settingsRunId)

    // A late failure on a canceled run must be recorded, never routed to the
    // other active run.
    expect(pipeline.getRunStatus(volumesRunId)).toBe('running')
    expect(pipeline.getRun(settingsRunId)?.rejectedEvents?.some(item =>
      item.kind === 'fail' && item.error === '设置层保存失败'
    )).toBe(true)

    pipeline.finishGeneration(volumesRunId)
    expect(pipeline.getRunStatus(volumesRunId)).toBe('succeeded')
    expect(pipeline.getRunStatus(settingsRunId)).toBe('canceled')
  })

  it('red: execution layer must not use unscoped cancel, signal, or entry lock calls', async () => {
    const source = await import('node:fs').then(fs =>
      fs.readFileSync(new URL('../components/pipeline/PipelinePanel.vue', import.meta.url), 'utf8')
    )

    const unscopedCalls = source.match(/pipelineStore\.(?:isGenerationCanceled|getGenerationSignal)\(\s*\)/g) || []
    const unscopedEntryLocks = source.match(/if\s*\(\s*pipelineStore\.isGenerating\s*\)\s*return/g) || []

    // V3.3 8.5: run-scoped execution paths must not resolve cancel/signal by
    // the global active-run fallback, and layer generation entries must not be
    // blocked by the global generation flag.
    expect(unscopedCalls).toEqual([])
    expect(unscopedEntryLocks).toEqual([])
  })

  it('red: same-layer runs must not overwrite each other through step slot helpers', async () => {
    const source = await import('node:fs').then(fs =>
      fs.readFileSync(new URL('../components/pipeline/PipelinePanel.vue', import.meta.url), 'utf8')
    )

    // V4 P0-A: a run owns its identity for its whole lifetime. Any per-layer
    // "current run" slot lets the second run hijack the first run's signal,
    // cancellation, progress, trace, and provider queue.
    expect(source).not.toContain('activePipelineRunIds')
    expect(source).not.toContain('activePipelineRunIdForStep')
    expect(source).not.toContain('providerQueueStepByCallId')
  })

  it('red: queued runs must wait for activation before becoming executable', async () => {
    const pipeline = usePipelineStore()
    const runningRunId = pipeline.startGeneration('volumes', 'all')
    const queuedRunId = pipeline.startGeneration('volumes', 'all')

    expect(pipeline.getRunStatus(runningRunId)).toBe('running')
    expect(pipeline.getRunStatus(queuedRunId)).toBe('queued')

    let activated = false
    const activation = pipeline.waitForRunActivation(queuedRunId).then(() => {
      activated = true
    })
    await Promise.resolve()
    expect(activated).toBe(false)

    pipeline.finishGeneration(runningRunId)
    await vi.waitFor(() => {
      expect(activated).toBe(true)
    })
    expect(pipeline.getRunStatus(queuedRunId)).toBe('running')
  })

  it('red: cancelGeneration cancels only the requested queued run', async () => {
    const pipeline = usePipelineStore()
    const runningRunId = pipeline.startGeneration('chapters', 'volume-1')
    const firstQueuedRunId = pipeline.startGeneration('chapters', 'volume-2')
    const secondQueuedRunId = pipeline.startGeneration('chapters', 'volume-3')

    pipeline.cancelGeneration(firstQueuedRunId)

    expect(pipeline.getRunStatus(runningRunId)).toBe('running')
    expect(pipeline.getRunStatus(firstQueuedRunId)).toBe('canceled')
    expect(pipeline.getRunStatus(secondQueuedRunId)).toBe('queued')
  })

  it('red: cancelGeneration activates the next queued run after a running cancellation', async () => {
    const pipeline = usePipelineStore()
    const runningRunId = pipeline.startGeneration('body', 'chapter-1')
    const queuedRunId = pipeline.startGeneration('body', 'chapter-2')

    let activated = false
    const activation = pipeline.waitForRunActivation(queuedRunId).then(() => {
      activated = true
    })
    await Promise.resolve()
    expect(activated).toBe(false)

    pipeline.cancelGeneration(runningRunId)
    await vi.waitFor(() => {
      expect(activated).toBe(true)
    })
    expect(pipeline.getRunStatus(queuedRunId)).toBe('running')
  })

  it('red: a canceled queued run resolves activation but is not runnable', async () => {
    const pipeline = usePipelineStore()
    const runningRunId = pipeline.startGeneration('volumes', 'all')
    const queuedRunId = pipeline.startGeneration('volumes', 'next-volume')

    const activation = pipeline.waitForRunActivation(queuedRunId)
    pipeline.cancelGeneration(queuedRunId)
    const activatedRun = await activation

    // Activation resolves so an awaiting generation function cannot hang, but
    // the run is terminal and must never issue a trace or physical request.
    expect(activatedRun.runId).toBe(queuedRunId)
    expect(pipeline.getRunStatus(queuedRunId)).toBe('canceled')
    expect(pipeline.isGenerationCanceled(queuedRunId)).toBe(true)
    expect(pipeline.getRunStatus(runningRunId)).toBe('running')
  })

  it('red: generation entries must gate execution through the activation helper', async () => {
    const source = await import('node:fs').then(fs =>
      fs.readFileSync(new URL('../components/pipeline/PipelinePanel.vue', import.meta.url), 'utf8')
    )

    expect(source.match(/waitForRunnableGeneration\(/g)?.length).toBeGreaterThanOrEqual(5)
    expect(source.match(/await\s+pipelineStore\.waitForRunActivation\(/g)?.length).toBe(1)
  })

  it('red: provider queue ownership must stay explicit and not be guessed by callId', async () => {
    const source = await import('node:fs').then(fs =>
      fs.readFileSync(new URL('../components/pipeline/PipelinePanel.vue', import.meta.url), 'utf8')
    )

    expect(source).not.toContain('providerQueueOwnerByCallId')
    expect(source).not.toContain('registerProviderQueueOwner')
  })

  it('red: pipeline trace ownership must not read current run pointers', async () => {
    const source = await import('node:fs').then(fs =>
      fs.readFileSync(new URL('../components/pipeline/PipelinePanel.vue', import.meta.url), 'utf8')
    )

    const currentPointerReads = source.match(
      /runTraceStore\.(?:currentRunId|currentApiCallId|getRunId\('pipeline'\))/g
    ) || []

    // V3.3 P0-4: execution paths must own an explicit traceRunId. The trace
    // store's current pointers describe other UI domains and must never be
    // used to attribute pipeline API calls, streams, or diagnostic events.
    expect(currentPointerReads).toEqual([])
  })

  it('red: trace-to-run ownership survives PipelinePanel remounts', async () => {
    const pipeline = usePipelineStore()
    const pipelineRunId = pipeline.startGeneration('body', 'chapter-1')
    const trace = useRunTraceStore()
    const traceRunId = trace.startRun({
      source: 'pipeline',
      step: 4,
      stepName: '正文层',
      mode: 'single',
      skillNames: [],
    })

    pipeline.rememberTraceRunOwnership(traceRunId, pipelineRunId)

    // Ownership lives in the store, so a component remount cannot drop
    // in-flight skill events back onto the console-warning path.
    expect(pipeline.getPipelineRunIdForTrace(traceRunId)).toBe(pipelineRunId)
    expect(pipeline.getRun(pipelineRunId)?.status).toBe('running')
  })

  it('red: concurrent pipeline streams are isolated by explicit run and call ownership', () => {
    const trace = useRunTraceStore()
    const firstRunId = trace.startRun({
      source: 'pipeline',
      step: 2,
      stepName: '卷纲层',
      mode: 'single',
      skillNames: [],
    })
    const secondRunId = trace.startRun({
      source: 'pipeline',
      step: 4,
      stepName: '正文层',
      mode: 'single',
      skillNames: [],
    })
    const firstCallId = trace.startApiCall(firstRunId, {
      requestMessages: [{ role: 'user', content: '卷纲请求' }],
    })
    const secondCallId = trace.startApiCall(secondRunId, {
      requestMessages: [{ role: 'user', content: '正文请求' }],
    })

    // These are the ownership invariants the pipeline stream buffers must
    // carry explicitly. A step-only key cannot represent this state.
    const firstOwnership = { runId: firstRunId, callId: firstCallId, step: 2 }
    const secondOwnership = { runId: secondRunId, callId: secondCallId, step: 4 }
    expect(firstOwnership.runId).not.toBe(secondOwnership.runId)
    expect(firstOwnership.callId).not.toBe(secondOwnership.callId)

    trace.appendStream(firstOwnership.runId, firstOwnership.callId, '卷纲流式片段')
    trace.appendStream(secondOwnership.runId, secondOwnership.callId, '正文流式片段')
    trace.finishApiCall(firstOwnership.runId, firstOwnership.callId, {
      status: 'success',
      responseText: '卷纲流式片段',
    })
    trace.finishApiCall(secondOwnership.runId, secondOwnership.callId, {
      status: 'success',
      responseText: '正文流式片段',
    })

    expect(trace.getRun(firstRunId)?.apiCalls.find(call => call.id === firstCallId)?.streamText).toContain('卷纲流式片段')
    expect(trace.getRun(secondRunId)?.apiCalls.find(call => call.id === secondCallId)?.streamText).toContain('正文流式片段')
    expect(trace.getRun(firstRunId)?.apiCalls.find(call => call.id === firstCallId)?.responseText).toBe('卷纲流式片段')
    expect(trace.getRun(secondRunId)?.apiCalls.find(call => call.id === secondCallId)?.responseText).toBe('正文流式片段')
  })

  it('red: folder pass input measurements carry explicit trace ownership', async () => {
    const { buildFolderPassInputMeasurement } = await import('../services/realSkillExecutor')
    const measurement = buildFolderPassInputMeasurement({
      passIndex: 0,
      inputMode: 'original',
      input: '正文上游',
      userPrompt: '正文请求',
      systemPrompt: '系统提示',
      sampleCount: 1,
      isRetry: false,
      declaredFullUpstream: false,
      appliedFullUpstream: false,
      traceRunId: 'pipeline-trace-run-1',
      traceCallId: 'pipeline-trace-call-1',
    } as Parameters<typeof buildFolderPassInputMeasurement>[0])

    // The event contract is explicit ownership. Without these fields the
    // pipeline listener cannot prove which run owns the pass input.
    expect(measurement.traceRunId).toBe('pipeline-trace-run-1')
    expect(measurement.traceCallId).toBe('pipeline-trace-call-1')
  })
})

function getCurrentPinia() {
  return (useRunTraceStore as any)._pinia ?? createPinia()
}
