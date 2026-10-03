import { describe, expect, it } from 'vitest'
import { createPinia } from 'pinia'
import { useRunTraceStore } from '../stores/runTrace'
import { createAgentTraceBridge } from './agentTraceBridge'
import type { AgentOrchestratorEvent, AgentOrchestratorSnapshot } from './agentOrchestrator'

const snapshot: AgentOrchestratorSnapshot = {
  taskId: 'task-1',
  status: 'running',
  goal: '整理长文档',
  stepIndex: 0,
  callCount: 1,
  successfulWriteCount: 0,
  noProgressRounds: 0,
  repeatedCallCount: 0,
  maxPhysicalRequests: 8,
  updatedAt: 1,
}

describe('agentTraceBridge', () => {
  it('writes agent events and snapshot payloads into the current run', () => {
    const pinia = createPinia()
    const store = useRunTraceStore(pinia)
    const runId = store.startRun({ source: 'outline', mode: 'direct', projectId: 'p1' })
    const bridge = createAgentTraceBridge({ pinia, source: 'outline' })
    const handler = bridge.attach()

    const event: AgentOrchestratorEvent = {
      type: 'state',
      level: 'warning',
      label: '任务状态：stalled',
      detail: 'repeated_tool_call',
      payload: { signature: 'editor.write::same' },
    }
    handler(event, snapshot)

    const run = store.getRun(runId)
    expect(run?.events.some(item => item.type === 'agent-state')).toBe(true)
    expect(run?.events.some(item => item.type === 'agent-snapshot')).toBe(true)
    const stateEvent = run?.events.find(item => item.type === 'agent-state')
    expect(stateEvent?.payload).toEqual({ signature: 'editor.write::same' })
    const snapshotEvent = run?.events.find(item => item.type === 'agent-snapshot')
    expect(snapshotEvent?.payload).toEqual({ snapshot })
  })

  it('does not throw when no source run exists', () => {
    const pinia = createPinia()
    useRunTraceStore(pinia)
    const bridge = createAgentTraceBridge({ pinia, source: 'home' })
    expect(() => bridge.attach()({
      type: 'state',
      level: 'info',
      label: '任务状态：running',
    }, snapshot)).not.toThrow()
  })

  it('maps tool conflict events to the agent trace event type', () => {
    const pinia = createPinia()
    const store = useRunTraceStore(pinia)
    const runId = store.startRun({ source: 'home', mode: 'direct', projectId: 'p1' })
    const bridge = createAgentTraceBridge({ pinia, source: 'home' })

    bridge.attach()({
      type: 'tool_conflict',
      level: 'warning',
      label: '外部工具占用内置工具名：editor.write',
      detail: 'offenders=external:0',
      payload: { toolName: 'editor.write', reason: 'built-in' },
    }, snapshot)

    const event = store.getRun(runId)?.events.find(item => item.type === 'agent-tool_conflict')
    expect(event?.level).toBe('warn')
    expect(event?.label).toContain('editor.write')
    expect(event?.payload).toEqual({ toolName: 'editor.write', reason: 'built-in' })
  })

  it('maps physical request limit events to the agent trace event type', () => {
    const pinia = createPinia()
    const store = useRunTraceStore(pinia)
    const runId = store.startRun({ source: 'outline', mode: 'agent', projectId: 'p1' })
    const bridge = createAgentTraceBridge({ pinia, source: 'outline' })
    const stalledSnapshot: AgentOrchestratorSnapshot = {
      ...snapshot,
      status: 'stalled',
      callCount: 8,
      reason: 'physical_request_limit',
    }

    bridge.attach()({
      type: 'physical_request_limit',
      level: 'warning',
      label: '物理请求次数达到上限：8/8',
      detail: 'stalled',
      payload: { maxPhysicalRequests: 8 },
    }, stalledSnapshot)

    const event = store.getRun(runId)?.events.find(item => item.type === 'agent-physical_request_limit')
    expect(event?.level).toBe('warn')
    expect(event?.label).toContain('8/8')
    expect(event?.payload).toEqual({ maxPhysicalRequests: 8 })
    const snapshotEvent = store.getRun(runId)?.events
      .filter(item => item.type === 'agent-snapshot')
      .at(-1)
    expect(snapshotEvent?.payload).toEqual({ snapshot: stalledSnapshot })
  })
})
