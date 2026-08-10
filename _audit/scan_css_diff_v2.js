const fs = require('fs');
const path = require('path');
const OLD_DIR = 'C:\\Users\\凯瑞\\Documents\\New project 2';
const NEW_SRC = 'D:\\codex\\novel-workshop-vue3\\src';
const OUT = 'D:\\codex\\novel-workshop-vue3\\_audit\\css_diff.json';
// Read old CSS from external files referenced in HTML
function readOldCSS(dir) {
  const html = fs.readFileSync(path.join(dir, 'renderer.html'), 'utf8');
  const linkRe = /<link[^>]+href=["']([^"']+\.css)["']/gi;
  const cssFiles = [];
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    if (!m[1].includes('node_modules')) cssFiles.push(m[1]);
  }
  let css = '';
  const used = [];
  for (const relPath of cssFiles) {
    const abs = path.resolve(dir, relPath);
    if (fs.existsSync(abs)) {
      css += '\n/* FILE: ' + relPath + ' */\n' + fs.readFileSync(abs, 'utf8');
      used.push(relPath);
    }
  }
  return { css: css, files: used };
}
function extractVars(css) {
  const vars = new Set();
  const re = /(--[a-zA-Z0-9-]+)\s*:/g;
  let m;
  while ((m = re.exec(css)) !== null) vars.add(m[1]);
  return [...vars].sort();
}
function extractSelectors(css) {
  const selectors = new Set();
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = clean.split('{');
  for (let i = 0; i < blocks.length - 1; i++) {
    var raw = blocks[i];
    var lastClose = raw.lastIndexOf('}');
    if (lastClose !== -1) raw = raw.substring(lastClose + 1);
    var sel = raw.trim();
    if (sel && !sel.startsWith('@')) {
      sel.split(',').forEach(function(s) {
        var t = s.trim().replace(/\s+/g, ' ');
        if (t && !t.startsWith('@') && !t.startsWith('}') && !t.startsWith('/*')) selectors.add(t);
      });
    }
  }
  return [...selectors].sort();
}
function extractMediaQueries(css) {
  const mqs = new Set();
  const re = /@media\s+[^{]+/g;
  let m;
  while ((m = re.exec(css)) !== null) mqs.add(m[0].trim());
  return [...mqs].sort();
}
function extractKeyframes(css) {
  const kfs = new Set();
  const re = /@keyframes\s+([a-zA-Z0-9-]+)/g;
  let m;
  while ((m = re.exec(css)) !== null) kfs.add(m[1]);
  return [...kfs].sort();
}
function readNewCSS(srcDir) {
  let css = '';
  var files = [];
  function scan(dir) {
    var items = fs.readdirSync(dir, { withFileTypes: true });
    for (var item of items) {
      var fp = path.join(dir, item.name);
      if (item.isDirectory()) scan(fp);
      else if (item.name.endsWith('.css')) {
        css += '\n/* FILE: ' + fp + ' */\n' + fs.readFileSync(fp, 'utf8');
        files.push(fp);
      } else if (item.name.endsWith('.vue')) {
        var content = fs.readFileSync(fp, 'utf8');
        var sr = /<style[^>]*>([\s\S]*?)<\/style>/gi;
        var m2;
        while ((m2 = sr.exec(content)) !== null) css += '\n/* VUE: ' + fp + ' */\n' + m2[1];
      }
    }
  }
  scan(srcDir);
  return { css: css, files: files };
}
console.log('[1] Reading old architecture CSS files...');
var oldResult = readOldCSS(OLD_DIR);
var oldCSS = oldResult.css;
console.log('[OK] Old CSS from ' + oldResult.files.length + ' files: ' + oldCSS.length + ' chars');
oldResult.files.forEach(function(f) { console.log('  - ' + f); });
var oldVars = extractVars(oldCSS);
var oldSels = extractSelectors(oldCSS);
var oldMQ = extractMediaQueries(oldCSS);
var oldKF = extractKeyframes(oldCSS);
console.log('[OK] Old vars:' + oldVars.length + ' sels:' + oldSels.length + ' mq:' + oldMQ.length + ' kf:' + oldKF.length);
console.log('[2] Reading new architecture CSS...');
var newResult = readNewCSS(NEW_SRC);
var newCSS = newResult.css;
console.log('[OK] New CSS from ' + newResult.files.length + ' files, ' + newCSS.length + ' chars');
var newVars = extractVars(newCSS);
var newSels = extractSelectors(newCSS);
var newMQ = extractMediaQueries(newCSS);
var newKF = extractKeyframes(newCSS);
console.log('[OK] New vars:' + newVars.length + ' sels:' + newSels.length + ' mq:' + newMQ.length + ' kf:' + newKF.length);
var oldVS = new Set(oldVars); var newVS = new Set(newVars);
var missVars = oldVars.filter(function(v) { return !newVS.has(v); });
var extraVars = newVars.filter(function(v) { return !oldVS.has(v); });
var oldSS = new Set(oldSels); var newSS = new Set(newSels);
var missSels = oldSels.filter(function(s) { return !newSS.has(s); });
var extraSels = newSels.filter(function(s) { return !oldSS.has(s); });
var oldMS = new Set(oldMQ); var newMS = new Set(newMQ);
var missMQ = oldMQ.filter(function(m) { return !newMS.has(m); });
var oldKS = new Set(oldKF); var newKS = new Set(newKF);
var missKF = oldKF.filter(function(k) { return !newKS.has(k); });
var result = {
  oldCSS: { vars: oldVars.length, selectors: oldSels.length, mediaQueries: oldMQ.length, keyframes: oldKF.length },
  newCSS: { vars: newVars.length, selectors: newSels.length, mediaQueries: newMQ.length, keyframes: newKF.length },
  missingVars: missVars,
  extraVars: extraVars,
  missingSelectors: missSels,
  extraSelectors: extraSels,
  missingMediaQueries: missMQ,
  missingKeyframes: missKF,
  oldFiles: oldResult.files,
  newFiles: newResult.files.length
};
fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');
console.log('\n=== CSS DIFF RESULTS ===');
console.log('Missing vars: ' + missVars.length);
console.log('Extra vars: ' + extraVars.length);
console.log('Missing selectors: ' + missSels.length);
console.log('Extra selectors: ' + extraSels.length);
console.log('Missing media queries: ' + missMQ.length);
console.log('Missing keyframes: ' + missKF.length);
if (missVars.length > 0) {
  console.log('\n--- Missing CSS Variables ---');
  missVars.forEach(function(v) { console.log('  ' + v); });
}
if (missKF.length > 0) {
  console.log('\n--- Missing Keyframes ---');
  missKF.forEach(function(k) { console.log('  ' + k); });
}
if (missSels.length > 0 && missSels.length <= 80) {
  console.log('\n--- Missing Selectors (first 80) ---');
  missSels.forEach(function(s) { console.log('  ' + s); });
}
console.log('\n[OK] Full diff saved to ' + OUT);
