const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  
  // 检查所有按钮的 innerHTML 和事件
  const btnInfo = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    return Array.from(btns).map(b => ({
      id: b.id || '(no id)',
      html: b.innerHTML.slice(0, 100),
      className: b.className.slice(0, 60),
      rect: b.getBoundingClientRect(),
      listeners: typeof getEventListeners !== 'undefined' ? getEventListeners(b) : 'N/A'
    }));
  });
  console.log('Button info:', JSON.stringify(btnInfo, null, 2));
  
  // 检查侧边栏区域
  const sidebar = await page.evaluate(() => {
    const el = document.querySelector('#sidebar') || document.querySelector('.sidebar') || document.querySelector('[class*=sidebar]') || document.querySelector('[class*=Sidebar]') || document.querySelector('nav');
    if (el) return { tag: el.tagName, class: el.className, html: el.innerHTML.slice(0, 1000) };
    // 找包含 btn-outline-workspace 的父元素
    const btn = document.querySelector('#btn-outline-workspace');
    if (btn) {
      return { parent: btn.parentElement?.className, parentHTML: btn.parentElement?.innerHTML.slice(0, 500) };
    }
    return 'no sidebar or btn found';
  });
  console.log('\\nSidebar:', JSON.stringify(sidebar));
  
  await browser.close();
})();
