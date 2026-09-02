import { getAiService } from './aiService'
import type {
  Foreshadowing,
  MemoryEntity,
  MemoryEvent,
  MemoryRelation,
  WorldEntry
} from '../types/memory'

export interface ExtractionInput {
  chapterId: string
  chapterIndex?: number
  chapterTitle?: string
  content: string
  sourceVersionId?: string
}

export interface ExtractedMemoryData {
  entities: Array<Partial<MemoryEntity>>
  relations: Array<Partial<MemoryRelation>>
  events: Array<Partial<MemoryEvent>>
  world: Array<Partial<WorldEntry>>
  foreshadowing: Array<Partial<Foreshadowing>>
}

export interface ExtractionResult {
  success: boolean
  data: ExtractedMemoryData
  error?: string
  retried: boolean
}

export type MemoryAiCall = (prompt: string, systemPrompt: string) => Promise<string | null>

export async function unifiedMemoryAiCall(prompt: string, systemPrompt: string): Promise<string | null> {
  const service = await getAiService()
  const call = service.callAi({
    purpose: 'generate',
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
    jsonMode: true,
    stream: false,
    retry: false,
    timeoutMs: 300_000,
    meta: { source: 'memory-extraction.unified' }
  })
  try {
    const result = await call
    return result.text || null
  } catch (error: any) {
    if (error?.kind === 'timeout' || error?.message === '请求超时') {
      throw new Error('记忆抽取超时')
    }
    throw error
  }
}

const EMPTY_RESULT: ExtractedMemoryData = {
  entities: [],
  relations: [],
  events: [],
  world: [],
  foreshadowing: []
}

const SYSTEM_PROMPT = '你是小说记忆抽取器。只返回合法 JSON，不要 Markdown、解释或额外文字。'

function hasEvidence(value: unknown, chapterId: string): value is { evidence: Array<{ chapterId: string; snippet: string; verified?: boolean }> } {
  if (!value || typeof value !== 'object') return false
  const evidence = (value as { evidence?: unknown }).evidence
  return Array.isArray(evidence) && evidence.some(item => {
    if (!item || typeof item !== 'object') return false
    const row = item as { chapterId?: unknown; snippet?: unknown }
    return row.chapterId === chapterId
      && typeof row.snippet === 'string' && row.snippet.trim().length > 0
  })
}

export function verifySnippet(snippet: string, content: string): boolean {
  const normalizedSnippet = snippet.trim()
  return Boolean(normalizedSnippet) && content.includes(normalizedSnippet)
}

function parseJson(text: string, chapterId: string, originalContent: string): ExtractedMemoryData | null {
  const trimmed = text.trim()
  const candidates = [trimmed]
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) candidates.push(fence[1].trim())
  const object = trimmed.match(/\{[\s\S]*\}/)
  if (object) candidates.push(object[0])

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<ExtractedMemoryData>
      if (!parsed || typeof parsed !== 'object') continue
      const entities = parsed.entities
      const relations = parsed.relations
      const events = parsed.events
      const world = parsed.world
      const foreshadowing = parsed.foreshadowing
      if (!Array.isArray(entities) || !Array.isArray(relations) || !Array.isArray(events)
        || !Array.isArray(world) || !Array.isArray(foreshadowing)) continue
      const verifyItems = (values: unknown[]) => values.filter(value => hasEvidence(value, chapterId)).map(value => {
        const item = value as { evidence: Array<{ chapterId: string; snippet: string; verified?: boolean }> }
        return { ...item, evidence: item.evidence.map(evidence => ({ ...evidence, verified: verifySnippet(evidence.snippet, originalContent) })) }
      })
      return {
        entities: verifyItems(entities),
        relations: verifyItems(relations),
        events: verifyItems(events),
        world: verifyItems(world),
        foreshadowing: verifyItems(foreshadowing)
      }
    } catch {
      // 交给一次重试处理，避免在服务层猜测或改写模型输出。
    }
  }
  return null
}

function buildPrompt(input: ExtractionInput, repair = false): string {
  const chapterId = input.chapterId.trim()
  const chapterIndex = input.chapterIndex ?? 0
  const repairHint = repair ? '\n上次输出无法解析。请重新输出严格合法的 JSON，不要使用 Markdown 代码围栏。' : ''
  return `请从下面第 ${chapterIndex} 章（chapterId: ${chapterId}）正文中提取可长期复用的小说记忆。${repairHint}

要求：
1. 只保留正文明确出现或明确推断的内容，不要臆造。
2. 每个条目必须有 evidence 数组，数组至少一项；每项包含 chapterId（必须填 ${chapterId}）和正文原文 snippet。
3. 没有内容的类别返回空数组。
4. 返回对象必须包含 entities、relations、events、world、foreshadowing 五个数组。

JSON 结构示例：
{
  "entities": [{"name":"角色名","type":"character","description":"...","evidence":[{"chapterId":"${chapterId}","snippet":"原文片段"}]}],
  "relations": [],
  "events": [],
  "world": [],
  "foreshadowing": []
}

章节标题：${input.chapterTitle || '未命名章节'}
章节正文：
${input.content}`
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('记忆抽取超时')), timeoutMs)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function extractMemory(
  input: ExtractionInput,
  callAi: MemoryAiCall,
  timeoutMs = 300_000
): Promise<ExtractionResult> {
  if (!input.content.trim() || !input.chapterId.trim()) {
    return { success: false, data: EMPTY_RESULT, error: '章节正文或章节标识为空', retried: false }
  }

  let retried = false
  for (let attempt = 0; attempt < 2; attempt++) {
    retried = attempt === 1
    try {
      const raw = await withTimeout(callAi(buildPrompt(input, retried), SYSTEM_PROMPT), timeoutMs)
      const data = raw ? parseJson(raw, input.chapterId.trim(), input.content) : null
      if (data) return { success: true, data, retried }
    } catch (error) {
      if (attempt === 1) {
        return {
          success: false,
          data: EMPTY_RESULT,
          error: error instanceof Error ? error.message : '记忆抽取失败',
          retried
        }
      }
    }
  }

  return { success: false, data: EMPTY_RESULT, error: 'AI 返回内容不是合法记忆 JSON', retried }
}
