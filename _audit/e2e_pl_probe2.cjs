const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  await page.locator('#btn-pipeline').click();
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => {
    const outline = document.querySelector('#pl-outline');
    const count = document.querySelector('#pl-book-word-count');
    const volCnt = document.querySelector('#pl-volume-count');
    const lock = [...document.querySelectorAll('#pl-step-1-content button')].find(b => b.textContent.includes('锁定'));
    return {
      outlineLockedAttr: outline ? outline.readOnly : null,
      outline: outline ? outline.value.slice(0, 80) : null,
      bookWordCount: count ? count.value : null,
      volCountDisplay: volCnt ? volCnt.value : null,
      lockDisabled: lock ? lock.disabled : null,
      lockText: lock ? lock.textContent : null,
      lastProject: document.body.innerText.includes('prj_msbtqnpe_q24wr3') ? 'yes' : 'no'
    };
  });
  console.log(JSON.stringify(state, null, 2));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
