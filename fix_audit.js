const fs = require('fs');
const results = [];
function fix(file, desc, find, replace) {
  try {
    let c = fs.readFileSync(file, 'utf8');
    if (c.indexOf(find) < 0) { results.push('SKIP ' + desc + ' (pattern not found)'); return; }
    c = c.replace(find, replace);
    fs.writeFileSync(file, c, 'utf8');
    results.push('OK   ' + desc);
  } catch(e) { results.push('FAIL ' + desc + ': ' + e.message); }
}
const base = 'D:/codex/novel-workshop-vue3/src/';

// FIX-27/33: PipelinePanel genChapters boundSettings key conflict - 'for (const volId of' shadows outer volId
fix(base+'components/pipeline/PipelinePanel.vue',
  'FIX-27/33: genChapters boundSettings volId shadow',
  'for (const volId of Object.keys(boundSettings)) {\n      const ids = boundSettings[volId] || []',
  'for (const bKey of Object.keys(boundSettings)) {\n      const ids = boundSettings[bKey] || []');
fix(base+'components/pipeline/PipelinePanel.vue',
  'FIX-27/33: genChapters boundSettings inner ref',
  'for (const sid of ids) {\n        const s = projectStore.settings.find((x) => x.id === sid || x.name === sid)\n        if (s) boundSettingsText += s.name + ',
  'for (const sid of ids) {\n        const s = projectStore.settings.find((x) => x.id === sid || x.name === sid)\n        if (s) boundSettingsText += s.name + ');

// FIX-28: PipelinePanel genBody - inject bound settings into body generation prompt
fix(base+'components/pipeline/PipelinePanel.vue',
  'FIX-28: genBody inject bound settings',
  "const settingsText = projectStore.settings.map(s => s.name + ' - ' + JSON.stringify(s.attrs)).join('\\n')\n    const volOutline = vol.outline || vol.summary || ''\n    const prompt = '[\u5168\u4e66\u5927\u7eb2]\\n",
  "const settingsText = projectStore.settings.map(s => s.name + ' - ' + JSON.stringify(s.attrs)).join('\\n')\n    const volOutline = vol.outline || vol.summary || ''\n    const boundSettings2 = projectStore.settingBindings || {}\n    let boundSettingsText2 = ''\n    for (const bKey2 of Object.keys(boundSettings2)) {\n      const ids2 = boundSettings2[bKey2] || []\n      for (const sid2 of ids2) {\n        const s2 = projectStore.settings.find(x => x.id === sid2 || x.name === sid2)\n        if (s2) boundSettingsText2 += s2.name + ' - ' + JSON.stringify(s2.attrs) + '\\n'\n      }\n    }\n    if (boundSettingsText2) boundSettingsText2 = '\\n\u3010\u7ed1\u5b9a\u8bbe\u5b9a\u3011\\n' + boundSettingsText2\n    const prompt = '[\u5168\u4e66\u5927\u7eb2]\\n");

// FIX-29: ChatPanel callApi - add 429 retry logic
fix(base+'components/chat/ChatPanel.vue',
  'FIX-29: ChatPanel 429 retry',
  '  const resp = await fetch(url, {\n    method: \'POST\',\n    headers: {\n      \'Content-Type\': \'application/json\',\n      \'Authorization\': \'Bearer \' + provider.apiKey\n    },\n    body\n  })\n  if (!resp.ok) throw new Error(\'API error: \' + resp.status)',
  '  let resp;\n  for (let attempt = 0; attempt < 8; attempt++) {\n    resp = await fetch(url, {\n      method: \'POST\',\n      headers: {\n        \'Content-Type\': \'application/json\',\n        \'Authorization\': \'Bearer \' + provider.apiKey\n      },\n      body\n    })\n    if (resp.ok) break;\n    if (resp.status === 429) {\n      const waitMs = [30000,60000,90000,120000,150000,180000,210000,240000][attempt];\n      await new Promise(r => setTimeout(r, waitMs));\n      continue;\n    }\n    throw new Error(\'API error: \' + resp.status);\n  }\n  if (!resp.ok) throw new Error(\'API 429 retry exhausted\');');

// FIX-30: ChatMessage - add more markdown rendering (headers, lists, links)
fix(base+'components/chat/ChatMessage.vue',
  'FIX-30: ChatMessage enhanced markdown',
  "  html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')\n  html = html.replace(/`(.+?)`/g, '<code>$1</code>')\n  html = html.replace(/\\n/g, '<br>')\n  return html",
  "  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>')\n  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>')\n  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>')\n  html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')\n  html = html.replace(/`(.+?)`/g, '<code>$1</code>')\n  html = html.replace(/\\[(.+?)\\]\\((.+?)\\)/g, '<a href=\\"$2\\" target=\\"_blank\\">$1</a>')\n  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')\n  html = html.replace(/(<li>.+<\\/li>)/s, '<ul>$1</ul>')\n  html = html.replace(/\\n/g, '<br>')\n  return html");

// FIX-35: ApiSettings - make purpose selection mutually exclusive
fix(base+'components/settings/ApiSettings.vue',
  'FIX-35: ApiSettings purpose mutually exclusive',
  'function setPurpose(id: string, purpose: string) {\n  if (purpose === \'generate\') {\n    providerStore.setGenerateProvider(id)\n  } else {\n    providerStore.setVerifyProvider(id)\n  }\n}',
  'function setPurpose(id: string, purpose: string) {\n  if (purpose === \'generate\') {\n    if (providerStore.verifyProvider === id) providerStore.setVerifyProvider(\'\')\n    providerStore.setGenerateProvider(id)\n  } else {\n    if (providerStore.generateProvider === id) providerStore.setGenerateProvider(\'\')\n    providerStore.setVerifyProvider(id)\n  }\n}');

// FIX-37: ChapterTree - add new project button to project list modal
fix(base+'components/sidebar/ChapterTree.vue',
  'FIX-37: ChapterTree add new project button in list',
  '<button class=\"pm-btn btn-secondary\" @click=\"showProjectList = false; showProjectModal = true\">+ \u65b0\u5efa\u9879\u76ee</button>',
  '<button class=\"pm-btn btn-secondary\" @click=\"showNewProjectForm()\">+ \u65b0\u5efa\u9879\u76ee</button>\n        <button class=\"pm-btn\" @click=\"showProjectList = false; showProjectModal = true\">\u624b\u52a8\u521b\u5efa</button>');

// FIX-38: AppearanceSettings - apply fontSize and editorFont to editor via CSS variable
fix(base+'components/editor/EditorPanel.vue',
  'FIX-38: EditorPanel apply fontSize/editorFont from settings',
  "font-family: var(--editor-font, serif);\n  font-size: clamp(13px, 1vw, 18px);",
  "font-family: var(--editor-font, serif);\n  font-size: var(--editor-font-size, 16px);");

// Print results
console.log('=== FIX RESULTS ===');
results.forEach(r => console.log(r));
console.log('=== DONE ===');
