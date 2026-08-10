const fs = require('fs');

const oldData = JSON.parse(fs.readFileSync('D:/codex/novel-workshop-vue3/_audit/old_html_full_scan.json', 'utf8'));
const newData = JSON.parse(fs.readFileSync('D:/codex/novel-workshop-vue3/_audit/new_vue_full_scan.json', 'utf8'));

// Normalize: old uses raw ids, new may have dynamic :id bindings
const oldIds = new Set(oldData.ids);
const newIds = new Set(newData.ids);

// For classes, also check if new has them via :class dynamic
const oldClasses = new Set(oldData.classes);
const newClasses = new Set(newData.classes);

// Find missing IDs
const missingIds = [...oldIds].filter(id => !newIds.has(id) && !newIds.has(':' + id));
const extraNewIds = [...newIds].filter(id => !oldIds.has(id) && !oldIds.has(id.replace(/^:/, '')));

// Find missing classes
const missingClasses = [...oldClasses].filter(cls => !newClasses.has(cls));
const extraNewClasses = [...newClasses].filter(cls => !oldClasses.has(cls));

// Categorize missing IDs by functional area
function categorizeId(id) {
  const lower = id.toLowerCase();
  if (lower.includes('modal') || lower.includes('dialog')) return 'MODAL';
  if (lower.includes('sidebar') || lower.includes('nav') || lower.includes('panel')) return 'NAV/PANEL';
  if (lower.includes('chat') || lower.includes('message') || lower.includes('input') || lower.includes('send')) return 'CHAT';
  if (lower.includes('editor') || lower.includes('code') || lower.includes('find') || lower.includes('replace')) return 'EDITOR';
  if (lower.includes('pipeline') || lower.includes('step') || lower.includes('stage')) return 'PIPELINE';
  if (lower.includes('chapter') || lower.includes('volume') || lower.includes('book') || lower.includes('tree') || lower.includes('project')) return 'CHAPTER_TREE';
  if (lower.includes('setting') || lower.includes('config') || lower.includes('api') || lower.includes('skill') || lower.includes('agent') || lower.includes('appearance') || lower.includes('deai') || lower.includes('diag')) return 'SETTINGS';
  if (lower.includes('plugin') || lower.includes('market')) return 'PLUGIN';
  if (lower.includes('memory') || lower.includes('context')) return 'MEMORY';
  if (lower.includes('outline') || lower.includes('workspace')) return 'OUTLINE';
  if (lower.includes('status') || lower.includes('bar') || lower.includes('toast') || lower.includes('notification')) return 'STATUS/TOAST';
  if (lower.includes('diff')) return 'DIFF';
  if (lower.includes('breadcrumb')) return 'BREADCRUMB';
  if (lower.includes('context') || lower.includes('menu')) return 'CONTEXT_MENU';
  if (lower.includes('icon') || lower.includes('btn') || lower.includes('button')) return 'BUTTON/ICON';
  if (lower.includes('header') || lower.includes('title') || lower.includes('label')) return 'HEADER/LABEL';
  if (lower.includes('tab')) return 'TAB';
  if (lower.includes('toggle') || lower.includes('check') || lower.includes('switch')) return 'TOGGLE';
  if (lower.includes('select') || lower.includes('option') || lower.includes('dropdown')) return 'SELECT';
  if (lower.includes('list') || lower.includes('item')) return 'LIST/ITEM';
  if (lower.includes('progress') || lower.includes('loading') || lower.includes('spinner')) return 'PROGRESS';
  if (lower.includes('tooltip') || lower.includes('hint') || lower.includes('help')) return 'TOOLTIP/HELP';
  if (lower.includes('deai') || lower.includes('de-ai') || lower.includes('humanize')) return 'DEAI';
  if (lower.includes('dashboard') || lower.includes('stat')) return 'DASHBOARD';
  if (lower.includes('search') || lower.includes('filter')) return 'SEARCH/FILTER';
  if (lower.includes('resize') || lower.includes('split') || lower.includes('handle')) return 'RESIZE/SPLIT';
  if (lower.includes('exit') || lower.includes('confirm') || lower.includes('close')) return 'EXIT/CONFIRM';
  if (lower.includes('theme') || lower.includes('dark') || lower.includes('light') || lower.includes('color')) return 'THEME';
  return 'OTHER';
}

// Build category map for missing IDs
const missingByCategory = {};
missingIds.forEach(id => {
  const cat = categorizeId(id);
  if (!missingByCategory[cat]) missingByCategory[cat] = [];
  // Find old arch context
  const oldIdData = oldData.ids;
  missingByCategory[cat].push(id);
});

// Build output
let out = '=== HTML DIFF: OLD vs NEW ===\n';
out += 'Old Architecture: ' + oldData.ids.length + ' IDs, ' + oldData.classes.length + ' classes\n';
out += 'New Architecture: ' + newData.ids.length + ' IDs, ' + newData.classes.length + ' classes\n';
out += '\n';
out += '=== MISSING IDS (old has, new missing): ' + missingIds.length + ' ===\n';

// Sort by category
for (const [cat, ids] of Object.entries(missingByCategory).sort((a, b) => b[1].length - a[1].length)) {
  out += '\n--- ' + cat + ' (' + ids.length + ' missing) ---\n';
  ids.forEach(id => out += '  ' + id + '\n');
}

out += '\n=== MISSING CLASSES (old has, new missing): ' + missingClasses.length + ' ===\n';
missingClasses.forEach(cls => out += cls + '\n');

out += '\n=== EXTRA NEW IDS (new has, old does not): ' + extraNewIds.length + ' ===\n';
extraNewIds.forEach(id => out += id + '\n');

out += '\n=== EXTRA NEW CLASSES (new has, old does not): ' + extraNewClasses.length + ' ===\n';
extraNewClasses.slice(0, 100).forEach(cls => out += cls + '\n');
if (extraNewClasses.length > 100) out += '... and ' + (extraNewClasses.length - 100) + ' more\n';

// Priority ranking for fixes
out += '\n=== FIX PRIORITY RANKING ===\n';
const priorities = [
  { cat: 'MODAL', desc: 'Modal dialogs - critical for functionality' },
  { cat: 'CHAT', desc: 'Chat panel - primary user interaction' },
  { cat: 'EDITOR', desc: 'Editor panel - core writing feature' },
  { cat: 'PIPELINE', desc: 'Pipeline panel - core workflow' },
  { cat: 'CHAPTER_TREE', desc: 'Chapter tree - project management' },
  { cat: 'NAV/PANEL', desc: 'Navigation and panels - layout structure' },
  { cat: 'SETTINGS', desc: 'Settings modal tabs - configuration' },
  { cat: 'STATUS/TOAST', desc: 'Status bar and notifications' },
  { cat: 'PLUGIN', desc: 'Plugin market' },
  { cat: 'MEMORY', desc: 'Memory panel' },
  { cat: 'OUTLINE', desc: 'Outline workspace' },
  { cat: 'DEAI', desc: 'De-AI feature' },
  { cat: 'DASHBOARD', desc: 'Dashboard modal' },
  { cat: 'DIFF', desc: 'Diff modal' },
  { cat: 'BREADCRUMB', desc: 'Breadcrumb bar' },
  { cat: 'CONTEXT_MENU', desc: 'Context menu' },
  { cat: 'BUTTON/ICON', desc: 'Buttons and icons' },
  { cat: 'TAB', desc: 'Tab navigation' },
  { cat: 'TOGGLE', desc: 'Toggle switches' },
  { cat: 'SELECT', desc: 'Select/dropdown' },
  { cat: 'SEARCH/FILTER', desc: 'Search and filter' },
  { cat: 'RESIZE/SPLIT', desc: 'Resize handles' },
  { cat: 'EXIT/CONFIRM', desc: 'Exit confirmation' },
  { cat: 'PROGRESS', desc: 'Progress indicators' },
  { cat: 'HEADER/LABEL', desc: 'Headers and labels' },
  { cat: 'LIST/ITEM', desc: 'List items' },
  { cat: 'THEME', desc: 'Theme elements' },
  { cat: 'TOOLTIP/HELP', desc: 'Tooltips' },
  { cat: 'OTHER', desc: 'Other elements' }
];

priorities.forEach(p => {
  const ids = missingByCategory[p.cat] || [];
  if (ids.length > 0) {
    out += '\n[P' + (priorities.indexOf(p) + 1) + '] ' + p.cat + ' (' + ids.length + ' items) - ' + p.desc + '\n';
    ids.forEach(id => out += '  - ' + id + '\n');
  }
});

fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/html_diff_report.txt', out, 'utf8');
console.log('[OK] html_diff_report.txt');
console.log('Missing IDs: ' + missingIds.length);
console.log('Missing Classes: ' + missingClasses.length);
console.log('Extra New IDs: ' + extraNewIds.length);
console.log('Extra New Classes: ' + extraNewClasses.length);

// Save JSON for programmatic fix
const diffJson = {
  missingIds: missingIds,
  missingIdsByCategory: missingByCategory,
  missingClasses: missingClasses,
  extraNewIds: extraNewIds,
  extraNewClasses: extraNewClasses,
  summary: {
    oldIds: oldData.ids.length,
    newIds: newData.ids.length,
    oldClasses: oldData.classes.length,
    newClasses: newData.classes.length,
    missingIdsCount: missingIds.length,
    missingClassesCount: missingClasses.length
  }
};
fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/html_diff.json', JSON.stringify(diffJson, null, 2), 'utf8');
console.log('[OK] html_diff.json');
