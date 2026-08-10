const fs = require('fs');
const path = require('path');

const oldHtmlPath = 'C:/Users/凯瑞/Documents/New project 2/renderer.html';
const html = fs.readFileSync(oldHtmlPath, 'utf8');
const lines = html.split('\n');

const ids = [];
const classes = [];
const events = [];
const dataAttrs = [];
const svgIcons = [];

// Section markers (major HTML blocks)
const sections = [];

lines.forEach((line, i) => {
  const lineNum = i + 1;
  const trimmed = line.trim();

  // Extract ids
  const idMatches = line.matchAll(/id="([^"]+)"/g);
  for (const m of idMatches) {
    ids.push({ line: lineNum, id: m[1], context: trimmed.substring(0, 120) });
  }

  // Extract classes
  const clsMatches = line.matchAll(/class="([^"]+)"/g);
  for (const m of clsMatches) {
    m[1].split(/\s+/).forEach(c => {
      if (c.trim()) classes.push({ line: lineNum, class: c.trim(), context: trimmed.substring(0, 120) });
    });
  }

  // Extract inline events
  const evtMatches = line.matchAll(/on(click|change|input|submit|load|keydown|keyup|keypress|mouseover|mouseout|focus|blur|toggle|contextmenu|drag|drop|mousedown|mouseup|wheel|scroll|resize)="([^"]+)"/g);
  for (const m of evtMatches) {
    events.push({ line: lineNum, event: m[1], handler: m[2], context: trimmed.substring(0, 100) });
  }

  // Extract data-* attributes
  const dataMatches = line.matchAll(/data-([a-z-]+)="([^"]*)"/g);
  for (const m of dataMatches) {
    dataAttrs.push({ line: lineNum, attr: 'data-' + m[1], value: m[2] });
  }

  // Track section comments
  if (trimmed.startsWith('<!--') && trimmed.includes('Section') || trimmed.includes('section') || trimmed.includes('MODAL') || trimmed.includes('PANEL') || trimmed.includes('AREA')) {
    sections.push({ line: lineNum, text: trimmed });
  }
});

// Also extract HTML structure tree (major containers)
const containerTags = ['div', 'section', 'aside', 'nav', 'header', 'footer', 'main', 'article', 'dialog', 'template'];
const structure = [];
let depth = 0;
lines.forEach((line, i) => {
  const lineNum = i + 1;
  const trimmed = line.trim();
  // Opening tags with id or class
  const openMatch = trimmed.match(new RegExp('<(' + containerTags.join('|') + ')[^>]*(id|class)="([^"]+)"'));
  if (openMatch) {
    structure.push({ line: lineNum, tag: openMatch[1], attr: openMatch[2], value: openMatch[3], depth: depth });
  }
});

// Unique sets
const uniqIds = [...new Set(ids.map(x => x.id))].sort();
const uniqClasses = [...new Set(classes.map(x => x.class))].sort();
const uniqEvents = [...new Set(events.map(x => x.event))].sort();
const uniqDataAttrs = [...new Set(dataAttrs.map(x => x.attr))].sort();

// Build output
let out = '=== OLD ARCHITECTURE HTML FULL SCAN ===\n';
out += 'File: ' + oldHtmlPath + '\n';
out += 'Total lines: ' + lines.length + '\n';
out += 'Total file size: ' + html.length + ' bytes\n';
out += '\n';
out += '=== SUMMARY ===\n';
out += 'Unique IDs: ' + uniqIds.length + '\n';
out += 'Unique Classes: ' + uniqClasses.length + '\n';
out += 'Unique Events: ' + uniqEvents.length + '\n';
out += 'Unique Data Attrs: ' + uniqDataAttrs.length + '\n';
out += 'Structure entries: ' + structure.length + '\n';
out += '\n';

out += '=== ALL IDS (sorted) ===\n';
uniqIds.forEach(id => {
  const found = ids.filter(x => x.id === id);
  out += id + ' | line ' + found[0].line + ' | ' + found[0].context + '\n';
});
out += '\n';

out += '=== ALL CLASSES (sorted) ===\n';
uniqClasses.forEach(cls => {
  const found = classes.filter(x => x.class === cls);
  out += cls + ' | line ' + found[0].line + ' | count ' + found.length + ' | ' + found[0].context.substring(0, 80) + '\n';
});
out += '\n';

out += '=== ALL EVENTS (sorted) ===\n';
events.forEach(e => {
  out += 'on' + e.event + ' | line ' + e.line + ' | ' + e.handler.substring(0, 80) + '\n';
});
out += '\n';

out += '=== ALL DATA ATTRS ===\n';
uniqDataAttrs.forEach(da => {
  const found = dataAttrs.filter(x => x.attr === da);
  out += da + ' | line ' + found[0].line + ' | count ' + found.length + '\n';
});
out += '\n';

out += '=== HTML STRUCTURE TREE (containers with id/class) ===\n';
structure.forEach(s => {
  const indent = '  '.repeat(Math.min(s.depth, 10));
  out += 'L' + s.line + ' ' + indent + '<' + s.tag + ' ' + s.attr + '="' + s.value + '">\n';
});

// Also extract <template> elements and their ids
out += '\n=== TEMPLATE ELEMENTS ===\n';
lines.forEach((line, i) => {
  if (line.includes('<template')) {
    out += 'L' + (i+1) + ': ' + line.trim() + '\n';
  }
  if (line.includes('</template>')) {
    out += 'L' + (i+1) + ': </template>\n';
  }
});

// Extract SVG icon usage
out += '\n=== SVG ICONS ===\n';
let inSvg = false;
let svgStart = 0;
lines.forEach((line, i) => {
  if (line.includes('<svg')) { inSvg = true; svgStart = i + 1; }
  if (line.includes('</svg>')) {
    inSvg = false;
    const svgBlock = lines.slice(svgStart - 1, i + 1).join(' ').replace(/\s+/g, ' ');
    const idMatch = svgBlock.match(/id="([^"]+)"/);
    const viewBoxMatch = svgBlock.match(/viewBox="([^"]+)"/);
    const pathMatch = svgBlock.match(/d="([^"]{0,60})/);
    out += 'L' + svgStart + ': id=' + (idMatch ? idMatch[1] : 'none') + ' viewBox=' + (viewBoxMatch ? viewBoxMatch[1] : 'none') + ' path=' + (pathMatch ? pathMatch[1] + '...' : 'none') + '\n';
  }
});

fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/old_html_full_scan.txt', out, 'utf8');
console.log('[OK] old_html_full_scan.txt');
console.log('IDs: ' + uniqIds.length + ', Classes: ' + uniqClasses.length + ', Events: ' + events.length + ', DataAttrs: ' + uniqDataAttrs.length + ', Structure: ' + structure.length);

// Also save JSON for programmatic comparison
const jsonData = {
  file: oldHtmlPath,
  lines: lines.length,
  size: html.length,
  ids: uniqIds,
  classes: uniqClasses,
  events: events.map(e => ({ event: e.event, handler: e.handler, line: e.line })),
  dataAttrs: uniqDataAttrs,
  structure: structure
};
fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/old_html_full_scan.json', JSON.stringify(jsonData, null, 2), 'utf8');
console.log('[OK] old_html_full_scan.json');
