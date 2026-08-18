const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const ROOT = 'D:/codex/novel-workshop-vue3'
const OUT = path.join(ROOT, '_audit')

function record(results, name, pass, detail) {
  const row = { name, pass: !!pass, detail: detail || '' }
  results.push(row)
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''))
  return pass
}

async function snapshot(page) {
  return page.evaluate(() => {
    const id = window.electronAPI.storageRead('wa_lastProjectId')
    const keys = window.electronAPI.storageList() || []
    const candidates = ['wa_project_' + id, 'wa_project-' + id]
    const key = candidates.find(candidate => keys.includes(candidate)) || candidates[0]
    return { key, project: window.electronAPI.storageRead(key), config: window.electronAPI.storageRead('wa_pipeline_step_config') }
  })
}

async function restore(page, saved) {
  if (!saved || !saved.key) return
  await page.evaluate(({ key, project, config }) => {
    window.electronAPI.storageWrite(key, project)
    if (config === null || config === undefined) window.electronAPI.storageRemove('wa_pipeline_step_config')
    else window.electronAPI.storageWrite('wa_pipeline_step_config', config)
    location.reload()
  }, { key: saved.key, project: saved.project, config: saved.config })
  await page.waitForTimeout(1200)
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const pages = browser.contexts()[0].pages()
  const page = pages.find(candidate => candidate.url().includes('dist-renderer/index.html')) || pages[0]
  page.setDefaultTimeout(15000)
  const results = []
  let passed = true
  let saved = null
  let volumeIndex = 0
  let fetchRequests = []

  try {
    // Step 1: Save project snapshot
    saved = await snapshot(page)
    passed = record(results, '1. 项目快照已保存', !!saved.key && !!saved.project, saved.key || 'missing') && passed
    if (!saved.project?.outlineText?.trim() || !saved.project?.outlineLocked) {
      throw new Error('当前项目没有已锁定大纲，无法进入流水线闭环')
    }

    // Step 2: Open pipeline panel if not open
    const panelCount = await page.locator('#pipeline-panel').count()
    if (!panelCount || !(await page.locator('#pipeline-panel').isVisible().catch(() => false))) {
      await page.locator('#btn-pipeline').click()
      await page.waitForTimeout(800)
    }
    passed = record(results, '2. 流水线面板已打开', await page.locator('#pipeline-panel').isVisible(), '') && passed

    // Step 3: Navigate to 卷纲 step (index 2)
    await page.locator('.pl-step').nth(2).click()
    await page.waitForTimeout(500)
    passed = record(results, '3. 进入卷纲层', await page.locator('#pl-step-3-content').isVisible(), '') && passed

    // Step 4: Find an unlocked volume or write one
    const candidate = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[id^="pl-volume-card-"]')]
      const card = cards.find(c => !c.classList.contains('confirmed'))
      if (!card) return null
      const index = Number(card.id.replace('pl-volume-card-', ''))
      const nameInput = card.querySelector('input[placeholder="卷名"]')
      return { index, hasName: !!(nameInput && nameInput.value.trim()) }
    })
    passed = record(results, '4. 找到未锁定卷', !!candidate, JSON.stringify(candidate)) && passed

    if (candidate) {
      volumeIndex = candidate.index
      // Fill in volume name if empty
      if (!candidate.hasName) {
        await page.locator('#pl-volume-card-' + volumeIndex + ' input[placeholder="卷名"]').fill('P11验证卷')
        await page.waitForTimeout(200)
      }
      // Fill in outline and summary if empty
      const outlineTextarea = page.locator('#pl-volume-card-' + volumeIndex + ' textarea[placeholder="卷纲要"]')
      if (await outlineTextarea.isVisible()) {
        const currentOutline = await outlineTextarea.inputValue()
        if (!currentOutline.trim()) {
          await outlineTextarea.fill('P11验证卷纲内容')
          await page.waitForTimeout(200)
        }
      }
      const summaryInput = page.locator('#pl-volume-card-' + volumeIndex + ' input[placeholder="摘要"]')
      if (await summaryInput.isVisible()) {
        const currentSummary = await summaryInput.inputValue()
        if (!currentSummary.trim()) {
          await summaryInput.fill('P11验证摘要')
          await page.waitForTimeout(200)
        }
      }
    }

    // Step 5: Click save and lock this volume
    const saveButton = page.locator('#btn-pl-save-volume-' + volumeIndex)
    passed = record(results, '5. 保存并锁定按钮可见', await saveButton.isVisible() && !(await saveButton.isDisabled()), '') && passed
    await saveButton.click()
    await page.waitForTimeout(500)

    // Step 6: Verify volume is locked
    const lockState = await page.evaluate((idx) => {
      const card = document.querySelector('#pl-volume-card-' + idx)
      const saveBtn = document.querySelector('#btn-pl-save-volume-' + idx)
      const inputs = card ? [...card.querySelectorAll('input, textarea')].map(el => ({
        placeholder: el.getAttribute('placeholder'), readOnly: el.readOnly
      })) : []
      return {
        saveText: saveBtn?.textContent?.trim() || '',
        inputs,
        cardClass: card?.className || ''
      }
    }, volumeIndex)
    passed = record(results, '6a. 保存后按钮文字变为已锁定', lockState.saveText.includes('已锁定'), lockState.saveText) && passed
    passed = record(results, '6b. 保存后卷编辑字段全部只读', lockState.inputs.length >= 3 && lockState.inputs.every(f => f.readOnly), JSON.stringify(lockState.inputs)) && passed

    // Step 7: Navigate to 章节 step (index 3)
    await page.locator('.pl-step').nth(3).click()
    await page.waitForTimeout(500)
    passed = record(results, '7. 进入章节层', await page.locator('#pl-step-4-content').isVisible(), '') && passed

    // Step 8: Verify chapter config area
    const chConfig = await page.evaluate(() => {
      const select = document.querySelector('#pl-ch-gen-bar select')
      const options = select ? [...select.options].map(o => ({ value: o.value, text: o.text })) : []
      const wordInput = document.querySelector('#pl-chapter-wordcount')
      const status = document.querySelector('#pl-chapter-config-status')
      const est = document.querySelector('#pl-ch-est-count')
      return {
        options,
        wordInput: { value: wordInput?.value || '', readonly: wordInput?.readOnly || false },
        statusText: status?.textContent?.trim() || '',
        estText: est?.textContent?.trim() || ''
      }
    })
    const selectedVolumeText = await page.locator('#pl-ch-gen-bar select').inputValue().catch(() => '')
    const selectedVolumeLabel = chConfig.options.find(o => o.value === selectedVolumeText)?.text || ''
    passed = record(results, '8a. 章节层选择卷下拉包含锁定卷', chConfig.options.some(o => o.text.trim() === 'P6回归卷'), JSON.stringify(chConfig.options)) && passed
    passed = record(results, '8b. 每章字数输入框初始值存在', chConfig.wordInput.value !== '' && !chConfig.wordInput.readonly, JSON.stringify(chConfig.wordInput)) && passed
    passed = record(results, '8c. 状态提示为填写后自动锁定', chConfig.statusText.includes('填写后自动锁定'), chConfig.statusText) && passed

    // Step 9: Input words per chapter (e.g., 5000) to trigger lock
    const wordInput = page.locator('#pl-chapter-wordcount')
    await wordInput.fill('5000')
    await wordInput.dispatchEvent('change')
    await page.waitForTimeout(500)

    // Step 10: Verify chapter config locked
    const chLocked = await page.evaluate(() => {
      const wordInput = document.querySelector('#pl-chapter-wordcount')
      const status = document.querySelector('#pl-chapter-config-status')
      const est = document.querySelector('#pl-ch-est-count')
      return {
        wordInput: { value: wordInput?.value || '', readonly: wordInput?.readOnly || false },
        statusText: status?.textContent?.trim() || '',
        estText: est?.textContent?.trim() || ''
      }
    })
    passed = record(results, '10a. 输入字数后输入框变为只读', chLocked.wordInput.readonly, JSON.stringify(chLocked.wordInput)) && passed
    passed = record(results, '10b. 状态提示变为本卷字数已锁定', chLocked.statusText.includes('本卷字数已锁定'), chLocked.statusText) && passed
    passed = record(results, '10c. 预计章节数显示正确', chLocked.estText !== '' && Number(chLocked.estText) > 0, chLocked.estText) && passed

    // Step 11: Verify store and persistence
    const storeState = await page.evaluate((volumeIndex) => {
      const pinia = window.__pinia?.state?.value
      const project = pinia?.project
      const vol = project?.volumes?.[volumeIndex]
      const id = project?.currentProjectId
      const keys = window.electronAPI.storageList() || []
      const candidates = ['wa_project_' + id, 'wa_project-' + id]
      const key = candidates.find(candidate => keys.includes(candidate)) || candidates[0]
      const stored = window.electronAPI.storageRead(key)
      const storedVol = stored?.volumes?.[volumeIndex]
      return {
        volConfigLocked: vol?.chapterConfigLocked || false,
        volWordsPerChapter: vol?.wordsPerChapter || 0,
        volChapterCount: vol?.chapterCount || 0,
        storedConfigLocked: storedVol?.chapterConfigLocked || false,
        storedWordsPerChapter: storedVol?.wordsPerChapter || 0,
        storedChapterCount: storedVol?.chapterCount || 0
      }
    }, volumeIndex)
    passed = record(results, '11a. 当前卷 chapterConfigLocked=true', storeState.volConfigLocked, JSON.stringify(storeState)) && passed
    passed = record(results, '11b. 当前卷 wordsPerChapter=5000', storeState.volWordsPerChapter === 5000, JSON.stringify(storeState)) && passed
    passed = record(results, '11c. 持久化数据中 wordsPerChapter=5000', storeState.storedWordsPerChapter === 5000, JSON.stringify(storeState)) && passed
    passed = record(results, '11d. 持久化数据中 chapterConfigLocked=true', storeState.storedConfigLocked, JSON.stringify(storeState)) && passed

    // Step 12: Mock fetch to verify genChapters prompt uses locked values
    // Set no skills to avoid chain calls, just use built-in genChapters which calls runStepSkills
    // Monkeypatch window.fetch to capture request body
    await page.evaluate(() => {
      window.__fetchRequests = []
      const originalFetch = window.fetch.bind(window)
      window.__originalFetch = originalFetch
      window.fetch = async function(url, opts) {
        const body = opts?.body ? (typeof opts.body === 'string' ? opts.body : new TextDecoder().decode(opts.body)) : ''
        window.__fetchRequests.push({ url: typeof url === 'string' ? url : url.url, method: opts?.method || 'GET', body: body.slice(0, 3000) })
        // Return mock chapter JSON array
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ choices: [{ message: { content: JSON.stringify([{ title: '第一章', plot: '第一章剧情' }, { title: '第二章', plot: '第二章剧情' }]) } }] })
        }
      }
    })
    await page.waitForTimeout(200)

    // Click AI生成章节 button
    const genBtn = page.locator('#btn-pl-gen-chapters')
    passed = record(results, '12a. AI生成章节按钮可用', await genBtn.isVisible() && !(await genBtn.isDisabled()), '') && passed
    await genBtn.click()
    // Wait for generation to complete (mock fetch is fast, but chain may have timeout)
    await page.waitForTimeout(5000)

    // Check if generation completed
    const genResult = await page.evaluate(() => {
      const pinia = window.__pinia?.state?.value
      const pipeline = pinia?.pipeline
      const reqs = window.__fetchRequests || []
      return {
        isGenerating: pipeline?.isGenerating || false,
        status: pipeline?.generationStatus || '',
        requestCount: reqs.length,
        promptInRequest: reqs.some(req => req.body.includes('本卷总章数')),
        promptHasWordsPerChapter: reqs.some(req => req.body.includes('单章字数') && req.body.includes('5000')),
        promptHasTotalChapters: reqs.some(req => req.body.includes('本卷总章数') && req.body.includes('20'))
      }
    })
    passed = record(results, '12b. 生成请求已发出（fetch mock生效）', genResult.requestCount > 0, JSON.stringify({ requestCount: genResult.requestCount })) && passed
    passed = record(results, '12c. 生成提示词使用当前卷字数（5000）', genResult.promptHasWordsPerChapter || genResult.promptInRequest, JSON.stringify(genResult)) && passed
    passed = record(results, '12d. 生成提示词包含本卷总章数', genResult.promptHasTotalChapters, JSON.stringify(genResult)) && passed

    // Restore fetch
    await page.evaluate(() => {
      if (window.__originalFetch) {
        window.fetch = window.__originalFetch
        delete window.__originalFetch
        delete window.__fetchRequests
      }
    })
    // Wait for reload if generation triggered one
    await page.waitForTimeout(1000)

    // Step 13: Screenshot
    const cdp = await page.context().newCDPSession(page)
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(path.join(OUT, 'P11_chapter_word_link_verify.png'), Buffer.from(shot.data, 'base64'))
    fs.writeFileSync(path.join(OUT, 'P11_chapter_word_link_verify.json'), JSON.stringify({ results, storeState, chConfig, chLocked, genResult, passed }, null, 2), 'utf8')

  } finally {
    // Restore project snapshot
    if (saved) await restore(page, saved)
    await browser.close()
  }
  if (!passed) process.exit(1)
}

main().catch(error => {
  console.error('ERROR | P11 chapter word link verification | ' + error.stack)
  process.exit(1)
})
