import { describe, expect, it } from "vitest"
import {
  appendMemoryPromptOnce,
  buildChainSkillPrompt,
  buildChainSkillSequence,
  dedupeChainIntermediateOutput,
  detectChainOutputEcho,
  formatMemoryPrompt,
  shouldRepairChainEcho,
  slimChainUpstreamPrompt,
  templateReferencesPreviousOutput
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
      isFirst: false,
      templateOwnsPreviousOutput: true
    })
    expect(first).toBe("原始章节执行包")
    expect(second).toContain("原始章节执行包")
    expect(second).toContain("当前 SKILL 模板已引用上一步输出")
    expect(second).toContain("只输出当前步骤的定稿产物")
    expect(second).not.toContain("S1完整输出")
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

  it("delivers the previous output once for pipeline text and folder skills", () => {
    const previousOutput = "S1完整输出锚点".repeat(80)
    const textSkillPrompt = buildChainSkillPrompt({
      initialPrompt: "原始卷纲执行包",
      previousOutput,
      isFirst: false,
      delivery: "inline_block"
    })
    expect(textSkillPrompt).toContain("--- 上一步 SKILL 完整输出 ---")
    expect(textSkillPrompt.split(previousOutput).length - 1).toBe(1)

    const folderSkillPrompt = buildChainSkillPrompt({
      initialPrompt: "原始卷纲执行包",
      previousOutput,
      isFirst: false,
      delivery: "template_variable"
    })
    expect(folderSkillPrompt).not.toContain(previousOutput)

    expect(templateReferencesPreviousOutput("{{prevResponse}}")).toBe(true)
    expect(templateReferencesPreviousOutput("{{previousOutput}}")).toBe(true)
    expect(templateReferencesPreviousOutput("{{previousSkillOutput}}")).toBe(true)
    expect(templateReferencesPreviousOutput("普通模板")).toBe(false)
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

  it("deduplicates echoed memory and previous-output blocks from intermediate output", () => {
    const output = [
      "S1 核心分析结果：主角需要三项行动。",
      "[相关记忆]\n上一章摘要：纸条伏笔",
      "--- 上一步 SKILL 完整输出 ---\n旧输出回显",
      "[相关记忆]\n重复记忆块"
    ].join("\n\n")
    const deduped = dedupeChainIntermediateOutput(output)
    expect(deduped).toBe("S1 核心分析结果：主角需要三项行动。")
    expect((deduped.match(/\[相关记忆\]/g) || []).length).toBe(0)
    expect(deduped).not.toContain("旧输出回显")
  })

  it("keeps only one canonical memory block when a folder skill echoes it back", () => {
    const previousOutput = [
      "S1 提取的结构化事实：旧案现场缺少证人。",
      "[相关记忆]\n上一章摘要：纸条伏笔"
    ].join("\n\n")
    const nextPrompt = buildChainSkillPrompt({
      initialPrompt: "原始卷纲执行包\n\n[相关记忆]\n上一章摘要：纸条伏笔",
      previousOutput,
      isFirst: false,
      delivery: "inline_block"
    })
    expect((nextPrompt.match(/\[相关记忆\]/g) || []).length).toBe(1)
    expect((nextPrompt.match(/--- 上一步 SKILL 完整输出 ---/g) || []).length).toBe(1)
  })

  it("does not append memory again when a non-first chain prompt already contains it", () => {
    const nextPrompt = buildChainSkillPrompt({
      initialPrompt: "原始卷纲执行包\n\n[相关记忆]\n上一章摘要：纸条伏笔",
      previousOutput: "S1 输出",
      memoryPrompt: "\n\n[相关记忆]\n项目记忆",
      isFirst: false,
      delivery: "inline_block"
    })
    expect((nextPrompt.match(/\[相关记忆\]/g) || []).length).toBe(1)
    expect(nextPrompt).toContain("上一章摘要：纸条伏笔")
    expect(nextPrompt).not.toContain("项目记忆")
  })

  it("detects chain output echo without blocking generation", () => {
    const previous = "上一步输出核心事实：" + "主角查访旧案并遭遇证人 ".repeat(30)
    const diagnostic = detectChainOutputEcho(previous, previous + " 少量新增内容")
    expect(diagnostic?.code).toBe("chain-output-echo")
    expect(diagnostic?.echoRatio).toBeGreaterThan(0.25)
    expect(detectChainOutputEcho(previous, "全新内容：" + "配角开始独立行动 ".repeat(30))).toBeNull()
  })

  it("repairs high echo only once and only on the final chain step", () => {
    expect(shouldRepairChainEcho(2, 3, 0.93)).toBe(true)
    expect(shouldRepairChainEcho(1, 3, 0.93)).toBe(false)
    expect(shouldRepairChainEcho(0, 1, 0.93)).toBe(false)
    expect(shouldRepairChainEcho(2, 3, 0.84)).toBe(false)
  })

  it("keeps S1 full upstream context and slims later steps deterministically", () => {
    const prompt = [
      "任务：生成卷纲",
      "[大纲]",
      "第一卷 起点",
      "主角查访旧案，发现关键证人。" + "细节".repeat(100),
      "",
      "[设定]",
      "主角 - 冷静、执拗",
      "",
      "[卷数]",
      "9"
    ].join("\n")

    const first = slimChainUpstreamPrompt({ prompt, isPrimaryConsumer: true })
    expect(first.slimmed).toBe(false)
    expect(first.prompt).toBe(prompt)

    const later = slimChainUpstreamPrompt({ prompt, isPrimaryConsumer: false })
    expect(later.slimmed).toBe(true)
    expect(later.outlineLength).toBeGreaterThan(200)
    expect(later.prompt).toContain("- 第一卷 起点")
    expect(later.prompt).toContain("[设定]")
    expect(later.prompt).toContain("主角 - 冷静、执拗")
    expect(later.prompt).not.toContain("细节".repeat(20))
    expect(later.prompt.length).toBeLessThan(prompt.length)

    const declared = slimChainUpstreamPrompt({
      prompt,
      isPrimaryConsumer: false,
      requiresFullUpstream: true
    })
    expect(declared.slimmed).toBe(false)
    expect(declared.prompt).toBe(prompt)
  })

  it("leaves prompts without a bounded outline block untouched", () => {
    const prompt = "普通章节执行包\n\n[设定]\n主角 - 冷静"
    const result = slimChainUpstreamPrompt({ prompt, isPrimaryConsumer: false })
    expect(result).toEqual({
      prompt,
      slimmed: false,
      originalLength: prompt.length,
      outlineLength: 0,
      reason: "outline_block_absent"
    })
  })
})
