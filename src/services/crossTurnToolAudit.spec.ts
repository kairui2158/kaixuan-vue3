import { describe, expect, it } from 'vitest'
import {
  buildCrossTurnToolAudit,
  formatCrossTurnToolAudit,
  hasCrossTurnToolAudit,
} from './crossTurnToolAudit'

describe('crossTurnToolAudit', () => {
  it('summarizes success, failure, and permission denial tool pairs', () => {
    const audit = buildCrossTurnToolAudit({
      toolResults: [
        {
          call: { id: 'call_1', name: 'editor.write', input: { operation: 'append', content: '新段落' } },
          result: { ok: true, data: { batchId: 'batch_1', targetId: 'outline' } },
        },
        {
          call: { id: 'call_2', name: 'editor.write', input: { operation: 'insert', content: '坏命令' } },
          result: { ok: false, error: { code: 'invalid_input', message: '非法 operation' } },
        },
        {
          call: { id: 'call_3', name: 'editor.write', input: { operation: 'append', content: '讨论内容' } },
          result: { ok: false, error: { code: 'permission_denied', message: '当前意图不可写入' } },
        },
      ],
      actualToolSurface: [
        { name: 'editor.read', policy: 'read' },
        { name: 'editor.write', policy: 'write' },
      ],
    })

    expect(audit.entries).toHaveLength(3)
    expect(audit.entries[0]).toMatchObject({
      toolCallId: 'call_1',
      toolName: 'editor.write',
      status: 'success',
      policy: 'write',
      protocolVersion: 1,
    })
    expect(audit.entries[1]).toMatchObject({ status: 'failed', errorCode: 'invalid_input' })
    expect(audit.entries[2]).toMatchObject({ status: 'failed', errorCode: 'permission_denied' })
    expect(formatCrossTurnToolAudit(audit)).toContain('[上一轮工具审计]')
    expect(formatCrossTurnToolAudit(audit)).toContain('batch_1')
    expect(formatCrossTurnToolAudit(audit)).toContain('permission_denied')
    expect(hasCrossTurnToolAudit(audit)).toBe(true)
  })

  it('keeps only the latest terminal state per toolCallId and detects orphans', () => {
    const audit = buildCrossTurnToolAudit({
      toolCalls: [
        { id: 'call_retry', name: 'editor.write' },
        { id: 'call_orphan', name: 'editor.read' },
      ],
      toolResults: [
        {
          call: { id: 'call_retry', name: 'editor.write', input: { operation: 'append' } },
          result: { ok: false, error: { code: 'version_changed', message: '版本变化' } },
        },
        {
          call: { id: 'call_retry', name: 'editor.write', input: { operation: 'append', content: '重试内容' } },
          result: { ok: true, data: { batchId: 'batch_retry' } },
        },
      ],
    })

    expect(audit.entries).toHaveLength(1)
    expect(audit.entries[0]).toMatchObject({ status: 'success' })
    expect(audit.entries[0].inputSummary).toContain('重试内容')
    expect(audit.orphanToolCallIds).toEqual(['call_orphan'])
    expect(formatCrossTurnToolAudit(audit)).toContain('orphan_tool_calls=call_orphan')
  })

  it('caps compact history size to prevent turn-over snowballing', () => {
    const toolResults = Array.from({ length: 60 }, (_, index) => ({
      call: { id: `call_${index}`, name: 'editor.read', input: { query: `问题${index}` } },
      result: { ok: true, data: { index } },
    }))
    const audit = buildCrossTurnToolAudit({ toolResults })

    expect(audit.entries).toHaveLength(20)
    expect(audit.truncated).toBe(true)
    expect(audit.entries[0].toolCallId).toBe('call_40')
    expect(audit.entries.at(-1)?.toolCallId).toBe('call_59')
    const formatted = formatCrossTurnToolAudit(audit)
    expect(formatted.length).toBeLessThan(20 * 300)
    expect(formatted).toContain('已截断，完整现场见运行记录')
  })
})
