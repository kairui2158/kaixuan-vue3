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
console.log('[1] Remaining missing selectors:', missingSels.length);
var allOldCss = '';
for (var i = 0; i < oldFiles.length; i++) {
  if (fs.existsSync(oldFiles[i])) { allOldCss += fs.readFileSync(oldFiles[i], 'utf8') + '\n'; }
}
var globalContent = fs.readFileSync(GLOBAL, 'utf8');
var log = [];
var extracted = [];
for (var i = 0; i < missingSels.length; i++) {
  var sel = missingSels[i].trim().replace(/^\\n+/, '');
  if (!sel) continue;
  var idx = allOldCss.indexOf(sel);
  if (idx === -1) {
    var cleanSel = sel.replace(/["\\[\\]]/g, '');
    idx = allOldCss.indexOf(cleanSel);
  }
  if (idx !== -1) {
    var lineStart = allOldCss.lastIndexOf('\n', idx) + 1;
    var braceIdx = allOldCss.indexOf('{', idx);
    if (braceIdx !== -1 && braceIdx - idx < 200) {
      var depth = 1;
      var endIdx = braceIdx + 1;
      while (endIdx < allOldCss.length && depth > 0) {
        if (allOldCss[endIdx] === '{') depth++;
        if (allOldCss[endIdx] === '}') depth--;
        endIdx++;
      }
      var rule = allOldCss.substring(lineStart, endIdx).trim();
      if (rule && globalContent.indexOf(rule) === -1) {
        extracted.push(rule);
        log.push({ item: sel, type: 'selector', target: 'global.css', method: 'manual_remaining', status: 'FIXED', ts: new Date().toISOString() });
      }
    }
  }
}
console.log('[2] Extracted:', extracted.length, '/', missingSels.length);
var append = '\n\n/* ===== CSS Fix: Remaining missing selectors from old architecture ===== */\n';
for (var i = 0; i < extracted.length; i++) { append += '\n' + extracted[i] + '\n'; }
globalContent += append;
fs.writeFileSync(GLOBAL, globalContent, 'utf8');
var existingLog = [];
try { existingLog = JSON.parse(fs.readFileSync(AUDIT + '/css_fix_applied_log.json', 'utf8')); } catch(e) {}
existingLog = existingLog.concat(log);
fs.writeFileSync(AUDIT + '/css_fix_applied_log.json', JSON.stringify(existingLog, null, 2), 'utf8');
console.log('[OK] Appended ' + extracted.length + ' rules. Log: ' + existingLog.length + ' entries');
console.log('[OK] Done!');
