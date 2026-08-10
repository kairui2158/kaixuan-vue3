var fs = require('fs');
var AUDIT = 'D:/codex/novel-workshop-vue3/_audit';
var GLOBAL = 'D:/codex/novel-workshop-vue3/src/styles/global.css';
var OLD_DIR = 'C:/Users/凯瑞/Documents/New project 2';
var oldFiles = [
  OLD_DIR + '/renderer.html',
  OLD_DIR + '/style.css',
  OLD_DIR + '/styles/tokens.css',
  OLD_DIR + '/styles/components/app-layout.css',
  OLD_DIR + '/styles/components/buttons.css',
  OLD_DIR + '/styles/components/modal-panel.css',
  OLD_DIR + '/styles/components/form-editor.css'
];
var allOldCss = '';
for (var i = 0; i < oldFiles.length; i++) {
  if (fs.existsSync(oldFiles[i])) { allOldCss += fs.readFileSync(oldFiles[i], 'utf8') + '\n'; }
}
var globalContent = fs.readFileSync(GLOBAL, 'utf8');
var remaining = [
  '#agent-form input[type="number"]',
  '#agent-form textarea',
  '#btn-export-epub',
  '#btn-export-md',
  '#btn-export-txt',
  '#btn-redo',
  '#btn-undo',
  '#skill-form input[type="number"]',
  '.form-group) select',
  '.form-group) textarea',
  '.no-data',
  '.resizer-h',
  'input:focus-visible',
  'textarea:focus-visible'
];
var log = [];
var extracted = [];
var seen = {};
for (var i = 0; i < remaining.length; i++) {
  var sel = remaining[i];
  var searchSel = sel.replace(/"/g, '\\"');
  var idx = allOldCss.indexOf(sel);
  if (idx === -1) {
    var alt = sel.replace(/"/g, '');
    idx = allOldCss.indexOf(alt);
  }
  if (idx === -1) {
    var alt2 = sel.replace(/["\\[\\]]/g, '');
    idx = allOldCss.indexOf(alt2);
  }
  if (idx === -1) { console.log('[NOT FOUND] ' + sel); continue; }
  var lineStart = allOldCss.lastIndexOf('\n', idx) + 1;
  var braceIdx = allOldCss.indexOf('{', idx);
  if (braceIdx === -1 || braceIdx - idx > 500) { console.log('[NO BRACE] ' + sel); continue; }
  var depth = 1;
  var endIdx = braceIdx + 1;
  while (endIdx < allOldCss.length && depth > 0) {
    if (allOldCss[endIdx] === '{') depth++;
    if (allOldCss[endIdx] === '}') depth--;
    endIdx++;
  }
  var rule = allOldCss.substring(lineStart, endIdx).trim();
  var key = rule.substring(0, 80);
  if (!seen[key]) {
    seen[key] = true;
    extracted.push(rule);
    log.push({ item: sel, type: 'selector', target: 'global.css', method: 'group_rule_extract', status: 'FIXED', ts: new Date().toISOString() });
    console.log('[OK] ' + sel + ' -> rule length: ' + rule.length);
  } else {
    console.log('[SKIP DUP] ' + sel);
  }
}
var append = '\n\n/* ===== CSS Fix: Final remaining selectors (group rules) from old architecture ===== */\n';
for (var i = 0; i < extracted.length; i++) { append += '\n' + extracted[i] + '\n'; }
globalContent += append;
fs.writeFileSync(GLOBAL, globalContent, 'utf8');
var existingLog = [];
try { existingLog = JSON.parse(fs.readFileSync(AUDIT + '/css_fix_applied_log.json', 'utf8')); } catch(e) {}
existingLog = existingLog.concat(log);
fs.writeFileSync(AUDIT + '/css_fix_applied_log.json', JSON.stringify(existingLog, null, 2), 'utf8');
console.log('[OK] Appended ' + extracted.length + ' group rules. Log: ' + existingLog.length + ' total entries');
console.log('[OK] Done!');
