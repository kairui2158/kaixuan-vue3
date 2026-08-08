const fs = require('fs');
const STYLE_PATH = 'style.css';
let content = fs.readFileSync(STYLE_PATH, 'utf8');
const lines = content.split(String.fromCharCode(10));
const beforeLines = lines.length;
const beforeImp = (content.match(/!important/g) || []).length;
console.log('[BEFORE] lines=' + beforeLines + ' !important=' + beforeImp);

let i = 0;
const blocks = [];
while (i < lines.length) {
  const line = lines[i];
  const oi = line.indexOf('{');
  if (oi >= 0) {
    const sel = line.substring(0, oi).trim();
    let d = 1;
    const afterBrace = line.substring(oi + 1);
    d -= (afterBrace.match(/}/g) || []).length;
    let j = i;
    if (d > 0) {
      j = i + 1;
      while (j < lines.length && d > 0) {
        d += (lines[j].match(/{/g) || []).length;
        d -= (lines[j].match(/}/g) || []).length;
        if (d === 0) break;
        j++;
      }
    }
    blocks.push({ sel, start: i, end: j });
    i = j + 1;
  } else { i++; }
}

const formPatterns = /^(input|textarea|select|\.form-|\.field-|\.editor-|\.tab-nav|\.tab-item|\.tab-content|\.tab-hidden|\.tree-|\.sidebar-btn|\.sidebar-divider|\.header-left|\.header-right|\.agent-selector|#breadcrumb|\.breadcrumb|\.chat-|\.chat-input|\.chat-message|\.chat-empty|\.find-close|#find-replace|\.editor-find|::selection)/;

const deleteRanges = [];
const lineMods = [];
let delCount = 0, modCount = 0;

for (const b of blocks) {
  if (b.sel.startsWith('@')) continue;
  const parts = b.sel.split(',').map(s => s.trim());
  const hasForm = parts.some(p => formPatterns.test(p));
  if (!hasForm) continue;
  const allForm = parts.every(p => formPatterns.test(p) || p.startsWith('/*') || p.length === 0);
  let impCount = 0;
  for (let li = b.start; li <= b.end; li++) {
    impCount += (lines[li].match(/!important/g) || []).length;
  }
  if (allForm) {
    deleteRanges.push({ s: b.start, e: b.end });
    delCount++;
  } else if (impCount > 0) {
    for (let li = b.start; li <= b.end; li++) {
      if (lines[li].includes('!important')) {
        lineMods.push({ idx: li, newLine: lines[li].replace(/\s*!important/g, '') });
      }
    }
    modCount++;
  }
}

const delSet = new Set();
for (const r of deleteRanges) {
  for (let i2 = r.s; i2 <= r.e; i2++) delSet.add(i2);
}
const newLines = [];
for (let i2 = 0; i2 < lines.length; i2++) {
  if (delSet.has(i2)) continue;
  const m = lineMods.find(x => x.idx === i2);
  newLines.push(m ? m.newLine : lines[i2]);
}
const newContent = newLines.join(String.fromCharCode(10));
const afterLines = newLines.length;
const afterImp = (newContent.match(/!important/g) || []).length;
const openB = (newContent.match(/{/g) || []).length;
const closeB = (newContent.match(/}/g) || []).length;

console.log('[AFTER] lines=' + afterLines + ' !important=' + afterImp);
console.log('[DELTA] lines=' + (afterLines - beforeLines) + ' !important=' + (afterImp - beforeImp));
console.log('[STATS] deleted=' + delCount + ' modified=' + modCount);
console.log('[BRACE] {' + openB + ' }' + closeB + ' diff=' + (openB - closeB));

if (openB !== closeB) {
  console.error('[ERR] BRACE IMBALANCE');
  process.exit(1);
}
fs.writeFileSync(STYLE_PATH, newContent, 'utf8');
console.log('[OK] style.css written');

try {
  fs.appendFileSync('lessons/ERROR_LOG.md', '\n## ' + new Date().toISOString() + ' Form module cleanup\n- Deleted: ' + delCount + ' pure form blocks\n- Modified: ' + modCount + ' mixed blocks (removed !important)\n- Lines: ' + beforeLines + ' -> ' + afterLines + '\n- !important: ' + beforeImp + ' -> ' + afterImp + '\n- Brace balance: 0\n- Status: PASS\n', 'utf8');
  console.log('[OK] logged');
} catch (e) {}
