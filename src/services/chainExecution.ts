export interface ChainPromptInput {
  initialPrompt: string
  previousOutput: string
  memoryPrompt?: string
  isFirst: boolean
}

/** Builds the user message passed to one chain skill. */
export function buildChainSkillPrompt(input: ChainPromptInput): string {
  if (input.isFirst) return input.initialPrompt + (input.memoryPrompt || "")
  return "以下是上一个Skill的输出结果，请根据当前Skill继续处理：\n\n--- 上一步输出 ---\n"
    + input.previousOutput
    + (input.memoryPrompt || "")
}

export function buildChainSkillSequence<T>(skills: T[]): T[] {
  return skills.slice()
}
