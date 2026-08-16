const fs = require('fs');
const oldDir = 'C:/Users/凯瑞/Documents/New project 2';

// Extract panels.js functions with broader patterns
const panelsContent = fs.readFileSync(oldDir + '/panels.js', 'utf8');
const rendererContent = fs.readFileSync(oldDir + '/renderer_v2.js', 'utf8');

const missingFromPanels = ['_addSettingsItem','_importDroppedFile','_parseRepoReadme','_syncBoundSettingsToPipeline','addSelectedSkills','getContextSettings','importOutlineFile'];
const missingFromRenderer = ['_looksLikeJSON','_safeRender'];

function extractAll(content, fnName) {
  // Try multiple patterns
  const patterns = [
    new RegExp(fnName + '\\s*\\('),
    new RegExp(fnName + '\\s*='),
    new RegExp(fnName + '\\s*\\{')
  ];
  for (const pat of patterns) {
    const m = content.match(pat);
    if (m) {
      const idx = content.indexOf(m[0]);
      // Find the enclosing function
      let funcStart = idx;
      // Go back to find function start or assignment
      let lineStart = content.lastIndexOf('\n', idx);
      if (lineStart === -1) lineStart = 0;
      // Search forward for opening brace
      let braceStart = content.indexOf('{', idx);
      if (braceStart === -1 || braceStart - idx > 300) continue;
      let depth = 0;
      let end = braceStart;
      for (let j = braceStart; j < content.length; j++) {
        if (content[j] === '{') depth++;
        if (content[j] === '}') depth--;
        if (depth === 0) { end = j + 1; break; }
      }
      const impl = content.slice(lineStart, end);
      if (impl.length > 10 && impl.length < 5000) {
        return impl.slice(0, 1200);
      }
    }
  }
  return null;
}

const out = {};
for (const fn of missingFromPanels) {
  const impl = extractAll(panelsContent, fn);
  out[fn] = { file: 'panels.js', impl: impl };
}
for (const fn of missingFromRenderer) {
  const impl = extractAll(rendererContent, fn);
  out[fn] = { file: 'renderer_v2.js', impl: impl };
}

// Also check existing Vue3 services for key functions
const vueServices = ['de-ai.js','persona-engine.js','pipeline-manager.js','skill-manager.js','utils.js'];
const vueServiceDir = 'D:/codex/novel-workshop-vue3/src/services';
const vueContent = {};
for (const f of vueServices) {
  const p = vueServiceDir + '/' + f;
  if (fs.existsSync(p)) vueContent[f] = fs.readFileSync(p, 'utf8');
}

// Check which NEEDS_PORT functions exist in Vue3 services
const needsPort = ['_applyTextFilter','_estimateTokens','_getDeAiTemperature','_getWordCount','_lcsDiff','_mergeSegments','processSegment','_buildDiffResult','_acceptDiffLine','_rejectDiffLine','validateEventCores','validatePerspective','_deAiSplitMerge','_getBoundSettingsForContext','_selectDeAiMode','_syncDeAiConfigFromDOM','autoResizeInput','getSaveStatusInfo','testSkill'];
const foundInVue = {};
for (const fn of needsPort) {
  foundInVue[fn] = [];
  for (const [file, content] of Object.entries(vueContent)) {
    if (content.includes(fn)) {
      foundInVue[fn].push(file);
    }
    // Also search by keywords
    const keywords = fn.replace(/^_/, '').replace(/([A-Z])/g, ' $1').toLowerCase().trim();
    const words = keywords.split(' ');
    for (const w of words) {
      if (w.length > 3 && content.toLowerCase().includes(w.toLowerCase())) {
        if (!foundInVue[fn].includes(file)) foundInVue[fn].push(file + '(keyword:' + w + ')');
      }
    }
  }
}

out._vueServiceCheck = foundInVue;
console.log(JSON.stringify(out, null, 2));
