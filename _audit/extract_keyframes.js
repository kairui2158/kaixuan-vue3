var fs = require('fs');
var path = require('path');
var OLD_DIR = 'C:/Users/凯瑞/Documents/New project 2';
var oldFiles = [
  OLD_DIR + '/style.css',
  OLD_DIR + '/styles/tokens.css',
  OLD_DIR + '/styles/components/app-layout.css',
  OLD_DIR + '/styles/components/buttons.css',
  OLD_DIR + '/styles/components/modal-panel.css',
  OLD_DIR + '/styles/components/form-editor.css'
];
var missingKf = ['bubbleIn','modal-in','slideIn','toastSlide','wh-fade-in','wh-modal-in','wh-modal-out','wh-panel-slide-in','wh-spin','wh-toast-slide-in','wh-toast-slide-out'];
var allOldCss = '';
for (var i = 0; i < oldFiles.length; i++) {
  if (fs.existsSync(oldFiles[i])) { allOldCss += fs.readFileSync(oldFiles[i], 'utf8') + '\n'; }
}
console.log('[1] Old CSS total chars:', allOldCss.length);
var found = {};
for (var i = 0; i < missingKf.length; i++) {
  var name = missingKf[i];
  var patterns = [
    '@keyframes\\s+' + name + '[\\s\\S]*?\\}\\s*\\}',
    '@keyframes\\s+' + name + '\\s*\\{[^}]*\\}'
  ];
  for (var p = 0; p < patterns.length; p++) {
    var re = new RegExp(patterns[p], 'g');
    var m = re.exec(allOldCss);
    if (m) {
      found[name] = m[0];
      console.log('[OK] Found keyframe:', name, '(' + m[0].length + ' chars)');
      break;
    }
  }
  if (!found[name]) {
    var idx = allOldCss.indexOf('@keyframes ' + name);
    if (idx !== -1) {
      var chunk = allOldCss.substring(idx, idx + 500);
      var depth = 0;
      var endIdx = 0;
      for (var c = 0; c < chunk.length; c++) {
        if (chunk[c] === '{') depth++;
        if (chunk[c] === '}') depth--;
        if (depth === 0 && c > 0) { endIdx = c + 1; break; }
      }
      if (endIdx > 0) {
        found[name] = chunk.substring(0, endIdx);
        console.log('[OK] Found keyframe (manual):', name, '(' + found[name].length + ' chars)');
      } else { console.log('[WARN] Not found:', name); }
    } else { console.log('[WARN] Not found:', name); }
  }
}
var GLOBAL = 'D:/codex/novel-workshop-vue3/src/styles/global.css';
var globalContent = fs.readFileSync(GLOBAL, 'utf8');
var log = [];
var append = '\n\n/* ===== CSS Fix: Missing keyframes from old architecture (extract) ===== */\n';
var added = 0;
for (var i = 0; i < missingKf.length; i++) {
  var name = missingKf[i];
  if (found[name] && globalContent.indexOf('@keyframes ' + name) === -1) {
    append += '\n' + found[name] + '\n';
    log.push({ item: name, type: 'keyframe', target: 'global.css', method: 'extract_from_old_append', status: 'FIXED', ts: new Date().toISOString() });
    added++;
  }
}
globalContent += append;
fs.writeFileSync(GLOBAL, globalContent, 'utf8');
console.log('[OK] Appended ' + added + ' keyframes to global.css');
var AUDIT = 'D:/codex/novel-workshop-vue3/_audit';
var existingLog = [];
try { existingLog = JSON.parse(fs.readFileSync(AUDIT + '/css_fix_applied_log.json', 'utf8')); } catch(e) {}
existingLog = existingLog.concat(log);
fs.writeFileSync(AUDIT + '/css_fix_applied_log.json', JSON.stringify(existingLog, null, 2), 'utf8');
console.log('[OK] Log updated: ' + existingLog.length + ' total entries');
console.log('[OK] Done!');
