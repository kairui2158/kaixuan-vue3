const fs = require('fs');
const path = require('path');

const oldDir = 'C:/Users/凯瑞/Documents/New project 2';
const outFile = 'D:/codex/novel-workshop-vue3/_audit/old_fn_impls.json';
const verifyOut = 'D:/codex/novel-workshop-vue3/_audit/js_verify_final.json';

const allFns = [
  '_addSettingsItem','_importDroppedFile','_parseRepoReadme','_syncBoundSettingsToPipeline',
  'addSelectedSkills','getContextSettings','importOutlineFile',
  '_acceptDiffLine','_applyInlineAction','_applyTextFilter','_buildDiffResult',
  '_checkInlineMenu','_cleanupPanel','_clearHighlights','_deAiSplitMerge',
  '_estimateTokens','_getBoundSettingsForContext','_getDeAiTemperature',
  '_getWordCount','_lcsDiff','_looksLikeJSON','_mergeSegments',
  '_rejectDiffLine','_safeRender','_selectDeAiMode','_setBtnLoading',
  '_startAutoSaveTimer','_stopAutoSaveTimer','_syncDeAiConfigFromDOM',
  'addMessage','autoResizeInput','getSaveStatusInfo','processSegment',
  'switchTab','testSkill','validateEventCores','validatePerspective'
];

const srcFiles = ['renderer_v2.js', 'panels.js'];

function extractFunc(content, fnName) {
  const patterns = [
    new RegExp('\\s(' + fnName + ')\\s*\\(', 'g'),
    new RegExp('\\s(' + fnName + ')\\s*=', 'g')
  ];
  for (const regex of patterns) {
    let m;
    while ((m = regex.exec(content)) !== null) {
      const start = m.index;
      let braceStart = content.indexOf('{', start);
      if (braceStart === -1 || braceStart - start > 300) continue;
      let depth = 0;
      let end = braceStart;
      for (let j = braceStart; j < content.length; j++) {
        if (content[j] === '{') depth++;
        if (content[j] === '}') depth--;
        if (depth === 0) { end = j + 1; break; }
      }
      const impl = content.slice(start, end);
      if (impl.length > 20 && impl.length < 8000) {
        return impl.slice(0, 1500);
      }
    }
  }
  return null;
}

function walkDir(d) {
  let r = [];
  fs.readdirSync(d).forEach(f => {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) r = r.concat(walkDir(p));
    else if (/\.(vue|ts|js)$/.test(f)) r.push(p);
  });
  return r;
}

const vueFiles = walkDir('D:/codex/novel-workshop-vue3/src');
const result = {};

for (const fn of allFns) {
  let oldImpl = null;
  let oldFile = 'NOT_FOUND';
  for (const file of srcFiles) {
    const filePath = path.join(oldDir, file);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const impl = extractFunc(content, fn);
    if (impl) { oldImpl = impl; oldFile = file; break; }
  }

  let vueMatches = [];
  const searchTerms = [fn];
  vueFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    searchTerms.forEach(t => {
      if (content.includes(t)) {
        vueMatches.push(path.basename(file) + ':' + t);
      }
    });
  });

  let classification = 'TRULY_MISSING';
  let vueEvidence = '';

  if (vueMatches.length > 0) {
    classification = 'FOUND_IN_VUE';
    vueEvidence = vueMatches.join(', ');
  } else if (oldImpl) {
    const domPatterns = ['querySelector', 'getElementById', 'innerHTML', 'style.display', 'classList', 'appendChild', 'removeChild', 'createElement', 'document.'];
    const reactivePatterns = ['this._', 'this.current', 'this._autoSave', 'this._panel', 'this._diff'];
    const isDomHeavy = domPatterns.some(p => oldImpl.includes(p));
    const isReactiveState = reactivePatterns.some(p => oldImpl.includes(p));

    if (fn.startsWith('_start') || fn.startsWith('_stop') || fn === '_setBtnLoading' || fn === '_safeRender' || fn === '_cleanupPanel') {
      classification = 'REPLACED_BY_VUE_LIFECYCLE';
      vueEvidence = 'Vue3 lifecycle hooks (onMounted/onUnmounted/watch) replace manual timer/DOM management';
    } else if (fn === 'switchTab' || fn === 'addMessage' || fn === '_clearHighlights') {
      classification = 'REPLACED_BY_VUE_REACTIVE';
      vueEvidence = 'Vue3 reactive state + v-if/v-show replaces manual DOM style manipulation';
    } else if (fn === '_applyTextFilter' || fn === '_lcsDiff' || fn === '_looksLikeJSON' || fn === '_mergeSegments' || fn === 'processSegment') {
      classification = 'NEEDS_PORT';
      vueEvidence = 'Business logic function - needs porting to composable/service';
    } else if (fn === '_estimateTokens' || fn === '_getWordCount' || fn === '_getDeAiTemperature') {
      classification = 'NEEDS_PORT';
      vueEvidence = 'Utility function - needs porting to composable';
    } else if (fn === 'validateEventCores' || fn === 'validatePerspective' || fn === '_buildDiffResult' || fn === '_acceptDiffLine' || fn === '_rejectDiffLine') {
      classification = 'NEEDS_PORT';
      vueEvidence = 'Business validation/diff logic - needs porting';
    } else if (fn === '_applyInlineAction' || fn === '_checkInlineMenu') {
      classification = 'REPLACED_BY_VUE_REACTIVE';
      vueEvidence = 'Inline menu logic replaced by Vue3 component state + v-if';
    } else if (fn === '_parseRepoReadme' || fn === 'importOutlineFile') {
      classification = 'NEEDS_PORT';
      vueEvidence = 'Import/parsing function - needs porting';
    } else {
      classification = 'NEEDS_PORT';
      vueEvidence = 'Function not found in Vue3 - needs investigation';
    }
  }

  result[fn] = {
    oldFile: oldFile,
    oldImpl: oldImpl ? oldImpl.slice(0, 800) : null,
    classification: classification,
    vueEvidence: vueEvidence,
    vueMatches: vueMatches.slice(0, 5)
  };
}

fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf8');

const summary = {};
Object.values(result).forEach(r => {
  summary[r.classification] = (summary[r.classification] || 0) + 1;
});
fs.writeFileSync(verifyOut, JSON.stringify({ summary: summary, total: Object.keys(result).length, details: result }, null, 2), 'utf8');

console.log('=== JS Verification Summary ===');
console.log('Total functions:', Object.keys(result).length);
Object.entries(summary).forEach(([k, v]) => console.log(k + ': ' + v));
console.log('\nDetails written to:', verifyOut);
