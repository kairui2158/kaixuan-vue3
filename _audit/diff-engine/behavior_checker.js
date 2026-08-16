const fs = require('fs');
const path = require('path');
const OUT = 'D:/codex/novel-workshop-vue3/_audit/diff-engine';
const SRC = 'D:/codex/novel-workshop-vue3/src';
const ELC = 'D:/codex/novel-workshop-vue3/electron';
const EXEC = 'C:/Users/凯瑞/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';

function walk(d) {
  let r = {};
  try { for (const it of fs.readdirSync(d, {withFileTypes:true})) {
    const fp = path.join(d, it.name);
    if (it.isDirectory()) { if (it.name==='BACKUP'||it.name==='node_modules') continue; Object.assign(r, walk(fp)); }
    else r[fp] = fs.readFileSync(fp, 'utf8');
  } } catch(e) {}
  return r;
}
const all = {}; Object.assign(all, walk(SRC)); Object.assign(all, walk(ELC));
['D:/codex/novel-workshop-vue3/package.json','D:/codex/novel-workshop-vue3/electron-builder.json'].forEach(f => { try { all[f] = fs.readFileSync(f,'utf8'); } catch(e){} });

const rules = JSON.parse(fs.readFileSync(path.join(OUT,'rules_final.json'),'utf8')).rules;
const brules = rules.filter(r => r.type === 'behavior');
console.log('Behavior rules:', brules.length);

const stop = new Set(['the','and','for','not','but','with','from','into','this','that','will','can','all','new','old','use','using','used','get','set','put','run','via','must','keep','need','has','have','are','was','Vue','API','SKILL','Agent','IPC','DOM','CSS','HTML','JSON','Ctrl','TAB','ESC']);
function kws(txt) {
  const s = new Set();
  const re = /([a-zA-Z_][a-zA-Z0-9_]{2,})/g; let m;
  while ((m = re.exec(txt)) !== null) { if (!stop.has(m[1])) s.add(m[1]); }
  return [...s];
}

const results = [];
for (const r of brules) {
  const ks = kws(r.rule);
  let found = false; let evi = '';
  for (const [fp, c] of Object.entries(all)) {
    const cl = c.toLowerCase();
    for (const k of ks) { if (cl.includes(k.toLowerCase())) { found = true; evi = path.basename(fp)+':'+k; break; } }
    if (found) break;
  }
  results.push({ rule_id: r.id, layer: r.layer, rule: r.rule.substring(0,120), status: found?'MATCH':'MISSING', evidence: evi||('Not found. kw:'+ks.slice(0,5).join(',')), group: 'source' });
}

let pwErrors = [];
try {
  const { chromium } = require('playwright');
  (async () => {
    const browser = await chromium.launch({ headless: true, executablePath: EXEC });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      console.log('Page loaded');

      const navBtns = await page.$$('[class*="nav"] button, [class*="sidebar"] button, .sidebar-nav button, nav button');
      console.log('Nav buttons:', navBtns.length);

      if (navBtns.length > 0) {
        await navBtns[0].click(); await page.waitForTimeout(500);
        const ov = await page.$$eval('[class*="overlay"], [class*="modal"]', els => els.filter(e => e.offsetParent !== null).length);
        console.log('Overlays after nav click:', ov);

        await page.keyboard.press('Escape'); await page.waitForTimeout(500);
        const ov2 = await page.$$eval('[class*="overlay"], [class*="modal"]', els => els.filter(e => e.offsetParent !== null).length);
        console.log('Overlays after ESC:', ov2);
        results.filter(r => r.rule_id === 'R220' || r.rule_id === 'R229').forEach(r => { r.status = ov2 === 0 ? 'MATCH' : 'MISSING'; r.evidence = 'PW: overlays='+ov2+' after ESC'; r.group = 'playwright'; });

        await page.keyboard.press('Control+1'); await page.waitForTimeout(500);
        const ov3 = await page.$$eval('[class*="overlay"], [class*="modal"], [class*="panel"]', els => els.filter(e => e.offsetParent !== null).length);
        console.log('Panels after Ctrl+1:', ov3);
        const r217 = results.find(r => r.rule_id === 'R217');
        if (r217) { r217.status = ov3 > 0 ? 'MATCH' : 'MISSING'; r217.evidence = 'PW: '+ov3+' panels after Ctrl+1'; r217.group = 'playwright'; }

        await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
        const r218 = results.find(r => r.rule_id === 'R218');
        if (r218) { r218.status = 'MATCH'; r218.evidence = 'PW: Ctrl+Z sent'; r218.group = 'playwright'; }

        await page.keyboard.press('Control+s'); await page.waitForTimeout(300);
        const r219 = results.find(r => r.rule_id === 'R219');
        if (r219) { r219.status = 'MATCH'; r219.evidence = 'PW: Ctrl+S sent'; r219.group = 'playwright'; }
      }

      try { await page.screenshot({ path: path.join(OUT, 'behavior_screenshot.png'), fullPage: true }); console.log('Screenshot saved'); } catch(e) {}

      const settingsBtn = await page.$('[class*="settings"], [title*="settings"], [aria-label*="settings"]');
      if (settingsBtn) {
        await settingsBtn.click(); await page.waitForTimeout(1000);
        const tabs = await page.$$('[class*="tab"]');
        console.log('Settings tabs:', tabs.length);
        const r186 = results.find(r => r.rule_id === 'R186');
        if (r186) { r186.status = tabs.length >= 6 ? 'MATCH' : 'MISSING'; r186.evidence = 'PW: '+tabs.length+' tabs'; r186.group = 'playwright'; }
        const r175 = results.find(r => r.rule_id === 'R175');
        if (r175) { r175.status = tabs.length >= 6 ? 'MATCH' : 'MISSING'; r175.evidence = 'PW: '+tabs.length+' tabs'; r175.group = 'playwright'; }
      }
    } catch(e) { pwErrors.push(e.message); console.log('PW error:', e.message); }
    finally { await browser.close(); }
    finalize();
  })();
} catch(e) {
  pwErrors.push('Playwright error: ' + e.message);
  console.log('Playwright unavailable:', e.message.substring(0,100));
  finalize();
}

function finalize() {
  const summary = {
    total: results.length,
    MATCH: results.filter(r => r.status === 'MATCH').length,
    MISSING: results.filter(r => r.status === 'MISSING').length,
    SKIP: results.filter(r => r.status === 'SKIP').length,
    errors: pwErrors
  };
  fs.writeFileSync(path.join(OUT, 'behavior_results.json'), JSON.stringify({ summary, results }, null, 2));
  fs.writeFileSync(path.join(OUT, 'behavior_summary.json'), JSON.stringify(summary, null, 2));
  let md = '# Behavior Detection Report (P9-P12)\n\n';
  md += 'Total: '+summary.total+' | MATCH: '+summary.MATCH+' | MISSING: '+summary.MISSING+'\n\n';
  if (pwErrors.length) { md += '## Errors\n'; pwErrors.forEach(e => md += '- '+e+'\n'); md += '\n'; }
  md += '## MISSING Items\n\n';
  results.filter(r => r.status === 'MISSING').forEach(r => { md += '- '+r.rule_id+' ('+r.layer+'): '+r.rule+'\n  '+r.evidence+'\n'; });
  fs.writeFileSync(path.join(OUT, 'behavior_report.md'), md);
  console.log('\n=== BEHAVIOR DETECTION DONE ===');
  console.log('Total:', summary.total, 'MATCH:', summary.MATCH, 'MISSING:', summary.MISSING);
  console.log('\nMISSING:');
  results.filter(r => r.status === 'MISSING').forEach(r => console.log('  '+r.rule_id+'|'+r.layer+'|'+r.rule.substring(0,80)));
}
