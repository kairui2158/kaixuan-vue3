const { chromium } = require('playwright')
const fs = require('fs')

function result(name, pass, detail) {
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + name + ' | ' + detail)
  return pass
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts()[0].pages()[0]
  page.setDefaultTimeout(15000)
  let passed = true
  const requests = []
  const responses = []
  const original = await page.evaluate(() => ({
    text: document.querySelector('#outline-editor')?.value || '',
    messages: document.querySelector('#ow-chat-messages')?.innerText || ''
  }))
  try {
    if (!(await page.locator('#outline-workspace').count())) {
      await page.locator('#btn-outline-workspace').click()
      await page.waitForTimeout(300)
    }
    passed = result('大纲工作台可见', await page.locator('#outline-workspace').isVisible(), '') && passed
    const toggle = page.locator('#btn-ai-co-create')
    if (!(await page.locator('#ow-chat-input').isVisible())) await toggle.click()
    await page.waitForTimeout(250)
    await page.waitForTimeout(250)
    passed = result('AI共创输入框可见', await page.locator('#ow-chat-input').isVisible(), '') && passed

    page.on('request', request => {
      if (request.url().includes('/chat/completions')) {
        try { requests.push({ url: request.url(), method: request.method(), body: JSON.parse(request.postData() || '{}') }) } catch {}
      }
    })
    page.on('response', async response => {
      if (!response.url().includes('/chat/completions')) return
      let body = null
      try { body = await response.json() } catch {}
      responses.push({ url: response.url(), status: response.status(), body })
    })

    const editor = page.locator('#outline-editor')
    await editor.fill('测试小说大纲：主角在雾港发现一枚会发光的旧钥匙。')
    const input = page.locator('#ow-chat-input')
    await input.fill('请用一句话确认你已读到这个大纲。')
    await input.press('Enter')
    await page.waitForTimeout(1000)
    passed = result('用户消息进入共创对话', (await page.locator('#ow-chat-messages .ow-msg.user').count()) >= 1, String(await page.locator('#ow-chat-messages').innerText())) && passed

    const deadline = Date.now() + 180000
    while (Date.now() < deadline) {
      const assistantCount = await page.locator('#ow-chat-messages .ow-msg.assistant').count()
      if (assistantCount > 0 || responses.some(r => r.status >= 200)) break
      await page.waitForTimeout(1000)
    }
    const assistant = await page.locator('#ow-chat-messages .ow-msg.assistant').last().innerText().catch(() => '')
    const request = requests[requests.length - 1]
    const response = responses[responses.length - 1]
    passed = result('实际发出 chat/completions 请求', !!request, request ? request.url : 'none') && passed
    passed = result('请求包含当前大纲上下文', !!request && JSON.stringify(request.body).includes('雾港'), request ? 'messages=' + request.body.messages?.length : 'none') && passed
    passed = result('API 返回成功状态', !!response && response.status >= 200 && response.status < 300, response ? String(response.status) : 'none') && passed
    passed = result('API 回复渲染为对话气泡', assistant.length > 0 && !assistant.startsWith('Error:'), JSON.stringify(assistant.slice(0, 120))) && passed

    const client = await page.context().newCDPSession(page)
    const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/P3_outline_ai_verify.png', Buffer.from(shot.data, 'base64'))
    fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/P3_outline_ai_verify.json', JSON.stringify({ requests: requests.map(r => ({ url: r.url, method: r.method, model: r.body.model, messageCount: r.body.messages?.length, containsOutline: JSON.stringify(r.body).includes('雾港') })), responses: responses.map(r => ({ url: r.url, status: r.status, hasChoice: !!r.body?.choices?.length })), assistantPreview: assistant.slice(0, 300) }, null, 2), 'utf8')
  } finally {
    await page.evaluate((text) => {
      const editor = document.querySelector('#outline-editor')
      if (editor) {
        editor.value = text
        editor.dispatchEvent(new Event('input', { bubbles: true }))
        editor.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, original.text)
    await page.waitForTimeout(700)
    await browser.close()
  }
  if (!passed) process.exit(1)
}

main().catch(error => { console.error('ERROR | P3 outline AI verification | ' + error.stack); process.exit(1) })


