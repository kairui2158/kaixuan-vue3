const fs = require('fs');
const file = 'src/styles/global.css';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

// Track brace depth, ignoring braces inside strings and comments
let depth = 0;
let inComment = false;
let inString = false;
let stringChar = '';
const stack = []; // {line, depth}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let j = 0;
  while (j < line.length) {
    const ch = line[j];
    const next = line[j+1] || '';

    // Handle block comments
    if (!inString && !inComment && ch === '/' && next === '*') {
      inComment = true;
      j += 2;
      continue;
    }
    if (inComment && ch === '*' && next === '/') {
      inComment = false;
      j += 2;
      continue;
    }
    if (inComment) { j++; continue; }

    // Handle strings
    if (!inString && (ch === '"' || ch === "'")) {
      inString = true;
      stringChar = ch;
      j++;
      continue;
    }
    if (inString && ch === stringChar && line[j-1] !== '\\') {
      inString = false;
      j++;
      continue;
    }
    if (inString) { j++; continue; }

    // Track braces
    if (ch === '{') {
      depth++;
      stack.push({ line: i+1, depth: depth, context: line.substring(0, 60).trim() });
    }
    if (ch === '}') {
      depth--;
      if (stack.length > 0) stack.pop();
    }
    j++;
  }
}

console.log('Final brace depth: ' + depth);
console.log('Unclosed blocks: ' + stack.length);
if (stack.length > 0) {
  console.log('\nUnclosed { at:');
  stack.forEach(s => console.log('  Line ' + s.line + ' (depth ' + s.depth + '): ' + s.context));
}

// Also scan for @media without closing brace
console.log('\n@media blocks analysis:');
let mediaDepth = 0;
let mediaStart = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('@media')) {
    console.log('  @media at line ' + (i+1) + ': ' + lines[i].substring(0, 80).trim());
  }
}

// Show lines around the error point (7228)
console.log('\nLines 7220-7260:');
for (let i = 7219; i < Math.min(7260, lines.length); i++) {
  const l = lines[i] || '';
  const opens = (l.match(/{/g) || []).length;
  const closes = (l.match(/}/g) || []).length;
  if (opens > 0 || closes > 0 || l.includes('@media')) {
    console.log((i+1) + '| {=' + opens + ' }=' + closes + '|' + l.substring(0, 80));
  } else {
    console.log((i+1) + '|       |' + l.substring(0, 80));
  }
}
