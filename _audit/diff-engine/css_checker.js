const fs = require('fs');
const path = require('path');
const OUT = 'D:/codex/novel-workshop-vue3/_audit/diff-engine';
const OLD_CSS = 'C:/Users/凯瑞/Documents/New project 2/style.css';
const NEW_CSS_DIR = 'D:/codex/novel-workshop-vue3/src/styles';

const oldCss = fs.readFileSync(OLD_CSS, 'utf8');
const newCssFiles = fs.readdirSync(NEW_CSS_DIR).filter(f => f.endsWith('.css'));
let newCss = '';
for (const f of newCssFiles) newCss += fs.readFileSync(path.join(NEW_CSS_DIR, f), 'utf8') + '\n';

function extractVars(css) {
  const vars = new Set();
  const re = /--([a-zA-Z0-9_-]+)\s*:/g;
  let m;
  while ((m = re.exec(css)) !== null) vars.add(m[1]);
  return vars;
}

function extractSelectors(css) {
  const selectors = new Set();
  const re = /([^{}]+)\{/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const parts = m[1].split(',').map(s => s.trim()).filter(s => s && !s.startsWith('@') && !s.includes('$'));
    for (const p of parts) selectors.add(p);
  }
  return selectors;
}

const oldVars = extractVars(oldCss);
const newVars = extractVars(newCss);
const oldSelectors = extractSelectors(oldCss);
const newSelectors = extractSelectors(newCss);

const missingVars = [...oldVars].filter(v => !newVars.has(v));
const missingSelectors = [...oldSelectors].filter(s => !newSelectors.has(s));
const extraSelectors = [...newSelectors].filter(s => !oldSelectors.has(s));

const report = {
  old_var_count: oldVars.size,
  new_var_count: newVars.size,
  missing_vars: missingVars.length,
  vars_matched: oldVars.size - missingVars.length,
  old_selector_count: oldSelectors.size,
  new_selector_count: newSelectors.size,
  missing_selectors: missingSelectors.length,
  extra_selectors: extraSelectors.length,
  selectors_matched: oldSelectors.size - missingSelectors.length,
  match_rate: ((oldSelectors.size - missingSelectors.length) / Math.max(oldSelectors.size, 1) * 100).toFixed(1) + '%',
  missing_var_list: missingVars.slice(0, 50),
  missing_selector_list: missingSelectors.slice(0, 100),
  extra_selector_list: extraSelectors.slice(0, 50),
  old_css_lines: oldCss.split('\n').length,
  new_css_lines: newCss.split('\n').length,
  new_css_files: newCssFiles
};

fs.writeFileSync(path.join(OUT, 'css_diff_report.json'), JSON.stringify(report, null, 2));

let md = '# CSS Regression Report (P16)\n\n';
md += '## Summary\n\n';
md += '| Metric | Old | New | Matched | Missing |\n';
md += '|--------|-----|-----|---------|---------|\n';
md += '| CSS Variables | ' + oldVars.size + ' | ' + newVars.size + ' | ' + report.vars_matched + ' | ' + missingVars.length + ' |\n';
md += '| Selectors | ' + oldSelectors.size + ' | ' + newSelectors.size + ' | ' + report.selectors_matched + ' | ' + missingSelectors.length + ' |\n';
md += '| CSS Lines | ' + report.old_css_lines + ' | ' + report.new_css_lines + ' | - | - |\n\n';
md += 'Match rate: ' + report.match_rate + '\n\n';
md += 'New CSS files: ' + newCssFiles.join(', ') + '\n\n';

if (missingVars.length > 0) {
  md += '## Missing CSS Variables (' + missingVars.length + ')\n\n';
  for (const v of missingVars.slice(0, 50)) md += '- --' + v + '\n';
  md += '\n';
}

if (missingSelectors.length > 0) {
  md += '## Missing Selectors (' + missingSelectors.length + ')\n\n';
  for (const s of missingSelectors.slice(0, 100)) md += '- ' + s + '\n';
  md += '\n';
}

if (extraSelectors.length > 0) {
  md += '## Extra New Selectors (' + extraSelectors.length + ')\n\n';
  for (const s of extraSelectors.slice(0, 30)) md += '- ' + s + '\n';
}

fs.writeFileSync(path.join(OUT, 'css_diff_report.md'), md);
console.log('CSS diff done:', JSON.stringify({ vars: oldVars.size, selectors: oldSelectors.size, missing_vars: missingVars.length, missing_selectors: missingSelectors.length, match_rate: report.match_rate }));
