const fs = require('fs');
const path = require('path');

const OLD_HTML = 'C:/Users/凯瑞/Documents/New project 2/renderer.html';
const COMP_DIR = 'D:/codex/novel-workshop-vue3/src/components';
const APP_VUE = 'D:/codex/novel-workshop-vue3/src/App.vue';
const AUDIT_DIR = 'D:/codex/novel-workshop-vue3/_audit';

// --- Scan old HTML for all id= attributes ---
const html = fs.readFileSync(OLD_HTML, 'utf8');
const idRe = /\sid=["']([^"']+)["']/g;
let m;
const oldIds = [];
while ((m = idRe.exec(html)) !== null) {
  const id = m[1];
  const matchStart = m.index;
  // Find tag start
  let tagStart = matchStart;
  while (tagStart > 0 && html[tagStart] !== '<') tagStart--;
  // Find tag end
  let tagEnd = matchStart + m[0].length;
  while (tagEnd < html.length && html[tagEnd] !== '>') tagEnd++;
  const tagContent = html.slice(tagStart, tagEnd + 1);
  const tagMatch = tagContent.match(/^<(\w+)/);
  const tag = tagMatch ? tagMatch[1] : 'unknown';
  const clsMatch = tagContent.match(/class=["']([^"']*)["']/);
  const cls = clsMatch ? clsMatch[1] : '';
  const line = html.slice(0, matchStart).split('\n').length;
  // Get surrounding text for context
  const ctxStart = Math.max(0, tagStart - 80);
  const ctxEnd = Math.min(html.length, tagEnd + 80);
  const context = html.slice(ctxStart, ctxEnd).replace(/\s+/g, ' ').trim();
  oldIds.push({ id, tag, cls, line, context });
}

// --- Scan all Vue files for id= attributes ---
function walkDir(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (entry.name.endsWith('.vue') || entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

const vueFiles = [APP_VUE, ...walkDir(COMP_DIR)];
const newIds = [];
for (const file of vueFiles) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  const re = /\sid=["']([^"']+)["']/g;
  let mm;
  while ((mm = re.exec(content)) !== null) {
    const id = mm[1];
    const line = content.slice(0, mm.index).split('\n').length;
    const relFile = path.relative('D:/codex/novel-workshop-vue3/src', file);
    newIds.push({ id, file: relFile, line });
  }
}

// --- Also scan for ref= and data-testid= as partial matches ---
const oldClasses = new Set();
const clsRe = /class=["']([^"']*)["']/g;
let cm;
while ((cm = clsRe.exec(html)) !== null) {
  cm[1].split(/\s+/).forEach(c => { if (c) oldClasses.add(c); });
}

// --- Compute diff ---
const oldSet = new Set(oldIds.map(x => x.id));
const newSet = new Set(newIds.map(x => x.id));
const missing = [...oldSet].filter(id => !newSet.has(id)).sort();
const extra = [...newSet].filter(id => !oldSet.has(id)).sort();

// --- Build missing ID context map ---
const missingCtx = missing.map(id => {
  const o = oldIds.find(x => x.id === id);
  return o ? { id, tag: o.tag, cls: o.cls, line: o.line, context: o.context } : { id };
});

// --- Write outputs ---
fs.writeFileSync(path.join(AUDIT_DIR, 'old_html_ids.json'), JSON.stringify(oldIds, null, 2));
fs.writeFileSync(path.join(AUDIT_DIR, 'new_vue_ids.json'), JSON.stringify(newIds, null, 2));
fs.writeFileSync(path.join(AUDIT_DIR, 'html_diff.json'), JSON.stringify({
  oldCount: oldIds.length,
  newCount: newIds.length,
  missingCount: missing.length,
  extraCount: extra.length,
  missing,
  extra,
  missingCtx
}, null, 2));

// --- Console summary ---
console.log('[OK] Old HTML IDs:', oldIds.length);
console.log('[OK] New Vue IDs:', newIds.length);
console.log('[OK] Missing in new:', missing.length);
console.log('[OK] Extra in new:', extra.length);
console.log('[OK] Vue files scanned:', vueFiles.length);
console.log('[OK] Files written: old_html_ids.json, new_vue_ids.json, html_diff.json');

// --- Print first 30 missing IDs for quick review ---
console.log('\n--- First 30 Missing IDs ---');
missingCtx.slice(0, 30).forEach((m, i) => {
  console.log(`${i+1}. id=${m.id} tag=${m.tag||'?'} cls="${m.cls||''}" line=${m.line||'?'} ctx=${(m.context||'').slice(0,100)}`);
});
if (missingCtx.length > 30) {
  console.log(`... and ${missingCtx.length - 30} more`);
}
