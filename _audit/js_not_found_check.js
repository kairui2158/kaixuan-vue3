const fs = require('fs');
const path = require('path');

const AUDIT_DIR = __dirname;
const OLD_DIR = 'C:\\Users\\凯瑞\\Documents\\New project 2';

const classData = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, 'js_func_classification.json'), 'utf8'));
const notFound = classData.categories.NOT_FOUND;

const panelsSrc = fs.readFileSync(path.join(OLD_DIR, 'panels.js'), 'utf8');
const rendererSrc = fs.readFileSync(path.join(OLD_DIR, 'renderer_v2.js'), 'utf8');

console.log('[INFO] Checking ' + notFound.length + ' NOT_FOUND functions...\n');

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'); }

for (const m of notFound) {
  const name = m.name;
  const src = m.oldFile === 'panels.js' ? panelsSrc : rendererSrc;
  const escaped = escapeRegex(name);

  // Search for the name anywhere in the file
  const regex = new RegExp('\\b' + escaped + '\\b', 'g');
  const matches = [];
  let match;
  while ((match = regex.exec(src)) !== null) {
    const start = Math.max(0, match.index - 40);
    const end = Math.min(src.length, match.index + name.length + 80);
    const context = src.substring(start, end).replace(/\n/g, ' ').replace(/\r/g, '');
    matches.push(context);
  }

  console.log(m.name + ' (from ' + m.oldFile + '): ' + matches.length + ' occurrences');
  matches.forEach((ctx, i) => {
    if (i < 3) console.log('  [' + (i+1) + '] ...' + ctx + '...');
  });
}
