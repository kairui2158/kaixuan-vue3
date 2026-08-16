const fs = require('fs');
const content = fs.readFileSync('C:/Users/凯瑞/Documents/New project 2/renderer_v2.js', 'utf8');
const fns = ['_acceptDiffLine','_applyTextFilter','_buildDiffResult','_deAiSplitMerge','_estimateTokens','_getBoundSettingsForContext','_getDeAiTemperature','_getWordCount','_lcsDiff','_mergeSegments','_rejectDiffLine','_selectDeAiMode','_syncDeAiConfigFromDOM','autoResizeInput','getSaveStatusInfo','processSegment','testSkill','validateEventCores','validatePerspective'];
const out = {};
for (const fn of fns) {
  // Search for the function name followed by ( or = or :
  let idx = -1;
  // Pattern 1: _fnName = function
  let m = content.indexOf(fn + ' = function');
  if (m === -1) m = content.indexOf(fn + '= function');
  // Pattern 2: _fnName(
  if (m === -1) {
    const re = new RegExp(fn.replace(/_/g,'_') + '\\s*\\(');
    const match = re.exec(content);
    if (match) m = match.index;
  }
  // Pattern 3: prototype._fnName
  if (m === -1) m = content.indexOf('.prototype.' + fn);
  // Pattern 4: this._fnName = function
  if (m === -1) m = content.indexOf('this.' + fn + ' = function');
  if (m === -1) m = content.indexOf('this.' + fn + '= function');
  if (m === -1) m = content.indexOf(fn + ': function');
  
  if (m >= 0) {
    // Find opening brace
    let braceStart = content.indexOf('{', m);
    if (braceStart >= 0 && braceStart - m < 300) {
      let depth = 0, end = braceStart;
      for (let j = braceStart; j < content.length; j++) {
        if (content[j] === '{') depth++;
        if (content[j] === '}') depth--;
        if (depth === 0) { end = j + 1; break; }
      }
      // Go back to include the function signature
      let lineStart = content.lastIndexOf('\n', m);
      if (lineStart === -1) lineStart = m;
      const impl = content.slice(lineStart, end);
      if (impl.length > 20) {
        out[fn] = impl.slice(0, 2000);
        continue;
      }
    }
  }
  out[fn] = 'NOT_FOUND';
}
fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/old_impls_renderer.json', JSON.stringify(out, null, 2), 'utf8');
console.log('Extracted', Object.keys(out).filter(k=>out[k]!=='NOT_FOUND').length, '/', fns.length);
Object.entries(out).forEach(([k,v]) => console.log(k + ': ' + (v === 'NOT_FOUND' ? 'FAIL' : v.length + ' chars')));
