const fs = require('fs');
const path = require('path');

const AUDIT_DIR = path.join(__dirname);

// Load scanned function data
const oldData = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, 'old_js_funcs.json'), 'utf8'));
const newData = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, 'new_js_funcs.json'), 'utf8'));

// --- Step 1: Filter old arch to core application files only ---
// Exclude: scripts/, tests/, test_evidence/, plans/ directories
const excludePrefixes = ['scripts\\', 'scripts/', 'tests\\', 'tests/', 'test_evidence\\', 'test_evidence/', 'plans\\', 'plans/'];

function isCoreFile(filePath) {
  return !excludePrefixes.some(p => filePath.startsWith(p));
}

// Core old arch files to compare
const oldCoreFiles = Object.keys(oldData).filter(isCoreFile);
console.log('[OLD] Core files to compare:', oldCoreFiles.length);
oldCoreFiles.forEach(f => {
  const funcs = oldData[f];
  console.log('  ' + f + ' (' + (Array.isArray(funcs) ? funcs.length : 0) + ' funcs)');
});

// All new arch files are core (no test dirs in src/)
const newFiles = Object.keys(newData);
console.log('\n[NEW] Files to compare:', newFiles.length);

// --- Step 2: Build function lookup sets ---
// Old arch: collect all function names from core files
// Each entry is { name, file } to track source
const oldFuncs = [];
for (const file of oldCoreFiles) {
  const funcs = oldData[file];
  if (Array.isArray(funcs)) {
    for (const fn of funcs) {
      oldFuncs.push({ name: fn, file: file });
    }
  }
}
console.log('\n[OLD] Total core functions:', oldFuncs.length);

// New arch: collect all function names
const newFuncs = [];
for (const file of newFiles) {
  const funcs = newData[file];
  if (Array.isArray(funcs)) {
    for (const fn of funcs) {
      newFuncs.push({ name: fn, file: file });
    }
  }
}
console.log('[NEW] Total functions:', newFuncs.length);

// --- Step 3: Build new arch function name set for quick lookup ---
const newFuncNameSet = new Set();
for (const f of newFuncs) {
  newFuncNameSet.add(f.name);
}

// Also build a map: func name -> new arch file(s)
const newFuncMap = {};
for (const f of newFuncs) {
  if (!newFuncMap[f.name]) newFuncMap[f.name] = [];
  newFuncMap[f.name].push(f.file);
}

// --- Step 4: Find missing functions (in old but not in new) ---
// Normalize: strip leading 'this.' or 'prototype.' prefixes, underscores, etc.
function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  // Strip common prefixes
  let n = name.replace(/^(this\.|self\.|window\.|app\.|that\.)/, '');
  // Strip getter/setter prefixes for comparison
  n = n.replace(/^(get|set)([A-Z])/, '$2');
  return n;
}

// Build normalized new func set
const newNormSet = new Set();
for (const f of newFuncs) {
  newNormSet.add(normalizeName(f.name));
}

// Find missing
const missing = [];
const found = [];
const seenNames = new Set();

for (const oldFn of oldFuncs) {
  const normName = normalizeName(oldFn.name);
  if (seenNames.has(normName)) continue;
  seenNames.add(normName);

  if (newFuncNameSet.has(oldFn.name) || newNormSet.has(normName)) {
    const newFile = newFuncMap[oldFn.name] || newFuncMap[normName] || [];
    found.push({
      name: oldFn.name,
      oldFile: oldFn.file,
      newFile: newFile,
      status: 'FOUND'
    });
  } else {
    missing.push({
      name: oldFn.name,
      oldFile: oldFn.file,
      newFile: null,
      status: 'MISSING'
    });
  }
}

console.log('\n=== DIFF RESULTS ===');
console.log('Total old core functions (unique):', seenNames.size);
console.log('Found in new arch:', found.length);
console.log('Missing in new arch:', missing.length);

// --- Step 5: Categorize missing functions ---
// Group by old file
const missingByFile = {};
for (const m of missing) {
  if (!missingByFile[m.oldFile]) missingByFile[m.oldFile] = [];
  missingByFile[m.oldFile].push(m.name);
}

console.log('\nMissing functions by old file:');
for (const [file, funcs] of Object.entries(missingByFile)) {
  console.log('  ' + file + ': ' + funcs.length + ' missing');
  funcs.forEach(f => console.log('    - ' + f));
}

// --- Step 6: Output diff JSON ---
const diffResult = {
  summary: {
    oldCoreFiles: oldCoreFiles.length,
    newFiles: newFiles.length,
    oldTotalFunctions: oldFuncs.length,
    newTotalFunctions: newFuncs.length,
    oldUniqueFunctions: seenNames.size,
    foundCount: found.length,
    missingCount: missing.length,
    timestamp: new Date().toISOString()
  },
  missingByFile: missingByFile,
  missing: missing,
  found: found
};

const outPath = path.join(AUDIT_DIR, 'js_diff.json');
fs.writeFileSync(outPath, JSON.stringify(diffResult, null, 2), 'utf8');
console.log('\n[OK] Diff written to ' + outPath);

// Also print summary for quick review
console.log('\n=== MISSING FUNCTION NAMES ===');
missing.forEach((m, i) => {
  console.log((i+1) + '. ' + m.name + ' (from ' + m.oldFile + ')');
});
