const fs = require('fs');
const path = require('path');
const dir = 'D:\\codex\\novel-workshop-vue3\\_audit';
const files = fs.readdirSync(dir);
const plan = files.find(f => f.includes('\u53ef\u52fe\u9009'));
if (plan) {
  const content = fs.readFileSync(path.join(dir, plan), 'utf8');
  console.log(content);
} else {
  console.log('NOT FOUND');
  files.forEach(f => console.log(f));
}
