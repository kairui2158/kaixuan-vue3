import { describe, expect, it } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import { createDeaiVoiceProfileRunSnapshotStore } from '../../../services/deaiVoiceProfileRunSnapshot'
import { buildDeaiVoiceProfileTraceEvent } from '../../../services/deaiVoiceProfile'
import { DEFAULT_SKILL_DEAI_META, resolveDeaiPromptForSkillStep } from '../../../services/skillDeaiContract'

const pipelineSource = await import('node:fs')
  .then(fs => fs.readFileSync(new URL('../PipelinePanel.vue', import.meta.url), 'utf8'))
  .catch(() => '')

const styleA = {
  profileVersion: 2 as const,
  locked: true,
  injected: true,
  voice: { protagonistSpeech: 'A声口', dialogueTags: 'A标签', subtextDensity: '高' },
}

const styleB = {
  profileVersion: 2 as const,
  locked: true,
  injected: true,
  voice: { protagonistSpeech: 'B声口', dialogueTags: 'B标签', subtextDensity: '低' },
}

describe('DEAI voice profile run snapshot integration', () => {
  it('freezes request prompts and trace events for an active pipeline run', async () => {
    const style = ref(styleA)
    const runIds = ref(['pipeline-run-1'])
    const store = createDeaiVoiceProfileRunSnapshotStore({
      activeRunIds: computed(() => new Set(runIds.value)),
      styleProfile: style,
    })

    const profileBefore = store.resolveForRun('pipeline-run-1')
    const projectionBefore = resolveDeaiPromptForSkillStep(4, 0, 3, DEFAULT_SKILL_DEAI_META, {
      voiceProfile: profileBefore,
    })
    const traceBefore = buildDeaiVoiceProfileTraceEvent(profileBefore)

    style.value = styleB
    await nextTick()

    const profileAfter = store.resolveForRun('pipeline-run-1')
    const projectionAfter = resolveDeaiPromptForSkillStep(4, 0, 3, DEFAULT_SKILL_DEAI_META, {
      voiceProfile: profileAfter,
    })
    const traceAfter = buildDeaiVoiceProfileTraceEvent(profileAfter)

    expect(projectionAfter.prompt).toBe(projectionBefore.prompt)
    expect(traceAfter?.detail).toBe(traceBefore?.detail)
    expect(projectionAfter.prompt).toContain('A声口')
    expect(projectionAfter.prompt).not.toContain('B声口')
  })

  it('keeps the null-run profile live so manual-side calculations stay reactive', async () => {
    const style = ref(styleA)
    const store = createDeaiVoiceProfileRunSnapshotStore({
      activeRunIds: computed(() => new Set(['pipeline-run-1'])),
      styleProfile: style,
    })

    style.value = styleB
    await nextTick()

    expect(store.resolveForRun(null)?.text).toContain('B声口')
    expect(store.resolveForRun('terminal-run')?.text).toContain('B声口')
  })

  it('wires PipelinePanel projections, traces, and minimal edits to run-owned snapshots', () => {
    expect(pipelineSource).toContain('createDeaiVoiceProfileRunSnapshotStore({')
    expect(pipelineSource).toContain('activeRunIds: activePipelineRunIds')
    expect(pipelineSource).toContain('styleProfile: pipelineStyleProfileEffective')
    expect(pipelineSource).toContain('function resolveDeaiVoiceProfileForRun(pipelineRunId: string | null | undefined)')
    expect(pipelineSource).toContain('return deaiVoiceProfileRunSnapshots.resolveForRun(pipelineRunId)')
    expect(pipelineSource).toContain('voiceProfile: resolveDeaiVoiceProfileForRun(pipelineRunId)')
    expect(pipelineSource).toContain('emitDeaiVoiceProfileTrace(traceRunId, pipelineRunIdParam)')
    expect(pipelineSource).toContain('emitDeaiVoiceProfileTrace(runId, pipelineRunIdParam)')
    expect(pipelineSource).not.toContain('runBodyMinimalEdit')
    expect(pipelineSource).not.toContain('pipelineDeaiVoiceProfile.value')
  })
})
