import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pipelineSource = readFileSync(new URL('../components/pipeline/PipelinePanel.vue', import.meta.url), 'utf8')

describe('chapter context scope wiring', () => {
  it('emits a context_scope trace event for every body execution package', () => {
    expect(pipelineSource).toContain("type: 'context_scope'")
    expect(pipelineSource).toContain("mode: contextScope.degradedReason ? 'legacy_outline_no_scope' : 'unit_closure'")
  })

  it('passes the scope into the v2 execution package instead of silently using the full outline', () => {
    expect(pipelineSource).toContain('buildOutlineUnitClosure')
    expect(pipelineSource).toContain('validateOutlineContextScope')
    expect(pipelineSource).toContain('contextScope,')
  })

  it('passes the resolved unit id into scoped memory retrieval', () => {
    expect(pipelineSource).toContain('const resolvedUnitId = ch.unitId || ch.plot?.match(')
    expect(pipelineSource).toContain('unitId: resolvedUnitId || undefined')
  })

  it('must stop generation when the scoped closure cannot be built', () => {
    // This is a deliberate source-level guard: a failed closure must terminate
    // genBody before an execution package can fall back to the full outline.
    expect(pipelineSource).toContain("if (!outlineClosure || !outlineClosure.ok) {")
    expect(pipelineSource).toContain("throw new Error(`正文上下文闭包构建失败：")
  })

  it('records memory retrieval trimming and priority in the body trace', () => {
    expect(pipelineSource).toContain("type: 'memory_context'")
    expect(pipelineSource).toContain('memoryRetrieval.trimmed.length > 0')
    expect(pipelineSource).toContain('priority: memoryRetrieval.priority')
  })
})
