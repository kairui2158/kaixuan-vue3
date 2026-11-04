import { getAiService } from './aiService'
import { createApiCallBudget } from './apiCallBudget'
import { formatSkillFallback, routeSkill } from './skillRouter'
import type { RealSkillAgentContext } from './realSkillTypes'

export interface FolderSkillTestInput {
  skillId: string
  folderPath: string
  input: string
  agent?: RealSkillAgentContext | null
  aiService?: {
    callAi: (params: any) => Promise<{ text: string; finishReason?: string; providerId?: string }>
  }
  totalBudget?: number
}

export interface FolderSkillTestResult {
  status: 'success' | 'degraded' | 'blocked' | 'failed' | 'load-failed'
  output: string
  errors: string[]
  diagnostics: Array<{ type: 'info' | 'warning' | 'error'; code: string; message: string; at: string }>
  budget: { used: number; limit: number }
  folderPackageCache: boolean
  requestMessages: Array<{ role: string; content: string }>
}

function toLoadFailedResult(
  folderPath: string,
  reason: string,
  budget: { used: number; limit: number }
): FolderSkillTestResult {
  return {
    status: 'load-failed',
    output: '',
    errors: [`文件夹技能加载失败：${reason || '未知错误'}`],
    diagnostics: [{
      type: 'error',
      code: 'skill-load-failed',
      message: `folderPath=${folderPath}`,
      at: new Date().toISOString()
    }],
    budget,
    folderPackageCache: false,
    requestMessages: []
  }
}

function fromRouteFailure(
  error: unknown,
  budget: { used: number; limit: number }
): FolderSkillTestResult {
  const folderResult = (error as { folderResult?: FolderSkillTestResult & { apiMeta?: { requestMessages?: Array<{ role: string; content: string }> } } })?.folderResult
  if (folderResult) {
    return {
      status: folderResult.status,
      output: folderResult.output,
      errors: folderResult.errors,
      diagnostics: folderResult.diagnostics,
      budget: folderResult.budget || budget,
      folderPackageCache: folderResult.folderPackageCache === true,
      requestMessages: folderResult.apiMeta?.requestMessages || []
    }
  }
  const message = error instanceof Error ? error.message : '文件夹技能测试失败'
  return {
    status: 'failed',
    output: '',
    errors: [message],
    diagnostics: [{
      type: 'error',
      code: 'folder-test-failed',
      message,
      at: new Date().toISOString()
    }],
    budget,
    folderPackageCache: false,
    requestMessages: []
  }
}

export async function runFolderSkillTest(input: FolderSkillTestInput): Promise<FolderSkillTestResult> {
  const budget = createApiCallBudget(input.totalBudget ?? 3)
  try {
    const aiService = input.aiService || await getAiService()
    const route = await routeSkill(
      { id: input.skillId, format: 'folder', folderPath: input.folderPath },
      {
        input: input.input,
        agent: input.agent,
        purpose: 'rewrite',
        budget,
        skillId: input.skillId,
        aiService,
        stream: false,
        templateVariables: {
          novelTitle: '技能测试',
          chapterTitle: '技能测试章节',
          chapterSummary: input.input.slice(0, 200),
          wordsPerChapter: 3500,
          styleTags: '',
          pacingParams: ''
        }
      }
    )

    if (route.mode !== 'folder' || !route.folderResult) {
      return toLoadFailedResult(
        input.folderPath,
        formatSkillFallback(route.fallback) || route.fallbackReason || 'skill-load-failed',
        budget.snapshot()
      )
    }

    const folderResult = route.folderResult
    return {
      status: folderResult.status,
      output: folderResult.output,
      errors: folderResult.errors,
      diagnostics: folderResult.diagnostics,
      budget: budget.snapshot(),
      folderPackageCache: folderResult.folderPackageCache === true,
      requestMessages: folderResult.apiMeta?.requestMessages || []
    }
  } catch (error) {
    return fromRouteFailure(error, budget.snapshot())
  }
}
