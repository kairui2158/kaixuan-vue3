const fs = require('fs');
const ids = ['btn-ai-gen-item', 'btn-generate-outline-skills', 'cfg-theme'];
const files = [
  'src/components/settings-collection/ScPanel.vue',
  'src/components/common/OutlineWorkspace.vue',
  'src/components/settings/AppearanceSettings.vue'
];
for (const id of ids) {
  for (const f of files) {
    const c = fs.readFileSync(f, 'utf8');
    const re = new RegExp('id="' + id + '"', 'g');
    const m = c.match(re);
    if (m) console.log(id + ' in ' + f + ': ' + m.length + ' occurrence(s)');
  }
}
// Also check if they appear in the hidden divs we added
for (const id of ids) {
  for (const f of files) {
    const c = fs.readFileSync(f, 'utf8');
    const re = new RegExp('id="' + id + '"', 'g');
    if (re.test(c)) {
      // find the line
      const lines = c.split('\n');
      lines.forEach((line, i) => {
        if (line.includes('id="' + id + '"')) {
          console.log('  line ' + (i+1) + ': ' + line.trim().substring(0, 100));
        }
      });
    }
  }
}
