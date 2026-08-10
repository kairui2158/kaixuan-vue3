const fs = require('fs');
const path = require('path');
const OLD_HTML = 'C:\\Users\\凯瑞\\Documents\\New project 2\\renderer.html';
const NEW_SRC = 'D:\\codex\\novel-workshop-vue3\\src';
const OUT = 'D:\\codex\\novel-workshop-vue3\\_audit\\css_diff.json';
function extractOldCSS(html) {
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let css = '';
  let m;
  while ((m = styleRegex.exec(html)) !== null) { css += '\n' + m[1]; }
  return css;
}
function extractVars(css) {
  const vars = new Set();
  const re = /(--[a-zA-Z0-9-]+)\s*:/g;
  let m;
  while ((m = re.exec(css)) !== null) { vars.add(m[1]); }
  return [...vars].sort();
}
function extractSelectors(css) {
  const selectors = new Set();
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = clean.split('{');
  for (let i = 0; i < blocks.length - 1; i++) {
    const lines = blocks[i].split('\n');
    const sel = lines[lines.length - 1].trim();
    if (sel && !sel.startsWith('@') && !sel.startsWith('}')) {
      sel.split(',').forEach(s => { const t = s.trim(); if (t && !t.startsWith('@')) selectors.add(t); });
    }
  }
  return [...selectors].sort();
}
function extractMediaQueries(css) {
  const mqs = new Set();
  const re = /@media\s+[^{]+/g;
  let m;
  while ((m = re.exec(css)) !== null) { mqs.add(m[0].trim()); }
  return [...mqs].sort();
}
function extractKeyframes(css) {
  const kfs = new Set();
  const re = /@keyframes\s+([a-zA-Z0-9-]+)/g;
  let m;
  while ((m = re.exec(css)) !== null) { kfs.add(m[1]); }
  return [...kfs].sort();
}
function readNewCSS(srcDir) {
  let css = '';
  const files = [];
  function scan(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fp = path.join(dir, item.name);
      if (item.isDirectory()) { scan(fp); }
      else if (item.name.endsWith('.css')) {
        css += '\n/* FILE: ' + fp + ' */\n' + fs.readFileSync(fp, 'utf8');
        files.push(fp);
      } else if (item.name.endsWith('.vue')) {
        const content = fs.readFileSync(fp, 'utf8');
        const sr = /<style[^>]*>([\s\S]*?)<\/style>/gi;
        let m;
        while ((m = sr.exec(content)) !== null) { css += '\n/* VUE: ' + fp + ' */\n' + m[1]; }
      }
    }
  }
  scan(srcDir);
  return { css, files };
}
console.log('[1] Reading old HTML...');
const oldHtml = fs.readFileSync(OLD_HTML, 'utf8');
const oldCSS = extractOldCSS(oldHtml);
console.log('[OK] Old CSS: ' + oldCSS.length + ' chars');
const oldVars = extractVars(oldCSS);
const oldSels = extractSelectors(oldCSS);
const oldMQ = extractMediaQueries(oldCSS);
const oldKF = extractKeyframes(oldCSS);
console.log('[OK] Old vars:' + oldVars.length + ' sels:' + oldSels.length + ' mq:' + oldMQ.length + ' kf:' + oldKF.length);
console.log('[2] Reading new CSS...');
const { css: newCSS, files: newFiles } = readNewCSS(NEW_SRC);
console.log('[OK] New CSS from ' + newFiles.length + ' files, ' + newCSS.length + ' chars');
const newVars = extractVars(newCSS);
const newSels = extractSelectors(newCSS);
const newMQ = extractMediaQueries(newCSS);
const newKF = extractKeyframes(newCSS);
console.log('[OK] New vars:' + newVars.length + ' sels:' + newSels.length + ' mq:' + newMQ.length + ' kf:' + newKF.length);
const oldVS = new Set(oldVars); const newVS = new Set(newVars);
const missVars = oldVars.filter(v => !newVS.has(v));
const extraVars = newVars.filter(v => !oldVS.has(v));
const oldSS = new Set(oldSels); const newSS = new Set(newSels);
const missSels = oldSels.filter(s => !newSS.has(s));
const extraSels = newSels.filter(s => !oldSS.has(s));
const oldMS = new Set(oldMQ); const newMS = new Set(newMQ);
const missMQ = oldMQ.filter(m => !newMS.has(m));
const oldKS = new Set(oldKF); const newKS = new Set(newKF);
const missKF = oldKF.filter(k => !newKS.has(k));
const result = {
  oldCSS: { vars: oldVars.length, selectors: oldSels.length, mediaQueries: oldMQ.length, keyframes: oldKF.length },
  newCSS: { vars: newVars.length, selectors: newSels.length, mediaQueries: newMQ.length, keyframes: newKF.length },
  missingVars, extraVars, missingSelectors: missSels, extraSelectors: extraSels,
  missingMediaQueries: missMQ, missingKeyframes: missKF, newFiles: newFiles.length
};
fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');
console.log('\n=== CSS DIFF RESULTS ===');
console.log('Missing vars: ' + missVars.length);
console.log('Extra vars: ' + extraVars.length);
console.log('Missing selectors: ' + missSels.length);
console.log('Extra selectors: ' + extraSels.length);
console.log('Missing media queries: ' + missMQ.length);
console.log('Missing keyframes: ' + missKF.length);
if (missVars.length > 0) { console.log('\n--- Missing CSS Variables ---'); missVars.forEach(v => console.log('  ' + v)); }
if (missKF.length > 0) { console.log('\n--- Missing Keyframes ---'); missKF.forEach(k => console.log('  ' + k)); }
if (missSels.length > 0 && missSels.length <= 50) { console.log('\n--- Missing Selectors ---'); missSels.forEach(s => console.log('  ' + s)); }
console.log('\n[OK] Full diff saved to ' + OUT);
