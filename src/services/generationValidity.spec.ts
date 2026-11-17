import { describe, expect, it } from 'vitest'
import { classifyGenerationValidity, classifyRunOutcome } from './generationValidity'

describe('classifyGenerationValidity', () => {
  it('marks normal body output as usable', () => {
    expect(classifyGenerationValidity({
      text: '第一卷',
      finishReason: 'stop'
    })).toMatchObject({ kind: 'usable', usable: true })
  })

  it('marks explicit length finish with body as truncated', () => {
    expect(classifyGenerationValidity({
      text: '部分正文',
      finishReason: 'max_tokens'
    })).toMatchObject({ kind: 'truncated', usable: true })
  })

  it('marks usage-at-limit with body as truncated without a threshold guess', () => {
    expect(classifyGenerationValidity({
      text: '部分正文',
      usage: { completion_tokens: 1000 },
      maxTokens: 1000
    })).toMatchObject({ kind: 'truncated', usable: true })
  })

  it('exempts a definitive stop finish from usage-at-limit truncation', () => {
    expect(classifyGenerationValidity({
      text: '完整正文。',
      finishReason: 'stop',
      usage: { completion_tokens: 1000 },
      maxTokens: 1000
    })).toMatchObject({ kind: 'usable', usable: true })
  })

  it('subtracts reasoning tokens before comparing output usage to the limit', () => {
    expect(classifyGenerationValidity({
      text: '正文很完整。',
      finishReason: 'stop',
      usage: {
        completion_tokens: 1200,
        reasoningOutputTokens: 200
      },
      maxTokens: 1000
    })).toMatchObject({ kind: 'usable', usable: true })
  })

  it('still infers truncation from usage-at-limit when the finish reason is unavailable', () => {
    expect(classifyGenerationValidity({
      text: '部分正文',
      usage: { completion_tokens: 1000 },
      maxTokens: 1000
    })).toMatchObject({ kind: 'truncated', usable: true })
  })

  it('marks reasoning-only length output as reasoning exhausted', () => {
    expect(classifyGenerationValidity({
      text: '',
      reasoning: '模型思考',
      finishReason: 'length',
      usage: { completion_tokens: 16384 },
      maxTokens: 16384
    })).toMatchObject({ kind: 'reasoning_exhausted', usable: false })
  })

  it('rejects visible planning text that consumed the output budget', () => {
    expect(classifyGenerationValidity({
      text: [
        'Let me plan the final output.',
        'Step 1: draft the opening scene.',
        'Step 2: establish the fact ledger.',
        'Wait, the final text must contain a structured ledger.',
        'Plan: generate the required body next.'
      ].join('\n'),
      finishReason: 'length',
      usage: { completion_tokens: 1000 },
      maxTokens: 1000
    })).toMatchObject({
      kind: 'visible_planning',
      usable: false,
      subtype: 'planning_only',
    })
  })

  it('splits budgeted visible planning into a mixed subtype when usable Chinese body remains', () => {
    const planning = [
      'Let me plan the final output.',
      'Step 1: draft the opening scene.',
      'Step 2: establish the fact ledger.',
      'Wait, the final text must contain a structured ledger.',
      'Plan: generate the required body next.'
    ].join('\n')
    const chineseBody = [
      '夜雨压在货舱铁皮上，她数着闸门外的灯，把手心里的旧车票折出一道硬痕。',
      '码头广播忽然停了，只剩水声贴着船底爬。她抬眼看见熟悉的人影，喉咙里那句质问被冷风压了回去。',
      '他撑伞走近，伞沿的水线把两人隔开。旧账没有摊开，新麻烦已经先一步站在了栈桥尽头。',
      '雨声把通讯器里的杂音切成断续的坐标。她最后看了一眼那张被水泡皱的平面图，把今天剩下的路折进衣袋，朝着废弃闸口的铁梯走去。',
      '铁梯口的探照灯扫过水面，她数了三拍才走进阴影。身后的脚步声没有再靠近，只留下一串被雨水冲淡的胶印，把最关键的时间线索压进了旧案卷宗的边角。'
    ].join('\n')

    expect(classifyGenerationValidity({
      text: `${planning}\n\n${chineseBody}`,
      finishReason: 'length',
      usage: { completion_tokens: 1000 },
      maxTokens: 1000
    })).toMatchObject({
      kind: 'visible_planning_mixed',
      usable: true,
      subtype: 'mixed_planned_body',
      message: '可见输出包含高占比规划文本，已保留其中的中文正文候选'
    })
  })

  it('keeps planning-only output rejected when no usable Chinese body remains', () => {
    expect(classifyGenerationValidity({
      text: [
        'Let me plan the final output.',
        'Step 1: draft the opening scene.',
        'Step 2: establish the fact ledger.',
        'Wait, the final text must contain a structured ledger.',
        'Plan: generate the required body next.'
      ].join('\n'),
      finishReason: 'length',
      usage: { completion_tokens: 1000 },
      maxTokens: 1000
    })).toMatchObject({
      kind: 'visible_planning',
      usable: false,
      subtype: 'planning_only',
      message: '可见输出被英文规划文本占用，未生成可用正文'
    })
  })

  it('does not turn completed English prose into a planning subtype', () => {
    expect(classifyGenerationValidity({
      text: 'She walked along the old road and remembered everything about that summer. The lantern light made the wet stones glow.',
      finishReason: 'length',
      usage: { completion_tokens: 1000 },
      maxTokens: 1000
    })).toMatchObject({ kind: 'truncated', usable: true })
  })

  it('keeps Chinese body text with incidental English terms usable', () => {
    expect(classifyGenerationValidity({
      text: '她的目光越过Route 17的指示牌，最后停在远处的Warehouse门口。',
      finishReason: 'stop'
    })).toMatchObject({ kind: 'usable', usable: true })
  })

  it('does not misclassify completed English prose as visible planning', () => {
    expect(classifyGenerationValidity({
      text: 'She walked along the old road and remembered everything about that summer.',
      finishReason: 'stop'
    })).toMatchObject({ kind: 'usable', usable: true })
  })

  it('marks empty response without reasoning as empty', () => {
    expect(classifyGenerationValidity({
      text: '',
      reasoning: '',
      finishReason: 'stop'
    })).toMatchObject({ kind: 'empty', usable: false })
  })

  it('rejects nonempty placeholder prose when output usage is zero', () => {
    expect(classifyGenerationValidity({
      text: '上游模型响应失败，请重试。',
      usage: { completion_tokens: 0, total_tokens: 127240 },
      finishReason: 'stop'
    })).toMatchObject({
      kind: 'empty',
      usable: false,
      message: '供应商返回占位文本且输出 usage 为零，判定为假成功'
    })
  })

  it('keeps substantial zero-usage prose for content validation', () => {
    const body = '灰绿的天光像蒙了层旧纱，斜斜地坠在废区残骸上。'.repeat(60)
    expect(classifyGenerationValidity({
      text: body,
      usage: { completion_tokens: 0, total_tokens: 127240 },
      finishReason: 'stop'
    })).toMatchObject({ kind: 'usable', usable: true })
  })

  it('keeps a zero-usage malformed envelope containing body and ledger', () => {
    const envelope = JSON.stringify({
      body: '灰绿的天光像蒙了层旧纱，斜斜地坠在废区残骸上。',
      metadata: {
        extractedMeta: ['【正文交接】\nFACT_LOCK：人物状态：完整']
      }
    })
    const malformed = envelope.slice(0, 120) + '\n' + envelope.slice(120)
    expect(classifyGenerationValidity({
      text: malformed,
      usage: { completion_tokens: 0, total_tokens: 127240 },
      finishReason: 'stop'
    })).toMatchObject({ kind: 'usable', usable: true })
  })

  it('keeps normal body output usable when output usage is reported', () => {
    expect(classifyGenerationValidity({
      text: '正文',
      usage: { completion_tokens: 5000, total_tokens: 6000 },
      finishReason: 'stop'
    })).toMatchObject({ kind: 'usable', usable: true })
  })

  it('marks tool-call responses as usable without body text', () => {
    expect(classifyGenerationValidity({
      text: '',
      reasoning: '',
      finishReason: 'tool_calls',
      toolCalls: [{ name: 'editor.write' }]
    })).toMatchObject({ kind: 'usable', usable: true })
  })

  it('keeps tool-call turns successful without body text', () => {
    expect(classifyRunOutcome({
      text: '',
      reasoning: '',
      finishReason: 'tool_calls',
      toolCalls: [{ name: 'editor.write' }]
    })).toEqual({ status: 'success' })
  })

  it('prioritizes cancellation over output state', () => {
    expect(classifyGenerationValidity({
      text: '部分正文',
      canceled: true
    })).toMatchObject({ kind: 'canceled', usable: false })
  })

  it('prioritizes errors over output state', () => {
    expect(classifyGenerationValidity({
      text: '',
      error: 'provider handshake failed'
    })).toMatchObject({ kind: 'error', usable: false })
  })

  it('does not infer truncation from usage below max tokens', () => {
    expect(classifyGenerationValidity({
      text: '正文',
      usage: { completion_tokens: 950 },
      maxTokens: 1000
    })).toMatchObject({ kind: 'usable', usable: true })
  })

  it('uses the effective downgraded max tokens when classifying a response', () => {
    expect(classifyGenerationValidity({
      text: '部分正文',
      usage: { completion_tokens: 12000 },
      maxTokens: 12000
    })).toMatchObject({ kind: 'truncated', usable: true })

    expect(classifyGenerationValidity({
      text: '部分正文',
      usage: { completion_tokens: 12000 },
      maxTokens: 32000
    })).toMatchObject({ kind: 'usable', usable: true })
  })

  it('preserves blocked outcomes instead of collapsing them to success or failed', () => {
    expect(classifyRunOutcome({
      text: '当前卷内容',
      blocked: true,
      blockedReason: 'API 调用预算已用尽，等待用户追加'
    })).toEqual({
      status: 'blocked',
      error: 'API 调用预算已用尽，等待用户追加'
    })
  })
})

