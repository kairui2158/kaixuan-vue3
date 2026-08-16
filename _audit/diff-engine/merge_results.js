const fs = require('fs');
const path = require('path');
const DIR = 'D:/codex/novel-workshop-vue3/_audit/diff-engine/';
function loadJSON(name) { return JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8')); }
const rulesFinal = loadJSON('rules_final.json');
const rules = rulesFinal.rules;
console.log('[P18] rules_final.json loaded:', rules.length, 'rules');
const staticData = loadJSON('static_results.json');
const staticMap = {};
for (const r of staticData.results) { staticMap[r.rule_id] = r; }
console.log('[P18] static_results.json loaded:', staticData.results.length, 'results');
const behaviorData = loadJSON('behavior_results.json');
const behaviorMap = {};
for (const r of behaviorData.results) { behaviorMap[r.rule_id] = r; }
console.log('[P18] behavior_results.json loaded:', behaviorData.results.length, 'results');
const stateData = loadJSON('state_results.json');
const stateMap = {};
for (const r of stateData) { stateMap[r.rule_id] = r; }
console.log('[P18] state_results.json loaded:', stateData.length, 'results');
const cssData = loadJSON('css_diff_report.json');
const ipcData = loadJSON('ipc_channel_report.json');
const fixList = loadJSON('static_fix_list.json');
const fixMap = {};
if (fixList.items) { for (const item of fixList.items) { fixMap[item.rule_id] = item; } }
console.log('[P18] All input files loaded');
const diffMatrix = [];
let unmatched = 0;
for (const rule of rules) {
  const ruleId = rule.id;
  const ruleType = rule.type;
  let engine = 'unknown', status = 'NOT_CHECKED', detail = '', evidence = '', screenshot = null, classification = null;
  if (ruleType === 'existence' || ruleType === 'value') {
    engine = 'static';
    const sr = staticMap[ruleId];
    if (sr) { status = sr.status; detail = sr.detail || ''; evidence = sr.evidence || sr.detail || ''; const fx = fixMap[ruleId]; if (fx) { classification = fx.classification; } }
    else { status = 'NOT_CHECKED'; detail = 'Rule not found in static_results'; unmatched++; }
  } else if (ruleType === 'behavior') {
    engine = 'behavior';
    const br = behaviorMap[ruleId];
    if (br) { status = br.status; detail = br.detail || ''; evidence = br.evidence || br.detail || ''; screenshot = br.screenshot || null; }
    else { status = 'NOT_CHECKED'; detail = 'Rule not found in behavior_results'; unmatched++; }
  } else if (ruleType === 'state') {
    engine = 'state';
    const str = stateMap[ruleId];
    if (str) { status = str.status; detail = str.detail || ''; evidence = str.evidence || str.detail || ''; }
    else { status = 'NOT_CHECKED'; detail = 'Rule not found in state_results'; unmatched++; }
  } else { engine = 'unknown'; status = 'NOT_CHECKED'; detail = 'Unknown rule type: ' + ruleType; unmatched++; }
  diffMatrix.push({ rule_id: ruleId, layer: rule.layer, category: rule.category || '', type: ruleType, rule_text: rule.rule, engine, status, detail, evidence, screenshot, classification, target_files: rule.target_files || [] });
}
console.log('[P18] Merge complete:', diffMatrix.length, 'entries,', unmatched, 'unmatched');
const cssEntry = { rule_id: 'CSS-001', layer: 'T05', category: 'css_regression', type: 'value', rule_text: 'CSS variables and selectors regression check', engine: 'css', status: cssData.missing_vars === 0 ? 'MATCH' : 'MISMATCH', detail: 'Vars: ' + cssData.vars_matched + '/' + cssData.old_var_count + ' matched, Selectors: ' + cssData.selectors_matched + '/' + cssData.old_selector_count + ' matched (' + cssData.match_rate + ')', evidence: 'missing_vars=' + cssData.missing_vars + ', missing_selectors=' + cssData.missing_selectors + ', extra_selectors=' + cssData.extra_selectors, screenshot: null, classification: cssData.missing_selectors > 0 ? 'REAL_DEFECT' : 'ACCEPTABLE' };
const ipcEntry = { rule_id: 'IPC-001', layer: 'T13', category: 'ipc_channel', type: 'existence', rule_text: 'Electron IPC channel regression check', engine: 'ipc', status: ipcData.missing_channels.length === 0 ? 'MATCH' : 'MISSING', detail: 'Channels: ' + ipcData.old_channel_count + ' old, ' + ipcData.new_channel_count + ' new, missing=' + ipcData.missing_channels.length + ', orphan=' + ipcData.orphan_channels.length, evidence: 'missing_channels=' + JSON.stringify(ipcData.missing_channels) + ', orphan_channels=' + JSON.stringify(ipcData.orphan_channels), screenshot: null, classification: ipcData.orphan_channels.length > 0 ? 'REAL_DEFECT' : 'ACCEPTABLE' };
const summary = { total_rules: diffMatrix.length, total_with_enhanced: diffMatrix.length + 2, by_status: {}, by_engine: {}, by_layer: {}, match_rate: '' };
const allEntries = [...diffMatrix, cssEntry, ipcEntry];
for (const e of allEntries) {
  summary.by_status[e.status] = (summary.by_status[e.status] || 0) + 1;
  summary.by_engine[e.engine] = (summary.by_engine[e.engine] || 0) + 1;
  if (!summary.by_layer[e.layer]) { summary.by_layer[e.layer] = { total: 0, MATCH: 0, MISMATCH: 0, MISSING: 0, NOT_CHECKED: 0, ACCEPTABLE: 0 }; }
  summary.by_layer[e.layer].total++;
  if (summary.by_layer[e.layer][e.status] !== undefined) { summary.by_layer[e.layer][e.status]++; }
}
const matchCount = summary.by_status.MATCH || 0;
summary.match_rate = ((matchCount / allEntries.length) * 100).toFixed(1) + '%';
const output = { summary, css_report: cssEntry, ipc_report: ipcEntry, rules: diffMatrix };
fs.writeFileSync(path.join(DIR, 'diff_matrix_v2.json'), JSON.stringify(output, null, 2), 'utf8');
console.log('[P18] diff_matrix_v2.json written');
console.log('[P18] Summary:');
console.log('  Total rules (from rules_final):', diffMatrix.length);
console.log('  Total with CSS+IPC:', allEntries.length);
console.log('  By status:', JSON.stringify(summary.by_status));
console.log('  By engine:', JSON.stringify(summary.by_engine));
console.log('  Match rate:', summary.match_rate);
console.log('[P18] VERIFICATION: rules_final=' + rules.length + ', diff_matrix=' + diffMatrix.length + ', match=' + (rules.length === diffMatrix.length ? 'YES' : 'NO'));

