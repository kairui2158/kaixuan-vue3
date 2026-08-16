const { chromium } = require('playwright');
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  const state = await page.evaluate(() => {
    const all = document.body.innerText;
    const projectLabels = [...document.querySelectorAll('[class*="project"], [class*="chapter"], [id*="project"], [id*="chapter"]')].map(e => ({
      tag: e.tagName, id: e.id, cls: typeof e.className === 'string' ? e.className : '', text: (e.textContent || '').trim().slice(0, 80)
    })).filter(e => e.text);
    const tree = document.querySelector('.chapter-tree, #chapter-tree, [class*="tree"]');
    const editorTabs = document.querySelectorAll('[data-editor-tab], .editor-tab, [class*="editor-tab"]');
    return {
      hasProjectIdText: all.includes('prj_msbtqnpe_q24wr3'),
      projectLabels,
      treeText: tree ? tree.textContent.slice(0, 300) : null,
      tabCount: editorTabs.length,
      tabs: [...editorTabs].map(t => t.textContent.trim()).slice(0, 10),
      bodyStart: all.slice(0, 500)
    };
  });
  console.log(JSON.stringify(state, null, 2));
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
