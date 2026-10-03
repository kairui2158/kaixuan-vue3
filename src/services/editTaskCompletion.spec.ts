import { describe, expect, it } from 'vitest'
import {
  verifyEditTaskCompletion,
} from './editTaskCompletion'
import type { EditTask } from './editTaskService'

const baseTask = {
  executedBatches: ['batch-1'],
  batchCommandSnapshots: {
    'batch-1': [
      {
        batchId: 'batch-1',
        operation: 'delete',
        target: '重复段落',
        batchDetail: {
          segmentId: 'segment-1',
          expectedChange: 'remove_duplicate',
          invariantResult: 'planned-deletion-only',
        },
      },
    ],
  },
} satisfies Pick<EditTask, 'executedBatches' | 'batchCommandSnapshots'>

describe('verifyEditTaskCompletion', () => {
  it('passes when a planned deletion target disappears', () => {
    const report = verifyEditTaskCompletion({
      task: baseTask,
      before: '重复段落\n重复段落\n保留段落',
      after: '重复段落\n保留段落',
    })

    expect(report.verified).toBe(true)
    expect(report.violations).toEqual([])
    expect(report.invariant).toBe('planned-deletion-only')
  })

  it('fails when a planned deletion target still exists', () => {
    const report = verifyEditTaskCompletion({
      task: baseTask,
      before: '重复段落\n重复段落\n保留段落',
      after: '重复段落\n重复段落\n保留段落',
    })

    expect(report.verified).toBe(false)
    expect(report.violations[0]).toMatchObject({
      code: 'planned_deletion_not_removed',
      batchId: 'batch-1',
      target: '重复段落',
      beforeCount: 2,
      afterCount: 2,
    })
  })

  it('fails when the deletion target did not exist before execution', () => {
    const report = verifyEditTaskCompletion({
      task: baseTask,
      before: '保留段落',
      after: '保留段落',
    })

    expect(report.verified).toBe(false)
    expect(report.violations[0].code).toBe('delete_target_missing_before_execution')
  })

  it('passes normalize when only punctuation and whitespace changed', () => {
    const report = verifyEditTaskCompletion({
      task: {
        executedBatches: ['batch-n'],
        batchCommandSnapshots: {
          'batch-n': [{
            batchId: 'batch-n',
            operation: 'replace_match',
            target: '旧句子',
            content: '新句子',
            batchDetail: {
              segmentId: 'segment-n',
              expectedChange: 'normalize',
              invariantResult: 'normalize-changes-punctuation-whitespace-format-only',
            },
          }],
        },
      },
      before: '第一段。第二段,第三段',
      after: '第一段，第二段，第三段',
    })

    expect(report.verified).toBe(true)
    expect(report.invariant).toBe('normalize-changes-punctuation-whitespace-format-only')
  })

  it('fails normalize when semantic words changed', () => {
    const report = verifyEditTaskCompletion({
      task: {
        executedBatches: ['batch-n'],
        batchCommandSnapshots: {
          'batch-n': [{
            batchId: 'batch-n',
            operation: 'replace_match',
            target: '旧句子',
            content: '新句子',
            batchDetail: {
              segmentId: 'segment-n',
              expectedChange: 'normalize',
              invariantResult: 'normalize-changes-punctuation-whitespace-format-only',
            },
          }],
        },
      },
      before: '第一段。旧句子',
      after: '第一段，全新句子',
    })

    expect(report.verified).toBe(false)
    expect(report.violations[0].code).toBe('normalize_semantic_text_changed')
  })

  it('fails normalize when half-width punctuation was not reduced', () => {
    const report = verifyEditTaskCompletion({
      task: {
        executedBatches: ['batch-n'],
        batchCommandSnapshots: {
          'batch-n': [{
            batchId: 'batch-n',
            operation: 'replace_match',
            target: '第一段',
            content: '第一段',
            batchDetail: {
              segmentId: 'segment-n',
              expectedChange: 'normalize',
              invariantResult: 'normalize-changes-punctuation-whitespace-format-only',
            },
          }],
        },
      },
      before: '第一段,第二段,第三段',
      after: '第一段,第二段,第三段',
    })

    expect(report.verified).toBe(false)
    expect(report.violations[0]).toMatchObject({
      code: 'normalize_punctuation_not_normalized',
      beforeCount: 2,
      afterCount: 2,
    })
  })

  it('passes normalize when no half-width punctuation remains to convert', () => {
    const report = verifyEditTaskCompletion({
      task: {
        executedBatches: ['batch-n'],
        batchCommandSnapshots: {
          'batch-n': [{
            batchId: 'batch-n',
            operation: 'replace_match',
            target: '第一段',
            content: '第一段',
            batchDetail: {
              segmentId: 'segment-n',
              expectedChange: 'normalize',
              invariantResult: 'normalize-changes-punctuation-whitespace-format-only',
            },
          }],
        },
      },
      before: '第一段。第二段。第三段',
      after: '第一段，第二段。第三段',
    })

    expect(report.verified).toBe(true)
  })

  it('passes tasks without structured invariants', () => {
    const report = verifyEditTaskCompletion({
      task: {
        executedBatches: ['batch-x'],
        batchCommandSnapshots: {
          'batch-x': [{
            batchId: 'batch-x',
            operation: 'insert',
            content: '新段落',
            batchDetail: {
              segmentId: 'segment-x',
              expectedChange: 'rewrite',
            },
          }],
        },
      },
      before: '旧内容',
      after: '旧内容\n新段落',
    })

    expect(report.verified).toBe(true)
  })

  it('fails composite tasks when non-duplicate body lines are removed', () => {
    const report = verifyEditTaskCompletion({
      task: {
        executedBatches: ['batch-d', 'batch-n'],
        batchCommandSnapshots: {
          'batch-d': [{
            batchId: 'batch-d',
            operation: 'delete',
            target: '重复段落',
            batchDetail: {
              segmentId: 'segment-d',
              expectedChange: 'remove_duplicate',
              invariantResult: 'planned-deletion-only',
            },
          }],
          'batch-n': [{
            batchId: 'batch-n',
            operation: 'replace_match',
            target: '第一段',
            content: '第一段',
            batchDetail: {
              segmentId: 'segment-n',
              expectedChange: 'normalize',
              invariantResult: 'normalize-changes-punctuation-whitespace-format-only',
            },
          }],
        },
      },
      before: '重复段落\n重复段落\n第一段,必须保留的总结句\n第二段',
      after: '重复段落\n第一段，第二段',
    })

    expect(report.verified).toBe(false)
    expect(report.violations[0]).toMatchObject({
      code: 'unplanned_content_removed',
      beforeCount: 4,
      afterCount: 2,
    })
  })
})
