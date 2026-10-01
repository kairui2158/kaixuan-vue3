export type ToolLoopScenario =
  | 'direct'
  | 'direct-tool-intensive'
  | 'folder-chain'
  | 'compatibility-json'

export interface ToolLoopPolicy {
  scenario: ToolLoopScenario
  maxToolIterations: number
  /** Total deadline inherited from the caller; 0 means no separate timeout. */
  timeoutMs: number
  /** Whether a no-tools convergence request is allowed after the limit. */
  convergence: boolean
}

const TOOL_LOOP_POLICIES: Record<ToolLoopScenario, ToolLoopPolicy> = {
  direct: {
    scenario: 'direct',
    maxToolIterations: 6,
    timeoutMs: 0,
    convergence: true,
  },
  'direct-tool-intensive': {
    scenario: 'direct-tool-intensive',
    maxToolIterations: 12,
    timeoutMs: 0,
    convergence: true,
  },
  'folder-chain': {
    scenario: 'folder-chain',
    maxToolIterations: 4,
    timeoutMs: 0,
    convergence: true,
  },
  'compatibility-json': {
    scenario: 'compatibility-json',
    maxToolIterations: 1,
    timeoutMs: 0,
    convergence: false,
  },
}

/**
 * Hard safety ceiling for explicit caller overrides. Product defaults remain
 * scenario-specific; this only allows bounded opt-ins (for example, replaying a
 * recorded customer run that legitimately needs more iterations than default).
 */
const MAX_EXPLICIT_TOOL_ITERATIONS = 64

export function getToolLoopPolicy(scenario: ToolLoopScenario): ToolLoopPolicy {
  return TOOL_LOOP_POLICIES[scenario] ?? TOOL_LOOP_POLICIES.direct
}

export function normalizeToolIterations(
  scenario: ToolLoopScenario,
  requested?: number,
): number {
  const policy = getToolLoopPolicy(scenario)
  if (requested === undefined) return policy.maxToolIterations
  // JSON compatibility mode is a protocol downgrade, not a native tool loop;
  // keep its single-shot behavior immutable.
  if (scenario === 'compatibility-json') return policy.maxToolIterations
  return Math.max(1, Math.min(requested, MAX_EXPLICIT_TOOL_ITERATIONS))
}
