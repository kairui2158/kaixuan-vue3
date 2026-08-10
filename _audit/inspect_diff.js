const fs = require('fs');
const path = require('path');
const diffPath = path.join(__dirname, 'html_diff.json');
const raw = fs.readFileSync(diffPath, 'utf8');
const data = JSON.parse(raw);
console.log('Top-level keys:', Object.keys(data));
console.log('missing length:', data.missing.length);
if (data.missing.length > 0) {
  console.log('First item keys:', Object.keys(data.missing[0]));
  console.log('First 3 items:', JSON.stringify(data.missing.slice(0, 3), null, 2));
}
const byComp = {};
data.missing.forEach(item => {
  const id = item.id || '?';
  const ctx = item.ctx || '';
  const m = ctx.match(/([A-Za-z]+\.vue)/);
  const comp = m ? m[1] : 'unknown';
  if (!byComp[comp]) byComp[comp] = [];
  byComp[comp].push(id);
});
console.log('\n=== By component ===');
Object.keys(byComp).sort().forEach(c => {
  console.log(c + ' (' + byComp[c].length + '): ' + byComp[c].join(', '));
});
console.log('\n=== All missing IDs ===');
data.missing.forEach(item => {
  console.log(item.id + ' | ' + item.tag + ' | ' + (item.ctx || '').substring(0, 80).replace(/\n/g, ' '));
});
