const fs = require('fs');
const path = require('path');
const dir = 'D:\\codex\\novel-workshop-vue3\\_audit';
const files = fs.readdirSync(dir);
const exp = files.find(f => f.includes('\u7ecf\u9a8c'));
if (exp) {
  const content = fs.readFileSync(path.join(dir, exp), 'utf8');
  // Print first 6000 chars
  console.log(content.substring(0, 6000));
} else {
  console.log('NOT FOUND');
  files.forEach(f => console.log(f));
}
