const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9227');
  const ctx = browser.contexts()[0];
  const p = ctx?.pages()?.[0];
  if (!p) { await browser.close(); return; }
  await p.waitForLoadState('networkidle');
  
  // Open outline workspace
  await (await p.$('#btn-outline-workspace')).click();
  await p.waitForTimeout(800);
  
  // Check the overlay issue
  const info = await p.evaluate(() => {
    const ow = document.querySelector('#outline-workspace');
    if (!ow) return 'no outline-workspace';
    const style = getComputedStyle(ow);
    return {
      position: style.position,
      zIndex: style.zIndex,
      pointerEvents: style.pointerEvents,
      width: style.width,
      height: style.height,
      top: style.top,
      left: style.left
    };
  });
  console.log('Outline workspace style:', JSON.stringify(info, null, 2));
  
  // Check which element is at the AI button position
  const pointInfo = await p.evaluate(() => {
    const btn = document.querySelector('#btn-ai-co-create');
    if (!btn) return 'no button';
    const rect = btn.getBoundingClientRect();
    const x = rect.left + rect.width/2;
    const y = rect.top + rect.height/2;
    const el = document.elementFromPoint(x, y);
    const path = [];
    let cur = el;
    while (cur && cur !== document.body) {
      path.push({
        tag: cur.tagName,
        id: cur.id || '',
        class: (typeof cur.className === 'string') ? cur.className : '',
        zIndex: getComputedStyle(cur).zIndex,
        pointerEvents: getComputedStyle(cur).pointerEvents
      });
      cur = cur.parentElement;
    }
    return { x, y, targetTag: el?.tagName, targetId: el?.id || '', targetClass: (typeof el?.className === 'string') ? el.className : '', path };
  });
  
  console.log('\nClick point analysis:');
  console.log('  Position:', pointInfo.x, pointInfo.y);
  console.log('  Target:', pointInfo.targetTag, pointInfo.targetId, pointInfo.targetClass);
  console.log('  Path:');
  for (const p of pointInfo.path) {
    console.log('    <' + p.tag + (p.id ? ' id=' + p.id : '') + (p.class ? ' class=' + p.class : '') + '> zIndex=' + p.zIndex + ' pointerEvents=' + p.pointerEvents);
  }
  
  await browser.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
