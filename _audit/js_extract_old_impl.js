const fs = require('fs');
const path = require('path');

const AUDIT_DIR = __dirname;
const OLD_DIR = 'C:\\Users\\凯瑞\\Documents\\New project 2';

const verifyData = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, 'js_deep_verify3.json'), 'utf8'));
const stillMissing = verifyData.stillMissing;

// Read old source files
const panelsSrc = fs.readFileSync(path.join(OLD_DIR, 'panels.js'), 'utf8');
const rendererSrc = fs.readFileSync(path.join(OLD_DIR, 'renderer_v2.js'), 'utf8');

console.log('[INFO] panels.js: ' + (panelsSrc.length / 1024).toFixed(1) + ' KB');
console.log('[INFO] renderer_v2.js: ' + (rendererSrc.length / 1024).toFixed(1) + ' KB');

// Extract function implementation from source
// Supports: function name(), name(), name: function(), async name(), name(args) {
function extractFuncImpl(src, funcName) {
  const patterns = [
    // function name(args) {
    new RegExp('function\\s+' + funcName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '\\s*\\([^)]*\\)\\s*\\{'),
    // name(args) {  (method shorthand)
    new RegExp('\\b' + funcName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '\\s*\\([^)]*\\)\\s*\\{'),
    // name: function(args) {
    new RegExp('\\b' + funcName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '\\s*:\\s*function\\s*\\([^)]*\\)\\s*\\{'),
    // name: async function(args) {
    new RegExp('\\b' + funcName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '\\s*:\\s*async\\s+function\\s*\\([^)]*\\)\\s*\\{'),
    // async name(args) {
    new RegExp('async\\s+' + funcName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '\\s*\\([^)]*\\)\\s*\\{'),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(src);
    if (match) {
      // Extract the function body by counting braces
      let start = match.index;
      let braceStart = src.indexOf('{', match.index + match[0].length - 1);
      if (braceStart === -1) continue;
      let depth = 1;
      let i = braceStart + 1;
      while (i < src.length && depth > 0) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
        i++;
      }
      // Get function text (up to 500 chars for context)
      const fullText = src.substring(start, i);
      const snippet = fullText.length > 800 ? fullText.substring(0, 800) + '... [truncated]' : fullText;
      return {
        start: start,
        end: i,
        length: fullText.length,
        snippet: snippet
      };
    }
  }
  return null;
}

// Categorize functions by their implementation patterns
const categories = {
  // Pure DOM rendering (innerHTML, textContent, style manipulation)
  DOM_RENDER: [],
  // Show/hide panels via CSS class toggle
  PANEL_TOGGLE: [],
  // Event binding (addEventListener, onclick=)
  EVENT_BIND: [],
  // Form fill/save (reading/writing form inputs)
  FORM_IO: [],
  // Business logic (AI calls, data processing, algorithms)
  BUSINESS_LOGIC: [],
  // Utility/helper
  UTILITY: [],
  // Not found in source
  NOT_FOUND: []
};

const results = [];

for (const m of stillMissing) {
  const name = m.name;
  const src = m.oldFile === 'panels.js' ? panelsSrc : rendererSrc;

  const impl = extractFuncImpl(src, name);

  if (!impl) {
    categories.NOT_FOUND.push({ name, oldFile: m.oldFile, category: 'NOT_FOUND' });
    results.push({ name, oldFile: m.oldFile, category: 'NOT_FOUND', impl: null });
    continue;
  }

  const snippet = impl.snippet;
  const lowerSnippet = snippet.toLowerCase();

  // Classify based on content patterns
  let category = '';

  // Check for DOM rendering patterns
  const hasInnerHTML = lowerSnippet.includes('innerhtml');
  const hasTextContent = lowerSnippet.includes('textcontent');
  const hasStyle = lowerSnippet.includes('.style.');
  const hasClassList = lowerSnippet.includes('classlist') || lowerSnippet.includes('classname');
  const hasQuerySelector = lowerSnippet.includes('queryselector') || lowerSnippet.includes('getelementby');
  const hasAddEventListener = lowerSnippet.includes('addeventlistener');
  const hasOnclick = lowerSnippet.includes('onclick') || lowerSnippet.includes('oninput') || lowerSnippet.includes('onchange');
  const hasFetchApi = lowerSnippet.includes('fetch(') || lowerSnippet.includes('.api') || lowerSnippet.includes('await ');
  const hasFormData = lowerSnippet.includes('.value') && (lowerSnippet.includes('getelementby') || lowerSnippet.includes('queryselector'));
  const hasCreateElement = lowerSnippet.includes('createelement');
  const hasAppendChild = lowerSnippet.includes('appendchild');
  const hasClassToggle = lowerSnippet.includes('toggle') || lowerSnippet.includes('add(') || lowerSnippet.includes('remove(') || lowerSnippet.includes('.hidden');

  // Count DOM operations
  const domCount = [hasInnerHTML, hasTextContent, hasStyle, hasClassList, hasQuerySelector, hasCreateElement, hasAppendChild].filter(Boolean).length;

  // Business logic indicators
  const hasAlgorithm = lowerSnippet.includes('for(') || lowerSnippet.includes('while(') || lowerSnippet.includes('reduce(') || lowerSnippet.includes('map(') || lowerSnippet.includes('filter(');
  const hasAIRequest = lowerSnippet.includes('aigenerate') || lowerSnippet.includes('streamchat') || lowerSnippet.includes('callaiapi') || lowerSnippet.includes('openai') || lowerSnippet.includes('messages');
  const hasDataProcess = lowerSnippet.includes('json.parse') || lowerSnippet.includes('json.stringify') || lowerSnippet.includes('parse(') || lowerSnippet.includes('regex') || lowerSnippet.includes('match(');

  if (hasFetchApi || hasAIRequest) {
    category = 'BUSINESS_LOGIC';
  } else if (domCount >= 2 || (hasInnerHTML && hasAppendChild) || (hasCreateElement && hasAppendChild)) {
    category = 'DOM_RENDER';
  } else if (hasClassToggle && (lowerSnippet.includes('panel') || lowerSnippet.includes('modal') || lowerSnippet.includes('sidebar') || lowerSnippet.includes('workspace') || lowerSnippet.includes('settings') || lowerSnippet.includes('market') || lowerSnippet.includes('collection'))) {
    category = 'PANEL_TOGGLE';
  } else if (hasAddEventListener || hasOnclick) {
    category = 'EVENT_BIND';
  } else if (hasFormData || (lowerSnippet.includes('.value') && lowerSnippet.includes('form'))) {
    category = 'FORM_IO';
  } else if (hasAlgorithm || hasDataProcess) {
    category = 'BUSINESS_LOGIC';
  } else if (domCount >= 1 || hasInnerHTML || hasTextContent || hasStyle || hasClassList) {
    category = 'DOM_RENDER';
  } else {
    category = 'UTILITY';
  }

  categories[category].push({ name, oldFile: m.oldFile, category });
  results.push({ name, oldFile: m.oldFile, category, impl: snippet, length: impl.length });
}

// Summary
console.log('\n=== FUNCTION CLASSIFICATION ===');
console.log('DOM_RENDER (replaced by Vue templates):', categories.DOM_RENDER.length);
console.log('PANEL_TOGGLE (replaced by v-if/v-show):', categories.PANEL_TOGGLE.length);
console.log('EVENT_BIND (replaced by @event):', categories.EVENT_BIND.length);
console.log('FORM_IO (replaced by v-model):', categories.FORM_IO.length);
console.log('BUSINESS_LOGIC (needs verification):', categories.BUSINESS_LOGIC.length);
console.log('UTILITY:', categories.UTILITY.length);
console.log('NOT_FOUND:', categories.NOT_FOUND.length);

// Print business logic functions (these need careful checking)
if (categories.BUSINESS_LOGIC.length > 0) {
  console.log('\n=== BUSINESS_LOGIC FUNCTIONS (need verification) ===');
  categories.BUSINESS_LOGIC.forEach((m, i) => {
    console.log((i + 1) + '. ' + m.name + ' (from ' + m.oldFile + ')');
  });
}

// Print utility functions
if (categories.UTILITY.length > 0) {
  console.log('\n=== UTILITY FUNCTIONS ===');
  categories.UTILITY.forEach((m, i) => {
    console.log((i + 1) + '. ' + m.name + ' (from ' + m.oldFile + ')');
  });
}

// Write full results
fs.writeFileSync(path.join(AUDIT_DIR, 'js_func_classification.json'), JSON.stringify({
  summary: {
    total: stillMissing.length,
    DOM_RENDER: categories.DOM_RENDER.length,
    PANEL_TOGGLE: categories.PANEL_TOGGLE.length,
    EVENT_BIND: categories.EVENT_BIND.length,
    FORM_IO: categories.FORM_IO.length,
    BUSINESS_LOGIC: categories.BUSINESS_LOGIC.length,
    UTILITY: categories.UTILITY.length,
    NOT_FOUND: categories.NOT_FOUND.length,
    timestamp: new Date().toISOString()
  },
  categories: categories,
  details: results
}, null, 2), 'utf8');

console.log('\n[OK] Classification written to js_func_classification.json');
