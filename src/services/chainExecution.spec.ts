import { describe, expect, it } from "vitest"
import { buildChainSkillPrompt, buildChainSkillSequence } from "./chainExecution"

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
})
