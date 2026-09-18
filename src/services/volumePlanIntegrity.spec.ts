import { describe, expect, it } from 'vitest'
import {
  buildVolumePlanIntegrity,
  clampVolumeWordsToPlan
} from './volumePlanIntegrity'

describe('buildVolumePlanIntegrity', () => {
  it('normalizes the plan and computes the next-volume budget', () => {
    const plan = buildVolumePlanIntegrity({
      plannedVolumeCount: 4,
      totalWords: 100,
      existingVolumes: [
        { outline: '第一卷', allocatedWords: 30 },
        { outline: '第二卷', suggestedWords: 20 },
        { name: 'placeholder' }
      ]
    })

    expect(plan).toEqual({
      plannedVolumeCount: 4,
      generatedVolumeCount: 2,
      allocatedWords: 50,
      remainingWords: 50,
      remainingVolumes: 2,
      currentVolumeBudget: 25,
      conflicts: []
    })
  })

  it('reports conflicting plan state instead of hiding it', () => {
    const plan = buildVolumePlanIntegrity({
      plannedVolumeCount: 1,
      totalWords: 10,
      existingVolumes: [
        { outline: '第一卷', allocatedWords: 8 },
        { outline: '第二卷', allocatedWords: 5 }
      ]
    })

    expect(plan.generatedVolumeCount).toBe(2)
    expect(plan.remainingWords).toBe(0)
    expect(plan.conflicts).toEqual([
      '已生成卷数(2)超过计划卷数(1)',
      '已分配字数(13)超过全书总字数(10)'
    ])
  })

  it('detects a remaining volume with no available words', () => {
    const plan = buildVolumePlanIntegrity({
      plannedVolumeCount: 3,
      totalWords: 10,
      existingVolumes: [{ outline: '第一卷', allocatedWords: 10 }]
    })
    expect(plan.conflicts).toEqual(['还有2卷待生成，但剩余可分配字数为0'])
  })
})

describe('clampVolumeWordsToPlan', () => {
  it('keeps a valid requested budget', () => {
    expect(clampVolumeWordsToPlan(20, { remainingWords: 50, remainingVolumes: 2 })).toEqual({
      words: 20,
      clamped: false
    })
  })

  it('clamps over-budget output to the remaining plan budget', () => {
    expect(clampVolumeWordsToPlan(999, { remainingWords: 40, remainingVolumes: 2 })).toEqual({
      words: 40,
      clamped: true
    })
  })

  it('clamps to zero when the plan is exhausted', () => {
    expect(clampVolumeWordsToPlan(10, { remainingWords: 0, remainingVolumes: 0 })).toEqual({
      words: 0,
      clamped: true
    })
  })
})
