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
      sourceRefs: ["outline:1", "volume:v1", "chapter:c1"]
    })

    expect(pkg).toEqual({
      version: 1,
      projectId: "p1",
      volume: { id: "v1", index: 1, name: "第一卷", outline: "卷纲", summary: "卷纲", suggestedWords: 10000 },
      chapter: { id: "c1", index: 2, title: "雨夜", plot: "发现纸条", summary: "发现纸条", wordCount: 3000 },
      outlineContent: "全书大纲",
      settings: ["角色 - 林舟"],
      boundSettings: "场景 - 旧宅",
      styleContext: "克制",
      pacingContext: "三段递进",
      memoryContext: "已埋下纸条伏笔",
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
      memoryContext: "纸条伏笔"
    })
    const prompt = buildChapterExecutionPrompt(pkg, 3000)
    expect(prompt).toContain("[全书大纲]\n全书大纲")
    expect(prompt).toContain("[当前章节剧情点]\n雨夜 - 发现纸条")
    expect(prompt).toContain("[相关记忆]\n纸条伏笔")
    expect(prompt).toContain("约3000字")
  })
})
