import assert from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import {
  buildOutlineDeletionCommandHash,
  buildOutlineDeletionTargetSignature,
  createOutlineDeletionContract,
  isHeadingDeletionConfirmationRequired,
  isOutlineDeletionAffirmativeInput,
  resolveOutlineDeletionGate,
} from './outlineDeletionContract'
import { planEditorEditBatch } from './editorEditBatch'
import type { EditorEditCommand } from './editorEditProtocol'
import { validateOutlineIntegrity } from './outlineIntegrity'
import type { OutlineIntegrityReport } from './outlineIntegrity'
import { createEditorTargetSnapshot } from './editorTarget'
import fixtureJson from '../../_audit/verification-outline-deletion-gate/client-turn6-fixture.json'

const fixture = fixtureJson as {
  turn: { userRequest: string }
  writes: Array<{ status: string; error: string; input: { commands?: EditorEditCommand[]; reason?: string } }>
}

const makeReport = (types: string[]): OutlineIntegrityReport => ({
  ok: false,
  criticalCount: types.length,
  warningCount: 0,
  issues: types.map(type => ({ level: 'critical', type, message: type })),
  summary: types.join(','),
})

const deletionCommand: EditorEditCommand = {
  type: 'editor_edit',
  version: 1,
  operation: 'delete',
  target: '## 数据板的局限\n\n重复正文',
}

function hashOutlineDeletionTestText(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return 'fnv1a32_' + hash.toString(16).padStart(8, '0')
}

describe('outline deletion confirmation contract', () => {
  it('requires confirmation only when a delete command and heading reduction are present', () => {
    const deleteCommand: EditorEditCommand = {
      type: 'editor_edit',
      version: 1,
      operation: 'delete',
      target: '## 第3节 数据板的局限',
    }
    expect(isHeadingDeletionConfirmationRequired({
      commands: [deleteCommand],
      integrity: makeReport(['heading_count_reduced']),
    })).toBe(true)
    expect(isHeadingDeletionConfirmationRequired({
      commands: [{ type: 'editor_edit', version: 1, operation: 'insert', content: '一段说明' }],
      integrity: makeReport(['heading_count_reduced']),
    })).toBe(false)
    expect(isHeadingDeletionConfirmationRequired({
      commands: [deleteCommand],
      integrity: makeReport(['heading_count_reduced', 'body_content_lost']),
    })).toBe(false)
  })

  it('treats the legacy heading-count structure failure as confirmation-eligible', () => {
    const deleteCommand: EditorEditCommand = {
      type: 'editor_edit',
      version: 1,
      operation: 'delete',
      target: '## 第3节 数据板的局限',
    }
    expect(isHeadingDeletionConfirmationRequired({
      commands: [deleteCommand],
      integrity: {
        ...makeReport(['structure_broken']),
        issues: [{ level: 'critical', type: 'structure_broken', message: '标题数量从 204 降到 202，可能破坏层级' }],
      },
    })).toBe(true)
  })

  it('grants once, binds the target signature, and consumes once', () => {
    const contract = createOutlineDeletionContract()
    const command: EditorEditCommand = {
      type: 'editor_edit',
      version: 1,
      operation: 'delete',
      target: '## 第3节 数据板的局限',
      volumeTitle: '第一卷',
    }
    const requested = contract.request({
      turnId: 'turn-1',
      commands: [command],
      original: '原文一二三',
      next: '原文',
      reason: '删除三节冗余设定',
    })
    expect(requested.status).toBe('requested')
    expect(requested.commandHash).toBe(buildOutlineDeletionCommandHash([command]))
    expect(requested.originalHash).toBe(hashOutlineDeletionTestText('原文一二三'))
    expect(requested.expectedNextHash).toBe(hashOutlineDeletionTestText('原文'))
    expect(requested.expectedDeletedLength).toBe(3)
    expect(contract.getPending('turn-1')?.status).toBe('requested')
    expect(contract.grant('turn-1')?.status).toBe('granted')
    expect(contract.consume('turn-1', { commands: [command], original: '原文一二三', next: '原文' })).toBe(true)
    expect(contract.consume('turn-1', { commands: [command], original: '原文一二三', next: '原文' })).toBe(false)
    expect(contract.list()[0]?.status).toBe('consumed')
  })

  it('rejects a grant for a different target signature', () => {
    const contract = createOutlineDeletionContract()
    const command: EditorEditCommand = {
      type: 'editor_edit',
      version: 1,
      operation: 'delete',
      target: '## 第3节 数据板的局限',
    }
    contract.request({ turnId: 'turn-1', commands: [command], original: '原文', next: '原文删一段' })
    contract.grant('turn-1')
    expect(contract.consume('turn-1', { commands: [command], original: '原文', next: '原文' })).toBe(false)
    expect(contract.getPending('turn-1')?.status).toBe('granted')
  })

  it('blocks a replay that deletes more than the authorized batch', () => {
    const contract = createOutlineDeletionContract()
    const command: EditorEditCommand = {
      type: 'editor_edit',
      version: 1,
      operation: 'delete',
      target: '## 第3节 数据板的局限',
    }
    const original = '保留段落。## 第3节 数据板的局限\n重复正文'
    const authorizedNext = '保留段落。'
    contract.request({ turnId: 'turn-1', commands: [command], original, next: authorizedNext })
    contract.grant('turn-1')
    expect(contract.consume('turn-1', {
      commands: [command],
      original,
      next: '保留',
    })).toBe(false)
    expect(contract.getPending('turn-1')?.status).toBe('granted')
  })

  it('dismisses a requested confirmation and cannot re-grant it', () => {
    const contract = createOutlineDeletionContract()
    const command: EditorEditCommand = {
      type: 'editor_edit',
      version: 1,
      operation: 'delete',
      target: '## 第3节 数据板的局限',
    }
    contract.request({ turnId: 'turn-2', commands: [command], original: '原文', next: '原文删一段' })
    expect(contract.dismiss('turn-2')?.status).toBe('dismissed')
    expect(contract.grant('turn-2')).toBeNull()
  })

  it('supersedes an old requested confirmation when a new turn replaces it', () => {
    const contract = createOutlineDeletionContract()
    const command: EditorEditCommand = {
      type: 'editor_edit',
      version: 1,
      operation: 'delete',
      target: '## 第3节 数据板的局限',
    }
    contract.request({ turnId: 'turn-2', commands: [command], original: '原文', next: '原文删一段' })
    expect(contract.supersede('turn-2')?.status).toBe('superseded')
    expect(contract.grant('turn-2')).toBeNull()
    const next = contract.request({ turnId: 'turn-3', commands: [command], original: '原文', next: '原文删一段' })
    expect(next.status).toBe('requested')
    expect(contract.grant('turn-3')?.status).toBe('granted')
  })

  it('recognizes cross-turn affirmative commands without hijacking normal prose', () => {
    expect(isOutlineDeletionAffirmativeInput('确认')).toBe(true)
    expect(isOutlineDeletionAffirmativeInput('可以，执行吧。')).toBe(true)
    expect(isOutlineDeletionAffirmativeInput('确认一下，这个设定是不是重复')).toBe(false)
    expect(isOutlineDeletionAffirmativeInput('我确认这份大纲里写到额度续费了')).toBe(false)
  })

  it('resolves a confirmation-eligible integrity failure into the authorization gate', () => {
    const decision = resolveOutlineDeletionGate({
      commands: [deletionCommand],
      integrity: {
        ...makeReport(['heading_count_reduced']),
        issues: [{
          level: 'critical',
          type: 'heading_count_reduced',
          message: '标题数量从 204 降到 202，可能破坏层级',
        }],
      },
    })
    expect(decision.action).toBe('request_confirmation')
    expect(decision.code).toBe('heading_deletion_requires_user_confirmation')
    if (decision.action !== 'request_confirmation') throw new Error('expected request_confirmation')
    expect(decision.targetSignature).toBe(buildOutlineDeletionTargetSignature([deletionCommand]))
    expect(decision.message).toContain('需要用户授权')
    expect(decision.message).toContain('数据板的局限')
    expect(decision.message).toContain('停止调用工具')
  })

  it('keeps a non-deletion integrity failure blocked', () => {
    const decision = resolveOutlineDeletionGate({
      commands: [deletionCommand],
      integrity: makeReport(['body_content_lost']),
    })
    expect(decision.action).toBe('block')
    expect(decision.code).toBe('integrity_failed')
    expect(decision.message).toContain('整批重试')
  })

  it('replays the real client turn-6 deletion batch through authorization without weakening other guards', () => {
    const failedWrite = fixture.writes.find(write =>
      write.status === 'failed'
      && write.error.includes('标题数量从 204 降到 202')
      && Array.isArray(write.input.commands)
    )
    assert.ok(failedWrite, 'client fixture contains the real blocked deletion batch')
    assert(failedWrite)
    const commands = failedWrite.input.commands as EditorEditCommand[]
    expect(commands).toHaveLength(3)
    expect(commands.every(command => command.operation === 'delete')).toBe(true)

    // Rebuild only the document shape implied by the client's real targets. The
    // command text itself is untouched and comes from the exported trace.
    const clientOutline = [
      '# 测试大纲',
      '开篇说明，正文保留，不参与删除。',
      ...commands.slice(0, 2).map(command => command.target),
      '## 菌膜外套与共存补丁的关系',
      commands[2].target,
      '共存补丁的后续独立叙事必须保留。',
    ].join('\n\n')
    const target = createEditorTargetSnapshot({
      workspace: 'outline',
      targetId: 'outline',
      label: '大纲',
      content: clientOutline,
    })
    assert.ok(target, 'outline target snapshot is available')
    const plan = planEditorEditBatch({
      type: 'editor_edit_batch',
      version: 1,
      commands,
      reason: failedWrite.input.reason,
    }, target, { content: clientOutline, locked: false })
    if (!plan.ok) assert.fail(`real client commands must replay: ${plan.reason || ''}`)
    expect(plan.next.includes('## 数据板的局限')).toBe(false)
    expect(plan.next.includes('## 菌膜外套：有限资源的临时通行方案')).toBe(false)
    expect(plan.next.includes('共存补丁的后续独立叙事必须保留。')).toBe(true)

    const blocked = validateOutlineIntegrity(clientOutline, plan.next)
    expect(blocked.ok).toBe(false)
    expect(blocked.issues.some(issue => issue.type === 'heading_count_reduced')).toBe(true)
    expect(resolveOutlineDeletionGate({ commands, integrity: blocked }).action).toBe('request_confirmation')

    const contract = createOutlineDeletionContract()
    contract.request({
      turnId: 'turn-1790429963268-209',
      commands,
      original: clientOutline,
      next: plan.next,
      reason: failedWrite.input.reason,
    })
    assert.ok(contract.grant('turn-1790429963268-209'))
    const authorized = validateOutlineIntegrity(clientOutline, plan.next, {
      allowAuthorizedDeletion: true,
      authorizedDeletedLength: Math.max(0, clientOutline.length - plan.next.length),
    })
    expect(authorized.ok).toBe(true)
    assert.equal(
      contract.consume('turn-1790429963268-209', {
        commands,
        original: clientOutline,
        next: plan.next,
      }),
      true,
    )
  })
})
