import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatUpstreamMetadata } from './chainExecution'
import { buildFinalStepFeedback } from './finalStepFeedback'
import { resolveFinalStepMetadataFlow } from './stepArtifactAcceptance'
import { parseGenerationResult } from './generationResult'

const TRACE_ROOT = 'C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-正文层-20261018-133836-standard'
const TRACE_PATH = path.join(TRACE_ROOT, 'run-trace.json')

function eventDetail(trace: Record<string, unknown>, type: string): Record<string, unknown> {
  const event = ((trace.events || []) as Array<{ type?: string; detail?: string }>)
    .find(item => item.type === type)
  expect(event, `trace has event ${type}`).toBeTruthy()
  const detail = event?.detail
  return typeof detail === 'string' ? JSON.parse(detail) : (detail || {})
}

function messageText(message: Record<string, unknown>): string {
  const content = message.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(part => String((part as { text?: string })?.text || '')).join('\n')
  }
  return ''
}

function requestText(traceRoot: string, name: string): { user: string; system: string } {
  const parsed = JSON.parse(fs.readFileSync(path.join(traceRoot, 'payloads', name), 'utf8'))
  const messages = (Array.isArray(parsed) ? parsed : parsed.messages || []) as Array<Record<string, unknown>>
  const user = messages.filter(item => item.role === 'user').map(messageText).join('\n')
  const system = messages.filter(item => item.role === 'system').map(messageText).join('\n')
  return { user, system }
}

describe('final-step metadata accident replay (20261018-133836)', () => {
  it('proves the historical S3 retry carried the full degraded candidate and contradictory protocol', () => {
    expect(fs.existsSync(TRACE_PATH), 'the source accident trace is still present').toBe(true)
    const retry = requestText(TRACE_ROOT, '020-request.json')
    expect(retry.user).toContain('--- 上一步结构化交接 ---')
    expect(retry.user).toContain('count=1,totalChars=558')
    expect(retry.system).toContain('必须以它为基底，只修正上述错误，保留其余内容')
    expect(retry.system).toContain('<<<上一版候选输出开始>>>')
    expect(retry.system).toContain('<<<上一版候选输出结束>>>')
    expect(retry.system).toContain('目标字数：无法核对')
    expect(retry.system).toContain('FACT_LOCK缺字段：人物状态、位置、伤势、持有物、时间点、关键数字、新增事实、钩子兑现状态')
    expect(retry.system).toContain('只修命中的句子，不扩大重写范围')

    const first = requestText(TRACE_ROOT, '024-request.json')
    expect(first.user).toContain('--- 上一步结构化交接 ---')
    expect(first.user).toContain('count=1,totalChars=558')
    expect(first.user).not.toContain('--- 上一步结构化交接（终步账本） ---')

    const trace = JSON.parse(fs.readFileSync(TRACE_PATH, 'utf8'))
    expect(((trace.events || []) as Array<{ type?: string }>)
      .filter(event => event.type === 'body-final-step-metadata')).toHaveLength(0)
  })

  it('backfills the historical S2 FACT_LOCK ledger from the real S3 polished output', () => {
    const trace = JSON.parse(fs.readFileSync(TRACE_PATH, 'utf8'))
    const acceptance = eventDetail(trace, 'body-step-acceptance') as {
      metadata: { extractedMeta: string[] }
    }
    const authoritativeGeneratorMetadata = acceptance.metadata
    const polished = fs.readFileSync(path.join(TRACE_ROOT, 'payloads', '025-response.json'), 'utf8')
    const generation = parseGenerationResult(polished)

    const flow = resolveFinalStepMetadataFlow({
      finalMetadata: generation.metadata,
      authoritativeGeneratorMetadata,
      finalBody: generation.body,
    })

    expect(flow.decision).toBe('backfilled')
    expect(flow.warnings.map(item => item.code)).toContain('body-final-step-metadata-repaired')
    const authoritativeText = (authoritativeGeneratorMetadata.extractedMeta || []).join('\n')
    const expectedEntries = [
      '人物状态', '位置', '伤势', '持有物', '时间点', '关键数字', '新增事实', '钩子兑现状态',
    ].map(key => {
      const match = authoritativeText.match(new RegExp(`${key}[：:]([^\\n]+)`))
      return `FACT_LOCK:${key}=${String(match?.[1] || '').trim()}`
    })
    const repairedText = (flow.metadata.extractedMeta || []).join('\n')
    expect(repairedText).not.toContain('无法核对')
    for (const entry of expectedEntries) {
      expect(repairedText).toContain(entry)
    }
  })

  it('formats the real S2 ledger for the final step without summary collapse', () => {
    const trace = JSON.parse(fs.readFileSync(TRACE_PATH, 'utf8'))
    const acceptance = eventDetail(trace, 'body-step-acceptance') as {
      metadata: Record<string, unknown>
    }
    const ledger = formatUpstreamMetadata(acceptance.metadata, 'final_step_ledger')

    expect(ledger).toContain('目标字数：3500')
    expect(ledger).toContain('生成下限：2800')
    expect(ledger).toContain('人物状态：陈暮苏醒后身体僵硬、短暂失语，已能独立行走并完成精细操作')
    expect(ledger).toContain('钩子兑现状态：陈暮推开实验室门，灰绿光与远处变异兽嘶鸣同时涌入，门在身后合上，他提了提背包带向公路迈出')
    expect(ledger).not.toContain('count=1,totalChars=558')
    expect(formatUpstreamMetadata(acceptance.metadata, 'summary')).toContain('count=1,totalChars=558')
  })

  it('builds the replacement retry feedback without the S3 candidate', () => {
    const feedback = buildFinalStepFeedback({
      errors: ['FACT_LOCK缺字段：人物状态、位置、伤势、持有物、时间点、关键数字、新增事实、钩子兑现状态'],
      upstreamAnchors: ['陈暮苏醒后身体僵硬、短暂失语，已能独立行走并完成精细操作'],
    })

    expect(feedback.feedback.match(/【终步重试协议】/g)).toHaveLength(1)
    expect(feedback.feedback).toContain('FACT_LOCK缺字段：人物状态、位置、伤势、持有物、时间点、关键数字、新增事实、钩子兑现状态')
    expect(feedback.feedback).toContain('上游权威锚点')
    expect(feedback.feedback).not.toContain('必须以它为基底')
    expect(feedback.feedback).not.toContain('<<<上一版候选输出开始>>>')
    expect(feedback.feedback).not.toContain('只修正上述错误')
    expect(feedback.feedback).not.toContain('保留其余内容')
    expect(feedback.sourceCounts).toMatchObject({ content_contract: 1, upstream_anchor: 1 })
  })
})
