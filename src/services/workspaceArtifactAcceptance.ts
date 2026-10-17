import {
  acceptStepArtifact,
  type StepArtifactAcceptanceResult,
} from './stepArtifactAcceptance'
import type { BodyArtifactContract } from './bodyArtifactContract'
import {
  validateOutlineIntegrity,
  type OutlineIntegrityOptions,
  type OutlineIntegrityReport,
} from './outlineIntegrity'

export type WorkspaceArtifactContract =
  | {
      kind: 'body'
      contract: BodyArtifactContract
    }
  | {
      kind: 'outline'
      original: string
      options?: OutlineIntegrityOptions
    }

export type WorkspaceArtifactTerminalStatus =
  | 'success'
  | 'success_with_warnings'
  | 'degraded'
  | 'blocked'

export interface WorkspaceArtifactAcceptanceResult {
  decision: 'accept' | 'reject'
  reason: 'no_contract' | 'contract_valid' | 'contract_failed' | 'caller_failed'
  callerStatus: 'success' | 'degraded' | 'failed' | 'blocked'
  stepArtifact: StepArtifactAcceptanceResult | null
  outlineIntegrity: OutlineIntegrityReport | null
  terminalStatus: WorkspaceArtifactTerminalStatus
  terminalReason: string
  downstreamPayload: string | null
  errors: string[]
  warnings: string[]
  traceDetail: Record<string, unknown>
}

function fromBody(
  acceptance: StepArtifactAcceptanceResult,
  callerStatus: WorkspaceArtifactAcceptanceResult['callerStatus'],
  degradedErrors: string[],
): WorkspaceArtifactAcceptanceResult {
  const accepted = acceptance.decision === 'accept'
  return {
    decision: acceptance.decision,
    reason: acceptance.reason,
    callerStatus,
    stepArtifact: acceptance,
    outlineIntegrity: null,
    terminalStatus: accepted
      ? acceptance.errors.length || callerStatus === 'degraded'
        ? 'success_with_warnings'
        : 'success'
      : callerStatus === 'failed' || callerStatus === 'blocked'
        ? 'blocked'
        : 'degraded',
    terminalReason: accepted
      ? acceptance.errors.length || callerStatus === 'degraded'
        ? 'artifact_contract_warning'
        : 'artifact_contract_valid'
      : callerStatus === 'failed' || callerStatus === 'blocked'
        ? 'artifact_caller_failed'
        : acceptance.callerStatus === 'degraded'
          ? 'artifact_degraded_plus_contract_failure'
          : 'artifact_contract_failure',
    downstreamPayload: acceptance.downstreamPayload,
    errors: acceptance.errors,
    warnings: [...degradedErrors],
    traceDetail: {
      contractKind: 'body',
      decision: acceptance.decision,
      reason: acceptance.reason,
      callerStatus,
      rawWordCount: acceptance.rawWordCount,
      extractedWordCount: acceptance.extractedWordCount,
      metadataDelta: acceptance.metadataDelta,
      degradedErrors,
      contractErrors: acceptance.validation?.errors || [],
    },
  }
}

function fromOutline(
  contract: Extract<WorkspaceArtifactContract, { kind: 'outline' }>,
  rawOutput: string,
  callerStatus: WorkspaceArtifactAcceptanceResult['callerStatus'],
  degradedErrors: string[],
): WorkspaceArtifactAcceptanceResult {
  if (callerStatus === 'failed' || callerStatus === 'blocked') {
    return {
      decision: 'reject',
      reason: 'caller_failed',
      callerStatus,
      stepArtifact: null,
      outlineIntegrity: null,
      terminalStatus: 'blocked',
      terminalReason: 'artifact_caller_failed',
      downstreamPayload: null,
      errors: callerStatus === 'failed' ? ['SKILL 调用失败'] : ['SKILL 调用被阻断'],
      warnings: [],
      traceDetail: {
        contractKind: 'outline',
        decision: 'reject',
        reason: 'caller_failed',
        callerStatus,
      },
    }
  }
  const report = validateOutlineIntegrity(contract.original, rawOutput, contract.options)
  const criticalIssues = report.issues.filter(issue => issue.level === 'critical')
  const warningIssues = report.issues.filter(issue => issue.level === 'warning')
  const accepted = report.ok
  return {
    decision: accepted ? 'accept' : 'reject',
    reason: accepted ? 'contract_valid' : 'contract_failed',
    callerStatus,
    stepArtifact: null,
    outlineIntegrity: report,
    terminalStatus: accepted
      ? warningIssues.length || degradedErrors.length || callerStatus === 'degraded'
        ? 'success_with_warnings'
        : 'success'
      : callerStatus === 'degraded'
        ? 'degraded'
        : 'blocked',
    terminalReason: accepted
      ? warningIssues.length || degradedErrors.length || callerStatus === 'degraded'
        ? 'artifact_contract_warning'
        : 'artifact_contract_valid'
      : callerStatus === 'degraded'
        ? 'artifact_degraded_plus_contract_failure'
        : 'artifact_contract_failure',
    downstreamPayload: accepted ? rawOutput : null,
    errors: accepted ? [] : criticalIssues.map(issue => issue.message),
    warnings: [
      ...degradedErrors,
      ...warningIssues.map(issue => issue.message),
    ],
    traceDetail: {
      contractKind: 'outline',
      decision: accepted ? 'accept' : 'reject',
      reason: accepted ? 'contract_valid' : 'contract_failed',
      callerStatus,
      criticalCount: report.criticalCount,
      warningCount: report.warningCount,
      issues: report.issues,
      degradedErrors,
    },
  }
}

export function acceptWorkspaceArtifact(input: {
  rawOutput: string
  callerStatus?: 'success' | 'degraded' | 'failed' | 'blocked'
  degradedErrors?: string[]
  contract: WorkspaceArtifactContract | null
}): WorkspaceArtifactAcceptanceResult {
  const rawOutput = String(input.rawOutput || '')
  const callerStatus = input.callerStatus || 'success'
  const degradedErrors = (input.degradedErrors || []).filter(Boolean)
  if (!input.contract) {
    return {
      decision: 'accept',
      reason: 'no_contract',
      callerStatus,
      stepArtifact: null,
      outlineIntegrity: null,
      terminalStatus: callerStatus === 'degraded' ? 'success_with_warnings' : 'success',
      terminalReason: 'artifact_no_contract',
      downstreamPayload: rawOutput,
      errors: [],
      warnings: [...degradedErrors],
      traceDetail: {
        contractKind: 'none',
        decision: 'accept',
        reason: 'no_contract',
        callerStatus,
        degradedErrors,
      },
    }
  }
  return input.contract.kind === 'body'
    ? fromBody(
      acceptStepArtifact({
        rawOutput,
        callerStatus,
        degradedErrors,
        contract: input.contract.contract,
      }),
      callerStatus,
      degradedErrors,
    )
    : fromOutline(input.contract, rawOutput, callerStatus, degradedErrors)
}
