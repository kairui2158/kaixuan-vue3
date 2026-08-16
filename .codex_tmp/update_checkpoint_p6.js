const fs = require('fs');
const f = 'D:/codex/novel-workshop-vue3/_audit/checkpoint.md';
let c = fs.readFileSync(f, 'utf8');
c = c.replace('| P6 | Provider Management | IN_PROGRESS | | Fetch models/test connection/purpose switching |', '| P6 | Provider Management | DONE | 2026-08-11T01:30 | 24 PASS / 0 FAIL. Fixed: statusbar selector, setPurpose role-swap logic |');
c = c.replace('## Last Updated: 2026-08-11T00:15', '## Last Updated: 2026-08-11T01:30');
c += '\n## P6 Additional Fixes\n6. setPurpose role-swap: When switching provider purpose, old generate/verify assignment is preserved and swapped to the other role instead of being cleared\n';
fs.writeFileSync(f, c, 'utf8');
console.log('[OK] checkpoint updated');
