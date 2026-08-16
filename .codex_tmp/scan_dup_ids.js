const fs = require('fs');
const path = require('path');

function walk(dir) {
  let result = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const s = fs.statSync(p);
    if (s.isDirectory() && !p.includes('node_modules') && !p.includes('_audit') && !p.includes('.codex_tmp')) {
      result = result.concat(walk(p));
    } else if (f.endsWith('.vue')) {
      result.push(p);
    }
  }
  return result;
}

const files = walk('src');
const issues = [];

for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    const matches = line.match(/\sid="/g);
    if (matches && matches.length > 1) {
      issues.push(f + ':' + (i + 1) + ' has ' + matches.length + ' id attrs: ' + line.trim().substring(0, 120));
    }
  });
}

if (issues.length === 0) {
  console.log('No duplicate id issues found in any Vue files');
} else {
  console.log('ISSUES FOUND (' + issues.length + '):');
  issues.forEach(i => console.log(i));
}
