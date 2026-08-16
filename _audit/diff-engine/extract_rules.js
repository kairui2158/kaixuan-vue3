const fs = require('fs');
const path = require('path');
const manualDir = 'D:/codex/novel-workshop-vue3/_audit/manual';
const outFile = 'D:/codex/novel-workshop-vue3/_audit/diff-engine/rules_raw.json';
const layers = [];
for (let i = 1; i <= 23; i++) {
  const prefix = 'T' + String(i).padStart(2, '0');
  const files = fs.readdirSync(manualDir).filter(f => f.startsWith(prefix) && f.endsWith('.md'));
  if (files.length > 0) layers.push({ id: prefix, file: files[0] });
}
const rules = [];
let ruleId = 1;
for (const layer of layers) {
  const content = fs.readFileSync(path.join(manualDir, layer.file), 'utf8');
  const diffMatch = content.match(/差异检测规则[：:]\s*\n([\s\S]*?)(?=\n## |\n---|\n\*手册|$)/);
  const keepMatch = content.match(/必须保留[：:]\s*([\s\S]*?)(?=必须修复|必须改进|必须新增|差异检测|\n## |\n---|\n\*手册|$)/);
  const fixMatch = content.match(/必须修复[：:]\s*([\s\S]*?)(?=必须改进|必须新增|差异检测|\n## |\n---|\n\*手册|$)/);
  const improveMatch = content.match(/必须改进[：:]\s*([\s\S]*?)(?=必须新增|差异检测|\n## |\n---|\n\*手册|$)/);
  function parseRules(text, category) {
    if (!text) return [];
    text = text.replace(/\n\s*\n/g, '\n').replace(/^\s+/gm, '');
    const parts = text.split(/[；;。\.\n]/).map(s => s.trim()).filter(s => s.length > 3);
    return parts.map(p => ({ id: 'R' + String(ruleId++).padStart(3, '0'), layer: layer.id, category, rule: p, type: 'pending', target: 'pending', check: 'pending' }));
  }
  if (diffMatch) {
    const parts = diffMatch[1].split(/[；;]/).map(s => s.trim()).filter(s => s.length > 3);
    for (const p of parts) {
      let type = 'existence';
      if (p.match(/必须为|默认|=|格式|前缀|目录|路径|毫秒|秒|true|false/)) type = 'value';
      if (p.match(/行为|操作|切换|点击|发送|保存|生成|关闭|拖拽|重命名/)) type = 'behavior';
      rules.push({ id: 'R' + String(ruleId++).padStart(3, '0'), layer: layer.id, category: 'diff_rule', rule: p, type, target: 'pending', check: 'pending' });
    }
  }
  const keepRules = parseRules(keepMatch ? keepMatch[1] : '', 'must_keep');
  const fixRules = parseRules(fixMatch ? fixMatch[1] : '', 'must_fix');
  const improveRules = parseRules(improveMatch ? improveMatch[1] : '', 'must_improve');
  for (const r of [...keepRules, ...fixRules, ...improveRules]) {
    const exists = rules.some(x => x.rule.includes(r.rule.substring(0, 10)) || r.rule.includes(x.rule.substring(0, 10)));
    if (!exists) rules.push(r);
  }
}
const output = { total: rules.length, layers: layers.length, rules };
fs.writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf8');
console.log('Rules extracted:', rules.length, 'from', layers.length, 'layers');
const byLayer = {};
for (const r of rules) byLayer[r.layer] = (byLayer[r.layer] || 0) + 1;
console.log('By layer:');
for (const [layer, count] of Object.entries(byLayer).sort()) console.log('  ' + layer + ': ' + count + ' rules');
const fs = require('fs');
const path = require('path');
const manualDir = 'D:/codex/novel-workshop-vue3/_audit/manual';
const outFile = 'D:/codex/novel-workshop-vue3/_audit/diff-engine/rules_raw.json';
const layers = [];
for (let i = 1; i <= 23; i++) {
  const prefix = 'T' + String(i).padStart(2, '0');
  const files = fs.readdirSync(manualDir).filter(f => f.startsWith(prefix) && f.endsWith('.md'));
  if (files.length > 0) layers.push({ id: prefix, file: files[0] });
}
const rules = [];
let ruleId = 1;
function parseRules(text, category) {
  if (!text) return [];
  text = text.replace(/\n\s*\n/g, '\n').replace(/^\s+/gm, '');
  const parts = text.split(/[；;。\n]/).map(s => s.trim()).filter(s => s.length > 3);
  return parts.map(p => ({ id: 'R' + String(ruleId++).padStart(3, '0'), layer: '', category, rule: p, type: 'pending', target: 'pending', check: 'pending' }));
}
for (const layer of layers) {
  const content = fs.readFileSync(path.join(manualDir, layer.file), 'utf8');
  const allRules = [];
  // Pattern 1: 差异检测规则 section
  const diffMatch = content.match(/差异检测规则[：:]\s*\n([\s\S]*?)(?=\n## |\n---|\n\*手册|$)/);
  if (diffMatch) {
    const parts = diffMatch[1].split(/[；;]/).map(s => s.trim()).filter(s => s.length > 3);
    for (const p of parts) {
      let type = 'existence';
      if (p.match(/必须为|默认|=|格式|前缀|目录|路径|毫秒|秒|true|false/)) type = 'value';
      if (p.match(/行为|操作|切换|点击|发送|保存|生成|关闭|拖拽|重命名/)) type = 'behavior';
      allRules.push({ category: 'diff_rule', rule: p, type });
    }
  }
  // Pattern 2: 必须保留/必须修复/必须改进/必须新增
  for (const [cat, pat] of [['must_keep', /必须保留[：:]\s*([\s\S]*?)(?=必须修复|必须改进|必须新增|差异检测|\n## |\n---|\n\*手册|$)/], ['must_fix', /必须修复[：:]\s*([\s\S]*?)(?=必须改进|必须新增|差异检测|\n## |\n---|\n\*手册|$)/], ['must_improve', /必须改进[：:]\s*([\s\S]*?)(?=必须新增|差异检测|\n## |\n---|\n\*手册|$)/], ['must_new', /必须新增[：:]\s*([\s\S]*?)(?=差异检测|\n## |\n---|\n\*手册|$)/]]) {
    const m = content.match(pat);
    if (m) for (const r of parseRules(m[1], cat)) allRules.push({ category: r.category, rule: r.rule, type: r.type });
  }
  // Pattern 3: 迁移注意 section (T20-T23 style)
  const migrateMatch = content.match(/## \s*迁移注意[\s\S]*?\n([\s\S]*?)(?=\n## |\n---|\n\*手册|$)/);
  if (migrateMatch) {
    for (const r of parseRules(migrateMatch[1], 'migrate_note')) allRules.push({ category: r.category, rule: r.rule, type: r.type });
  }
  // Pattern 4: Vue3迁移 section (T01-T11 style - may use different headings)
  const vue3Match = content.match(/Vue3迁移[\s\S]*?\n([\s\S]*?)(?=\n## |\n---|\n\*手册|$)/);
  if (vue3Match) {
    for (const r of parseRules(vue3Match[1], 'vue3_migrate')) allRules.push({ category: r.category, rule: r.rule, type: r.type });
  }
  // Pattern 5: 迁移注意 numbered list (T01-T11 may use 1. 2. 3. format)
  const numberedMatch = content.match(/迁移注意[：:]?\s*\n([\s\S]*?)(?=\n## |\n---|\n\*手册|$)/);
  if (numberedMatch) {
    const items = numberedMatch[1].split(/\n/).map(s => s.replace(/^\d+\.\s*/, '').trim()).filter(s => s.length > 5);
    for (const item of items) {
      const exists = allRules.some(r => r.rule.includes(item.substring(0, 10)) || item.includes(r.rule.substring(0, 10)));
      if (!exists) allRules.push({ category: 'migrate_note', rule: item, type: 'existence' });
    }
  }
  // Deduplicate and assign layer
  for (const r of allRules) {
    const exists = rules.some(x => x.rule.includes(r.rule.substring(0, 15)) || r.rule.includes(x.rule.substring(0, 15)));
    if (!exists) {
      rules.push({ id: 'R' + String(ruleId++).padStart(3, '0'), layer: layer.id, ...r, target: 'pending', check: 'pending' });
    }
  }
}
const output = { total: rules.length, layers: layers.length, rules };
fs.writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf8');
console.log('Rules extracted:', rules.length, 'from', layers.length, 'layers');
const byLayer = {};
for (const r of rules) byLayer[r.layer] = (byLayer[r.layer] || 0) + 1;
console.log('By layer:');
for (const [layer, count] of Object.entries(byLayer).sort()) console.log('  ' + layer + ': ' + count + ' rules');
