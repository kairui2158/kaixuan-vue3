const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const AUDIT_DIR = __dirname;
const SRC_DIR = path.join(__dirname, '..', 'src');

const diffData = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, 'js_diff.json'), 'utf8'));
const missing = diffData.missing;

console.log('[INFO] Verifying ' + missing.length + ' missing functions in new arch source...');

// Categories for classification
const categories = {
  // Electron main process - not applicable to Vue3 web app
  ELECTRON_MAIN: [],
  // Electron preload - not applicable to Vue3 web app
  ELECTRON_PRELOAD: [],
  // DOM property/attribute names (not functions)
  DOM_PROPERTY: [],
  // Standard JS builtins (filter, findIndex, fetch, etc.)
  JS_BUILTIN: [],
  // Variable/parameter names (not functions)
  VARIABLE: [],
  // Found in new arch via text search (architecturally replaced)
  FOUND_IN_NEW: [],
  // Genuinely missing - needs fix
  GENUINE_MISSING: []
};

// Known Electron main/preload functions (not applicable to Vue3 web app)
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

// DOM properties / attributes that got scanned as "functions"
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

// Standard JS builtins
const jsBuiltins = new Set([
  'filter', 'findIndex', 'fetch', 'clearTimeout', 'constructor',
  'schedule', 'isActive'
]);

// Variable/parameter names (not real function definitions)
const variableNames = new Set([
  'pump', 'sTemp'
]);

for (const m of missing) {
  const name = m.name;

  // Category 1: Electron main process
  if (electronMainFuncs.has(name)) {
    categories.ELECTRON_MAIN.push(m);
    continue;
  }

  // Category 2: Electron preload
  if (electronPreloadFuncs.has(name)) {
    categories.ELECTRON_PRELOAD.push(m);
    continue;
  }

  // Category 3: DOM properties
  if (domProperties.has(name)) {
    categories.DOM_PROPERTY.push(m);
    continue;
  }

  // Category 4: JS builtins
  if (jsBuiltins.has(name)) {
    categories.JS_BUILTIN.push(m);
    continue;
  }

  // Category 5: Variable names
  if (variableNames.has(name)) {
    categories.VARIABLE.push(m);
    continue;
  }

  // For remaining: search in new arch source via rg
  let found = false;
  let foundIn = [];
  try {
    // Search for the function name in src/ directory
    // Use word-boundary regex to avoid false matches
    const searchName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cmd = 'rg -l "' + searchName + '" "' + SRC_DIR + '" 2>nul';
    const output = execSync(cmd, { encoding: 'utf8', timeout: 10000 }).trim();
    if (output) {
      foundIn = output.split('\n').map(f => path.basename(f));
      found = true;
    }
  } catch (e) {
    // rg not found or no match
  }

  if (found) {
    m.foundInFiles = foundIn;
    categories.FOUND_IN_NEW.push(m);
  } else {
    // Try alternate search: method call pattern (e.g. .methodName)
    try {
      const searchName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const cmd2 = 'rg -l "\\.' + searchName + '\\b" "' + SRC_DIR + '" 2>nul';
      const output2 = execSync(cmd2, { encoding: 'utf8', timeout: 10000 }).trim();
      if (output2) {
        m.foundInFiles = output2.split('\n').map(f => path.basename(f));
        categories.FOUND_IN_NEW.push(m);
      } else {
        categories.GENUINE_MISSING.push(m);
      }
    } catch (e2) {
      categories.GENUINE_MISSING.push(m);
    }
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

// Print genuinely missing
if (categories.GENUINE_MISSING.length > 0) {
  console.log('\n=== GENUINELY MISSING FUNCTIONS ===');
  categories.GENUINE_MISSING.forEach((m, i) => {
    console.log((i+1) + '. ' + m.name + ' (from ' + m.oldFile + ')');
  });
}

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
