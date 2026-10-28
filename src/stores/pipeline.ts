import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { storageKey } from '../utils/storage-key'
import { useRunTraceStore } from './runTrace'
import {
  PipelineRunRegistry,
  type PipelineRunContext,
  type PipelineRunLayer,
  type PipelineRunProgressEvent,
  type PipelineRunStatus,
} from '../services/runRegistry'
import { RunProgressChannel } from '../services/runProgressChannel'
import type { ProviderQueueEvent } from '../services/providerScheduler'

export const usePipelineStore = defineStore('pipeline', () => {
  const currentStep = ref(0)  // 0=outline, 1=settings, 2=volumes, 3=chapters, 4=body
  const registry = new PipelineRunRegistry()
  const registryVersion = ref(0)
  const traceOwnership = new Map<string, string>()
  const runs = computed(() => {
    void registryVersion.value
    return registry.listRuns().map(run => ({ ...run }))
  })
  const activeRuns = computed(() => {
    void registryVersion.value
    return registry.listRuns()
      .filter(run => run.status === 'running' || run.status === 'queued')
      .map(run => ({ ...run }))
  })
  const isGenerating = computed(() => activeRuns.value.length > 0)
  const generationStatus = computed(() => {
    void registryVersion.value
    const active = activeRuns.value
    if (active.length > 0) return 'generating'
    const failed = registry.listRuns().filter(run => run.status === 'failed')
    if (failed.length > 0) return `failed: ${failed[failed.length - 1].error || failed[failed.length - 1].statusText || 'unknown'}`
    const canceled = registry.listRuns().filter(run => run.status === 'canceled')
    if (canceled.length > 0) return 'canceled'
    return registry.listRuns().length > 0 ? 'done' : ''
  })
  const breakpoint = ref<any>(null)
  const chapterProgress = ref<{ volumeIndex: number; chapterIndex: number; total: number } | null>(null)
  let stepConfigWriteQueue: Promise<unknown> = Promise.resolve()

  const stepNames = ['outline', 'settings', 'volumes', 'chapters', 'body']
  const currentStepName = computed(() => stepNames[currentStep.value] || '')

  function setStep(step: number) {
    currentStep.value = step
  }

  function notifyRegistryChanged() {
    registryVersion.value += 1
  }

  function activeRunForLayer(layer: PipelineRunLayer): PipelineRunContext | undefined {
    const active = activeRuns.value.filter(run => run.layer === layer)
    return active.length > 0 ? active[active.length - 1] : undefined
  }

  const activeSettingsRun = computed(() => activeRunForLayer('settings'))
  const activeVolumesRun = computed(() => activeRunForLayer('volumes'))
  const activeChaptersRun = computed(() => activeRunForLayer('chapters'))
  const activeBodyRun = computed(() => activeRunForLayer('body'))
  function isTargetGenerating(layer: PipelineRunLayer, target: string): boolean {
    return activeRuns.value.some(run =>
      run.layer === layer && run.target === target && run.status === 'running'
    )
  }

  async function waitForRunActivation(runId: string): Promise<PipelineRunContext> {
    const run = await registry.waitForActivation(runId)
    notifyRegistryChanged()
    return run
  }
  const activeLayer = computed<PipelineRunLayer>(() => stepNames[currentStep.value] === 'settings'
    ? 'settings'
    : stepNames[currentStep.value] === 'volumes'
      ? 'volumes'
      : stepNames[currentStep.value] === 'chapters'
        ? 'chapters'
        : stepNames[currentStep.value] === 'body'
          ? 'body'
          : 'volumes')

  function startGeneration(
    layer: PipelineRunLayer = 'volumes',
    target = 'all',
    options: {
      configSnapshot?: Record<string, unknown>
      queuedReason?: string
    } = {},
  ) {
    const layerBusy = activeRuns.value.some(item => item.layer === layer)
    const run = registry.createRun({
      layer,
      target,
      configSnapshot: options.configSnapshot,
      status: layerBusy ? 'queued' : 'running',
      queuedReason: layerBusy
        ? (options.queuedReason || '该层已有正在运行的任务，本任务已排队')
        : undefined,
    })
    notifyRegistryChanged()
    return run.runId
  }

  function updateProgress(percent: number, status?: string, runId?: string) {
    if (!runId) {
      // The channel records the migration error before the caller-visible throw.
      progressChannel.emit({ percent, detail: status })
      notifyRegistryChanged()
      throw new Error('progress event requires runId')
    }
    progressChannel.emit({
      runId,
      percent,
      detail: status,
    })
    notifyRegistryChanged()
  }

  function requireRunId(runId: string | undefined, operation: string): string {
    if (!runId) throw new Error(`${operation} requires runId`)
    return runId
  }

  function finishGeneration(runId?: string) {
    const targetRunId = requireRunId(runId, 'finishGeneration')
    const finished = registry.getRun(targetRunId)
    const wasActive = finished?.status === 'running' || finished?.status === 'queued'
    registry.succeed(targetRunId)
    if (finished && wasActive) {
      registry.activateQueuedRuns(finished.layer, finished.target)
    }
    notifyRegistryChanged()
  }

  function failGeneration(error: string, runId?: string) {
    const targetRunId = requireRunId(runId, 'failGeneration')
    const failedRun = registry.getRun(targetRunId)
    const wasActive = failedRun?.status === 'running' || failedRun?.status === 'queued'
    const failed = registry.fail(targetRunId, error)
    if (!failed) {
      registry.recordRejectedRunEvent(targetRunId, {
        kind: 'fail',
        reason: 'terminal_run',
        error,
      })
    }
    if (failedRun && wasActive) {
      registry.activateQueuedRuns(failedRun.layer, failedRun.target)
    }
    notifyRegistryChanged()
  }

  function cancelGeneration(runId?: string) {
    const targetRunId = requireRunId(runId, 'cancelGeneration')
    const canceledRun = registry.getRun(targetRunId)
    const wasRunning = canceledRun?.status === 'running'
    registry.cancel(targetRunId)
    // A queued cancellation must not activate a sibling. A running
    // cancellation frees the layer, so only the next queued run may start.
    if (wasRunning) {
      registry.activateQueuedRuns(canceledRun.layer, canceledRun.target)
    }
    notifyRegistryChanged()
    return true
  }

  function cancelAllActiveRuns(reason?: string) {
    const active = activeRuns.value.map(run => run.runId)
    const canceled: string[] = []
    for (const runId of active) {
      const run = registry.getRun(runId)
      if (!registry.cancel(runId)) continue
      canceled.push(runId)
      if (run?.status !== 'running') continue
      const activated = registry.activateQueuedRuns(run.layer, run.target)
      for (const item of activated) {
        if (!canceled.includes(item.runId)) canceled.push(item.runId)
        if (!registry.cancel(item.runId)) continue
      }
    }
    notifyRegistryChanged()
    return { reason: reason || '应用关闭，任务已取消', canceledRunIds: canceled }
  }

  const progressChannel = new RunProgressChannel(registry, {
    onMigrationError: ({ reason, runId, event }) => {
      // Migration errors are execution defects. They must never be attached
      // to a guessed "latest" trace run, which would hide cross-run drift.
      console.error('[pipeline] rejected progress event without a runId', {
        reason,
        runId,
        event,
      })
    },
  })

  function getGenerationSignal(runId?: string): AbortSignal | undefined {
    const targetRunId = requireRunId(runId, 'getGenerationSignal')
    return registry.getRun(targetRunId)?.controller.signal
  }

  function isGenerationCanceled(runId?: string) {
    const targetRunId = requireRunId(runId, 'isGenerationCanceled')
    const run = registry.getRun(targetRunId)
    return run?.controller.signal.aborted === true
  }

  function getRun(runId: string) {
    return registry.getRun(runId)
  }

  function getRunHistoryForLayer(layer: PipelineRunLayer) {
    void registryVersion.value
    return registry.listRuns()
      .filter(run => run.layer === layer)
      .map(run => ({ ...run }))
  }

  function getFrozenProviderChannel<T>(runId: string): T | undefined {
    const channel = registry.getRun(runId)?.configSnapshot?.pipelineProviderChannel
    return channel && typeof channel === 'object' ? channel as T : undefined
  }

  function rememberTraceRunOwnership(traceRunId: string | null | undefined, pipelineRunId: string | null | undefined) {
    if (!pipelineRunId) return
    if (!traceRunId) {
      throw new Error('pipeline trace ownership requires a started trace run id')
    }
    traceOwnership.set(traceRunId, pipelineRunId)
  }

  function getPipelineRunIdForTrace(traceRunId: string | null | undefined): string | null {
    return (traceRunId && traceOwnership.get(traceRunId)) || null
  }

  function updateRunProgress(event: PipelineRunProgressEvent) {
    if (!event?.runId) {
      // The channel records the migration error before the caller-visible throw.
      progressChannel.emit(event)
      throw new Error('progress event requires runId')
    }
    const result = progressChannel.emit(event)
    notifyRegistryChanged()
    return result
  }

  function reportProviderQueue(runId: string, event: ProviderQueueEvent) {
    const run = registry.getRun(runId)
    if (!run || (run.status !== 'running' && run.status !== 'queued')) return false
    const detail = event.status === 'queued'
      ? `等待供应商槽位：第 ${event.position ?? 1}/${event.waiting ?? 1} 位`
      : event.status === 'started'
        ? '已获得供应商槽位，正在请求供应商'
        : '等待供应商槽位时已取消'
    const result = registry.applyProgressEvent({
      runId,
      percent: run.progress,
      phase: event.status === 'queued' ? 'queued' : event.status === 'started' ? 'requesting' : run.progressPhase,
      detail,
      // Empty string is normalized to undefined by the registry, and unlike
      // undefined it actually clears a previously displayed queue reason.
      queuedReason: event.status === 'queued' ? detail : '',
    })
    notifyRegistryChanged()
    return result
  }

  function getRunStatus(runId: string): PipelineRunStatus | undefined {
    return registry.getRun(runId)?.status
  }

  async function saveBreakpoint(data: any) {
    breakpoint.value = data
    const key = data?.ownerKey && data?.kind !== 'chapters'
      ? storageKey(`pipeline_breakpoint_owner_${data.ownerKey}`)
      : storageKey('pipeline_breakpoint')
    await window.electronAPI.storageWrite(key, data)
    if (data && data.volumeIndex !== undefined) {
      chapterProgress.value = {
        volumeIndex: data.volumeIndex,
        chapterIndex: data.chapterIndex || 0,
        total: data.total || 0
      }
    }
  }

  async function refreshBreakpoint(ownerKey?: string) {
    const key = ownerKey
      ? storageKey(`pipeline_breakpoint_owner_${ownerKey}`)
      : storageKey('pipeline_breakpoint')
    const saved = await window.electronAPI.storageRead(key) || null
    breakpoint.value = saved
    if (saved && saved.volumeIndex !== undefined) {
      chapterProgress.value = {
        volumeIndex: saved.volumeIndex,
        chapterIndex: saved.chapterIndex || 0,
        total: saved.total || 0
      }
    }
    return saved
  }

  async function refreshBreakpointFromStorageKey(storageKeyOverride?: string) {
    const saved = await window.electronAPI.storageRead(storageKeyOverride || storageKey('pipeline_breakpoint')) || null
    breakpoint.value = saved
    return saved
  }

  function updateChapterProgress(chapterIndex: number) {
    if (chapterProgress.value) {
      chapterProgress.value.chapterIndex = chapterIndex
    }
  }

  function clearChapterProgress() {
    chapterProgress.value = null
  }

  async function clearBreakpoint(ownerKey?: string) {
    const key = ownerKey
      ? storageKey(`pipeline_breakpoint_owner_${ownerKey}`)
      : storageKey('pipeline_breakpoint')
    const removed = await window.electronAPI.storageRemove(key)
    if (removed === false) {
      throw new Error(`pipeline breakpoint remove failed: ${key}`)
    }
    breakpoint.value = null
    if (!ownerKey) chapterProgress.value = null
  }

  function enqueueStepConfigTransaction<T>(operation: () => Promise<T>): Promise<T> {
    const result = stepConfigWriteQueue.then(operation)
    stepConfigWriteQueue = result.then(() => undefined, () => undefined)
    return result
  }

  async function mutateStepConfig(mutate: (config: Record<string, any>) => void | Promise<void>): Promise<void> {
    await enqueueStepConfigTransaction(async () => {
      const current = normalizeStepConfig(
        await window.electronAPI.storageRead(storageKey('pipeline_step_config')) || {}
      )
      await mutate(current)
      const written = await window.electronAPI.storageWrite(storageKey('pipeline_step_config'), current)
      if (written === false) {
        throw new Error(`pipeline step config write failed: ${storageKey('pipeline_step_config')}`)
      }
    })
  }

  async function readStepConfigSnapshot(): Promise<Record<string, any>> {
    return enqueueStepConfigTransaction(async () => {
      const saved = await window.electronAPI.storageRead(storageKey('pipeline_step_config')) || {}
      return normalizeStepConfig(saved)
    })
  }

  async function writeStepConfig(next: Record<string, any>): Promise<void> {
    await enqueueStepConfigTransaction(async () => {
      // The critical section must start from the latest persisted state; callers
      // outside this queue are not allowed to snapshot, merge, and write back.
      const current = normalizeStepConfig(
        await window.electronAPI.storageRead(storageKey('pipeline_step_config')) || {}
      )
      const merged = { ...current, ...next }
      // Per-step maps must merge by step key. A shallow spread would replace the
      // whole map and resurrect the lost-update bug this transaction exists to fix.
      for (const mapKey of ['agents', 'skills', 'modes']) {
        merged[mapKey] = {
          ...(current[mapKey] || {}),
          ...(next[mapKey] || {}),
        }
      }
      merged.skillAgents = {
        ...(current.skillAgents || {}),
        ...(next.skillAgents || {}),
      }
      const written = await window.electronAPI.storageWrite(storageKey('pipeline_step_config'), merged)
      if (written === false) {
        throw new Error(`pipeline step config write failed: ${storageKey('pipeline_step_config')}`)
      }
    })
  }

  function normalizeStepConfig(value: any): Record<string, any> {
    const config = value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : {}
    return {
      ...config,
      agents: config.agents || {},
      skills: config.skills || {},
      modes: config.modes || {},
      skillAgents: config.skillAgents || {},
    }
  }

  async function setStepSkills(step: number, skillIds: string[]) {
    await mutateStepConfig(config => {
      config.skills[step] = skillIds.filter(Boolean)
    })
  }

  async function getStepSkills(step: number): Promise<string[]> {
    try {
      const key = 'pipeline_step_config'
      const saved = await window.electronAPI.storageRead(storageKey(key))
      if (saved && saved.skills && saved.skills[step]) {
        return saved.skills[step].filter(Boolean)
      }
    } catch(e) {}
    return []
  }

  async function setStepAgents(step: number, agentId: string) {
    await mutateStepConfig(config => {
      config.agents[step] = agentId || ''
    })
  }

  async function getStepAgents(step: number): Promise<string> {
    try {
      const saved = await window.electronAPI.storageRead(storageKey('pipeline_step_config'))
      if (saved && saved.agents && saved.agents[step]) return saved.agents[step]
    } catch(e) {}
    return ''
  }

  async function setStepModes(step: number, mode: 'chain' | 'compose') {
    await mutateStepConfig(config => {
      config.modes[step] = mode
    })
  }

  async function getStepModes(step: number): Promise<'chain' | 'compose'> {
    try {
      const saved = await window.electronAPI.storageRead(storageKey('pipeline_step_config'))
      if (saved && saved.modes && saved.modes[step]) return saved.modes[step] === 'chain' ? 'chain' : 'compose'
    } catch(e) {}
    return 'compose'
  }

  async function updateStepConfig(step: number, patch: {
    agentId?: string
    skillIds?: string[]
    mode?: 'chain' | 'compose'
    skillAgentId?: string
    skillId?: string
  }) {
    await mutateStepConfig(config => {
      if (patch.agentId !== undefined) config.agents[step] = patch.agentId || ''
      if (patch.skillIds) config.skills[step] = patch.skillIds.filter(Boolean)
      if (patch.mode) config.modes[step] = patch.mode
      if (patch.skillId && patch.skillAgentId !== undefined) {
        const key = `${step}-${patch.skillId}`
        if (patch.skillAgentId) config.skillAgents[key] = patch.skillAgentId
        else delete config.skillAgents[key]
      }
      // A touched step must carry complete defaults so run snapshots do not
      // distinguish "unset" from "explicitly empty/default".
      if (config.skills[step] === undefined) config.skills[step] = []
      if (config.modes[step] === undefined) config.modes[step] = 'compose'
    })
  }

  async function readStepConfig(step: number): Promise<{
    agentId: string
    skillIds: string[]
    mode: 'chain' | 'compose'
    skillAgents: Record<string, string>
  }> {
    try {
      const saved = await window.electronAPI.storageRead(storageKey('pipeline_step_config')) || {}
      return {
        agentId: saved?.agents?.[step] || '',
        skillIds: Array.isArray(saved?.skills?.[step]) ? saved.skills[step].filter(Boolean) : [],
        mode: saved?.modes?.[step] === 'chain' ? 'chain' : 'compose',
        skillAgents: saved?.skillAgents || {}
      }
    } catch(e) {
      console.warn('[pipeline] readStepConfig failed:', e)
      return { agentId: '', skillIds: [], mode: 'compose', skillAgents: {} }
    }
  }

  return {
    currentStep, isGenerating, activeRuns, generationStatus, breakpoint, chapterProgress, runs,
    activeSettingsRun, activeVolumesRun, activeChaptersRun, activeBodyRun,
    currentStepName,
    setStep, startGeneration, waitForRunActivation, updateProgress, finishGeneration, failGeneration, cancelGeneration, cancelAllActiveRuns, getGenerationSignal, isGenerationCanceled,
    getRun, getRunHistoryForLayer, getFrozenProviderChannel, updateRunProgress, reportProviderQueue, getRunStatus, isTargetGenerating,
    rememberTraceRunOwnership, getPipelineRunIdForTrace,
    saveBreakpoint, refreshBreakpoint, refreshBreakpointFromStorageKey, clearBreakpoint, updateChapterProgress, clearChapterProgress,
    setStepSkills, getStepSkills, setStepAgents, getStepAgents, setStepModes, getStepModes,
    updateStepConfig, readStepConfig, readStepConfigSnapshot, writeStepConfig
  }
})



