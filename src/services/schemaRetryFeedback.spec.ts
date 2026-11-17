import { describe, expect, it } from 'vitest'
import { buildSchemaRetryFeedback } from './schemaRetryFeedback'

describe('buildSchemaRetryFeedback', () => {
  it('routes envelope format failures to the complete candidate before word-gap', () => {
    const candidate = JSON.stringify({
      body: '正'.repeat(1000),
      metadata: {
        extractedMeta: [
          [
            '【正文交接】',
            '章节：第12章 王芳入局',
            'POV：林越',
            '已完成场景：场景1、场景2',
            'FACT_LOCK：王芳=话痨；账册=旧案关键物',
            '【正文交接结束】'
          ].join('\n')
        ]
      }
    })
    const result = buildSchemaRetryFeedback({
      errors: [
        '信封body与extractedMeta重复包含正文交接账本',
        '正文过短：1000字，要求不低于2800字'
      ],
      previousOutput: candidate,
      protectedContract: { kind: 'body', targetWords: 3500 }
    })

    expect(result.strategy).toBe('candidate-anchored')
    expect(result.scaffoldSource).toBe('candidate')
    expect(result.suppressedCandidateChars).toBe(0)
    expect(result.feedback).toContain('信封body与extractedMeta重复包含正文交接账本')
    expect(result.feedback).toContain('正文过短：1000字，要求不低于2800字')
    expect(result.feedback).toContain(candidate)
    expect(result.feedback).toContain('完整 LHC JSON 信封')
    expect(result.feedback).toContain('metadata.extractedMeta[0]')
    expect(result.feedback).not.toContain('正文本体后必须保留【正文交接】区块')
  })

  it('keeps pure word-count failures on the word-gap strategy', () => {
    const result = buildSchemaRetryFeedback({
      errors: ['正文过短：1000字，要求不低于2800字'],
      previousOutput: '正'.repeat(1000),
      protectedContract: { kind: 'body', targetWords: 3500 }
    })

    expect(result.strategy).toBe('handoff-repair')
    expect(result.scaffoldSource).toBe('none')
  })

  it('extracts the envelope handoff ledger for word-gap repair', () => {
    const ledger = [
      '【正文交接】',
      '章节：第12章 王芳入局',
      'POV：林越',
      '已完成场景：场景1、场景2、场景3、场景4',
      'FACT_LOCK：王芳=话痨；账册=旧案关键物',
      '【正文交接结束】'
    ].join('\n')
    const candidate = JSON.stringify({
      body: '正'.repeat(1000),
      metadata: { extractedMeta: [ledger] }
    })
    const result = buildSchemaRetryFeedback({
      errors: ['正文过短：1000字，要求不低于2800字'],
      previousOutput: candidate,
      protectedContract: { kind: 'body', targetWords: 3500 }
    })

    expect(result.strategy).toBe('word-gap')
    expect(result.scaffoldSource).toBe('candidate')
    expect(result.anchorCount).toBe(2)
    expect(result.previewChars).toBe(400)
    expect(result.feedback).toContain('二、上一版候选头尾锚点（各200字符，仅用于保留叙事基底；不是候选全文）')
    expect(result.feedback).toContain('章节：第12章 王芳入局')
    expect(result.feedback).toContain('FACT_LOCK：王芳=话痨')
    expect(result.feedback).not.toContain('正'.repeat(201))
  })

  it('keeps the complete failed candidate for structural body failures', () => {
    const candidate = [
      '第一段'.repeat(120),
      '中间状态',
      '最后一段'.repeat(120),
      '【正文交接】',
      'FACT_LOCK：示例事实',
      '【正文交接结束】'
    ].join('\n')
    const result = buildSchemaRetryFeedback({
      errors: ['场景类型：场景2 不匹配，期望为动作，实际为核对'],
      previousOutput: candidate,
      protectedContract: {
        kind: 'body',
        targetWords: 3500
      }
    })

    expect(result.strategy).toBe('candidate-anchored')
    expect(result.scaffoldSource).toBe('candidate')
    expect(result.suppressedCandidateChars).toBe(0)
    expect(result.scaffoldChars).toBe(candidate.length)
    expect(result.feedback).toContain('【正文交接】')
      expect(result.feedback).toContain('1. 场景类型：场景2 不匹配，期望为动作，实际为核对')
    expect(result.feedback).toContain('上一版完整候选')
    expect(result.feedback).toContain('不要逐字复述整篇')
  })

  it('keeps bounded-summary for body quality failures even when a candidate exists', () => {
    const result = buildSchemaRetryFeedback({
      errors: ['复述上一步内容过多'],
      previousOutput: '上一版候选正文'.repeat(200)
    })

    expect(result.strategy).toBe('bounded-summary')
    expect(result.feedback).not.toContain('上一版完整候选')
    expect(result.suppressedCandidateChars).toBeGreaterThan(0)
  })

  it('suppresses the full candidate and reports the bounded feedback', () => {
    const candidate = [
      '第一段'.repeat(200),
      'middle-line',
      '最后一段'.repeat(200)
    ].join('\n')
    const result = buildSchemaRetryFeedback({
      errors: ['$.output 缺少必填字段', '额外错误'],
      previousOutput: candidate
    })

    expect(result.feedback).toContain('【结构化重试反馈】')
    expect(result.feedback).toContain('$.output 缺少必填字段')
    expect(result.feedback).toContain('完整全文已抑制')
    expect(result.feedback).not.toContain(candidate)
    expect(result.feedback).not.toContain('<<<上一版候选输出开始>>>')
    expect(result.candidateChars).toBe(candidate.length)
    expect(result.feedbackChars).toBe(result.feedback.length)
    expect(result.anchorCount).toBe(3)
    expect(result.previewChars).toBeLessThanOrEqual(420)
    expect(result.suppressedCandidateChars).toBeGreaterThan(0)
  })

  it('keeps short candidates inside the bounded preview', () => {
    const result = buildSchemaRetryFeedback({
      errors: ['缺少 output 字段'],
      previousOutput: '{"wrong": true}'
    })

    expect(result.feedback).toContain('{"wrong": true}')
    expect(result.candidateChars).toBe('{"wrong": true}'.length)
    expect(result.suppressedCandidateChars).toBe(0)
  })

  it('works without a previous candidate', () => {
    const result = buildSchemaRetryFeedback({ errors: ['缺少 output 字段'] })

    expect(result.feedback).toContain('缺少 output 字段')
    expect(result.candidateChars).toBe(0)
    expect(result.anchorCount).toBe(0)
    expect(result.previewChars).toBe(0)
  })

  it('routes word-count failure feedback to the protected body contract strategy', () => {
    const candidate = [
      '正'.repeat(1000),
      '【正文交接】',
      '章节：第12章 王芳入局',
      'POV：林越',
      '已完成场景：1. 王芳在酒馆讲出线索；2. 林越确认旧案时间',
      '未完成场景：3. 王芳与林越分头行动',
      '角色状态变化：林越开始怀疑内鬼',
      '章末状态：王芳拿到账册',
      'FACT_LOCK：王芳=话痨；账册=旧案关键物',
      '【正文交接结束】'
    ].join('\n')
    const result = buildSchemaRetryFeedback({
      errors: ['正文过短：2650字，要求不低于2800字'],
      previousOutput: candidate,
      protectedContract: {
        kind: 'body',
        targetWords: 3500
      }
    })

    expect(result.strategy).toBe('word-gap')
    expect(result.feedback).toContain('目标净字数：3500')
    expect(result.feedback).toContain('下限净字数：2800')
    expect(result.feedback).toContain('当前净字数：1000')
    expect(result.feedback).toContain('还差净字数：1800')
    expect(result.feedback).toContain('本反馈不携带上一版正文全文')
    expect(result.feedback).toContain('请以上一版候选为事实与叙事基底，输出覆盖全部场景的完整正文')
    expect(result.feedback).toContain('二、上一版候选头尾锚点（各200字符，仅用于保留叙事基底；不是候选全文）')
    expect(result.feedback).toContain('以上一版场景结构骨架为结构与事实边界完整施工')
    expect(result.feedback).toContain('交接账本必须放进 metadata.extractedMeta[0]')
    expect(result.feedback).not.toContain('正文末尾必须保留【正文交接】区块')
    expect(result.feedback).toContain('本轮净字数不得低于下限，也不得低于上一版净字数')
    expect(result.feedback).toContain('当前净字数/还差净字数只描述上一轮候选，不是本轮输出长度')
    expect(result.feedback).toContain('不删除场景、不压缩必要对白、不新增事实、不注水、不逐字复述上一版')
    expect(result.feedback).toContain('优先扩写动作链、对白回合、阻碍代价、判断变化、空间结果')
    expect(result.feedback).not.toContain('只补足缺口场景和承接段')
    expect(result.feedback).not.toContain('只补足缺口')
    expect(result.feedback).not.toContain('不要整段正文重写')
    expect(result.feedback).toContain('一、上一版场景结构骨架（有界，不是候选全文）')
    expect(result.feedback).toContain('已完成场景：1. 王芳在酒馆讲出线索')
    expect(result.feedback).toContain('FACT_LOCK：王芳=话痨；账册=旧案关键物')
    expect(result.feedback).not.toContain('正'.repeat(201))
    expect(result.scaffoldFieldCount).toBeGreaterThanOrEqual(7)
    expect(result.scaffoldChars).toBeLessThanOrEqual(820)
    expect(result.feedback).not.toContain('请以上一版候选输出为基底补写缺失场景')
    expect(result.feedback).not.toContain(candidate)
    expect(result.feedback).not.toContain('请基于原始任务输入重新输出完整结果')
    expect(result.feedback).not.toContain('请基于原始任务输入完整重交付正文')
    expect(result.feedback).not.toContain('只作为事实边界，不是正文基底')
  })

  it('declares the missing scaffold instead of pretending the previous structure exists', () => {
    const result = buildSchemaRetryFeedback({
      errors: ['正文过短：2000字，要求不低于2800字'],
      previousOutput: '正'.repeat(2000),
      protectedContract: {
        kind: 'body',
        targetWords: 3500
      }
    })

    expect(result.strategy).toBe('handoff-repair')
    expect(result.feedback).toContain('上一版候选正文中没有出现【正文交接】标记')
    expect(result.feedback).toContain('修复基础缺失')
    expect(result.scaffoldChars).toBe(0)
    expect(result.scaffoldFieldCount).toBe(0)
    expect(result.feedback).not.toContain('正'.repeat(100))
  })

  it('rebuilds the missing handoff scaffold from bounded chain upstream facts', () => {
    const upstream = [
      '[上一章事实]',
      '第12章《王芳入局》',
      '王芳拿到账册；林越确认旧案时间；两人约定分头行动。',
      '',
      '【场景1：酒馆问线】',
      'POV：林越；目标：确认账册来源；行动：追问王芳→核对时间；空间结果：两人离开酒馆。',
      '【场景2：分头行动】',
      'POV：林越；目标：封锁仓库出口；行动：王芳吸引注意→林越入仓；空间结果：拿到账册。',
      '',
      'FACT_LOCK：王芳=话痨；账册=旧案关键物；林越=怀疑内鬼'
    ].join('\n')
    const result = buildSchemaRetryFeedback({
      errors: ['正文过短：2000字，要求不低于2800字'],
      previousOutput: '正'.repeat(2000),
      protectedContract: {
        kind: 'body',
        targetWords: 3500
      },
      chainUpstreamContext: upstream
    })

    expect(result.strategy).toBe('handoff-repair')
    expect(result.feedback).toContain('上一版候选正文中没有出现【正文交接】标记')
    expect(result.feedback).toContain('[上一章事实]')
    expect(result.feedback).toContain('王芳拿到账册')
    expect(result.feedback).toContain('【场景1：酒馆问线】')
    expect(result.feedback).toContain('FACT_LOCK：王芳=话痨')
    expect(result.feedback).toContain('基于 FACT_LOCK 与上游事实链重建交接账本')
    expect(result.feedback).toContain('交接账本必须放进 metadata.extractedMeta[0]')
    expect(result.feedback).not.toContain('正文末尾必须保留【正文交接】区块')
    expect(result.feedback).not.toContain('按原始任务输入重建正文')
    expect(result.scaffoldSource).toBe('upstream')
    expect(result.scaffoldFieldCount).toBeGreaterThan(0)
    expect(result.scaffoldChars).toBeGreaterThan(0)
    expect(result.scaffoldChars).toBeLessThanOrEqual(800)
    expect(result.feedback).not.toContain('正'.repeat(100))
  })

  it('still declares an absent scaffold when both candidate and upstream facts are unavailable', () => {
    const result = buildSchemaRetryFeedback({
      errors: ['正文过短：2000字，要求不低于2800字'],
      previousOutput: '正'.repeat(2000),
      protectedContract: {
        kind: 'body',
        targetWords: 3500
      },
      chainUpstreamContext: '   '
    })

    expect(result.strategy).toBe('handoff-repair')
    expect(result.feedback).toContain('修复基础缺失')
    expect(result.feedback).toContain('按原始任务输入重建正文')
    expect(result.scaffoldSource).toBe('none')
    expect(result.scaffoldFieldCount).toBe(0)
  })

  it('extracts a bounded scaffold from real S1 natural scene handoff syntax', () => {
    const upstream = [
      '上一步结构化交接：',
      '第12章《王芳入局》',
      '场景一：酒馆问线；场景目标是确认账册来源；POV为林越。',
      '场景二：仓库对峙；场景目标是拿到账册；POV为林越。',
      '场景三：分头行动；场景目标是封锁出口；POV为王芳。',
      'FACT_LOCK为 王芳=话痨；账册=旧案关键物；林越=怀疑内鬼。',
      'POV为 陈暮。',
      'narrativeStatus为 READY。'
    ].join('\n')
    const result = buildSchemaRetryFeedback({
      errors: ['正文过短：2000字，要求不低于2800字'],
      previousOutput: '正'.repeat(2000),
      chainUpstreamContext: upstream,
      protectedContract: {
        kind: 'body',
        targetWords: 3500
      }
    })

    expect(result.strategy).toBe('handoff-repair')
    expect(result.scaffoldSource).toBe('upstream')
    expect(result.scaffoldFieldCount).toBeGreaterThan(0)
    expect(result.feedback).toContain('链路上游事实链（有界）')
    expect(result.feedback).toContain('场景一：酒馆问线')
    expect(result.feedback).toContain('FACT_LOCK为 王芳=话痨')
    expect(result.feedback).not.toContain('修复基础缺失')
    expect(result.feedback).not.toContain('按原始任务输入重建正文')
    expect(result.feedback).not.toContain('正'.repeat(100))
    expect(result.scaffoldChars).toBeLessThanOrEqual(800)
  })

  it('reuses the legacy handoff ledger inside a real S1 upstream prompt', () => {
    const upstream = [
      '上一步结构化交接：',
      '【正文交接】',
      '章节：灰绿光下的舱门',
      'POV：陈暮，全程限知',
      '已完成场景：场景1—场景4',
      'FACT_LOCK：王芳=话痨；账册=旧案关键物',
      '事件增量：确认可感知范围无人且菌膜仍存',
      '【正文交接结束】'
    ].join('\n')
    const result = buildSchemaRetryFeedback({
      errors: ['正文过短：2000字，要求不低于2800字'],
      previousOutput: '正'.repeat(2000),
      chainUpstreamContext: upstream,
      protectedContract: {
        kind: 'body',
        targetWords: 3500
      }
    })

    expect(result.strategy).toBe('handoff-repair')
    expect(result.scaffoldSource).toBe('upstream')
    expect(result.scaffoldFieldCount).toBeGreaterThan(0)
    expect(result.feedback).toContain('链路上游事实链（有界）')
    expect(result.feedback).toContain('章节：灰绿光下的舱门')
    expect(result.feedback).toContain('FACT_LOCK：王芳=话痨')
    expect(result.feedback).not.toContain('修复基础缺失')
    expect(result.scaffoldChars).toBeLessThanOrEqual(800)
  })

  it('keeps bounded-summary feedback for quality failures', () => {
    const result = buildSchemaRetryFeedback({
      errors: ['复述上一步内容过多'],
      previousOutput: '候选\n\n【正文交接】\nFACT_LOCK：示例事实',
      protectedContract: {
        kind: 'body',
        targetWords: 3500
      }
    })

    expect(result.strategy).toBe('bounded-summary')
    expect(result.feedback).toContain('请基于原始任务输入重新输出完整结果')
    expect(result.feedback).not.toContain('请以上一版候选输出为基底补写缺失场景')
  })

  it('asks an overlong candidate to compress without dropping bounded structure', () => {
    const candidate = [
      '正'.repeat(5000),
      '【正文交接】',
      '章节：第12章 王芳入局',
      'POV：林越',
      '已完成场景：1. 王芳在酒馆讲出线索；2. 林越确认旧案时间',
      'FACT_LOCK：王芳=话痨；账册=旧案关键物',
      '【正文交接结束】'
    ].join('\n')
    const result = buildSchemaRetryFeedback({
      errors: ['正文过长：5000字，要求不超过4000字'],
      previousOutput: candidate,
      protectedContract: {
        kind: 'body',
        targetWords: 3500
      }
    })

    expect(result.strategy).toBe('word-gap')
    expect(result.scaffoldSource).toBe('candidate')
    expect(result.feedback).toContain('优先压缩重复说明与无效描写')
    expect(result.feedback).toContain('不得删除场景、事实或对白回合')
    expect(result.feedback).toContain('净字数不得低于下限')
    expect(result.feedback).not.toContain('不得低于上一版净字数')
    expect(result.feedback).not.toContain(candidate)
  })

  it('repairs a missing handoff from bounded upstream facts without carrying prose', () => {
    const candidate = '正'.repeat(2000)
    const upstream = [
      '[上一章事实]',
      '王芳拿到账册；林越确认旧案时间。',
      'FACT_LOCK：王芳=话痨；账册=旧案关键物'
    ].join('\n')
    const result = buildSchemaRetryFeedback({
      errors: ['正文过短：2000字，要求不低于2800字'],
      previousOutput: candidate,
      chainUpstreamContext: upstream,
      protectedContract: {
        kind: 'body',
        targetWords: 3500
      }
    })

    expect(result.strategy).toBe('handoff-repair')
    expect(result.scaffoldSource).toBe('upstream')
    expect(result.feedback).toContain('上一版候选正文中没有出现【正文交接】标记')
    expect(result.feedback).toContain('链路上游事实链（有界）')
    expect(result.feedback).toContain('FACT_LOCK：王芳=话痨')
    expect(result.feedback).toContain('基于 FACT_LOCK 与上游事实链重建交接账本')
    expect(result.feedback).not.toContain('正'.repeat(100))
    expect(result.feedback).not.toContain('【结构化重试反馈】\n本反馈描述净字数缺口')
    expect(result.scaffoldChars).toBeLessThanOrEqual(800)
    expect(result.suppressedCandidateChars).toBe(candidate.length)
  })

  it('declares an explicit repair escalation when handoff and upstream facts are both unavailable', () => {
    const candidate = '正'.repeat(2000)
    const result = buildSchemaRetryFeedback({
      errors: ['正文过短：2000字，要求不低于2800字'],
      previousOutput: candidate,
      protectedContract: {
        kind: 'body',
        targetWords: 3500
      }
    })

    expect(result.strategy).toBe('handoff-repair')
    expect(result.scaffoldSource).toBe('none')
    expect(result.feedback).toContain('修复基础缺失')
    expect(result.feedback).toContain('链路上游事实链不可用')
    expect(result.feedback).toContain('按原始任务输入重建正文')
    expect(result.feedback).not.toContain('正'.repeat(100))
    expect(result.scaffoldChars).toBe(0)
    expect(result.suppressedCandidateChars).toBe(candidate.length)
  })

  it('repairs a declared handoff failure with only the bounded handoff ledger', () => {
    const candidate = [
      '正'.repeat(2000),
      '【正文交接】',
      '章节：第12章 王芳入局',
      'POV：林越',
      'FACT_LOCK：王芳=话痨；账册=旧案关键物',
      '事件增量：王芳获得新信息，处境改变。',
      '【正文交接结束】'
    ].join('\n')
    const result = buildSchemaRetryFeedback({
      errors: ['【正文交接】缺少必填字段「事件增量」'],
      previousOutput: candidate,
      protectedContract: {
        kind: 'body',
        targetWords: 3500
      }
    })

    expect(result.strategy).toBe('handoff-repair')
    expect(result.scaffoldSource).toBe('candidate')
    expect(result.feedback).toContain('上一版【正文交接】账本（有界，不是正文全文）')
    expect(result.feedback).toContain('FACT_LOCK：王芳=话痨')
    expect(result.feedback).toContain('只修复失败项')
    expect(result.feedback).not.toContain('正'.repeat(100))
    expect(result.scaffoldChars).toBeGreaterThan(0)
    expect(result.scaffoldChars).toBeLessThanOrEqual(800)
    expect(result.suppressedCandidateChars).toBe(candidate.length)
  })
})
