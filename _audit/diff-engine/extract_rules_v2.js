const fs = require('fs');
const path = require('path');

const manualDir = 'D:/codex/novel-workshop-vue3/_audit/manual';
const outFile = 'D:/codex/novel-workshop-vue3/_audit/diff-engine/rules_raw.json';

// Load all 23 layer files
const layers = [];
for (let i = 1; i <= 23; i++) {
  const prefix = 'T' + String(i).padStart(2, '0');
  const files = fs.readdirSync(manualDir).filter(f => f.startsWith(prefix) && f.endsWith('.md'));
  if (files.length > 0) layers.push({ id: prefix, file: files[0] });
}

let ruleId = 1;
const rules = [];

// Keyword-based type classification
function classifyType(text) {
  // value: checks specific values, defaults, formats, paths
  if (text.match(/必须为|默认|=|格式|前缀|目录|路径|毫秒|秒|true|false|0\.7|0\.3|128000|4096|15000|600000|30000|60秒|10分钟|30秒|3秒|wa_|enc:|\.json|sendSync|invoke/)) return 'value';
  // behavior: checks user actions and interactions
  if (text.match(/行为|操作|切换|点击|发送|保存|生成|关闭|拖拽|重命名|按.*键|Enter|Escape|Ctrl|快捷键|事件|委托|冒泡|右键|双击|选区|菜单|模态框|面板|流式|渲染/)) return 'behavior';
  // state: checks state after operations
  if (text.match(/状态|同步|持久化|更新|刷新|缓存|store|Pinia|响应式|脏标记/)) return 'state';
  // existence: checks if something exists
  return 'existence';
}

// Extract keyword for searching in Vue3 source
function extractKeyword(text) {
  // Try to find function names, variable names, config keys
  const fnMatch = text.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
  if (fnMatch) return fnMatch[1];
  const varMatch = text.match(/([a-zA-Z_][a-zA-Z0-9_]{3,})/);
  if (varMatch) return varMatch[1];
  return text.substring(0, 20);
}

// Split text into individual rules by semicolons, periods, or newlines
function splitRules(text) {
  if (!text) return [];
  text = text.replace(/\n\s*\n/g, '\n').replace(/^\s+/gm, '').trim();
  // Split by semicolons (Chinese and English), or numbered list items
  let parts = text.split(/[；;\n]/).map(s => s.trim()).filter(s => s.length > 5);
  // Also split by numbered list markers (1. 2. etc)
  const expanded = [];
  for (const p of parts) {
    const numMatch = p.match(/^\d+\.\s*(.+)/);
    if (numMatch) {
      expanded.push(numMatch[1].trim());
    } else {
      expanded.push(p);
    }
  }
  return expanded.filter(s => s.length > 5);
}

// Deduplicate against existing rules
function isDuplicate(ruleText) {
  const snippet = ruleText.substring(0, 20);
  return rules.some(r => r.rule.includes(snippet) || snippet.includes(r.rule.substring(0, 20)));
}

function addRule(layerId, category, ruleText, source) {
  ruleText = ruleText.trim();
  if (ruleText.length < 5) return;
  if (isDuplicate(ruleText)) return;
  const type = classifyType(ruleText);
  const keyword = extractKeyword(ruleText);
  rules.push({
    id: 'R' + String(ruleId++).padStart(3, '0'),
    layer: layerId,
    category: category,
    rule: ruleText,
    type: type,
    search_keyword: keyword,
    source: source,
    target: 'pending',
    check: 'pending'
  });
}

// === PATTERN EXTRACTION FUNCTIONS ===

// Pattern A: "差异检测规则：" followed by semicolon-separated rules
// Also handles table format under "差异检测规则" heading
function extractPatternA(content, layerId) {
  // Match section headers like "## XX. Vue3迁移差异检测规则" or "### XX.X 差异检测规则"
  const headerRe = /(?:差异检测规则)[：:\s]*\n([\s\S]*?)(?=\n## |\n---|\n\*手册|\n\*版|$)/g;
  let m;
  while ((m = headerRe.exec(content)) !== null) {
    let block = m[1].trim();
    // Check if it's a table format (has | characters)
    if (block.includes('|')) {
      // Parse table rows - extract the Vue3期望行为 column
      const lines = block.split('\n').filter(l => l.includes('|') && !l.match(/^\|[-\s|]+\|$/));
      for (const line of lines) {
        const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
        if (cells.length >= 3) {
          // Use the rule description (usually 2nd or 3rd column)
          const ruleText = cells[cells.length - 1].length > 10 ? cells[cells.length - 1] : cells[1];
          if (ruleText.length > 5) addRule(layerId, 'diff_rule_table', ruleText, 'PatternA-table');
        }
      }
    } else {
      // Semicolon-separated text
      const ruleParts = splitRules(block);
      for (const p of ruleParts) addRule(layerId, 'diff_rule', p, 'PatternA-text');
    }
  }
}

// Pattern B: "必须保留：" + "必须修复：" + "必须改进：" + "必须新增：" paragraphs
function extractPatternB(content, layerId) {
  const sections = [
    { cat: 'must_keep', re: /必须保留[：:]\s*([\s\S]*?)(?=必须修复|必须改进|必须新增|差异检测|\n## |\n---|\n\*手册|\n\*版|$)/ },
    { cat: 'must_fix', re: /必须修复[：:]\s*([\s\S]*?)(?=必须改进|必须新增|差异检测|\n## |\n---|\n\*手册|\n\*版|$)/ },
    { cat: 'must_improve', re: /必须改进[：:]\s*([\s\S]*?)(?=必须新增|差异检测|\n## |\n---|\n\*手册|\n\*版|$)/ },
    { cat: 'must_new', re: /必须新增[：:]\s*([\s\S]*?)(?=差异检测|\n## |\n---|\n\*手册|\n\*版|$)/ }
  ];
  for (const sec of sections) {
    const m = content.match(sec.re);
    if (m) {
      const ruleParts = splitRules(m[1]);
      for (const p of ruleParts) addRule(layerId, sec.cat, p, 'PatternB');
    }
  }
}

// Pattern C: "## 迁移注意" or "### 迁移注意" + numbered list (1. 2. 3.)
function extractPatternC(content, layerId) {
  const re = /(?:##|###)\s*迁移注意[：:]?\s*\n([\s\S]*?)(?=\n## |\n---|\n\*手册|\n\*版|$)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const block = m[1].trim();
    // Split by numbered list items
    const items = block.split(/\n(?=\d+\.\s)/).map(s => s.replace(/^\d+\.\s*/, '').trim()).filter(s => s.length > 5);
    for (const item of items) addRule(layerId, 'migrate_note', item, 'PatternC');
    // If no numbered items found, try line-by-line
    if (items.length === 0) {
      const lines = splitRules(block);
      for (const l of lines) addRule(layerId, 'migrate_note', l, 'PatternC-line');
    }
  }
}

// Pattern D: "差异检测要点" section with sub-sections (必须保留/必须修复 etc inside)
function extractPatternD(content, layerId) {
  // Find the "差异检测要点" section
  const sectionRe = /差异检测要点[：:]?\s*\n([\s\S]*?)(?=\n## |\n---|\n\*手册|\n\*版|$)/g;
  let m;
  while ((m = sectionRe.exec(content)) !== null) {
    const section = m[1];
    // This section may contain numbered lists like "1.双模式存储..." or sub-paragraphs
    // Try numbered list first - only if it produces multiple items
    const numItems = section.split(/\n(?=\d+[.、]\s*)/).map(s => s.replace(/^\d+[.、]\s*/, '').trim()).filter(s => s.length > 5);
    if (numItems.length > 1) {
      for (const item of numItems) addRule(layerId, 'diff_point', item, 'PatternD-numbered');
    } else {
      // No numbered list - split by semicolons/newlines, but only if multiple parts
      const parts = splitRules(section);
      if (parts.length > 1) {
        for (const p of parts) addRule(layerId, 'diff_point', p, 'PatternD-semicolon');
      }
    }
  }
}

// Pattern E: Scattered "Vue3迁移注意事项" or "迁移注意" paragraphs (T01-T05 style)
// These are sections like "## 10. Vue3迁移注意事项 (8条)" with numbered list
function extractPatternE(content, layerId) {
  // Match "Vue3迁移注意" sections
  const re1 = /Vue3迁移注意[\s\S]*?\n([\s\S]*?)(?=\n## |\n---|\n\*手册|\n\*版|$)/g;
  let m;
  while ((m = re1.exec(content)) !== null) {
    const block = m[1].trim();
    // Parse numbered list items
    const items = block.split(/\n(?=\d+\.\s)/).map(s => s.replace(/^\d+\.\s*/, '').trim()).filter(s => s.length > 5);
    for (const item of items) addRule(layerId, 'vue3_migrate', item, 'PatternE');
    if (items.length === 0) {
      const lines = splitRules(block);
      for (const l of lines) addRule(layerId, 'vue3_migrate', l, 'PatternE-line');
    }
  }
}

// Pattern F: "行为契约" tables/lists - extract behavioral contracts
function extractPatternF(content, layerId) {
  const re = /行为契约[：:]?\s*\n([\s\S]*?)(?=\n## |\n---|\n\*手册|\n\*版|$)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const block = m[1].trim();
    // Parse numbered list or table rows
    const items = block.split(/\n(?=\d+[.、]\s*)/).map(s => s.replace(/^\d+[.、]\s*/, '').trim()).filter(s => s.length > 5);
    for (const item of items) addRule(layerId, 'behavior_contract', item, 'PatternF');
  }
}

// Pattern G: "迁移注意" tables with numbered rows
function extractPatternG(content, layerId) {
  // Match tables like "| 编号 | 注意事项 | Vue3对应方案 |"
  const re = /迁移注意[\s\S]*?\n([\s\S]*?)(?=\n## |\n---|\n\*手册|\n\*版|$)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const block = m[1].trim();
    if (block.includes('|')) {
      // Table format - extract 注意事项 column
      const lines = block.split('\n').filter(l => l.includes('|') && !l.match(/^\|[-\s|]+\|$/));
      for (const line of lines) {
        const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
        if (cells.length >= 2) {
          // Skip header row
          if (cells[0].match(/编号|序号/i)) continue;
          const ruleText = cells[1]; // 注意事项 column
          if (ruleText.length > 5) addRule(layerId, 'migrate_table', ruleText, 'PatternG');
        }
      }
    }
  }
}

// === MAIN EXTRACTION LOOP ===

for (const layer of layers) {
  const content = fs.readFileSync(path.join(manualDir, layer.file), 'utf8');
  
  // Apply all patterns - order matters for deduplication
  // Pattern D first (差异检测要点 - most structured)
  extractPatternD(content, layer.id);
  // Pattern A (差异检测规则)
  extractPatternA(content, layer.id);
  // Pattern B (必须保留/必须修复/必须改进/必须新增)
  extractPatternB(content, layer.id);
  // Pattern E (Vue3迁移注意事项 - T01-T05 style)
  extractPatternE(content, layer.id);
  // Pattern C (迁移注意 - T20-T23 style)
  extractPatternC(content, layer.id);
  // Pattern G (迁移注意 tables)
  extractPatternG(content, layer.id);
  // Pattern F (行为契约)
  extractPatternF(content, layer.id);
}

// === ENSURE MINIMUM COVERAGE ===
// For layers with very few rules, extract key contracts from the content
for (const layer of layers) {
  const layerRules = rules.filter(r => r.layer === layer.id);
  if (layerRules.length < 3) {
    const content = fs.readFileSync(path.join(manualDir, layer.file), 'utf8');
    // Extract from any section with numbered lists
    const sections = content.split(/\n## /);
    for (const section of sections) {
      const lines = section.split('\n');
      const heading = lines[0] || '';
      // Look for behavior/contract/migration related sections
      if (heading.match(/行为|契约|迁移|注意|检测|差异|规格|关键/)) {
        const body = lines.slice(1).join('\n');
        const numItems = body.split(/\n(?=\d+[.、]\s*)/).map(s => s.replace(/^\d+[.、]\s*/, '').trim()).filter(s => s.length > 10);
        for (const item of numItems) {
          if (layerRules.length + rules.filter(r => r.layer === layer.id).length >= 3) break;
          addRule(layer.id, 'fallback_extract', item, 'Fallback-min3');
        }
      }
    }
  }
}

// === OUTPUT ===

const byLayer = {};
for (const r of rules) {
  byLayer[r.layer] = (byLayer[r.layer] || 0) + 1;
}

const byType = {};
for (const r of rules) {
  byType[r.type] = (byType[r.type] || 0) + 1;
}

const byCategory = {};
for (const r of rules) {
  byCategory[r.category] = (byCategory[r.category] || 0) + 1;
}

const output = {
  total: rules.length,
  layers_covered: Object.keys(byLayer).length,
  by_layer: byLayer,
  by_type: byType,
  by_category: byCategory,
  rules: rules
};

fs.writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf8');

console.log('=== Rules Extraction Complete ===');
console.log('Total rules:', rules.length);
console.log('Layers covered:', Object.keys(byLayer).length);
console.log('By layer:');
for (const [layer, count] of Object.entries(byLayer).sort()) console.log('  ' + layer + ': ' + count);
console.log('By type:');
for (const [type, count] of Object.entries(byType).sort()) console.log('  ' + type + ': ' + count);
console.log('By category:');
for (const [cat, count] of Object.entries(byCategory).sort()) console.log('  ' + cat + ': ' + count);

// Verify minimum coverage
const uncoveredLayers = [];
for (let i = 1; i <= 23; i++) {
  const id = 'T' + String(i).padStart(2, '0');
  if (!byLayer[id] || byLayer[id] < 3) uncoveredLayers.push(id + '(' + (byLayer[id] || 0) + ')');
}
if (uncoveredLayers.length > 0) {
  console.log('WARNING: Layers with < 3 rules:', uncoveredLayers.join(', '));
} else {
  console.log('All 23 layers have >= 3 rules');
}
if (rules.length >= 120) {
  console.log('PASS: Total rules >= 120');
} else {
  console.log('WARNING: Total rules < 120, may need manual supplementation');
}
