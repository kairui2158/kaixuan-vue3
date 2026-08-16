const { chromium } = require('playwright');
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  const state = await page.evaluate(() => {
    const btn = document.querySelector('#btn-pl-gen-settings');
    const outline = document.querySelector('#pl-outline');
    return {
      btnDisabled: btn?.disabled,
      btnCls: btn?.className,
      outlineVal: outline?.value,
      outlineReadOnly: outline?.readOnly,
      outlineLen: outline?.value?.length,
      locked: outline?.readOnly || false
    };
  });
  console.log(JSON.stringify(state, null, 2));
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
