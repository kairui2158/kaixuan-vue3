export type PipelineChainWarningCode =
  | 'chain-handoff-contract-miss'
  | 'chain-dedupe'
  | 'chain-handoff-escalation'
  | 'chain-full-reason-missing'
  | 'chain-output-echo'

export interface PipelineStepWarningCoalescingState {
  count: number
  lastLine: string
}

export function buildPipelineChainWarningLine(input: {
  step: number
  skillIndex: number
  code: PipelineChainWarningCode
  summary: string
  count?: number
}) {
  const count = Math.max(1, Number(input.count) || 1)
  const suffix = count > 1 ? `（累计 ${count} 次）` : ''
  return `链式警告 ${input.step}/${input.skillIndex + 1}：${input.summary}${suffix}`
}

export function coalescePipelineStepWarning(input: {
  line: string
  code: string
  state: PipelineStepWarningCoalescingState
}) {
  const nextCount = input.state.count + 1
  const baseLine = input.line.replace(/（累计 \d+ 次）$/, '')
  return {
    count: nextCount,
    line: `${baseLine}（累计 ${nextCount} 次）`
  }
}
