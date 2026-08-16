const fs = require('fs');
const path = require('path');

const rawFile = 'D:/codex/novel-workshop-vue3/_audit/diff-engine/rules_raw.json';
const outFile = 'D:/codex/novel-workshop-vue3/_audit/diff-engine/rules_final.json';
const vue3Root = 'D:/codex/novel-workshop-vue3/src';

const raw = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
let rules = raw.rules;

// === LAYER TO VUE3 FILE MAPPING ===
const layerMap = {
  T01: {
    files: ['src/services/storage.js', 'src/stores/provider.ts', 'src/stores/agent.ts', 'src/stores/skill.ts', 'src/stores/project.ts', 'src/stores/chapter.ts', 'src/services/skill-engine.js', 'src/services/skill-validators.js', 'src/services/skill-template-engine.js', 'src/services/utils.js', 'electron/preload.ts', 'electron/main.js', 'src/App.vue'],
    keywords: { storageRead: 'storage.js', storageWrite: 'storage.js', PREFIX: 'storage.js', wa_: 'storage.js', safeKey: 'main.js', safeStorage: 'main.js', encrypt: 'main.js', decrypt: 'main.js', StorageManager: 'storage.js', ProviderManager: 'provider.ts', AgentManager: 'agent.ts', SkillManager: 'skill.ts', ProjectManager: 'project.ts', ChapterManager: 'chapter.ts' }
  },
  T02: {
    files: ['src/composables/useAiRequest.ts', 'src/services/api.js', 'src/App.vue', 'src/composables/useChat.ts'],
    keywords: { _aiRequest: 'useAiRequest.ts', _callAiApi: 'useAiRequest.ts', streamChat: 'useChat.ts', sendMessage: 'useChat.ts', fetch: 'useAiRequest.ts', AbortController: 'useAiRequest.ts' }
  },
  T03: {
    files: ['src/components/pipeline/PipelinePanel.vue', 'src/components/editor/EditorPanel.vue', 'src/components/chat/ChatPanel.vue', 'src/components/deai/DeAiButton.vue', 'src/components/settings/SettingsModal.vue', 'src/components/common/OutlineWorkspace.vue', 'src/services/pipeline-manager.js', 'src/services/de-ai.js'],
    keywords: { pipeline: 'PipelinePanel.vue', deAi: 'de-ai.js', deai: 'DeAiButton.vue', editor: 'EditorPanel.vue', chat: 'ChatPanel.vue', plGen: 'pipeline-manager.js', splitMerge: 'de-ai.js', multiStep: 'de-ai.js', chain: 'de-ai.js' }
  },
  T04: {
    files: ['src/components/sidebar/SidebarNav.vue', 'src/components/settings/SettingsModal.vue', 'src/components/pipeline/PipelinePanel.vue', 'src/components/common/OutlineWorkspace.vue', 'src/App.vue', 'src/composables/useShortcuts.ts'],
    keywords: { overlay: 'App.vue', settings: 'SettingsModal.vue', pipeline: 'PipelinePanel.vue', outline: 'OutlineWorkspace.vue', btn: 'App.vue' }
  },
  T05: {
    files: ['src/components/chat/ChatMessage.vue', 'src/components/editor/EditorPanel.vue', 'src/components/sidebar/ChapterTree.vue', 'src/components/settings/SettingsModal.vue', 'src/components/common/ContextMenu.vue', 'src/App.vue', 'src/styles/main.css'],
    keywords: { render: 'App.vue', vhtml: 'ChatMessage.vue', marked: 'ChatMessage.vue', contenteditable: 'ChapterTree.vue', innerHTML: 'App.vue' }
  },
  T06: {
    files: ['src/composables/useShortcuts.ts', 'src/App.vue', 'src/components/sidebar/ChapterTree.vue', 'src/components/chat/ChatPanel.vue', 'src/components/editor/EditorPanel.vue'],
    keywords: { bindEvents: 'App.vue', addEventListener: 'App.vue', hotkeys: 'useShortcuts.ts', contextmenu: 'ChapterTree.vue', dblclick: 'ChapterTree.vue', drag: 'ChapterTree.vue', click: 'App.vue' }
  },
  T07: {
    files: ['src/App.vue', 'src/main.ts', 'src/composables/useAutoSave.ts', 'src/composables/useLifecycle.ts'],
    keywords: { init: 'App.vue', mounted: 'App.vue', onMounted: 'App.vue', onUnmounted: 'App.vue', autoSave: 'useAutoSave.ts', closeAllPanels: 'App.vue' }
  },
  T08: {
    files: ['src/services/storage.js', 'electron/main.js', 'src/stores/provider.ts', 'src/stores/project.ts', 'src/stores/chapter.ts'],
    keywords: { storage: 'storage.js', migrate: 'main.js', safeKey: 'main.js', wa_: 'storage.js', orphan: 'project.ts', cascade: 'project.ts', windowState: 'main.js', diagLog: 'main.js' }
  },
  T09: {
    files: ['src/composables/useAiRequest.ts', 'src/services/api.js', 'electron/main.js'],
    keywords: { fetch: 'useAiRequest.ts', SSE: 'useAiRequest.ts', stream: 'useAiRequest.ts', retry: 'useAiRequest.ts', heartbeat: 'useAiRequest.ts', idle: 'useAiRequest.ts', timeout: 'useAiRequest.ts', fetchModels: 'main.js', 429: 'useAiRequest.ts', 400: 'useAiRequest.ts' }
  },
  T10: {
    files: ['src/services/diag.js', 'src/composables/useAiRequest.ts', 'src/composables/useErrorHandler.ts', 'src/App.vue'],
    keywords: { try: 'useErrorHandler.ts', catch: 'useErrorHandler.ts', error: 'useErrorHandler.ts', DiagLogger: 'diag.js', warn: 'diag.js' }
  },
  T11: {
    files: ['src/composables/useDebounce.ts', 'src/components/sidebar/ChapterTree.vue', 'src/App.vue', 'src/components/pipeline/PipelinePanel.vue'],
    keywords: { debounce: 'useDebounce.ts', lazy: 'App.vue', RAF: 'App.vue', virtualScroll: 'ChapterTree.vue' }
  },
  T12: {
    files: ['src/stores/provider.ts', 'src/stores/agent.ts', 'src/stores/skill.ts', 'src/stores/settings.ts', 'src/stores/deai.ts', 'src/services/provider-manager.js'],
    keywords: { temperature: 'provider.ts', maxTokens: 'provider.ts', purpose: 'provider.ts', streamMode: 'provider.ts', agent: 'agent.ts', skill: 'skill.ts', deai: 'deai.ts', _getDeAiTemperature: 'deai.ts' }
  },
  T13: {
    files: ['electron/preload.ts', 'electron/main.js'],
    keywords: { contextIsolation: 'main.js', nodeIntegration: 'main.js', IPC: 'preload.ts', ipcRenderer: 'preload.ts', sendSync: 'preload.ts', invoke: 'preload.ts', contextBridge: 'preload.ts' }
  },
  T14: {
    files: ['src/stores/app-state.ts', 'src/App.vue', 'src/stores/pipeline.ts', 'src/stores/deai.ts'],
    keywords: { overlay: 'app-state.ts', settings: 'app-state.ts', pipeline: 'pipeline.ts', deai: 'deai.ts', streaming: 'app-state.ts', progress: 'app-state.ts' }
  },
  T15: {
    files: ['src/services/storage.js', 'src/services/file-import.ts', 'src/components/chat/ChatMessage.vue'],
    keywords: { UTF: 'storage.js', BOM: 'storage.js', JSON: 'storage.js', parse: 'storage.js', TextDecoder: 'file-import.ts', marked: 'ChatMessage.vue', sanitize: 'ChatMessage.vue', safeKey: 'storage.js' }
  },
  T16: {
    files: ['electron/main.js', 'electron/preload.ts', 'src/services/storage.js'],
    keywords: { safeStorage: 'main.js', encrypt: 'main.js', safeKey: 'main.js', single: 'main.js', IPC: 'preload.ts', sanitize: 'ChatMessage.vue', debug: 'main.js', log: 'main.js' }
  },
  T17: {
    files: ['src/services/storage.js', 'electron/main.js', 'src/stores/provider.ts', 'src/stores/project.ts'],
    keywords: { migrate: 'main.js', APPDATA: 'main.js', Documents: 'main.js', migrated: 'main.js', orphan: 'project.ts', localStorage: 'storage.js' }
  },
  T18: {
    files: ['src/composables/useShortcuts.ts', 'src/App.vue', 'src/components/sidebar/ChapterTree.vue'],
    keywords: { Ctrl: 'useShortcuts.ts', Escape: 'useShortcuts.ts', aria: 'App.vue', focus: 'App.vue', keyboard: 'useShortcuts.ts', backdrop: 'App.vue' }
  },
  T19: {
    files: ['package.json', 'electron-builder.yml', 'electron/main.js'],
    keywords: { electron: 'package.json', builder: 'package.json', NSIS: 'package.json', dist: 'package.json', version: 'package.json', test: 'package.json' }
  },
  T20: {
    files: ['src/App.vue', 'src/composables/useAutoSave.ts', 'src/composables/useAiRequest.ts', 'src/composables/useDebounce.ts'],
    keywords: { setInterval: 'useAutoSave.ts', setTimeout: 'App.vue', requestAnimationFrame: 'App.vue', AbortController: 'useAiRequest.ts', Promise: 'useAiRequest.ts', async: 'useAiRequest.ts' }
  },
  T21: {
    files: ['electron/main.js', 'electron/preload.ts'],
    keywords: { BrowserWindow: 'main.js', app: 'main.js', GPU: 'main.js', process: 'main.js', window: 'main.js' }
  },
  T22: {
    files: ['src/stores/provider.ts', 'src/stores/pipeline.ts', 'src/stores/deai.ts', 'src/composables/useAiRequest.ts', 'src/services/skill-engine.js'],
    keywords: { data: 'pipeline.ts', flow: 'pipeline.ts', store: 'provider.ts', stream: 'useAiRequest.ts' }
  },
  T23: {
    files: ['package.json', 'src/main.ts', 'electron/main.js'],
    keywords: { dependencies: 'package.json', devDependencies: 'package.json', hotkeys: 'package.json', marked: 'package.json', electron: 'package.json' }
  }
};

// === P2: ENHANCE CLASSIFICATION ===
// Rules already have basic type from P1, but let's refine
for (const rule of rules) {
  const text = rule.rule;
  
  // Refine value rules with expected values
  if (rule.type === 'value') {
    // Extract expected value if present
    const valMatch = text.match(/(0\.7|0\.3|128000|4096|true|false|15秒|10秒|60秒|10分钟|30秒|3秒|15000|600000|30000|wa_|enc:|\.json|sendSync|invoke|generate|verify|detect)/);
    if (valMatch) rule.expected_value = valMatch[1];
  }
  
  // For behavior rules, try to extract operation hints
  if (rule.type === 'behavior') {
    const ops = [];
    if (text.match(/点击|click/)) ops.push('click');
    if (text.match(/输入|input|type/)) ops.push('input');
    if (text.match(/按键|Ctrl|Escape|Enter|快捷键/)) ops.push('keyboard');
    if (text.match(/拖拽|drag/)) ops.push('drag');
    if (text.match(/右键|contextmenu/)) ops.push('right-click');
    if (text.match(/双击|dblclick/)) ops.push('double-click');
    if (text.match(/切换|switch|toggle/)) ops.push('toggle');
    if (text.match(/保存|save/)) ops.push('save');
    if (text.match(/发送|send/)) ops.push('send');
    if (text.match(/生成|generate/)) ops.push('generate');
    if (text.match(/关闭|close/)) ops.push('close');
    if (text.match(/流式|stream/)) ops.push('stream');
    rule.operations = ops;
  }
  
  // For state rules, extract state targets
  if (rule.type === 'state') {
    const stateTargets = [];
    if (text.match(/供应商|provider/)) stateTargets.push('providerStore');
    if (text.match(/智能体|agent/)) stateTargets.push('agentStore');
    if (text.match(/技能|skill/)) stateTargets.push('skillStore');
    if (text.match(/项目|project/)) stateTargets.push('projectStore');
    if (text.match(/章节|chapter/)) stateTargets.push('chapterStore');
    if (text.match(/设置|settings/)) stateTargets.push('settingsStore');
    if (text.match(/去AI|deai/)) stateTargets.push('deaiStore');
    if (text.match(/localStorage|StorageManager/)) stateTargets.push('storage');
    rule.state_targets = stateTargets;
  }
}

// === P3: MAP RULES TO VUE3 FILES ===
for (const rule of rules) {
  const map = layerMap[rule.layer];
  if (!map) {
    rule.target_files = [];
    continue;
  }
  
  const targetFiles = new Set();
  
  // Always add all layer default files
  for (const f of map.files) targetFiles.add(f);
  
  // Try to narrow down using keyword matching
  const keyword = rule.search_keyword || '';
  if (keyword && map.keywords) {
    for (const [kw, file] of Object.entries(map.keywords)) {
      if (keyword.includes(kw) || kw.includes(keyword) || rule.rule.includes(kw)) {
        targetFiles.add('src/' + (file.includes('/') ? file : getFilePath(file, rule.layer)));
      }
    }
  }
  
  // Also check rule text for keywords
  if (map.keywords) {
    for (const [kw, file] of Object.entries(map.keywords)) {
      if (rule.rule.includes(kw)) {
        const fullPath = file.includes('src/') || file.includes('electron/') ? file : getFilePath(file, rule.layer);
        targetFiles.add(fullPath);
      }
    }
  }
  
  rule.target_files = Array.from(targetFiles);
  rule.target = rule.target_files[0] || 'unknown';
}

function getFilePath(filename, layer) {
  // Helper to construct full path from filename
  if (filename.includes('.vue')) return 'src/components/' + filename;
  if (filename.includes('.ts') && !filename.includes('electron/')) return 'src/' + (filename.includes('store') ? 'stores/' : filename.includes('composable') || filename.includes('use') ? 'composables/' : 'services/') + filename;
  if (filename.includes('.js') && !filename.includes('electron/') && !filename.includes('package')) return 'src/services/' + filename;
  if (filename.includes('main.js') || filename.includes('preload')) return 'electron/' + filename;
  if (filename.includes('package.json') || filename.includes('electron-builder')) return filename;
  return filename;
}

// === P4: COMPLETENESS VALIDATION ===
const errors = [];
const seenIds = new Set();
const seenRules = new Set();

for (const rule of rules) {
  // Check unique ID
  if (seenIds.has(rule.id)) errors.push('Duplicate ID: ' + rule.id);
  seenIds.add(rule.id);
  
  // Check layer
  if (!rule.layer) errors.push('Missing layer for ' + rule.id);
  
  // Check type
  if (!['existence', 'value', 'behavior', 'state'].includes(rule.type)) {
    errors.push('Invalid type for ' + rule.id + ': ' + rule.type);
  }
  
  // Check target_files
  if (!rule.target_files || rule.target_files.length === 0) {
    errors.push('No target_files for ' + rule.id + ' (layer ' + rule.layer + ')');
  }
  
  // Check search_keyword
  if (!rule.search_keyword || rule.search_keyword.length < 2) {
    errors.push('Missing search_keyword for ' + rule.id);
  }
  
  // Check for duplicate rules (by first 25 chars)
  const snippet = rule.rule.substring(0, 25);
  if (seenRules.has(snippet)) {
    errors.push('Duplicate rule text: ' + rule.id + ' (' + snippet + ')');
  }
  seenRules.add(snippet);
}

// Check layer coverage
const layerCoverage = {};
for (const r of rules) layerCoverage[r.layer] = (layerCoverage[r.layer] || 0) + 1;
for (let i = 1; i <= 23; i++) {
  const id = 'T' + String(i).padStart(2, '0');
  if (!layerCoverage[id]) errors.push('Missing layer coverage: ' + id);
  else if (layerCoverage[id] < 3) errors.push('Layer ' + id + ' has only ' + layerCoverage[id] + ' rules (min 3)');
}

// === OUTPUT ===
const typeCount = {};
for (const r of rules) typeCount[r.type] = (typeCount[r.type] || 0) + 1;

const finalOutput = {
  total: rules.length,
  layers_covered: Object.keys(layerCoverage).length,
  by_type: typeCount,
  by_layer: layerCoverage,
  validation_errors: errors,
  validation_passed: errors.length === 0,
  frozen_at: new Date().toISOString(),
  rules: rules
};

fs.writeFileSync(outFile, JSON.stringify(finalOutput, null, 2), 'utf8');

console.log('=== P2-P4 Complete ===');
console.log('Total rules:', rules.length);
console.log('Layers covered:', Object.keys(layerCoverage).length);
console.log('By type:', JSON.stringify(typeCount));
console.log('Validation errors:', errors.length);
if (errors.length > 0) {
  console.log('First 10 errors:');
  for (const e of errors.slice(0, 10)) console.log('  -', e);
} else {
  console.log('ALL VALIDATIONS PASSED - rules_final.json FROZEN');
}
console.log('Output:', outFile);
