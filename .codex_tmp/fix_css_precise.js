const fs = require('fs');
const file = 'src/styles/global.css';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

// Helper: count braces outside strings/comments on a line
function countBraces(line) {
  let opens = 0, closes = 0;
  let inStr = false, strCh = '';
  let inComment = false;
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    const next = line[j+1] || '';
    if (!inStr && !inComment && ch === '/' && next === '*') { inComment = true; j++; continue; }
    if (inComment && ch === '*' && next === '/') { inComment = false; j++; continue; }
    if (inComment) continue;
    if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strCh = ch; continue; }
    if (inStr && ch === strCh && line[j-1] !== '\\') { inStr = false; continue; }
    if (inStr) continue;
    if (ch === '{') opens++;
    if (ch === '}') closes++;
  }
  return { opens, closes };
}

// First pass: identify all unclosed @media/@keyframes blocks
// Strategy: for each line with @media or @keyframes that has unbalanced braces:
// - If it's a single-line block (has content after { and has some }), add } at end
// - If it's a multi-line opener (only { on the line, no content), find the line where
//   the inner content closes (depth returns to the @media level) and add } after it

const insertions = []; // { afterLine: N, count: M }

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();
  
  // Skip if no @media or @keyframes
  if (!trimmed.includes('@media') && !trimmed.includes('@keyframes')) continue;
  
  const { opens, closes } = countBraces(line);
  const diff = opens - closes;
  
  if (diff <= 0) continue; // Balanced or over-closed, skip
  
  // Check if this is a single-line block (has content after the first {)
  const firstBrace = line.indexOf('{');
  const afterBrace = line.substring(firstBrace + 1).trim();
  
  if (afterBrace.length > 0 && closes > 0) {
    // Single-line block: has {, content, and some } but not enough
    // Add missing } at end of line
    insertions.push({ afterLine: i, count: diff, sameLine: true });
    console.log('Single-line fix at line ' + (i+1) + ': add ' + diff + ' } at end');
  } else if (closes === 0) {
    // Multi-line opener: just @media (...) { with no content on this line
    // Find where the inner content closes
    let innerDepth = 0;
    let foundClose = false;
    for (let k = i + 1; k < lines.length; k++) {
      const innerCounts = countBraces(lines[k]);
      innerDepth += innerCounts.opens - innerCounts.closes;
      // When innerDepth goes negative, that means we found a } that closes the @media
      // But since @media is unclosed, innerDepth will reach -1 at some point if there's
      // an extra } from the next block, OR it will stay >= 0 until end of file
      // 
      // Actually, since the @media is unclosed, the inner content's } will bring
      // innerDepth to 0 (not below). So we need to find where innerDepth returns to 0
      // after having been > 0, OR find the next @media/sibling block.
      
      if (innerDepth < 0) {
        // This shouldn't happen if @media is unclosed
        break;
      }
      
      // Check if we've found the closing of inner content
      // (innerDepth was > 0 and now back to 0, or line has } that brings to 0)
      if (innerDepth === 0 && innerCounts.closes > 0) {
        // This line closes the inner content - add } after this line
        insertions.push({ afterLine: k, count: diff, sameLine: false });
        console.log('Multi-line fix: @media at line ' + (i+1) + ', add ' + diff + ' } after line ' + (k+1));
        foundClose = true;
        break;
      }
      
      // Also check: if we hit another @media or @keyframes at the same level,
      // the previous @media's content ended on the previous line
      if (k > i && innerDepth === 0) {
        const nextTrimmed = lines[k].trim();
        if (nextTrimmed.includes('@media') || nextTrimmed.includes('@keyframes') || 
            nextTrimmed.startsWith('.') || nextTrimmed.startsWith('#') ||
            nextTrimmed.startsWith(':root') || nextTrimmed.startsWith('*')) {
          // Insert } before this line (i.e., after line k-1)
          insertions.push({ afterLine: k - 1, count: diff, sameLine: false });
          console.log('Multi-line fix (sibling): @media at line ' + (i+1) + ', add ' + diff + ' } after line ' + k);
          foundClose = true;
          break;
        }
      }
    }
    
    if (!foundClose) {
      // Content goes to end of file or couldn't find close
      // Add } right after the opening line's content
      console.log('WARNING: Could not find close for @media at line ' + (i+1));
    }
  } else {
    // Has some closes but no content after first { - treat as single-line
    insertions.push({ afterLine: i, count: diff, sameLine: true });
    console.log('Edge case fix at line ' + (i+1) + ': add ' + diff + ' } at end');
  }
}

// Apply insertions (process from bottom to top to preserve line numbers)
insertions.sort((a, b) => b.afterLine - a.afterLine);

for (const ins of insertions) {
  if (ins.sameLine) {
    // Add } at end of the line
    lines[ins.afterLine] = lines[ins.afterLine].replace(/\s*$/, '') + ' '.repeat(0) + '}'.repeat(ins.count);
  } else {
    // Insert } line(s) after the specified line
    const closeLines = [];
    for (let c = 0; c < ins.count; c++) {
      closeLines.push('}');
    }
    lines.splice(ins.afterLine + 1, 0, ...closeLines);
  }
}

fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log('\nTotal insertions: ' + insertions.length);
console.log('File written.');

// Re-check brace balance
const newContent = fs.readFileSync(file, 'utf8');
const newLines = newContent.split('\n');
let depth = 0;
let inComment = false;
let inString = false;
let stringChar = '';

for (let i = 0; i < newLines.length; i++) {
  const line = newLines[i];
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
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    j++;
  }
}

console.log('\nRe-check: Final brace depth: ' + depth);
if (depth === 0) console.log('CSS braces balanced!');
else if (depth > 0) console.log('Still unclosed: need ' + depth + ' more }');
else console.log('Over-closed: have ' + (-depth) + ' extra }');
