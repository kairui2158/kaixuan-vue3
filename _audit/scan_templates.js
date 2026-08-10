const fs = require('fs');
const base = 'D:/codex/novel-workshop-vue3/src/';
const files = [
  'App.vue',
  'components/dashboard/DashboardModal.vue',
  'components/settings/SettingsModal.vue',
  'components/settings/AppearanceSettings.vue',
  'components/settings/ApiSettings.vue',
  'components/settings-collection/ScPanel.vue',
  'components/editor/EditorPanel.vue',
  'components/chat/ChatPanel.vue',
  'components/common/OutlineWorkspace.vue',
  'components/settings/SkillSettings.vue',
  'components/settings/DeAiSettings.vue',
  'components/settings/DiagLogPanel.vue',
  'components/common/MemoryPanel.vue',
  'components/common/PluginMarket.vue'
];
files.forEach(f => {
  try {
    const c = fs.readFileSync(base + f, 'utf8');
    const m = c.match(/<template>([\s\S]*?)<\/template>/);
    if (!m) { console.log('=== ' + f + ' (no template) ==='); return; }
    const t = m[1];
    const lines = t.split('\n');
    console.log('=== ' + f + ' ===');
    lines.forEach((l, i) => {
      if (l.trim()) console.log((i + 1) + ': ' + l.trim().substring(0, 180));
    });
    console.log('');
  } catch(e) {
    console.log('=== ' + f + ' ERROR: ' + e.message + ' ===');
  }
});
