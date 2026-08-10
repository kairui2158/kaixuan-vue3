const fs = require('fs');
const path = require('path');

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch(e) { return null; }
}

const base = 'D:/codex/novel-workshop-vue3/src';
const ct = read(path.join(base, 'components/sidebar/ChapterTree.vue'));

if (ct) {
  // Find the template section
  const tplStart = ct.indexOf('<template>');
  const tplEnd = ct.lastIndexOf('</template>');
  if (tplStart >= 0 && tplEnd >= 0) {
    const tpl = ct.substring(tplStart, tplEnd + 11);
    console.log('Template length:', tpl.length);
    
    // Print the last 2000 chars of template (where modals would be)
    console.log('\n=== Last 2500 chars of template ===');
    const start = Math.max(0, tpl.length - 2500);
    console.log(tpl.substring(start));
  }
  
  // Search for modal-related keywords in template
  console.log('\n=== Modal keywords in ChapterTree ===');
  const tpl2 = ct.substring(tplStart, tplEnd);
  console.log('Has "modal":', tpl2.includes('modal'));
  console.log('Has "showProjectModal":', tpl2.includes('showProjectModal'));
  console.log('Has "showVolModal":', tpl2.includes('showVolModal'));
  console.log('Has "newProjectName":', tpl2.includes('newProjectName'));
  console.log('Has "volFormName":', tpl2.includes('volFormName'));
  console.log('Has "project-modal":', tpl2.includes('project-modal'));
  console.log('Has "volume-modal":', tpl2.includes('volume-modal'));
  console.log('Has "new-project":', tpl2.includes('new-project'));
  console.log('Has "v-if=\"showProjectModal\"":', tpl2.includes('v-if="showProjectModal"'));
  console.log('Has "v-if=\"showVolModal\"":', tpl2.includes('v-if="showVolModal"'));
  
  // Print all v-if directives
  const vifs = tpl2.match(/v-if="[^"]+"/g) || [];
  console.log('\nAll v-if directives:', vifs);
  
  // Search for modal-like divs
  const modals = tpl2.match(/<div[^>]*modal[^>]*>/gi) || [];
  console.log('\nModal divs:', modals);
  
  // Print lines containing 'modal'
  const lines = tpl2.split('\n');
  const modalLines = lines.filter(l => l.toLowerCase().includes('modal') || l.toLowerCase().includes('project') || l.toLowerCase().includes('volume'));
  console.log('\nLines with modal/project/volume:');
  modalLines.forEach(l => console.log('  ', l.trim()));
}

// Also check App.vue for modal references
const app = read(path.join(base, 'App.vue'));
if (app) {
  console.log('\n=== App.vue modal references ===');
  console.log('Has project-modal:', app.includes('project-modal'));
  console.log('Has volume-modal:', app.includes('volume-modal'));
  console.log('Has ProjectModal:', app.includes('ProjectModal'));
  console.log('Has VolumeModal:', app.includes('VolumeModal'));
  console.log('Has ChapterTree:', app.includes('ChapterTree'));
  // Print all component imports
  const imports = app.match(/import[\s\S]{0,100}from/g) || [];
  console.log('\nImports:', imports);
}
