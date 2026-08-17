const { chromium } = require("playwright")
const fs = require("fs")
const path = require("path")

const reportPath = path.join(process.cwd(), "_audit", "screenshots", "settings_layer_semantics_verify.json")
const screenshotPath = path.join(process.cwd(), "_audit", "screenshots", "settings_layer_semantics.png")
const result = { objective: "设定层按钮语义与行为等价递进验证", steps: [], passed: 0, failed: 0 }

function record(name, ok, detail) {
  result.steps.push({ name, ok, detail })
  if (ok) result.passed += 1
  else result.failed += 1
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}: ${JSON.stringify(detail)}`)
}

async function pause(page, ms = 350) { await page.waitForTimeout(ms) }
async function isVisible(page, selector) { return page.locator(selector).first().isVisible().catch(() => false) }

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9227")
  const context = browser.contexts()[0]
  const page = context.pages().find((p) => p.url().startsWith("file:"))
  if (!page) throw new Error("没有发现 file:// Electron 页面")

  let originalProject = null
  let projectKey = null
  try {
    await page.waitForSelector("#app", { timeout: 15000 })
    await pause(page, 800)

    if (!(await isVisible(page, "#pipeline-panel")) && await page.locator("#btn-pipeline").count()) {
      await page.locator("#btn-pipeline").click()
      await pause(page)
    }
    record("流水线面板可见", await isVisible(page, "#pipeline-panel"), null)

    const step = page.locator("#pipeline-panel .pl-step").nth(1)
    if (await step.count()) { await step.click(); await pause(page) }
    record("设定层面板可见", await isVisible(page, "#pl-step-2-content"), await page.locator("#pl-step-2-content").evaluate((el) => getComputedStyle(el).display).catch(() => null))

    const structure = await page.evaluate(() => {
      const id = window.electronAPI.storageRead("wa_lastProjectId")
      const data = id ? window.electronAPI.storageRead("wa_project_" + id) : null
      const cat = [...document.querySelectorAll("#pl-sc-categories .pl-sc-cat-item")].map((el) => el.textContent.trim())
      const buttons = [...document.querySelectorAll("#pl-step-2-content .pl-settings-footer-actions button")].map((el) => ({ id: el.id, text: el.textContent.trim(), disabled: el.disabled }))
      return {
        id,
        data,
        categories: cat,
        buttons,
        oldLinkButton: !!document.querySelector("#btn-pl-link-settings-outline"),
        oldSaveButton: !!document.querySelector("#btn-pl-save-settings"),
        workspace: !!document.querySelector("#pl-settings-workspace"),
        editor: !!document.querySelector("#pl-step-2-content .pl-sc-editor")
      }
    })
    originalProject = structure.data
    projectKey = structure.id ? "wa_project_" + structure.id : null
    record("旧的独立连通/保存入口已删除", !structure.oldLinkButton && !structure.oldSaveButton, structure.buttons)
    record("设定层保留唯一AI生成和确认/保存入口", structure.buttons.some((b) => b.id === "btn-pl-gen-settings") && structure.buttons.some((b) => b.id === "btn-pl-confirm-settings") && structure.buttons.length === 2, structure.buttons)
    const noOldLayout = await page.evaluate(() => !document.querySelector(".pl-sc-layout, .pl-sc-items-area"))
    record("新设定层布局存在且无旧布局", structure.workspace && noOldLayout, { workspace: structure.workspace, editor: structure.editor, noOldLayout })
    record("动态分类基础入口正确", structure.categories.length >= 1 && structure.categories[0] === "设定类", structure.categories)

    const state = structure.data || {}
    const genButton = page.locator("#btn-pl-gen-settings")
    const confirmButton = page.locator("#btn-pl-confirm-settings")
    record("AI生成按钮按大纲锁定状态约束", await genButton.isDisabled() === !state.outlineLocked, { outlineLocked: !!state.outlineLocked, disabled: await genButton.isDisabled() })
    record("确认/保存按钮按设定内容约束", await confirmButton.isDisabled() === !(state.settingsCollection && Object.values(state.settingsCollection.items || {}).some((items) => items.length > 0)), { disabled: await confirmButton.isDisabled() })

    if (state.settingsCollection && Object.keys(state.settingsCollection.items || {}).length > 0) {
      const category = page.locator("#pl-sc-categories .pl-sc-cat-item").filter({ has: page.locator(".pl-sc-cat-label") }).filter({ hasNotText: "设定类" }).first()
      const categoryToOpen = await category.count() ? category : page.locator("#pl-sc-categories .pl-sc-cat-item").first()
      await categoryToOpen.click()
      await pause(page)
      record("分类点击后展开当前分类内容", await isVisible(page, ".pl-sc-editor"), await page.locator(".pl-sc-editor-count").textContent().catch(() => ""))

      const item = page.locator(".pl-setting-item").first()
      if (await item.count()) {
        const bind = item.locator("button").first()
        const before = (await bind.textContent()).trim()
        await bind.click()
        await pause(page)
        const after = (await bind.textContent()).trim()
        record("设定项绑定按钮改变状态", before !== after && ["绑定", "已绑定"].includes(after), { before, after })
      } else {
        record("存在可递进验证的设定项", false, "当前项目没有可编辑设定项")
      }

      const beforeStep = await page.locator("#pipeline-panel .pl-step").evaluateAll((els) => els.map((el) => el.classList.contains("active")))
      await confirmButton.click()
      await pause(page)
      const afterStep = await page.locator("#pipeline-panel .pl-step").evaluateAll((els) => els.map((el) => el.classList.contains("active")))
      record("确认/保存设定层后进入卷纲层", afterStep[2] === true || beforeStep[2] !== afterStep[2], { beforeStep, afterStep })
    } else {
      record("有大纲时存在设定内容可递进验证", false, "当前项目没有设定集合内容")
    }

    await page.screenshot({ path: screenshotPath, fullPage: false })
  } finally {
    if (projectKey && originalProject) {
      await page.evaluate(({ projectKey, originalProject }) => {
        window.electronAPI.storageWrite(projectKey, originalProject)
      }, { projectKey, originalProject }).catch(() => {})
      await page.reload().catch(() => {})
      await pause(page, 1000)
    }
    fs.mkdirSync(path.dirname(reportPath), { recursive: true })
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), "utf8")
    await browser.close()
  }
  console.log(JSON.stringify({ passed: result.passed, failed: result.failed, reportPath }, null, 2))
  process.exit(result.failed ? 1 : 0)
}

main().catch((error) => {
  console.error(error.stack || error)
  process.exit(1)
})
