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
})
