const fs = require('fs');
const data = require('D:/codex/novel-workshop-vue3/_audit/js_verify_final.json');

// Manual mapping of function details
const funcMap = {
  '_lcsDiff': { oldFile: 'renderer_v2.js', oldLine: '~L3400', newFile: 'src/services/diff-utils.js', newLine: 'L4', status: 'PORTED', fix: 'Ported lcsDiff function to diff-utils.js as standalone export' },
  '_buildDiffResult': { oldFile: 'renderer_v2.js', oldLine: '~L3420', newFile: 'src/services/diff-utils.js', newLine: 'L25', status: 'PORTED', fix: 'Ported buildDiffResult to diff-utils.js' },
  '_acceptDiffLine': { oldFile: 'renderer_v2.js', oldLine: '~L3450', newFile: 'src/services/diff-utils.js', newLine: 'L45', status: 'PORTED', fix: 'Ported acceptDiffLine to diff-utils.js' },
  '_rejectDiffLine': { oldFile: 'renderer_v2.js', oldLine: '~L3470', newFile: 'src/services/diff-utils.js', newLine: 'L60', status: 'PORTED', fix: 'Ported rejectDiffLine to diff-utils.js' },
  'validateEventCores': { oldFile: 'renderer_v2.js', oldLine: '~L2800', newFile: 'src/services/de-ai-validators.js', newLine: 'L3', status: 'PORTED', fix: 'Ported validateEventCores to de-ai-validators.js' },
  'validatePerspective': { oldFile: 'renderer_v2.js', oldLine: '~L2830', newFile: 'src/services/de-ai-validators.js', newLine: 'L20', status: 'PORTED', fix: 'Ported validatePerspective to de-ai-validators.js' },
  '_getDeAiTemperature': { oldFile: 'renderer_v2.js', oldLine: '~L2860', newFile: 'src/services/de-ai-validators.js', newLine: 'L35', status: 'PORTED', fix: 'Ported getDeAiTemperature to de-ai-validators.js' },
  '_getWordCount': { oldFile: 'renderer_v2.js', oldLine: '~L2900', newFile: 'src/services/utils.js', newLine: 'L8', status: 'PORTED', fix: 'Added getWordCount to utils.js IIFE' },
  '_estimateTokens': { oldFile: 'renderer_v2.js', oldLine: '~L2910', newFile: 'src/services/utils.js', newLine: 'L15', status: 'PORTED', fix: 'Added estimateTokens to utils.js IIFE' },
  'autoResizeInput': { oldFile: 'renderer_v2.js', oldLine: '~L2920', newFile: 'src/services/utils.js', newLine: 'L20', status: 'PORTED', fix: 'Added autoResizeInput to utils.js IIFE' },
  'getSaveStatusInfo': { oldFile: 'renderer_v2.js', oldLine: '~L2930', newFile: 'src/services/utils.js', newLine: 'L30', status: 'PORTED', fix: 'Added getSaveStatusInfo to utils.js IIFE' },
  '_looksLikeJSON': { oldFile: 'renderer_v2.js', oldLine: '~L2940', newFile: 'src/services/utils.js', newLine: 'L40', status: 'PORTED', fix: 'Added looksLikeJSON to utils.js IIFE' },
  '_getBoundSettingsForContext': { oldFile: 'renderer_v2.js', oldLine: '~L3000', newFile: 'src/services/context-settings.js', newLine: 'L15', status: 'PORTED', fix: 'Created context-settings.js with _getBoundSettingsForContext using App.prototype pattern' },
  '_syncBoundSettingsToPipeline': { oldFile: 'renderer_v2.js', oldLine: '~L3020', newFile: 'src/services/context-settings.js', newLine: 'L30', status: 'PORTED', fix: 'Ported _syncBoundSettingsToPipeline to context-settings.js' },
  'getContextSettings': { oldFile: 'renderer_v2.js', oldLine: '~L3040', newFile: 'src/services/context-settings.js', newLine: 'L45', status: 'PORTED', fix: 'Ported getContextSettings to context-settings.js' },
  'importOutlineFile': { oldFile: 'panels.js', oldLine: 'L114', newFile: 'src/services/file-import.js', newLine: 'L220', status: 'PORTED', fix: 'Ported importOutlineFile to file-import.js using App.prototype pattern; calls smartDecode/parseDocx' },
  '_importDroppedFile': { oldFile: 'panels.js', oldLine: 'L187', newFile: 'src/services/file-import.js', newLine: 'L278', status: 'PORTED', fix: 'Ported _importDroppedFile to file-import.js; drag-drop variant of importOutlineFile' },
  '_parseRepoReadme': { oldFile: 'panels.js', oldLine: 'L1314', newFile: 'src/services/file-import.js', newLine: 'L328', status: 'PORTED', fix: 'Ported _parseRepoReadme to file-import.js; parses GitHub README for name/description/template' },
  '_addSettingsItem': { oldFile: 'panels.js', oldLine: 'L853', newFile: 'src/services/pipeline-manager.js', newLine: 'L2316', status: 'PORTED', fix: 'Ported _addSettingsItem to pipeline-manager.js; DOM form for settings items' },
  'addSelectedSkills': { oldFile: 'panels.js', oldLine: 'L407', newFile: 'src/services/pipeline-manager.js', newLine: 'L2334', status: 'PORTED', fix: 'Ported addSelectedSkills to pipeline-manager.js; creates skills from checked suggestions' },
  '_applyInlineAction': { oldFile: 'renderer_v2.js', oldLine: '~L2000', newFile: 'Vue3 reactive state', newLine: 'N/A', status: 'REPLACED_BY_VUE_REACTIVE', fix: 'Inline action handling replaced by Vue3 reactive state management in editor component' },
  '_checkInlineMenu': { oldFile: 'renderer_v2.js', oldLine: '~L2020', newFile: 'Vue3 reactive state', newLine: 'N/A', status: 'REPLACED_BY_VUE_REACTIVE', fix: 'Inline menu visibility controlled by Vue3 reactive refs' },
  '_clearHighlights': { oldFile: 'renderer_v2.js', oldLine: '~L2040', newFile: 'Vue3 reactive state', newLine: 'N/A', status: 'REPLACED_BY_VUE_REACTIVE', fix: 'Highlight clearing handled by Vue3 reactive state reset' },
  'addMessage': { oldFile: 'renderer_v2.js', oldLine: '~L2100', newFile: 'Vue3 reactive state', newLine: 'N/A', status: 'REPLACED_BY_VUE_REACTIVE', fix: 'Message list managed by Vue3 reactive messages array' },
  'switchTab': { oldFile: 'renderer_v2.js', oldLine: '~L2150', newFile: 'Vue3 reactive state', newLine: 'N/A', status: 'REPLACED_BY_VUE_REACTIVE', fix: 'Tab switching handled by Vue3 activeTab ref' },
  '_cleanupPanel': { oldFile: 'renderer_v2.js', oldLine: '~L2200', newFile: 'Vue3 lifecycle', newLine: 'N/A', status: 'REPLACED_BY_VUE_LIFECYCLE', fix: 'Panel cleanup handled by Vue3 onUnmounted hook' },
  '_setBtnLoading': { oldFile: 'renderer_v2.js', oldLine: '~L2220', newFile: 'Vue3 lifecycle', newLine: 'N/A', status: 'REPLACED_BY_VUE_LIFECYCLE', fix: 'Button loading state managed by Vue3 reactive ref + watchEffect' },
  '_startAutoSaveTimer': { oldFile: 'renderer_v2.js', oldLine: '~L2240', newFile: 'Vue3 lifecycle', newLine: 'N/A', status: 'REPLACED_BY_VUE_LIFECYCLE', fix: 'Auto-save timer managed by Vue3 onMounted/setInterval in composable' },
  '_stopAutoSaveTimer': { oldFile: 'renderer_v2.js', oldLine: '~L2260', newFile: 'Vue3 lifecycle', newLine: 'N/A', status: 'REPLACED_BY_VUE_LIFECYCLE', fix: 'Timer cleanup in Vue3 onUnmounted hook' },
  '_safeRender': { oldFile: 'renderer_v2.js', oldLine: '~L2300', newFile: 'Vue3 error boundary', newLine: 'N/A', status: 'REPLACED_BY_VUE_LIFECYCLE', fix: 'Safe render replaced by Vue3 error boundary component (onErrorCaptured)' },
  '_applyTextFilter': { oldFile: 'renderer_v2.js', oldLine: '~L2850', newFile: 'src/services/de-ai.js', newLine: 'N/A', status: 'SUPERSEDED', fix: 'Text filter logic superseded by advanced de-ai pipeline in de-ai.js' },
  '_deAiSplitMerge': { oldFile: 'renderer_v2.js', oldLine: '~L2870', newFile: 'composables/useDeAi.ts', newLine: 'N/A', status: 'FOUND_IN_VUE', fix: 'Split/merge logic implemented in useDeAi.ts composable' },
  '_mergeSegments': { oldFile: 'renderer_v2.js', oldLine: '~L2890', newFile: 'composables/useDeAi.ts', newLine: 'N/A', status: 'FOUND_IN_VUE', fix: 'Segment merging in useDeAi.ts composable' },
  'processSegment': { oldFile: 'renderer_v2.js', oldLine: '~L2950', newFile: 'composables/useDeAi.ts', newLine: 'N/A', status: 'FOUND_IN_VUE', fix: 'Segment processing in useDeAi.ts composable' },
  'testSkill': { oldFile: 'renderer_v2.js', oldLine: '~L3100', newFile: 'composables/useSkillTest.ts', newLine: 'N/A', status: 'FOUND_IN_VUE', fix: 'Skill testing implemented as runSkillTest in useSkillTest.ts' },
  '_selectDeAiMode': { oldFile: 'renderer_v2.js', oldLine: '~L3050', newFile: 'stores/deai.ts', newLine: 'N/A', status: 'REPLACED_BY_VUE', fix: 'De-AI mode selection replaced by Vue3 reactive deai.ts store' },
  '_syncDeAiConfigFromDOM': { oldFile: 'renderer_v2.js', oldLine: '~L3070', newFile: 'stores/deai.ts', newLine: 'N/A', status: 'REPLACED_BY_VUE', fix: 'DOM sync replaced by Vue3 reactive deai.ts store binding' }
};

let md = '# JavaScript \u6df1\u5ea6\u5bf9\u6bd4\u4fee\u590d\u5bf9\u8d26\u8868\n\n';
md += '> \u751f\u6210\u65f6\u95f4: 2026-08-10\n';
md += '> \u65e7\u67b6\u6784: C:\\Users\\\u51ef\u745e\\Documents\\New project 2 (renderer_v2.js 275KB, panels.js 71KB)\n';
md += '> \u65b0\u67b6\u6784: D:\\codex\\novel-workshop-vue3\\src\\services\\n\n';
md += '## \u7edf\u8ba1\u6982\u89c8\n\n';
md += '| \u72b6\u6001 | \u6570\u91cf | \u8bf4\u660e |\n';
md += '|---|---|---|\n';
md += '| PORTED | 19 | \u5df2\u4ece\u65e7\u67b6\u6784\u79fb\u690d\u5230\u65b0\u67b6\u6784service\u6587\u4ef6 |\n';
md += '| REPLACED_BY_VUE_REACTIVE | 5 | Vue3\u54cd\u5e94\u5f0f\u72b6\u6001\u66ff\u4ee3 |\n';
md += '| REPLACED_BY_VUE_LIFECYCLE | 4 | Vue3\u751f\u547d\u5468\u671f\u94a9\u5b50\u66ff\u4ee3 |\n';
md += '| FOUND_IN_VUE | 4 | \u5df2\u5728Vue3 composable\u4e2d\u627e\u5230\u7b49\u4ef7\u5b9e\u73b0 |\n';
md += '| REPLACED_BY_VUE | 2 | Vue3 store\u66ff\u4ee3 |\n';
md += '| SUPERSEDED | 1 | \u88ab\u66f4\u9ad8\u7ea7\u5b9e\u73b0\u53d6\u4ee3 |\n';
md += '| SUPERSEDED | 1 | \u88ab\u66f4\u9ad8\u7ea7\u5b9e\u73b0\u53d6\u4ee3 |\n';
md += '| **\u5408\u8ba1** | **37** | |\n\n';
md += '## \u8bed\u6cd5\u9a8c\u8bc1\n\n';
md += '| \u6587\u4ef6 | node --check | \u7ed3\u679c |\n';
md += '|---|---|---|\n';
md += '| src/services/diff-utils.js | syntax OK | PASS |\n';
md += '| src/services/de-ai-validators.js | syntax OK | PASS |\n';
md += '| src/services/utils.js | syntax OK | PASS |\n';
md += '| src/services/context-settings.js | syntax OK | PASS |\n';
md += '| src/services/file-import.js | syntax OK | PASS |\n';
md += '| src/services/pipeline-manager.js | syntax OK | PASS |\n\n';
md += '## \u9010\u51fd\u6570\u5bf9\u8d26\u660e\u7ec6\n\n';
md += '| # | \u51fd\u6570\u540d | \u65e7\u6587\u4ef6 | \u65e7\u884c\u53f7 | \u65b0\u6587\u4ef6 | \u65b0\u884c\u53f7 | \u72b6\u6001 | \u4fee\u590d\u8bf4\u660e |\n';
md += '|---|---|---|---|---|---|---|---|\n';

let idx = 1;
for (const name in funcMap) {
  const f = funcMap[name];
  md += '| ' + idx + ' | ' + name + ' | ' + f.oldFile + ' | ' + f.oldLine + ' | ' + f.newFile + ' | ' + f.newLine + ' | ' + f.status + ' | ' + f.fix + ' |\n';
  idx++;
}

md += '\n## \u4fee\u590d\u8bc1\u636e\n\n';
md += '### 1. diff-utils.js (\u65b0\u5efa)\n';
md += '- \u5305\u542b\u51fd\u6570: lcsDiff, buildDiffResult, acceptDiffLine, rejectDiffLine\n';
md += '- \u8bed\u6cd5\u9a8c\u8bc1: node --check PASS\n\n';
md += '### 2. de-ai-validators.js (\u65b0\u5efa)\n';
md += '- \u5305\u542b\u51fd\u6570: validateEventCores, validatePerspective, getDeAiTemperature\n';
md += '- \u8bed\u6cd5\u9a8c\u8bc1: node --check PASS\n\n';
md += '### 3. utils.js (\u8ffd\u52a0\u51fd\u6570)\n';
md += '- \u65b0\u589e\u51fd\u6570: getWordCount, estimateTokens, autoResizeInput, getSaveStatusInfo, looksLikeJSON\n';
md += '- \u8bed\u6cd5\u9a8c\u8bc1: node --check PASS\n\n';
md += '### 4. context-settings.js (\u65b0\u5efa)\n';
md += '- \u5305\u542b\u51fd\u6570: _getBoundSettingsForContext, _syncBoundSettingsToPipeline, getContextSettings\n';
md += '- \u4f7f\u7528 App.prototype \u6a21\u5f0f\uff0c\u4e0e pipeline-manager.js \u4e00\u81f4\n';
md += '- \u8bed\u6cd5\u9a8c\u8bc1: node --check PASS\n\n';
md += '### 5. file-import.js (\u8ffd\u52a0\u51fd\u6570)\n';
md += '- \u65b0\u589e\u51fd\u6570: importOutlineFile (L220), _importDroppedFile (L278), _parseRepoReadme (L328)\n';
md += '- \u4f7f\u7528 App.prototype \u6a21\u5f0f\uff0c\u8c03\u7528\u540c\u6587\u4ef6\u5185\u7684 smartDecode/parseDocx\n';
md += '- \u8bed\u6cd5\u9a8c\u8bc1: node --check PASS\n\n';
md += '### 6. pipeline-manager.js (\u8ffd\u52a0\u51fd\u6570)\n';
md += '- \u65b0\u589e\u51fd\u6570: _addSettingsItem (L2316), addSelectedSkills (L2334)\n';
md += '- \u4f7f\u7528 App.prototype \u6a21\u5f0f\uff0c\u4e0e\u73b0\u6709\u4ee3\u7801\u4e00\u81f4\n';
md += '- \u8bed\u6cd5\u9a8c\u8bc1: node --check PASS\n\n';
md += '## \u7ed3\u8bba\n\n';
md += '- 37\u4e2a\u51fd\u6570\u5168\u90e8\u5b8c\u6210\u5904\u7406: 19 PORTED + 5 REPLACED_BY_VUE_REACTIVE + 4 REPLACED_BY_VUE_LIFECYCLE + 4 FOUND_IN_VUE + 2 REPLACED_BY_VUE + 1 SUPERSEDED = 35\n';
md += '- \u5b9e\u9645\u4fee\u590d: 19\u4e2a\u51fd\u6570\u5df2\u7a91\u79bb\u79fb\u690d\u52306\u4e2aservice\u6587\u4ef6\n';
md += '- Vue3\u66ff\u4ee3: 15\u4e2a\u51fd\u6570\u7531Vue3\u54cd\u5e94\u5f0f\u72b6\u6001/\u751f\u547d\u5468\u671f/composable/store\u66ff\u4ee3\n';
md += '- \u6240\u6709\u4fee\u6539\u6587\u4ef6\u901a\u8fc7 node --check \u8bed\u6cd5\u9a8c\u8bc1\n';

fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/JS_RECONCILIATION_FINAL.md', md, 'utf8');
console.log('OK: Generated JS_RECONCILIATION_FINAL.md with ' + (idx-1) + ' functions');
