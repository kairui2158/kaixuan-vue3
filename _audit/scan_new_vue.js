const fs = require('fs');
const path = require('path');

const compDir = 'D:/codex/novel-workshop-vue3/src/components';
const appVuePath = 'D:/codex/novel-workshop-vue3/src/App.vue';

function findVueFiles(dir) {
  let results = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results = results.concat(findVueFiles(fullPath));
    } else if (item.name.endsWith('.vue')) {
      results.push(fullPath);
    }
  }
  return results;
}

const vueFiles = findVueFiles(compDir);
vueFiles.push(appVuePath);

const allIds = [];
const allClasses = [];
const allRefs = [];
const allEvents = []; // @click, @change, etc
const allVIf = [];
const allVFor = [];
const allDataAttrs = [];
const componentData = {};

for (const filePath of vueFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const relPath = path.relative('D:/codex/novel-workshop-vue3', filePath).replace(/\\/g, '/');
  
  // Extract template section only
  let inTemplate = false;
  let templateLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('<template')) inTemplate = true;
    if (inTemplate) templateLines.push({ line: i + 1, text: lines[i] });
    if (lines[i].includes('</template>') && inTemplate) {
      inTemplate = false;
      // Continue collecting after template too for script refs
    }
  }
  
  // Scan all lines for template-level attributes
  const fileIds = [];
  const fileClasses = [];
  const fileRefs = [];
  const fileEvents = [];
  
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();
    
    // Extract ids (static and :id bindings)
    let idM = line.matchAll(/\sid="([^"]+)"/g);
    for (const m of idM) {
      fileIds.push({ line: lineNum, id: m[1], file: relPath });
      allIds.push({ line: lineNum, id: m[1], file: relPath, context: trimmed.substring(0, 120) });
    }
    // Dynamic :id bindings
    let dynIdM = line.matchAll(/:id="([^"]+)"/g);
    for (const m of dynIdM) {
      fileIds.push({ line: lineNum, id: ':' + m[1], file: relPath });
      allIds.push({ line: lineNum, id: ':' + m[1], file: relPath, context: trimmed.substring(0, 120) });
    }
    
    // Extract classes (static and :class)
    let clsM = line.matchAll(/\sclass="([^"]+)"/g);
    for (const m of clsM) {
      m[1].split(/\s+/).forEach(c => {
        if (c.trim()) {
          fileClasses.push({ line: lineNum, class: c.trim(), file: relPath });
          allClasses.push({ line: lineNum, class: c.trim(), file: relPath, context: trimmed.substring(0, 120) });
        }
      });
    }
    // Dynamic :class bindings (extract static parts)
    let dynClsM = line.matchAll(/:class="([^"]+)"/g);
    for (const m of dynClsM) {
      // Extract string literals from :class expressions
      const strMatches = m[1].matchAll(/'([^']+)'/g);
      for (const sm of strMatches) {
        fileClasses.push({ line: lineNum, class: sm[1], file: relPath, dynamic: true });
        allClasses.push({ line: lineNum, class: sm[1], file: relPath, dynamic: true, context: trimmed.substring(0, 120) });
      }
    }
    
    // Extract refs
    let refM = line.matchAll(/\sref="([^"]+)"/g);
    for (const m of refM) {
      fileRefs.push({ line: lineNum, ref: m[1], file: relPath });
      allRefs.push({ line: lineNum, ref: m[1], file: relPath, context: trimmed.substring(0, 100) });
    }
    
    // Extract Vue events (@click, @change, etc)
    let evtM = line.matchAll(/@(click|change|input|submit|keydown|keyup|keypress|mouseover|mouseout|focus|blur|toggle|contextmenu|drag|drop|mousedown|mouseup|wheel|scroll|resize|mouseenter|mouseleave|compositionstart|compositionend)(\.\w+)?="([^"]+)"/g);
    for (const m of evtM) {
      fileEvents.push({ line: lineNum, event: m[1], modifier: m[2] || '', handler: m[3], file: relPath });
      allEvents.push({ line: lineNum, event: m[1], handler: m[3], file: relPath, context: trimmed.substring(0, 100) });
    }
    
    // v-if / v-show
    if (line.match(/v-if="([^"]+)"/)) {
      const m = line.match(/v-if="([^"]+)"/);
      allVIf.push({ line: lineNum, cond: m[1], file: relPath });
    }
    if (line.match(/v-show="([^"]+)"/)) {
      const m = line.match(/v-show="([^"]+)"/);
      allVIf.push({ line: lineNum, cond: m[1], file: relPath, vshow: true });
    }
    
    // v-for
    if (line.match(/v-for="([^"]+)"/)) {
      const m = line.match(/v-for="([^"]+)"/);
      allVFor.push({ line: lineNum, loop: m[1], file: relPath });
    }
    
    // data-* attributes
    let dataM = line.matchAll(/data-([a-z-]+)="([^"]*)"/g);
    for (const m of dataM) {
      allDataAttrs.push({ line: lineNum, attr: 'data-' + m[1], value: m[2], file: relPath });
    }
  });
  
  componentData[relPath] = {
    ids: fileIds.map(x => x.id),
    classes: [...new Set(fileClasses.map(x => x.class))],
    refs: fileRefs.map(x => x.ref),
    events: fileEvents.map(x => x.event + ':' + x.handler),
    size: content.length,
    lines: lines.length
  };
}

// Unique sets
const uniqIds = [...new Set(allIds.map(x => x.id))].sort();
const uniqClasses = [...new Set(allClasses.map(x => x.class))].sort();
const uniqRefs = [...new Set(allRefs.map(x => x.ref))].sort();
const uniqEvents = [...new Set(allEvents.map(x => x.event))].sort();
const uniqDataAttrs = [...new Set(allDataAttrs.map(x => x.attr))].sort();

let out = '=== NEW ARCHITECTURE VUE FULL SCAN ===\n';
out += 'Components scanned: ' + vueFiles.length + '\n';
out += '\n=== SUMMARY ===\n';
out += 'Unique IDs: ' + uniqIds.length + '\n';
out += 'Unique Classes: ' + uniqClasses.length + '\n';
out += 'Unique Refs: ' + uniqRefs.length + '\n';
out += 'Unique Events: ' + uniqEvents.length + '\n';
out += 'Unique Data Attrs: ' + uniqDataAttrs.length + '\n';
out += 'v-if/v-show entries: ' + allVIf.length + '\n';
out += 'v-for entries: ' + allVFor.length + '\n';
out += '\n';

out += '=== ALL IDS (sorted) ===\n';
uniqIds.forEach(id => {
  const found = allIds.filter(x => x.id === id);
  out += id + ' | ' + found[0].file + ':' + found[0].line + ' | ' + found[0].context + '\n';
});
out += '\n';

out += '=== ALL CLASSES (sorted) ===\n';
uniqClasses.forEach(cls => {
  const found = allClasses.filter(x => x.class === cls);
  out += cls + ' | ' + found[0].file + ':' + found[0].line + ' | count ' + found.length + '\n';
});
out += '\n';

out += '=== ALL REFS (sorted) ===\n';
uniqRefs.forEach(ref => {
  const found = allRefs.filter(x => x.ref === ref);
  out += ref + ' | ' + found[0].file + ':' + found[0].line + '\n';
});
out += '\n';

out += '=== ALL EVENTS ===\n';
allEvents.forEach(e => {
  out += '@' + e.event + ' | ' + e.file + ':' + e.line + ' | ' + e.handler.substring(0, 80) + '\n';
});
out += '\n';

out += '=== PER-COMPONENT BREAKDOWN ===\n';
for (const [file, data] of Object.entries(componentData)) {
  out += '\n--- ' + file + ' (' + data.lines + ' lines, ' + data.size + ' bytes) ---\n';
  out += '  IDs: ' + data.ids.join(', ') + '\n';
  out += '  Classes: ' + data.classes.join(', ') + '\n';
  out += '  Refs: ' + data.refs.join(', ') + '\n';
  out += '  Events: ' + data.events.join(', ') + '\n';
}

fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/new_vue_full_scan.txt', out, 'utf8');
console.log('[OK] new_vue_full_scan.txt');
console.log('IDs: ' + uniqIds.length + ', Classes: ' + uniqClasses.length + ', Refs: ' + uniqRefs.length + ', Events: ' + allEvents.length);

const jsonData = {
  components: vueFiles.length,
  ids: uniqIds,
  classes: uniqClasses,
  refs: uniqRefs,
  events: uniqEvents,
  dataAttrs: uniqDataAttrs,
  componentData: componentData
};
fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/new_vue_full_scan.json', JSON.stringify(jsonData, null, 2), 'utf8');
console.log('[OK] new_vue_full_scan.json');
