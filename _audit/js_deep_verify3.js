const fs = require('fs');
const path = require('path');

const AUDIT_DIR = __dirname;
const SRC_DIR = path.join(__dirname, '..', 'src');

const verifyData = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, 'js_deep_verify.json'), 'utf8'));
const genuineMissing = verifyData.details.genuineMissing;

// Read all source files
function readAllFiles(dir, exts) {
  const results = {};
  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else {
        const ext = path.extname(entry.name).toLowerCase();
        if (exts.includes(ext)) {
          try { results[fullPath] = fs.readFileSync(fullPath, 'utf8'); } catch (e) {}
        }
      }
    }
  }
  walk(dir);
  return results;
}

console.log('[INFO] Reading src files...');
const allFiles = readAllFiles(SRC_DIR, ['.vue', '.ts', '.js']);
const fileNames = Object.keys(allFiles);
let blob = '';
for (const f of fileNames) blob += '\n' + allFiles[f];
console.log('[INFO] Blob: ' + (blob.length / 1024).toFixed(1) + ' KB, ' + fileNames.length + ' files');

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// For each genuinely missing function, try multiple matching strategies
const stillMissing = [];
const foundViaAltName = [];

for (const m of genuineMissing) {
  const name = m.name;
  let found = false;
  let matchStrategy = '';
  let foundFiles = [];

  // Strategy 1: Strip leading underscore(s) and search
  const noUnderscore = name.replace(/^_+/, '');
  if (noUnderscore !== name) {
    const re1 = new RegExp('\\b' + escapeRegex(noUnderscore) + '\\b');
    if (re1.test(blob)) {
      for (const f of fileNames) { if (re1.test(allFiles[f])) foundFiles.push(path.basename(f)); }
      found = true;
      matchStrategy = 'strip_underscore: ' + name + ' -> ' + noUnderscore;
    }
  }

  // Strategy 2: camelCase -> kebab-case (for template refs)
  if (!found) {
    const kebab = noUnderscore.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
    if (kebab !== noUnderscore && kebab.length > 2) {
      const re2 = new RegExp(escapeRegex(kebab));
      if (re2.test(blob)) {
        for (const f of fileNames) { if (re2.test(allFiles[f])) foundFiles.push(path.basename(f)); }
        found = true;
        matchStrategy = 'kebab_case: ' + name + ' -> ' + kebab;
      }
    }
  }

  // Strategy 3: Search without word boundary (substring match for short names)
  if (!found && noUnderscore.length >= 5) {
    const re3 = new RegExp(escapeRegex(noUnderscore), 'i');
    if (re3.test(blob)) {
      for (const f of fileNames) { if (re3.test(allFiles[f])) foundFiles.push(path.basename(f)); }
      found = true;
      matchStrategy = 'case_insensitive: ' + name + ' -> ' + noUnderscore;
    }
  }

  if (found) {
    m.matchStrategy = matchStrategy;
    m.foundInFiles = foundFiles;
    foundViaAltName.push(m);
  } else {
    stillMissing.push(m);
  }
}

console.log('\n=== ROUND 2 VERIFICATION ===');
console.log('Round 1 genuine missing:', genuineMissing.length);
console.log('Found via alt name:', foundViaAltName.length);
console.log('Still missing:', stillMissing.length);

if (stillMissing.length > 0) {
  console.log('\n=== STILL GENUINELY MISSING ===');
  stillMissing.forEach((m, i) => {
    console.log((i + 1) + '. ' + m.name + ' (from ' + m.oldFile + ')');
  });
}

// Write final results
const result = {
  summary: {
    round1GenuineMissing: genuineMissing.length,
    foundViaAltName: foundViaAltName.length,
    stillMissing: stillMissing.length,
    timestamp: new Date().toISOString()
  },
  foundViaAltName: foundViaAltName.map(m => ({ name: m.name, oldFile: m.oldFile, strategy: m.matchStrategy, foundIn: m.foundInFiles })),
  stillMissing: stillMissing
};

fs.writeFileSync(path.join(AUDIT_DIR, 'js_deep_verify3.json'), JSON.stringify(result, null, 2), 'utf8');
console.log('\n[OK] Round 3 verification written to js_deep_verify3.json');
