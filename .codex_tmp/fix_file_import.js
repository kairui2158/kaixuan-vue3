const fs = require('fs');
const f = 'src/services/file-import.js';
let c = fs.readFileSync(f, 'utf8');
let fixes = 0;
const badRTF = String.fromCharCode(46,114,101,112,108,97,99,101,40,47,92,92,92,92,47,103,44,32,34,92,34,41);
const goodRTF = String.fromCharCode(46,114,101,112,108,97,99,101,40,47,92,92,92,92,47,103,44,32,34,92,92,34,41);
while (c.indexOf(badRTF) !== -1) { c = c.split(badRTF).join(goodRTF); fixes++; console.log('[OK] Fixed RTF quote'); }
const badTitle = '/^#s+(.+)/m';
const goodTitle = '/^#\\s+(.+)/m';
if (c.indexOf(badTitle) !== -1) { c = c.split(badTitle).join(goodTitle); fixes++; console.log('[OK] Fixed titleMatch'); }
const lines = c.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].indexOf('descMatch = readme.match(/^[^#') !== -1) {
    lines[i] = '  var descMatch = readme.match(/^[^#\\n!\\[\\]`<][^\\n]{20,200}/m);';
    if (i+1 < lines.length) lines[i+1] = '__DEL__';
    if (i+2 < lines.length) lines[i+2] = '__DEL__';
    fixes++; console.log('[OK] Fixed descMatch at line ' + (i+1));
  }
  if (lines[i].indexOf('codeMatch = readme.match(/```') !== -1) {
    lines[i] = '  var codeMatch = readme.match(/```(?:markdown|md|text|yaml|json)?\\s*\\n([\\s\\S]*?)\\n```/);';
    if (i+1 < lines.length) lines[i+1] = '__DEL__';
    if (i+2 < lines.length) lines[i+2] = '__DEL__';
    if (i+3 < lines.length) lines[i+3] = '__DEL__';
    fixes++; console.log('[OK] Fixed codeMatch at line ' + (i+1));
  }
}
c = lines.filter(function(l) { return l !== '__DEL__'; }).join('\n');
fs.writeFileSync(f, c, 'utf8');
console.log('Total fixes: ' + fixes);
