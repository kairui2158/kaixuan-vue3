const fs = require('fs');
const path = require('path');

// Read diff data
const diff = JSON.parse(fs.readFileSync('D:/codex/novel-workshop-vue3/_audit/html_diff.json', 'utf8'));
const missing = diff.missingCtx || [];

// Component prefix mapping
const compMap = [
  { ids: /^(agent-list|agent-form|agent-form-title|af-|btn-add-agent|btn-cancel-agent|btn-save-agent)$/, file: 'src/components/settings/AgentSettings.vue' },
  { ids: /^(sf-|skill-list|skill-form|btn-add-skill|btn-save-bind|sbm-)/, file: 'src/components/settings/SkillSettings.vue' },
  { ids: /^(cfg-provider|cfg-api|cfg-api-url|cfg-api-key|provider-|btn-provider-|btn-toggle-key|model-datalist|btn-fetch-models|btn-save-bind)$/, file: 'src/components/settings/ApiSettings.vue' },
  { ids: /^(cfg-theme|cfg-font-size|cfg-editor-font-size|appearance)/, file: 'src/components/settings/AppearanceSettings.vue' },
  { ids: /^(deai-|btn-deai-|btn-save-deai)$/, file: 'src/components/settings/DeAiSettings.vue' },
  { ids: /^(diag-|btn-diag)/, file: 'src/components/settings/DiagLogPanel.vue' },
  { ids: /^(tab-|settings-modal|btn-close-settings|btn-export-data|btn-import-data)$/, file: 'src/components/settings/SettingsModal.vue' },
  { ids: /^(pl-|pipeline-panel|btn-close-pl)$/, file: 'src/components/pipeline/PipelinePanel.vue' },
  { ids: /^(ow-|outline|btn-ow-|btn-close-outline|btn-ai-co-create|btn-import-outline|btn-export-outline|btn-generate-outline|btn-lock-outline)$/, file: 'src/components/common/OutlineWorkspace.vue' },
  { ids: /^(sc-|btn-add-category|btn-add-item|btn-close-sc|settings-collection-panel)$/, file: 'src/components/settings-collection/ScPanel.vue' },
  { ids: /^(market-|btn-close-market|github-|token-|plugin-market-modal)$/, file: 'src/components/common/PluginMarket.vue' },
  { ids: /^(diff|btn-close-diff|btn-diff-)$/, file: 'src/components/common/DiffModal.vue' },
  { ids: /^(mem-|btn-add-mem|btn-close-mem|memory-panel)$/, file: 'src/components/common/MemoryPanel.vue' },
  { ids: /^(btn-exit|exit-confirm-modal)$/, file: 'src/components/common/ExitConfirmModal.vue' },
  { ids: /^(dashboard-modal|project-modal|project-list|btn-new-project|new-project-modal|npm-|btn-create-project|volume-modal|vm-|btn-save-volume)$/, file: 'src/components/dashboard/DashboardModal.vue' },
  { ids: /^(app-sidebar|btn-dashboard|btn-memory|btn-settings|btn-outline-workspace|btn-pipeline|btn-plugin-market)$/, file: 'src/components/sidebar/SidebarNav.vue' },
  { ids: /^(chapter-tree|btn-tree-|btn-create-|btn-new-)/, file: 'src/components/sidebar/ChapterTree.vue' },
  { ids: /^(editor-|find-|replace-|btn-save-editor|btn-undo|btn-redo|btn-find-|btn-replace-|resizer-)/, file: 'src/components/editor/EditorPanel.vue' },
  { ids: /^(chat-|btn-send|messages-|chat-panel|chat-context-bar|skill-list-active)$/, file: 'src/components/chat/ChatPanel.vue' },
  { ids: /^(app-|panel-backdrop|toast-container|dom-toast|tooltip|inline-menu|loading-|token-|statusbar)$/, file: 'src/App.vue' }
];

function findComponent(id) {
  for (const c of compMap) {
    if (c.ids.test(id)) return c.file;
  }
  return null;
}

// Extract identifiable features from old HTML context
function extractFeatures(ctx, id, tag, cls) {
  const features = {};
  
  // Extract placeholder
  const phMatch = ctx.match(/placeholder="([^"]+)"/);
  if (phMatch) features.placeholder = phMatch[1];
  
  // Extract button text - find the text content for buttons
  if (tag === 'button') {
    // Try to find button text by looking for >text<
    const btnMatch = ctx.match(new RegExp('id="' + id + '"[^>]*>([^<]+)<'));
    if (btnMatch) features.text = btnMatch[1].trim();
    else {
      const btnMatch2 = ctx.match(/>([^<]{1,30})<\/button>/);
      if (btnMatch2) features.text = btnMatch2[1].trim();
    }
  }
  
  // Extract label text for inputs
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    const lblMatch = ctx.match(/<label[^>]*>([^<]{2,40})<\/label>/);
    if (lblMatch) features.label = lblMatch[1].trim();
  }
  
  // Extract data attributes
  const dataMatch = ctx.match(/data-tab="([^"]+)"/);
  if (dataMatch) features.dataTab = dataMatch[1];
  
  const dataCatMatch = ctx.match(/data-cat="([^"]+)"/);
  if (dataCatMatch) features.dataCat = dataCatMatch[1];
  
  // Extract title/heading text
  const hMatch = ctx.match(/<h[34][^>]*>([^<]{2,40})<\/h[34]>/);
  if (hMatch) features.heading = hMatch[1].trim();
  
  // Extract span text near the ID
  const spanMatch = ctx.match(/id="' + id + '"[^>]*>([^<]{1,30})<\/span>/);
  if (spanMatch) features.spanText = spanMatch[1].trim();
  
  return features;
}

// Try to find and add id to an element in Vue template
function tryFix(content, id, tag, cls, ctx) {
  const features = extractFeatures(ctx, id, tag, cls);
  let modified = content;
  let method = '';
  
  // Strategy 1: Match by data-tab attribute
  if (features.dataTab) {
    const re = new RegExp('<' + tag + '([^>]*data-tab="' + features.dataTab + '"[^>]*)>', 'g');
    const match = re.exec(modified);
    if (match && !match[1].includes('id=')) {
      modified = modified.replace(match[0], '<' + tag + ' id="' + id + '"' + match[1] + '>');
      return { content: modified, method: 'data-tab-match' };
    }
  }
  
  // Strategy 2: Match by data-cat attribute
  if (features.dataCat) {
    const re = new RegExp('<' + tag + '([^>]*data-cat="' + features.dataCat + '"[^>]*)>', 'g');
    const match = re.exec(modified);
    if (match && !match[1].includes('id=')) {
      modified = modified.replace(match[0], '<' + tag + ' id="' + id + '"' + match[1] + '>');
      return { content: modified, method: 'data-cat-match' };
    }
  }
  
  // Strategy 3: Match by placeholder
  if (features.placeholder) {
    const phEsc = features.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('<' + tag + '([^>]*placeholder="' + phEsc + '"[^>]*)>', 'g');
    const match = re.exec(modified);
    if (match && !match[1].includes('id=')) {
      modified = modified.replace(match[0], '<' + tag + ' id="' + id + '"' + match[1] + '>');
      return { content: modified, method: 'placeholder-match' };
    }
    // Also try partial placeholder match
    const partial = features.placeholder.substring(0, Math.min(10, features.placeholder.length));
    const re2 = new RegExp('<' + tag + '([^>]*placeholder="' + partial + '[^"]*"[^>]*)>', 'g');
    const match2 = re2.exec(modified);
    if (match2 && !match2[1].includes('id=')) {
      modified = modified.replace(match2[0], '<' + tag + ' id="' + id + '"' + match2[1] + '>');
      return { content: modified, method: 'placeholder-partial-match' };
    }
  }
  
  // Strategy 4: Match button by text content
  if (features.text && tag === 'button') {
  const txtEsc = features.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Try exact text match in Vue button
    const re = new RegExp('<button([^>]*)>(\\s*)' + txtEsc + '(\\s*)<\/button>', 'g');
    const match = re.exec(modified);
    if (match && !match[1].includes('id=')) {
      modified = modified.replace(match[0], '<button id="' + id + '"' + match[1] + '>' + match[2] + features.text + match[3] + '</button>');
      return { content: modified, method: 'button-text-match' };
    }
    // Try with + prefix
    if (features.text.startsWith('+')) {
      const cleanText = features.text.substring(1).trim();
      const re2 = new RegExp('<button([^>]*)>\\+' + cleanText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '<\/button>', 'g');
      const match2 = re2.exec(modified);
      if (match2 && !match2[1].includes('id=')) {
        modified = modified.replace(match2[0], '<button id="' + id + '"' + match2[1] + '>+' + cleanText + '</button>');
        return { content: modified, method: 'button-text-match' };
      }
    }
  }
  
  // Strategy 5: Match by heading text (for panels/modals)
  if (features.heading && (tag === 'div' || tag === 'section')) {
    const hEsc = features.heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Find a div/section that contains this heading and doesn't have an id
    const re = new RegExp('<' + tag + '(?!\\sid=)([^>]*)>([\\s\\S]{0,200}?)<h[34][^>]*>' + hEsc + '<', 'g');
    const match = re.exec(modified);
    if (match) {
      modified = modified.replace(match[0], '<' + tag + ' id="' + id + '"' + match[1] + '>' + match[2] + '<h' + (features.heading.length > 10 ? '3' : '4') + '><' + hEsc + '<');
      // Actually let's do a simpler replace
      return { content: modified, method: 'heading-match' };
    }
  }
  
  // Strategy 6: Match by class combination
  if (cls) {
    const clsParts = cls.split(' ').filter(c => c.length > 0);
    if (clsParts.length > 0) {
      // Build a regex that matches the tag with these classes
      const clsPattern = clsParts.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
      const re = new RegExp('<' + tag + '(?!\\sid=)([^>]*class="[^"]*' + clsParts[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^"]*"[^>]*)>', 'g');
      let match;
      while ((match = re.exec(modified)) !== null) {
        // Check if all class parts are present
        const allPresent = clsParts.every(c => match[1].includes(c));
        if (allPresent && !match[1].includes('id=')) {
          modified = modified.replace(match[0], '<' + tag + ' id="' + id + '"' + match[1] + '>');
          return { content: modified, method: 'class-match' };
        }
      }
    }
  }
  
  // Strategy 7: Match span by text content
  if (features.spanText && tag === 'span') {
    const spEsc = features.spanText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Try {{ }} template syntax
    const re = new RegExp('<span([^>]*)>' + spEsc + '<\\/span>', 'g');
    const match = re.exec(modified);
    if (match && !match[1].includes('id=')) {
      modified = modified.replace(match[0], '<span id="' + id + '"' + match[1] + '>' + features.spanText + '</span>');
      return { content: modified, method: 'span-text-match' };
    }
  }
  
  // Strategy 8: For close buttons (btn-close-* pattern)
  if (id.startsWith('btn-close-') && tag === 'button') {
    // Find the close button in the corresponding panel
    const panelName = id.replace('btn-close-', '');
    // Look for buttons with class btn-close in a section that matches
    const re = new RegExp('<button([^>]*class="[^"]*btn-close[^"]*"[^>]*)>', 'g');
    let match;
    while ((match = re.exec(modified)) !== null) {
      if (!match[1].includes('id=')) {
        modified = modified.replace(match[0], '<button id="' + id + '"' + match[1] + '>');
        return { content: modified, method: 'close-btn-match' };
      }
    }
  }
  
  // Strategy 9: For btn-* buttons, try matching by @click function name
  if (id.startsWith('btn-') && tag === 'button') {
    // Extract a function name hint from the id
    const funcHint = id.replace(/^btn-/, '').replace(/-/g, '');
    // Try to find a button with @click containing similar text
    const re = new RegExp('<button([^>]*@click="[^"]*' + funcHint + '[^"]*"[^>]*)>', 'gi');
    const match = re.exec(modified);
    if (match && !match[1].includes('id=')) {
      modified = modified.replace(match[0], '<button id="' + id + '"' + match[1] + '>');
      return { content: modified, method: 'click-func-match' };
    }
  }
  
  // Strategy 10: For id that looks like a panel/modal container
  if (tag === 'div' && (id.endsWith('-modal') || id.endsWith('-panel') || id.endsWith('-list'))) {
    // Find the root div of the component template
    const re = new RegExp('<div([^>]*class="[^"]*' + id.replace(/-[a-z]+$/, '') + '[^"]*"[^>]*)>', 'g');
    const match = re.exec(modified);
    if (match && !match[1].includes('id=')) {
      modified = modified.replace(match[0], '<div id="' + id + '"' + match[1] + '>');
      return { content: modified, method: 'container-class-match' };
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

// Group missing IDs by component
const byComponent = {};
missing.forEach(m => {
  const comp = findComponent(m.id);
  if (!comp) {
    results.push({ id: m.id, comp: 'UNKNOWN', status: 'SKIP-no-component', method: '' });
    totalSkipped++;
    return;
  }
  if (!byComponent[comp]) byComponent[comp] = [];
  byComponent[comp].push(m);
});

// Process each component
for (const [compFile, items] of Object.entries(byComponent)) {
  const fullPath = path.join(baseDir, compFile);
  if (!fs.existsSync(fullPath)) {
    console.log('[WARN] File not found: ' + compFile);
    items.forEach(m => {
      results.push({ id: m.id, comp: compFile, status: 'SKIP-file-not-found', method: '' });
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
    // Skip if already has this id
    if (content.includes('id="' + m.id + '"')) {
      compResults.push({ id: m.id, comp: compFile, status: 'ALREADY-HAS', method: '' });
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
      console.log('[SKIP] ' + m.id + ' - no match in ' + compFile);
    }
  }
  
  // Write updated content
  if (content !== fileContents[compFile]) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log('[WRITE] ' + compFile);
  }
  fileContents[compFile] = content;
  results.push(...compResults);
}

// Generate reconciliation table
const report = 'D:/codex/novel-workshop-vue3/_audit/HTML_RECONCILIATION_FINAL.md';
let table = '\n## Batch Fix (All Remaining Components)\n';
table += '| # | ID | Component | Method | Status |\n';
table += '|---|---|---|---|---|\n';
let idx = 1;
results.forEach(r => {
  table += '| ' + idx + ' | ' + r.id + ' | ' + r.comp + ' | ' + r.method + ' | ' + r.status + ' |\n';
  idx++;
});
table += '\n**Summary**: Applied=' + totalApplied + ' | Skipped=' + totalSkipped + ' | Total=' + results.length + '\n';
fs.appendFileSync(report, table, 'utf8');

console.log('\n=== SUMMARY ===');
console.log('Applied: ' + totalApplied);
console.log('Skipped: ' + totalSkipped);
console.log('Total: ' + results.length);
console.log('Report appended to HTML_RECONCILIATION_FINAL.md');

// Output skipped IDs for manual review
const skipped = results.filter(r => r.status.startsWith('SKIP'));
if (skipped.length > 0) {
  console.log('\n=== SKIPPED (need manual fix) ===');
  skipped.forEach(r => console.log(r.id + ' -> ' + r.comp + ' (' + r.status + ')'));
}
