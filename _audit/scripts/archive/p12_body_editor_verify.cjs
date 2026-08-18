const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const ROOT = 'D:/codex/novel-workshop-vue3'
const OUT = path.join(ROOT, '_audit')

function record(results, name, pass, detail) {
  const row = { name, pass: !!pass, detail: detail || '' }
  results.push(row)
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''))
  return !!pass
}

async function shot(page, fileName) {
  try {
    const cdp = await page.context().newCDPSession(page)
    const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(path.join(OUT, fileName), Buffer.from(result.data, 'base64'))
  } catch (error) {
    console.warn('WARN | screenshot failed | ' + error.message)
  }
}

async function readSnapshot(page) {
  return page.evaluate(() => {
    const id = window.electronAPI.storageRead('wa_lastProjectId')
    const keys = window.electronAPI.storageList() || []
    const candidates = ['wa_project_' + id, 'wa_project-' + id]
    const key = candidates.find(candidate => keys.includes(candidate)) || candidates[0]
    return {
      lastProjectId: id,
      key,
      project: window.electronAPI.storageRead(key)
    }
  })
}

async function restore(page, snapshot) {
  if (!snapshot?.key) return
  await page.evaluate(({ key, project, lastProjectId }) => {
    if (project === null || project === undefined) window.electronAPI.storageRemove(key)
    else window.electronAPI.storageWrite(key, project)
    if (lastProjectId === null || lastProjectId === undefined) window.electronAPI.storageRemove('wa_lastProjectId')
    else window.electronAPI.storageWrite('wa_lastProjectId', lastProjectId)
    location.reload()
  }, snapshot)
  await page.waitForTimeout(1200)
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts()[0].pages()[0]
  page.setDefaultTimeout(15000)
  const results = []
  let passed = true
  let snapshot = null
  const tempId = 'p12_verify_' + Date.now()
  const chapterId = 'p12-chapter-001'
  const volumeId = 'p12-volume-001'
  const bodyText = 'P12验证正文：夜色压低了城墙，主角在灯火尽头停下脚步。'

  try {
    snapshot = await readSnapshot(page)
    passed = record(results, '1. 原项目快照已保存', !!snapshot.key && !!snapshot.project, snapshot.key || 'missing') && passed

    const tempProject = {
      projectName: 'P12正文回归项目',
      outlineText: '# P12回归卷\n\n## P12回归章\n\n正文生成回归验证',
      outlineLocked: true,
      volumesConfirmed: true,
      chaptersConfirmed: true,
      settingsGenerated: true,
      settings: [],
      settingsCollection: { categories: [], items: {} },
      settingBindings: {},
      memories: { categories: ['情节', '人物', '世界观', '伏笔'], items: [] },
      volumes: [{ id: volumeId, name: 'P12回归卷', outline: '回归卷纲', summary: '回归摘要', confirmed: true, locked: true, suggestedWords: 5000 }],
      chapters: {
        [volumeId]: [{ id: chapterId, title: 'P12回归章', plot: '主角在夜色中作出关键决定。', body: '', bodyGenerated: false }]
      }
    }

    await page.evaluate(({ tempId, tempProject }) => {
      window.electronAPI.storageWrite('wa_project_' + tempId, tempProject)
      window.electronAPI.storageWrite('wa_lastProjectId', tempId)
      location.reload()
    }, { tempId, tempProject })
    await page.waitForTimeout(1200)
    const loaded = await page.evaluate(({ tempId }) => {
      const p = window.__pinia?.state?.value?.project
      return { currentProjectId: p?.currentProjectId, volumeCount: p?.volumes?.length || 0, chapterCount: p?.chapters?.['p12-volume-001']?.length || 0 }
    }, { tempId })
    passed = record(results, '2. 临时项目通过应用启动链路加载', loaded.currentProjectId === tempId && loaded.volumeCount === 1 && loaded.chapterCount === 1, JSON.stringify(loaded)) && passed

    if (!(await page.locator('#pipeline-panel').isVisible().catch(() => false))) {
      await page.locator('#btn-pipeline').click()
      await page.waitForTimeout(600)
    }
    passed = record(results, '3. 生成流水线面板已打开', await page.locator('#pipeline-panel').isVisible(), '') && passed
    await page.locator('.pl-step').nth(4).click()
    await page.waitForTimeout(500)
    passed = record(results, '4. 进入正文层', await page.locator('#pl-step-5-content').isVisible(), '') && passed

    const selectors = await page.evaluate(() => ({
      volume: !!document.querySelector('#pl-context-summary select'),
      chapter: document.querySelectorAll('#pl-context-summary select').length >= 2,
      generate: !!document.querySelector('#btn-pl-gen-body'),
      insert: !!document.querySelector('#btn-pl-insert-body'),
      confirm: !!document.querySelector('#btn-pl-confirm-body')
    }))
    passed = record(results, '5. 正文层卷、章选择和三个操作入口存在', Object.values(selectors).every(Boolean), JSON.stringify(selectors)) && passed

    const selected = await page.evaluate(() => {
      const selects = [...document.querySelectorAll('#pl-context-summary select')]
      if (selects[0]) { selects[0].value = '0'; selects[0].dispatchEvent(new Event('change', { bubbles: true })) }
      if (selects[1]) { selects[1].value = '0'; selects[1].dispatchEvent(new Event('change', { bubbles: true })) }
      return selects.map(select => select.value)
    })
    await page.waitForTimeout(300)
    passed = record(results, '6. 正文层选择器定位到临时卷章', selected[0] === '0' && selected[1] === '0', JSON.stringify(selected)) && passed

    await page.evaluate(() => {
      window.__p12Requests = []
      window.__p12OriginalFetch = window.fetch.bind(window)
      window.fetch = async function(url, options) {
        const body = options?.body ? String(options.body) : ''
        window.__p12Requests.push({ url: String(url), body: body.slice(0, 4000) })
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'P12验证正文：夜色压低了城墙，主角在灯火尽头停下脚步。' } }] }) }
      }
    })
    await page.locator('#btn-pl-gen-body').click()
    await page.waitForTimeout(3500)

    const generation = await page.evaluate(({ bodyText, chapterId, volumeId }) => {
      const p = window.__pinia?.state?.value?.project
      const ch = p?.chapters?.[volumeId]?.find(item => item.id === chapterId)
      const pipeline = window.__pinia?.state?.value?.pipeline
      const editor = window.__pinia?.state?.value?.editor
      const tab = editor?.tabs?.find(item => item.chapterId === chapterId)
      const textarea = document.querySelector('#editor-content')
      return {
        requestCount: (window.__p12Requests || []).length,
        requestHasChapter: (window.__p12Requests || []).some(req => req.body.includes('P12回归章')),
        bodyInStore: ch?.body === bodyText,
        bodyGenerated: ch?.bodyGenerated === true,
        status: pipeline?.generationStatus || '',
        generating: !!pipeline?.isGenerating,
        pipelineClosed: !document.querySelector('#pipeline-panel'),
        editorTabContent: tab?.content || '',
        editorTextarea: textarea?.value || '',
        editorShowsBody: tab?.content === bodyText && textarea?.value === bodyText
      }
    }, { bodyText, chapterId, volumeId })
    passed = record(results, '7. 正文生成真实请求已发出', generation.requestCount > 0 && generation.requestHasChapter, JSON.stringify(generation)) && passed
    passed = record(results, '8. 正文结果写入章节状态并在编辑器显示', generation.bodyInStore && generation.bodyGenerated && generation.editorShowsBody, JSON.stringify(generation)) && passed
    passed = record(results, '9. 正文生成进入稳定终态', generation.status === 'done' && !generation.generating, JSON.stringify(generation)) && passed
    passed = record(results, '10. 生成后自动关闭流水线并打开主页编辑器', generation.pipelineClosed && generation.editorShowsBody, JSON.stringify(generation)) && passed

    await page.locator('#btn-save-editor').click()
    await page.waitForTimeout(500)
    const persisted = await page.evaluate(({ tempId, volumeId, chapterId, bodyText }) => {
      const stored = window.electronAPI.storageRead('wa_project_' + tempId)
      const ch = stored?.chapters?.[volumeId]?.find(item => item.id === chapterId)
      return { body: ch?.body || '', bodyGenerated: !!ch?.bodyGenerated, matches: ch?.body === bodyText }
    }, { tempId, volumeId, chapterId, bodyText })
    passed = record(results, '11. 编辑器保存后正文写入项目持久化', persisted.matches && persisted.bodyGenerated, JSON.stringify(persisted)) && passed

    await page.reload()
    await page.waitForTimeout(1200)
    const treeState = await page.evaluate(() => ({
      projectId: window.__pinia?.state?.value?.project?.currentProjectId,
      chapterText: [...document.querySelectorAll('.chapter-item')].map(el => el.textContent?.trim() || '')
    }))
    passed = record(results, '12. 重载后仍加载同一临时项目章节树', treeState.projectId === tempId && treeState.chapterText.includes('P12回归章'), JSON.stringify(treeState)) && passed
    await page.locator('.volume-item').first().click().catch(() => {})
    const chapterItem = page.locator('.chapter-item').filter({ hasText: 'P12回归章' }).first()
    if (!(await chapterItem.isVisible().catch(() => false))) await page.locator('.volume-item').first().click().catch(() => {})
    await chapterItem.click()
    await page.waitForTimeout(400)
    const reopened = await page.evaluate(({ chapterId, bodyText }) => {
      const tab = window.__pinia?.state?.value?.editor?.tabs?.find(t => t.chapterId === chapterId)
      return { tabExists: !!tab, active: window.__pinia?.state?.value?.editor?.activeTabId === tab?.id, contentMatches: tab?.content === bodyText, textarea: document.querySelector('#editor-content')?.value || '' }
    }, { chapterId, bodyText })
    passed = record(results, '13. 重载后从章节树重新打开正文不丢失', reopened.tabExists && reopened.active && reopened.contentMatches && reopened.textarea === bodyText, JSON.stringify(reopened)) && passed

    await page.evaluate(() => {
      if (window.__p12OriginalFetch) window.fetch = window.__p12OriginalFetch
      delete window.__p12OriginalFetch
      delete window.__p12Requests
    })
    await shot(page, 'P12_body_editor_verify.png')
    fs.writeFileSync(path.join(OUT, 'P12_body_editor_verify.json'), JSON.stringify({ results, generation, persisted, treeState, reopened, passed }, null, 2), 'utf8')
  } finally {
    await page.evaluate(() => {
      if (window.__p12OriginalFetch) window.fetch = window.__p12OriginalFetch
      delete window.__p12OriginalFetch
      delete window.__p12Requests
    }).catch(() => {})
    if (snapshot) await restore(page, snapshot)
    await browser.close()
  }
  if (!passed) process.exit(1)
}

main().catch(error => {
  console.error('ERROR | P12 body editor verification | ' + error.stack)
  process.exit(1)
})
