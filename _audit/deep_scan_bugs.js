const fs = require('fs');
const path = require('path');

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch(e) { return null; }
}

const base = 'D:/codex/novel-workshop-vue3/src';
const oldBase = 'C:/Users/凯瑞/Documents/New project 2';
const oldHtml = read(path.join(oldBase, 'renderer.html'));

// BUG-9: EditorPanel toolbar
console.log('=== BUG-9: EditorPanel toolbar ===');
const ep = read(path.join(base, 'components/editor/EditorPanel.vue'));
if (ep) {
  // Extract the toolbar section
  const tbStart = ep.indexOf('editor-toolbar') || ep.indexOf('editor-header');
  if (tbStart >= 0) {
    const section = ep.substring(tbStart, tbStart + 800);
    console.log('Toolbar section (first 800 chars):');
    console.log(section);
  }
  console.log('Has SVG undo:', ep.includes('btn-undo') && ep.substring(ep.indexOf('btn-undo'), ep.indexOf('btn-undo')+200).includes('<svg'));
  console.log('Has SVG redo:', ep.includes('btn-redo') && ep.substring(ep.indexOf('btn-redo'), ep.indexOf('btn-redo')+200).includes('<svg'));
  console.log('Has arrow undo:', ep.match(/btn-undo[\s\S]{0,100}←/));
  console.log('Has arrow redo:', ep.match(/btn-redo[\s\S]{0,100}→/));
}

// Old arch editor toolbar
if (oldHtml) {
  console.log('\n=== Old arch editor toolbar ===');
  const oldTb = oldHtml.indexOf('btn-undo');
  if (oldTb >= 0) {
    console.log('Old undo context:', oldHtml.substring(oldTb, oldTb + 200));
  }
}

// BUG-11/12: ChapterTree project/volume modals
console.log('\n=== BUG-11/12: ChapterTree modals ===');
const ct = read(path.join(base, 'components/sidebar/ChapterTree.vue'));
if (ct) {
  console.log('Size:', ct.length);
  console.log('Has project-modal:', ct.includes('project-modal'));
  console.log('Has volume-modal:', ct.includes('volume-modal'));
  console.log('Has new-project:', ct.includes('new-project'));
  console.log('Has btn-open-project:', ct.includes('btn-open-project') || ct.includes('openProject') || ct.includes('handleProject'));
  console.log('Has btn-tree-gen:', ct.includes('btn-tree-gen') || ct.includes('generate') || ct.includes('pipeline'));
  // Extract template section to find modal structures
  const tplStart = ct.indexOf('<template>');
  const tplEnd = ct.indexOf('</template>');
  if (tplStart >= 0 && tplEnd >= 0) {
    const tpl = ct.substring(tplStart, tplEnd);
    // Count modal-related elements
    const modals = tpl.match(/modal/gi) || [];
    console.log('Modal references in template:', modals.length);
    // Find project/volume related sections
    const projIdx = tpl.indexOf('project');
    const volIdx = tpl.indexOf('volume');
    if (projIdx >= 0) console.log('Project section found at:', projIdx);
    if (volIdx >= 0) console.log('Volume section found at:', volIdx);
  }
}

// Old arch: check project/volume modal HTML
if (oldHtml) {
  console.log('\n=== Old arch: project/volume modals ===');
  console.log('Has project-modal:', oldHtml.includes('id="project-modal"'));
  console.log('Has volume-modal:', oldHtml.includes('id="volume-modal"'));
  console.log('Has new-project-modal:', oldHtml.includes('id="new-project-modal"'));
  // Check what's in project-modal
  const pmStart = oldHtml.indexOf('id="project-modal"');
  if (pmStart >= 0) {
    const pmEnd = oldHtml.indexOf('</div>', oldHtml.indexOf('</div>', pmStart) + 10);
    console.log('Project modal content:', oldHtml.substring(pmStart, pmStart + 500));
  }
}

// BUG-16: InlineMenu actions
console.log('\n=== BUG-16: InlineMenu actions ===');
const im = read(path.join(base, 'components/common/InlineMenu.vue'));
if (im) {
  console.log('Full content:');
  console.log(im);
}

// Old arch: check inline menu / context menu actions
if (oldHtml) {
  console.log('\n=== Old arch: context menu / inline menu ===');
  // Search for context menu items
  const cmStart = oldHtml.indexOf('context-menu');
  if (cmStart >= 0) {
    console.log('Context menu found at:', cmStart);
    console.log('Context menu HTML:', oldHtml.substring(cmStart, cmStart + 500));
  }
  // Search for inline menu
  const imStart = oldHtml.indexOf('inline-menu');
  if (imStart >= 0) {
    console.log('Inline menu found at:', imStart);
  }
}
