const { chromium } = require("playwright")
const fs = require("fs")
const path = require("path")

const CDP = "http://127.0.0.1:9227"
const reportPath = path.join(process.cwd(), "_audit", "screenshots", "settings_layer_current_verify.json")
const result = { objective: "设定层当前模板递进验证", steps: [], passed: 0, failed: 0 }

function record(name, ok, detail) {
  result.steps.push({ name, ok, detail })
  if (ok) result.passed += 1
  else result.failed += 1
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}: ${JSON.stringify(detail)}`)
}

async function wait(page, ms = 300) {
  await page.waitForTimeout(ms)
}

async function visible(page, selector) {
  return await page.locator(selector).first().isVisible().catch(() => false)
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP)
  const context = browser.contexts()[0]
  const page = context.pages().find((p) => p.url().startsWith("file:"))
  if (!page) throw new Error("没有发现 file:// Electron 页面")

  try {
    await page.waitForSelector("#app", { timeout: 15000 })
    await wait(page, 800)

    if (!(await visible(page, "#pipeline-panel")) && await page.locator("#btn-pipeline").count()) {
      await page.locator("#btn-pipeline").click()
      await wait(page)
    }
    record("流水线面板可见", await visible(page, "#pipeline-panel"), await page.evaluate(() => !!document.querySelector("#pipeline-panel")))

    const stepButtons = page.locator("#pipeline-panel .pl-step")
    if (await stepButtons.count() >= 2) {
      await stepButtons.nth(1).click()
      await wait(page)
    }
    record("设定层可见", await visible(page, "#pl-step-2-content"), await page.evaluate(() => {
      const el = document.querySelector("#pl-step-2-content")
      return el ? getComputedStyle(el).display : null
    }))

    const before = await page.evaluate(() => {
      const project = document.querySelector("#pl-step-2-content")
      const rect = (el) => el ? (() => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height } })() : null
      return {
        hasOutline: !!window.__pinia?.state?.value?.project?.outlineText,
        workspace: rect(document.querySelector("#pl-settings-workspace")),
        categories: Array.from(document.querySelectorAll("#pl-sc-categories .pl-sc-cat-item")).map((el) => el.textContent.trim()),
        editorVisible: !!project?.querySelector(".pl-sc-editor") && getComputedStyle(project.querySelector(".pl-sc-editor")).display !== "none",
        obsoleteLayout: !!document.querySelector(".pl-sc-layout, .pl-sc-items-area")
      }
    })
    record("新布局 DOM 唯一且无旧布局残留", !before.obsoleteLayout && !!before.workspace, before)
    record("无大纲时只显示基础分类入口或有大纲后显示分类", before.categories.length >= 1 && before.categories[0] === "设定类", before.categories)

    const addCategory = page.locator("#btn-pl-add-cat")
    record("新增分类按钮可见", await addCategory.isVisible().catch(() => false), null)
    await addCategory.click()
    await wait(page)
    const catInput = page.locator(".pl-sc-add-cat-row input")
    await catInput.fill("临时设定验证类")
    await page.locator(".pl-sc-add-cat-row .btn-primary").click()
    await wait(page)
    record("新增分类后分类导航出现", await page.locator("#pl-sc-categories .pl-sc-cat-item").filter({ hasText: "临时设定验证类" }).count() === 1, null)

    const categoryTab = page.locator("#pl-sc-categories .pl-sc-cat-item").filter({ hasText: "临时设定验证类" }).first()
    await categoryTab.click()
    await wait(page)
    record("分类切换后编辑区展开", await visible(page, ".pl-sc-editor"), await page.locator(".pl-sc-editor-count").textContent().catch(() => ""))

    const addSetting = page.locator(".pl-sc-category-actions button").filter({ hasText: "该类新增" }).first()
    await addSetting.click()
    await wait(page)
    const modal = page.locator(".pl-add-setting-modal")
    record("类内新增弹窗打开", await modal.isVisible().catch(() => false), null)
    await modal.locator("input").first().fill("临时设定验证项")
    await modal.locator("textarea").first().fill("临时属性内容")
    await modal.locator("button").filter({ hasText: "保存" }).first().click()
    await wait(page)
    const tempItem = page.locator(".pl-setting-item").filter({ hasText: "临时设定验证项" }).first()
    record("类内新增条目成功", await tempItem.count() === 1, null)

    const content = tempItem.locator("textarea")
    await content.fill("修改后的属性内容")
    await content.evaluate((el) => el.dispatchEvent(new Event("change", { bubbles: true })))
    await wait(page)
    const nameInput = tempItem.locator("input.pl-input")
    await nameInput.fill("临时设定验证项-已编辑")
    await nameInput.evaluate((el) => el.dispatchEvent(new Event("change", { bubbles: true })))
    await wait(page)
    const bindingBefore = await tempItem.locator("button").first().textContent()
    await tempItem.locator("button").first().click()
    await wait(page)
    record("条目绑定状态切换", (await tempItem.locator("button").first().textContent()).trim() === "已绑定", { before: bindingBefore, after: (await tempItem.locator("button").first().textContent()).trim() })

    const confirmCategory = page.locator(".pl-sc-category-actions button").filter({ hasText: /确认该类|已完成/ }).first()
    await confirmCategory.click()
    await wait(page)
    record("分类确认点亮", await categoryTab.locator(".pl-sc-cat-check").count() === 1, await categoryTab.textContent())

    await page.locator("#btn-pl-save-settings").click()
    await wait(page)
    const storage = await page.evaluate(() => {
      const id = window.electronAPI.storageRead("wa_lastProjectId")
      const data = id ? window.electronAPI.storageRead("wa_project_" + id) : null
      const item = data?.settingsCollection?.items?.["临时设定验证类"]?.find((x) => x.name === "临时设定验证项-已编辑")
      return { id, item: item ? { name: item.name, content: item.content, isBound: item.isBound, boundTo: item.boundTo } : null }
    })
    record("编辑/绑定/保存写入本地项目", !!storage.item && storage.item.content === "修改后的属性内容" && storage.item.isBound === true, storage)

    await categoryTab.locator(".pl-sc-cat-delete").click()
    await wait(page)
    record("临时分类和条目清理", await page.locator("#pl-sc-categories .pl-sc-cat-item").filter({ hasText: "临时设定验证类" }).count() === 0, null)
    const cleanup = await page.evaluate(() => {
      const id = window.electronAPI.storageRead("wa_lastProjectId")
      const data = id ? window.electronAPI.storageRead("wa_project_" + id) : null
      return !data?.settingsCollection?.items?.["临时设定验证类"]
    })
    record("本地项目无临时残留", cleanup, null)

    await page.screenshot({ path: path.join(process.cwd(), "_audit", "screenshots", "settings_layer_current.png"), fullPage: false })
  } finally {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true })
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2))
    await browser.close()
  }
  console.log(JSON.stringify({ passed: result.passed, failed: result.failed, reportPath }, null, 2))
  process.exit(result.failed ? 1 : 0)
}

main().catch((error) => {
  console.error(error.stack || error)
  process.exit(1)
})
