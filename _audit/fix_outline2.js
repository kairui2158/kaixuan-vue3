const fs = require('fs');
const filePath = 'D:\\codex\\novel-workshop-vue3\\src\\components\\common\\OutlineWorkspace.vue';
let content = fs.readFileSync(filePath, 'utf8');

// The template now references skillSuggestionsList/boundSkills/generateOutlineSkills/bindSkill/unbindSkill/getSkillName
// but the script section is missing them. Add them after saveFeedback.
if (!content.includes('const skillStore = useSkillStore()')) {
  const skillCode = `const skillStore = useSkillStore()
const skillSuggestionsList = ref<any[]>([])
const boundSkills = ref<string[]>([])

function generateOutlineSkills() {
  const outlineSkills = skillStore.skills.filter(function(s: any) { return s.category === 'outline' || s.category === '\u5927\u7eb2' })
  if (outlineSkills.length > 0) {
    skillSuggestionsList.value = outlineSkills.map(function(s: any) { return { id: s.id, name: s.name } })
  } else {
    skillSuggestionsList.value = [{ name: '\u6682\u65e0\u5927\u7eb2\u7c7b Skill\uff0c\u8bf7\u5148\u5728\u8bbe\u7f6e\u4e2d\u521b\u5efa' }]
  }
}

function bindSkill(skill: any) {
  if (skill.id && !boundSkills.value.includes(skill.id)) {
    boundSkills.value.push(skill.id)
  }
}

function unbindSkill(index: number) {
  boundSkills.value.splice(index, 1)
}

function getSkillName(id: string): string {
  var s = skillStore.skills.find(function(sk: any) { return sk.id === id })
  return s ? s.name : id
}`;

  // Insert after saveFeedback declaration line
  const marker = "const saveFeedback = ref('')";
  if (content.includes(marker)) {
    content = content.replace(marker, marker + '\n' + skillCode);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('[OK] Added skill-related refs and functions to script section');
    console.log('File size:', content.length);
    console.log('Has skillStore:', content.includes('const skillStore = useSkillStore()'));
    console.log('Has generateOutlineSkills:', content.includes('function generateOutlineSkills'));
    console.log('Has bindSkill:', content.includes('function bindSkill'));
    console.log('Has unbindSkill:', content.includes('function unbindSkill'));
    console.log('Has getSkillName:', content.includes('function getSkillName'));
  } else {
    console.log('[ERR] Could not find saveFeedback marker');
  }
} else {
  console.log('[OK] skillStore already exists, skipping');
}
