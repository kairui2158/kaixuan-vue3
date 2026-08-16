const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');

const CDP_PORT = 9223;
const APP_URL = 'http://localhost:5173/';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA = 'C:\\Users\\凯瑞\\.cdp-profile';
const OUTPUT_FILE = 'D:\\codex\\novel-workshop-vue3\\_audit\\cdp_results.json';

const cdpLogs = [];
const results = { pass: 0, fail: 0, checks: [], fails: [] };

function log(msg) { console.log(msg); }

function check(name, pass, detail) {
  results.checks.push({ name, status: pass ? 'PASS' : 'FAIL', detail: detail || '' });
  if (pass) { results.pass++; log('[OK] ' + name + (detail ? ' - ' + detail : '')); }
  else { results.fail++; results.fails.push(name); log('[ERR] ' + name + (detail ? ' - ' + detail : '')); }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  log('[INFO] Launching Chrome with CDP on port ' + CDP_PORT);
  const chrome = spawn(CHROME_PATH, [
    '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + USER_DATA,
    '--no-first-run',
    '--no-default-browser-check',
    APP_URL
  ], { detached: false, stdio: 'ignore' });
  chrome.unref();
  log('[INFO] Chrome PID: ' + chrome.pid);
  await sleep(3000);

  log('[INFO] Connecting via Playwright CDP...');
  const browser = await chromium.connectOverCDP('http://localhost:' + CDP_PORT);
  log('[INFO] Connected to CDP');

  const contexts = browser.contexts();
  const context = contexts[0] || await browser.newContext();
  const pages = context.pages();
  const page = pages[0] || await context.newPage();
  log('[INFO] Got page: ' + page.url());

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text().substring(0, 200)); });
  page.on('pageerror', err => consoleErrors.push('PAGEERROR: ' + err.message.substring(0, 200)));

  cdpLogs.push({ ts: new Date().toISOString(), method: 'Page.reload', params: { ignoreCache: true }, result: 'ok' });
  await page.reload({ waitUntil: 'networkidle' });
  log('[INFO] Page reloaded, waiting 3s for Vue mount...');
  await sleep(3000);

  const client = await context.newCDPSession(page);
  const origSend = client.send.bind(client);
  client.send = async function(method, params) {
    const r = await origSend(method, params);
    cdpLogs.push({ ts: new Date().toISOString(), method, params: params || {}, result: 'ok' });
    return r;
  };

  log('\n=== SECTION 1: Layout ===');
  const headerH = await page.evaluate(() => {
    const el = document.querySelector('.app-header');
    return el ? getComputedStyle(el).height : 'not-found';
  });
  check('app-header height 48px', headerH === '48px', 'got: ' + headerH);

  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth
      ? 'overflow:' + (document.documentElement.scrollWidth - document.documentElement.clientWidth) + 'px'
      : 'no-overflow';
  });
  check('no horizontal overflow', overflow === 'no-overflow', 'got: ' + overflow);

  const resizerCount = await page.evaluate(() =>
    document.querySelectorAll('.resizer, .resize-handle, [class*=resiz]').length
  );
  check('has resizers', resizerCount >= 1, 'count: ' + resizerCount);

  log('\n=== SECTION 2: DOM Elements ===');
  const selectors = [
    ['.editor-panel', 'Editor Panel'],
    ['.chat-panel', 'Chat Panel'],
    ['.chapter-tree', 'Chapter Tree'],
    ['.app-header', 'App Header'],
    ['.sidebar-nav', 'Sidebar Nav'],
    ['#app', '#app root'],
    ['.main-layout', 'Main Layout'],
    ['.editor-area', 'Editor Area']
  ];
  for (const [sel, name] of selectors) {
    const exists = await page.evaluate(s => !!document.querySelector(s), sel);
    check('DOM: ' + name + ' (' + sel + ')', exists, exists ? 'found' : 'NOT found');
  }

  log('\n=== SECTION 3: electronAPI ===');
  const hasApi = await page.evaluate(() => typeof window.electronAPI !== 'undefined');
  check('electronAPI exists', hasApi, hasApi ? 'yes' : 'NO');
  if (hasApi) {
    const methods = ['saveContent','loadContent','showSaveDialog','showOpenDialog','readFile','writeFile','onMenuAction','getAppVersion','selectDirectory','exportContent','importFile'];
    for (const m of methods) {
      const info = await page.evaluate(fn => typeof window.electronAPI[fn], m);
      check('electronAPI.' + m + ' is function', info === 'function', 'type: ' + info);
    }
  }

  log('\n=== SECTION 4: Settings Modal ===');
  const settingsBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, [class*=settings], [class*=gear]'));
    const s = btns.find(b =>
      (b.textContent && b.textContent.includes('\u8bbe\u7f6e')) ||
      (b.className && b.className.includes('settings'))
    );
    return s ? 'found:' + s.tagName + '.' + s.className : 'not-found';
  });
  check('settings button found', settingsBtn.startsWith('found'), 'got: ' + settingsBtn);
  if (settingsBtn.startsWith('found')) {
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, [class*=settings], [class*=gear]'));
      const s = btns.find(b =>
        (b.textContent && b.textContent.includes('\u8bbe\u7f6e')) ||
        (b.className && b.className.includes('settings'))
      );
      if (s) s.click();
    });
    await sleep(1000);
    const modalVisible = await page.evaluate(() =>
      !!document.querySelector('.modal-overlay, .settings-modal, [class*=modal-overlay]')
    );
    check('settings modal visible after click', modalVisible, modalVisible ? 'yes' : 'NO');
    const editorStillThere = await page.evaluate(() => !!document.querySelector('.editor-panel, #app'));
    check('editor still in DOM after modal open', editorStillThere, editorStillThere ? 'yes' : 'NO');
    await page.evaluate(() => {
      const ov = document.querySelector('.modal-overlay, .settings-modal');
      if (ov) {
        const close = ov.querySelector('button[class*=close], [class*=close]');
        if (close) close.click(); else ov.click();
      }
    });
    await sleep(500);
    const modalGone = await page.evaluate(() => !document.querySelector('.modal-overlay, .settings-modal'));
    check('settings modal closed', modalGone, modalGone ? 'yes' : 'still visible');
  }

  log('\n=== SECTION 5: Outline Workspace ===');
  const owBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, [class*=outline]'));
    return btns.length > 0 ? 'found:' + btns.length : 'not-found';
  });
  check('outline button found', owBtn.startsWith('found'), 'got: ' + owBtn);
  if (owBtn.startsWith('found')) {
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, [class*=outline]'));
      if (btns[0]) btns[0].click();
    });
    await sleep(1000);
    const owVisible = await page.evaluate(() =>
      !!document.querySelector('.ow-overlay, .outline-workspace, [class*=outline-overlay]')
    );
    check('outline overlay visible', owVisible, owVisible ? 'yes' : 'NO');
    const hasTextarea = await page.evaluate(() =>
      !!document.querySelector('.ow-overlay textarea, .outline-workspace textarea')
    );
    check('outline textarea exists', hasTextarea, hasTextarea ? 'yes' : 'NO');
    const editorStillThere2 = await page.evaluate(() => !!document.querySelector('.editor-panel, #app'));
    check('editor still in DOM after outline open', editorStillThere2, editorStillThere2 ? 'yes' : 'NO');
    await page.evaluate(() => {
      const ov = document.querySelector('.ow-overlay, .outline-workspace');
      if (ov) { const c = ov.querySelector('[class*=close]'); if (c) c.click(); else ov.click(); }
    });
    await sleep(500);
  }

  log('\n=== SECTION 6: Settings Collection ===');
  const scBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, [class*=collection], [class*=collect]'));
    return btns.length > 0 ? 'found:' + btns.length : 'not-found';
  });
  check('collection button found', scBtn.startsWith('found'), 'got: ' + scBtn);
  if (scBtn.startsWith('found')) {
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, [class*=collection], [class*=collect]'));
      if (btns[0]) btns[0].click();
    });
    await sleep(1000);
    const scVisible = await page.evaluate(() =>
      !!document.querySelector('.sc-overlay, [class*=collection-overlay], .collection-modal')
    );
    check('collection overlay visible', scVisible, scVisible ? 'yes' : 'NO');
    const hasSidebar = await page.evaluate(() =>
      !!document.querySelector('.sc-overlay .sidebar, .sc-overlay nav, .collection-modal .sidebar')
    );
    check('collection sidebar exists', hasSidebar, hasSidebar ? 'yes' : 'NO');
    const hasMain = await page.evaluate(() =>
      !!document.querySelector('.sc-overlay .main, .sc-overlay section, .collection-modal .main')
    );
    check('collection main exists', hasMain, hasMain ? 'yes' : 'NO');
    const editorStillThere3 = await page.evaluate(() => !!document.querySelector('.editor-panel, #app'));
    check('editor still in DOM after collection open', editorStillThere3, editorStillThere3 ? 'yes' : 'NO');
    await page.evaluate(() => {
      const ov = document.querySelector('.sc-overlay, .collection-modal');
      if (ov) { const c = ov.querySelector('[class*=close]'); if (c) c.click(); }
    });
    await sleep(500);
  }

  log('\n=== SECTION 7: Text Overflow Scan ===');
  const overflowEls = await page.evaluate(() => {
    const els = document.querySelectorAll('*');
    let issues = 0;
    const detail = [];
    for (const el of els) {
      if (el.children.length > 0) continue;
      const s = getComputedStyle(el);
      if (s.overflow === 'hidden' && el.scrollWidth > el.clientWidth) {
        issues++;
        if (detail.length < 5) detail.push(el.tagName + '.' + (el.className || '').substring(0, 30) + ' sw=' + el.scrollWidth + ' cw=' + el.clientWidth);
      }
    }
    return issues === 0 ? 'no-overflow' : issues + ' overflow: ' + detail.join('; ');
  });
  check('no text overflow in leaf elements', overflowEls === 'no-overflow', 'got: ' + overflowEls.substring(0, 200));

  log('\n=== SECTION 8: Console Errors ===');
  check('no console errors', consoleErrors.length === 0, consoleErrors.length === 0 ? 'clean' : consoleErrors.length + ' errors: ' + consoleErrors.slice(0, 3).join('; ').substring(0, 200));

  log('\n=== SECTION 9: IndexedDB Dump ===');
  const idbData = await page.evaluate(async () => {
    try {
      if (!indexedDB.databases) return { error: 'no databases() API' };
      const dbs = await indexedDB.databases();
      const result = [];
      for (const dbInfo of dbs) {
        const dbName = dbInfo.name;
        const dbVer = dbInfo.version;
        try {
          const db = await new Promise((res, rej) => {
            const req = indexedDB.open(dbName);
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
          });
          const stores = Array.from(db.objectStoreNames);
          const storeData = [];
          for (const storeName of stores) {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const count = await new Promise((res, rej) => {
              const r = store.count(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
            });
            const allKeys = await new Promise((res, rej) => {
              const r = store.getAllKeys(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
            });
            const allVals = await new Promise((res, rej) => {
              const r = store.getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
            });
            const samples = [];
            for (let i = 0; i < Math.min(3, allVals.length); i++) {
              const v = allVals[i];
              const str = typeof v === 'object' ? JSON.stringify(v) : String(v);
              samples.push({ key: allKeys[i], value: str.substring(0, 300) });
            }
            storeData.push({ name: storeName, count, keys: allKeys.slice(0, 10), samples });
          }
          db.close();
          result.push({ name: dbName, version: dbVer, stores: storeData });
        } catch (e) {
          result.push({ name: dbName, version: dbVer, error: e.message });
        }
      }
      return result;
    } catch (e) {
      return { error: e.message };
    }
  });
  log('[INFO] IndexedDB: ' + JSON.stringify(idbData).substring(0, 500));

  log('\n=== SECTION 10: localStorage ===');
  const lsData = await page.evaluate(() => {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k);
      result[k] = v ? v.substring(0, 200) : '';
    }
    return result;
  });
  log('[INFO] localStorage keys: ' + Object.keys(lsData).join(', '));

  log('\n=== SECTION 11: DOM Structure ===');
  const domInfo = await page.evaluate(() => {
    const app = document.querySelector('#app');
    const children = app ? Array.from(app.children).map(c => c.tagName + '.' + (c.className || '').substring(0, 50)) : [];
    return {
      appChildren: children,
      inputCount: document.querySelectorAll('input').length,
      textareaCount: document.querySelectorAll('textarea').length,
      buttonCount: document.querySelectorAll('button').length,
      totalElements: document.querySelectorAll('*').length
    };
  });
  log('[INFO] DOM: ' + JSON.stringify(domInfo).substring(0, 500));

  log('\n=== SECTION 12: Vue App State ===');
  const vueState = await page.evaluate(() => {
    const app = document.querySelector('#app');
    if (app && app.__vue_app__) {
      return { hasVue: true, version: app.__vue_app__.version || 'unknown' };
    }
    return { hasVue: false };
  });
  check('Vue app mounted', vueState.hasVue, vueState.hasVue ? 'v' + vueState.version : 'NOT mounted');

  const output = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.checks.length,
      pass: results.pass,
      fail: results.fail,
      passRate: results.checks.length > 0 ? (results.pass / results.checks.length * 100).toFixed(1) + '%' : '0%'
    },
    checks: results.checks,
    cdpLogs: cdpLogs,
    indexedDB: idbData,
    localStorage: lsData,
    domStructure: domInfo,
    vueState: vueState,
    consoleErrors: consoleErrors
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
  log('\n=== RESULTS SAVED ===');
  log('Total: ' + results.checks.length + ' | PASS: ' + results.pass + ' | FAIL: ' + results.fail);
  log('Results saved to: ' + OUTPUT_FILE);
  log('Fails: ' + (results.fails.length > 0 ? results.fails.join(', ') : 'none'));

  await browser.close();
  log('[INFO] Browser CDP connection closed. Done.');
  process.exit(0);
}

main().catch(err => {
  log('[FATAL] ' + err.message);
  try {
    const output = {
      timestamp: new Date().toISOString(),
      error: err.message,
      summary: { total: results.checks.length, pass: results.pass, fail: results.fail },
      checks: results.checks,
      cdpLogs: cdpLogs
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
    log('[INFO] Partial results saved to: ' + OUTPUT_FILE);
  } catch (e) { log('[FATAL] Could not save results: ' + e.message); }
  process.exit(1);
});
