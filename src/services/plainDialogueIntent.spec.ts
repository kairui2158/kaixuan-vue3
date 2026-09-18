import { describe, expect, it } from 'vitest'
import { INTENT_CORPUS_SAMPLES } from './chainIntentCorpus'
import { classifyPlainDialogueIntent } from './plainDialogueIntent'

describe('plainDialogueIntent', () => {
  it('normalizes unknown or empty input to discuss', () => {
    expect(classifyPlainDialogueIntent('')).toBe('discuss')
    expect(classifyPlainDialogueIntent('嗯')).toBe('discuss')
  })

  it('keeps explicit edit requests writable', () => {
    expect(classifyPlainDialogueIntent('请修改第二章内容')).toBe('edit')
  })

  it('keeps explicit imperative write requests writable', () => {
    expect(classifyPlainDialogueIntent('请把风暴开场写入编辑器')).toBe('edit')
    expect(classifyPlainDialogueIntent('请替换重复目标')).toBe('edit')
    expect(classifyPlainDialogueIntent('请在大文档尾部追加内容')).toBe('edit')
    expect(classifyPlainDialogueIntent('把这段设定插入第三段')).toBe('edit')
  })

  it('keeps write location questions read-only', () => {
    expect(classifyPlainDialogueIntent('这段设定写在哪里合适？')).toBe('discuss')
    expect(classifyPlainDialogueIntent('插入点在哪里？')).toBe('discuss')
  })

  it('passes the single-source intent corpus from the 2026-09-17 trace', () => {
    for (const sample of INTENT_CORPUS_SAMPLES) {
      expect({
        input: sample.input,
        actual: classifyPlainDialogueIntent(sample.input),
      }).toEqual({
        input: sample.input,
        actual: sample.expectedIntent,
      })
    }
  })
})
