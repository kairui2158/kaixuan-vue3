import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pipelineSource = readFileSync(new URL('../components/pipeline/PipelinePanel.vue', import.meta.url), 'utf8')
const chatSource = readFileSync(new URL('../components/chat/ChatPanel.vue', import.meta.url), 'utf8')
const packageSource = readFileSync(new URL('./chapterExecutionPackage.ts', import.meta.url), 'utf8')
const volumeSource = readFileSync(new URL('./volumeGeneration.ts', import.meta.url), 'utf8')
const projectionSource = readFileSync(new URL('./settingsProjection.ts', import.meta.url), 'utf8')
const outlineSource = readFileSync(new URL('../components/common/OutlineWorkspace.vue', import.meta.url), 'utf8')

describe('settings lock projection wiring', () => {
  it('routes the volume, chapter, and body layers through the projection service', () => {
    expect(pipelineSource).toContain("getLockedSettingsForLayer('volume'")
    expect(pipelineSource).toContain("getLockedSettingsForLayer('chapter'")
    expect(pipelineSource).toContain("getLockedSettingsForLayer('body'")
    expect(pipelineSource).toContain('buildSettingsProjectionTraceEvent')
    expect(projectionSource).toContain('settings-projection-composed')
  })

  it('removes the duplicate bound-settings channel from generation paths', () => {
    expect(pipelineSource).not.toContain('getBoundSettingsText')
    expect(pipelineSource).not.toContain('[绑定设定]')
    expect(packageSource).not.toContain('[绑定设定]')
    expect(volumeSource).not.toContain('[绑定设定]')
  })

  it('uses the locked projection in the homepage chat context', () => {
    expect(chatSource).toContain('getLockedSettingsForLayer')
    expect(chatSource).not.toContain('isBound')
  })

  it('keeps card locking as the only settings truth in the pipeline UI', () => {
    expect(pipelineSource).toContain('toggleSettingLock')
    expect(pipelineSource).toContain('lockCategorySettings')
    expect(pipelineSource).not.toContain('toggleItemBinding')
    expect(pipelineSource).not.toContain('bindCategorySettings')
  })

  it('creates new outline-decomposed settings with the lock status single source', () => {
    expect(outlineSource).toContain("status: 'draft'")
    expect(outlineSource).toContain('lockedAt: null')
    expect(outlineSource).not.toContain('isBound')
    expect(outlineSource).not.toContain('boundTo')
  })
})
