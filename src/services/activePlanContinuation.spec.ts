import { describe, expect, it } from 'vitest'
import { routeChainIntent } from './chainIntentRouter'
import { ActiveExecutionTaskStore } from './activeExecutionTaskStore'
import { buildLongDocumentExecutionPlan } from './longDocumentExecutionPlanner'
import { buildDialogueToolSurface } from './dialogueToolSurface'
import { hashEditorContent, type EditorTargetSnapshot } from './editorTarget'

const content = `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`
const documentVersion = 7
const contentHash = hashEditorContent(content)

function makeSnapshot(): EditorTargetSnapshot {
  return {
    targetId: 'outline',
    label: '大纲',
    content,
    contentVersion: documentVersion,
  } as EditorTargetSnapshot
}

describe('active plan continuation integration', () => {
  it('keeps T2 readonly and reuses the T1 plan only for the T3 edit confirmation', () => {
    const store = new ActiveExecutionTaskStore()
    const t1Plan = buildLongDocumentExecutionPlan({
      requestText: '把整篇大纲重新整理排序，统一标点和编号',
      content,
      contextWindowTokens: 32_768,
      maxOutputTokens: 8_192,
      intent: 'edit',
    })
    store.create({
      taskId: `outline-${t1Plan.planId}`,
      workspace: 'outline',
      projectId: 'project-1',
      originalRequest: '把整篇大纲重新整理排序，统一标点和编号',
      operation: t1Plan.operation,
      documentVersion,
      contentHash,
      createdAt: 1_000,
      updatedAt: 1_000,
      status: 'active',
      plan: t1Plan,
      authorizedExcerpts: [],
    })
    store.markAwaitingUserPlan('outline', 'project-1')

    const t2Routing = routeChainIntent('执行前先解释一下第二卷钩子怎么处理，会不会丢正文？', {
      activePlanStatus: 'awaiting_user_plan',
    })
    expect(t2Routing.kind === 'matched' ? t2Routing.intent : 'discuss').toBe('discuss')

    const t2AnalyzeRouting = routeChainIntent('这个方案会不会丢正文？分析一下利弊', {
      activePlanStatus: 'awaiting_user_plan',
    })
    expect(t2AnalyzeRouting.kind === 'matched' ? t2AnalyzeRouting.intent : 'analyze').toBe('analyze')

    const t2Snapshot = store.getValidSnapshot('outline', 'project-1', documentVersion, contentHash)
    expect(t2Snapshot?.status).toBe('awaiting_user_plan')

    const discussionResponse = '第二卷钩子保留在原位，重排只调整章节顺序，不删除正文。'
    store.appendAuthorizedExcerpt('outline', 'project-1', discussionResponse)

    const t2Surface = buildDialogueToolSurface({
      workspace: 'outline',
      intent: 'discuss',
      getSnapshot: makeSnapshot,
      writableTarget: 'outline',
      maxReadChars: () => 12_000,
      userRequestText: '执行前先解释一下第二卷钩子怎么处理，会不会丢正文？',
      authorizedPlanExcerpts: store.getValidSnapshot('outline', 'project-1', documentVersion, contentHash)?.authorizedExcerpts || [],
    })
    expect(t2Surface.actualToolSurface.every(tool => tool.policy === 'read')).toBe(true)

    const t3Routing = routeChainIntent('开始执行', {
      activePlanStatus: 'awaiting_user_plan',
    })
    expect(t3Routing).toMatchObject({
      kind: 'matched',
      intent: 'edit',
      reason: 'active-plan-continuation',
    })

    const t3Snapshot = store.getValidSnapshot('outline', 'project-1', documentVersion, contentHash)
    const t3Plan = buildLongDocumentExecutionPlan({
      requestText: '开始执行',
      content,
      contextWindowTokens: 32_768,
      maxOutputTokens: 8_192,
      intent: 'edit',
      activePlanConfirmation: true,
      activeTask: t3Snapshot || undefined,
    })

    expect(t3Plan.planId).toBe(t1Plan.planId)
    expect(t3Plan.operation).toBe(t1Plan.operation)
    expect(t3Plan.segments).toEqual(t1Plan.segments)
    expect(t3Plan.operationResolution.source).toBe('active-plan-continuation')

    const replacementRouting = routeChainIntent('算了，只把第一卷标题改成风暴起点', {
      activePlanStatus: 'awaiting_user_plan',
    })
    const replacementPlan = buildLongDocumentExecutionPlan({
      requestText: '算了，只把第一卷标题改成风暴起点',
      content,
      contextWindowTokens: 32_768,
      maxOutputTokens: 8_192,
      intent: replacementRouting.kind === 'matched' ? replacementRouting.intent : 'edit',
      activePlanConfirmation: replacementRouting.reason === 'active-plan-continuation',
      activeTask: t3Snapshot || undefined,
    })
    expect(replacementPlan.planId).not.toBe(t1Plan.planId)
    expect(replacementPlan.operationResolution.source).not.toBe('active-plan-continuation')

    const t3Surface = buildDialogueToolSurface({
      workspace: 'outline',
      intent: 'edit',
      getSnapshot: makeSnapshot,
      writableTarget: 'outline',
      maxReadChars: () => 12_000,
      executionPlan: t3Plan,
      writeAuthorization: {
        source: 'long-document-workflow',
        intent: 'edit',
        operation: t3Plan.operation,
        mode: t3Plan.mode,
        reason: 'active-plan-continuation',
      },
      userRequestText: '开始执行',
      authorizedPlanExcerpts: t3Snapshot?.authorizedExcerpts || [],
    })

    expect(t3Surface.actualToolSurface).toContainEqual(
      expect.objectContaining({ name: 'editor.write', policy: 'write' }),
    )
    expect(t3Plan.mode).toBe('edit-task')
    expect(t3Plan.segments.length).toBeGreaterThan(1)

    const t3BareRouting = routeChainIntent('确认', {
      activePlanStatus: 'awaiting_user_plan',
    })
    expect(t3BareRouting).toEqual({
      kind: 'matched',
      intent: 'edit',
      confidence: 0.96,
      reason: 'active-plan-continuation',
      decisionLayer: 'rule',
    })
  })

  it('resumes an interrupted active task only when the user explicitly confirms the stored plan', () => {
    const store = new ActiveExecutionTaskStore()
    const t1Plan = buildLongDocumentExecutionPlan({
      requestText: '把整篇大纲重新整理排序，统一标点和编号',
      content,
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_192,
      intent: 'edit',
    })
    store.create({
      taskId: `outline-${t1Plan.planId}`,
      workspace: 'outline',
      projectId: 'project-1',
      originalRequest: '把整篇大纲重新整理排序，统一标点和编号',
      operation: t1Plan.operation,
      documentVersion,
      contentHash,
      createdAt: 1_000,
      updatedAt: 1_000,
      status: 'active',
      plan: t1Plan,
      authorizedExcerpts: [],
    })

    const interruptedSnapshot = store.getValidSnapshot('outline', 'project-1', documentVersion, contentHash)
    expect(interruptedSnapshot?.status).toBe('active')

    const discussionRouting = routeChainIntent('这个方案会不会丢正文？分析一下利弊', {
      activePlanStatus: 'active',
    })
    expect(discussionRouting.kind === 'matched' ? discussionRouting.intent : 'discuss').toBe('discuss')

    const discussionSurface = buildDialogueToolSurface({
      workspace: 'outline',
      intent: 'discuss',
      getSnapshot: makeSnapshot,
      writableTarget: 'outline',
      maxReadChars: () => 12_000,
      userRequestText: '这个方案会不会丢正文？分析一下利弊',
      authorizedPlanExcerpts: interruptedSnapshot?.authorizedExcerpts || [],
    })
    expect(discussionSurface.actualToolSurface.every(tool => tool.policy === 'read')).toBe(true)

    const confirmationRouting = routeChainIntent('你按照方案写入', {
      activePlanStatus: 'active',
    })
    expect(confirmationRouting).toMatchObject({
      kind: 'matched',
      intent: 'edit',
      reason: 'active-plan-continuation',
    })

    const resumedPlan = buildLongDocumentExecutionPlan({
      requestText: '你按照方案写入',
      content,
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_192,
      intent: 'edit',
      activePlanConfirmation: true,
      activeTask: interruptedSnapshot || undefined,
    })
    expect(resumedPlan.planId).toBe(t1Plan.planId)
    expect(resumedPlan.invariants).toEqual(t1Plan.invariants)
    expect(resumedPlan.operationResolution.source).toBe('active-plan-continuation')
  })
})
