const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  const info = await page.evaluate(() => {
    const ps = window.__pinia?._s.get('project');
    const pipe = window.__pinia?._s.get('pipeline');
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id).filter((id) => /outline|project|workspace/i.test(id));
    const visible = [...document.querySelectorAll('button')].filter((b) => getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0).map((b) => (b.textContent || '').trim()).slice(0, 80);
    const ws = document.querySelector('#outline-workspace');
    return {
      currentProjectId: ps?.currentProjectId,
      projectName: ps?.currentProject?.name,
      outlineLocked: ps?.outlineLocked,
      currentStep: pipe?.currentStep,
      ids,
      outlineWorkspace: ws ? { display: getComputedStyle(ws).display, rect: ws.getBoundingClientRect().toJSON() } : null,
      editor: !!document.querySelector('#outline-editor'),
      visibleButtons: visible
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
}

main().catch((e) => { console.error('ERROR:' + (e.stack || e.message)); process.exit(1); });
