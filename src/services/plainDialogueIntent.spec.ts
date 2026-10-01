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

  it('keeps explicit repeated append directives writable', () => {
    expect(classifyPlainDialogueIntent('请连续追加四次内容')).toBe('edit')
  })

  it('keeps natural add directives writable at section anchors', () => {
    expect(
      classifyPlainDialogueIntent(
        '请在第 7 节结尾新增一句：纸伞骨上的旧漆裂开一道细缝。',
      ),
    ).toBe('edit')
    expect(classifyPlainDialogueIntent('在第 3 段末尾加一句：夜潮退去。')).toBe('edit')
    expect(classifyPlainDialogueIntent('给这段结尾加上一句过渡')).toBe('edit')
    expect(classifyPlainDialogueIntent('在这句话后面添一句解释')).toBe('edit')
    expect(classifyPlainDialogueIntent('在末尾增加一段雨后的描写')).toBe('edit')
  })

  it('keeps write location questions read-only', () => {
    expect(classifyPlainDialogueIntent('这段设定写在哪里合适？')).toBe('discuss')
    expect(classifyPlainDialogueIntent('插入点在哪里？')).toBe('discuss')
    expect(classifyPlainDialogueIntent('这句应该新增在哪一节？')).toBe('discuss')
  })

  it('keeps add-related questions and prohibitions read-only', () => {
    expect(classifyPlainDialogueIntent('要不要在第 7 节新增一句？')).toBe('discuss')
    expect(classifyPlainDialogueIntent('能否在这段末尾加一句？')).toBe('discuss')
    expect(classifyPlainDialogueIntent('是不是把第 7 节新增一句比较好？')).toBe('discuss')
    expect(classifyPlainDialogueIntent('不要新增内容，先保持原样')).toBe('discuss')
    expect(classifyPlainDialogueIntent('先别加一句，我们再讨论')).toBe('discuss')
  })

  it('keeps structured replacement commands writable and preview questions read-only', () => {
    expect(classifyPlainDialogueIntent('把第三章那个“灯塔顶端”换成“塔尖”')).toBe('edit')
    expect(classifyPlainDialogueIntent('旧信来源这几个字 改成 信的出处')).toBe('edit')
    expect(classifyPlainDialogueIntent('把这句改成什么样')).toBe('discuss')
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
