const fs = require('fs');
const filePath = 'D:\\codex\\novel-workshop-vue3\\src\\components\\common\\OutlineWorkspace.vue';
let content = fs.readFileSync(filePath, 'utf8');
let modified = false;

// 1. Add ow-editor-header before textarea (title + export buttons + word count)
if (!content.includes('ow-editor-header')) {
  const oldEditorStart = '        <div class="ow-editor">\n          <textarea';
  const newEditorStart = '        <div class="ow-editor">\n          <div class="ow-editor-header">\n            <span>\u5927\u7eb2\u7f16\u8f91\u5668</span>\n            <div class="editor-toolbar">\n              <div class="editor-toolbar-group">\n                <button class="btn-sm btn-secondary ow-export-btn" @click="exportMd">.md</button>\n                <button class="btn-sm btn-secondary ow-export-btn" @click="exportTxt">.txt</button>\n              </div>\n            </div>\n            <span class="word-count">{{ (projectStore.outlineText || \"\").length }} \u5b57</span>\n          </div>\n          <textarea';
  if (content.includes(oldEditorStart)) {
    content = content.replace(oldEditorStart, newEditorStart);
    modified = true;
    console.log('[OK] Added ow-editor-header');
  } else {
    console.log('[WARN] Could not find ow-editor start point');
  }
}

// 2. Remove duplicate export buttons from ow-input-row
if (content.includes('        <button class="btn-sm btn-secondary ow-export-btn" @click="exportMd">MD</button>\n        <button class="btn-sm btn-secondary ow-export-btn" @click="exportTxt">TXT</button>')) {
  content = content.replace(
    '        <button class="btn-sm btn-secondary ow-export-btn" @click="exportMd">MD</button>\n        <button class="btn-sm btn-secondary ow-export-btn" @click="exportTxt">TXT</button>\n',
    ''
  );
  modified = true;
  console.log('[OK] Removed duplicate export buttons from input-row');
}

// 3. Add ow-sidebar with Skill section before ow-body closing
if (!content.includes('ow-sidebar')) {
  const sidebarHtml = '        <div class="ow-sidebar">\n          <div class="ow-section">\n            <h4>Skill \u529f\u80fd\u533a</h4>\n            <button class="btn-secondary full-width" @click="generateOutlineSkills">\u81ea\u52a8\u751f\u6210\u5927\u7eb2 Skill</button>\n            <div class="ow-skill-suggestions">\n              <div v-for="(s, i) in skillSuggestionsList" :key="i" class="ow-skill-item" @click="bindSkill(s)">\n                {{ s.name }}\n              </div>\n              <p v-if="skillSuggestionsList.length === 0" class="ow-empty-hint">\u70b9\u51fb\u4e0a\u65b9\u6309\u94ae\u751f\u6210\u5efa\u8bae</p>\n            </div>\n            <h5>\u5df2\u7ed1\u5b9a\u7684\u5927\u7eb2 Skill</h5>\n            <div class="ow-bound-list">\n              <div v-for="(id, i) in boundSkills" :key="i" class="ow-bound-item">\n                <span>{{ getSkillName(id) }}</span>\n                <button class="btn-sm" @click="unbindSkill(i)">x</button>\n              </div>\n              <p v-if="boundSkills.length === 0" class="ow-empty-hint">\u6682\u65e0\u7ed1\u5b9a\u7684 Skill</p>\n            </div>\n          </div>\n        </div>\n';
  // Insert before ow-body closing div and ow-footer opening
  const target = '      </div>\n      <div class="ow-footer">';
  if (content.includes(target)) {
    content = content.replace(target, '      </div>\n' + sidebarHtml + '      <div class="ow-footer">');
    modified = true;
    console.log('[OK] Added ow-sidebar with Skill section');
  } else {
    console.log('[WARN] Could not find ow-footer insertion point');
  }
}

// 4. Add ow-resize-handle after ow-footer
if (!content.includes('ow-resize-handle')) {
  const oldEnd = '      </div>\n    </div>\n  </div>\n</template>';
  const newEnd = '      </div>\n      <div class="ow-resize-handle"></div>\n    </div>\n  </div>\n</template>';
  if (content.includes(oldEnd)) {
    content = content.replace(oldEnd, newEnd);
    modified = true;
    console.log('[OK] Added ow-resize-handle');
  } else {
    console.log('[WARN] Could not find template end point');
  }
}

// 5. Add skill store import
if (!content.includes('useSkillStore')) {
  content = content.replace(
    "import { useProjectStore } from '../../stores/project'",
    "import { useProjectStore } from '../../stores/project'\nimport { useSkillStore } from '../../stores/skill'"
  );
  modified = true;
  console.log('[OK] Added skillStore import');
}

// 6. Add skill-related refs and functions after saveFeedback
if (!content.includes('skillSuggestionsList')) {
  const skillCode = [
    "const saveFeedback = ref('')",
    "const skillStore = useSkillStore()",
    "const skillSuggestionsList = ref<any[]>([])",
    "const boundSkills = ref<string[]>([])",
    "",
    "function generateOutlineSkills() {",
    "  const outlineSkills = skillStore.skills.filter(function(s: any) { return s.category === 'outline' || s.category === '\u5927\u7eb2' })",
    "  if (outlineSkills.length > 0) {",
    "    skillSuggestionsList.value = outlineSkills.map(function(s: any) { return { id: s.id, name: s.name } })",
    "  } else {",
    "    skillSuggestionsList.value = [{ name: '\u6682\u65e0\u5927\u7eb2\u7c7b Skill\uff0c\u8bf7\u5148\u5728\u8bbe\u7f6e\u4e2d\u521b\u5efa' }]",
    "  }",
    "}",
    "",
    "function bindSkill(skill: any) {",
    "  if (skill.id && !boundSkills.value.includes(skill.id)) {",
    "    boundSkills.value.push(skill.id)",
    "  }",
    "}",
    "",
    "function unbindSkill(index: number) {",
    "  boundSkills.value.splice(index, 1)",
    "}",
    "",
    "function getSkillName(id: string): string {",
    "  var s = skillStore.skills.find(function(sk: any) { return sk.id === id })",
    "  return s ? s.name : id",
    "}"
  ].join('\n');
  
  content = content.replace("const saveFeedback = ref('')", skillCode);
  modified = true;
  console.log('[OK] Added skill-related refs and functions');
}

// 7. Add CSS for new elements after .save-feedback
if (!content.includes('.ow-editor-header {')) {
  const newCss = [
    '.save-feedback { font-size: 12px; color: var(--success); padding: 0 8px; }',
    '.ow-editor-header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border-color); font-size: 13px; }',
    '.ow-editor-header .word-count { margin-left: auto; font-size: 12px; color: var(--text-secondary); }',
    '.ow-sidebar { width: 240px; border-left: 1px solid var(--border-color); padding: 12px; overflow-y: auto; flex-shrink: 0; }',
    '.ow-section { margin-bottom: 16px; }',
    '.ow-section h4 { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: var(--text-primary); }',
    '.ow-section h5 { font-size: 12px; font-weight: 600; margin: 12px 0 6px; color: var(--text-secondary); }',
    '.ow-skill-suggestions { margin-top: 8px; }',
    '.ow-skill-item { padding: 6px 10px; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 4px; cursor: pointer; font-size: 12px; }',
    '.ow-skill-item:hover { background: var(--bg-hover); }',
    '.ow-bound-list { margin-top: 4px; }',
    '.ow-bound-item { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 4px; margin-bottom: 4px; font-size: 12px; }',
    '.ow-empty-hint { font-size: 12px; color: var(--text-muted); padding: 4px 0; }',
    '.ow-resize-handle { height: 6px; cursor: ns-resize; background: var(--border-color); border-radius: 0 0 12px 12px; }',
    '.full-width { width: 100%; }'
  ].join('\n');
  
  content = content.replace('.save-feedback { font-size: 12px; color: var(--success); padding: 0 8px; }', newCss);
  modified = true;
  console.log('[OK] Added CSS for new elements');
}

if (modified) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('[OK] fix_outline.js executed successfully');
  console.log('File size:', content.length);
  console.log('Has ow-sidebar:', content.includes('ow-sidebar'));
  console.log('Has ow-resize-handle:', content.includes('ow-resize-handle'));
  console.log('Has ow-editor-header:', content.includes('ow-editor-header'));
  console.log('Has skillSuggestionsList:', content.includes('skillSuggestionsList'));
  console.log('Has useSkillStore:', content.includes('useSkillStore'));
} else {
  console.log('[WARN] No modifications were made');
}
