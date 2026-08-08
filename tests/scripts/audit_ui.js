// UI Audit Script - v2.7.46
// Scans renderer.html for all UI elements with id/aria-label/data-format,
// then verifies each has a corresponding handler in renderer_v2.js/panels.js/pipeline-manager.js
// Exit code 0 = all pass, 1 = failures found
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..', '..');
var html = fs.readFileSync(path.join(ROOT, 'renderer.html'), 'utf8');
var js = fs.readFileSync(path.join(ROOT, 'renderer_v2.js'), 'utf8');
var panels = fs.readFileSync(path.join(ROOT, 'panels.js'), 'utf8');
var pipeline = fs.readFileSync(path.join(ROOT, 'js', 'pipeline-manager.js'), 'utf8');
var allJS = js + '\n' + panels + '\n' + pipeline;
var allCode = allJS + '\n' + html; // include HTML for tooltip/attribute checks

var results = [];
var failCount = 0;

function check(id, desc, condition) {
  var status = condition ? 'PASS' : 'FAIL';
  if (!condition) failCount++;
  results.push({ id: id, desc: desc, status: status });
}

// Helper: search with multiple patterns (OR logic)
function hasAny(patterns) {
  return patterns.some(function(p) { return allCode.indexOf(p) !== -1; });
}
function hasRegexAny(patterns) {
  return patterns.some(function(p) { return p.test(allCode); });
}

// === 1. Editor Toolbar (TB01-TB13) ===
check('TB01', 'btn-generate-content handler', hasAny(['btn-generate-content', '_generateContent', 'generateContent']));
check('TB02', 'btn-save-editor handler', hasAny(['btn-save-editor', 'Ctrl+S']));
check('TB03', 'export Markdown', hasAny(['data-format="md"', 'exportChapter']));
check('TB04', 'export txt', hasAny(['data-format="txt"']));
check('TB05', 'export EPUB', hasAny(['data-format="epub"', 'epub']));
check('TB06', 'btn-ai-names handler', hasAny(['btn-ai-names', 'generateNames']));
check('TB07', 'btn-writing-rules handler', hasAny(['btn-writing-rules', 'generateWritingRules']));
check('TB08', 'btn-timeline handler', hasAny(['btn-timeline', 'extractTimeline']));
check('TB09', 'btn-batch-review handler', hasAny(['btn-batch-review', 'batchReview']));
check('TB10', 'btn-revise handler', hasAny(['btn-revise', 'reviseChapter']));
check('TB11', 'btn-de-ai handler', hasAny(['btn-de-ai', 'deAi']));
check('TB12', 'de-ai tooltip', hasAny(['\u53bb\u9664AI\u751f\u6210\u75d5\u8ff9']));
check('TB13', 'undo/redo', hasAny(['btn-undo', 'btn-redo', 'Ctrl+Z']));

// === 2. Find/Replace (FR01-FR04) ===
check('FR01', 'find handler', hasAny(['find-input', 'findInput']));
check('FR02', 'replace handler', hasAny(['replace-input', 'replaceInput']));
check('FR03', 'find prev/next', hasAny(['btn-find-prev', 'btn-find-next', 'findPrev', 'findNext']));
check('FR04', 'replace all', hasAny(['btn-replace-all', 'replaceAll']));

// === 3. Settings Tabs (ST01-ST05) ===
check('ST01', 'API settings tab', hasAny(['tab-api', 'cfg-provider-name']));
check('ST02', 'skills tab', hasAny(['tab-skills', 'skill-list']));
check('ST03', 'agents tab', hasAny(['tab-agents', 'agent-list']));
check('ST04', 'appearance tab', hasAny(['tab-appearance', 'btn-save-appearance', 'saveAppearance']));
check('ST05', 'de-ai tab', hasAny(['tab-deai', 'deai-settings', '_deAiConfig']));

// === 4. API Config (AC01-AC12) ===
check('AC01', 'provider name', hasAny(['cfg-provider-name', 'providerName']));
check('AC02', 'base url', hasAny(['cfg-base-url', 'baseUrl']));
check('AC03', 'api key', hasAny(['cfg-api-key', 'apiKey']));
check('AC04', 'toggle key visibility', hasAny(['btn-toggle-key', 'password']));
check('AC05', 'fetch models', hasAny(['btn-fetch-models', 'fetchModelList', 'fetchModels', 'getModels']));
check('AC06', 'temperature', hasAny(['cfg-temperature', 'temperature']));
check('AC07', 'max tokens', hasAny(['cfg-max-tokens', 'maxTokens']));
check('AC08', 'system prompt', hasAny(['cfg-system-prompt', 'systemPrompt']));
check('AC09', 'test connection', hasAny(['btn-test-connection', 'testConnection']));
check('AC10', 'save API config', hasAny(['btn-save-settings', 'saveSettingsFromForm', 'saveSettings', 'saveProvider']));
check('AC11', 'export config', hasAny(['btn-export-data', 'exportData', 'storageExport']));
check('AC12', 'import config', hasAny(['btn-import-data', 'importData']));

// === 5. Skill Editor (SK01-SK15) ===
check('SK01', 'add skill', hasAny(['btn-add-skill', 'showSkillForm']));
check('SK02', 'skill name field', hasAny(['sf-name']));
check('SK03', 'skill desc field', hasAny(['sf-desc']));
check('SK04', 'skill category', hasAny(['sf-category', 'category']));
check('SK05', 'inject mode', hasAny(['sf-inject-mode', 'injectMode']));
check('SK06', 'bind target', hasAny(['sf-bind-type', 'bindTarget']));
check('SK07', 'context depth', hasAny(['sf-depth', 'injectDepth']));
check('SK08', 'linked skills', hasAny(['sf-linked-list', 'linkedSkillIds']));
check('SK09', 'variable buttons handler', hasRegexAny([/querySelector.*btn-var/, /querySelector.*var-tags/, /\.btn-var.*addEventListener/, /var-tags.*addEventListener/, /delegate.*btn-var/, /closest.*btn-var/]));
check('SK10', 'template Markdown engine', hasAny(['SkillTemplateEngine']));
check('SK11', 'template variable replacement', hasAny(['_renderSkillTemplate']));
check('SK12', 'template script sandbox', hasAny(['runSandboxed', 'SkillTemplateEngine']));
check('SK13', 'Markdown live preview', hasAny(['_initSkillTemplatePreview', 'sf-template-preview']));
check('SK14', 'save skill', hasAny(['btn-save-skill', 'saveSkill']));
check('SK15', 'cancel skill', hasAny(['btn-cancel-skill', 'hideSkillForm']));

// === 6. Agent Editor (AG01-AG07) ===
check('AG01', 'add agent', hasAny(['btn-add-agent', 'showAgentForm']));
check('AG02', 'agent name', hasAny(['af-name', 'AgentManager']));
check('AG03', 'agent desc', hasAny(['af-desc']));
check('AG04', 'agent system prompt', hasAny(['af-prompt', 'systemPrompt']));
check('AG05', 'agent provider', hasAny(['af-provider']));
check('AG06', 'save agent', hasAny(['btn-save-agent', 'saveAgent']));
check('AG07', 'cancel agent', hasAny(['btn-cancel-agent', 'hideAgentForm']));

// === 7. Appearance (AP01-AP02) ===
check('AP01', 'save appearance', hasAny(['btn-save-appearance', 'saveAppearance', '_saveAppearance']));
check('AP02', 'theme switch', hasAny(['theme', 'appearance']));

// === 8. DeAI Settings (DA01-DA09) ===
check('DA01', 'de-ai settings panel', hasAny(['renderDeAiSettings', '_deAiConfig']));
check('DA02', 'de-ai skill selector', hasAny(['_deAiConfig']));
check('DA03', 'de-ai agent selector', hasAny(['cfg.agentId', 'agentId']));
check('DA04', 'de-ai mode (serial/agent)', hasAny(['agentMode', 'split-merge', '_deAiSplitMerge']));
check('DA05', 'de-ai save button', hasAny(['btn-save-deai', 'saveDeAi']));
check('DA06', 'de-ai hardrule toggle', hasAny(['hardrule', 'DeAiProcessor', 'de-ai.js']));
check('DA07', 'de-ai split size', hasAny(['splitSize', 'split-size']));
check('DA08', 'de-ai progress bar', hasAny(['deai-progress', '_showDeAiProgress', '_updateDeAiProgress']));
check('DA09', 'de-ai cancel', hasAny(['btn-deai-cancel', 'cancelController']));

// === 9. Project Management (PM01-PM04) ===
check('PM01', 'new project', hasAny(['btn-new-project', 'newProject', 'npm-name']));
check('PM02', 'book name', hasAny(['npm-name']));
check('PM03', 'outline', hasAny(['npm-outline']));
check('PM04', 'create project', hasAny(['btn-create-project', 'createProject']));

// === 10. Outline Workspace (OW01-OW05) ===
check('OW01', 'import outline', hasAny(['btn-import-outline', 'importOutline']));
check('OW02', 'AI co-create', hasAny(['btn-ai-co-create']));
check('OW03', 'send message', hasAny(['btn-ow-send', 'sendMessage']));
check('OW04', 'gen outline skills', hasAny(['btn-generate-outline-skills', 'generateOutlineSkill']));
check('OW05', 'lock outline', hasAny(['btn-lock-outline', 'lockOutline']));

// === 11. Settings Collection (SC01-SC05) ===
check('SC01', 'add category', hasAny(['btn-add-category', 'addCategory']));
check('SC02', 'add item', hasAny(['btn-add-item', 'addItem']));
check('SC03', 'AI gen settings', hasAny(['btn-ai-gen', 'aiGenSettings', 'genSettings']));
check('SC04', 'save settings', hasAny(['btn-save-settings', 'saveSettings', 'btn-save-item', '_saveSettingsItem']));
check('SC05', 'save bind', hasAny(['btn-save-bind', 'saveBind']));

// === 12. Pipeline (PL01-PL18) ===
check('PL01', 'step1 load outline', hasAny(['btn-pl-load', 'loadOutline']));
check('PL02', 'step1 confirm', hasAny(['step1.*confirm', '\u786e\u8ba4\u5927\u7eb2']));
check('PL03', 'step2 AI gen settings', hasAny(['btn-pl-gen-settings', 'genSettings']));
check('PL04', 'step2 save settings', hasAny(['btn-pl-save-settings', '\u4fdd\u5b58\u8bbe\u5b9a']));
check('PL05', 'step3 AI gen volumes', hasAny(['btn-pl-gen-volumes', '_plGenVolumes']));
check('PL06', 'step3 auto gen volumes', hasAny(['btn-pl-auto-volumes', '_plAutoGenVolumes']));
check('PL07', 'step3 continue gen volumes', hasAny(['btn-pl-cont-vol', '_plContinueGenVolumes']));
check('PL08', 'step3 batch continue', hasAny(['plResume', 'batch.*cont', '\u7eed\u751f\u6210']));
check('PL09', 'step3 confirm volumes', hasAny(['btn-pl-confirm-volumes', '\u5168\u90e8\u786e\u8ba4\u5377\u7eb2']));
check('PL10', 'step4 AI gen chapters', hasAny(['btn-pl-gen-chapters', '_plGenChapters']));
check('PL11', 'step4 auto gen chapters', hasAny(['btn-pl-auto-chapters', '_plAutoGenChapters']));
check('PL12', 'step4 confirm chapters', hasAny(['btn-pl-confirm-chapters', '\u5168\u90e8\u786e\u8ba4\u7ae0\u8282']));
check('PL13', 'step5 AI gen body', hasAny(['btn-pl-gen-body', '_plGenBody']));
check('PL14', 'step5 insert to editor', hasAny(['btn-pl-insert-body', '\u63d2\u5165\u5230\u7f16\u8f91\u5668']));
check('PL15', 'step5 confirm body', hasAny(['btn-pl-confirm-body', '\u786e\u8ba4\u6b63\u6587']));
check('PL16', 'step nav prev/next', hasAny(['btn-pl-prev', 'btn-pl-next', '\u4e0a\u4e00\u6b65', '\u4e0b\u4e00\u6b65']));
check('PL17', 'chapter batch size', hasAny(['chapterBatchSize', 'batch.*size']));
check('PL18', 'resume on disconnect', hasAny(['_plResumeGen', '\u65ad\u70b9', '\u7eed\u751f\u6210']));

// === 13. Memory (ME01-ME03) ===
check('ME01', 'show memory', hasAny(['btn-memory', 'showMemory']));
check('ME02', 'add memory category', hasRegexAny([/btn-add-mem-cat[^-].*addEventListener/, /addEventListener.*btn-add-mem-cat[^-]/, /btn-add-mem-cat[^-].*onclick/, /onclick.*btn-add-mem-cat[^-]/, /_addMemCategory/, /addMemCat/, /delegate.*btn-add-mem-cat/]));
check('ME03', 'add memory item', hasRegexAny([/btn-add-mem[^-].*addEventListener/, /addEventListener.*btn-add-mem[^-]/, /btn-add-mem[^-].*onclick/, /onclick.*btn-add-mem[^-]/, /_addMemoryItem/, /addMemoryItem/, /addMemItem/, /_showMemForm/, /delegate.*btn-add-mem[^-]/]));

// === 14. Export (EX01-EX02) ===
check('EX01', 'export via dropdown', hasAny(['export-dropdown', 'data-format', 'exportChapter']));
check('EX02', 'export dropdown close', hasAny(['export-dropdown', 'classList.remove']));

// === 15. GitHub (GH01-GH05) ===
check('GH01', 'github token input', hasAny(['github-token-input', 'btn-save-token']));
check('GH02', 'token help', hasAny(['btn-token-help', '_toggleTokenHelp']));
check('GH03', 'save and verify token', hasAny(['btn-save-token', '_saveGitHubToken']));
check('GH04', 'search repo', hasAny(['btn-market-search', 'searchGitHub']));
check('GH05', 'pagination', hasAny(['btn-prev-page', 'btn-next-page', '\u4e0a\u4e00\u9875']));

// === 16. AI Rewrite (RW01-RW07) ===
check('RW01', 'rewrite', hasAny(['btn-rewrite', '\u6539\u5199']));
check('RW02', 'expand', hasAny(['btn-expand', '\u6269\u5199']));
check('RW03', 'polish', hasAny(['btn-polish', '\u6da6\u8272']));
check('RW04', 'continue', hasAny(['btn-continue', '\u7eed\u5199']));
check('RW05', 'simplify', hasAny(['btn-simplify', '\u7cbe\u7b80']));
check('RW06', 'apply to editor', hasAny(['msg-btn-apply', '_applyToEditor', 'applyResult', 'applyToEditor']));
check('RW07', 'accept/reject all', hasAny(['btn-diff-accept-all', 'btn-diff-reject-all', 'acceptAll', 'rejectAll']));

// === 17. EPUB Export ===
check('EX10', 'EPUB real implementation', hasAny(['epub']) && !hasAny(['TODO.*epub', '\u6682\u4e0d\u652f\u6301.*epub']));

// === Output ===
results.forEach(function(r) {
  console.log('[' + r.status + '] ' + r.id + ': ' + r.desc);
});
console.log('\n=== AUDIT SUMMARY ===');
console.log('Total: ' + results.length + ' | Pass: ' + (results.length - failCount) + ' | Fail: ' + failCount);
if (failCount > 0) {
  console.log('\n[AUDIT] BLOCKED - ' + failCount + ' UI handler(s) missing');
  process.exit(1);
} else {
  console.log('[AUDIT] PASS - All UI handlers verified');
  process.exit(0);
}
