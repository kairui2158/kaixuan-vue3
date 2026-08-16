const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9227');
  const ctx = browser.contexts()[0];
  const p = ctx?.pages()?.[0];
  if (!p) { await browser.close(); return; }
  await p.waitForLoadState('networkidle');
  
  // Open outline workspace
  await p.evaluate(() => {
    const btn = document.querySelector('#btn-outline-workspace');
    if (btn) btn.click();
  });
  await p.waitForTimeout(600);
  
  // Get the full HTML of the outline workspace area
  const html = await p.evaluate(() => {
    const ow = document.querySelector('#outline-workspace');
    if (!ow) return 'no outline-workspace found';
    const children = ow.querySelectorAll('*');
    const result = [];
    for (const el of children) {
      if (el.id || el.className) {
        result.push({
          tag: el.tagName,
          id: el.id || '',
          class: (typeof el.className === 'string') ? el.className : '',
          text: (el.textContent || '').trim().substring(0, 40)
        });
      }
    }
    return result;
  });
  
  console.log('Outline workspace children with id/class:');
  for (const item of html) {
    console.log('  <' + item.tag + (item.id ? ' id=' + item.id : '') + (item.class ? ' class=' + item.class : '') + '> "' + item.text + '"');
  }
  
  await browser.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
