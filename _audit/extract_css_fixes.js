var fs = require('fs');
var path = require('path');
var OLD_DIR = 'C:\\Users\\凯瑞\\Documents\\New project 2';
var NEW_SRC = 'D:\\codex\\novel-workshop-vue3\\src';
var OUT_CSS = 'D:\\codex\\novel-workshop-vue3\\_audit\\css_fix_missing.css';
var OUT_LOG = 'D:\\codex\\novel-workshop-vue3\\_audit\\css_fix_log.json';
function readOldCSS(dir) {
  var html = fs.readFileSync(path.join(dir, 'renderer.html'), 'utf8');
  var linkRe = /<link[^>]+href=["']([^"']+\.css)["']/gi;
  var cssFiles = [];
  var m;
  while ((m = linkRe.exec(html)) !== null) {
    if (!m[1].includes('node_modules')) cssFiles.push(m[1]);
  }
  var css = '';
  for (var i = 0; i < cssFiles.length; i++) {
    var abs = path.resolve(dir, cssFiles[i]);
    if (fs.existsSync(abs)) css += '\n' + fs.readFileSync(abs, 'utf8');
  }
  return css;
}
function readNewCSS(srcDir) {
  var css = '';
  function scan(dir) {
    var items = fs.readdirSync(dir, { withFileTypes: true });
    for (var i = 0; i < items.length; i++) {
      var fp = path.join(dir, items[i].name);
      if (items[i].isDirectory()) scan(fp);
      else if (items[i].name.endsWith('.css')) css += '\n' + fs.readFileSync(fp, 'utf8');
      else if (items[i].name.endsWith('.vue')) {
        var content = fs.readFileSync(fp, 'utf8');
        var sr = /<style[^>]*>([\s\S]*?)<\/style>/gi;
        var m2;
        while ((m2 = sr.exec(content)) !== null) css += '\n' + m2[1];
      }
    }
  }
  scan(srcDir);
  return css;
}
var oldCSS = readOldCSS(OLD_DIR);
var newCSS = readNewCSS(NEW_SRC);
var diff = JSON.parse(fs.readFileSync('D:\\codex\\novel-workshop-vue3\\_audit\\css_diff.json', 'utf8'));
var missVars = diff.missingVars;
var missKF = diff.missingKeyframes;
var missMQ = diff.missingMediaQueries;
console.log('[1] Extracting ' + missVars.length + ' missing CSS variables...');
var varDefs = {};
var varRe = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
var m;
while ((m = varRe.exec(oldCSS)) !== null) {
  if (missVars.indexOf(m[1]) !== -1 && !varDefs[m[1]]) {
    varDefs[m[1]] = m[2].trim();
  }
}
var foundVars = Object.keys(varDefs);
var notFoundVars = missVars.filter(function(v) { return !varDefs[v]; });
console.log('[OK] Found definitions for ' + foundVars.length + '/' + missVars.length + ' vars');
if (notFoundVars.length > 0) {
  console.log('[WARN] Not found: ' + notFoundVars.join(', '));
}
console.log('[2] Extracting ' + missKF.length + ' missing keyframes...');
var kfDefs = {};
for (var i = 0; i < missKF.length; i++) {
  var kfName = missKF[i];
  var kfRe = new RegExp('@keyframes\\s+' + kfName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([\\s\\S]*?)\\}', 'g');
  var m2;
  while ((m2 = kfRe.exec(oldCSS)) !== null) {
    if (!kfDefs[kfName]) kfDefs[kfName] = m2[0];
  }
}
var foundKF = Object.keys(kfDefs);
console.log('[OK] Found ' + foundKF.length + '/' + missKF.length + ' keyframes');
console.log('[3] Extracting ' + missMQ.length + ' missing media queries...');
var mqBlocks = [];
for (var j = 0; j < missMQ.length; j++) {
  var mqCond = missMQ[j];
  var mqRe = new RegExp('(' + mqCond.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{)([\\s\\S]*?)\\n\\}', 'g');
  var m3;
  while ((m3 = mqRe.exec(oldCSS)) !== null) {
    var fullBlock = m3[1] + m3[2] + '\n}';
    if (mqBlocks.indexOf(fullBlock) === -1) mqBlocks.push(fullBlock);
  }
}
console.log('[OK] Found ' + mqBlocks.length + ' media query blocks');
var fixCSS = '\n/* ===== CSS FIX: Missing variables from old architecture ===== */\n';
fixCSS += ':root {\n';
var fixLog = [];
var idx = 1;
for (var vi = 0; vi < foundVars.length; vi++) {
  var vname = foundVars[vi];
  var vval = varDefs[vname];
  fixCSS += '  ' + vname + ': ' + vval + ';\n';
  fixLog.push({ num: idx, name: vname, value: vval, type: 'variable', status: 'FIXED' });
  idx++;
}
fixCSS += '}\n\n';
fixCSS += '/* ===== CSS FIX: Missing keyframes from old architecture ===== */\n';
for (var ki = 0; ki < foundKF.length; ki++) {
  var kfName2 = foundKF[ki];
  fixCSS += kfDefs[kfName2] + '\n\n';
  fixLog.push({ num: idx, name: kfName2, type: 'keyframe', status: 'FIXED' });
  idx++;
}
if (mqBlocks.length > 0) {
  fixCSS += '/* ===== CSS FIX: Missing media queries from old architecture ===== */\n';
  for (var mi = 0; mi < mqBlocks.length; mi++) {
    fixCSS += mqBlocks[mi] + '\n\n';
    fixLog.push({ num: idx, name: 'media-query-' + (mi + 1), type: 'media-query', status: 'FIXED' });
    idx++;
  }
}
if (notFoundVars.length > 0) {
  fixCSS += '/* ===== CSS FIX: Variables not found in old CSS (placeholder) ===== */\n';
  for (var ni = 0; ni < notFoundVars.length; ni++) {
    fixCSS += '/* ' + notFoundVars[ni] + ': definition not found in old CSS */\n';
    fixLog.push({ num: idx, name: notFoundVars[ni], type: 'variable', status: 'NOT_FOUND' });
    idx++;
  }
}
fs.writeFileSync(OUT_CSS, fixCSS, 'utf8');
fs.writeFileSync(OUT_LOG, JSON.stringify(fixLog, null, 2), 'utf8');
console.log('\n=== EXTRACTION SUMMARY ===');
console.log('Variables fixed: ' + foundVars.length);
console.log('Variables not found: ' + notFoundVars.length);
console.log('Keyframes fixed: ' + foundKF.length);
console.log('Media queries fixed: ' + mqBlocks.length);
console.log('Total fix log entries: ' + fixLog.length);
console.log('[OK] Fix CSS written to ' + OUT_CSS);
console.log('[OK] Fix log written to ' + OUT_LOG);
