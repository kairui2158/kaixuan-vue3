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
  return readFileSync(resolve(workspaceRoot, relativePath), 'utf8')
}

describe('direct write production wiring', () => {
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
    expect(outline).toContain('longDocument: true')
    expect(outline).toContain('longDocument: outlinePlan.plan.mode === \'edit-task\' || outlinePlan.plan.decision !== \'fits\'')
    expect(outline).toContain('const isLongDocumentRequest = useOutlineEditTaskPlan || outlineExecutionPlan.decision !== \'fits\'')
    expect(outline).toContain('longDocument: isLongDocumentRequest')
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
