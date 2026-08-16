const fs = require('fs');

// === 1. Fix global.css: remove dangling selectors + duplicate media blocks ===
const cssFile = 'src/styles/global.css';
const css = fs.readFileSync(cssFile, 'utf8');
const cssLines = css.split('\n');

// Remove lines 7244-7248 (dangling selector 1), 7262-7296 (dangling 2+3 + duplicate media 2+3)
// Keep media block 1 (lines 7249-7261)
// 0-indexed: remove 7243-7247 and 7261-7295
const newCssLines = [];
for (let i = 0; i < cssLines.length; i++) {
  const lineNum = i + 1;
  // Skip dangling selector 1 (7244-7248)
  if (lineNum >= 7244 && lineNum <= 7248) continue;
  // Skip dangling selector 2 + duplicate media 2 (7262-7278)
  if (lineNum >= 7262 && lineNum <= 7278) continue;
  // Skip dangling selector 3 + duplicate media 3 (7279-7296)
  if (lineNum >= 7279 && lineNum <= 7296) continue;
  newCssLines.push(cssLines[i]);
}
fs.writeFileSync(cssFile, newCssLines.join('\n'), 'utf8');
console.log('[OK] global.css: removed 3 dangling selectors + 2 duplicate media blocks');

// === 2. Fix ScPanel.vue: backtick template literal ends with ' instead of ` ===
const scFile = 'src/components/settings-collection/ScPanel.vue';
const sc = fs.readFileSync(scFile, 'utf8');
const scLines = sc.split('\n');
let scFixed = 0;
for (let i = 0; i < scLines.length; i++) {
  // Line 187 (0-indexed 186): ends with ' instead of `
  if (scLines[i].includes("projectStore.outlineText || '无'") && scLines[i].trimEnd().endsWith("'")) {
    scLines[i] = scLines[i].replace(/'$/, '`');
    scFixed++;
    console.log('[OK] ScPanel.vue line ' + (i+1) + ': fixed backtick termination');
  }
}
fs.writeFileSync(scFile, scLines.join('\n'), 'utf8');
if (scFixed === 0) console.log('[WARN] ScPanel.vue: no backtick fix applied - checking pattern');

// === 3. Read MemoryPanel.vue to find invalid end tag ===
const memFile = 'src/components/common/MemoryPanel.vue';
const mem = fs.readFileSync(memFile, 'utf8');
const memLines = mem.split('\n');
console.log('\nMemoryPanel.vue template section:');
let inTemplate = false;
for (let i = 0; i < memLines.length; i++) {
  if (memLines[i].includes('<template>')) inTemplate = true;
  if (inTemplate) {
    console.log((i+1) + '|' + memLines[i]);
  }
  if (memLines[i].includes('</template>')) break;
}

// Check brace balance for script section
console.log('\nMemoryPanel.vue script section brace check:');
let inScript = false;
let braceDepth = 0;
for (let i = 0; i < memLines.length; i++) {
  if (memLines[i].includes('<script')) inScript = true;
  if (inScript) {
    const opens = (memLines[i].match(/{/g) || []).length;
    const closes = (memLines[i].match(/}/g) || []).length;
    braceDepth += opens - closes;
    if (opens > 0 || closes > 0) {
      console.log((i+1) + '| d=' + braceDepth + ' o=' + opens + ' c=' + closes + '|' + memLines[i].substring(0, 80));
    }
  }
  if (memLines[i].includes('</script>')) break;
}
