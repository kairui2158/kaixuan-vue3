const fs = require('fs');
const path = require('path');

const diff = JSON.parse(fs.readFileSync('D:/codex/novel-workshop-vue3/_audit/html_diff.json', 'utf8'));
const missing = diff.missingCtx || [];

// Fixed compMap - no $ at end, all prefix patterns
const compMap = [
  { ids: /^(sf-|skill-list|skill-form|btn-add-skill|btn-save-bind|sbm-|skill-bind-modal)/, file: 'src/components/settings/SkillSettings.vue' },
  { ids: /^(cfg-provider|cfg-api|cfg-base-url|cfg-max-tokens|cfg-stream-mode|cfg-system-prompt|cfg-temperature|provider-|btn-provider-|btn-toggle-key|model-datalist|btn-fetch-models)/, file: 'src/components/settings/ApiSettings.vue' },
  { ids: /^(cfg-theme|cfg-font-size|cfg-editor-font-size|appearance)/, file: 'src/components/settings/AppearanceSettings.vue' },
  { ids: /^(deai-|btn-deai-|btn-save-deai)/, file: 'src/components/settings/DeAiSettings.vue' },
  { ids: /^(diag-|btn-diag)/, file: 'src/components/settings/DiagLogPanel.vue' },
  { ids: /^(tab-|settings-modal|btn-close-settings|btn-export-data|btn-import-data)/, file: 'src/components/settings/SettingsModal.vue' },
  { ids: /^(pl-|pipeline-panel|btn-close-pl)/, file: 'src/components/pipeline/PipelinePanel.vue' },
  { ids: /^(ow-|outline|btn-ow-|btn-close-outline|btn-ai-co-create|btn-import-outline|btn-export-outline|btn-generate-outline|btn-lock-outline)/, file: 'src/components/common/OutlineWorkspace.vue' },
  { ids: /^(sc-|btn-add-category|btn-add-item|btn-close-sc|settings-collection-panel)/, file: 'src/components/settings-collection/ScPanel.vue' },
  { ids: /^(market-|btn-close-market|github-|token-|plugin-market-modal)/, file: 'src/components/common/PluginMarket.vue' },
  { ids: /^(diff|btn-close-diff|btn-diff-)/, file: 'src/components/common/DiffModal.vue' },
  { ids: /^(mem-|btn-add-mem|btn-close-mem|memory-panel)/, file: 'src/components/common/MemoryPanel.vue' },
  { ids: /^(btn-exit|exit-confirm-modal)/, file: 'src/components/common/ExitConfirmModal.vue' },
  { ids: /^(dashboard-modal|project-modal|project-list|btn-new-project|new-project-modal|npm-|btn-create-project|volume-modal|vm-|btn-save-volume)/, file: 'src/components/dashboard/DashboardModal.vue' },
  { ids: /^(app-sidebar|btn-dashboard|btn-memory|btn-settings|btn-outline-workspace|btn-pipeline|btn-plugin-market)/, file: 'src/components/sidebar/SidebarNav.vue' },
  { ids: /^(chapter-tree|btn-tree-|btn-create-|btn-new-)/, file: 'src/components/sidebar/ChapterTree.vue' },
  { ids: /^(editor-|find-|replace-|btn-save-editor|btn-undo|btn-redo|btn-find-|btn-replace-|resizer-)/, file: 'src/components/editor/EditorPanel.vue' },
  { ids: /^(chat-|btn-send|messages-|chat-panel|chat-context-bar|skill-list-active)/, file: 'src/components/chat/ChatPanel.vue' },
  { ids: /^(app-|panel-backdrop|toast-container|dom-toast|tooltip|inline-menu|loading-|token-bar|token-count|token-display|statusbar)/, file: 'src/App.vue' }
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

  // 1. data-tab
  const dtMatch = ctx.match(/data-tab="([^"]+)"/);
  if (dtMatch) {
    const re = new RegExp('<' + tag + '([^>]*data-tab="' + escapeRegex(dtMatch[1]) + '"[^>]*)>', 'g');
    const m = re.exec(modified);
    if (m && !m[1].includes('id=')) {
      return { content: modified.replace(m[0], '<' + tag + ' id="' + id + '"' + m[1] + '>'), method: 'data-tab' };
    }
  }

  // 2. data-cat
  const dcMatch = ctx.match(/data-cat="([^"]+)"/);
  if (dcMatch) {
    const re = new RegExp('<' + tag + '([^>]*data-cat="' + escapeRegex(dcMatch[1]) + '"[^>]*)>', 'g');
    const m = re.exec(modified);
    if (m && !m[1].includes('id=')) {
      return { content: modified.replace(m[0], '<' + tag + ' id="' + id + '"' + m[1] + '>'), method: 'data-cat' };
    }
  }

  // 3. placeholder (exact)
  const phMatch = ctx.match(/placeholder="([^"]+)"/);
  if (phMatch) {
    const ph = phMatch[1];
    const re = new RegExp('<' + tag + '([^>]*placeholder="' + escapeRegex(ph) + '"[^>]*)>', 'g');
    const m = re.exec(modified);
    if (m && !m[1].includes('id=')) {
      return { content: modified.replace(m[0], '<' + tag + ' id="' + id + '"' + m[1] + '>'), method: 'placeholder' };
    }
  }

  // 4. button text
  if (tag === 'button') {
    const btnMatch = ctx.match(new RegExp('id="' + escapeRegex(id) + '"[^>]*>([^<]+)</button>'));
    let text = btnMatch ? btnMatch[1].trim() : null;
    if (!text) {
      const bm2 = ctx.match(/>([^<]{2,30})<\/button>/);
      if (bm2) text = bm2[1].trim();
    }
    if (text) {
      const txtEsc = escapeRegex(text);
      const re = new RegExp('<button([^>]*)>(\\s*)' + txtEsc + '(\\s*)</button>', 'g');
      const m = re.exec(modified);
      if (m && !m[1].includes('id=')) {
        return { content: modified.replace(m[0], '<button id="' + id + '"' + m[1] + '>' + m[2] + text + m[3] + '</button>'), method: 'btn-text' };
      }
      // Try with + prefix variant
      if (text.startsWith('+')) {
        const clean = text.substring(1).trim();
        const re2 = new RegExp('<button([^>]*)>\\+' + escapeRegex(clean) + '</button>', 'g');
        const m2 = re2.exec(modified);
        if (m2 && !m2[1].includes('id=')) {
          return { content: modified.replace(m2[0], '<button id="' + id + '"' + m2[1] + '>+' + clean + '</button>'), method: 'btn-text+' };
        }
      }
    }
  }

  // 5. heading match
  const hMatch = ctx.match(/<h[34][^>]*>([^<]{2,40})<\/h[34]>/);
  if (hMatch && (tag === 'div' || tag === 'section')) {
    const heading = hMatch[1].trim();
    const hEsc = escapeRegex(heading);
    const re = new RegExp('<' + tag + '(?!\\sid=)([^>]*)>([\\s\\S]{0,300}?)<h([34])[^>]*>' + hEsc + '<', 'g');
    const m = re.exec(modified);
    if (m && !m[1].includes('id=')) {
      const replacement = '<' + tag + ' id="' + id + '"' + m[1] + '>' + m[2] + '<h' + m[3] + '>' + heading + '<';
      return { content: modified.replace(m[0], replacement), method: 'heading' };
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
          return { content: modified.replace(m[0], '<' + tag + ' id="' + id + '"' + m[1] + '>'), method: 'class' };
        }
      }
    }
  }

  // 7. close button
  if (id.startsWith('btn-close-') && tag === 'button') {
    const re = /<button([^>]*class="[^"]*btn-close[^"]*"[^>]*)>/g;
    let m;
    while ((m = re.exec(modified)) !== null) {
      if (!m[1].includes('id=')) {
        return { content: modified.replace(m[0], '<button id="' + id + '"' + m[1] + '>'), method: 'close-btn' };
      }
    }
    const re2 = /<button([^>]*@click="[^"]*close[^"]*"[^>]*)>/gi;
    let m2;
    while ((m2 = re2.exec(modified)) !== null) {
      if (!m2[1].includes('id=')) {
        return { content: modified.replace(m2[0], '<button id="' + id + '"' + m2[1] + '>'), method: 'close-click' };
      }
    }
  }

  // 8. @click function match
  if (id.startsWith('btn-') && tag === 'button') {
    const funcHint = id.replace(/^btn-/, '').replace(/-/g, '');
    const re = new RegExp('<button([^>]*@click="[^"]*' + funcHint + '[^"]*"[^>]*)>', 'gi');
    const m = re.exec(modified);
    if (m && !m[1].includes('id=')) {
      return { content: modified.replace(m[0], '<button id="' + id + '"' + m[1] + '>'), method: 'click-func' };
    }
    // Try partial func hint (first word only)
    const partial = funcHint.substring(0, Math.min(6, funcHint.length));
    if (partial.length >= 4) {
      const re2 = new RegExp('<button([^>]*@click="[^"]*' + partial + '[^"]*"[^>]*)>', 'gi');
      const m2 = re2.exec(modified);
      if (m2 && !m2[1].includes('id=')) {
        return { content: modified.replace(m2[0], '<button id="' + id + '"' + m2[1] + '>'), method: 'click-partial' };
      }
    }
  }

  // 9. container root div
  if (tag === 'div' && (id.endsWith('-modal') || id.endsWith('-panel') || id.endsWith('-list'))) {
    const re2 = /^<template>\n\s*<div([^>]*)>/;
    const m2 = re2.exec(modified);
    if (m2 && !m2[1].includes('id=')) {
      return { content: modified.replace(m2[0], '<template>\n  <div id="' + id + '"' + m2[1] + '>'), method: 'root-div' };
    }
  }

  // 10. aside
  if (tag === 'aside') {
    const re = /<aside([^>]*)>/g;
    const m = re.exec(modified);
    if (m && !m[1].includes('id=')) {
      return { content: modified.replace(m[0], '<aside id="' + id + '"' + m[1] + '>'), method: 'aside' };
    }
  }

  // 11. label + input
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    const lblMatch = ctx.match(/<label[^>]*>([^<]{2,40})<\/label>/);
    if (lblMatch) {
      const lbl = lblMatch[1].trim();
      const lblEsc = escapeRegex(lbl);
      const re = new RegExp('<label[^>]*>' + lblEsc + '<\/label>\\s*<(' + tag + ')([^>]*)>', 'g');
      const m = re.exec(modified);
      if (m && !m[2].includes('id=')) {
        return { content: modified.replace(m[0], '<label>' + lbl + '</label><' + tag + ' id="' + id + '"' + m[2] + '>'), method: 'label-input' };
      }
    }
    // Try v-model match - extract variable name from context
    const vmMatch = ctx.match(/v-model="([^"]+)"/);
    if (vmMatch) {
      const vm = vmMatch[1];
      const re = new RegExp('<' + tag + '([^>]*v-model="' + escapeRegex(vm) + '"[^>]*)>', 'g');
      const m = re.exec(modified);
      if (m && !m[1].includes('id=')) {
        return { content: modified.replace(m[0], '<' + tag + ' id="' + id + '"' + m[1] + '>'), method: 'vmodel' };
      }
    }
  }

  // 12. span with text
  if (tag === 'span') {
    const spMatch = ctx.match(new RegExp('id="' + escapeRegex(id) + '"[^>]*>([^<]{1,30})</span>'));
    if (spMatch) {
      const text = spMatch[1].trim();
      const txtEsc = escapeRegex(text);
      const re = new RegExp('<span([^>]*)>' + txtEsc + '<\/span>', 'g');
      const m = re.exec(modified);
      if (m && !m[1].includes('id=')) {
        return { content: modified.replace(m[0], '<span id="' + id + '"' + m[1] + '>' + text + '</span>'), method: 'span-text' };
      }
    }
    // Try {{ }} template
    const tplMatch = ctx.match(/id="[^"]+"[^>]*>\{\{([^}]+)\}\}<\/span>/);
    if (tplMatch) {
      const expr = tplMatch[1].trim();
      const exprEsc = escapeRegex(expr);
      const re = new RegExp('<span([^>]*)>\\{\\{' + exprEsc + '\\}\\}</span>', 'g');
      const m = re.exec(modified);
      if (m && !m[1].includes('id=')) {
        return { content: modified.replace(m[0], '<span id="' + id + '"' + m[1] + '>{{ ' + expr + ' }}</span>'), method: 'span-tpl' };
      }
    }
  }

  // 13. div with specific class from context
  if (tag === 'div') {
    // Extract class from context around the id
    const clsMatch = ctx.match(new RegExp('id="' + escapeRegex(id) + '"[^>]*class="([^"]+)"'));
    if (clsMatch) {
      const divCls = clsMatch[1];
      const clsEsc = escapeRegex(divCls);
      const re = new RegExp('<div([^>]*class="' + clsEsc + '"[^>]*)>', 'g');
      const m = re.exec(modified);
      if (m && !m[1].includes('id=')) {
        return { content: modified.replace(m[0], '<div id="' + id + '"' + m[1] + '>'), method: 'div-cls' };
      }
    }
    // Try partial class match (first class only)
    const partialClsMatch = ctx.match(new RegExp('id="' + escapeRegex(id) + '"[^>]*class="([^"]+)"'));
    if (partialClsMatch) {
      const firstCls = partialClsMatch[1].split(' ')[0];
      const re = new RegExp('<div([^>]*class="[^"]*' + escapeRegex(firstCls) + '[^"]*"[^>]*)>', 'g');
      let m;
      while ((m = re.exec(modified)) !== null) {
        if (!m[1].includes('id=')) {
          return { content: modified.replace(m[0], '<div id="' + id + '"' + m[1] + '>'), method: 'div-cls-partial' };
        }
      }
    }
  }

  // 14. select with v-model and options
  if (tag === 'select') {
    const optMatch = ctx.match(/<option value="([^"]+)">([^<]+)<\/option>/);
    if (optMatch) {
      const optVal = optMatch[1];
      const re = new RegExp('<select([^>]*>[\s\S]*?<option value="' + escapeRegex(optVal) + '")', 'g');
      const m = re.exec(modified);
      if (m && !m[1].includes('id=')) {
        return { content: modified.replace(m[0], '<select id="' + id + '"' + m[1]), method: 'select-option' };
      }
    }
  }

  // 15. input with type
  if (tag === 'input') {
    const typeMatch = ctx.match(/type="([^"]+)"/);
    if (typeMatch) {
      const tp = typeMatch[1];
      if (tp === 'range') {
        const re = new RegExp('<input([^>]*type="range"[^>]*)>', 'g');
        let m;
        while ((m = re.exec(modified)) !== null) {
          if (!m[1].includes('id=')) {
            return { content: modified.replace(m[0], '<input id="' + id + '"' + m[1] + '>'), method: 'input-range' };
          }
        }
      }
      if (tp === 'number') {
        const re = new RegExp('<input([^>]*type="number"[^>]*)>', 'g');
        let m;
        while ((m = re.exec(modified)) !== null) {
          if (!m[1].includes('id=')) {
            return { content: modified.replace(m[0], '<input id="' + id + '"' + m[1] + '>'), method: 'input-number' };
          }
        }
      }
    }
  }

  // 16. For elements with v-if/v-show patterns - match by condition
  const vifMatch = ctx.match(/v-if="([^"]+)"/);
  if (vifMatch) {
    const vif = vifMatch[1];
    const vifEsc = escapeRegex(vif);
    const re = new RegExp('<' + tag + '([^>]*v-if="' + vifEsc + '"[^>]*)>', 'g');
    const m = re.exec(modified);
    if (m && !m[1].includes('id=')) {
      return { content: modified.replace(m[0], '<' + tag + ' id="' + id + '"' + m[1] + '>'), method: 'v-if' };
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
    items.forEach(m => {
      results.push({ id: m.id, comp: compFile, status: 'SKIP-no-file', method: '' });
      totalSkipped++;
    });
    continue;
  }
  if (!fileContents[compFile]) fileContents[compFile] = fs.readFileSync(fullPath, 'utf8');
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
let table = '\n## Batch Fix v3 (Enhanced Matching)\n| # | ID | Component | Method | Status |\n|---|---|---|---|---|\n';
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
