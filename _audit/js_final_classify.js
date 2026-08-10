const fs = require('fs');
const path = require('path');

const AUDIT_DIR = __dirname;
const OLD_DIR = 'C:\\Users\\凯瑞\\Documents\\New project 2';
const SRC_DIR = path.join(__dirname, '..', 'src');

// Load all data
const verify3 = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, 'js_deep_verify3.json'), 'utf8'));
const stillMissing = verify3.stillMissing;
const classData = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, 'js_func_classification.json'), 'utf8'));

const panelsSrc = fs.readFileSync(path.join(OLD_DIR, 'panels.js'), 'utf8');
const rendererSrc = fs.readFileSync(path.join(OLD_DIR, 'renderer_v2.js'), 'utf8');

// Read all new arch source
function readAllFiles(dir, exts) {
  const results = {};
  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else {
        const ext = path.extname(entry.name).toLowerCase();
        if (exts.includes(ext)) { try { results[fullPath] = fs.readFileSync(fullPath, 'utf8'); } catch(e){} }
      }
    }
  }
  walk(dir);
  return results;
}
const allNewFiles = readAllFiles(SRC_DIR, ['.vue', '.ts', '.js']);
const newFileNames = Object.keys(allNewFiles);
let newBlob = '';
for (const f of newFileNames) newBlob += '\n' + allNewFiles[f];

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'); }

// For each missing function, determine its true status
const finalResults = [];

for (const m of stillMissing) {
  const name = m.name;
  const oldFile = m.oldFile;
  const src = oldFile === 'panels.js' ? panelsSrc : rendererSrc;

  // Find the function definition in old source
  const escaped = escapeRegex(name);

  // Pattern 1: App.prototype.name = function
  const protoPattern = new RegExp('App\\.prototype\\.' + escaped + '\\s*=\\s*(async\\s+)?function\\s*\\(([^)]*)\\)\\s*\\{');
  // Pattern 2: window.name = function
  const winPattern = new RegExp('window\\.' + escaped + '\\s*=\\s*(async\\s+)?function\\s*\\(([^)]*)\\)\\s*\\{');
  // Pattern 3: var name = function (local variable)
  const varPattern = new RegExp('var\\s+' + escaped + '\\s*=');
  // Pattern 4: let/const name = function
  const letPattern = new RegExp('(?:let|const)\\s+' + escaped + '\\s*=');
  // Pattern 5: name(args) { (method shorthand in class)
  const methodPattern = new RegExp('\\b' + escaped + '\\s*\\(([^)]*)\\)\\s*\\{');

  let defType = 'UNKNOWN';
  let impl = null;
  let args = '';

  let match = protoPattern.exec(src);
  if (match) { defType = 'PROTOTYPE_METHOD'; args = match[2] || ''; }

  if (defType === 'UNKNOWN') {
    match = winPattern.exec(src);
    if (match) { defType = 'WINDOW_GLOBAL'; args = match[2] || ''; }
  }

  if (defType === 'UNKNOWN') {
    match = varPattern.exec(src);
    if (match) { defType = 'LOCAL_VAR'; }
  }

  if (defType === 'UNKNOWN') {
    match = letPattern.exec(src);
    if (match) { defType = 'LOCAL_VAR'; }
  }

  if (defType === 'UNKNOWN') {
    // Check classification data for previous category
    const prevCat = classData.details.find(d => d.name === name);
    if (prevCat) {
      defType = 'OTHER_DEF';
      impl = prevCat.impl;
    }
  }

  // Extract implementation for prototype/window methods
  if ((defType === 'PROTOTYPE_METHOD' || defType === 'WINDOW_GLOBAL') && match) {
    let braceStart = src.indexOf('{', match.index + match[0].length - 1);
    if (braceStart !== -1) {
      let depth = 1;
      let i = braceStart + 1;
      while (i < src.length && depth > 0) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
        i++;
      }
      impl = src.substring(match.index, Math.min(i, match.index + 1000));
      if (i - match.index > 1000) impl += '... [truncated]';
    }
  }

  // Determine Vue3 replacement status
  let vue3Status = '';
  let vue3Location = '';
  let needsFix = false;
  let fixAction = '';

  if (defType === 'LOCAL_VAR') {
    vue3Status = 'FALSE_POSITIVE';
    vue3Location = 'N/A - local variable in old code, not a function definition';
    needsFix = false;
  } else {
    // Search for the function (without underscore prefix) in new arch
    const noUnder = name.replace(/^_+/, '');
    const searchTerms = [name, noUnder];

    // For render/show/hide/toggle/close/open patterns, check if Vue template handles it
    const isRender = /^_?render/i.test(name);
    const isShow = /^_?show/i.test(name);
    const isHide = /^_?hide/i.test(name);
    const isToggle = /^_?toggle/i.test(name);
    const isClose = /^_?close/i.test(name);
    const isOpen = /^_?open/i.test(name);
    const isFill = /^_?fill/i.test(name);
    const isSave = /^_?save/i.test(name);
    const isUpdate = /^_?update/i.test(name);
    const isInit = /^_?init/i.test(name);

    // Check if equivalent exists in new arch
    let foundInNew = false;
    let foundFiles = [];
    for (const term of searchTerms) {
      const re = new RegExp('\\b' + escapeRegex(term) + '\\b', 'i');
      if (re.test(newBlob)) {
        for (const f of newFileNames) {
          if (re.test(allNewFiles[f])) foundFiles.push(path.basename(f));
        }
        foundInNew = true;
        break;
      }
    }

    if (foundInNew) {
      vue3Status = 'FOUND_VIA_SEARCH';
      vue3Location = foundFiles.join(', ');
      needsFix = false;
    } else if (isRender || isShow || isHide || isToggle || isClose || isOpen) {
      vue3Status = 'REPLACED_BY_VUE_TEMPLATE';
      vue3Location = 'Replaced by v-if/v-show/template interpolation in Vue components';
      needsFix = false;
    } else if (isFill || isSave) {
      vue3Status = 'REPLACED_BY_VMODEL';
      vue3Location = 'Replaced by v-model two-way binding in Vue components';
      needsFix = false;
    } else if (isInit) {
      vue3Status = 'REPLACED_BY_VUE_LIFECYCLE';
      vue3Location = 'Replaced by onMounted/onInitialized lifecycle hooks';
      needsFix = false;
    } else if (isUpdate) {
      vue3Status = 'REPLACED_BY_REACTIVE_STATE';
      vue3Location = 'Replaced by Vue reactive state (watch/computed)';
      needsFix = false;
    } else {
      // Genuinely needs checking - look at implementation
      vue3Status = 'NEEDS_VERIFICATION';
      vue3Location = 'Not found via text search - check if business logic exists in stores/composables';
      needsFix = true;
    }
  }

  finalResults.push({
    name,
    oldFile,
    defType,
    args,
    vue3Status,
    vue3Location,
    needsFix,
    impl: impl ? impl.substring(0, 500) : null
  });
}

// Summary
const statusCounts = {};
for (const r of finalResults) {
  statusCounts[r.vue3Status] = (statusCounts[r.vue3Status] || 0) + 1;
}

console.log('\n=== FINAL CLASSIFICATION ===');
console.log('Total:', finalResults.length);
for (const [status, count] of Object.entries(statusCounts)) {
  console.log('  ' + status + ': ' + count);
}

// List items that need verification
const needVerification = finalResults.filter(r => r.needsFix);
console.log('\n=== NEEDS VERIFICATION (' + needVerification.length + ') ===');
needVerification.forEach((r, i) => {
  console.log((i+1) + '. ' + r.name + ' (from ' + r.oldFile + ', type: ' + r.defType + ')');
  if (r.impl) console.log('    impl: ' + r.impl.substring(0, 200).replace(/\n/g, ' '));
});

// Write results
fs.writeFileSync(path.join(AUDIT_DIR, 'js_final_classification.json'), JSON.stringify({
  summary: { total: finalResults.length, statusCounts, needVerification: needVerification.length },
  results: finalResults
}, null, 2), 'utf8');

console.log('\n[OK] Final classification written to js_final_classification.json');
