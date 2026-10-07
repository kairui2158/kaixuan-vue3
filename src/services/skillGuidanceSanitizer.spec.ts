import { describe, expect, it } from 'vitest'
import {
  SKILL_GUIDANCE_PROTOCOL_GUARD,
  sanitizeSkillGuidance,
} from './skillGuidanceSanitizer'

const legacyProtocolGuidance = [
  '卷纲领域能力：保持玄枵派设定一致，钩子必须服务于悬念张力。',
  '### 修改预览',
  '作者要求修改/补充/重写/调整/优化大纲 → 编辑写入·修改预览',
  '### 批准写回',
  '### 写入未执行',
  'status: pending',
  'await_user: true',
  '【下一问】',
  '讨论/分析请求没有写入权限，只有编辑请求才能调用 editor.write。',
  '执行侧允许的物理请求轮次为 36 轮。',
].join('\n')

describe('sanitizeSkillGuidance', () => {
  it('removes legacy execution protocol semantics from folder SKILL guidance', () => {
    const result = sanitizeSkillGuidance(legacyProtocolGuidance)

    expect(result.text).not.toContain('修改预览')
    expect(result.text).not.toContain('批准写回')
    expect(result.text).not.toContain('写入未执行')
    expect(result.text).not.toContain('status: pending')
    expect(result.text).not.toContain('await_user')
    expect(result.text).not.toContain('【下一问】')
    expect(result.text).not.toContain('editor.write')
    expect(result.text).not.toContain('物理请求轮次')
    expect(result.removedCategories).toContain('legacy_preview_state_machine')
    expect(result.removedCategories).toContain('execution_control_markers')
    expect(result.removedCategories).toContain('execution_protocol_semantics')
  })

  it('keeps domain capability text and wraps it with the app protocol guard', () => {
    const result = sanitizeSkillGuidance(legacyProtocolGuidance)

    expect(result.text).toContain('卷纲领域能力：保持玄枵派设定一致')
    expect(result.text).toContain('钩子必须服务于悬念张力')
    expect(result.text).toContain(SKILL_GUIDANCE_PROTOCOL_GUARD)
    expect(result.originalChars).toBe(legacyProtocolGuidance.length)
    expect(result.removedChars).toBeGreaterThan(0)
  })

  it('is idempotent and does not duplicate the guard', () => {
    const once = sanitizeSkillGuidance(legacyProtocolGuidance)
    const twice = sanitizeSkillGuidance(once.text)

    expect(twice.text).toBe(once.text)
    expect(twice.removedCategories).toEqual([])
  })

  it('returns empty guidance unchanged', () => {
    const result = sanitizeSkillGuidance('')

    expect(result).toMatchObject({
      text: '',
      originalChars: 0,
      removedChars: 0,
      removedCategories: [],
    })
  })
})
