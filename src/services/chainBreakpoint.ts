export type ChainBreakpointStatus = 'completed' | 'failed'

export type ChainBreakpointHandoff = {
  artifactId: string
  sourceStep: number
  sourceSkillId: string
  outputHash: string
  fullTextLength: number
  delivery: string
  canonicalExcerpt?: string
}

export type ChainBreakpointStepOutput = {
  skillIndex: number
  skillId: string
  output: string
  callerStatus?: 'success' | 'degraded' | 'failed' | 'blocked'
  outputHash?: string
  metadata?: Record<string, unknown>
}

export type ChainBreakpoint = {
  kind: 'chain'
  status: ChainBreakpointStatus
  step: number
  projectId: string
  ownerKey?: string
  skillIndex: number
  skillId: string
  skillSequence: string[]
  lastSuccessChainIndex: number
  lastOutput: string
  stepOutputs?: ChainBreakpointStepOutput[]
  lastHandoff?: ChainBreakpointHandoff
  handoffHashes?: string[]
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
  ownerKey?: string
}

export type ChainResumePoint = {
  startIndex: number
  previousOutput: string
  lastHandoff?: ChainBreakpointHandoff
  handoffHashes: string[]
  resumed: boolean
  completedChain: boolean
  stepOutputs: ChainBreakpointStepOutput[]
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
    return { startIndex: 0, previousOutput: '', handoffHashes: [], resumed: false, completedChain: false, stepOutputs: [] }
  }
  // ownerKey is mandatory for resumes once this field exists. Legacy breakpoints
  // had no owner, so treating them as another run's state would be cross-owner reuse.
  if (!bp.ownerKey || bp.ownerKey !== input.ownerKey) {
    return { startIndex: 0, previousOutput: '', handoffHashes: [], resumed: false, completedChain: false, stepOutputs: [] }
  }
  const sequenceMatches = Array.isArray(bp.skillSequence)
    ? bp.skillSequence.length === input.skillSequence.length && bp.skillSequence.every((id, index) => id === input.skillSequence[index])
    : true
  if (!sequenceMatches) {
    return { startIndex: 0, previousOutput: '', handoffHashes: [], resumed: false, completedChain: false, stepOutputs: [] }
  }

  const legacyNext = Number.isInteger(bp.lastSuccessChainIndex) ? Number(bp.lastSuccessChainIndex) + 1 : 0
  const completedChain = bp.status === 'completed' && legacyNext >= input.skillSequence.length
  if (completedChain) {
    return { startIndex: 0, previousOutput: '', handoffHashes: [], resumed: false, completedChain: true, stepOutputs: normalizeStepOutputs(bp.stepOutputs) }
  }
  const failedIndex = bp.status === 'failed' && Number.isInteger(bp.skillIndex) ? Number(bp.skillIndex) : -1
  const startIndex = Math.max(0, Math.min(failedIndex >= 0 ? failedIndex : legacyNext, input.skillSequence.length))
  return {
    startIndex,
    previousOutput: typeof bp.lastOutput === 'string' ? bp.lastOutput : '',
    lastHandoff: bp.lastHandoff,
    handoffHashes: Array.isArray(bp.handoffHashes)
      ? bp.handoffHashes.filter(hash => typeof hash === 'string' && hash.length > 0)
      : [],
    resumed: startIndex > 0 || failedIndex >= 0,
    completedChain: false,
    stepOutputs: normalizeStepOutputs(bp.stepOutputs)
  }
}

function normalizeStepOutputs(outputs?: ChainBreakpointStepOutput[]): ChainBreakpointStepOutput[] {
  if (!Array.isArray(outputs)) return []
  return outputs.filter(output =>
    Number.isInteger(output.skillIndex) &&
    typeof output.skillId === 'string' &&
    typeof output.output === 'string'
  ).map(output => ({
    ...output,
    metadata: isPlainRecord(output.metadata) ? output.metadata : undefined
  }))
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
