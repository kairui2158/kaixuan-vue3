const fs = require('fs');
const path = require('path');

const diff = JSON.parse(fs.readFileSync('D:/codex/novel-workshop-vue3/_audit/html_diff.json', 'utf8'));
const missing = diff.missingCtx || [];

const compMap = [
  { ids: /^(sf-|skill-list|skill-form|btn-add-skill|btn-save-bind|sbm-)/, file: 'src/components/settings/SkillSettings.vue' },
  { ids: /^(cfg-provider|cfg-api|cfg-api-url|cfg-api-key|provider-|btn-provider-|btn-toggle-key|model-datalist|btn-fetch-models)/, file: 'src/components/settings/ApiSettings.vue' },
  { ids: /^(cfg-theme|cfg-font-size|cfg-editor-font-size|appearance)/, file: 'src/components/settings/AppearanceSettings.vue' },
  { ids: /^(deai-|btn-deai-|btn-save-deai)$/, file: 'src/components/settings/DeAiSettings.vue' },
  { ids: /^(diag-|btn-diag)/, file: 'src/components/settings/DiagLogPanel.vue' },
  { ids: /^(tab-|settings-modal|btn-close-settings|btn-export-data|btn-import-data)$/, file: 'src/components/settings/SettingsModal.vue' },
  { ids: /^(pl-|pipeline-panel|btn-close-pl)$/, file: 'src/components/pipeline/PipelinePanel.vue' },
  { ids: /^(ow-|outline|btn-ow-|btn-close-outline|btn-ai-co-create|btn-import-outline|btn-export-outline|btn-generate-outline|btn-lock-outline)$/, file: 'src/components/common/OutlineWorkspace.vue' },
  { ids: /^(sc-|btn-add-category|btn-add-item|btn-close-sc|settings-collection-panel)$/, file: 'src/components/settings-collection/ScPanel.vue' },
  { ids: /^(market-|btn-close-market|github-|token-input|plugin-market-modal)$/, file: 'src/components/common/PluginMarket.vue' },
  { ids: /^(diff|btn-close-diff|btn-diff-)$/, file: 'src/components/common/DiffModal.vue' },
  { ids: /^(mem-|btn-add-mem|btn-close-mem|memory-panel)$/, file: 'src/components/common/MemoryPanel.vue' },
  { ids: /^(btn-exit|exit-confirm-modal)$/, file: 'src/components/common/ExitConfirmModal.vue' },
  { ids: /^(dashboard-modal|project-modal|project-list|btn-new-project|new-project-modal|npm-|btn-create-project|volume-modal|vm-|btn-save-volume)$/, file: 'src/components/dashboard/DashboardModal.vue' },
  { ids: /^(app-sidebar|btn-dashboard|btn-memory|btn-settings|btn-outline-workspace|btn-pipeline|btn-plugin-market)$/, file: 'src/components/sidebar/SidebarNav.vue' },
  { ids: /^(chapter-tree|btn-tree-|btn-create-|btn-new-)/, file: 'src/components/sidebar/ChapterTree.vue' },
  { ids: /^(editor-|find-|replace-|btn-save-editor|btn-undo|btn-redo|btn-find-|btn-replace-|resizer-)/, file: 'src/components/editor/EditorPanel.vue' },
  { ids: /^(chat-|btn-send|messages-|chat-panel|chat-context-bar|skill-list-active)$/, file: 'src/components/chat/ChatPanel.vue' },
  { ids: /^(app-|panel-backdrop|toast-container|dom-toast|tooltip|inline-menu|loading-|token-display|statusbar)$/, file: 'src/App.vue' }
];

function findComponent(id) {
  for (const c of compMap) {
    if (c.ids.test(id)) return c.file;
  }
  return null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tryFix(content, id, tag, cls, ctx) {
  let modified = content;
  let method = '';

  // 1. data-tab match
  const dataTabMatch = ctx.match(/data-tab="([^"]+)"/);
  if (dataTabMatch) {
    const tab = dataTabMatch[1];
    const re = new RegExp('<' + tag + '([^>]*data-tab="' + escapeRegex(tab) + '"[^>]*)>', 'g');
    const m = re.exec(modified);
    if (m && !m[1].includes('id=')) {
      modified = modified.replace(m[0], '<' + tag + ' id="' + id + '"' + m[1] + '>');
      return { content: modified, method: 'data-tab' };
    }
  }

  // 2. data-cat match
  const dataCatMatch = ctx.match(/data-cat="([^"]+)"/);
  if (dataCatMatch) {
    const cat = dataCatMatch[1];
    const re = new RegExp('<' + tag + '([^>]*data-cat="' + escapeRegex(cat) + '"[^>]*)>', 'g');
    const m = re.exec(modified);
    if (m && !m[1].includes('id=')) {
      modified = modified.replace(m[0], '<' + tag + ' id="' + id + '"' + m[1] + '>');
      return { content: modified, method: 'data-cat' };
    }
  }

  // 3. placeholder match (exact only, no partial)
  const phMatch = ctx.match(/placeholder="([^"]+)"/);
  if (phMatch) {
    const ph = phMatch[1];
    const re = new RegExp('<' + tag + '([^>]*placeholder="' + escapeRegex(ph) + '"[^>]*)>', 'g');
    const m = re.exec(modified);
    if (m && !m[1].includes('id=')) {
      modified = modified.replace(m[0], '<' + tag + ' id="' + id + '"' + m[1] + '>');
      return { content: modified, method: 'placeholder' };
    }
  }

  // 4. button text match
  if (tag === 'button') {
    const btnMatch = ctx.match(new RegExp('id="' + escapeRegex(id) + '"[^>]*>([^<]+)</button>'));
    if (btnMatch) {
      const text = btnMatch[1].trim();
      const txtEsc = escapeRegex(text);
      const re = new RegExp('<button([^>]*)>(\\s*)' + txtEsc + '(\\s*)</button>', 'g');
      const m = re.exec(modified);
      if (m && !m[1].includes('id=')) {
        modified = modified.replace(m[0], '<button id="' + id + '"' + m[1] + '>' + m[2] + text + m[3] + '</button>');
        return { content: modified, method: 'btn-text' };
      }
    }
    // Try without id prefix in context
    const btnMatch2 = ctx.match(/>([^<]{2,30})<\/button>/);
    if (btnMatch2) {
      const text = btnMatch2[1].trim();
      const txtEsc = escapeRegex(text);
      const re = new RegExp('<button([^>]*)>(\\s*)' + txtEsc + '(\\s*)</button>', 'g');
      const m = re.exec(modified);
      if (m && !m[1].includes('id=')) {
        modified = modified.replace(m[0], '<button id="' + id + '"' + m[1] + '>' + m[2] + text + m[3] + '</button>');
        return { content: modified, method: 'btn-text2' };
      }
    }
  }

  // 5. heading match (for containers with h3/h4)
  const hMatch = ctx.match(/<h[34][^>]*>([^<]{2,40})<\/h[34]>/);
  if (hMatch && (tag === 'div' || tag === 'section')) {
    const heading = hMatch[1].trim();
    const hEsc = escapeRegex(heading);
    const re = new RegExp('<' + tag + '(?!\\sid=)([^>]*)>([\\s\\S]{0,300}?)<h([34])[^>]*>' + hEsc + '<', 'g');
    const m = re.exec(modified);
    if (m && !m[1].includes('id=')) {
      const replacement = '<' + tag + ' id="' + id + '"' + m[1] + '>' + m[2] + '<h' + m[3] + '>' + heading + '<';
      modified = modified.replace(m[0], replacement);
      return { content: modified, method: 'heading' };
    }
  }

  // 6. class match
  if (cls) {
    const clsParts = cls.split(' ').filter(c => c.length > 0);
    if (clsParts.length > 0) {
      const firstCls = escapeRegex(clsParts[0]);
      const re = new RegExp('<' + tag + '(?!\\sid=)([^>]*class="[^"]*' + firstCls + '[^"]*"[^>]*)>', 'g');
      let m;
      while ((m = re.exec(modified)) !== null) {
        const allPresent = clsParts.every(c => m[1].includes(c));
        if (allPresent && !m[1].includes('id=')) {
          modified = modified.replace(m[0], '<' + tag + ' id="' + id + '"' + m[1] + '>');
          return { content: modified, method: 'class' };
        }
      }
    }
  }

  // 7. close button match
  if (id.startsWith('btn-close-') && tag === 'button') {
    const re = /<button([^>]*class="[^"]*btn-close[^"]*"[^>]*)>/g;
    let m;
    while ((m = re.exec(modified)) !== null) {
      if (!m[1].includes('id=')) {
        modified = modified.replace(m[0], '<button id="' + id + '"' + m[1] + '>');
        return { content: modified, method: 'close-btn' };
      }
    }
    // Try @click with close
    const re2 = /<button([^>]*@click="[^"]*close[^"]*"[^>]*)>/gi;
    let m2;
    while ((m2 = re2.exec(modified)) !== null) {
      if (!m2[1].includes('id=')) {
        modified = modified.replace(m2[0], '<button id="' + id + '"' + m2[1] + '>');
        return { content: modified, method: 'close-click' };
      }
    }
  }

  // 8. @click function match
  if (id.startsWith('btn-') && tag === 'button') {
    const funcHint = id.replace(/^btn-/, '').replace(/-/g, '');
    const re = new RegExp('<button([^>]*@click="[^"]*' + funcHint + '[^"]*"[^>]*)>', 'gi');
    const m = re.exec(modified);
    if (m && !m[1].includes('id=')) {
      modified = modified.replace(m[0], '<button id="' + id + '"' + m[1] + '>');
      return { content: modified, method: 'click-func' };
    }
  }

  // 9. container match (modal/panel/list)
  if (tag === 'div' && (id.endsWith('-modal') || id.endsWith('-panel') || id.endsWith('-list'))) {
    const root = id.replace(/-[a-z]+$/, '');
    const re = new RegExp('<div([^>]*class="[^"]*' + escapeRegex(root) + '[^"]*"[^>]*)>', 'g');
    const m = re.exec(modified);
    if (m && !m[1].includes('id=')) {
      modified = modified.replace(m[0], '<div id="' + id + '"' + m[1] + '>');
      return { content: modified, method: 'container' };
    }
    // Try matching root div of template (first div in template)
    const re2 = /^<template>\n\s*<div([^>]*)>/;
    const m2 = re2.exec(modified);
    if (m2 && !m2[1].includes('id=')) {
      modified = modified.replace(m2[0], '<template>\n  <div id="' + id + '"' + m2[1] + '>');
      return { content: modified, method: 'root-div' };
    }
  }

  // 10. aside tag match
  if (tag === 'aside') {
    const re = /<aside([^>]*)>/g;
    const m = re.exec(modified);
    if (m && !m[1].includes('id=')) {
      modified = modified.replace(m[0], '<aside id="' + id + '"' + m[1] + '>');
      return { content: modified, method: 'aside' };
    }
  }

  // 11. token-display / token-input special
  if (id === 'token-display' || id === 'token-input') {
    const re = new RegExp('<' + tag + '([^>]*class="[^"]*token[^"]*"[^>]*)>', 'g');
    const m = re.exec(modified);
    if (m && !m[1].includes('id=')) {
      modified = modified.replace(m[0], '<' + tag + ' id="' + id + '"' + m[1] + '>');
      return { content: modified, method: 'token-class' };
    }
  }

  // 12. input with v-model matching label text
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    // Try to find label text from context
    const lblMatch = ctx.match(/<label[^>]*>([^<]{2,40})<\/label>/);
    if (lblMatch) {
      const lbl = lblMatch[1].trim();
      const lblEsc = escapeRegex(lbl);
      // Find label in Vue, then the next input after it
      const re = new RegExp('<label[^>]*>' + lblEsc + '<\/label>\\s*<(' + tag + ')([^>]*)>', 'g');
      const m = re.exec(modified);
      if (m && !m[2].includes('id=')) {
        modified = modified.replace(m[0], '<label>' + lbl + '</label><' + tag + ' id="' + id + '"' + m[2] + '>');
        return { content: modified, method: 'label-input' };
      }
    }
  }

  return null;
}

// Main
const baseDir = 'D:/codex/novel-workshop-vue3/';
const fileContents = {};
const results = [];
let totalApplied = 0;
let totalSkipped = 0;

const byComponent = {};
missing.forEach(m => {
  const comp = findComponent(m.id);
  if (!comp) {
    results.push({ id: m.id, comp: 'UNKNOWN', status: 'SKIP-no-comp', method: '' });
    totalSkipped++;
    return;
  }
  if (!byComponent[comp]) byComponent[comp] = [];
  byComponent[comp].push(m);
});

for (const [compFile, items] of Object.entries(byComponent)) {
  const fullPath = path.join(baseDir, compFile);
  if (!fs.existsSync(fullPath)) {
    console.log('[WARN] Not found: ' + compFile);
    items.forEach(m => {
      results.push({ id: m.id, comp: compFile, status: 'SKIP-no-file', method: '' });
      totalSkipped++;
    });
    continue;
  }
  if (!fileContents[compFile]) {
    fileContents[compFile] = fs.readFileSync(fullPath, 'utf8');
  }
  let content = fileContents[compFile];
  const compResults = [];

  for (const m of items) {
    if (content.includes('id="' + m.id + '"')) {
      compResults.push({ id: m.id, comp: compFile, status: 'ALREADY', method: '' });
      continue;
    }
    const result = tryFix(content, m.id, m.tag, m.cls, m.context);
    if (result) {
      content = result.content;
      compResults.push({ id: m.id, comp: compFile, status: 'DONE', method: result.method });
      totalApplied++;
      console.log('[OK] ' + m.id + ' -> ' + compFile + ' (' + result.method + ')');
    } else {
      compResults.push({ id: m.id, comp: compFile, status: 'SKIP-no-match', method: '' });
      totalSkipped++;
      console.log('[SKIP] ' + m.id + ' -> ' + compFile);
    }
  }
  if (content !== fileContents[compFile]) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log('[WRITE] ' + compFile);
  }
  fileContents[compFile] = content;
  results.push(...compResults);
}

// Report
const report = 'D:/codex/novel-workshop-vue3/_audit/HTML_RECONCILIATION_FINAL.md';
let table = '\n## Batch Fix v2 (All Components)\n| # | ID | Component | Method | Status |\n|---|---|---|---|---|\n';
let idx = 1;
results.forEach(r => {
  table += '| ' + idx + ' | ' + r.id + ' | ' + r.comp + ' | ' + r.method + ' | ' + r.status + ' |\n';
  idx++;
});
table += '\n**Summary**: Applied=' + totalApplied + ' Skipped=' + totalSkipped + ' Total=' + results.length + '\n';
fs.appendFileSync(report, table, 'utf8');

console.log('\n=== SUMMARY ===');
console.log('Applied: ' + totalApplied);
console.log('Skipped: ' + totalSkipped);
console.log('Total: ' + results.length);

const skipped = results.filter(r => r.status.startsWith('SKIP'));
if (skipped.length > 0) {
  console.log('\n=== SKIPPED ===');
  skipped.forEach(r => console.log(r.id + ' -> ' + r.comp + ' (' + r.status + ')'));
}
