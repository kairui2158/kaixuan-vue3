const fs = require('fs');
const content = fs.readFileSync('C:/Users/凯瑞/Documents/New project 2/renderer_v2.js', 'utf8');
const fns = ['_acceptDiffLine','_applyTextFilter','_buildDiffResult','_deAiSplitMerge','_estimateTokens','_getBoundSettingsForContext','_getDeAiTemperature','_getWordCount','_lcsDiff','_mergeSegments','_rejectDiffLine','_selectDeAiMode','_syncDeAiConfigFromDOM','autoResizeInput','getSaveStatusInfo','processSegment','testSkill','validateEventCores','validatePerspective'];
const out = {};
for (const fn of fns) {
  const regex = new RegExp('(App\\.prototype\\.)?(' + fn + ')\\s*[=(:]\\s*function', 'g');
  let m;
  let found = false;
  while ((m = regex.exec(content)) !== null) {
    const start = m.index;
    let braceStart = content.indexOf('{', start);
    if (braceStart === -1 || braceStart - start > 300) continue;
    let depth = 0, end = braceStart;
    for (let j = braceStart; j < content.length; j++) {
      if (content[j] === '{') depth++;
      if (content[j] === '}') depth--;
      if (depth === 0) { end = j + 1; break; }
    }
    const impl = content.slice(start, end);
    if (impl.length > 20) { out[fn] = impl.slice(0, 2000); found = true; break; }
  }
  if (!found) {
    const regex2 = new RegExp('(window\\.)?(' + fn + ')\\s*=', 'g');
    while ((m = regex2.exec(content)) !== null) {
      const start = m.index;
      let braceStart = content.indexOf('{', start);
      if (braceStart === -1 || braceStart - start > 300) continue;
      let depth = 0, end = braceStart;
      for (let j = braceStart; j < content.length; j++) {
        if (content[j] === '{') depth++;
        if (content[j] === '}') depth--;
        if (depth === 0) { end = j + 1; break; }
      }
      const impl = content.slice(start, end);
      if (impl.length > 20) { out[fn] = impl.slice(0, 2000); found = true; break; }
    }
  }
  if (!found) out[fn] = 'NOT_EXTRACTED';
}
fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/old_impls_renderer.json', JSON.stringify(out, null, 2), 'utf8');
console.log('Extracted', Object.keys(out).length, 'functions');
Object.entries(out).forEach(([k,v]) => console.log(k + ': ' + (v === 'NOT_EXTRACTED' ? 'FAIL' : v.length + ' chars')));
