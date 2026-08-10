const fs = require('fs');
const path = require('path');

const AUDIT_DIR = __dirname;
const SRC_DIR = path.join(__dirname, '..', 'src');

const finalData = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, 'js_final_classification.json'), 'utf8'));
const needVerify = finalData.results.filter(r => r.needsFix);

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

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function safeSearch(term, blob) {
  if (!term || term.length < 3) return false;
  const clean = term.replace(/[\r\n\t]/g, '').trim();
  if (clean.length < 3) return false;
  try {
    const re = new RegExp(escapeRegex(clean), 'i');
    return re.test(blob);
  } catch(e) { return false; }
}

const results = [];

for (const m of needVerify) {
  const name = m.name;
  const impl = m.impl || '';
  const noUnder = name.replace(/^_+/, '');

  const elementIds = [];
  const idMatches = impl.match(/getElementById\(['"]([^'"]+)['"]\)/g);
  if (idMatches) idMatches.forEach(match => {
    const id = match.match(/['"]([^'"]+)['"]/);
    if (id) elementIds.push(id[1]);
  });

  const strings = [];
  const strMatches = impl.match(/['"]([^'"]{5,})['"]/g);
  if (strMatches) strMatches.forEach(s => {
    const val = s.replace(/^['"]|['"]$/g, '');
    if (/[\u4e00-\u9fa5]/.test(val) || val.includes('api') || val.includes('skill') || val.includes('agent')) {
      strings.push(val);
    }
  });

  const calls = [];
  const callMatches = impl.match(/(?:this\.|AgentManager\.|SkillManager\.|StorageManager\.|ProviderManager\.|PipelineManager\.|ProjectManager\.|DiagLogger\.)\w+/g);
  if (callMatches) callMatches.forEach(c => calls.push(c));

  let foundScore = 0;
  let foundEvidence = [];

  if (safeSearch(noUnder, newBlob)) { foundScore += 3; foundEvidence.push('name: ' + noUnder); }

  for (const id of elementIds.slice(0, 5)) {
    if (safeSearch(id, newBlob)) { foundScore += 1; foundEvidence.push('id: ' + id); }
  }

  for (const s of strings.slice(0, 3)) {
    if (s.length > 8 && safeSearch(s.substring(0, 20), newBlob)) { foundScore += 2; foundEvidence.push('str: ' + s.substring(0, 20).replace(/[\r\n]/g, '')); }
  }

  for (const c of calls.slice(0, 3)) {
    const cleanCall = c.replace(/^this\./, '');
    if (safeSearch(cleanCall, newBlob)) { foundScore += 1; foundEvidence.push('call: ' + cleanCall); }
  }

  let status = '';
  if (foundScore >= 5) status = 'LOGIC_EXISTS';
  else if (foundScore >= 2) status = 'PARTIALLY_EXISTS';
  else status = 'GENUINELY_MISSING';

  results.push({
    name, oldFile: m.oldFile, defType: m.defType, foundScore,
    foundEvidence: foundEvidence.join('; '), status,
    elementIds: elementIds.slice(0, 5), keyStrings: strings.slice(0, 3), keyCalls: calls.slice(0, 3)
  });
}

const statusCounts = {};
for (const r of results) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;

console.log('\n=== CONTENT MATCH RESULTS ===');
console.log('Total need verification:', results.length);
for (const [s, c] of Object.entries(statusCounts)) console.log('  ' + s + ': ' + c);

console.log('\n=== GENUINELY MISSING ===');
results.filter(r => r.status === 'GENUINELY_MISSING').forEach((r, i) => {
  console.log((i+1) + '. ' + r.name + ' (from ' + r.oldFile + ') score=' + r.foundScore);
  console.log('    evidence: ' + (r.foundEvidence || 'none'));
  console.log('    strings: ' + (r.keyStrings || []).join(', '));
  console.log('    calls: ' + (r.keyCalls || []).join(', '));
});

console.log('\n=== PARTIALLY EXISTS ===');
results.filter(r => r.status === 'PARTIALLY_EXISTS').forEach((r, i) => {
  console.log((i+1) + '. ' + r.name + ' (from ' + r.oldFile + ') score=' + r.foundScore);
  console.log('    evidence: ' + r.foundEvidence);
});

fs.writeFileSync(path.join(AUDIT_DIR, 'js_content_match.json'), JSON.stringify({
  summary: { total: results.length, statusCounts }, results
}, null, 2), 'utf8');
console.log('\n[OK] Content match written to js_content_match.json');
