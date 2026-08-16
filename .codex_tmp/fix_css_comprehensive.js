const fs = require('fs');
const file = 'src/styles/global.css';
let content = fs.readFileSync(file, 'utf8');
let lines = content.split('\n');

// Show lines 1510-1600 for analysis
console.log('=== Lines 1510-1600 ===');
for (let i = 1509; i < Math.min(1600, lines.length); i++) {
  console.log((i+1) + '|' + lines[i]);
}

// The pattern: many @media blocks are single-line like:
// @media (max-width: 799px) { :root { --font-size: var(--font-size-sm); }
// They have 2 opening braces ({) but only 1 closing brace (})
// So we need to add a } at the end of those lines

// Strategy: scan every line, count { and } (outside comments/strings)
// If a line has more { than }, and the line starts with @media or contains @media,
// we need to check if it's a single-line @media that's missing a closing }

let fixes = 0;
const newLines = [];

for (let i = 0; i < lines.length; i++) {
  let line = lines[i];
  
  // Skip comment lines
  const trimmed = line.trim();
  if (trimmed.startsWith('/*') || trimmed.startsWith('*')) {
    newLines.push(line);
    continue;
  }
  
  // Count braces outside strings
  let opens = 0, closes = 0;
  let inStr = false, strCh = '';
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strCh = ch; continue; }
    if (inStr && ch === strCh && line[j-1] !== '\\') { inStr = false; continue; }
    if (inStr) continue;
    if (ch === '{') opens++;
    if (ch === '}') closes++;
  }
  
  // If line has @media and unbalanced braces (more opens than closes)
  if (line.includes('@media') && opens > closes) {
    const diff = opens - closes;
    // Add missing closing braces at end of line
    line = line.replace(/\s*$/, '') + ' '.repeat(0) + '}'.repeat(diff);
    fixes += diff;
    console.log('Fixed line ' + (i+1) + ': added ' + diff + ' closing brace(s)');
    console.log('  Before: ' + lines[i].substring(0, 100));
    console.log('  After:  ' + line.substring(0, 100));
  }
  
  // Also fix lines with @keyframes that have unbalanced braces
  if (line.includes('@keyframes') && opens > closes) {
    const diff = opens - closes;
    line = line.replace(/\s*$/, '') + '}'.repeat(diff);
    fixes += diff;
    console.log('Fixed keyframes line ' + (i+1) + ': added ' + diff + ' closing brace(s)');
  }
  
  newLines.push(line);
}

console.log('\nTotal fixes: ' + fixes + ' closing braces added');

// Write fixed file
fs.writeFileSync(file, newLines.join('\n'), 'utf8');
console.log('File written.');

// Now re-check brace balance
content = fs.readFileSync(file, 'utf8');
lines = content.split('\n');
let depth = 0;
let inComment = false;
let inString = false;
let stringChar = '';
const stack = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let j = 0;
  while (j < line.length) {
    const ch = line[j];
    const next = line[j+1] || '';
    if (!inString && !inComment && ch === '/' && next === '*') { inComment = true; j += 2; continue; }
    if (inComment && ch === '*' && next === '/') { inComment = false; j += 2; continue; }
    if (inComment) { j++; continue; }
    if (!inString && (ch === '"' || ch === "'")) { inString = true; stringChar = ch; j++; continue; }
    if (inString && ch === stringChar && line[j-1] !== '\\') { inString = false; j++; continue; }
    if (inString) { j++; continue; }
    if (ch === '{') { depth++; stack.push({ line: i+1, depth: depth, ctx: line.substring(0, 60).trim() }); }
    if (ch === '}') { depth--; if (stack.length > 0) stack.pop(); }
    j++;
  }
}

console.log('\nRe-check: Final brace depth: ' + depth);
if (depth > 0) {
  console.log('Still unclosed blocks: ' + stack.length);
  stack.forEach(s => console.log('  Line ' + s.line + ' (depth ' + s.depth + '): ' + s.ctx));
} else if (depth === 0) {
  console.log('CSS braces balanced!');
} else {
  console.log('ERROR: Too many closing braces! depth=' + depth);
}
