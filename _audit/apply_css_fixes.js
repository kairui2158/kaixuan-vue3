var fs = require('fs');
var AUDIT = 'D:/codex/novel-workshop-vue3/_audit';
var TOKENS = 'D:/codex/novel-workshop-vue3/src/styles/tokens.css';
var GLOBAL = 'D:/codex/novel-workshop-vue3/src/styles/global.css';
var fixCss = fs.readFileSync(AUDIT + '/css_fix_missing.css', 'utf8');
var diff = JSON.parse(fs.readFileSync(AUDIT + '/css_diff.json', 'utf8'));
var missingVars = diff.missing_vars || [];
var missingKf = diff.missing_keyframes || [];
var missingMq = diff.missing_media || [];
var log = [];
var tokensContent = fs.readFileSync(TOKENS, 'utf8');
var globalContent = fs.readFileSync(GLOBAL, 'utf8');
console.log('[1] Missing vars:', missingVars.length, 'KF:', missingKf.length, 'MQ:', missingMq.length);
var fixLines = fixCss.split('\n');
var inRoot = false;
var varLines = [];
for (var i = 0; i < fixLines.length; i++) {
  var t = fixLines[i].trim();
  if (t.startsWith(':root')) { inRoot = true; continue; }
  if (inRoot && t === '}') { inRoot = false; continue; }
  if (inRoot && t.startsWith('--') && !t.startsWith('/*')) { varLines.push(fixLines[i]); }
}
console.log('[2] Parsed var lines from fix CSS:', varLines.length);
var varsToAdd = [];
for (var i = 0; i < varLines.length; i++) {
  var m = varLines[i].trim().match(/^(--[\w-]+):/);
  if (m) {
    var vn = m[1];
    if (tokensContent.indexOf(vn + ':') === -1) {
      varsToAdd.push(varLines[i].trim());
      log.push({ item: vn, type: 'variable', target: 'tokens.css', method: 'insert_before_root_close', status: 'FIXED', ts: new Date().toISOString() });
    }
  }
}
console.log('[3] Vars to add:', varsToAdd.length);
var lastBrace = tokensContent.lastIndexOf('}');
if (lastBrace > 0) {
  var before = tokensContent.substring(0, lastBrace);
  var after = tokensContent.substring(lastBrace);
  var ins = '\n/* ===== CSS Fix: Missing variables from old architecture ===== */\n';
  for (var i = 0; i < varsToAdd.length; i++) { ins += '  ' + varsToAdd[i] + '\n'; }
  tokensContent = before + ins + after;
  fs.writeFileSync(TOKENS, tokensContent, 'utf8');
  console.log('[OK] Appended ' + varsToAdd.length + ' vars to tokens.css');
} else { console.log('[ERR] No root closing brace in tokens.css'); }
var kfBlocks = [];
var kfRegex = /@keyframes\s+([\w-]+)\s*\{[^}]*(?:\{[^}]*\}[^}]*)*\}/g;
var kfMatch;
while ((kfMatch = kfRegex.exec(fixCss)) !== null) {
  var kfName = kfMatch[1];
  if (missingKf.indexOf(kfName) !== -1 && globalContent.indexOf('@keyframes ' + kfName) === -1) {
    kfBlocks.push(kfMatch[0]);
    log.push({ item: kfName, type: 'keyframe', target: 'global.css', method: 'append_end', status: 'FIXED', ts: new Date().toISOString() });
  }
}
console.log('[4] Keyframes to add:', kfBlocks.length);
var mqBlocks = [];
var mqRegex = /@media[^{]*\{[^}]*(?:\{[^}]*\}[^}]*)*\}/g;
var mqMatch;
while ((mqMatch = mqRegex.exec(fixCss)) !== null) {
  var mqText = mqMatch[0];
  var condMatch = mqText.match(/@media\s*([^{]+)/);
  var cond = condMatch ? condMatch[1].trim() : '';
  var exists = false;
  var existingMq = globalContent.match(/@media\s*([^\{]+)/g) || [];
  for (var e = 0; e < existingMq.length; e++) {
    if (existingMq[e].replace('@media', '').trim() === cond) { exists = true; break; }
  }
  if (!exists) {
    mqBlocks.push(mqText);
    log.push({ item: cond, type: 'media_query', target: 'global.css', method: 'append_end', status: 'FIXED', ts: new Date().toISOString() });
  }
}
console.log('[5] Media queries to add:', mqBlocks.length);
var append = '\n\n/* ===== CSS Fix: Missing keyframes from old architecture ===== */\n';
for (var i = 0; i < kfBlocks.length; i++) { append += '\n' + kfBlocks[i] + '\n'; }
append += '\n/* ===== CSS Fix: Missing media queries from old architecture ===== */\n';
for (var i = 0; i < mqBlocks.length; i++) { append += '\n' + mqBlocks[i] + '\n'; }
globalContent += append;
fs.writeFileSync(GLOBAL, globalContent, 'utf8');
console.log('[OK] Appended ' + kfBlocks.length + ' keyframes + ' + mqBlocks.length + ' media queries to global.css');
fs.writeFileSync(AUDIT + '/css_fix_applied_log.json', JSON.stringify(log, null, 2), 'utf8');
console.log('[OK] Fix log saved: ' + log.length + ' entries');
console.log('[OK] Done!');
