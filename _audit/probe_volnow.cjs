const { chromium } = require('playwright');
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  const state = await page.evaluate(() => {
    const proj = window.electronAPI.storageRead('wa_project_prj_msbtqnpe_q24wr3');
    const genBtns = [...document.querySelectorAll('#pipeline-panel button')].map(b => ({ text: b.textContent.trim(), disabled: b.disabled, id: b.id }));
    return {
      volCount: (proj?.volumes || []).length,
      volNames: (proj?.volumes || []).map(v => v.name),
      genButtons: genBtns.slice(0, 10),
      generatingText: document.body.innerText.includes('生成中')
    };
  });
  console.log(JSON.stringify(state, null, 2));
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
