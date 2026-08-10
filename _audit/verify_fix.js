const fs = require('fs');
const path = 'D:/codex/novel-workshop-vue3/src/components/settings-collection/ScPanel.vue';
let c = fs.readFileSync(path, 'utf8');
const lines = c.split('\n');
let found = [];
lines.forEach((l, i) => {
  if (l.includes('aiGenerateEntry') || l.includes('useProviderStore') || l.includes('providerStore')) {
    found.push((i+1) + ': ' + l.trim());
  }
});
if (found.length > 0) {
  found.forEach(f => console.log(f));
} else {
  console.log('[ERR] Not found');
}
