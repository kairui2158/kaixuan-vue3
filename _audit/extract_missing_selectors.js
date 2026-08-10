var fs = require('fs');
var AUDIT = 'D:/codex/novel-workshop-vue3/_audit';
var GLOBAL = 'D:/codex/novel-workshop-vue3/src/styles/global.css';
var OLD_DIR = 'C:/Users/凯瑞/Documents/New project 2';
var oldFiles = [
  OLD_DIR + '/style.css',
  OLD_DIR + '/styles/tokens.css',
  OLD_DIR + '/styles/components/app-layout.css',
  OLD_DIR + '/styles/components/buttons.css',
  OLD_DIR + '/styles/components/modal-panel.css',
  OLD_DIR + '/styles/components/form-editor.css'
];
var diff = JSON.parse(fs.readFileSync(AUDIT + '/css_diff.json', 'utf8'));
var missingSels = diff.missingSelectors || [];
console.log('[1] Missing selectors:', missingSels.length);
var allOldCss = '';
for (var i = 0; i < oldFiles.length; i++) {
  if (fs.existsSync(oldFiles[i])) { allOldCss += fs.readFileSync(oldFiles[i], 'utf8') + '\n'; }
}
console.log('[2] Old CSS chars:', allOldCss.length);
var globalContent = fs.readFileSync(GLOBAL, 'utf8');
var log = [];
var extracted = [];
var notFound = [];
for (var i = 0; i < missingSels.length; i++) {
  var sel = missingSels[i].trim();
  if (!sel) continue;
  var escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var patterns = [
    new RegExp('(^|\\n)\\s*' + escaped + '\\s*\\{[^}]*\\}', 'g'),
    new RegExp('(^|\\n)\\s*' + escaped + '\\s*,\\s*[^{]*\\{[^}]*\\}', 'g')
  ];
  var found = false;
  for (var p = 0; p < patterns.length; p++) {
    var m = patterns[p].exec(allOldCss);
    if (m) {
      var rule = m[0].trim();
      if (rule && !extracted.some(function(e) { return e.selector === sel; })) {
        extracted.push({ selector: sel, rule: rule });
        log.push({ item: sel, type: 'selector', target: 'global.css', method: 'extract_from_old', status: 'FIXED', ts: new Date().toISOString() });
        found = true;
        break;
      }
    }
  }
  if (!found) {
    var idx = allOldCss.indexOf(sel);
    if (idx !== -1) {
      var lineStart = allOldCss.lastIndexOf('\n', idx) + 1;
      var braceIdx = allOldCss.indexOf('{', idx);
      if (braceIdx !== -1) {
        var depth = 1;
        var endIdx = braceIdx + 1;
        while (endIdx < allOldCss.length && depth > 0) {
          if (allOldCss[endIdx] === '{') depth++;
          if (allOldCss[endIdx] === '}') depth--;
          endIdx++;
        }
        var rule2 = allOldCss.substring(lineStart, endIdx).trim();
        if (rule2 && !extracted.some(function(e) { return e.selector === sel; })) {
          extracted.push({ selector: sel, rule: rule2 });
          log.push({ item: sel, type: 'selector', target: 'global.css', method: 'manual_extract', status: 'FIXED', ts: new Date().toISOString() });
          found = true;
        }
      }
    }
  }
  if (!found) { notFound.push(sel); }
}
console.log('[3] Extracted:', extracted.length, 'Not found:', notFound.length);
var append = '\n\n/* ===== CSS Fix: Missing selectors from old architecture ===== */\n';
for (var i = 0; i < extracted.length; i++) {
  append += '\n' + extracted[i].rule + '\n';
}
globalContent += append;
fs.writeFileSync(GLOBAL, globalContent, 'utf8');
console.log('[OK] Appended ' + extracted.length + ' selector rules to global.css');
if (notFound.length > 0) {
  console.log('[WARN] Not found selectors (first 20):');
  notFound.slice(0, 20).forEach(function(s) { console.log('  ' + s); });
  fs.writeFileSync(AUDIT + '/css_selectors_not_found.json', JSON.stringify(notFound, null, 2), 'utf8');
}
var existingLog = [];
try { existingLog = JSON.parse(fs.readFileSync(AUDIT + '/css_fix_applied_log.json', 'utf8')); } catch(e) {}
existingLog = existingLog.concat(log);
fs.writeFileSync(AUDIT + '/css_fix_applied_log.json', JSON.stringify(existingLog, null, 2), 'utf8');
console.log('[OK] Log updated: ' + existingLog.length + ' total entries');
console.log('[OK] Done!');
