import { describe, expect, it } from 'vitest'
import {
  classifyChainIntent,
  CHAIN_ROUTING_AMBIGUITY_THRESHOLD,
  CHAIN_ROUTING_CONFIDENCE_THRESHOLD,
  type ChainIntentHistoryMessage,
  routeChainIntent,
} from './chainIntentRouter'
import { evaluateIntentCorpus, INTENT_CORPUS_SAMPLES } from './chainIntentCorpus'
import { classifyPlainDialogueIntent } from './plainDialogueIntent'

describe('chain intent router v3', () => {
  it('treats empty input as no match', () => {
    const result = routeChainIntent('')
    expect(result).toEqual({
      kind: 'no_match',
      confidence: 0,
      reason: 'empty-input',
      fallbackMode: 'readonly-discuss',
    })
  })

  it('keeps continuation inputs ambiguous without prior context', () => {
    const result = routeChainIntent('继续')
    expect(result.kind).toBe('ambiguous')
    if (result.kind === 'ambiguous') {
      expect(result.candidates).toEqual(['analyze', 'edit', 'generate', 'discuss'])
      expect(result.reason).toBe('continuation-without-context')
    }
  })

  it('resolves continuation inputs from recent user messages', () => {
    const result = routeChainIntent('继续', {
      recentUserMessages: ['生成第一卷卷纲'],
    })
    expect(result).toMatchObject({
      kind: 'matched',
      intent: 'generate',
      reason: 'continuation-resolved:generate',
    })
  })

  it('returns no match for low-confidence chit-chat', () => {
    const result = routeChainIntent('今天天气不错呀')
    expect(result.kind).toBe('no_match')
    expect(result.confidence).toBeLessThan(CHAIN_ROUTING_CONFIDENCE_THRESHOLD)
  })

  it('returns ambiguous when keyword scores tie', () => {
    const result = routeChainIntent('生成后讨论一下')
    expect(result.kind).toBe('ambiguous')
    if (result.kind === 'ambiguous') {
      expect(result.candidates).toEqual(['generate', 'discuss'])
      expect(result.confidence).toBeGreaterThan(CHAIN_ROUTING_AMBIGUITY_THRESHOLD)
    }
  })

  it('matches explicit generation commands', () => {
    const result = routeChainIntent('生成一个完整大纲')
    expect(result).toMatchObject({ kind: 'matched', intent: 'generate' })
  })

  it('routes direct write imperative to edit', () => {
    expect(routeChainIntent('请用兼容供应商直写')).toMatchObject({
      kind: 'matched',
      intent: 'edit',
      reason: 'explicit-write-directive',
    })
    expect(routeChainIntent('直接写入这段设定')).toMatchObject({
      kind: 'matched',
      intent: 'edit',
    })
    expect(classifyChainIntent('请用兼容供应商直写')).toMatchObject({
      intent: 'edit',
      matchedKeywords: ['explicit-write-directive'],
      confidence: 0.95,
    })
  })

  it('routes permission questions combined with write directives to edit', () => {
    const writeDirectives = [
      '那你试着把修改一下大纲编辑器里的内容来验证你有没有写入权限， 你现在在第一行大纲总纲后面随意加几个字',
      '那你试着改一下来验证你有没有写入权限',
      '在第一行后面随意加几个字',
    ]

    for (const input of writeDirectives) {
      expect(routeChainIntent(input)).toMatchObject({
        kind: 'matched',
        intent: 'edit',
        reason: 'explicit-write-directive',
      })
      expect(classifyChainIntent(input)).toMatchObject({
        intent: 'edit',
        matchedKeywords: ['explicit-write-directive'],
        confidence: 0.95,
      })
      expect(classifyPlainDialogueIntent(input)).toBe('edit')
    }
  })

  it('routes trace regression phrases without blocking discussion', () => {
    expect(routeChainIntent('把钩子改强一点')).toMatchObject({
      kind: 'matched',
      intent: 'edit',
    })
    expect(routeChainIntent('第一卷的钩子需要重新设定')).toMatchObject({
      kind: 'matched',
      intent: 'edit',
    })
    expect(routeChainIntent('解释一下第一卷钩子的设计目的')).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
    })
    expect(routeChainIntent('大纲里的第一卷钩子需要重新设定吗')).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
    })
  })

  it('keeps pure permission questions and write prohibitions as discussion', () => {
    expect(routeChainIntent('你现在有写入权限么？')).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
    })
    expect(routeChainIntent('只讨论，不要写')).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
    })
    expect(routeChainIntent('你有写入权限啊，为什么说没有呢？')).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
    })
  })

  it('passes the single-source corpus through both routing entry points', () => {
    const classified = evaluateIntentCorpus(
      input => classifyPlainDialogueIntent(input),
      INTENT_CORPUS_SAMPLES,
    )
    expect(classified.failures).toEqual([])
    expect(classified.accuracy).toBe(1)

    for (const sample of INTENT_CORPUS_SAMPLES) {
      const routed = routeChainIntent(sample.input)
      if (sample.expectedIntent === 'edit') {
        expect(routed).toMatchObject({
          kind: 'matched',
          intent: 'edit',
          reason: 'explicit-write-directive',
        })
      } else {
        expect([routed.kind === 'matched' ? routed.intent : 'discuss', classifyPlainDialogueIntent(sample.input)])
          .toEqual([sample.expectedIntent, sample.expectedIntent])
      }
    }
  })

  it('does not resurrect removed pending-preview confirmation routing', () => {
    const recentHistory: ChainIntentHistoryMessage[] = [
      {
        role: 'user',
        content: '生成大纲补充指令，把以上内容写入大纲。',
      },
      {
        role: 'assistant',
        content: '【修改预览】\n两条 append 指令\nstatus: pending\n等待作者批准。',
      },
    ]

    expect(routeChainIntent('确认', { recentHistory })).toMatchObject({
      kind: 'no_match',
      reason: 'no-keyword-overlap',
    })
  })
})
