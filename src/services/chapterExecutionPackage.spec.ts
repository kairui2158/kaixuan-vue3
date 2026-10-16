import { describe, expect, it } from "vitest"
import { buildChapterExecutionPrompt, createChapterExecutionPackage } from "./chapterExecutionPackage"

describe("chapter execution package", () => {
  it("keeps the complete Xuanwu chapter inputs in stable fields", () => {
    const pkg = createChapterExecutionPackage({
      projectId: "p1",
      volume: { id: "v1", name: "第一卷", outline: "卷纲", suggestedWords: 10000 },
      volumeIndex: 1,
      chapter: { id: "c1", title: "雨夜", plot: "发现纸条", summary: "发现纸条", wordCount: 3000 },
      chapterIndex: 2,
      outlineContent: "全书大纲",
      settings: ["角色 - 林舟"],
      boundSettings: "场景 - 旧宅",
      styleContext: "克制",
      pacingContext: "三段递进",
      memoryContext: "已埋下纸条伏笔",
      prevChapterSummary: "",
      sourceRefs: ["outline:1", "volume:v1", "chapter:c1"]
    })

    expect(pkg).toEqual({
      version: 2,
      projectId: "p1",
      volume: { id: "v1", index: 1, name: "第一卷", outline: "卷纲", summary: "卷纲", suggestedWords: 10000 },
      chapter: { id: "c1", index: 2, title: "雨夜", plot: "发现纸条", summary: "发现纸条", wordCount: 3000 },
      outlineContent: "全书大纲",
      settings: ["角色 - 林舟"],
      boundSettings: "场景 - 旧宅",
      styleContext: "克制",
      pacingContext: "三段递进",
      memoryContext: "已埋下纸条伏笔",
      prevChapterSummary: "",
      sourceRefs: ["outline:1", "volume:v1", "chapter:c1"]
    })
    expect(JSON.parse(JSON.stringify(pkg))).toEqual(pkg)
  })

  it("uses empty values for missing optional inputs and never includes body text", () => {
    const pkg = createChapterExecutionPackage({ volume: { name: "卷" }, chapter: { title: "章", body: "不应进入" } })
    expect(pkg.outlineContent).toBe("")
    expect(pkg.settings).toEqual([])
    expect(pkg.chapter.plot).toBe("")
    expect(JSON.stringify(pkg)).not.toContain("不应进入")
  })

  it("prefers the AI-allocated volume budget over the legacy suggestion", () => {
    const pkg = createChapterExecutionPackage({
      volume: { id: "v1", name: "第一卷", outline: "卷纲", allocatedWords: 700000, suggestedWords: 100000 }
    })
    expect(pkg.volume.suggestedWords).toBe(700000)
  })

  it("renders the package as the single body-generation prompt", () => {
    const pkg = createChapterExecutionPackage({
      volume: { name: "第一卷", outline: "卷纲" },
      chapter: { title: "雨夜", plot: "发现纸条" },
      outlineContent: "全书大纲",
      settings: ["角色 - 林舟"],
      boundSettings: "旧宅",
      styleContext: "克制",
      memoryContext: "纸条伏笔",
      contextScope: {
        unitId: "D1-03",
        closure: "卷级常任 + 当前单元闭包",
        permanentCount: 1,
        unitCount: 1,
        undeclaredCount: 0,
        closureBytes: 32,
        targetBytes: 12000,
        maxBytes: 24000,
        trimmed: [],
        warnings: [],
        degradedReason: null
      }
    })
    const prompt = buildChapterExecutionPrompt(pkg, 3000)
    expect(prompt).toContain("[单元闭包卷纲]\n卷级常任 + 当前单元闭包")
    expect(prompt).toContain("[当前章节剧情点]\n雨夜 - 发现纸条")
    expect(prompt).toContain("[相关记忆]\n纸条伏笔")
    expect(prompt).toContain("约3000字")
  })

  it("does not duplicate the body word contract for non-generation chain steps", () => {
    const base = {
      volume: { name: "第一卷", outline: "卷纲" },
      chapter: { title: "雨夜", plot: "发现纸条" },
      contextScope: {
        unitId: "D1-03",
        closure: "卷级常任 + 当前单元闭包",
        permanentCount: 1,
        unitCount: 1,
        undeclaredCount: 0,
        closureBytes: 32,
        targetBytes: 12000,
        maxBytes: 24000,
        trimmed: [],
        warnings: [],
        degradedReason: null
      }
    }
    const prompt = buildChapterExecutionPrompt(createChapterExecutionPackage(base), 3000)
    expect(prompt.match(/约3000字/g)).toHaveLength(1)
  })

  it("renders forbidden final cards as a no-early-release block", () => {
    const pkg = createChapterExecutionPackage({
      volume: { name: "第一卷", outline: "卷纲" },
      chapter: { title: "雨夜", plot: "发现纸条" },
      contextScope: {
        unitId: "D1-03",
        closure: "卷级常任 + 当前单元闭包",
        contractForbiddenFinalCards: ["全书头号宿敌", "母亲身世"],
        permanentCount: 1,
        unitCount: 1,
        undeclaredCount: 0,
        closureBytes: 32,
        targetBytes: 12000,
        maxBytes: 24000,
        trimmed: [],
        warnings: [],
        degradedReason: null
      }
    })

    const prompt = buildChapterExecutionPrompt(pkg, 3000)
    expect(prompt).toContain("[禁止提前释放]")
    expect(prompt).toContain("全书头号宿敌、母亲身世")
    expect(prompt).toContain("不得提前揭示")
  })

  it("renders the unit closure instead of the full outline in v2 packages", () => {
    const pkg = createChapterExecutionPackage({
      volume: { name: "第一卷", outline: "卷纲" },
      chapter: { title: "雨夜", plot: "发现纸条" },
      outlineContent: "全书大纲",
      contextScope: {
        unitId: "D1-03",
        closure: "卷级常任 + 当前单元闭包",
        permanentCount: 2,
        unitCount: 1,
        undeclaredCount: 0,
        closureBytes: 32,
        targetBytes: 12000,
        maxBytes: 24000,
        trimmed: [],
        warnings: [],
        degradedReason: null
      }
    })
    const prompt = buildChapterExecutionPrompt(pkg, 3000)
    expect(prompt).toContain("[单元闭包卷纲]\n卷级常任 + 当前单元闭包")
    expect(prompt).not.toContain("全书大纲")
  })

  it("refuses to render a v2 prompt when the scoped closure is empty", () => {
    const pkg = createChapterExecutionPackage({
      volume: { name: "第一卷", outline: "卷纲" },
      chapter: { title: "雨夜", plot: "发现纸条" },
      outlineContent: "全书大纲",
      contextScope: {
        unitId: null,
        closure: "",
        permanentCount: 0,
        unitCount: 0,
        undeclaredCount: 0,
        closureBytes: 0,
        targetBytes: 12000,
        maxBytes: 24000,
        trimmed: [],
        warnings: [],
        degradedReason: "unit_not_found:找不到单元 D9-99"
      }
    })
    expect(() => buildChapterExecutionPrompt(pkg, 3000)).toThrow(
      "正文上下文闭包为空，禁止回退全书大纲"
    )
  })

  it("renders the previous chapter summary only when it exists", () => {
    const base = {
      volume: { name: "第一卷", outline: "卷纲" },
      chapter: { title: "雨夜", plot: "发现纸条" },
      outlineContent: "全书大纲",
      contextScope: {
        unitId: "D1-03",
        closure: "卷级常任 + 当前单元闭包",
        permanentCount: 1,
        unitCount: 1,
        undeclaredCount: 0,
        closureBytes: 32,
        targetBytes: 12000,
        maxBytes: 24000,
        trimmed: [],
        warnings: [],
        degradedReason: null
      }
    }
    const withPrev = buildChapterExecutionPrompt(
      createChapterExecutionPackage({ ...base, prevChapterSummary: "主角逃离旧宅" }),
      3000
    )
    expect(withPrev).toContain("[上一章概要]\n主角逃离旧宅")
    expect(withPrev.indexOf("[当前卷概要]")).toBeLessThan(withPrev.indexOf("[上一章概要]"))
    expect(withPrev.indexOf("[上一章概要]")).toBeLessThan(withPrev.indexOf("[当前章节剧情点]"))

    const firstChapter = buildChapterExecutionPrompt(createChapterExecutionPackage(base), 3000)
    expect(firstChapter).not.toContain("[上一章概要]")
  })
})
