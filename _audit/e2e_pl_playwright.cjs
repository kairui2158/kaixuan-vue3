const { chromium } = require('playwright');

const log = (msg) => console.log('[E2E] ' + msg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const contexts = browser.contexts();
  const page = contexts[0]?.pages()[0];
  if (!page) throw new Error('no page');
  log('connected: ' + page.url());

  const snap = await page.evaluate(() => ({
    title: document.title,
    pipeline: !!document.querySelector('#pipeline-panel'),
    buttons: [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null).map(b => ({
      id: b.id || '', text: (b.textContent || '').trim().slice(0, 30), disabled: b.disabled
    })).slice(0, 60)
  }));
  log('snap: ' + JSON.stringify(snap));

  if (!snap.pipeline) {
    const candidates = await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, [data-panel], [data-view], [data-tool]')]
        .filter(el => el.offsetParent !== null);
      return els.map((el, i) => ({
        i,
        tag: el.tagName,
        id: el.id || '',
        cls: typeof el.className === 'string' ? el.className : '',
        text: (el.textContent || '').trim().slice(0, 40),
        aria: el.getAttribute('aria-label') || '',
        data: [...el.attributes].filter(a => /^data-/i.test(a.name)).map(a => a.name + '=' + a.value)
      })).filter(x => /流水线|pipeline|生成/i.test([x.id, x.cls, x.text, x.aria].join(' ')));
    });
    log('candidates: ' + JSON.stringify(candidates));

    let opened = false;
    if (candidates.some((c) => c.id === 'btn-pipeline')) {
      await page.locator('#btn-pipeline').click({ timeout: 3000 });
      await sleep(500);
      opened = await page.evaluate(() => !!document.querySelector('#pipeline-panel'));
      if (opened) log('opened via #btn-pipeline');
    }

    if (!opened) {
      // Try keyboard shortcut or sidebar via Vue attr guesses.
      const goto = await page.evaluate(() => {
        const all = [...document.querySelectorAll('button, [role="button"], li, a, [data-panel]')]
          .filter(el => el.offsetParent !== null);
        const hit = all.find(el => /生成流水线/i.test(el.textContent || '') );
        if (hit) {
          const r = hit.getBoundingClientRect();
          return { tag: hit.tagName, id: hit.id, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
        }
        return null;
      });
      if (goto) {
        await page.mouse.click(goto.cx, goto.cy);
        await sleep(300);
      }
    }
  }

  const pipSnap = await page.evaluate(() => {
    const panel = document.querySelector('#pipeline-panel');
    if (!panel) return null;
    const steps = [...document.querySelectorAll('.pl-step')].map(s => s.innerText.trim());
    const active = document.querySelector('.pl-step.active')?.innerText.trim() || '';
    const btns = [...panel.querySelectorAll('button')].map(b => ({
      id: b.id || '', text: (b.textContent || '').trim(), disabled: b.disabled
    }));
    return { steps, active, btns };
  });
  log('pipeline: ' + JSON.stringify(pipSnap));
  await browser.close();
}

main().catch((e) => { console.error('[E2E-ERR]', e); process.exit(1); });
