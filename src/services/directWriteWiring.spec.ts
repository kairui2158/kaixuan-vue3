import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  activeExecutionTaskStore,
  type ActiveExecutionTask,
} from './activeExecutionTaskStore'
import { hashEditorContent } from './editorTarget'

const workspaceRoot = resolve(__dirname, '../..')

function readComponentSource(relativePath: string): string {
  // Windows checkouts may use CRLF; wiring assertions describe source semantics, not byte-level line endings.
  return readFileSync(resolve(workspaceRoot, relativePath), 'utf8').replace(/\r\n/g, '\n')
}

describe('direct write production wiring', () => {
  it('short-circuits deterministic local transforms before skill and agent paths in both workspaces', () => {
    const outline = readComponentSource('src/components/common/OutlineWorkspace.vue')
    const home = readComponentSource('src/components/chat/ChatPanel.vue')

    for (const source of [outline, home]) {
      expect(source).toContain("plan.mode !== 'local-transform'")
      expect(source).toContain('input.plan.localTransformOperations')
      expect(source).toContain('transformDocument({')
      expect(source).toContain("outcome === 'completed'")
      expect(source).toContain("type: 'local-transform-executed'")
      expect(source).toContain("'local_transform_complete'")
      expect(source).toContain('activeExecutionTaskStore.complete')
      expect(source).toContain('contextCompactedMessageCount')
    }
    expect(outline).toContain('const localTransform = await runOutlineLocalTransformIfReady({')
    expect(outline).toContain('if (localTransform) return')
    expect(outline).toContain('const plainLocalTransform = await runOutlineLocalTransformIfReady({')
    expect(outline).toContain('if (plainLocalTransform) return')
    expect(home).toContain('if (await runHomeLocalTransform({')
    expect(home).toContain('})) return')
  })

  it('records the real request text and closes no-change local transforms in both workspaces', () => {
    const outline = readComponentSource('src/components/common/OutlineWorkspace.vue')
    const home = readComponentSource('src/components/chat/ChatPanel.vue')

    expect(home).toContain('requestText: text,')
    expect(home).not.toContain('requestText: inputText.value,')
    for (const source of [outline, home]) {
      expect(source).toContain("result.outcome === 'no_change'")
      expect(source).toContain('activeExecutionTaskStore.complete')
      expect(source).toContain('local_transform_complete')
    }
  })

  it('emits legacy history neutralization from both outline and home production entries', () => {
    for (const relativePath of [
      'src/components/common/OutlineWorkspace.vue',
      'src/components/chat/ChatPanel.vue',
    ]) {
      const source = readComponentSource(relativePath)
      expect(source).toContain("type: 'editor-context-policy'")
      expect(source).toContain('contextBundle.execution.historyNeutralization')
      expect(source).toContain('historyNeutralization: historyNeutralization || null')
    }
  })

  it('creates and consumes active task state from both production entries', () => {
    for (const relativePath of [
      'src/components/common/OutlineWorkspace.vue',
      'src/components/chat/ChatPanel.vue',
    ]) {
      const source = readComponentSource(relativePath)
      expect(source).toContain('activeExecutionTaskStore.getValidSnapshot')
      expect(source).toContain(relativePath.includes('OutlineWorkspace') ? 'createOutlineActiveTask' : 'createHomeActiveTask')
      expect(source).toContain('activeTask: active')
      expect(source).toContain('activeExecutionTaskStore.refresh')
    }
  })

  it('wires active plan continuation through both production entries', () => {
    const outline = readComponentSource('src/components/common/OutlineWorkspace.vue')
    const home = readComponentSource('src/components/chat/ChatPanel.vue')

    for (const source of [outline, home]) {
      expect(source).toContain('activePlanStatus:')
      expect(source).toContain('markAwaitingUserPlan')
      expect(source).toContain('appendAuthorizedExcerpt')
      expect(source).toContain('authorizedPlanExcerpts:')
      expect(source).toContain('plan: input.plan,')
      expect(source).toContain('supersedeAwaitingUserPlan')
      expect(source).toContain('activePlanConfirmation:')
      expect(source).toContain("'active-plan-continuation'")
    }

    expect(outline).toContain("activeOutlineTask?.status === 'awaiting_user_plan'")
    expect(home).toContain("activeHomeTask?.status === 'awaiting_user_plan'")
    expect(outline).toContain('shouldPreservePlainAwaitingOutlinePlan')
    expect(outline).toContain('shouldPreserveAwaitingOutlinePlan')
    expect(home).toContain('shouldPreserveHomeAwaitingPlan')

    for (const source of [outline, home]) {
      expect(source).not.toContain('createOutlineActiveTask({\n    requestText,\n    plan: outlineExecutionPlan,\n    snapshot: requestTarget,\n  })\n  if (')
    }
  })

  it('wires real progress and agent idle timeouts into both production entries', () => {
    const outline = readComponentSource('src/components/common/OutlineWorkspace.vue')
    const home = readComponentSource('src/components/chat/ChatPanel.vue')

    for (const source of [outline, home]) {
      expect(source).toContain('onStreamToolProgress')
      expect(source).toContain('runTraceStore.reportToolArgumentProgress')
      expect(source).toContain('physicalCallReportsProgress(event)')
      expect(source).not.toContain('transportLivenessIsProgress:')
      expect(source).not.toContain('reportTransportLiveness()')
    }
    expect(outline).toContain('idleTimeoutMs: options.longDocument ? LONG_TOOL_RUN_IDLE_TIMEOUT_MS : DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS')
    expect(home).toContain('idleTimeoutMs: longDocument ? LONG_TOOL_RUN_IDLE_TIMEOUT_MS : DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS')
  })

  it('keeps authorized API direct writes from being rejected by the manual outline lock gate', () => {
    const outline = readComponentSource('src/components/common/OutlineWorkspace.vue')

    expect(outline).toContain('authorized: input.writeAuthorization?.lockOverride === true')
    expect(outline).toContain('options.authorized')
    expect(outline).not.toContain('function commitOutlineChange(next: string) {\n'
      + "  const current = projectStore.outlineText || ''\n"
      + '  if (next === current || projectStore.outlineLocked) return false')
  })

  it('keeps completed tasks continuable and closes failed or canceled tasks in both production entries', () => {
    for (const relativePath of [
      'src/components/common/OutlineWorkspace.vue',
      'src/components/chat/ChatPanel.vue',
    ]) {
      const source = readComponentSource(relativePath)
      expect(source).toContain('closeInvalidActiveExecutionTaskForEditTask')
      expect(source).toContain('isTerminalEditTaskStatus')
      expect(source).toContain("status === 'completed'")
      expect(source).toContain("status === 'completed_with_warnings'")
      expect(source).toContain("status === 'failed_before_write'")
      expect(source).toContain("status === 'failed_after_write'")
      expect(source).toContain("status === 'canceled'")
      expect(source).toContain("task.status === 'completed'"
        + "\n    || task.status === 'completed_with_warnings'")
      expect(source).not.toContain("status === 'completed'\n    || task.status === 'completed_with_warnings'\n    || task.status === 'failed_before_write'")
    }
  })

  it('maps outer terminal states from the Agent verdict in both production entries', () => {
    const outline = readComponentSource('src/components/common/OutlineWorkspace.vue')
    const home = readComponentSource('src/components/chat/ChatPanel.vue')

    expect(outline).toContain('mapAgentResultToRunTrace')
    expect(home).toContain('mapAgentResultToRunTrace')
    expect(outline).not.toContain(
      "finishOutlineRunIfRunning('success', undefined, streamingContent.value, 'plain_dialogue_complete')",
    )
    expect(home).not.toContain("homeSkillTerminalStatus || 'success'")
  })

  it('keeps advisory postProcess results distinct from real degradation in both workspaces', () => {
    const outline = readComponentSource('src/components/common/OutlineWorkspace.vue')
    const home = readComponentSource('src/components/chat/ChatPanel.vue')

    for (const source of [outline, home]) {
      expect(source).toContain("postProcessTerminal.runStatus === 'success_with_warnings'")
      expect(source).toContain("'postProcess 完成但保留警告'")
      expect(source).toContain("'postProcess 输出已降级'")
      expect(source).toContain("'postProcess 阻断输出'")
    }
  })

  it('keeps escalation echo warnings off the polishing final step', () => {
    const pipeline = readComponentSource('src/components/pipeline/PipelinePanel.vue')

    expect(pipeline).toContain('getChainEchoWarningLevel(si, templates.length')
    expect(pipeline).toContain("finalStepRole: 'polish'")
    expect(pipeline).not.toContain('escalationFinalStep')
  })

  it('keeps outline supervisor failures terminal instead of defaulting them to plain-dialogue success', () => {
    const outline = readComponentSource('src/components/common/OutlineWorkspace.vue')

    expect(outline).toContain(
      "supervisorReason === 'stuck_timeout' || supervisorReason === 'hard_deadline' || supervisorReason === 'repeated_tool_error'",
    )
    expect(outline).toContain("finishOutlineRun('failed', supervisorMessage, streamingContent.value, supervisorReason)")
    expect(outline).not.toContain(
      "finishOutlineRun('canceled', '用户取消生成', streamingContent.value, supervisorReason)",
    )
    expect(outline).toContain("if (run && run.status !== 'running')")
    expect(outline).toContain("type: 'status-conflict-ignored'")
    expect(outline).toContain("runTraceStore.failRunningApiCalls(runId, error || '运行失败')")
    expect(outline).not.toContain("runTraceStore.cancelRunningApiCalls(runId, error || '运行失败')")
  })

  it('unlocks dialogue input from the Agent snapshot terminal state in both production entries', () => {
    const outline = readComponentSource('src/components/common/OutlineWorkspace.vue')
    const home = readComponentSource('src/components/chat/ChatPanel.vue')

    expect(outline).toContain('onEvent: (event, snapshot)')
    expect(outline).toContain('const status = snapshot.status')
    expect(outline).toContain('isGenerating.value = false')
    expect(home).toContain('const homeInputBlocked = computed(() =>')
    expect(home).toContain('(isStreaming.value || homeSendStarting.value)')
    expect(home).toContain('!homeInputUnlockedByAgent.value')
    expect(home).toContain('const homeSendStarting = ref(false)')
    expect(home).toContain('homeSendStarting.value = false')
    expect(home).toContain('if (!text || homeInputBlocked.value) return')
    expect(home).toContain(':send-disabled="homeInputBlocked"')
    expect(home).toContain('const inputLockController = activeAbortController')
    expect(home).toContain('releaseInputOnTerminalState(snapshot.status)')
    expect(home).not.toContain("chatStore.setGenerationState('preparing')")
    expect(home).not.toContain('event.payload as { status?: AgentOrchestratorStatus }')
    expect(outline).not.toContain('event.payload as { status?: AgentOrchestratorStatus }')
  })

  it('unlocks dialogue input after an Agent interactive response while background work continues', () => {
    const outline = readComponentSource('src/components/common/OutlineWorkspace.vue')
    const home = readComponentSource('src/components/chat/ChatPanel.vue')

    expect(home).toContain("event.type === 'interactive_response'")
    expect(home).toContain('releaseInputOnInteractiveResponse()')
    expect(outline).toContain('const outlineInputBlocked = computed(() =>')
    expect(outline).toContain('!outlineInputGate.value.canSend')
    expect(outline).toContain('const outlineInputGateFlags = reactive(createOutlineInputGateFlags())')
    expect(outline).toContain('interactiveResponseActive: outlineInputGateFlags.interactiveResponseActive')
    expect(outline).toContain('resolveOutlineExecutionLocked({')
    expect(outline).toContain('if (outlineExecutionLocked.value) {')
    expect(outline).not.toContain('if (outlineInputBlocked.value) {\n    const activeOutlineTraceId')
    expect(outline).toContain('outlineInputGateFlags.sendStarting = false')
    expect(outline).toContain('function outlineShouldPreserveAwaitingRunLease')
    expect(outline).toContain("type: 'input-gate-decision'")
    expect(outline).toContain("resolvedRunId=${outlineRunTraceId || 'none'}")
    expect(outline).not.toContain("if (inputGate.mode !== 'agent_reply') outlineRunLease.value = 'none'")
    expect(outline).toContain('outlineInputGateFlags.interactiveResponseActive = true')
    expect(outline).toContain("type: 'input-unlocked-interactive-response'")
    expect(outline).toContain('if (!text || !inputGate.canSend) return')
    expect(outline).not.toContain('if (!text || isGenerating.value) return')
    expect(outline).not.toContain('outlineInputUnlockedByAgent')
    expect(outline).not.toContain('outlineSendStarting')
    expect(outline).not.toContain('outlineRunLease')
  })

  it('merges EditTask completion evidence into the terminal in both production entries', () => {
    const outline = readComponentSource('src/components/common/OutlineWorkspace.vue')
    const home = readComponentSource('src/components/chat/ChatPanel.vue')

    expect(outline).toContain('mergeEditTaskTerminal')
    expect(home).toContain('mergeEditTaskTerminal')
    for (const source of [outline, home]) {
      expect(source).toContain("type: 'edit-task-terminal-override'")
      expect(source).toContain('动态批次完成度覆盖旧计划口径')
    }
    expect(outline).toContain('const finalOutlineEditTask = finishedOutlineEditTask || outlineEditTaskSession.activeTask()')
    expect(home).toContain('editTask: finishedHomeEditTask || homeEditTaskSession.activeTask()')
  })

  it('invalidates stale task state instead of leaking it into a new document', () => {
    const task: ActiveExecutionTask = {
      taskId: 'task-stale',
      workspace: 'outline',
      projectId: 'project-stale',
      originalRequest: '重构整篇大纲',
      operation: 'restructure',
      documentVersion: 1,
      contentHash: hashEditorContent('旧文档'),
      createdAt: 1,
      updatedAt: 1,
      status: 'active',
    }
    activeExecutionTaskStore.create(task)
    expect(activeExecutionTaskStore.getValidSnapshot(
      'outline',
      'project-stale',
      2,
      hashEditorContent('新文档'),
    )).toBeNull()
    expect(activeExecutionTaskStore.get('outline', 'project-stale')).toBeNull()
  })

  it('wires write contamination guards through both production dialogue surfaces', () => {
    const outline = readComponentSource('src/components/common/OutlineWorkspace.vue')
    const home = readComponentSource('src/components/chat/ChatPanel.vue')

    expect(outline).toContain('conversationMarkers: buildOutlineConversationMarkers()')
    expect(home).toContain('conversationMarkers: buildHomeConversationMarkers()')
    expect(outline).toContain('userRequestText: requestText')
    expect(home).toContain('requestText?: string')
    expect(home).toContain('userRequestText: requestText')
    expect(home).toContain('      text,')
  })

  it('binds write contamination traces to the active run turn in both workspaces', () => {
    const outline = readComponentSource('src/components/common/OutlineWorkspace.vue')
    const home = readComponentSource('src/components/chat/ChatPanel.vue')

    expect(outline).toContain("decision.type === 'write-contamination-rejected'")
    expect(home).toContain("decision.type === 'write-contamination-rejected'")
    expect(outline).toContain('type: decision.type')
    expect(home).toContain('type: decision.type')
    expect(outline).toContain("label: decision.type === 'write-contamination-rejected'")
    expect(home).toContain("label: decision.type === 'write-contamination-rejected'")
    expect(outline).toContain('turnId: outlineRunTurnId')
    expect(home).toContain('turnId: homeRunTurnId')
  })

  it('does not carry a spent skill budget into a fresh home direct turn', () => {
    const home = readComponentSource('src/components/chat/ChatPanel.vue')

    expect(home).toContain(
      'const directApiBudget = routingDecision.resumedApiBudget || createApiCallBudget(8)',
    )
    expect(home).not.toContain('|| homeApiBudget.value || createApiCallBudget(8)')
  })

  it('keeps the skill budget handle available for the resume button', () => {
    const home = readComponentSource('src/components/chat/ChatPanel.vue')

    expect(home).toContain('const apiBudget = routingDecision.resumedApiBudget || createApiCallBudget(8)')
    expect(home).toContain('homeApiBudget.value = apiBudget')
  })

  it('maps provider failures to failed API-call closure in both workspaces', () => {
    const outline = readComponentSource('src/components/common/OutlineWorkspace.vue')
    const home = readComponentSource('src/components/chat/ChatPanel.vue')

    for (const source of [outline, home]) {
      expect(source).toContain("status === 'canceled'")
      expect(source).toContain("status === 'failed'")
      expect(source).toContain("status === 'canceled'")
      expect(source).toContain('runTraceStore.cancelRunningApiCalls(runId, error ||')
      expect(source).toContain('runTraceStore.failRunningApiCalls(runId, error ||')
      expect(source).not.toContain('runTraceStore.cancelRunningApiCalls(runId, error || (status ===')
    }
    expect(outline).toContain("runTraceStore.cancelRunningApiCalls(outlineRunTraceId, '等待用户确认，未发起 API 调用')")
    expect(outline).toContain("runTraceStore.cancelRunningApiCalls(outlineRunTraceId, '用户取消生成')")
    expect(outline).toContain("runTraceStore.failRunningApiCalls(outlineRunTraceId, '运行收尾时仍未闭合')")
    expect(outline).not.toContain("runTraceStore.cancelRunningApiCalls(outlineRunTraceId, generationStatus.value === '已取消生成' ? '用户取消生成' : '运行收尾时仍未闭合')")
  })

  it('treats verified all-batch writes as success even when the supplier summary stalls in both workspaces', () => {
    const outline = readComponentSource('src/components/common/OutlineWorkspace.vue')
    const home = readComponentSource('src/components/chat/ChatPanel.vue')

    for (const source of [outline, home]) {
      expect(source).toContain('const allBatchesWritten =')
      expect(source).toContain('.pendingBatches.length === 0')
      expect(source).toContain('.failedBatchIds.length === 0')
      expect(source).toContain('summaryFailed: true')
      expect(source).toContain("type: 'edit-task-summary-failed-content-verified'")
      expect(source).toContain("'edit_task_written_summary_failed'")
    }
    expect(outline).toContain('finishOutlineRunIfRunning(')
    expect(home).toContain('finishHomeRun(')
  })

  it('wires long-document timeout hints through both workspaces', () => {
    const outline = readComponentSource('src/components/common/OutlineWorkspace.vue')
    const home = readComponentSource('src/components/chat/ChatPanel.vue')

    for (const source of [outline, home]) {
      expect(source).toContain('import { LONG_DOCUMENT_ACTIVE_TIMEOUT_MS }')
      expect(source).toContain('timeoutHint: RunTrace[\'timeoutHint\'] = options.longDocument')
      expect(source).toContain('active: LONG_DOCUMENT_ACTIVE_TIMEOUT_MS')
    }
    expect(home).toContain('longDocument: true')
    expect(home).toContain('longDocument: useHomeFinalDraft')
    for (const source of [outline, home]) {
      expect(source).toContain('usesLongDocumentToolRuntime')
      expect(source).not.toContain("plan.decision !== 'fits'")
    }
    expect(outline).toContain('longDocument: true')
    expect(outline).toContain('longDocument: usesLongDocumentToolRuntime(outlinePlan.plan)')
    expect(outline).toContain('const isLongDocumentRequest = useOutlineEditTaskPlan || usesLongDocumentToolRuntime(outlineExecutionPlan)')
    expect(outline).toContain('longDocument: isLongDocumentRequest')
    for (const source of [outline, home]) {
      expect(source).toContain('LONG_TOOL_RUN_IDLE_TIMEOUT_MS')
      expect(source).toContain('longIdleLimitMs')
    }
    expect(outline).toContain('idleTimeoutMs: options.longDocument ? LONG_TOOL_RUN_IDLE_TIMEOUT_MS : DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS')
    expect(outline).toContain('idleTimeoutMs: isLongDocumentRequest ? LONG_TOOL_RUN_IDLE_TIMEOUT_MS : DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS')
    expect(home).toContain('idleTimeoutMs: longDocument ? LONG_TOOL_RUN_IDLE_TIMEOUT_MS : DIRECT_TOOL_RUN_IDLE_TIMEOUT_MS')
    expect(home).toContain('idleTimeoutMs: homeLongDocumentEditTaskPlan || (executionPlan ? usesLongDocumentToolRuntime(executionPlan) : false)')
    for (const source of [outline, home]) {
      expect(source).toContain('shouldRetryStalledDirectWrite({')
      expect(source).toContain("|| 'read-only-dialogue'")
      expect(outline).toContain('longDocumentRetry: false')
      expect(home).toContain('longDocumentRetry: stallRetryDecision.longDocumentRetry')
    }
    expect(outline).toContain('const stallRetry = shouldRetryStalledDirectWrite({')
    expect(home).toContain("supervisorReason: homeSupervisorReason")
    expect(home).toContain("reason: 'stall_retry_valid'")
  })

  it('wires the DeAI budget extension loop through store, composable, and progress UI', () => {
    const store = readComponentSource('src/stores/deai.ts')
    const composable = readComponentSource('src/composables/useDeAi.ts')
    const progress = readComponentSource('src/components/deai/DeAiProgress.vue')

    expect(store).toContain("runStatus = ref<DeAiRunStatus>('idle')")
    expect(store).toContain("function waitBudget(reason: string)")
    expect(store).toContain('function extendBudget(additional = 4)')
    expect(composable).toContain('let deAiBudget: ApiCallBudget | null = null')
    expect(composable).toContain('function waitForBudgetResume(): Promise<boolean>')
    expect(composable).toContain('type: \'deai-budget\'')
    expect(progress).toContain("deAiStore.runStatus === 'waiting_budget'")
    expect(progress).toContain('function extendBudget()')
  })
})
