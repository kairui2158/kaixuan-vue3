import { reactive } from 'vue'
import type { BodyArtifactContract } from './bodyArtifactContract'
import type { StepArtifactAcceptanceResult } from './stepArtifactAcceptance'
import type { FinalStepMetadataFlowResult } from './stepArtifactAcceptance'
import type { DeaiStageDiagnosis } from './deaiStageDiagnosis'
import type { DeaiSkillReportInput } from './deaiSkillReport'
import type { RealSkillFileFingerprint } from './realSkillTypes'

export type PipelinePerRunGenerationUiState = {
  logs: string[]
  skillSteps: PipelineSkillStepState[]
  generationVolume?: any
  bodyChainContract?: BodyArtifactContract | null
  bodyGeneratorStepIndex?: number | null
  bodyStepAcceptance?: StepArtifactAcceptanceResult[]
  bodyFinalStepMetadata?: FinalStepMetadataFlowResult | null
  deaiStageDiagnosis?: DeaiStageDiagnosis | null
  deaiSkillReport?: DeaiSkillReportInput | null
  deaiSkillReportExporting?: boolean
  /** Run-start folder fingerprint baseline per step skill id; pin source for runStepSkills. */
  skillFingerprintPins?: Record<string, RealSkillFileFingerprint[]>
  active: boolean
  feedbackHidden?: boolean
}

type PipelineSkillStepState = {
  skillId: string
  index: number
  status: 'running' | 'done' | 'failed' | 'skipped'
  attempts?: number
}

const state = reactive(new Map<string, PipelinePerRunGenerationUiState>())

export const pipelinePerRunGenerationUi = state
