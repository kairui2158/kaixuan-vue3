import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('pipeline volume target lock semantics', () => {
  it('binds both next-volume generation modes to the next-volume target lock', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/pipeline/PipelinePanel.vue'),
      'utf8',
    )

    expect(source).toContain("const volumesTarget = mode === 'auto' ? 'all' : 'next-volume'")
    expect(source).toContain("startTrackedGeneration('volumes', volumesTarget")
    expect(source).not.toContain("mode === 'continue' ? 'next-volume' : 'all'")
  })

  it('keeps the single-volume button disabled state aligned with its run target', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/pipeline/PipelinePanel.vue'),
      'utf8',
    )

    expect(source).toContain("isTargetGenerating('volumes', 'next-volume')")
  })
})
