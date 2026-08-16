const { chromium } = require('playwright');

(async () => {
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
    const ctx = browser.contexts()[0];
    const page = ctx.pages()[0];
    await page.waitForTimeout(500);

    const opened = await page.evaluate(() => {
      if (document.querySelector('#outline-workspace')) return true;
      const btn = document.querySelector('#btn-outline-workspace');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (opened) await page.waitForSelector('#outline-workspace', { timeout: 8000 });
    else {
      await page.keyboard.press('Control+1');
      await page.waitForSelector('#outline-workspace', { timeout: 8000 });
    }

    const chatClosed = await page.evaluate(() => {
      const chat = document.querySelector('.ow-chat');
      return !chat || getComputedStyle(chat).display === 'none';
    });
    if (chatClosed) {
      await page.click('#btn-ai-co-create');
      await page.waitForTimeout(400);
    }

    await page.fill('#ow-chat-input', '测试气泡字号');
    await page.click('#btn-ow-send');

    await page.waitForSelector('.ow-msg.user .ow-msg-bubble', { timeout: 8000 });
    let assistantReady = false;
    try {
      await page.waitForSelector('.ow-msg.assistant .ow-msg-bubble', { timeout: 90000 });
      assistantReady = true;
    } catch (e) {
      assistantReady = false;
    }
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
      const bubbles = Array.from(document.querySelectorAll('.ow-msg-bubble'));
      const btns = Array.from(document.querySelectorAll('#ow-chat-messages .msg-btn'));
      const input = document.querySelector('.ow-input');
      return {
        bubbleCount: bubbles.length,
        userBubbles: bubbles.filter(b => b.closest('.ow-msg.user')).length,
        assistantReady: !!document.querySelector('.ow-msg.assistant .ow-msg-bubble'),
        bubbleFontSizes: bubbles.map((el, i) => `bubble#${i}: ${getComputedStyle(el).fontSize}`),
        btnCount: btns.length,
        btnFontSizes: btns.map((el, i) => `btn#${i}: ${getComputedStyle(el).fontSize}`),
        inputFontSize: input ? getComputedStyle(input).fontSize : 'NO INPUT',
        messageTexts: bubbles.map(b => (b.textContent || '').slice(0, 40))
      };
    });
    console.log(JSON.stringify(result, null, 2));

    await page.screenshot({ path: '_audit/ow_chat_font_check.png' });

    let allPass = true;
    if (result.bubbleCount === 0) {
      console.log('FAIL: 发送后没有渲染任何气泡');
      allPass = false;
    }
    if (result.bubbleFontSizes.some(s => !s.includes('14px'))) {
      console.log('FAIL: 存在非14px气泡: ' + JSON.stringify(result.bubbleFontSizes));
      allPass = false;
    }
    if (result.btnFontSizes.some(s => !s.includes('12px'))) {
      console.log('FAIL: 存在非12px按钮: ' + JSON.stringify(result.btnFontSizes));
      allPass = false;
    }
    if (result.inputFontSize !== 'NO INPUT' && !result.inputFontSize.includes('13px')) {
      console.log('FAIL: input字号=' + result.inputFontSize);
      allPass = false;
    }
    if (!assistantReady) console.log('WARN: API未返回assistant气泡（使用的是用户气泡/错误气泡验证字号）');

    console.log(allPass ? 'ALL FONT SIZE CHECKS PASSED' : 'FONT SIZE CHECK FAILED');
    process.exitCode = allPass ? 0 : 1;
  } finally {
    try {
      const ctx = browser && browser.contexts()[0];
      const page = ctx && ctx.pages()[0];
      if (page) await page.click('#btn-close-outline-workspace', { timeout: 3000 }).catch(() => {});
    } catch (e) {}
    if (browser) await browser.close();
  }
})();
