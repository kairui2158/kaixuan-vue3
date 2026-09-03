import { describe, expect, it } from 'vitest'
import { useUndoRedo } from './useUndoRedo'

describe('useUndoRedo external write semantics', () => {
  it('does not create user undo for an AI batch write', () => {
    const undoRedo = useUndoRedo()
    undoRedo.reset('用户原始内容')

    undoRedo.replaceCurrentSnapshot('AI 批次写入后内容')
    expect(undoRedo.canUndo.value).toBe(false)
    expect(undoRedo.undo()).toBeNull()
  })

  it('still allows undoing a user edit made before an AI batch write', () => {
    const undoRedo = useUndoRedo()
    undoRedo.reset('用户原始内容')
    undoRedo.pushState('用户编辑后内容')

    undoRedo.replaceCurrentSnapshot('AI 批次写入后内容')
    expect(undoRedo.undo()).toBe('用户原始内容')
  })

  it('clears redo history after replacing current snapshot', () => {
    const undoRedo = useUndoRedo()
    undoRedo.reset('v1')
    undoRedo.pushState('v2')
    undoRedo.undo()

    undoRedo.replaceCurrentSnapshot('AI 批次写入后内容')
    expect(undoRedo.canRedo.value).toBe(false)
    expect(undoRedo.redo()).toBeNull()
  })
})
