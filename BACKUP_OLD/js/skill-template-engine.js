var SkillTemplateEngine = (function() {
  // ===== Scene variable definitions =====
  var VAR_SCENES = {
    'volume': ['outlineContent', 'volumeCount', 'wordsPerVolume', 'novelTitle', 'styleTags', 'pacingParams'],
    'chapter': ['volumeOutline', 'chapterCount', 'wordsPerChapter', 'styleTags', 'pacingParams', 'novelTitle'],
    'body': ['chapterTitle', 'chapterSummary', 'prevChapterSummary', 'characters', 'novelTitle', 'chapterPlot'],
    'deai': ['selectedText'],
    'dialogue': ['selectedText', 'novelTitle', 'outlineContent', 'chapterSummary', 'characters', 'chapterTitle']
  };

  // ===== Blocked globals for sandbox =====
  var BLOCKED_KEYS = ['require', 'process', 'fs', 'window', 'document', 'global', 'module',
    'exports', '__dirname', '__filename', 'eval', 'Function', 'setTimeout', 'setInterval',
    'XMLHttpRequest', 'fetch', 'localStorage', 'sessionStorage'];

  // ===== Extract <script> blocks from template =====
  function extractScripts(template) {
    var scripts = [];
    var remaining = template;
    var scriptRegex = /<script(?:\s+lang=["']js["'])?>([\s\S]*?)<\/script>/gi;
    var match;
    var lastIndex = 0;
    var parts = [];
    while ((match = scriptRegex.exec(template)) !== null) {
      // Text before script
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: template.substring(lastIndex, match.index) });
      }
      parts.push({ type: 'script', content: match[1] });
      lastIndex = match.index + match[0].length;
    }
    // Remaining text after last script
    if (lastIndex < template.length) {
      parts.push({ type: 'text', content: template.substring(lastIndex) });
    }
    // If no scripts found, return original as single text part
    if (parts.length === 0) {
      parts.push({ type: 'text', content: template });
    }
    return parts;
  }

  // ===== Sandboxed script execution =====
  function runSandboxed(scriptCode, context) {
    var output = [];
    var errors = [];
    // Build a safe sandbox object
    var safeMath = Math;
    var safeJSON = JSON;
    var safeConsole = {
      log: function() { try { console.log.apply(console, arguments); } catch(e) {} },
      warn: function() { try { console.warn.apply(console, arguments); } catch(e) {} },
      error: function() { try { console.error.apply(console, arguments); } catch(e) {} }
    };
    // Check for blocked keywords before execution
    for (var i = 0; i < BLOCKED_KEYS.length; i++) {
      var key = BLOCKED_KEYS[i];
      var pattern = new RegExp('\\b' + key + '\\b');
      if (pattern.test(scriptCode)) {
        errors.push('[BLOCKED] Access to "' + key + '" is not allowed in SKILL scripts');
      }
    }
    if (errors.length > 0) {
      console.warn('[WARN] SKILL script blocked:', errors.join('; '));
      return { output: [], errors: errors };
    }
    try {
      // Create sandboxed function with restricted scope
      var sandboxFn = new Function('context', 'output', 'Math', 'JSON', 'String', 'Array',
        'Object', 'Date', 'Number', 'Boolean', 'console',
        '"use strict";\n' + scriptCode);
      sandboxFn(context, output, safeMath, safeJSON, String, Array, Object, Date, Number, Boolean, safeConsole);
    } catch(e) {
      errors.push('[ERROR] Script execution failed: ' + e.message);
      console.warn('[WARN] SKILL script error:', e.message);
    }
    return { output: output, errors: errors };
  }

  // ===== Replace {{varName}} in text =====
  function replaceVars(text, context) {
    if (!text) return '';
    var result = text;
    // Replace all known context vars
    var keys = Object.keys(context);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var val = context[key];
      if (val === null || val === undefined) val = '';
      if (typeof val === 'object') val = JSON.stringify(val);
      result = result.replace(new RegExp('\\{\\{' + key + '\\}\\}', 'g'), String(val));
    }
    return result;
  }

  // ===== Main render function =====
  function render(template, context) {
    if (!template) return '';
    if (!context) context = {};
    // Step 1: Extract script blocks and text parts
    var parts = extractScripts(template);
    var result = '';
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (part.type === 'script') {
        // Step 2: Run script in sandbox
        var scriptResult = runSandboxed(part.content, context);
        // Step 3: Append script output to result
        if (scriptResult.output.length > 0) {
          result += scriptResult.output.join('\n');
        }
      } else {
        // Step 4: Replace variables in text parts
        result += replaceVars(part.content, context);
      }
    }
    // Step 5: Replace any remaining vars in the final result (in case scripts introduced them)
    result = replaceVars(result, context);
    return result;
  }

  // ===== Get available variables for a scene =====
  function getVarsForScene(scene) {
    return VAR_SCENES[scene] || [];
  }

  // ===== Get all known variable names =====
  function getAllVars() {
    var all = {};
    Object.keys(VAR_SCENES).forEach(function(scene) {
      VAR_SCENES[scene].forEach(function(v) { all[v] = true; });
    });
    return Object.keys(all);
  }

  // ===== Check if template contains script blocks =====
  function hasScripts(template) {
    if (!template) return false;
    return /<script[\s\S]*?>[\s\S]*?<\/script>/i.test(template);
  }

  return {
    render: render,
    replaceVars: replaceVars,
    getVarsForScene: getVarsForScene,
    getAllVars: getAllVars,
    hasScripts: hasScripts,
    VAR_SCENES: VAR_SCENES
  };
})();

console.log('[OK] SkillTemplateEngine loaded');
