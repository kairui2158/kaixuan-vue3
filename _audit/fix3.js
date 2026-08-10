const fs = require('fs');

// Fix OutlineWorkspace.vue line 42
const f1 = 'src/components/common/OutlineWorkspace.vue';
let c1 = fs.readFileSync(f1, 'utf8');
const old1 = '<button id="btn-ai-co-create" class="btn-secondary full-width" @click="generateOutlineSkills">id="btn-generate-outline-skills" class="btn-secondary full-width">\u81ea\u52a8\u751f\u6210\u5927\u7eb2 Skill</button>';
const new1 = '<button id="btn-generate-outline-skills" class="btn-secondary full-width" @click="generateOutlineSkills">\u81ea\u52a8\u751f\u6210\u5927\u7eb2 Skill</button>';
if (c1.includes(old1)) {
  c1 = c1.replace(old1, new1);
  fs.writeFileSync(f1, c1, 'utf8');
  console.log('[OK] Fixed OutlineWorkspace.vue');
} else {
  console.log('[WARN] Pattern not found in OutlineWorkspace.vue, trying alt');
  // Try without the Chinese text
  const idx = c1.indexOf('id="btn-generate-outline-skills"');
  if (idx > -1) {
    // Find the line
    const lines = c1.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('btn-generate-outline-skills') && lines[i].includes('btn-ai-co-create')) {
        lines[i] = '            <button id="btn-generate-outline-skills" class="btn-secondary full-width" @click="generateOutlineSkills">\u81ea\u52a8\u751f\u6210\u5927\u7eb2 Skill</button>';
        console.log('[OK] Fixed line ' + (i+1) + ' in OutlineWorkspace.vue');
        break;
      }
    }
    fs.writeFileSync(f1, lines.join('\n'), 'utf8');
  }
}

// Fix AppearanceSettings.vue line 33
const f2 = 'src/components/settings/AppearanceSettings.vue';
let c2 = fs.readFileSync(f2, 'utf8');
const lines2 = c2.split('\n');
for (let i = 0; i < lines2.length; i++) {
  if (lines2[i].includes('id="cfg-theme"') && lines2[i].includes('<label>')) {
    lines2[i] = '        <select id="cfg-theme" class="full-width"><option value="dark">\u6df1\u8272\u6a21\u5f0f</option></select>';
    console.log('[OK] Fixed line ' + (i+1) + ' in AppearanceSettings.vue');
    break;
  }
}
fs.writeFileSync(f2, lines2.join('\n'), 'utf8');
