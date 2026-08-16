const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9227');
  const ctx = browser.contexts()[0];
  const p = ctx?.pages()?.[0];
  if (!p) { await browser.close(); return; }
  await p.waitForLoadState('networkidle');
  
  // Open outline via JS
  await p.evaluate(() => {
    document.querySelector('#btn-outline-workspace')?.click();
  });
  await p.waitForTimeout(800);
  
  // Try JS click on AI共创
  await p.evaluate(() => {
    document.querySelector('#btn-ai-co-create')?.click();
  });
  await p.waitForTimeout(500);
  
  const chat = await p.$('.ow-chat');
  console.log('Chat visible:', chat ? await chat.isVisible() : 'no element');
  
  // Check if chatAreaOpen state changed
  const state = await p.evaluate(() => {
    const app = document.querySelector('#app');
    if (!app) return 'no app';
    // Try to find Vue app state
    const vueApp = app.__vue_app__;
    if (!vueApp) return 'no vue app';
    return 'vue app found';
  });
  console.log('Vue app state:', state);
  
  // Try looking at the Vue component tree
  const vnode = await p.evaluate(() => {
    const app = document.querySelector('#app');
    return app ? Object.keys(app).filter(k => k.startsWith('__vue')) : [];
  });
  console.log('Vue keys:', vnode);
  
  await browser.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
