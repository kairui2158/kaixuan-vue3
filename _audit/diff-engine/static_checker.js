const fs = require('fs');
const path = require('path');

const rulesFile = 'D:/codex/novel-workshop-vue3/_audit/diff-engine/rules_final.json';
const vue3Root = 'D:/codex/novel-workshop-vue3';
const srcRoot = vue3Root + '/src';
const electronRoot = vue3Root + '/electron';
const outFile = 'D:/codex/novel-workshop-vue3/_audit/diff-engine/static_results.json';

const rulesData = JSON.parse(fs.readFileSync(rulesFile, 'utf8'));
const rules = rulesData.rules;

// Filter existence and value rules
const staticRules = rules.filter(r => r.type === 'existence' || r.type === 'value');
console.log('Static rules to check:', staticRules.length, '(existence:', rules.filter(r=>r.type==='existence').length, 'value:', rules.filter(r=>r.type==='value').length, ')');

// Cache file contents
const fileCache = {};
function readFile(filePath) {
  if (fileCache[filePath] !== undefined) return fileCache[filePath];
  const fullPath = path.resolve(vue3Root, filePath);
  try {
    if (!fs.existsSync(fullPath)) {
      fileCache[filePath] = null;
      return null;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    fileCache[filePath] = content;
    return content;
  } catch (e) {
    fileCache[filePath] = null;
    return null;
  }
}

// Resolve target file paths - handle different path formats
function resolveFilePath(targetFile) {
  // Already absolute or relative to vue3Root
  if (targetFile.startsWith('src/')) return targetFile;
  if (targetFile.startsWith('electron/')) return targetFile;
  if (targetFile === 'package.json' || targetFile === 'electron-builder.yml') return targetFile;
  // Try common prefixes
  if (targetFile.includes('.vue')) return 'src/components/' + targetFile;
  if (targetFile.includes('store') && targetFile.includes('.ts')) return 'src/stores/' + targetFile;
  if ((targetFile.includes('use') || targetFile.includes('composable')) && targetFile.includes('.ts')) return 'src/composables/' + targetFile;
  if (targetFile.includes('.js') && !targetFile.includes('electron')) return 'src/services/' + targetFile;
  if (targetFile.includes('main.js') || targetFile.includes('preload')) return 'electron/' + targetFile;
  return targetFile;
}

// Extract all searchable keywords from a rule
function getSearchTerms(rule) {
  const terms = [];
  if (rule.search_keyword) terms.push(rule.search_keyword);
  
  // Extract identifiers from rule text
  const text = rule.rule;
  
  // Function names (camelCase or snake_case)
  const fnMatches = text.match(/[a-zA-Z_][a-zA-Z0-9_]{3,}/g);
  if (fnMatches) {
    for (const m of fnMatches) {
      if (m.length >= 4 && !['必须', '保持', '不变', '检测', '规则', '注意', '迁移', '行为', '契约', '保留', '修复', '改进', '新增', '应保', '应该', '可以', '需要', '确保'].includes(m)) {
        terms.push(m);
      }
    }
  }
  
  // Specific technical terms
  const techTerms = text.match(/(contextIsolation|nodeIntegration|safeStorage|sendSync|ipcRenderer|contextBridge|AbortController|AbortSignal|TextDecoder|JSON\.parse|JSON\.stringify|localStorage|setInterval|setTimeout|requestAnimationFrame|Promise\.all|Promise\.race|electron-builder|NSIS|marked|hotkeys|contenteditable|DragEvent|getSelection|execCommand|DiagLogger|StorageManager|ProviderManager|AgentManager|SkillManager|ProjectManager|ChapterManager|SkillExecutionEngine)/g);
  if (techTerms) terms.push(...techTerms);
  
  // IPC channel names
  const ipcMatches = text.match(/storage:read|storage:write|storage:remove|storage:list|storage:export|storage:import|storage:getDataDir|safe:encrypt|safe:decrypt|dialog:saveFile|dialog:openFile|app:finalSave|app:quit|app:requestClose|app:closeChoice|diag:write|diag:read|diag:export|diag:clear|api:fetchModels/g);
  if (ipcMatches) terms.push(...ipcMatches);
  
  // Deduplicate and filter
  const unique = [...new Set(terms)].filter(t => t.length >= 3);
  return unique;
}

// Check if a keyword exists in file content
function searchInContent(content, keyword) {
  if (!content) return false;
  return content.includes(keyword);
}

// Extract value from content near a keyword
function extractValueNear(content, keyword) {
  if (!content) return null;
  const idx = content.indexOf(keyword);
  if (idx === -1) return null;
  // Look at surrounding context (100 chars after keyword)
  const context = content.substring(idx, Math.min(idx + 100, content.length));
  
  // Try to extract value patterns
  // Pattern: keyword = value or keyword: value
  const assignMatch = context.match(new RegExp(keyword + '[\s]*[:=]\s*([\w.\'\"-]+)'));
  if (assignMatch) return assignMatch[1];
  
  // Pattern: keyword(value) or keyword(value,
  const callMatch = context.match(new RegExp(keyword + '\\(([^)]+)'));
  if (callMatch) return callMatch[1];
  
  return null;
}

// === MAIN STATIC CHECK ===

const results = [];
let matchCount = 0, mismatchCount = 0, missingCount = 0, skipCount = 0;

for (const rule of staticRules) {
  const searchTerms = getSearchTerms(rule);
  const targetFiles = rule.target_files || [];
  
  if (targetFiles.length === 0) {
    results.push({
      rule_id: rule.id, layer: rule.layer, type: rule.type,
      rule: rule.rule.substring(0, 80),
      status: 'SKIP', detail: 'No target files', evidence: null
    });
    skipCount++;
    continue;
  }
  
  let found = false;
  let foundInFile = null;
  let foundKeyword = null;
  let foundValue = null;
  
  for (const targetFile of targetFiles) {
    const resolvedPath = resolveFilePath(targetFile);
    const content = readFile(resolvedPath);
    
    if (!content) continue;
    
    // Search for any of the terms
    for (const term of searchTerms) {
      if (searchInContent(content, term)) {
        found = true;
        foundInFile = resolvedPath;
        foundKeyword = term;
        
        // For value rules, extract and compare
        if (rule.type === 'value' && rule.expected_value) {
          foundValue = extractValueNear(content, term);
        }
        break;
      }
    }
    if (found) break;
  }
  
  let status, detail, evidence;
  
  if (found) {
    if (rule.type === 'value' && rule.expected_value && foundValue) {
      // Compare values
      if (foundValue.includes(rule.expected_value) || rule.expected_value.includes(foundValue)) {
        status = 'MATCH';
        detail = 'Value matches: ' + rule.expected_value;
        matchCount++;
      } else {
        status = 'MISMATCH';
        detail = 'Expected: ' + rule.expected_value + ', Found: ' + foundValue;
        mismatchCount++;
      }
    } else {
      status = 'MATCH';
      detail = 'Found keyword: ' + foundKeyword;
      matchCount++;
    }
    evidence = foundInFile + ' (keyword: ' + foundKeyword + ')';
  } else {
    status = 'MISSING';
    detail = 'None of ' + searchTerms.length + ' keywords found in ' + targetFiles.length + ' files';
    evidence = null;
    missingCount++;
  }
  
  results.push({
    rule_id: rule.id, layer: rule.layer, type: rule.type,
    rule: rule.rule.substring(0, 80),
    status: status, detail: detail, evidence: evidence,
    search_terms: searchTerms.slice(0, 5),
    target_files_checked: targetFiles.length
  });
}

// === P6: SUMMARY ===

const byLayer = {};
for (const r of results) {
  if (!byLayer[r.layer]) byLayer[r.layer] = { MATCH: 0, MISMATCH: 0, MISSING: 0, SKIP: 0 };
  byLayer[r.layer][r.status]++;
}

const summary = {
  total: results.length,
  MATCH: matchCount,
  MISMATCH: mismatchCount,
  MISSING: missingCount,
  SKIP: skipCount,
  match_rate: ((matchCount / results.length) * 100).toFixed(1) + '%',
  by_layer: byLayer
};

// === P7: REPORT ===

let report = '# Static Detection Report\n\n';
report += '## Summary\n';
report += '- Total rules checked: ' + results.length + '\n';
report += '- MATCH: ' + matchCount + ' (' + ((matchCount / results.length) * 100).toFixed(1) + '%)\n';
report += '- MISMATCH: ' + mismatchCount + '\n';
report += '- MISSING: ' + missingCount + '\n';
report += '- SKIP: ' + skipCount + '\n\n';
report += '## By Layer\n';
report += '| Layer | MATCH | MISMATCH | MISSING | SKIP |\n';
report += '|-------|-------|----------|---------|-----|\n';
for (const [layer, counts] of Object.entries(byLayer).sort()) {
  report += '| ' + layer + ' | ' + counts.MATCH + ' | ' + counts.MISMATCH + ' | ' + counts.MISSING + ' | ' + counts.SKIP + ' |\n';
}
report += '\n## MISMATCH Details\n';
for (const r of results.filter(r => r.status === 'MISMATCH')) {
  report += '### ' + r.rule_id + ' (' + r.layer + ')\n';
  report += '- Rule: ' + r.rule + '\n';
  report += '- Detail: ' + r.detail + '\n';
  report += '- Evidence: ' + r.evidence + '\n\n';
}
report += '\n## MISSING Details\n';
for (const r of results.filter(r => r.status === 'MISSING')) {
  report += '### ' + r.rule_id + ' (' + r.layer + ')\n';
  report += '- Rule: ' + r.rule + '\n';
  report += '- Detail: ' + r.detail + '\n';
  report += '- Search terms: ' + (r.search_terms || []).join(', ') + '\n';
  report += '- Files checked: ' + r.target_files_checked + '\n\n';
}

// Write outputs
const fullOutput = { summary, results };
fs.writeFileSync(outFile, JSON.stringify(fullOutput, null, 2), 'utf8');
fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/diff-engine/static_report.md', report, 'utf8');
fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/diff-engine/static_summary.json', JSON.stringify(summary, null, 2), 'utf8');

console.log('=== P5-P7 Complete ===');
console.log('Total checked:', results.length);
console.log('MATCH:', matchCount, '(' + ((matchCount / results.length) * 100).toFixed(1) + '%)');
console.log('MISMATCH:', mismatchCount);
console.log('MISSING:', missingCount);
console.log('SKIP:', skipCount);
console.log('Report: static_report.md');
console.log('Results: static_results.json');
