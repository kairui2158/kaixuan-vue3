const fs = require('fs');
const html = fs.readFileSync('C:/Users/凯瑞/Documents/New project 2/renderer.html', 'utf8');
// Find outline-workspace modal
let idx = html.indexOf('id="outline-workspace"');
if (idx < 0) {
  console.log('NOT FOUND outline-workspace');
  process.exit(0);
}
// Find the closing div for this modal - go forward 5000 chars
let chunk = html.substring(idx, idx + 5000);
console.log(chunk);
console.log('\n=== END CHUNK ===');
console.log('Chunk length:', chunk.length);
