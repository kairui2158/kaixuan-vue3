import { describe, expect, it } from 'vitest'
import { acceptWorkspaceArtifact } from './workspaceArtifactAcceptance'

const outlineOriginal = [
  '# 第一卷',
  '主角开始旅程。',
  '## 第1章 启程',
  '主角离开村庄。',
  '## 第2章 遇敌',
  '主角遇到阻碍。',
].join('\n')

describe('acceptWorkspaceArtifact', () => {
  it('keeps no-contract runs accept-only without inventing a contract', () => {
    const result = acceptWorkspaceArtifact({
      rawOutput: '普通讨论回复',
      callerStatus: 'success',
      contract: null,
    })
    expect(result).toMatchObject({
      decision: 'accept',
      reason: 'no_contract',
      terminalStatus: 'success',
      terminalReason: 'artifact_no_contract',
      downstreamPayload: '普通讨论回复',
    })
    expect(result.stepArtifact).toBeNull()
    expect(result.outlineIntegrity).toBeNull()
  })

  it('rejects a degraded no-contract run instead of treating output as valid', () => {
    const result = acceptWorkspaceArtifact({
      rawOutput: '降级候选输出',
      callerStatus: 'degraded',
      degradedErrors: ['模型额度失败'],
      contract: null,
    })

    expect(result).toMatchObject({
      decision: 'reject',
      reason: 'no_contract_degraded',
      terminalStatus: 'degraded',
      terminalReason: 'artifact_no_contract_degraded',
      downstreamPayload: null,
    })
    expect(result.errors).toEqual(['模型额度失败', '降级输出未声明工作区产物契约，无法验收'])
  })

  it('rejects a degraded body draft below the contract floor', () => {
    const result = acceptWorkspaceArtifact({
      rawOutput: '短稿',
      callerStatus: 'degraded',
      degradedErrors: ['供应商额度失败'],
      contract: {
        kind: 'body',
        contract: { chapterId: 'chapter-1', targetWords: 100 },
      },
    })
    expect(result.decision).toBe('reject')
    expect(result.terminalStatus).toBe('degraded')
    expect(result.terminalReason).toBe('artifact_degraded_plus_contract_failure')
    expect(result.downstreamPayload).toBeNull()
    expect(result.errors.join(';')).toContain('供应商额度失败')
    expect(result.errors.join(';')).toContain('正文过短')
  })

  it('accepts a valid degraded body draft with warnings', () => {
    const body = '字'.repeat(80)
    const result = acceptWorkspaceArtifact({
      rawOutput: `${body}\n\n【正文交接】\nFACT_LOCK:人物状态=安全\n【正文交接结束】`,
      callerStatus: 'degraded',
      degradedErrors: ['部分流失败'],
      contract: {
        kind: 'body',
        contract: { chapterId: 'chapter-1', targetWords: 100 },
      },
    })
    expect(result).toMatchObject({
      decision: 'accept',
      terminalStatus: 'success_with_warnings',
    })
    expect((result.downstreamPayload as string).startsWith(body)).toBe(true)
    expect((result.downstreamPayload as string).includes('【正文交接】')).toBe(false)
    expect(result.warnings).toContain('部分流失败')
  })

  it('rejects a structurally broken outline rewrite before downstream use', () => {
    const result = acceptWorkspaceArtifact({
      rawOutput: '# 第一卷\n只剩一句话',
      callerStatus: 'success',
      contract: {
        kind: 'outline',
        original: outlineOriginal,
      },
    })
    expect(result.decision).toBe('reject')
    expect(result.terminalStatus).toBe('blocked')
    expect(result.terminalReason).toBe('artifact_contract_failure')
    expect(result.downstreamPayload).toBeNull()
    expect(result.outlineIntegrity?.criticalCount).toBeGreaterThan(0)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('accepts a whole-document outline reorganization through the structure source', () => {
    const next = [
      '# 第一卷',
      '主角开始旅程。',
      '## 第1章 启程',
      '主角离开村庄。',
      '## 第2章 遇敌',
      '主角遇到阻碍。',
      '补充衔接说明。',
    ].join('\n')
    const result = acceptWorkspaceArtifact({
      rawOutput: next,
      callerStatus: 'success',
      contract: {
        kind: 'outline',
        original: outlineOriginal,
        options: {
          validateDocumentBody: true,
          allowWholeDocumentRewrite: true,
        },
      },
    })
    expect(result).toMatchObject({
      decision: 'accept',
      reason: 'contract_valid',
      terminalStatus: 'success',
      downstreamPayload: next,
    })
    expect(result.outlineIntegrity?.ok).toBe(true)
  })

  it('rejects failed and blocked callers before contract evaluation', () => {
    const failed = acceptWorkspaceArtifact({
      rawOutput: '旧输出',
      callerStatus: 'failed',
      contract: {
        kind: 'outline',
        original: outlineOriginal,
      },
    })
    const blocked = acceptWorkspaceArtifact({
      rawOutput: '',
      callerStatus: 'blocked',
      contract: {
        kind: 'body',
        contract: { chapterId: 'chapter-1', targetWords: 100 },
      },
    })
    expect(failed).toMatchObject({
      decision: 'reject',
      reason: 'caller_failed',
      terminalStatus: 'blocked',
    })
    expect(blocked).toMatchObject({
      decision: 'reject',
      reason: 'caller_failed',
      terminalStatus: 'blocked',
    })
  })

  it('rejects a degraded body candidate blocked by the SKILL gate even when the contract passes', () => {
    const body = '字'.repeat(80)
    const result = acceptWorkspaceArtifact({
      rawOutput: `${body}\n\n【正文交接】\nFACT_LOCK:人物状态=安全\n【正文交接结束】`,
      callerStatus: 'degraded',
      degradedErrors: ['SKILL postProcess blocking'],
      blockingGateFailed: true,
      contract: {
        kind: 'body',
        contract: { chapterId: 'chapter-1', targetWords: 100 },
      },
    })

    expect(result).toMatchObject({
      decision: 'reject',
      reason: 'contract_failed',
      terminalStatus: 'degraded',
      terminalReason: 'artifact_degraded_plus_contract_failure',
      downstreamPayload: null,
    })
    expect(result.stepArtifact?.blockingGateFailed).toBe(true)
    expect(result.errors.join(';')).toContain('SKILL 阻断裁决未通过')
  })
})
