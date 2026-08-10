var fs = require('fs');
var AUDIT = 'D:/codex/novel-workshop-vue3/_audit';
var diff = JSON.parse(fs.readFileSync(AUDIT + '/css_diff.json', 'utf8'));
var missing = diff.missing_selectors || [];
console.log('[1] Total missing selectors:', missing.length);
var byType = { id: [], class: [], tag: [], pseudo: [], complex: [] };
for (var i = 0; i < missing.length; i++) {
  var sel = missing[i].trim();
  if (sel.startsWith('#')) { byType.id.push(sel); }
  else if (sel.startsWith('.')) { byType.class.push(sel); }
  else if (sel.match(/^[a-zA-Z][\w-]*$/)) { byType.tag.push(sel); }
  else if (sel.includes('::') || sel.includes(':')) { byType.pseudo.push(sel); }
  else { byType.complex.push(sel); }
}
console.log('  ID selectors:', byType.id.length);
console.log('  Class selectors:', byType.class.length);
console.log('  Tag selectors:', byType.tag.length);
console.log('  Pseudo selectors:', byType.pseudo.length);
console.log('  Complex selectors:', byType.complex.length);
console.log('\n--- ID selectors (first 30) ---');
byType.id.slice(0, 30).forEach(function(s) { console.log('  ' + s); });
console.log('\n--- Class selectors (first 30) ---');
byType.class.slice(0, 30).forEach(function(s) { console.log('  ' + s); });
console.log('\n--- Tag selectors (first 20) ---');
byType.tag.slice(0, 20).forEach(function(s) { console.log('  ' + s); });
console.log('\n--- Complex selectors (first 30) ---');
byType.complex.slice(0, 30).forEach(function(s) { console.log('  ' + s); });
var summary = {
  total: missing.length,
  id: byType.id.length,
  class: byType.class.length,
  tag: byType.tag.length,
  pseudo: byType.pseudo.length,
  complex: byType.complex.length,
  id_list: byType.id,
  class_list: byType.class,
  tag_list: byType.tag,
  complex_list: byType.complex.slice(0, 100)
};
fs.writeFileSync(AUDIT + '/css_missing_selectors_analysis.json', JSON.stringify(summary, null, 2), 'utf8');
console.log('\n[OK] Analysis saved to css_missing_selectors_analysis.json');
