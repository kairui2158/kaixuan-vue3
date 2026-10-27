import { describe, expect, it } from "vitest"
import {
  appendMemoryPromptOnce,
  buildChainSkillPrompt,
  buildChainSkillSequence,
  dedupeChainIntermediateOutput,
  detectChainOutputEcho,
  formatMemoryPrompt,
  getChainEchoWarningLevel,
  isBodyContractStep,
  resolveFinalStepRole,
  bodyGeneratorContractSentence,
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

  it("injects upstream metadata as a structured handoff without contaminating prose", () => {
    const prompt = buildChainSkillPrompt({
      initialPrompt: "原始章节执行包",
      previousOutput: "S1完整输出",
      isFirst: false,
      delivery: "inline_block",
      upstreamMetadata: {
        coveredItems: ["第1章", "第2章"],
        status: "success",
        sourceRefs: ["H1-01"],
        extractedMeta: ["【正文交接】\nrunId: r-1", "【来源覆盖】\nH1-01"],
        empty: "",
        nullValue: null
      }
    })

    expect(prompt).toContain("--- 上一步结构化交接 ---")
    expect(prompt).toContain("- coveredItems: count=2,preview=第1章, 第2章")
    expect(prompt).toContain("- status: success")
    expect(prompt).toContain("- sourceRefs: count=1,preview=H1-01")
    expect(prompt).toMatch(/- extractedMeta: count=2,totalChars=\d+/)
    expect(prompt).not.toContain("【正文交接】")
    expect(prompt).not.toContain("runId: r-1")
    expect(prompt).not.toContain("empty:")
    expect(prompt).not.toContain("nullValue:")

    const withoutMetadata = buildChainSkillPrompt({
      initialPrompt: "原始章节执行包",
      previousOutput: "S1完整输出",
      isFirst: false,
      delivery: "inline_block"
    })
    expect(withoutMetadata).not.toContain("--- 上一步结构化交接 ---")
  })

  it("passes the controlled final-step ledger only in final_step_ledger mode", () => {
    const metadata = {
      status: "success",
      extractedMeta: [
        "【正文交接】\nrunId: r-1\nFACT_LOCK:人物状态=受伤",
        "【来源覆盖】\nH1-01,H1-02"
      ]
    }
    const summaryPrompt = buildChainSkillPrompt({
      initialPrompt: "原始章节执行包",
      previousOutput: "S2完整输出",
      isFirst: false,
      delivery: "inline_block",
      upstreamMetadata: metadata
    })
    const finalPrompt = buildChainSkillPrompt({
      initialPrompt: "原始章节执行包",
      previousOutput: "S2完整输出",
      isFirst: false,
      delivery: "inline_block",
      upstreamMetadata: metadata,
      metadataMode: "final_step_ledger"
    })

    expect(summaryPrompt).toContain("--- 上一步结构化交接 ---")
    expect(summaryPrompt).toMatch(/- extractedMeta: count=2,totalChars=\d+/)
    expect(summaryPrompt).not.toContain("FACT_LOCK:人物状态=受伤")

    expect(finalPrompt).toContain("--- 上一步结构化交接（终步账本） ---")
    expect(finalPrompt).toContain("FACT_LOCK:人物状态=受伤")
    expect(finalPrompt).toContain("H1-01,H1-02")
    expect(finalPrompt).not.toContain("【正文交接】")
    expect(finalPrompt).not.toContain("--- 上一步结构化交接 ---\n- status")
  })

  it("bounds the final-step ledger and records deterministic truncation", () => {
    const metadata = {
      extractedMeta: [
        "长账本A：" + "事实".repeat(2500),
        "长账本B：" + "事实".repeat(2500),
        "长账本C：" + "事实".repeat(2500)
      ]
    }
    const finalPrompt = buildChainSkillPrompt({
      initialPrompt: "原始章节执行包",
      previousOutput: "S2完整输出",
      isFirst: false,
      delivery: "inline_block",
      upstreamMetadata: metadata,
      metadataMode: "final_step_ledger"
    })

    expect(finalPrompt).toContain("truncated=true")
    expect(finalPrompt).toMatch(/- extractedMeta\[\d+\]:/)
    expect(finalPrompt.length).toBeLessThan(16000)
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

  it("does not repair a polishing final step for high lexical overlap", () => {
    expect(shouldRepairChainEcho(2, 3, 0.93, { finalStepRole: "polish" })).toBe(false)
    expect(shouldRepairChainEcho(2, 3, 0.99, { finalStepRole: "polish", identicalOutput: false })).toBe(false)
    expect(shouldRepairChainEcho(2, 3, 0.93, { finalStepRole: "generator" })).toBe(true)
  })

  it("keeps final-step polish echo at info while intermediate steps stay warnings", () => {
    expect(getChainEchoWarningLevel(0, 3, { finalStepRole: "polish" })).toBe("warning")
    expect(getChainEchoWarningLevel(1, 3, { finalStepRole: "polish" })).toBe("warning")
    expect(getChainEchoWarningLevel(2, 3, { finalStepRole: "polish" })).toBe("info")
    expect(getChainEchoWarningLevel(2, 3, { finalStepRole: "generator" })).toBe("warning")
    expect(getChainEchoWarningLevel(0, 1, { finalStepRole: "polish" })).toBeNull()
    expect(getChainEchoWarningLevel(2, 3)).toBe("info")
  })

  it("applies the body contract to the generation step only", () => {
    expect(isBodyContractStep({ step: 4, stepIndex: 0, totalSteps: 3 })).toBe(false)
    expect(isBodyContractStep({ step: 4, stepIndex: 1, totalSteps: 3 })).toBe(true)
    expect(isBodyContractStep({ step: 4, stepIndex: 2, totalSteps: 3 })).toBe(false)
    expect(isBodyContractStep({ step: 4, stepIndex: 0, totalSteps: 2 })).toBe(true)
    expect(isBodyContractStep({ step: 2, stepIndex: 1, totalSteps: 3 })).toBe(false)
    expect(isBodyContractStep({
      step: 4,
      stepIndex: 2,
      totalSteps: 4,
      declaredRole: 'generator'
    })).toBe(true)
    expect(isBodyContractStep({
      step: 4,
      stepIndex: 2,
      totalSteps: 4,
      declaredRole: 'polish'
    })).toBe(false)
    expect(isBodyContractStep({
      step: 4,
      stepIndex: 0,
      totalSteps: 2,
      declaredRole: 'analysis'
    })).toBe(false)
  })

  it("renders one deterministic body contract sentence without a body-only directive", () => {
    const sentence = bodyGeneratorContractSentence(3500)
    expect(sentence).toBe("请生成本章节正文，目标约3500字（不低于2800字，不超过7000字）。正文本体后必须追加【正文交接】区块。")
    expect(sentence).not.toContain("不低于2100字")
    expect(sentence).not.toContain("只输出正文本身")
    expect(bodyGeneratorContractSentence(null)).toBe("")
    expect(bodyGeneratorContractSentence(undefined)).toBe("")
    expect(bodyGeneratorContractSentence(0)).toBe("")
  })

  it("infers an undeclared terminal polish step when the generator step is unique", () => {
    expect(resolveFinalStepRole({
      step: 4,
      stepIndex: 2,
      totalSteps: 3,
      declaredRole: null,
      generatorStepIndexes: [1]
    })).toEqual({
      role: 'polish',
      mode: 'final_step_ledger',
      reason: 'inferred',
      generatorStepIndex: 1
    })
  })

  it("respects explicit terminal roles and stays unresolved without a unique generator", () => {
    expect(resolveFinalStepRole({
      step: 4,
      stepIndex: 2,
      totalSteps: 3,
      declaredRole: 'polish',
      generatorStepIndexes: [1]
    })).toMatchObject({ role: 'polish', reason: 'declared' })
    expect(resolveFinalStepRole({
      step: 4,
      stepIndex: 2,
      totalSteps: 3,
      declaredRole: 'generator',
      generatorStepIndexes: [2]
    })).toMatchObject({ role: 'generator', mode: 'summary' })
    expect(resolveFinalStepRole({
      step: 4,
      stepIndex: 2,
      totalSteps: 3,
      declaredRole: null,
      generatorStepIndexes: []
    })).toMatchObject({ role: null, mode: 'summary', reason: 'unresolved' })
    expect(resolveFinalStepRole({
      step: 4,
      stepIndex: 2,
      totalSteps: 3,
      declaredRole: null,
      generatorStepIndexes: [2]
    })).toMatchObject({ role: null, reason: 'unresolved' })
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
    expect(declared.slimmed).toBe(true)
    expect(declared.reason).toBe("declared_full_context_slimmed")
    expect(declared.prompt).toContain("- 第一卷 起点")
    expect(declared.prompt).not.toContain("细节".repeat(20))

    const fullOutlinePrompt = prompt.replace("[大纲]", "[全书大纲]")
    const fullOutlineResult = slimChainUpstreamPrompt({
      prompt: fullOutlinePrompt,
      isPrimaryConsumer: false,
      requiresFullUpstream: true
    })
    expect(fullOutlineResult.slimmed).toBe(true)
    expect(fullOutlineResult.prompt).toContain("[全书大纲]")
    expect(fullOutlineResult.prompt).not.toContain("细节".repeat(20))
  })

  it("does not expand a prompt when the outline scaffold is larger", () => {
    const prompt = [
      "任务：规划章节",
      "[大纲]",
      "第一卷 起点",
      "主角查访旧案。",
      "",
      "[设定]",
      "主角 - 冷静、执拗"
    ].join("\n")

    const result = slimChainUpstreamPrompt({
      prompt,
      isPrimaryConsumer: false,
      requiresFullUpstream: true
    })

    expect(result.slimmed).toBe(false)
    expect(result.reason).toBe("scaffold_not_smaller")
    expect(result.prompt).toBe(prompt)
    expect(result.scaffoldCandidateLength).toBeGreaterThan(prompt.length)
    expect(result.prompt.length).toBe(result.originalLength)
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

  it("keeps volume assets and later chain context while slimming only the full outline", () => {
    const prompt = [
      "任务：规划章节",
      "[全书大纲]",
      "第一卷 起点",
      "主角查访旧案，发现关键证人。" + "细节".repeat(100),
      "",
      "[卷纲]",
      "第一卷 第一阶段",
      "证人出现在渡口，主角必须先取回旧案卷宗。",
      "",
      "[风格与节奏]",
      "快节奏、强悬念、少解释。",
      "",
      "[本卷总章数]",
      "12",
      "",
      "[单章字数]",
      "3500",
      "",
      "[已生成章节标题清单]",
      "第1章《旧案回声》"
    ].join("\n")

    const result = slimChainUpstreamPrompt({
      prompt,
      isPrimaryConsumer: false,
      requiresFullUpstream: true
    })

    expect(result.slimmed).toBe(true)
    expect(result.reason).toBe("declared_full_context_slimmed")
    expect(result.prompt).toContain("[全书大纲]")
    expect(result.prompt).not.toContain("细节".repeat(20))
    expect(result.prompt).toContain("证人出现在渡口")
    expect(result.prompt).toContain("快节奏、强悬念、少解释。")
    expect(result.prompt).toContain("12")
    expect(result.prompt).toContain("3500")
    expect(result.prompt).toContain("第1章《旧案回声》")
  })
})
