import { describe, expect, it } from "vitest"
import {
  appendMemoryPromptOnce,
  buildChainSkillPrompt,
  buildChainSkillSequence,
  formatMemoryPrompt
} from "./chainExecution"

describe("body chain execution contract", () => {
  it("keeps the selected skill order", () => {
    const skills = [{ id: "kaixuan-s1" }, { id: "kaixuan-s2" }, { id: "kaixuan-s3" }]
    expect(buildChainSkillSequence(skills).map((skill) => skill.id)).toEqual([
      "kaixuan-s1", "kaixuan-s2", "kaixuan-s3"
    ])
  })

  it("uses the original prompt for S1 and the complete prior output thereafter", () => {
    const first = buildChainSkillPrompt({
      initialPrompt: "原始章节执行包",
      previousOutput: "",
      isFirst: true
    })
    const second = buildChainSkillPrompt({
      initialPrompt: "原始章节执行包",
      previousOutput: "S1完整输出\n【来源覆盖】1,2,3",
      memoryPrompt: "\n记忆上下文",
      isFirst: false
    })
    expect(first).toBe("原始章节执行包")
    expect(second).toContain("S1完整输出\n【来源覆盖】1,2,3")
    expect(second).toContain("记忆上下文")
  })

  it("formats one memory block and never duplicates an existing one", () => {
    const memory = formatMemoryPrompt("纸条伏笔")
    expect(memory).toBe("\n\n[相关记忆]\n纸条伏笔")

    const withoutMemory = appendMemoryPromptOnce("设定生成 prompt", "项目记忆")
    expect(withoutMemory).toBe("设定生成 prompt\n\n[相关记忆]\n项目记忆")

    const withMemory = appendMemoryPromptOnce(
      "章节执行包\n\n[相关记忆]\n上一章摘要：纸条伏笔",
      "再次检索的项目记忆"
    )
    expect(withMemory).toBe("章节执行包\n\n[相关记忆]\n上一章摘要：纸条伏笔")
    expect((withMemory.match(/\[相关记忆\]/g) || []).length).toBe(1)
  })

  it("does not append memory again when the first chain prompt already contains it", () => {
    const first = buildChainSkillPrompt({
      initialPrompt: "章节执行包\n\n[相关记忆]\n上一章摘要：纸条伏笔",
      previousOutput: "",
      memoryPrompt: "\n\n[相关记忆]\n项目记忆",
      isFirst: true
    })
    expect(first).toBe("章节执行包\n\n[相关记忆]\n上一章摘要：纸条伏笔")
    expect((first.match(/\[相关记忆\]/g) || []).length).toBe(1)
  })
})
