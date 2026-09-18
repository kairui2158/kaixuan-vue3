import { executeRealSkill } from './realSkillExecutor'
import { loadRealSkill } from './realSkillLoader'
import type {
  RealSkillAgentContext,
  RealSkillDiagnostic,
  RealSkillExecuteOptions,
  RealSkillExecutionResult,
  RealSkillPackage
} from './realSkillTypes'

export type CompositeAction = 'continue' | 'retry' | 'skip' | 'stop'
export type CompositeStatus = 'DONE' | 'DONE_WITH_CONCERNS' | 'NEEDS_CONTEXT' | 'BLOCKED'

export interface CompositeStepState {
  stepId: string
  status: 'running' | 'done' | 'failed' | 'skipped' | 'blocked'
  output: string
  attempts: number
  diagnostics: RealSkillDiagnostic[]
}

export interface CompositeExecutionResult {
  status: CompositeStatus
  output: string
  steps: CompositeStepState[]
  diagnostics: RealSkillDiagnostic[]
  errors: string[]
  apiMeta?: RealSkillExecutionResult['apiMeta']
}

export interface CompositeProgressEventDetail {
  skillId: string
  index: number
  total: number
  status: CompositeStepState['status']
  attempts: number
}

export function dispatchCompositeProgressEvent(detail: CompositeProgressEventDetail): void {
  try {
    window.dispatchEvent(new CustomEvent('real-skill:step', { detail }))
  } catch {
    // Progress events are diagnostic only; composite execution must not fail here.
  }
}

export interface CompositeExecuteOptions extends Omit<RealSkillExecuteOptions, 'folderPath' | 'input'> {
  folderPath: string
  input: string
  maxDepth?: number
}

function diagnostic(
  type: RealSkillDiagnostic['type'],
  code: string,
  message: string
): RealSkillDiagnostic {
  return { type, code, message, at: new Date().toISOString() }
}

function joinFolderPath(basePath: string, relativePath: string): string {
  const normalizedBase = basePath.replace(/[\\/]+$/, '')
  const normalizedRelative = relativePath.replace(/\\/g, '/').replace(/^\.?\//, '')
  return `${normalizedBase}/${normalizedRelative}`
}

async function executeParentScript(
  script: string,
  hook: 'plan' | 'afterStep',
  payload: unknown,
  diagnostics: RealSkillDiagnostic[]
): Promise<{ result: Record<string, unknown> | null; failed: boolean }> {
  if (!script.trim()) return { result: null, failed: false }
  try {
    const api = (window as any).electronAPI
    if (!api?.skillExecuteScript) {
      diagnostics.push(diagnostic('warning', 'script-bridge-unavailable', '脚本桥不可用，已使用 meta.children 顺序'))
      return { result: null, failed: false }
    }
    // The bridge executes the script in an isolated VM and returns its exports.
    const response = await api.skillExecuteScript(script, { hook, payload })
    if (!response || response.ok !== true) {
      diagnostics.push(diagnostic('warning', 'script-hook-failed', `${hook} 执行失败：${response?.message || '未知错误'}`))
      return { result: null, failed: false }
    }
    // New bridge protocol returns data; old protocol returned exported functions.
    const hasResult = response.results
      ? hook in response.results
      : Boolean(response.exports && hook in response.exports)
    if (!hasResult) {
      return { result: null, failed: false }
    }
    const result = response.results?.[hook] ?? response.exports?.[hook]
    if (typeof result === 'function' || result === undefined) return { result: null, failed: false }
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      diagnostics.push(diagnostic('warning', 'hook-result-ignored', `${hook} 返回了不可识别类型，已忽略`))
      return { result: null, failed: false }
    }
    return { result, failed: false }
  } catch (error: any) {
    diagnostics.push(diagnostic('warning', 'script-hook-exception', `${hook} 抛出异常：${error?.message || '未知错误'}`))
    return { result: null, failed: false }
  }
}

function normalizeChildPaths(parent: RealSkillPackage, order: string[], diagnostics: RealSkillDiagnostic[]): string[] {
  if (order.length === 0 && Array.isArray(parent.meta.children)) {
    order = (parent.meta.children as unknown[]).map(String)
  }
  return order
    .map(item => item.trim())
    .filter(Boolean)
    .map(relative => {
      const normalized = relative.replace(/\\/g, '/')
      return joinFolderPath(parent.folderPath, normalized)
    })
}

function normalizeAction(value: unknown): CompositeAction | null {
  if (value === 'continue' || value === 'retry' || value === 'skip' || value === 'stop') {
    return value
  }
  return null
}

function isComposite(pkg: RealSkillPackage): boolean {
  return pkg.meta.executionMode === 'composite'
}

export async function executeCompositeSkill(options: CompositeExecuteOptions): Promise<CompositeExecutionResult> {
  const diagnostics: RealSkillDiagnostic[] = []
  const errors: string[] = []
  const steps: CompositeStepState[] = []
  const maxDepth = Math.max(1, Math.min(2, options.maxDepth ?? 2))
  const stack: string[] = []

  async function runComposite(
    currentOptions: CompositeExecuteOptions,
    depth: number
  ): Promise<CompositeExecutionResult> {
    if (depth > maxDepth) {
      const result: CompositeExecutionResult = {
        status: 'BLOCKED',
        output: '',
        steps,
        diagnostics: [diagnostic('error', 'composite-depth-exceeded', `composite 嵌套超过 ${maxDepth} 层`)],
        errors: [`composite 嵌套超过 ${maxDepth} 层`]
      }
      return result
    }

    const loaded = await loadRealSkill(currentOptions.folderPath)
    if (!loaded.package) {
      return {
        status: 'BLOCKED',
        output: '',
        steps,
        diagnostics: [...diagnostics, diagnostic('error', 'skill-load-failed', loaded.error || 'unknown')],
        errors: [`子技能加载失败：${loaded.error || '未知错误'}`]
      }
    }
    const parent = loaded.package
    if (stack.includes(parent.folderPath)) {
      return {
        status: 'BLOCKED',
        output: '',
        steps,
        diagnostics: [...diagnostics, diagnostic('error', 'composite-cycle', `循环依赖：${parent.id}`)],
        errors: [`检测到 composite 循环依赖：${parent.id}`]
      }
    }
    stack.push(parent.folderPath)

    const planResult = await executeParentScript(parent.script, 'plan', currentOptions.input, diagnostics)
    const order = Array.isArray(planResult.result?.order)
      ? (planResult.result!.order as unknown[]).map(String)
      : []
    const mode = planResult.result?.mode === 'parallel' ? 'parallel' : 'sequential'
    if (mode === 'parallel') {
      diagnostics.push(diagnostic('warning', 'parallel-mode-unsupported', '第一版 composite 仅支持 sequential，已按串行执行'))
    }
    const childPaths = normalizeChildPaths(parent, order, diagnostics)
    if (childPaths.length === 0) {
      stack.pop()
      return {
        status: 'NEEDS_CONTEXT',
        output: '',
        steps,
        diagnostics: [...diagnostics, diagnostic('warning', 'composite-children-empty', 'composite 未配置子技能')],
        errors: ['composite 未配置子技能']
      }
    }

    let currentInput = currentOptions.input
    let output = ''
    let lastApiMeta: RealSkillExecutionResult['apiMeta'] | undefined
    for (let index = 0; index < childPaths.length; index += 1) {
      const childPath = childPaths[index]
      const childLoaded = await loadRealSkill(childPath)
      if (!childLoaded.package) {
        stack.pop()
        return {
          status: 'BLOCKED',
          output: '',
          steps,
          diagnostics: [...diagnostics, diagnostic('error', 'child-load-failed', childPath)],
          errors: [`子技能加载失败：${childPath}`]
        }
      }

      const child = childLoaded.package
      if (isComposite(child)) {
        const nested = await runComposite({ ...currentOptions, input: currentInput }, depth + 1)
        if (nested.status === 'BLOCKED' || nested.status === 'NEEDS_CONTEXT') {
          stack.pop()
          return nested
        }
        currentInput = nested.output
        output = nested.output
        steps.push({
          stepId: child.id,
          status: 'done',
          output: nested.output,
          attempts: 1,
          diagnostics: nested.diagnostics
        })
        continue
      }

      const transition = (status: CompositeStepState['status'], reason: string) => {
        if (stepState.status === status) return
        const from = stepState.status
        stepState.status = status
        diagnostics.push({
          type: from === status ? 'info' : 'info',
          code: 'state-transition',
          message: `CompositeStepState：${from} → ${status} / ${reason}`,
          at: new Date().toISOString()
        })
      }

      const stepState: CompositeStepState = {
        stepId: child.id,
        status: 'running',
        output: '',
        attempts: 0,
        diagnostics: []
      }
      steps.push(stepState)
      dispatchCompositeProgressEvent({
        skillId: child.id,
        index: steps.length - 1,
        total: childPaths.length,
        status: stepState.status,
        attempts: stepState.attempts
      })
      let retryCount = 0

      while (true) {
        stepState.attempts += 1
        const result = await executeRealSkill({
          ...currentOptions,
          folderPath: childPath,
          input: currentInput,
          skillId: child.id,
          agent: currentOptions.agent,
          agentSource: currentOptions.agentSource
        })
        stepState.output = result.output
        stepState.diagnostics = result.diagnostics
        dispatchCompositeProgressEvent({
          skillId: child.id,
          index: steps.length - 1,
          total: childPaths.length,
          status: stepState.status,
          attempts: stepState.attempts
        })
        if (result.apiMeta) lastApiMeta = result.apiMeta

        if (result.status === 'blocked') {
          transition('blocked', 'SKILL 返回 blocked')
          stack.pop()
          return {
            status: 'BLOCKED',
            output: '',
            steps,
            diagnostics: [...diagnostics, ...result.diagnostics],
            errors: result.errors,
            apiMeta: lastApiMeta
          }
        }

        if (result.status === 'failed') {
          transition('failed', 'SKILL 执行失败')
          stack.pop()
          return {
            status: 'BLOCKED',
            output: '',
            steps,
            diagnostics: [...diagnostics, ...result.diagnostics],
            errors: result.errors,
            apiMeta: lastApiMeta
          }
        }

        if (result.status === 'degraded') {
          if (!result.output.trim()) {
            transition('failed', '降级输出为空')
            stack.pop()
            return {
              status: 'BLOCKED',
              output: '',
              steps,
              diagnostics: [...diagnostics, ...result.diagnostics],
              errors: result.errors,
              apiMeta: lastApiMeta
            }
          }
          transition('done', '降级输出保留')
          diagnostics.push(diagnostic(
            'warning',
            'step-degraded-with-output',
            `${child.id} 未通过校验但保留了可用输出，链路按降级完成继续`
          ))
          currentInput = result.output
          output = result.output
          break
        }

        const afterResult = await executeParentScript(parent.script, 'afterStep', {
          stepId: child.id,
          output: result.output,
          attempts: stepState.attempts,
          input: currentInput
        }, diagnostics)
        const action = normalizeAction(afterResult.result?.action) || 'continue'
        if (action === 'retry') {
          const maxRetries = Number((afterResult.result as any)?.maxRetries ?? 1)
          if (retryCount >= maxRetries) {
            transition('failed', '重试次数耗尽')
            stack.pop()
            return {
              status: 'BLOCKED',
              output: '',
              steps,
              diagnostics: [...diagnostics, diagnostic('error', 'retry-limit-reached', `${child.id} 重试次数已耗尽`)],
              errors: [`${child.id} 重试次数已耗尽`],
              apiMeta: lastApiMeta
            }
          }
          retryCount += 1
          continue
        }
        if (action === 'skip') {
          transition('skipped', '父技能要求跳过')
          diagnostics.push(diagnostic('warning', 'step-skipped', `${child.id} 被父技能跳过`))
          dispatchCompositeProgressEvent({
            skillId: child.id,
            index: steps.length - 1,
            total: childPaths.length,
            status: stepState.status,
            attempts: stepState.attempts
          })
          break
        }
        if (action === 'stop') {
          transition('failed', '父技能要求停止')
          stack.pop()
          return {
            status: 'BLOCKED',
            output: '',
            steps,
            diagnostics: [...diagnostics, diagnostic('error', 'stopped-by-parent', `${child.id} 被父技能停止`)],
            errors: [`${child.id} 被父技能停止`],
            apiMeta: lastApiMeta
          }
        }
        transition('done', '步骤执行完成')
        dispatchCompositeProgressEvent({
          skillId: child.id,
          index: steps.length - 1,
          total: childPaths.length,
          status: stepState.status,
          attempts: stepState.attempts
        })
        currentInput = result.output
        output = result.output
        break
      }
    }

    stack.pop()
    const hasConcern = diagnostics.some(item => item.type === 'warning' || item.type === 'error')
    return {
      status: hasConcern ? 'DONE_WITH_CONCERNS' : 'DONE',
      output,
      steps,
      diagnostics,
      errors,
      apiMeta: lastApiMeta
    }
  }

  return runComposite(options, 1)
}
