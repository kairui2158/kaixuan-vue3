const fs = require('fs');
const path = require('path');

const AUDIT_DIR = __dirname;
const SRC_DIR = path.join(__dirname, '..', 'src');

const diffData = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, 'js_diff.json'), 'utf8'));
const missing = diffData.missing;

// Step 1: Read all source files into memory
function readAllFiles(dir, exts) {
  const results = {};
  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (exts.includes(ext)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            results[fullPath] = content;
          } catch (e) { /* skip */ }
        }
      }
    }
  }
  walk(dir);
  return results;
}

console.log('[INFO] Reading all src files into memory...');
const allFiles = readAllFiles(SRC_DIR, ['.vue', '.ts', '.js']);
const fileNames = Object.keys(allFiles);
console.log('[INFO] Read ' + fileNames.length + ' files');

// Build a single concatenated blob for fast search
// Also keep per-file content for locating matches
const fileContents = {};
let blob = '';
for (const f of fileNames) {
  fileContents[f] = allFiles[f];
  blob += '\n// FILE: ' + f + '\n' + allFiles[f];
}
console.log('[INFO] Blob size: ' + (blob.length / 1024).toFixed(1) + ' KB');

// Step 2: Categorize missing functions
const electronMainFuncs = new Set([
  'createWindow', 'getDiagLogDir', 'getStorageDir', 'getWindowStatePath',
  'loadWindowState', 'migrateOldDataIfNeeded', 'returnValue', 'safeKey',
  'saveWindowState', 'write'
]);
const electronPreloadFuncs = new Set([
  'decrypt', 'diagWrite', 'dialogOpenFile', 'dialogSaveFile', 'encrypt',
  'forceQuit', 'onCloseRequest', 'onFinalSave', 'respondCloseChoice',
  'storageExport', 'storageGetDataDir', 'storageImport'
]);
const domProperties = new Set([
  'checked', 'innerHTML', 'textContent', 'inputLen', 'outputLen',
  'reasoningLen', 'left', 'top', 'total', 'issues', 'label', 'prompt',
  'items', 'skills', 'volumes', 'wordCount', 'skillCount', 'projectCount',
  'agentId', 'boundIds', 'bindTargets', 'firstCat', 'scCat', 'sugg',
  'origLines', 'modLines', 'received', 'currentMode', 'bodyGenerated',
  'phaseActive', 'phaseDone', 'stepProgress', 'stepX', 'baseProgress',
  'injectDepth', 'minProseLength', 'existingItem', 'ci', 'vi',
  'hotkeys', 'onblur', 'onload'
]);
const jsBuiltins = new Set([
  'filter', 'findIndex', 'fetch', 'clearTimeout', 'constructor',
  'schedule', 'isActive'
]);
const variableNames = new Set(['pump', 'sTemp']);

const categories = {
  ELECTRON_MAIN: [],
  ELECTRON_PRELOAD: [],
  DOM_PROPERTY: [],
  JS_BUILTIN: [],
  VARIABLE: [],
  FOUND_IN_NEW: [],
  GENUINE_MISSING: []
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

for (const m of missing) {
  const name = m.name;

  if (electronMainFuncs.has(name)) { categories.ELECTRON_MAIN.push(m); continue; }
  if (electronPreloadFuncs.has(name)) { categories.ELECTRON_PRELOAD.push(m); continue; }
  if (domProperties.has(name)) { categories.DOM_PROPERTY.push(m); continue; }
  if (jsBuiltins.has(name)) { categories.JS_BUILTIN.push(m); continue; }
  if (variableNames.has(name)) { categories.VARIABLE.push(m); continue; }

  // Search in blob
  const escaped = escapeRegex(name);
  // Try exact word match (function def, method call, property access)
  const regex = new RegExp('\\b' + escaped + '\\b');
  if (regex.test(blob)) {
    // Find which files contain it
    const foundFiles = [];
    for (const f of fileNames) {
      if (regex.test(fileContents[f])) {
        foundFiles.push(path.basename(f));
      }
    }
    m.foundInFiles = foundFiles;
    categories.FOUND_IN_NEW.push(m);
  } else {
    categories.GENUINE_MISSING.push(m);
  }
}

// Summary
console.log('\n=== VERIFICATION RESULTS ===');
console.log('Electron main (N/A for Vue3):', categories.ELECTRON_MAIN.length);
console.log('Electron preload (N/A for Vue3):', categories.ELECTRON_PRELOAD.length);
console.log('DOM properties (not functions):', categories.DOM_PROPERTY.length);
console.log('JS builtins:', categories.JS_BUILTIN.length);
console.log('Variable names:', categories.VARIABLE.length);
console.log('Found in new arch (text search):', categories.FOUND_IN_NEW.length);
console.log('Genuinely missing:', categories.GENUINE_MISSING.length);

if (categories.GENUINE_MISSING.length > 0) {
  console.log('\n=== GENUINELY MISSING FUNCTIONS ===');
  categories.GENUINE_MISSING.forEach((m, i) => {
    console.log((i + 1) + '. ' + m.name + ' (from ' + m.oldFile + ')');
  });
}

// Also list FOUND_IN_NEW with their file locations
console.log('\n=== FOUND IN NEW ARCH (sample) ===');
categories.FOUND_IN_NEW.slice(0, 20).forEach((m, i) => {
  console.log((i + 1) + '. ' + m.name + ' -> ' + (m.foundInFiles || []).join(', '));
});

// Write results
const result = {
  summary: {
    totalMissing: missing.length,
    electronMain: categories.ELECTRON_MAIN.length,
    electronPreload: categories.ELECTRON_PRELOAD.length,
    domProperty: categories.DOM_PROPERTY.length,
    jsBuiltin: categories.JS_BUILTIN.length,
    variable: categories.VARIABLE.length,
    foundInNew: categories.FOUND_IN_NEW.length,
    genuineMissing: categories.GENUINE_MISSING.length,
    timestamp: new Date().toISOString()
  },
  details: {
    electronMain: categories.ELECTRON_MAIN,
    electronPreload: categories.ELECTRON_PRELOAD,
    domProperty: categories.DOM_PROPERTY,
    jsBuiltin: categories.JS_BUILTIN,
    variable: categories.VARIABLE,
    foundInNew: categories.FOUND_IN_NEW.map(m => ({ name: m.name, oldFile: m.oldFile, foundIn: m.foundInFiles })),
    genuineMissing: categories.GENUINE_MISSING
  }
};

fs.writeFileSync(path.join(AUDIT_DIR, 'js_deep_verify.json'), JSON.stringify(result, null, 2), 'utf8');
console.log('\n[OK] Deep verification written to js_deep_verify.json');
