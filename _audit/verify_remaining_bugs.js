const fs = require('fs');
const path = require('path');

const base = 'D:/codex/novel-workshop-vue3/src';
const oldBase = 'C:/Users/凯瑞/Documents/New project 2';

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch(e) { return null; }
}

// BUG-9: EditorPanel toolbar - check if SVG vs arrow symbols
const ep = read(path.join(base, 'components/common/EditorPanel.vue'));
if (ep) {
  console.log('=== BUG-9: EditorPanel.vue ===');
  console.log('Size:', ep.length);
  console.log('Has btn-undo:', ep.includes('btn-undo'));
  console.log('Has btn-redo:', ep.includes('btn-redo'));
  const undoMatch = ep.match(/btn-undo[\s\S]{0,300}/);
  if (undoMatch) console.log('Undo button context:', undoMatch[0].substring(0, 200));
  console.log('Has SVG:', ep.includes('<svg'));
  console.log('Has arrow symbols:', ep.includes('←') || ep.includes('→'));
} else {
  console.log('=== BUG-9: EditorPanel.vue NOT FOUND ===');
}

// BUG-13: ExitConfirmModal ref
const app = read(path.join(base, 'App.vue'));
if (app) {
  console.log('\n=== BUG-13: ExitConfirmModal ref ===');
  console.log('Has ref=exitModal:', app.includes('ref="exitModal"'));
  console.log('Has ExitConfirmModal component:', app.includes('ExitConfirmModal'));
  const ecmMatch = app.match(/ExitConfirmModal[\s\S]{0,200}/);
  if (ecmMatch) console.log('ExitConfirmModal context:', ecmMatch[0].substring(0, 150));
}

// BUG-11/12: Project/Volume modals
const ct = read(path.join(base, 'components/common/ChapterTree.vue'));
if (ct) {
  console.log('\n=== BUG-11/12: Project/Volume modals ===');
  console.log('ChapterTree.vue size:', ct.length);
  console.log('Has project-modal:', ct.includes('project-modal') || ct.includes('ProjectModal'));
  console.log('Has volume-modal:', ct.includes('volume-modal') || ct.includes('VolumeModal'));
  console.log('Has new-project:', ct.includes('new-project') || ct.includes('NewProject'));
} else {
  console.log('\n=== BUG-11/12: ChapterTree.vue NOT FOUND ===');
}

// BUG-16: InlineMenu actions count
const im = read(path.join(base, 'components/common/InlineMenu.vue'));
if (im) {
  console.log('\n=== BUG-16: InlineMenu actions ===');
  console.log('Size:', im.length);
  const actions = im.match(/action:/g) || [];
  console.log('Action count:', actions.length);
}

// List all .vue files in components/common/
console.log('\n=== All components/common/*.vue ===');
const dir = path.join(base, 'components/common');
if (fs.existsSync(dir)) {
  fs.readdirSync(dir).filter(f => f.endsWith('.vue')).forEach(f => {
    const fp = path.join(dir, f);
    const sz = fs.statSync(fp).size;
    console.log(f, '-', sz, 'bytes');
  });
}

// List all .vue files in components/ (non-recursive)
console.log('\n=== All components/*.vue (top-level) ===');
const dir2 = path.join(base, 'components');
if (fs.existsSync(dir2)) {
  fs.readdirSync(dir2).filter(f => f.endsWith('.vue')).forEach(f => {
    const fp = path.join(dir2, f);
    const sz = fs.statSync(fp).size;
    console.log(f, '-', sz, 'bytes');
  });
}

// List all .vue files recursively
console.log('\n=== All .vue files (recursive) ===');
function walkDir(d, prefix) {
  if (!fs.existsSync(d)) return;
  fs.readdirSync(d).forEach(f => {
    const fp = path.join(d, f);
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) {
      walkDir(fp, prefix + f + '/');
    } else if (f.endsWith('.vue')) {
      console.log(prefix + f, '-', stat.size, 'bytes');
    }
  });
}
walkDir(base, '');

// Old architecture: check outline-workspace HTML structure
const oldHtml = read(path.join(oldBase, 'renderer.html'));
if (oldHtml) {
  console.log('\n=== Old arch: outline-workspace sections ===');
  const owStart = oldHtml.indexOf('id="outline-workspace"');
  if (owStart >= 0) {
    const owSection = oldHtml.substring(owStart, owStart + 2000);
    console.log('Has ow-sidebar:', owSection.includes('ow-sidebar'));
    console.log('Has ow-section (import):', owSection.includes('btn-import-outline'));
    console.log('Has ow-section (AI):', owSection.includes('btn-ai-co-create'));
    console.log('Has ow-section (Skill):', owSection.includes('btn-generate-outline-skills'));
    console.log('Has ow-resize-handle:', owSection.includes('ow-resize-handle'));
    console.log('Has ow-editor-header:', owSection.includes('ow-editor-header'));
    console.log('Has ow-word-count:', owSection.includes('ow-word-count'));
  }
}
