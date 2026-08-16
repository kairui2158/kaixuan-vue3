const fs = require('fs');
const path = require('path');
const DIR = 'D:/codex/novel-workshop-vue3/_audit/diff-engine/';
const matrix = JSON.parse(fs.readFileSync(path.join(DIR, 'diff_matrix_v2.json'), 'utf8'));
console.log('[P19] diff_matrix_v2.json loaded:', matrix.rules.length, 'rules');
const P0_KEYWORDS = ['polyfill', 'JSON.parse', 'storageRead', '闪退', 'crash', '无法打开', '致命', 'fatal'];
const P1_KEYWORDS = ['persist', '持久化', 'localStorage', 'store', '保存', 'save', 'DESYNC', '不同步', '丢失', 'data loss', 'contextIsolation', 'nodeIntegration', 'safeStorage', 'encrypt', 'decrypt', 'IPC', 'preload'];
const P2_KEYWORDS = ['temperature', 'maxTokens', '默认值', 'default', 'baseUrl', 'purpose', '0.7', '128000'];
const P3_KEYWORDS = ['动画', 'animation', '交互', 'interaction', '反馈', 'feedback', '样式', 'style', 'transition'];
function classify(entry) {
  if (entry.status === 'MATCH') return 'MATCH';
  if (entry.status === 'ACCEPTABLE') return 'P4';
  const text = (entry.rule_text + ' ' + entry.detail + ' ' + entry.rule_id).toLowerCase();
  for (const kw of P0_KEYWORDS) { if (text.includes(kw.toLowerCase())) return 'P0'; }
  if (entry.type === 'behavior' && entry.status === 'MISSING') {
    if (entry.layer === 'T03' || entry.layer === 'T04' || entry.layer === 'T12') return 'P0';
    return 'P1';
  }
  if (entry.type === 'state' && entry.status === 'MISSING') {
    if (entry.classification === 'REAL_DEFECT') return 'P0';
    return 'P1';
  }
  if (entry.status === 'MISMATCH') return 'P2';
  if (entry.type === 'value' && entry.status === 'MISSING') {
    for (const kw of P2_KEYWORDS) { if (text.includes(kw.toLowerCase())) return 'P2'; }
    return 'P3';
  }
  if (entry.type === 'existence' && entry.status === 'MISSING') {
    for (const kw of P1_KEYWORDS) { if (text.includes(kw.toLowerCase())) return 'P1'; }
    for (const kw of P2_KEYWORDS) { if (text.includes(kw.toLowerCase())) return 'P2'; }
    if (entry.classification === 'FALSE_POSITIVE') return 'P4';
    return 'P3';
  }
  for (const kw of P3_KEYWORDS) { if (text.includes(kw.toLowerCase())) return 'P3'; }
  return 'P3';
}
const prioritized = [];
const counts = { P0: 0, P1: 0, P2: 0, P3: 0, P4: 0, MATCH: 0 };
for (const entry of matrix.rules) {
  const priority = classify(entry);
  counts[priority]++;
  prioritized.push({ ...entry, priority });
}
if (matrix.css_report) { const p = classify(matrix.css_report); counts[p]++; prioritized.push({ ...matrix.css_report, priority: p }); }
if (matrix.ipc_report) { const p = classify(matrix.ipc_report); counts[p]++; prioritized.push({ ...matrix.ipc_report, priority: p }); }
prioritized.sort((a, b) => {
  const order = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, MATCH: 5 };
  return (order[a.priority] || 9) - (order[b.priority] || 9);
});
const output = { total: prioritized.length, counts, items: prioritized };
fs.writeFileSync(path.join(DIR, 'fix_priority_v2.json'), JSON.stringify(output, null, 2), 'utf8');
console.log('[P19] fix_priority_v2.json written');
console.log('[P19] Summary:');
console.log('  Total:', prioritized.length);
console.log('  P0-致命:', counts.P0);
console.log('  P1-严重:', counts.P1);
console.log('  P2-中等:', counts.P2);
console.log('  P3-轻微:', counts.P3);
console.log('  P4-可接受:', counts.P4);
console.log('  MATCH:', counts.MATCH);
console.log('[P19] P0 items:');
for (const item of prioritized.filter(i => i.priority === 'P0')) {
  console.log('  ', item.rule_id, '|', item.layer, '|', item.rule_text.slice(0, 80));
}
console.log('[P19] VERIFICATION: non-MATCH items with priority =', prioritized.filter(i => i.priority !== 'MATCH').length, '(expected', prioritized.length - counts.MATCH, ')');
