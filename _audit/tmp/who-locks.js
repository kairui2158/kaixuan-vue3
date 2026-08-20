const cp = require('child_process');
try {
  const out = cp.execSync('openfiles /query /fo csv 2>nul', { encoding: 'utf8', timeout: 10000 });
  const lines = out.split('\n').filter(l => l.toLowerCase().includes('dist-renderer'));
  console.log('LOCKED:');
  lines.forEach(l => console.log(l));
} catch(e) {
  console.log('openfiles failed: ' + e.message);
}
// Also check handles on the directory
try {
  const out2 = cp.execSync('dir /b /s D:\\codex\\novel-workshop-vue3\\dist-renderer\\assets 2>&1', { encoding: 'utf8', timeout: 5000 });
  console.log('CONTENTS:');
  console.log(out2);
} catch(e2) {
  console.log('dir failed: ' + e2.message);
}
