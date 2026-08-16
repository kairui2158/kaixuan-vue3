const fs = require('fs');
const file = 'src/components/pipeline/PipelinePanel.vue';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

// Find template section
let templateStart = -1, templateEnd = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<template>')) templateStart = i;
  if (lines[i].includes('</template>')) templateEnd = i;
}
console.log('Template: lines ' + (templateStart+1) + ' to ' + (templateEnd+1));

// Analyze div nesting in template section
let depth = 0;
const issues = [];
for (let i = templateStart; i <= templateEnd; i++) {
  const line = lines[i] || '';
  const opens = (line.match(/<div[\s>]/g) || []).length;
  const closes = (line.match(/<\/div>/g) || []).length;
  depth += opens - closes;
  if (opens > 0 || closes > 0) {
    console.log((i+1) + '| d=' + depth + ' o=' + opens + ' c=' + closes + '|' + line.substring(0, 100));
  }
  if (depth < 0) {
    issues.push('Line ' + (i+1) + ': depth went negative (' + depth + ')');
  }
}
console.log('\nFinal depth: ' + depth);
if (depth !== 0) {
  console.log('ERROR: depth should be 0, got ' + depth);
  console.log('Missing ' + depth + ' closing </div> tags');
} else {
  console.log('OK: div tags balanced');
}
if (issues.length > 0) {
  console.log('\nIssues:');
  issues.forEach(i => console.log('  ' + i));
}

// Now check Vite compilation
const http = require('http');
const req = http.get('http://localhost:5173/src/components/pipeline/PipelinePanel.vue', (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log('\nVite status: ' + res.statusCode);
    if (res.statusCode !== 200) {
      console.log('Response (first 500 chars): ' + body.substring(0, 500));
    } else {
      console.log('Vite compiled OK, response length: ' + body.length);
    }
  });
});
req.on('error', e => console.log('Vite check error: ' + e.message));
req.setTimeout(5000, () => { console.log('Vite check timeout'); req.destroy(); });
