export interface ChainPromptInput {
  initialPrompt: string
  previousOutput: string
  memoryPrompt?: string
  isFirst: boolean
}

export const MEMORY_PROMPT_HEADER = "[相关记忆]"

export function formatMemoryPrompt(memoryContext: unknown): string {
  const text = memoryContext == null ? "" : String(memoryContext).trim()
  return text ? "\n\n" + MEMORY_PROMPT_HEADER + "\n" + text : ""
}

/** Appends memory once; callers that already embed it (body step) keep their original block. */
export function appendMemoryPromptOnce(prompt: string, memoryContext: unknown): string {
  if (!prompt || !prompt.includes(MEMORY_PROMPT_HEADER)) {
    return prompt + formatMemoryPrompt(memoryContext)
  }
  return prompt
}

/** Builds the user message passed to one chain skill. */
export function buildChainSkillPrompt(input: ChainPromptInput): string {
  if (input.isFirst) return input.initialPrompt
  return "以下是上一个Skill的输出结果，请根据当前Skill继续处理：\n\n--- 上一步输出 ---\n"
    + input.previousOutput
    + (input.memoryPrompt || "")
}

export function buildChainSkillSequence<T>(skills: T[]): T[] {
  return skills.slice()
}
