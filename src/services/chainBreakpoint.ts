export type ChainBreakpointStatus = 'completed' | 'failed'

export type ChainBreakpoint = {
  kind: 'chain'
  status: ChainBreakpointStatus
  step: number
  projectId: string
  skillIndex: number
  skillId: string
  skillSequence: string[]
  lastSuccessChainIndex: number
  lastOutput: string
  inputPrompt: string
  agentId: string
  retryCount: number
  volumeIndex?: number
  error?: string
  updatedAt: string
}

export type ChainResumeInput = {
  breakpoint?: Partial<ChainBreakpoint> | null
  step: number
  projectId: string
  skillSequence: string[]
}

export type ChainResumePoint = {
  startIndex: number
  previousOutput: string
  resumed: boolean
}

export function createChainSuccessBreakpoint(input: Omit<ChainBreakpoint, 'kind' | 'status' | 'updatedAt'>): ChainBreakpoint {
  return {
    ...input,
    kind: 'chain',
    status: 'completed',
    updatedAt: new Date().toISOString()
  }
}

export function createChainFailureBreakpoint(input: Omit<ChainBreakpoint, 'kind' | 'status' | 'updatedAt'>): ChainBreakpoint {
  return {
    ...input,
    kind: 'chain',
    status: 'failed',
    updatedAt: new Date().toISOString()
  }
}

export function getChainResumePoint(input: ChainResumeInput): ChainResumePoint {
  const bp = input.breakpoint
  if (!bp || bp.step !== input.step || bp.projectId !== input.projectId) {
    return { startIndex: 0, previousOutput: '', resumed: false }
  }
  const sequenceMatches = Array.isArray(bp.skillSequence)
    ? bp.skillSequence.length === input.skillSequence.length && bp.skillSequence.every((id, index) => id === input.skillSequence[index])
    : true
  if (!sequenceMatches) return { startIndex: 0, previousOutput: '', resumed: false }

  const legacyNext = Number.isInteger(bp.lastSuccessChainIndex) ? Number(bp.lastSuccessChainIndex) + 1 : 0
  const failedIndex = bp.status === 'failed' && Number.isInteger(bp.skillIndex) ? Number(bp.skillIndex) : -1
  const startIndex = Math.max(0, Math.min(failedIndex >= 0 ? failedIndex : legacyNext, input.skillSequence.length))
  return {
    startIndex,
    previousOutput: typeof bp.lastOutput === 'string' ? bp.lastOutput : '',
    resumed: startIndex > 0 || failedIndex >= 0
  }
}
